#!/usr/bin/env node
/**
 * Registers per-clone git plumbing that cannot be committed:
 *
 *   1. the merge drivers .gitattributes refers to (checkpoint JSON);
 *   2. a pre-commit hook that regenerates generated skill mirrors, then
 *      verifies the exact staged candidate after those mutations;
 *   3. a post-commit hook that records a bypass whenever a commit lands whose
 *      tree no PASS receipt covers (git runs post-commit even under
 *      --no-verify, which is the whole point);
 *   4. a pre-push hook that refuses to push a bypassed commit that carries no
 *      `Opchain-Bypass:` trailer, so the accountability record survives the
 *      squash merge that discards the local checkpoint.
 *
 * Runs from `npm prepare`, so it executes after `npm install` on a
 * fresh clone (the standard Husky-style pattern). Git merge drivers and
 * hooks have to live under `.git/` — they can't be shared via committed
 * files — so this is the one bit of bootstrapping we have to repeat
 * per checkout. Plugin-only users run this packaged file with `--enroll`.
 * Idempotent: safe to re-run.
 *
 * Installing the hooks is not enrolling. Every managed hook checks for
 * enrollment (`.opchain/`, `.checkpoints/`, or OPCHAIN_GATE=1) and is inert
 * without it; `--enroll` is what creates `.opchain/`. The 2026-10-08
 * effectiveness audit (I-02) found a consumer repository that ran seven days
 * and 193 commits with the plugin installed and no gate, because nothing said
 * so. `--doctor` now says so.
 *
 * Why the pre-commit hook: plugins/opchain/skills and every
 * skills/<id>/references/{orchestrator,checkpoint-protocol}.md are generated
 * from skills/. CI only *checks* them (sync-plugin-skills:check,
 * sync-bundles:check), and an edit under skills/ that forgot the regeneration
 * reached CI twice in one week (PR #484 on 2026-09-05, PR #490 on 2026-09-08).
 * A check that can only say "you forgot" after the push is the wrong shape for
 * a mechanical step; the hook does the step. CI keeps the check so a clone that
 * skipped `npm install` still cannot merge drift.
 *
 * Why the post-commit and pre-push hooks: the same audit (I-04) counted 18
 * `--no-verify` commits in one consumer repository whose checkpoint still said
 * `bypasses: []`. Every bypass control was a naming convention the agent was
 * asked to follow. These two hooks are the chokepoints: a bypass is recorded
 * where it happens and refused where it would leave the machine.
 *
 * Modes (all take `--repo <path>`, default cwd):
 *   (none)        npm prepare: install drivers + hooks; inert until enrolled
 *   --enroll      explicit enrollment: install, then create `.opchain/`
 *   --doctor      preflight only, installs nothing; PASS/FAIL per item
 *   --ci [--force]
 *                 enroll, vendor the runtime into `.opchain/runtime/` and write
 *                 `.github/workflows/opchain-evidence.yml` from the packaged
 *                 template; never overwrites a workflow without --force
 *   --claude-md   create or update the opchain section of CLAUDE.md
 *   --hook <post-commit|pre-push>
 *                 internal: the managed hooks call the runtime copy of this
 *                 file with this flag
 *
 * Silent skip when:
 *   - not in a git working tree (e.g. npm install from a tarball)
 *   - `git` binary missing
 *   - $OPCHAIN_SKIP_GIT_DRIVERS=1 (CI escape hatch)
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { delimiter, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(SCRIPT_PATH);
export const HOOK_MARKER = "opchain: managed pre-commit boundary v1";
const LEGACY_HOOK_MARKER = "opchain: regenerate generated skill mirrors";
export const VERIFICATION_MARKER = "opchain: verify staged candidate v1";
export const POST_COMMIT_MARKER = "opchain: managed post-commit bypass record v1";
export const PRE_PUSH_MARKER = "opchain: managed pre-push bypass guard v1";
// A-03: the composable snippets carry their own markers. The whole-file
// "managed" markers above appear only in hooks this installer writes whole, so
// a hook someone composed from a snippet is never mistaken for one to replace.
export const POST_COMMIT_SNIPPET_MARKER = "opchain: post-commit bypass record step v1";
export const PRE_PUSH_SNIPPET_MARKER = "opchain: pre-push bypass guard step v1";
export const RUNTIME_VERSION = "v1";
export const BYPASS_TRAILER = "Opchain-Bypass";
export const PUSH_BYPASS_ENV = "OPCHAIN_PUSH_BYPASS";
export const CI_WORKFLOW_PATH = ".github/workflows/opchain-evidence.yml";
export const VENDORED_RUNTIME_DIR = ".opchain/runtime";
export const CLAUDE_MD_START = "<!-- opchain:managed-section v1 -->";
export const CLAUDE_MD_END = "<!-- /opchain:managed-section -->";
const AUTHORING_MARKER = "authoring-repository-v1";
const LEGACY_BYPASS_VALUE = /^bypassed\s*\(\s*(\S[^)]*?)\s*\)\s*$/i;

// A-07: every composable snippet runs in a subshell, so nothing inside it can
// end the host hook early; only its exit status reaches the host.
export const VERIFICATION_SNIPPET = `# ${VERIFICATION_MARKER}
(
repo_root="$(git rev-parse --show-toplevel)" || exit 1
git_common_dir="$(git rev-parse --git-common-dir)" || exit 1
case "$git_common_dir" in
  /*) ;;
  *) git_common_dir="$repo_root/$git_common_dir" ;;
esac
runtime_root="$git_common_dir/opchain/commit-gate/${RUNTIME_VERSION}"
if [ ! -f "$runtime_root/verify-candidate.mjs" ] || [ ! -f "$runtime_root/lib/verification-receipt.cjs" ]; then
  printf '%s\\n' "opchain: BLOCKED — commit verifier runtime is missing; rerun explicit enrollment." >&2
  exit 1
fi
node "$runtime_root/verify-candidate.mjs" run --repo "$repo_root" --commit-boundary
) || exit 1`;

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

// Shared by the post-commit and pre-push hooks: resolve the repository, the
// Git common directory and the enrolled runtime, and do nothing when the
// repository is not enrolled. `exitOnError` differs because post-commit cannot
// block a commit that already exists, while a pre-push that cannot even find
// its repository must not let the push through unexamined. The `exit`s here
// leave only the snippet's subshell (A-07), never the host hook.
function hookPreamble(exitOnError) {
  return `repo_root="$(git rev-parse --show-toplevel)" || exit ${exitOnError}
git_common_dir="$(git rev-parse --git-common-dir)" || exit ${exitOnError}
case "$git_common_dir" in
  /*) ;;
  *) git_common_dir="$repo_root/$git_common_dir" ;;
esac
if [ "\${OPCHAIN_GATE:-0}" != "1" ] && [ ! -d "$repo_root/.opchain" ] && [ ! -d "$repo_root/.checkpoints" ]; then
  exit 0
fi
runtime_root="$git_common_dir/opchain/commit-gate/${RUNTIME_VERSION}"`;
}

export const POST_COMMIT_SNIPPET = `# ${POST_COMMIT_SNIPPET_MARKER}
(
${hookPreamble(0)}
if [ ! -f "$runtime_root/install-git-drivers.mjs" ] || [ ! -f "$runtime_root/verify-candidate.mjs" ]; then
  printf '%s\\n' "[opchain] post-commit: verifier runtime is missing; commit $(git rev-parse --short HEAD) was NOT checked for a bypass record. Rerun /oc-enroll." >&2
  exit 0
fi
node "$runtime_root/install-git-drivers.mjs" --hook post-commit --repo "$repo_root"
exit 0
)`;

export const POST_COMMIT_HOOK = `#!/usr/bin/env sh
# ${POST_COMMIT_MARKER}
#
# Installed by scripts/install-git-drivers.mjs (npm prepare or explicit
# /oc-enroll). Git runs post-commit even under --no-verify, which is the point:
# when HEAD's tree has no PASS receipt, the runtime writes
# <git-common-dir>/opchain/bypasses/v1/<sha>.json and appends to
# .checkpoints/oc-bug-check.checkpoint.json skill_state.bypasses. The reason is
# taken from the commit's \`${BYPASS_TRAILER}:\` trailer when present. The record is
# what the pre-push guard and evidence:pr read; the trailer is what survives a
# squash merge. Silent when a receipt covers the tree. Never blocks: a
# post-commit hook cannot, and this one always exits 0.
${POST_COMMIT_SNIPPET}
`;

export const PRE_PUSH_SNIPPET = `# ${PRE_PUSH_SNIPPET_MARKER}
(
${hookPreamble(1)}
if [ ! -f "$runtime_root/install-git-drivers.mjs" ] || [ ! -f "$runtime_root/verify-candidate.mjs" ]; then
  printf '%s\\n' "[opchain] pre-push: BLOCKED — verifier runtime is missing; rerun /oc-enroll (loud escape hatch: ${PUSH_BYPASS_ENV}=1)." >&2
  [ "\${${PUSH_BYPASS_ENV}:-0}" = "1" ] && exit 0
  exit 1
fi
node "$runtime_root/install-git-drivers.mjs" --hook pre-push --repo "$repo_root" --remote "\${1:-origin}"
) || exit 1`;

export const PRE_PUSH_HOOK = `#!/usr/bin/env sh
# ${PRE_PUSH_MARKER}
#
# Installed by scripts/install-git-drivers.mjs (npm prepare or explicit
# /oc-enroll). Reads the refs being pushed from stdin, asks the enrolled
# runtime which outgoing commits have neither a PASS receipt nor an
# \`${BYPASS_TRAILER}:\` trailer, and refuses the push while any remain. A commit a
# rebase or cherry-pick rewrote is excused only when the commit it was picked
# from had a PASS receipt or the trailer. Merge commits and commits already on
# the remote are never examined; an outgoing range it cannot compute refuses.
# Loud escape hatch: ${PUSH_BYPASS_ENV}=1 git push … (prints what it let through).
${PRE_PUSH_SNIPPET}
exit 0
`;

// A-03: sha256 of every whole-file hook an earlier release of this installer
// wrote. Only an exact match is replaced in place; anything else that carries
// an opchain marker is left alone, because it may hold someone's own steps.
const PREVIOUS_MANAGED_DIGESTS = Object.freeze({
  "pre-commit": [
    "c67076f6ffaa15c52da72636415c3aba15754685b4c169129d59656d4a961676", // mirror sync only (#498)
    "5481aef0b3a5fb3def80118b74dcc026d3c6f02297df6acb11765fe954d72be8", // v1.9.2 (#536)
    "c291a65e45276a8ae301bc1ee1a8b497565050079cec18be4673e59d323ffef7", // 2.1 consolidation draft
  ],
  "post-commit": ["0631977f84f7b73269df0ade4cb4a30003cfc386cceecc861769ac6f055a7c13"],
  "pre-push": ["a8240f7052e9bb16ad1a0bbea8e25b62db6f3f23d2dbc85163f14b2b7248d25e"],
});

const MANAGED_HOOKS = Object.freeze([
  { name: "pre-commit", content: PRE_COMMIT_HOOK, markers: [HOOK_MARKER, LEGACY_HOOK_MARKER, VERIFICATION_MARKER], snippet: VERIFICATION_SNIPPET },
  { name: "post-commit", content: POST_COMMIT_HOOK, markers: [POST_COMMIT_MARKER, POST_COMMIT_SNIPPET_MARKER], snippet: POST_COMMIT_SNIPPET },
  { name: "pre-push", content: PRE_PUSH_HOOK, markers: [PRE_PUSH_MARKER, PRE_PUSH_SNIPPET_MARKER], snippet: PRE_PUSH_SNIPPET },
]);

// What an existing hook file is, relative to one managed spec:
//   current   — exactly what this installer writes now
//   previous  — exactly what an earlier release wrote (safe to replace)
//   composed  — a foreign hook that runs the current snippet verbatim: it
//               starts a line, and no line before it starts with `exit`
//   modified  — carries an opchain marker but matches no known version
//   foreign   — no opchain marker at all
function runsSnippet(current, snippet) {
  for (let at = current.indexOf(snippet); at !== -1; at = current.indexOf(snippet, at + 1)) {
    if (at !== 0 && current[at - 1] !== "\n") continue;
    if (!/^\s*exit\b/m.test(current.slice(0, at))) return true;
  }
  return false;
}

function classifyHook(spec, current) {
  if (current === spec.content) return "current";
  if ((PREVIOUS_MANAGED_DIGESTS[spec.name] || []).includes(createHash("sha256").update(current).digest("hex"))) return "previous";
  if (runsSnippet(current, spec.snippet)) return "composed";
  return spec.markers.some((marker) => current.includes(marker)) ? "modified" : "foreign";
}

const drivers = [
  {
    name: "opchain-checkpoint",
    description: "Auto-resolve telemetry conflicts in .checkpoints/*.checkpoint.json",
    driver: "node scripts/merge-checkpoint.mjs %O %A %B %P",
    recursive: "binary",
  },
];

function git(args, cwd, options = {}) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", input: options.input });
  return r.status === 0 ? (r.stdout || "").trim() : null;
}

function repositoryInfo(cwd) {
  const rootValue = git(["rev-parse", "--show-toplevel"], cwd);
  if (!rootValue) return null;
  const root = realpathSync(rootValue);
  const commonValue = git(["rev-parse", "--git-common-dir"], root);
  if (!commonValue) return null;
  const commonDir = realpathSync(isAbsolute(commonValue) ? commonValue : resolve(root, commonValue));
  const gitDirValue = git(["rev-parse", "--git-dir"], root);
  const gitDir = gitDirValue ? realpathSync(isAbsolute(gitDirValue) ? gitDirValue : resolve(root, gitDirValue)) : commonDir;
  return { root, commonDir, gitDir };
}

function isEnrolled(root) {
  return process.env.OPCHAIN_GATE === "1" || existsSync(join(root, ".opchain")) || existsSync(join(root, ".checkpoints"));
}

function runtimeRoot(commonDir) {
  return join(commonDir, "opchain", "commit-gate", RUNTIME_VERSION);
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

// The runtime copy is what the hooks execute, so it must survive removal of
// the plugin artifact. This installer ships with it because the post-commit
// and pre-push hooks are thin shell wrappers over `--hook`.
// lib/bypass-record.cjs is what `bypass-record` / `bypass-list` load beside the
// verifier. A package that predates it still enrolls (the commit boundary
// works), but the post-commit and pre-push hooks cannot record or list
// bypasses until the runtime is refreshed; enrollment and --doctor say so.
const RUNTIME_SOURCES = Object.freeze([
  { source: "verify-candidate.mjs", target: "verify-candidate.mjs", required: true },
  { source: join("lib", "verification-receipt.cjs"), target: join("lib", "verification-receipt.cjs"), required: true },
  { source: join("lib", "bypass-record.cjs"), target: join("lib", "bypass-record.cjs"), required: false },
  { source: "install-git-drivers.mjs", target: "install-git-drivers.mjs", required: true },
]);

export function installVerifierRuntime(cwd = process.cwd()) {
  const info = repositoryInfo(cwd);
  if (!info) return { installed: false, reason: "no-git" };
  const missing = [];
  for (const entry of RUNTIME_SOURCES) {
    const source = join(SCRIPT_DIR, entry.source);
    if (existsSync(source)) continue;
    if (entry.required) throw new Error(`packaged verifier runtime is incomplete: missing ${source}`);
    missing.push(entry.target);
  }
  const target = runtimeRoot(info.commonDir);
  for (const entry of RUNTIME_SOURCES) {
    const source = join(SCRIPT_DIR, entry.source);
    if (!existsSync(source)) continue;
    const file = join(target, entry.target);
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    copyFileSync(source, file);
    chmodSync(file, 0o600);
  }
  if (missing.length) {
    process.stderr.write(`install-git-drivers: NOTICE — this package does not carry ${missing.join(", ")}; bypass recording stays unavailable until enrollment is re-run from a package that does.\n`);
  }
  return { installed: true, root: target, repositoryRoot: info.root, missing };
}

// bypass-list reports `receipt` as the best verdict for the commit's tree
// (PASS | PASS_UNMATCHED | INCONCLUSIVE | UNSUPPORTED | FAIL | none). Only PASS is coverage.
function hasPassReceipt(value) {
  return value === "PASS" || value === true;
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

function hooksDirectory(cwd) {
  const hooksDir = git(["rev-parse", "--git-path", "hooks"], cwd);
  return hooksDir ? resolve(cwd, hooksDir) : null;
}

/**
 * Write one managed hook into the clone's hooks directory (honours
 * core.hooksPath). Replaces a hook only when it is byte-identical to a version
 * this installer wrote (A-03). A hook that already carries the current snippet
 * counts as installed. Anything else is left unchanged; when enrollment
 * requires the hook, that returns a blocked result and the exact snippet.
 */
