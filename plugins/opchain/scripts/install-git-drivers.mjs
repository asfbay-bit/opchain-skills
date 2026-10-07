#!/usr/bin/env node
/**
 * Registers per-clone git plumbing that cannot be committed:
 *
 *   1. the merge drivers .gitattributes refers to (checkpoint JSON);
 *   2. a pre-commit hook that regenerates generated skill mirrors, then
 *      verifies the exact staged candidate after those mutations.
 *
 * Runs from `npm prepare`, so it executes after `npm install` on a
 * fresh clone (the standard Husky-style pattern). Git merge drivers and
 * hooks have to live under `.git/` — they can't be shared via committed
 * files — so this is the one bit of bootstrapping we have to repeat
 * per checkout. Plugin-only users run this packaged file with `--enroll`.
 * Idempotent: safe to re-run.
 *
 * Why the hook: plugins/opchain/skills and every
 * skills/<id>/references/{orchestrator,checkpoint-protocol}.md are generated
 * from skills/. CI only *checks* them (sync-plugin-skills:check,
 * sync-bundles:check), and an edit under skills/ that forgot the regeneration
 * reached CI twice in one week (PR #484 on 2026-09-05, PR #490 on 2026-09-08).
 * A check that can only say "you forgot" after the push is the wrong shape for
 * a mechanical step; the hook does the step. CI keeps the check so a clone that
 * skipped `npm install` still cannot merge drift.
 *
 * Silent skip when:
 *   - not in a git working tree (e.g. npm install from a tarball)
 *   - `git` binary missing
 *   - $OPCHAIN_SKIP_GIT_DRIVERS=1 (CI escape hatch)
 */

import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(SCRIPT_PATH);
export const HOOK_MARKER = "opchain: managed pre-commit boundary v1";
const LEGACY_HOOK_MARKER = "opchain: regenerate generated skill mirrors";
export const VERIFICATION_MARKER = "opchain: verify staged candidate v1";
export const RUNTIME_VERSION = "v1";
const AUTHORING_MARKER = "authoring-repository-v1";

export const VERIFICATION_SNIPPET = `# ${VERIFICATION_MARKER}
repo_root="$(git rev-parse --show-toplevel)" || exit 1
git_common_dir="$(git rev-parse --git-common-dir)" || exit 1
case "$git_common_dir" in
  /*) ;;
  *) git_common_dir="$repo_root/$git_common_dir" ;;
esac
runtime_root="$git_common_dir/opchain/commit-gate/${RUNTIME_VERSION}"
if [ ! -f "$runtime_root/verify-candidate.mjs" ] || [ ! -f "$runtime_root/lib/verification-receipt.cjs" ]; then
  printf '%s\n' "opchain: BLOCKED — commit verifier runtime is missing; rerun explicit enrollment." >&2
  exit 1
fi
node "$runtime_root/verify-candidate.mjs" run --repo "$repo_root" --commit-boundary || exit 1`;

