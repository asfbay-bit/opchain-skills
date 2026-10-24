#!/usr/bin/env node
/**
 * scripts/deploy.mjs — opchain's consumer deploy wrapper (template).
 *
 *   node scripts/deploy.mjs --staging [--allow-off-main] [--allow-unknown-live]
 *   node scripts/deploy.mjs --prod [--allow-unknown-live]
 *
 * Copy this file into your project as scripts/deploy.mjs and point
 * `npm run deploy` at `node scripts/deploy.mjs --prod` and `npm run deploy:staging`
 * at `node scripts/deploy.mjs --staging`. It is dependency-free
 * (Node 22+, git, and whatever your deploy command is). oc-deploy-ops'
 * `/oc-deploy init` drops it in place; `/oc-scaffold` does the same for new apps.
 *
 * Why these guards, and why in a script instead of a skill's prose:
 *
 *   1. HEAD must equal the fetched origin/main. A consumer's 2026-10-06
 *      staging overwrite: a session deployed an unmerged branch to staging,
 *      so "I looked at staging, it's safe" was blessing bytes that were not
 *      what shipped. The ancestor check was written there
 *      after that incident; this is the same check, shipped with the plugin
 *      so the next project does not have to rediscover it. Staging may opt
 *      out loudly with --allow-off-main or <PROJECT>_ALLOW_OFF_MAIN_STAGING=1;
 *      production has no bypass.
 *
 *   2. Production requires an explicit --prod argument; no environment
 *      variable is accepted, and with neither --staging nor --prod the script
 *      refuses. In a consumer repository, a stray `wrangler deploy` without `--env`
 *      shipped a work-in-progress tree to production, because the default
 *      environment IS production. There is no default target here, and an
 *      exported variable cannot silently turn every later run into production.
 *
 *   3. The working tree must be clean: a dirty tree deploys bytes that are not
 *      the commit the guards above vouched for (ported from opchain's own
 *      scripts/deploy.mjs assertCleanCheckout).
 *
 *   4. The live /api/health version must be an ancestor of HEAD. Deploying a
 *      HEAD that does not contain what is live silently discards whatever
 *      commits the live build carried (the other half of the 10-06 incident:
 *      the branch deploy was then overwritten by a main deploy that lacked
 *      its commits, and nobody saw the diff). This guard prints exactly the
 *      commits that would disappear and refuses. There is no bypass: either
 *      merge them, or roll back with your platform's rollback command.
 *      When a URL is configured but the live version cannot be read (non-2xx,
 *      unreachable, a bot challenge, or a field that is not a SHA) the guard
 *      refuses too: failing open there is exactly when it is needed most. A
 *      first deploy, or a known-broken endpoint, takes the one-shot
 *      --allow-unknown-live flag, printed in the refusal.
 *
 * After a successful deploy and smoke, it writes
 * .checkpoints/oc-deploy-ops.checkpoint.json so oc-monitoring-ops and
 * `/oc-deploy status` have state even when nobody invoked the skill (the
 * 2026-10-08 effectiveness audit, I-10: zero oc-deploy-ops calls in a week of
 * deploys, so monitoring had nothing to read).
 *
 * Configuration lives in package.json under "opchain.deploy" (all optional):
 *
 *   "opchain": {
 *     "deploy": {
 *       "project": "MYAPP",                       // env-var prefix; default: package name, upper-snake
 *       "healthPath": "/api/health",              // JSON endpoint exposing the deployed SHA
 *       "versionField": "version",                // field holding the short or full SHA
 *       "production": { "url": "https://myapp.example", "command": ["npx", "wrangler", "deploy"] },
 *       "staging":    { "url": "https://staging.myapp.example", "command": ["npx", "wrangler", "deploy", "--env", "staging"] },
 *       "smoke": ["npm", "run", "smoke"]          // optional; receives DEPLOY_URL in env
 *     }
 *   }
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function resolveConfig(pkg = {}, { staging = false } = {}) {
  const cfg = pkg?.opchain?.deploy ?? {};
  const project = (cfg.project ?? pkg?.name ?? "project").replace(/^@/, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase() || "PROJECT";
  const env = staging ? "staging" : "production";
  const envCfg = cfg[env] ?? {};
  const command = Array.isArray(envCfg.command) && envCfg.command.length
    ? envCfg.command
    : staging ? ["npx", "wrangler", "deploy", "--env", "staging"] : ["npx", "wrangler", "deploy"];
  return {
    project,
    env,
    url: envCfg.url ?? null,
    command,
    smoke: Array.isArray(cfg.smoke) && cfg.smoke.length ? cfg.smoke : null,
    healthPath: cfg.healthPath ?? "/api/health",
    versionField: cfg.versionField ?? "version",
    envVars: {
      allowOffMainStaging: `${project}_ALLOW_OFF_MAIN_STAGING`,
    },
  };
}

function git(cwd, args) {
  try { return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return null; }
}

/** Which environment argv names. Exactly one of --staging / --prod; no default. */
export function parseTarget(argv) {
  const staging = argv.includes("--staging");
  const prod = argv.includes("--prod");
  if (staging && prod) return { error: "pass exactly one of --staging or --prod, not both" };
  if (!staging && !prod) {
    return { error: "no target given. Production requires an explicit --prod argument; no environment variable is accepted.\n  Staging:    node scripts/deploy.mjs --staging\n  Production: node scripts/deploy.mjs --prod" };
  }
  return { staging, env: staging ? "staging" : "production" };
}