export function installManagedHook(spec, cwd = process.cwd(), options = {}) {
  const hooksDir = hooksDirectory(cwd);
  if (!hooksDir) return { installed: false, reason: "no-git", hook: spec.name };
  const hookPath = join(hooksDir, spec.name);
  if (existsSync(hookPath)) {
    const current = readFileSync(hookPath, "utf8");
    const kind = classifyHook(spec, current);
    if (kind === "current") return { installed: true, changed: false, hook: spec.name, path: hookPath };
    if (kind === "composed") return { installed: true, changed: false, composed: true, hook: spec.name, path: hookPath };
    if (kind !== "previous") {
      const outcome = options.required === true ? "BLOCKED" : "NOTICE";
      process.stderr.write(
        `install-git-drivers: ${outcome} — ${hookPath} already exists and ${kind === "modified" ? "carries an opchain marker but matches no version opchain wrote (it may hold your own steps)" : "is not managed by opchain"}.\n` +
          `The existing hook was left unchanged; opchain will not claim ${spec.name} enforcement.\n` +
          "Configure that hook or hook manager to run this final decision step (replace any older opchain step in it):\n\n" +
          `${spec.snippet}\n\n` +
          "Then validate the composed hook with a deliberately failing disposable candidate before relying on it.\n",
      );
      return { installed: false, reason: "foreign-hook", hook: spec.name, path: hookPath, blocked: options.required === true };
    }
  }
  mkdirSync(hooksDir, { recursive: true });
  writeFileSync(hookPath, spec.content);
  chmodSync(hookPath, 0o755);
  return { installed: true, changed: true, hook: spec.name, path: hookPath };
}