export const PRE_COMMIT_HOOK = `#!/usr/bin/env sh
# ${HOOK_MARKER}
#
# Installed by scripts/install-git-drivers.mjs (npm prepare or explicit
# /oc-enroll). Deleting it disables the boundary until enrollment runs again.
#
# plugins/opchain/skills and skills/<id>/references/{orchestrator,
# checkpoint-protocol}.md are generated from skills/. CI only checks them, so
# an edit under skills/ that skipped the regeneration failed CI twice in one
# week (PR #484, PR #490). When skills/ is staged, regenerate and stage the
# mirrors too. Skip once with OPCHAIN_SKIP_MIRROR_SYNC=1 — CI then fails on the
# drift, which is the point. The marker is installed only for the opchain
# authoring repository; plugin-only targets may have an unrelated skills/ tree.
repo_root="$(git rev-parse --show-toplevel)" || exit 1
git_common_dir="$(git rev-parse --git-common-dir)" || exit 1
case "$git_common_dir" in
  /*) ;;
  *) git_common_dir="$repo_root/$git_common_dir" ;;
esac
if [ -f "$git_common_dir/opchain/${AUTHORING_MARKER}" ] && [ "\${OPCHAIN_SKIP_MIRROR_SYNC:-0}" != "1" ] && git diff --cached --name-only --diff-filter=ACDMR | grep -q '^skills/'; then
  [ -f scripts/sync-skill-bundles.mjs ] && [ -f scripts/sync-plugin-skills.mjs ] || exit 1
  node scripts/sync-skill-bundles.mjs || exit 1
  node scripts/sync-plugin-skills.mjs || exit 1
  git add -A plugins/opchain/skills
  git diff --name-only -- 'skills/*/references/orchestrator.md' 'skills/*/references/checkpoint-protocol.md' \\
    | xargs -r git add --
fi

repo_root="$(git rev-parse --show-toplevel)" || exit 1
if [ "\${OPCHAIN_GATE:-0}" = "1" ] || [ -d "$repo_root/.opchain" ] || [ -d "$repo_root/.checkpoints" ]; then
${VERIFICATION_SNIPPET}
fi
`;

const drivers = [
  {
    name: "opchain-checkpoint",
    description: "Auto-resolve telemetry conflicts in .checkpoints/*.checkpoint.json",
    driver: "node scripts/merge-checkpoint.mjs %O %A %B %P",
    recursive: "binary",
  },
];

function git(args, cwd) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  return r.status === 0 ? (r.stdout || "").trim() : null;
}

function repositoryInfo(cwd) {
  const rootValue = git(["rev-parse", "--show-toplevel"], cwd);
  if (!rootValue) return null;
  const root = realpathSync(rootValue);
  const commonValue = git(["rev-parse", "--git-common-dir"], root);
  if (!commonValue) return null;
  const commonDir = realpathSync(isAbsolute(commonValue) ? commonValue : resolve(root, commonValue));
  return { root, commonDir };
}

function isEnrolled(root) {
  return process.env.OPCHAIN_GATE === "1" || existsSync(join(root, ".opchain")) || existsSync(join(root, ".checkpoints"));
}

function isAuthoringRepository(root) {
  try {
    const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    return packageJson.name === "opchain-dev" &&
      existsSync(join(root, "scripts", "sync-skill-bundles.mjs")) &&
      existsSync(join(root, "scripts", "sync-plugin-skills.mjs")) &&
      existsSync(join(root, "scripts", "merge-checkpoint.mjs"));
  } catch {
    return false;
  }
}

function installAuthoringMarker(commonDir) {
  const marker = join(commonDir, "opchain", AUTHORING_MARKER);
  mkdirSync(dirname(marker), { recursive: true, mode: 0o700 });
  writeFileSync(marker, "opchain authoring repository\n", { mode: 0o600 });
}

export function installVerifierRuntime(cwd = process.cwd()) {
  const info = repositoryInfo(cwd);
  if (!info) return { installed: false, reason: "no-git" };
  const sources = [
    [join(SCRIPT_DIR, "verify-candidate.mjs"), "verify-candidate.mjs"],
    [join(SCRIPT_DIR, "lib", "verification-receipt.cjs"), join("lib", "verification-receipt.cjs")],
  ];
  for (const [source] of sources) {
    if (!existsSync(source)) {
      throw new Error(`packaged verifier runtime is incomplete: missing ${source}`);
    }
  }
  const runtimeRoot = join(info.commonDir, "opchain", "commit-gate", RUNTIME_VERSION);
  for (const [source, relativePath] of sources) {
    const target = join(runtimeRoot, relativePath);
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    copyFileSync(source, target);
    chmodSync(target, 0o600);
  }
  return { installed: true, root: runtimeRoot, repositoryRoot: info.root };
}

function setConfig(key, value, cwd) {
  const r = spawnSync("git", ["config", key, value], { cwd, stdio: "inherit" });
  if (r.status !== 0) {
    process.stderr.write(`install-git-drivers: failed to set ${key}\n`);
    process.exit(1);
  }
}