/** The one file this script writes into the tree (see writeDeployCheckpoint). */
export const DEPLOY_CHECKPOINT_PATH = ".checkpoints/oc-deploy-ops.checkpoint.json";

/**
 * `git status --porcelain` output → refusal text, or null when clean. The deploy
 * checkpoint this script itself writes is ignored, and only that exact path: in a
 * repo that tracks .checkpoints/, `--staging` leaves it modified, and refusing the
 * `--prod` that follows on the same main commit (or making the user commit it,
 * which moves HEAD off origin/main) would break the staging → production flow.
 */
export function cleanTreeVerdict(status, { ignore = [DEPLOY_CHECKPOINT_PATH, `${DEPLOY_CHECKPOINT_PATH}.lock`] } = {}) {
  if (status === null) return "cannot inspect the working tree (git status failed)";
  // The checkpoint CLI's mutation lock sits beside the file and may outlive a run in repos that don't ignore *.lock.
  // git() trims its output, so the first line may have lost its leading space:
  // strip the status letters by shape rather than by fixed column.
  const dirty = status.split("\n").filter((line) => line.trim() && !ignore.includes(line.trim().replace(/^\S+\s+/, "")));
  if (!dirty.length) return null;
  return `the working tree is dirty; a deploy would ship bytes that are not HEAD:\n${dirty.map((line) => `    ${line}`).join("\n")}\n  Commit or discard the changes, then retry.`;
}

export const ALLOW_UNKNOWN_LIVE_FLAG = "--allow-unknown-live";

/**
 * Decide whether deploying `head` over a live build at `live` loses commits.
 * `lost` is `git log --oneline head..live` (commits live has that HEAD lacks).
 * `problem` says why a configured health URL yielded no version; without
 * `allowUnknownLive` that is a refusal, not a pass.
 */
export function ancestorVerdict({ live, head, isAncestor, lost, problem = null, allowUnknownLive = false }) {
  if (!live && problem) {
    if (allowUnknownLive) return { ok: true, warn: true, note: `${ALLOW_UNKNOWN_LIVE_FLAG}: proceeding without the ancestor check (${problem})` };
    return {
      ok: false,
      reason: `cannot read the live version: ${problem}.\n  Without it this script cannot prove the deploy keeps the commits that are live.\n` +
        `  Fix the endpoint (or the bot challenge in front of it), or, for a first deploy or a known-broken endpoint, re-run once with ${ALLOW_UNKNOWN_LIVE_FLAG}.`,
    };
  }
  if (!live) return { ok: true, note: "no live version to compare (no health URL configured)" };
  if (isAncestor === null) return { ok: false, reason: `live version ${live} is not in this repository's history — fetch all branches, or you are deploying from the wrong repo` };
  if (isAncestor) return { ok: true, note: `live ${live} is an ancestor of HEAD ${head.slice(0, 7)}` };
  return {
    ok: false,
    reason: `live ${live} is NOT an ancestor of HEAD ${head.slice(0, 7)}; deploying would discard ${lost.length} commit(s):\n    ${lost.join("\n    ") || "(unlisted)"}\n  Merge them into main first, or use your platform's rollback command if dropping them is the intent.`,
  };
}

/** { version, problem }: version is a SHA or null; problem says why it is null
 *  when a URL is configured (null problem with no URL means "nothing to check"). */
export async function readLiveVersion(url, healthPath, versionField) {
  if (!url) return { version: null, problem: null };
  const endpoint = `${url}${healthPath}`;
  let response;
  try {
    response = await fetch(`${endpoint}?deploy=${Date.now()}`, { signal: AbortSignal.timeout(10_000), headers: { "Cache-Control": "no-cache" } });
  } catch (error) { return { version: null, problem: `${endpoint} is unreachable (${error?.cause?.code ?? error?.message ?? error})` }; }
  const challenged = response.headers.get("cf-mitigated") === "challenge";
  if (!response.ok) return { version: null, problem: `${endpoint} returned HTTP ${response.status}${challenged ? " (a bot challenge)" : ""}` };
  let body;
  try { body = await response.json(); }
  catch { return { version: null, problem: `${endpoint} did not return JSON${challenged ? " (a bot challenge)" : " (a challenge or error page?)"}` }; }
  const version = body?.[versionField];
  if (typeof version === "string" && /^[0-9a-f]{7,40}$/.test(version)) return { version, problem: null };
  return { version: null, problem: `${endpoint} field "${versionField}" is ${JSON.stringify(version ?? null)}, not a commit SHA` };
}