export function installPreCommitHook(cwd = process.cwd(), options = {}) {
  return installManagedHook(MANAGED_HOOKS[0], cwd, options);
}

export function installManagedHooks(cwd = process.cwd(), options = {}) {
  return MANAGED_HOOKS.map((spec) => installManagedHook(spec, cwd, options));
}

// ---------------------------------------------------------------------------
// Hook handlers: the managed post-commit and pre-push hooks call the runtime
// copy of this file with `--hook <name>`. Both talk to the enrolled runtime's
// verify-candidate.mjs (`bypass-record`, `bypass-list`), never to the plugin
// artifact, so they keep working after the plugin is removed.
// ---------------------------------------------------------------------------

function runtimeVerifier(info) {
  return join(runtimeRoot(info.commonDir), "verify-candidate.mjs");
}

function bypassRecordPath(info, commit) {
  return join(info.commonDir, "opchain", "bypasses", RUNTIME_VERSION, `${commit}.json`);
}

// A-08: the same trailer reading as verify-candidate.mjs and
// lib/release-evidence.mjs — Git's trailer parser, a non-empty value, and the
// legacy `bugcheck: bypassed (<reason>)` form only as a trailer with a reason.
function bypassTrailer(info, commit) {
  const value = git(["log", "-1", `--format=%(trailers:key=${BYPASS_TRAILER},valueonly,separator=%x1f)%x1e%(trailers:key=bugcheck,valueonly,separator=%x1f)`, commit], info.root);
  if (!value) return "";
  const [explicit = "", legacy = ""] = value.split("\x1e");
  for (const entry of explicit.split("\x1f")) if (entry.trim()) return entry.trim();
  for (const entry of legacy.split("\x1f")) {
    const match = LEGACY_BYPASS_VALUE.exec(entry.trim());
    if (match) return match[1];
  }
  return "";
}