export function installMergeDrivers(cwd = process.cwd()) {
  for (const d of drivers) {
    setConfig(`merge.${d.name}.name`, d.description, cwd);
    setConfig(`merge.${d.name}.driver`, d.driver, cwd);
    setConfig(`merge.${d.name}.recursive`, d.recursive, cwd);
  }
}

/**
 * Write the pre-commit hook into the clone's hooks directory (honours
 * core.hooksPath). Never overwrites a hook we did not write. When enrollment
 * requires the hook, a foreign hook returns a blocked result and an exact
 * manual integration snippet.
 */
export function installPreCommitHook(cwd = process.cwd(), options = {}) {
  const hooksDir = git(["rev-parse", "--git-path", "hooks"], cwd);
  if (!hooksDir) return { installed: false, reason: "no-git" };
  const hookPath = resolve(cwd, hooksDir, "pre-commit");
  if (existsSync(hookPath)) {
    const current = readFileSync(hookPath, "utf8");
    if (!current.includes(HOOK_MARKER) && !current.includes(LEGACY_HOOK_MARKER)) {
      const outcome = options.required === true ? "BLOCKED" : "NOTICE";
      process.stderr.write(
        `install-git-drivers: ${outcome} — ${hookPath} already exists and is not managed by opchain.\n` +
          "The existing hook was left unchanged; opchain will not claim commit enforcement.\n" +
          "Configure that hook or hook manager to run this final decision step:\n\n" +
          `${VERIFICATION_SNIPPET}\n\n` +
          "Then validate the composed hook with a deliberately failing disposable candidate before relying on it.\n",
      );
      return { installed: false, reason: "foreign-hook", path: hookPath, blocked: options.required === true };
    }
    if (current === PRE_COMMIT_HOOK) return { installed: true, changed: false, path: hookPath };
  }
  mkdirSync(join(hookPath, ".."), { recursive: true });
  writeFileSync(hookPath, PRE_COMMIT_HOOK);
  chmodSync(hookPath, 0o755);
  return { installed: true, changed: true, path: hookPath };
}

function parseArgs(argv) {
  const args = { repo: process.cwd(), enroll: false };
  const rest = [...argv];
  while (rest.length) {
    const flag = rest.shift();
    if (flag === "--enroll") args.enroll = true;
    else if (flag === "--repo") args.repo = rest.shift();
    else throw new Error(`unknown argument: ${flag}`);
  }
  if (!args.repo) throw new Error("--repo requires a value");
  return args;
}

function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
    if (process.env.OPCHAIN_SKIP_GIT_DRIVERS === "1") {
      if (args.enroll) throw new Error("OPCHAIN_SKIP_GIT_DRIVERS=1 prevents explicit enrollment");
      return 0;
    }
    const info = repositoryInfo(args.repo);
    if (!info) {
      if (args.enroll) throw new Error("explicit enrollment requires a Git working tree");
      return 0;
    }
    const required = args.enroll || isEnrolled(info.root);
    if (isAuthoringRepository(info.root)) {
      installMergeDrivers(info.root);
      installAuthoringMarker(info.commonDir);
    }
    const runtime = installVerifierRuntime(info.root);
    const hook = installPreCommitHook(info.root, { required });
    if (!hook.installed && hook.reason === "foreign-hook" && required) return 1;
    if (args.enroll) mkdirSync(join(info.root, ".opchain"), { recursive: true });
    if (args.enroll) {
      process.stdout.write(`opchain: enrolled Git commit boundary at ${hook.path}\nopchain: verifier runtime ${runtime.root}\n`);
    }
    return 0;
  } catch (error) {
    process.stderr.write(`install-git-drivers: BLOCKED — ${error.message}\n`);
    return 1;
  }
}

if (process.argv[1] && realpathSync(SCRIPT_PATH) === realpathSync(resolve(process.argv[1]))) {
  process.exitCode = main();
}