function findCheckpointCli(root) {
  for (const candidate of ["scripts/checkpoint.mjs", ".claude/skills/oc-checkpoint-protocol/scripts/checkpoint.mjs", ".agents/skills/oc-checkpoint-protocol/scripts/checkpoint.mjs"]) {
    if (existsSync(join(root, candidate))) return join(root, candidate);
  }
  return null;
}

export function deploymentRecord({ env, sha, url, smoke, at = new Date().toISOString() }) {
  return { env, sha, at, url, smoke };
}

export function writeDeployCheckpoint(root, record, { cli = findCheckpointCli(root), projectName } = {}) {
  const summary = `${record.env} deploy of ${record.sha.slice(0, 7)} at ${record.at}; smoke ${record.smoke}. Written by scripts/deploy.mjs.`;
  if (cli) {
    const r = spawnSync(process.execPath, [cli, "update", "oc-deploy-ops",
      "--phase=deploy", `--step=${record.env}`, "--status=complete", `--progress_summary=${summary}`,
      `--skill_state.current_env=${record.env}`, `--skill_state.${record.env}_version=${record.sha.slice(0, 7)}`,
      `--skill_state.deployments+:json=${JSON.stringify(record)}`], { cwd: root, encoding: "utf8" });
    if (r.status === 0) return { via: "cli", path: join(root, DEPLOY_CHECKPOINT_PATH) };
    console.warn(`[deploy:${record.env}] checkpoint CLI failed (${(r.stderr || r.stdout || "").trim()}); writing the checkpoint directly`);
  }
  const dir = join(root, ".checkpoints");
  const path = join(root, DEPLOY_CHECKPOINT_PATH);
  mkdirSync(dir, { recursive: true });
  let data = {};
  if (existsSync(path)) {
    // Never overwrite a checkpoint this script cannot read: a corrupt file is
    // evidence someone has to look at, not something to silently replace.
    try { data = JSON.parse(readFileSync(path, "utf8")); }
    catch (error) {
      console.warn(`[deploy:${record.env}] ⚠ ${path} is not valid JSON (${error.message}); NOT overwriting it. Repair it, then record this deploy: ${JSON.stringify(record)}`);
      return { via: "skipped", path };
    }
  }
  const now = record.at;
  const next = {
    ...data,
    protocol_version: "1.1",
    skill: "oc-deploy-ops",
    project: data.project ?? projectName ?? root.split("/").pop(),
    project_dir: data.project_dir ?? root,
    created_at: data.created_at ?? now,
    updated_at: now,
    phase: "deploy",
    step: record.env,
    status: "complete",
    progress_summary: summary,
    blockers: Array.isArray(data.blockers) ? data.blockers : [],
    next_actions: Array.isArray(data.next_actions) ? data.next_actions : [],
    skill_state: {
      ...(data.skill_state ?? {}),
      current_env: record.env,
      [`${record.env}_version`]: record.sha.slice(0, 7),
      deployments: [...(Array.isArray(data.skill_state?.deployments) ? data.skill_state.deployments : []), record],
    },
  };
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(next, null, 2) + "\n");
  renameSync(temp, path);
  return { via: "json", path };
}

function refuse(env, message) {
  console.error(`\n[deploy:${env}] ✗ REFUSING: ${message}\n`);
  process.exit(1);
}