// A-01: which commit a rebase or cherry-pick is replaying. Git leaves
// CHERRY_PICK_HEAD naming the original while each pick commits (merge-backend
// rebase and cherry-pick alike). An amend at an `edit` stop or a commit that
// resolves a conflict has none: that is new content, so it is not a rewrite.
function rewriteInProgress(info) {
  const picked = existsSync(join(info.gitDir, "CHERRY_PICK_HEAD"))
    ? git(["rev-parse", "--verify", "-q", "CHERRY_PICK_HEAD^{commit}"], info.root)
    : null;
  if (!picked) return null;
  const rebasing = existsSync(join(info.gitDir, "rebase-merge")) || existsSync(join(info.gitDir, "rebase-apply"));
  return { source: rebasing ? "rebase" : "cherry-pick", original: picked };
}

function hookPostCommit(args) {
  const info = repositoryInfo(args.repo);
  if (!info) return 0;
  const head = git(["rev-parse", "HEAD"], info.root);
  if (!head) return 0;
  const verifier = runtimeVerifier(info);
  if (!existsSync(verifier)) {
    process.stderr.write(`[opchain] post-commit: verifier runtime is missing at ${verifier}; rerun /oc-enroll.\n`);
    return 0;
  }
  const rewrite = rewriteInProgress(info);
  const source = rewrite ? rewrite.source : "no-verify";
  const trailer = bypassTrailer(info, head);
  // The reason is provenance for a human; nothing excuses a commit on its text.
  const reason = trailer || (rewrite ? `${rewrite.source} of ${rewrite.original.slice(0, 12)}` : "");
  const record = (sourceValue, extra = []) => spawnSync(process.execPath, [
    verifier, "bypass-record", "--repo", info.root, "--commit", head,
    ...(reason ? ["--reason", reason] : []),
    "--source", sourceValue, ...extra,
  ], { cwd: info.root, encoding: "utf8" });
  let result = record(source, rewrite ? ["--rewritten-from", rewrite.original] : []);
  // An older runtime may only accept the documented `no-verify` source and no
  // --rewritten-from; the commit is still recorded, and simply not excused.
  if (result.status !== 0 && rewrite) result = record("no-verify");
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    process.stderr.write(`[opchain] post-commit: bypass record failed (exit ${result.status}); commit ${head.slice(0, 7)} is unaccounted for.\n`);
    return 0;
  }
  if (!result.stdout && !result.stderr && existsSync(bypassRecordPath(info, head))) {
    const hint = trailer
      ? `reason: ${trailer}`
      : rewrite
        ? `${rewrite.source} of ${rewrite.original.slice(0, 7)}; excused at push only if that commit had a PASS receipt or the trailer`
        : `no ${BYPASS_TRAILER}: trailer — add one (git commit --amend --no-verify --trailer "${BYPASS_TRAILER}: <reason, quoting the approval>") before pushing`;
    process.stderr.write(`[opchain] ⚠ commit ${head.slice(0, 7)} bypassed the gate — recorded (${hint})\n`);
  }
  return 0;
}

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function fallbackBase(info, localSha, remote) {
  for (const ref of [`refs/remotes/${remote}/HEAD`, `refs/remotes/${remote}/main`, `refs/remotes/${remote}/master`]) {
    if (git(["rev-parse", "--verify", "-q", ref], info.root) === null) continue;
    const base = git(["merge-base", localSha, ref], info.root);
    if (base) return base;
  }
  const roots = git(["rev-list", "--max-parents=0", localSha], info.root);
  return roots ? roots.split("\n").pop() : null;
}

export function collectBypassList(info, range) {
  const verifier = runtimeVerifier(info);
  const result = spawnSync(process.execPath, [verifier, "bypass-list", "--repo", info.root, "--range", range, "--json"], {
    cwd: info.root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`bypass-list exited ${result.status}: ${(result.stderr || result.stdout || "").trim()}`);
  }
  let entries;
  try {
    entries = JSON.parse(result.stdout);
  } catch {
    throw new Error("bypass-list did not return JSON");
  }
  if (!Array.isArray(entries)) throw new Error("bypass-list did not return an array");
  return entries;
}

/**
 * Decide which outgoing commits are unaccounted for. Exported for tests and
 * for the evidence gate; the pre-push hook is a thin caller.
 *
 * A commit is accountable when a PASS receipt covers its tree, when it
 * carries the bypass trailer, or when bypass-list verified it as a rewrite of
 * an accountable commit. Merge commits and anything already on the remote are
 * not examined. Every answer comes from the runtime's bypass-list, so pre-push
 * and evidence:pr apply one rule. An outgoing set that cannot be computed
 * throws (A-02): the caller refuses rather than pushing unexamined commits.
 */
export function outgoingBypasses(info, { localSha, remoteSha, remote }) {
  const ZERO = /^0+$/;
  // A remote tip this clone has never fetched (a force-push over someone
  // else's commits) cannot anchor a range; fall back to the remote-tracking refs.
  const remoteKnown = !ZERO.test(remoteSha) && git(["cat-file", "-e", `${remoteSha}^{commit}`], info.root) !== null;
  const base = remoteKnown ? remoteSha : fallbackBase(info, localSha, remote);
  const outgoingValue = git(
    ["rev-list", "--no-merges", localSha, ...(remoteKnown ? [`^${remoteSha}`] : []), "--not", `--remotes=${remote}`],
    info.root,
  );
  if (outgoingValue === null) throw new Error(`could not list the commits outgoing to ${remote} (rev-list failed for ${localSha.slice(0, 12)})`);
  const outgoing = outgoingValue.split("\n").filter(Boolean);
  if (!outgoing.length) return { outgoing, offenders: [] };
  if (!base) throw new Error(`could not find a base for the commits outgoing to ${remote}`);
  const listed = new Map(collectBypassList(info, `${base}..${localSha}`).map((entry) => [entry.commit, entry]));
  const offenders = [];
  for (const commit of outgoing) {
    // Outside the listed range (the root commit of a never-pushed repository):
    // `<commit>^!` lists exactly that commit.
    const entry = listed.get(commit) || collectBypassList(info, `${commit}^!`).find((row) => row.commit === commit);
    if (!entry) throw new Error(`bypass-list returned no row for ${commit.slice(0, 12)}`);
    if (hasPassReceipt(entry.receipt)) continue;
    if (entry.trailer) continue;
    if (entry.rewrite === true) continue;
    offenders.push({ ...entry, record: Boolean(entry.bypassRecord), subject: git(["log", "-1", "--format=%s", commit], info.root) || "" });
  }
  return { outgoing, offenders };
}

function hookPrePush(args) {
  const info = repositoryInfo(args.repo);
  if (!info) {
    process.stderr.write("[opchain] pre-push: BLOCKED — not a Git working tree.\n");
    return 1;
  }
  const remote = args.remote || "origin";
  const updates = readStdin()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/))
    .filter((parts) => parts.length >= 4 && !/^0+$/.test(parts[1]));
  if (!updates.length) return 0;
  const offenders = [];
  try {
    for (const [, localSha, remoteRef, remoteSha] of updates) {
      const outcome = outgoingBypasses(info, { localSha, remoteSha, remote });
      for (const offender of outcome.offenders) offenders.push({ ...offender, remoteRef });
    }
  } catch (error) {
    if (process.env[PUSH_BYPASS_ENV] === "1") {
      process.stderr.write(`[opchain] pre-push: ⚠ guard could not run (${error.message}); allowed by ${PUSH_BYPASS_ENV}=1.\n`);
      return 0;
    }
    process.stderr.write(`[opchain] pre-push: BLOCKED — bypass guard could not run: ${error.message}\nRerun /oc-enroll to refresh the runtime, or push once with ${PUSH_BYPASS_ENV}=1 (loud).\n`);
    return 1;
  }
  if (!offenders.length) return 0;
  const listing = offenders
    .map((entry) => `  ${entry.commit.slice(0, 7)}  ${entry.subject}  (receipt: none; bypass record: ${entry.record ? "yes" : "no"}; trailer: no)`)
    .join("\n");
  if (process.env[PUSH_BYPASS_ENV] === "1") {
    process.stderr.write(
      `[opchain] pre-push: ⚠ ${offenders.length} unaccounted commit(s) allowed by ${PUSH_BYPASS_ENV}=1:\n${listing}\n` +
        `They are being pushed without a receipt or an ${BYPASS_TRAILER}: trailer. evidence:pr will list them.\n`,
    );
    return 0;
  }
  process.stderr.write(
    `[opchain] pre-push: REFUSED — ${offenders.length} commit(s) have no PASS receipt and no ${BYPASS_TRAILER}: trailer:\n${listing}\n` +
      "Each bypass must say why. Either rerun the gate (/oc-bugcheck, then recommit), or add the trailer quoting the approval:\n" +
      `  git commit --amend --no-verify --trailer "${BYPASS_TRAILER}: <reason — who approved, what failed>"\n` +
      `(/oc-bugcheck bypass does this for you). Loud escape hatch: ${PUSH_BYPASS_ENV}=1 git push …\n`,
  );
  return 1;
}

// ---------------------------------------------------------------------------
// --doctor: a preflight that says, in one screen, whether the gate will run
// here and why it would not. Installs nothing.
// ---------------------------------------------------------------------------

function onPath(name) {
  const dirs = (process.env.PATH || "").split(delimiter).filter(Boolean);
  const names = process.platform === "win32" ? [name, `${name}.cmd`, `${name}.exe`] : [name];
  for (const dir of dirs) {
    for (const candidate of names) {
      try {
        if (statSync(join(dir, candidate)).isFile()) return true;
      } catch {}
    }
  }
  return false;
}

function readPackageJson(directory) {
  try {
    return JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
  } catch {
    return null;
  }
}

const PACKAGE_RUNNERS = new Set(["npm", "pnpm", "yarn", "bun"]);