export async function main(argv = process.argv.slice(2), { root = process.cwd() } = {}) {
  const target = parseTarget(argv);
  if (target.error) refuse("target", target.error);
  const { staging } = target;
  const allowOffMainFlag = argv.includes("--allow-off-main");
  const allowUnknownLive = argv.includes(ALLOW_UNKNOWN_LIVE_FLAG);
  const pkg = existsSync(join(root, "package.json")) ? JSON.parse(readFileSync(join(root, "package.json"), "utf8")) : {};
  const cfg = resolveConfig(pkg, { staging });
  const { env } = cfg;
  const log = (m) => console.log(`[deploy:${env}] ${m}`);

  // Guard 1 — exact origin/main.
  if (git(root, ["fetch", "origin", "main", "--quiet"]) === null) refuse(env, "could not fetch origin/main");
  const head = git(root, ["rev-parse", "HEAD"]);
  const main_ = git(root, ["rev-parse", "origin/main"]);
  if (!head || !main_) refuse(env, "cannot resolve HEAD and origin/main");
  if (head !== main_) {
    const allowed = staging && (allowOffMainFlag || process.env[cfg.envVars.allowOffMainStaging] === "1");
    if (!allowed) {
      refuse(env, `HEAD ${head.slice(0, 7)} (${git(root, ["rev-parse", "--abbrev-ref", "HEAD"])}) is not the fetched origin/main ${main_.slice(0, 7)}.\n` +
        `  Deploys use the exact reviewed main commit. git switch main && git pull, then retry.` +
        (staging ? `\n  Branch preview on staging only: --allow-off-main or ${cfg.envVars.allowOffMainStaging}=1 (say it out loud; staging stops previewing production).` : "\n  Production has no branch bypass."));
    }
    console.warn(`[deploy:${env}] ⚠ deploying off-main HEAD ${head.slice(0, 7)} to staging by explicit request; staging is NOT a production preview until main is redeployed`);
  } else log(`✓ HEAD ${head.slice(0, 7)} matches fetched origin/main`);

  // Guard 2 (production only by explicit --prod) ran in parseTarget above.

  // Guard 3 — the tree being deployed is HEAD, nothing more.
  const dirty = cleanTreeVerdict(git(root, ["status", "--porcelain=v1", "--untracked-files=all"]));
  if (dirty) refuse(env, dirty);
  log("✓ working tree clean");

  // Guard 4 — never deploy over commits HEAD does not contain.
  if (!cfg.url) console.warn(`[deploy:${env}] ⚠ no opchain.deploy.${env}.url in package.json; skipping the live-version ancestor check and post-deploy verification`);
  const { version: live, problem } = await readLiveVersion(cfg.url, cfg.healthPath, cfg.versionField);
  const liveFull = live ? git(root, ["rev-parse", "--verify", `${live}^{commit}`]) : null;
  const isAncestor = live ? (liveFull ? spawnSync("git", ["merge-base", "--is-ancestor", liveFull, head], { cwd: root }).status === 0 : null) : null;
  const lost = liveFull && isAncestor === false ? (git(root, ["log", "--oneline", `${head}..${liveFull}`]) ?? "").split("\n").filter(Boolean) : [];
  const verdict = ancestorVerdict({ live, head, isAncestor, lost, problem, allowUnknownLive });
  if (!verdict.ok) refuse(env, verdict.reason);
  if (verdict.warn) console.warn(`[deploy:${env}] ⚠ ${verdict.note}`);
  else log(`✓ ${verdict.note}`);

  // Deploy.
  console.log(`\n[deploy:${env}] $ ${cfg.command.join(" ")}`);
  const deploy = spawnSync(cfg.command[0], cfg.command.slice(1), { cwd: root, stdio: "inherit", env: process.env, shell: process.platform === "win32" });
  if (deploy.status !== 0) { console.error(`[deploy:${env}] ✗ deploy command exited ${deploy.status ?? "unknown"}`); process.exit(deploy.status ?? 1); }

  // Verify convergence, then smoke.
  let smoke = "skipped";
  if (cfg.url) {
    let converged = false;
    for (let attempt = 1; attempt <= 5 && !converged; attempt++) {
      const { version: now } = await readLiveVersion(cfg.url, cfg.healthPath, cfg.versionField);
      converged = Boolean(now && head.startsWith(now));
      if (!converged && attempt < 5) await new Promise((r) => setTimeout(r, 3000));
    }
    if (!converged) { console.error(`[deploy:${env}] ✗ ${cfg.url}${cfg.healthPath} did not converge to ${head.slice(0, 7)}; investigate or roll back`); process.exit(1); }
    log(`✓ live version is ${head.slice(0, 7)}`);
    if (cfg.smoke) {
      console.log(`\n[deploy:${env}] $ ${cfg.smoke.join(" ")}`);
      const r = spawnSync(cfg.smoke[0], cfg.smoke.slice(1), { cwd: root, stdio: "inherit", env: { ...process.env, DEPLOY_URL: cfg.url }, shell: process.platform === "win32" });
      smoke = r.status === 0 ? "PASS" : "FAIL";
      if (r.status !== 0) { console.error(`[deploy:${env}] ✗ smoke failed; the new build is live — roll back or fix forward`); }
    }
  }

  const record = deploymentRecord({ env, sha: head, url: cfg.url, smoke });
  const written = writeDeployCheckpoint(root, record, { projectName: pkg.name });
  if (written.via !== "skipped") log(`checkpoint ${written.via === "cli" ? "updated via checkpoint CLI" : "written"}: ${written.path.replace(root + "/", "")} (the next deploy ignores it; carry it in your next PR, never as a direct commit to main, which moves HEAD off origin/main)`);
  if (smoke === "FAIL") process.exit(1);
  log("done.");
  return 0;
}

if (process.argv[1] && existsSync(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main().then((code) => { process.exitCode = code; }).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