export function resolveCommand(root, argv) {
  if (!Array.isArray(argv) || !argv.length || typeof argv[0] !== "string") return { ok: false, detail: "command is not a non-empty argv array" };
  const [bin, ...rest] = argv;
  const localBin = join(root, "node_modules", ".bin", bin);
  const where = existsSync(localBin) ? `node_modules/.bin/${bin}` : onPath(bin) ? `${bin} on PATH` : null;
  if (!where) return { ok: false, detail: `${bin} is not on PATH and node_modules/.bin/${bin} does not exist` };
  if (PACKAGE_RUNNERS.has(bin)) {
    let prefix = root;
    const args = [];
    for (let index = 0; index < rest.length; index += 1) {
      if (rest[index] === "--prefix" && rest[index + 1]) { prefix = resolve(root, rest[index + 1]); index += 1; }
      else if (rest[index].startsWith("--prefix=")) prefix = resolve(root, rest[index].slice("--prefix=".length));
      else args.push(rest[index]);
    }
    const sub = args.find((arg) => !arg.startsWith("-"));
    const scripts = readPackageJson(prefix)?.scripts || {};
    const prefixLabel = relative(root, prefix) || ".";
    if (sub === "run" || sub === "run-script") {
      const script = args[args.indexOf(sub) + 1];
      if (!script) return { ok: false, detail: `${bin} run has no script name` };
      if (!scripts[script]) return { ok: false, detail: `"${script}" is not a script in ${prefixLabel}/package.json` };
      return { ok: true, detail: `${where}; ${prefixLabel}/package.json has scripts.${script}` };
    }
    if (sub === "test" && !scripts.test) return { ok: false, detail: `${prefixLabel}/package.json has no scripts.test` };
    return { ok: true, detail: where };
  }
  if (bin === "npx") {
    const target = rest.find((arg) => !arg.startsWith("-"));
    if (target && !existsSync(join(root, "node_modules", ".bin", target)) && !onPath(target)) {
      return { ok: false, detail: `npx ${target}: not in node_modules/.bin and not on PATH (npx would download it inside the gate)` };
    }
    return { ok: true, detail: target ? `npx → node_modules/.bin/${target}` : where };
  }
  return { ok: true, detail: where };
}

function nodeModulesItem(root, directory) {
  const label = relative(root, directory) || ".";
  if (!existsSync(join(directory, "package.json"))) return null;
  const modules = join(directory, "node_modules");
  // A package that declares no dependencies needs no install; the verifier itself
  // only demands node_modules for the .bin entries its commands resolve to.
  let declared = 0;
  try {
    const pkg = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
    for (const key of ["dependencies", "devDependencies", "optionalDependencies"]) declared += Object.keys(pkg[key] ?? {}).length;
  } catch { /* unreadable package.json is reported by the policy items */ }
  if (!existsSync(modules)) {
    if (declared === 0) return { id: `node_modules:${label}`, status: "PASS", detail: `${label}/package.json declares no dependencies; no install needed` };
    return { id: `node_modules:${label}`, status: "FAIL", detail: `${label}/node_modules is missing — run npm ci there` };
  }
  const packages = readdirSync(modules).filter((name) => !name.startsWith("."));
  if (!packages.length) {
    return { id: `node_modules:${label}`, status: "FAIL", detail: `${label}/node_modules holds only caches (${readdirSync(modules).join(", ") || "empty"}) — run npm ci there` };
  }
  if (!existsSync(join(modules, ".package-lock.json"))) {
    return { id: `node_modules:${label}`, status: "WARN", detail: `${label}/node_modules has ${packages.length} packages but no .package-lock.json; the install may be partial` };
  }
  return { id: `node_modules:${label}`, status: "PASS", detail: `${label}/node_modules has ${packages.length} packages` };
}

function sameBytes(a, b) {
  try {
    return readFileSync(a).equals(readFileSync(b));
  } catch {
    return false;
  }
}

export function doctor(info, { policyPath = ".bugcheck.json" } = {}) {
  const items = [];
  const enrolled = isEnrolled(info.root);
  items.push(enrolled
    ? { id: "enrollment", status: "PASS", detail: process.env.OPCHAIN_GATE === "1" ? "OPCHAIN_GATE=1" : existsSync(join(info.root, ".opchain")) ? ".opchain/ present" : ".checkpoints/ present" }
    : { id: "enrollment", status: "FAIL", detail: "not enrolled — any installed hooks are inert; run /oc-enroll" });

  const runtime = runtimeRoot(info.commonDir);
  const missingRuntime = RUNTIME_SOURCES.filter((entry) => !existsSync(join(runtime, entry.target)));
  if (missingRuntime.length) {
    const names = missingRuntime.map((entry) => entry.target);
    const onlyOptional = missingRuntime.every((entry) => !entry.required);
    items.push({
      id: "runtime",
      status: "FAIL",
      detail: onlyOptional
        ? `missing ${names.join(", ")} under ${runtime} — bypass recording is unavailable; re-run /oc-enroll from a package that carries it`
        : `missing ${names.join(", ")} under ${runtime} — run /oc-enroll`,
    });
  } else {
    const stale = RUNTIME_SOURCES.filter((entry) => existsSync(join(SCRIPT_DIR, entry.source)) && !sameBytes(join(SCRIPT_DIR, entry.source), join(runtime, entry.target)));
    items.push(stale.length
      ? { id: "runtime", status: "WARN", detail: `${runtime} differs from the installed package (${stale.map((entry) => entry.target).join(", ")}); re-run /oc-enroll to refresh` }
      : { id: "runtime", status: "PASS", detail: runtime });
  }

  const hooksDir = hooksDirectory(info.root);
  for (const spec of MANAGED_HOOKS) {
    const hookPath = hooksDir ? join(hooksDir, spec.name) : null;
    if (!hookPath || !existsSync(hookPath)) {
      items.push({ id: `hook:${spec.name}`, status: "FAIL", detail: "not installed — run /oc-enroll" });
      continue;
    }
    const kind = classifyHook(spec, readFileSync(hookPath, "utf8"));
    // A-03: only a byte-identical earlier version is "re-run /oc-enroll";
    // anything else is never advice that would replace someone's own steps.
    if (kind === "foreign" || kind === "modified") {
      items.push({ id: `hook:${spec.name}`, status: "FAIL", detail: `${hookPath} is ${kind === "foreign" ? "a foreign hook" : "a hook with an older or edited opchain step"}; /oc-enroll will not replace it — edit it to include the current opchain step (printed by /oc-enroll)` });
    } else if (!(statSync(hookPath).mode & 0o111)) {
      items.push({ id: `hook:${spec.name}`, status: "FAIL", detail: `${hookPath} is not executable` });
    } else if (kind === "previous") {
      items.push({ id: `hook:${spec.name}`, status: "WARN", detail: `${hookPath} is an older managed version; re-run /oc-enroll` });
    } else {
      items.push({ id: `hook:${spec.name}`, status: "PASS", detail: kind === "composed" ? `${hookPath} (composed with the opchain step)` : hookPath });
    }
  }

  let commands = null;
  const policyFile = join(info.root, policyPath);
  if (!existsSync(policyFile)) {
    items.push({ id: "policy", status: "FAIL", detail: `${policyPath} is missing — without a "verification" block the verifier runs its default seven checks against guessed commands` });
  } else {
    try {
      const policy = JSON.parse(readFileSync(policyFile, "utf8"));
      const verification = policy && typeof policy === "object" ? policy.verification : null;
      if (!verification || typeof verification !== "object" || Array.isArray(verification)) {
        items.push({ id: "policy", status: "FAIL", detail: `${policyPath} has no "verification" block — add required_checks and commands` });
      } else if (!verification.commands || typeof verification.commands !== "object") {
        items.push({ id: "policy", status: "FAIL", detail: `${policyPath} verification block has no "commands" map` });
      } else {
        commands = verification.commands;
        const required = Array.isArray(verification.required_checks) ? verification.required_checks : [];
        items.push({ id: "policy", status: "PASS", detail: `${policyPath}: ${required.length} required checks, ${Object.keys(commands).length} commands` });
      }
    } catch (error) {
      items.push({ id: "policy", status: "FAIL", detail: `${policyPath} is not valid JSON: ${error.message}` });
    }
  }

  const prefixes = new Set([info.root]);
  if (commands) {
    for (const [id, argv] of Object.entries(commands)) {
      const resolved = resolveCommand(info.root, argv);
      items.push({ id: `command:${id}`, status: resolved.ok ? "PASS" : "FAIL", detail: resolved.detail });
      if (Array.isArray(argv)) {
        for (let index = 0; index < argv.length; index += 1) {
          if (argv[index] === "--prefix" && argv[index + 1]) prefixes.add(resolve(info.root, argv[index + 1]));
          else if (typeof argv[index] === "string" && argv[index].startsWith("--prefix=")) prefixes.add(resolve(info.root, argv[index].slice("--prefix=".length)));
        }
      }
    }
  }
  for (const directory of prefixes) {
    const item = nodeModulesItem(info.root, directory);
    if (item) items.push(item);
  }
  return items;
}

function printDoctor(info, items) {
  const failed = items.filter((item) => item.status === "FAIL").length;
  const lines = [`opchain doctor — ${info.root}`];
  for (const item of items) lines.push(`${item.status.padEnd(4)}  ${item.id}: ${item.detail}`);
  lines.push(failed
    ? `opchain doctor: FAIL (${failed} of ${items.length} checks failed — the gate will not run as configured)`
    : `opchain doctor: PASS (${items.length} checks)`);
  process.stdout.write(`${lines.join("\n")}\n`);
  return failed ? 1 : 0;
}

// ---------------------------------------------------------------------------
// --ci and --claude-md: the consumer-repository boundary checks that opchain's
// own repository already had (audit I-01). Templates ship with the plugin.
// ---------------------------------------------------------------------------

function templatesDirectory() {
  for (const candidate of [join(SCRIPT_DIR, "..", "templates"), join(SCRIPT_DIR, "..", "plugins", "opchain", "templates")]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error("packaged templates are missing (expected plugins/opchain/templates next to this installer)");
}

function readTemplate(name) {
  const file = join(templatesDirectory(), name);
  if (!existsSync(file)) throw new Error(`packaged template is missing: ${file}`);
  return readFileSync(file, "utf8");
}

// What the consumer's CI needs to run the gate without the plugin: the
// verifier and receipt library (always packaged) and the evidence gate with
// its checkpoint contract (packaged only from the authoring repository today).
const VENDORED_FILES = Object.freeze([
  { source: "verify-candidate.mjs", target: "scripts/verify-candidate.mjs", required: true },
  { source: join("lib", "verification-receipt.cjs"), target: "scripts/lib/verification-receipt.cjs", required: true },
  { source: join("lib", "bypass-record.cjs"), target: "scripts/lib/bypass-record.cjs", required: false },
  { source: join("lib", "release-evidence.mjs"), target: "scripts/lib/release-evidence.mjs", required: false },
  { source: join("..", "src", "lib", "mcp", "checkpoint-contract.js"), target: "src/lib/mcp/checkpoint-contract.js", required: false },
]);

export function vendorRuntime(root) {
  const target = join(root, VENDORED_RUNTIME_DIR);
  const written = [];
  const missing = [];
  for (const file of VENDORED_FILES) {
    const source = join(SCRIPT_DIR, file.source);
    if (!existsSync(source)) {
      if (file.required) throw new Error(`packaged runtime is incomplete: missing ${source}`);
      missing.push(file.target);
      continue;
    }
    const destination = join(target, file.target);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(source, destination);
    written.push(join(VENDORED_RUNTIME_DIR, file.target));
  }
  // checkpoint-contract.js is an ES module with a .js extension; the nearest
  // package.json decides how Node loads it, so the vendored tree carries one.
  const manifest = join(target, "package.json");
  writeFileSync(manifest, `${JSON.stringify({ name: "opchain-vendored-runtime", private: true, type: "module" }, null, 2)}\n`);
  written.push(join(VENDORED_RUNTIME_DIR, "package.json"));
  return { written, missing };
}

export function installCiWorkflow(root, { force = false } = {}) {
  const template = readTemplate("opchain-evidence.yml");
  const vendored = vendorRuntime(root);
  const workflow = join(root, CI_WORKFLOW_PATH);
  if (existsSync(workflow) && !force) {
    const current = readFileSync(workflow, "utf8");
    if (current !== template) {
      return { written: vendored.written, missing: vendored.missing, workflow: CI_WORKFLOW_PATH, blocked: true };
    }
    return { written: vendored.written, missing: vendored.missing, workflow: CI_WORKFLOW_PATH, changed: false };
  }
  mkdirSync(dirname(workflow), { recursive: true });
  writeFileSync(workflow, template);
  return { written: [...vendored.written, CI_WORKFLOW_PATH], missing: vendored.missing, workflow: CI_WORKFLOW_PATH, changed: true };
}

export function installClaudeMd(root) {
  const template = readTemplate("CLAUDE.opchain.md").trimEnd();
  if (!template.includes(CLAUDE_MD_START) || !template.includes(CLAUDE_MD_END)) {
    throw new Error("CLAUDE.opchain.md template must carry the managed-section markers");
  }
  const file = join(root, "CLAUDE.md");
  const existing = existsSync(file) ? readFileSync(file, "utf8") : "";
  let next;
  let action;
  const start = existing.indexOf(CLAUDE_MD_START);
  const end = existing.indexOf(CLAUDE_MD_END);
  if (start !== -1 && end !== -1 && end > start) {
    next = `${existing.slice(0, start)}${template}${existing.slice(end + CLAUDE_MD_END.length)}`;
    action = next === existing ? "unchanged" : "updated";
  } else if (existing.trim()) {
    next = `${existing.trimEnd()}\n\n${template}\n`;
    action = "appended";
  } else {
    next = `${template}\n`;
    action = "created";
  }
  if (action !== "unchanged") writeFileSync(file, next);
  return { path: file, action };
}

// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { repo: process.cwd(), enroll: false, doctor: false, ci: false, force: false, claudeMd: false, hook: null, remote: null, policy: ".bugcheck.json" };
  const rest = [...argv];
  while (rest.length) {
    const flag = rest.shift();
    if (flag === "--enroll") args.enroll = true;
    else if (flag === "--repo") args.repo = rest.shift();
    else if (flag === "--doctor") args.doctor = true;
    else if (flag === "--ci") { args.ci = true; args.enroll = true; }
    else if (flag === "--force") args.force = true;
    else if (flag === "--claude-md") args.claudeMd = true;
    else if (flag === "--hook") args.hook = rest.shift();
    else if (flag === "--remote") args.remote = rest.shift();
    else if (flag === "--policy") args.policy = rest.shift();
    else throw new Error(`unknown argument: ${flag}`);
  }
  if (!args.repo) throw new Error("--repo requires a value");
  if (args.hook && !["post-commit", "pre-push"].includes(args.hook)) throw new Error(`--hook must be post-commit or pre-push, not ${args.hook}`);
  if (args.hook && (args.enroll || args.doctor || args.ci || args.claudeMd)) throw new Error("--hook cannot be combined with install modes");
  if (args.doctor && (args.enroll || args.ci)) throw new Error("--doctor installs nothing; run it on its own");
  return args;
}

function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
    if (args.hook === "post-commit") return hookPostCommit(args);
    if (args.hook === "pre-push") return hookPrePush(args);
    if (process.env.OPCHAIN_SKIP_GIT_DRIVERS === "1") {
      if (args.enroll) throw new Error("OPCHAIN_SKIP_GIT_DRIVERS=1 prevents explicit enrollment");
      if (args.doctor || args.claudeMd) throw new Error("OPCHAIN_SKIP_GIT_DRIVERS=1 is set; unset it to run this mode");
      return 0;
    }
    const info = repositoryInfo(args.repo);
    if (!info) {
      if (args.enroll || args.doctor || args.claudeMd) throw new Error("this mode requires a Git working tree");
      return 0;
    }
    if (args.doctor) return printDoctor(info, doctor(info, { policyPath: args.policy }));
    if (args.claudeMd) {
      const outcome = installClaudeMd(info.root);
      process.stdout.write(`opchain: CLAUDE.md opchain section ${outcome.action} (${outcome.path})\n`);
      if (!args.enroll) return 0;
    }
    const required = args.enroll || isEnrolled(info.root);
    if (isAuthoringRepository(info.root)) {
      installMergeDrivers(info.root);
      installAuthoringMarker(info.commonDir);
    }
    const runtime = installVerifierRuntime(info.root);
    const hooks = installManagedHooks(info.root, { required });
    const foreign = hooks.filter((hook) => !hook.installed && hook.reason === "foreign-hook");
    if (foreign.length && required) return 1;
    if (args.enroll) mkdirSync(join(info.root, ".opchain"), { recursive: true });
    if (args.enroll) {
      process.stdout.write(
        `opchain: enrolled Git commit boundary at ${hooks[0].path}\n` +
          `opchain: bypass record ${hooks[1].path}\n` +
          `opchain: push guard ${hooks[2].path}\n` +
          `opchain: verifier runtime ${runtime.root}\n`,
      );
    }
    if (args.ci) {
      const outcome = installCiWorkflow(info.root, { force: args.force });
      for (const file of outcome.written) process.stdout.write(`opchain: wrote ${file}\n`);
      if (outcome.missing.length) {
        process.stderr.write(
          `opchain: NOTICE — this package does not carry ${outcome.missing.join(", ")}; ` +
            "the workflow's evidence step will fail until the vendored runtime is refreshed from a package that does.\n",
        );
      }
      if (outcome.blocked) {
        process.stderr.write(`opchain: REFUSED — ${CI_WORKFLOW_PATH} already exists and differs from the template; pass --force to overwrite it.\n`);
        return 1;
      }
      if (outcome.changed === false) process.stdout.write(`opchain: ${CI_WORKFLOW_PATH} already matches the template\n`);
      process.stdout.write(`opchain: commit ${VENDORED_RUNTIME_DIR}/ and ${CI_WORKFLOW_PATH} so every pull request runs the gate.\n`);
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
