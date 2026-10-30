// `ow-tools scan-secrets <repo>` (design §5.5, 1.3.0): gitleaks over the text
// files of a repository's committed history (every ref and HEAD, two-parent
// merges included), in redacted form only. A row is a path, a commit, a line
// and a rule id; the matched text is never read by ow-tools, written or shown
// (a path is shown as it is, so a secret in a file or folder name is). CLEAN
// and HITS both exit 0; anything that stops the scan is NOT-CHECKED (exit 2 to
// 5, or 128+n on a signal) and says so. What is not read is listed in §16.3.
//
// gitleaks never runs on the repository in place: a private bare repository
// in a 0700 temp folder borrows its objects (alternates, nothing copied) and
// copies its refs (`git show-ref --head`) under names of its own, so the
// repository's own .gitleaks.toml and .gitleaksignore, its git config
// (textconv and external diff drivers, fsmonitor, pager, signature programs,
// colour, hidden refs, a lazy-fetch remote), its hooks and its attributes are
// never used by the scan. gitleaks' own built-in allowlist still applies (it
// skips some paths, such as dependency folders, lock files and binary formats:
// owner decision OD-1). Replace refs, commit-graph and multi-pack-index files
// are switched off, git runs with every transport refused, and a wrapper
// records the exit status of each git command gitleaks runs, because gitleaks
// reports "no leaks" when git fails part-way (design §16).
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, closeSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, readSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { EXIT, OwError, PLUGIN_ROOT, semverAtLeast, which } from "./core.mjs";

export const GITLEAKS_MIN = "8.19.0"; // `gitleaks git` and template reports
export const GIT_MIN = "2.45.1"; // GIT_NO_LAZY_FETCH, and the 2024 local-repository fixes
export const DEFAULT_TIMEOUT = 110; // seconds: inside Claude Code's two-minute Bash limit
export const MAX_TIMEOUT = 590;
// gitleaks' exit code when it found something. Not 0 (design §5.5's first
// draft): a distinct code lets ow-tools check the report against it.
export const LEAKS_EXIT = 42;
// gitleaks' own default log options (--full-history --all), with type changes
// kept (`uxdb`, not gitleaks' `tuxdb`: a file that replaced a symlink is a
// type change, SS-01), merges shown as what the merge changed beyond git's own
// merge (remerge), and no external diff, textconv or colour.
export const LOG_OPTS = ["--full-history", "--all", "--diff-filter=uxdb", "--diff-merges=remerge", "--no-ext-diff", "--no-textconv", "--no-color"];
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"; // resolves to nothing in a sha256 repository: also empty
// Command-line config for every git ow-tools starts (and gitleaks' git): it
// outranks any repository or included config file.
export const GIT_CONFIG = [
  ["core.fsmonitor", "false"],
  ["core.hooksPath", "/dev/null"],
  ["core.pager", "cat"],
  ["core.attributesFile", "/dev/null"],
  ["core.useReplaceRefs", "false"],
  ["core.commitGraph", "false"],
  ["core.multiPackIndex", "false"],
  ["core.bigFileThreshold", "512m"],
  ["attr.tree", EMPTY_TREE],
  ["diff.noprefix", "false"],
  ["diff.mnemonicPrefix", "false"],
  ["diff.relative", "false"],
  ["color.ui", "never"],
  ["color.diff", "never"],
  ["log.showSignature", "false"],
  ["log.abbrevCommit", "false"],
  ["log.mailmap", "false"],
  ["gpg.program", "false"],
  ["gpg.ssh.program", "false"],
  ["gpg.x509.program", "false"],
  ["protocol.allow", "never"],
  ["transfer.bundleURI", "false"],
];
// gitleaks' built-in rules and nothing else.
export const GITLEAKS_CONFIG = '# ow-tools scan-secrets: the built-in rules only; a repository\'s own config is never read\ntitle = "ow-tools scan-secrets"\n\n[extend]\nuseDefault = true\n';
// The shipped template, read by real path from the plugin folder and checked
// against this text: path and rule quoted (Go %q), commit, line. Nothing else.
export const REPORT_TEMPLATE = '{{range .}}{{printf "%q\\t%s\\t%d\\t%q\\n" .File .Commit .StartLine .RuleID}}{{end -}}\n';
export const TEMPLATE_FILE = join(PLUGIN_ROOT, "templates", "scan-secrets.tmpl");
// One report row. The path may hold printable characters, spaces and the two
// escapes \" and \\; any other escape (a control, format or invalid
// character) fails the row, and so the scan. Rule ids are gitleaks' own
// (all 222 built-in ids in 8.30.1 are lowercase letters, digits and hyphens).
const ROW = /^"((?:[^"\\\p{C}\p{Z}]|[ ]|\\["\\])+)"\t([0-9a-f]{40}|[0-9a-f]{64})\t(0|[1-9][0-9]{0,8})\t"([a-z0-9][a-z0-9-]{0,99})"$/u;
const MAX_PATH = 1024;
const MAX_REPORT = 32 * 1024 * 1024;
const MAX_REFS = 64 * 1024 * 1024;
export const PRIVATE_PREFIX = "ow-tools-scan-";
const PRIVATE_NAME = new RegExp(`^${PRIVATE_PREFIX}[A-Za-z0-9]{6}$`); // mkdtemp's six characters
const OWNER = "owner.pid";
const NOT_SCANNED = "this repository has not been scanned for committed secrets";
// The flags ow-tools relies on, split by what their absence means.
const REDACTION_FLAGS = ["--redact", "--report-format", "--report-template", "--report-path"];
const ISOLATION_FLAGS = ["--config", "--gitleaks-ignore-path", "--ignore-gitleaks-allow", "--log-opts", "--exit-code", "--no-banner"];

// Every scan-secrets failure is NOT-CHECKED, whatever its exit code.
const notChecked = (code, msg, extra = {}) => new OwError(code, `NOT-CHECKED: ${NOT_SCANNED}: ${msg}`, { result: "NOT-CHECKED", ...extra });
const refusal = (reason, msg, extra) => notChecked(EXIT.REFUSED, msg, { reason, ...extra });
const scanFail = (reason, msg) => notChecked(EXIT.FAILED, msg, { reason });

// ---- requirements and the scanner gate -------------------------------------

const probeEnv = () => ({ PATH: "/usr/bin:/bin", LC_ALL: "C", HOME: tmpdir(), GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" });
// A probe that doesn't answer in time is a busy machine, not a missing
// program: NOT-CHECKED with `timeout`, never "needs gitleaks".
// Tests shorten it with OW_TOOLS_PROBE_TIMEOUT_MS (as OW_TOOLS_NOW pins the clock).
const PROBE_TIMEOUT = 30_000;
function probe(cmd, args) {
  const ms = Number(process.env.OW_TOOLS_PROBE_TIMEOUT_MS) || PROBE_TIMEOUT;
  const r = spawnSync(cmd, args, { encoding: "utf8", env: probeEnv(), cwd: tmpdir(), timeout: ms, maxBuffer: 1 << 20, stdio: ["ignore", "pipe", "pipe"] });
  if (r.error?.code === "ETIMEDOUT") throw scanFail("timeout", `${cmd.split("/").pop()} did not answer its ${args.join(" ")} check within ${Math.round(ms / 1000)} s (the machine may be busy); run again`);
  return { status: r.status, text: `${r.stdout || ""}\n${r.stderr || ""}` };
}

const realOr = (p) => {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
};
// A folder's identity: its device and inode, not its spelling (RC-01). On a
// case-insensitive volume `Client/repo` and `client/repo` are one folder, and
// macOS reaches the same folder through `/System/Volumes/Data/...`; the
// device and inode are the same through every spelling.
const identity = (p) => {
  try {
    const s = statSync(p);
    return `${s.dev}:${s.ino}`;
  } catch {
    return null;
  }
};
const identities = (paths) => new Set(paths.map(identity).filter(Boolean));
// Is `p`, or any folder above it (after following symlinks), one of `ids`?
function withinAny(p, ids) {
  if (!ids.size) return false;
  for (let cur = realOr(p); ; cur = dirname(cur)) {
    if (ids.has(identity(cur))) return true;
    if (dirname(cur) === cur) return false;
  }
}
// The repository the current folder is in (the nearest folder at or above it
// holding a .git), for doctor and version --json, which have no repository
// argument (RC-03).
export function cwdRepo(cwd = process.cwd()) {
  for (let cur = realOr(cwd); ; cur = dirname(cur)) {
    if (present(join(cur, ".git"))) return cur;
    if (dirname(cur) === cur) return null;
  }
}
// The first match on PATH among its absolute folders only: a relative entry
// (".", "bin", an empty one) resolves against the current folder, which may
// be the repository being scanned. Folders inside any of `skip` (the
// repository being scanned, compared by identity) are passed over too
// (SS-05, RC-01): a direnv `PATH_add bin`, an activated .venv or
// node_modules/.bin would otherwise put the repository's own programs first.
export function findOnPath(cmd, env = process.env, skip = []) {
  const ids = identities(skip);
  const dirs = String(env.PATH || "")
    .split(delimiter)
    .filter((d) => isAbsolute(d) && !withinAny(d, ids));
  return which(cmd, { ...env, PATH: dirs.join(delimiter) });
}

export function versions(env = process.env, skip = []) {
  const git = findOnPath("git", env, skip);
  const gitleaks = findOnPath("gitleaks", env, skip);
  // A program reached through a symlink into the repository is the
  // repository's own: never run, not even for its version (scanner-untrusted).
  const ids = identities(skip);
  for (const [name, p] of [["gitleaks", gitleaks], ["git", git]]) {
    if (p && withinAny(p, ids)) throw refusal("scanner-untrusted", `the ${name} found on PATH is a link into the repository being scanned; ow-tools never runs a program from that repository. Put an installed ${name} first on PATH`);
  }
  const gitVersion = git ? probe(git, ["--version"]).text.match(/git version (\d+\.\d+\.\d+)/)?.[1] || null : null;
  const gitleaksVersion = gitleaks ? probe(gitleaks, ["version"]).text.match(/(\d+\.\d+\.\d+)/)?.[1] || null : null;
  return { git, gitVersion, gitleaks, gitleaksVersion };
}

function requirements(env, skip) {
  const v = versions(env, skip);
  const miss = [];
  if (!v.gitleaks || !v.gitleaksVersion || !semverAtLeast(v.gitleaksVersion, GITLEAKS_MIN)) miss.push(`gitleaks ${GITLEAKS_MIN.replace(/\.0$/, "")} or newer${v.gitleaksVersion ? ` (found ${v.gitleaksVersion})` : ""}`);
  if (!v.git || !v.gitVersion || !semverAtLeast(v.gitVersion, GIT_MIN)) miss.push(`git ${GIT_MIN} or newer${v.gitVersion ? ` (found ${v.gitVersion})` : ""}`);
  if (miss.length) throw notChecked(EXIT.MISSING, `scan-secrets needs ${miss.join(" and ")}. Run ow-tools doctor for the install line.`, { missing: miss });
  return v;
}

// A gitleaks that can't keep the scan redacted, or can't be kept off the
// repository's own allowlists, is never run (design §5.5).
export function scannerGate(gitleaks) {
  const help = probe(gitleaks, ["git", "--help"]).text;
  const has = (f) => new RegExp(`(^|[\\s,])${f}(?![a-z-])`, "m").test(help);
  const noRedact = REDACTION_FLAGS.filter((f) => !has(f));
  if (noRedact.length) throw refusal("scanner-cannot-redact", `this gitleaks has no ${noRedact.join(", ")}, so its output could not be kept to path, commit, line and rule; it was not run`);
  const noIsolation = ISOLATION_FLAGS.filter((f) => !has(f));
  if (noIsolation.length) throw refusal("scanner-unsupported", `this gitleaks has no ${noIsolation.join(", ")}, so the repository's own allowlists could not be kept out; it was not run`);
}

// By real path, inside the plugin folder, a regular file, and exactly the
// template the row pattern reads: never a file from the repository or the
// current folder.
export function readTemplate(path = TEMPLATE_FILE) {
  let real;
  let text;
  try {
    const root = realpathSync(PLUGIN_ROOT);
    real = realpathSync(path);
    if (!real.startsWith(root + sep) || !lstatSync(path).isFile()) real = null;
    else text = readFileSync(real, "utf8");
  } catch {
    real = null;
  }
  if (!real) throw scanFail("scan-failed", "the report template is missing from the ow-tools folder, or is not a plain file there; reinstall ow-tools");
  if (text !== REPORT_TEMPLATE) throw scanFail("scan-failed", "the report template in the ow-tools folder has been changed; reinstall ow-tools");
  return text;
}

// ---- the repository ----------------------------------------------------------

const CONTROL = /[\u0000-\u001f\u007f]/;
const inside = (p, root) => p === root || p.startsWith(root + sep);
const isGitDir = (d) => {
  try {
    return statSync(join(d, "HEAD")).isFile() && statSync(join(d, "objects")).isDirectory();
  } catch {
    return false;
  }
};
// The first bytes of a plain file (never a FIFO or a device), or "".
function readStart(path, bytes) {
  try {
    if (!lstatSync(path).isFile()) return "";
    const fd = openSync(path, "r");
    try {
      const buf = Buffer.alloc(bytes);
      return buf.subarray(0, readSync(fd, buf, 0, bytes, 0)).toString("utf8");
    } finally {
      closeSync(fd);
    }
  } catch {
    return "";
  }
}
const present = (p) => {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
};

// A folder holding a git repository of its own: never a parent's, never one
// reached through a symlink or a .git file that points elsewhere, and with
// its full history on this machine.
export function inspectRepo(repo) {
  if (CONTROL.test(repo)) throw refusal("repo-not-contained", "the repository path holds a control character");
  const given = resolve(repo);
  let st;
  try {
    st = lstatSync(given);
  } catch {
    throw refusal("not-a-git-repo", `${repo} does not exist`);
  }
  if (st.isSymbolicLink()) throw refusal("repo-not-contained", `${repo} is a symlink; give the repository folder itself`);
  if (!st.isDirectory()) throw refusal("not-a-git-repo", `${repo} is not a folder`);
  const root = realpathSync(given);
  if (CONTROL.test(root)) throw refusal("repo-not-contained", "the repository path holds a control character");
  const dotgit = join(root, ".git");
  let gitDir;
  let bare = false;
  let dl = null;
  try {
    dl = lstatSync(dotgit);
  } catch {
    /* none: a bare repository, or not a repository */
  }
  if (dl?.isSymbolicLink()) throw refusal("repo-not-contained", `${repo}/.git is a symlink; scan the repository it points to`);
  if (dl?.isFile()) {
    // A gitdir pointer: a linked worktree, a submodule or a separate git
    // folder. git reads it from the first line only (D-2).
    const m = /^gitdir: (.+)$/.exec(readStart(dotgit, 4096).split("\n")[0]);
    let target = null;
    try {
      target = m ? realpathSync(resolve(root, m[1].trim())) : null;
    } catch {
      target = null;
    }
    if (!target || !inside(target, root)) {
      // A submodule's history lives in its superproject's .git/modules/<name> (SS-03f).
      if (target && /[\\/]\.git[\\/]modules[\\/]/.test(target) && isGitDir(target)) throw refusal("repo-not-contained", `${repo} is a submodule: its history is in ${target}, a git folder outside ${repo}. Scan that folder`);
      throw refusal("repo-not-contained", `${repo}/.git points to a git folder outside ${repo} (a linked worktree); scan the repository it belongs to`);
    }
    gitDir = target;
  } else if (dl?.isDirectory()) gitDir = realpathSync(dotgit);
  else if (!dl && isGitDir(root)) {
    gitDir = root;
    bare = true;
  } else throw refusal("not-a-git-repo", `${repo} is not a git repository (no .git folder in it; ow-tools never looks in a parent folder)`);
  if (!isGitDir(gitDir)) throw refusal("not-a-git-repo", `${repo} is not a git repository (its git folder has no HEAD or objects)`);
  if (existsSync(join(gitDir, "commondir"))) throw refusal("repo-not-contained", `${repo} is a linked worktree whose history lives in another repository; scan that repository`);
  // Containment past .git (SS-11): the parts git reads refs and objects from
  // are never symlinks, so nothing outside the folder stands in for them.
  for (const part of ["HEAD", "objects", "refs", "packed-refs"]) {
    let pst = null;
    try {
      pst = lstatSync(join(gitDir, part));
    } catch {
      /* packed-refs is optional */
    }
    if (pst?.isSymbolicLink()) throw refusal("repo-not-contained", `the repository's ${part} is a symlink; ow-tools scans only a git folder whose refs and objects are in it`);
  }
  const objects = realpathSync(join(gitDir, "objects"));
  if (CONTROL.test(objects)) throw refusal("repo-not-contained", "the repository's objects path holds a control character");
  // The full history, or no verdict (design §16): a shallow or partial clone
  // lacks part of it, and gitleaks would call the missing part clean.
  if (present(join(gitDir, "shallow"))) throw refusal("history-incomplete", `${repo} is a shallow clone, so part of its history is not on this machine. Fetch the full history there (git fetch --unshallow), then scan again`);
  if (partialClone(gitDir, objects)) throw partialRefusal(repo);
  const files = {};
  for (const f of [".gitleaks.toml", ".gitleaksignore"]) files[f] = bare ? "no working tree" : present(join(root, f)) ? "present, ignored" : "absent";
  return { root, gitDir, objects, bare, files, submodules: submoduleDirs(join(gitDir, "modules"), relative(root, join(gitDir, "modules")).split(sep).join("/")) };
}

const partialRefusal = (repo) => refusal("history-incomplete", `${repo} is a partial clone, so part of its history is not on this machine. Scan a full clone`);

// git's boolean spellings for "true" (SS-10); a bare key also means true.
const TRUE = /^(true|yes|on|1|)$/i;
function partialClone(gitDir, objects) {
  try {
    if (readdirSync(join(objects, "pack")).some((n) => n.endsWith(".promisor"))) return true;
  } catch {
    /* no pack folder */
  }
  // Read as text, never run. An included file is checked by git itself
  // (partialCloneByGit) once git has been found.
  const text = readStart(join(gitDir, "config"), 1 << 20);
  if (/^\s*partialclone\s*=/im.test(text)) return true;
  return [...text.matchAll(/^\s*promisor\s*(?:=\s*"?([^"\s#;]*)"?)?\s*(?:[#;].*)?$/gim)].some((m) => TRUE.test(m[1] ?? ""));
}

// A label shown to the user or a calling skill: held to the row path's rule
// (printable characters and spaces, at most 1,024), never printed raw (RC-02).
const PRINTABLE = /^(?:[^\p{C}\p{Z}]|[ ])+$/u;
const printable = (s) => PRINTABLE.test(s) && [...s].length <= MAX_PATH;

// The submodule histories a superproject keeps in .git/modules/: not part of
// its own history, so listed as not scanned (SS-03f). A folder name that
// fails the row rule (control characters can forge a line of output) is
// counted, never shown (RC-02).
export function submoduleDirs(modules, label) {
  const found = [];
  const walk = (dir, rel, depth) => {
    let names = [];
    try {
      names = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of names) {
      if (!e.isDirectory() || found.length >= 50) continue;
      const p = join(dir, e.name);
      if (isGitDir(p)) {
        found.push(`${rel}/${e.name}`);
        if (depth < 3) walk(join(p, "modules"), `${rel}/${e.name}/modules`, depth + 1);
      } else if (depth < 3) walk(p, `${rel}/${e.name}`, depth + 1); // a submodule named a/b
    }
  };
  walk(modules, label, 0);
  const shown = found.filter(printable).map((path) => ({ path, why: "a submodule's history: scan that folder on its own" }));
  const hidden = found.length - shown.length;
  if (hidden) shown.push({ path: printable(label) ? label : ".git/modules", why: `${hidden} submodule folder(s) with a name that can't be shown (control or format characters): list that folder yourself, and scan each on its own` });
  return shown;
}

// ---- the private folder --------------------------------------------------------

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

// A run killed outright (SIGKILL) leaves its folder; the next run removes it
// once its owner is gone. Only this user's folders, never through a symlink.
export function sweepStale(dir = tmpdir()) {
  const removed = [];
  let names = [];
  try {
    names = readdirSync(dir);
  } catch {
    return removed;
  }
  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  for (const name of names) {
    if (!PRIVATE_NAME.test(name)) continue;
    const p = join(dir, name);
    let st;
    try {
      st = lstatSync(p);
    } catch {
      continue;
    }
    if (!st.isDirectory() || (uid !== null && st.uid !== uid)) continue;
    let pid = null;
    try {
      if (lstatSync(join(p, OWNER)).isFile()) pid = Number.parseInt(readFileSync(join(p, OWNER), "utf8"), 10) || null;
    } catch {
      pid = null;
    }
    if (pid && pidAlive(pid)) continue;
    if (!pid && Date.now() - st.mtimeMs < 10 * 60_000) continue; // a run that is only starting
    rmSync(p, { recursive: true, force: true });
    removed.push(name);
  }
  return removed;
}

// The environment of every git and gitleaks ow-tools starts: built from
// nothing, so no GITLEAKS_*, GIT_DIR, GIT_* trace or config variable of the
// user's reaches them.
export function gitEnv(priv, extra = {}) {
  const env = {
    PATH: "/usr/bin:/bin",
    HOME: join(priv, "home"),
    TMPDIR: join(priv, "tmp"),
    LC_ALL: "C",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_ATTR_NOSYSTEM: "1",
    GIT_NO_REPLACE_OBJECTS: "1",
    GIT_NO_LAZY_FETCH: "1",
    GIT_TERMINAL_PROMPT: "0",
    GIT_PROTOCOL_FROM_USER: "0",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_TEMPLATE_DIR: join(priv, "empty"),
    GIT_CEILING_DIRECTORIES: priv,
    GIT_CONFIG_COUNT: String(GIT_CONFIG.length),
  };
  GIT_CONFIG.forEach(([k, v], i) => {
    env[`GIT_CONFIG_KEY_${i}`] = k;
    env[`GIT_CONFIG_VALUE_${i}`] = v;
  });
  return { ...env, ...extra };
}

const shq = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;

// gitleaks reports "no leaks" when the git it runs fails part-way (a missing
// object, a killed process): this wrapper, first on its PATH, records each
// git command's exit status so ow-tools can tell.
// git's error output goes to a file in the private folder, read by ow-tools
// only to tell a missing object (history-incomplete) from any other failure,
// never shown, and removed with the folder.
function gitWrapper(git, statusFile, errFile) {
  return `#!/bin/sh\n# ow-tools scan-secrets: runs git and records its exit status\n${shq(git)} "$@" 2>> ${shq(errFile)}\nrc=$?\nprintf '%s %s\\n' "$rc" "$*" >> ${shq(statusFile)}\nexit $rc\n`;
}

function killGroup(child) {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {
      /* gone */
    }
  }
}

// Children run in their own process group, so a timeout or a signal stops
// gitleaks and the git under it together.
class Runner {
  constructor(deadline) {
    this.deadline = deadline;
    this.child = null;
    this.timedOut = false;
  }

  exec(cmd, args, { env, cwd, input = null, capture = false }) {
    return new Promise((done) => {
      const left = this.deadline - Date.now();
      if (left <= 0) {
        this.timedOut = true;
        done({ code: null, signal: "SIGKILL", stdout: "", stderr: "" });
        return;
      }
      let child;
      try {
        child = spawn(cmd, args, { env, cwd, detached: true, stdio: [input === null ? "ignore" : "pipe", capture ? "pipe" : "ignore", capture ? "pipe" : "ignore"] });
      } catch (error) {
        done({ code: null, error, stdout: "", stderr: "" });
        return;
      }
      this.child = child;
      const out = [];
      const err = [];
      let outLen = 0;
      let errLen = 0;
      let overflow = false;
      if (capture) {
        child.stdout.on("data", (b) => {
          outLen += b.length;
          if (outLen > MAX_REFS) {
            overflow = true;
            killGroup(child);
          } else out.push(b);
        });
        child.stderr.on("data", (b) => {
          if (errLen < 65_536) err.push(b);
          errLen += b.length;
        });
      }
      if (input !== null) {
        child.stdin.on("error", () => {});
        child.stdin.end(input);
      }
      const timer = setTimeout(() => {
        this.timedOut = true;
        killGroup(child);
      }, left);
      let settled = false;
      const finish = (r) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.child = null;
        done(r);
      };
      child.on("error", (error) => finish({ code: null, error, stdout: "", stderr: "" }));
      child.on("close", (code, signal) => finish({ code, signal, overflow, stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8") }));
    });
  }

  stop() {
    if (this.child) killGroup(this.child);
  }
}

// ---- the mirror and the scan ----------------------------------------------------

const REF_LINE = /^([0-9a-f]{40}|[0-9a-f]{64}) (HEAD|refs\/\S+)$/;

// git's stderr is read only to name the cause; it is never shown.
const MISSING_OBJECT = /nonexistent object|bad object|unable to read|missing (blob|tree|commit)|not a valid object|could not read|did not receive expected object|promisor/i;
const incomplete = (repo) => refusal("history-incomplete", `git could not read every object ${repo}'s history needs, so part of it is not on this machine (a partial clone, or a damaged repository: git fsck there says which)`);
function gitTrouble(r, repo, what) {
  if (r.error) return scanFail("scan-failed", `git could not be started to ${what}`);
  if (/dubious ownership/i.test(r.stderr)) return refusal("repo-not-owned", `${repo} belongs to another user; git refuses to read it, and ow-tools never widens git's safe.directory. Scan a copy you own`);
  if (MISSING_OBJECT.test(r.stderr)) return incomplete(repo);
  return scanFail("scan-failed", `git could not ${what} (exit ${r.code ?? r.signal})`);
}

async function buildMirror(runner, src, priv, git, repo) {
  const srcEnv = gitEnv(priv, { GIT_CEILING_DIRECTORIES: dirname(src.root) });
  const cwd = join(priv, "empty");
  // A partial clone named in an included config file, or with promisor = 1
  // (SS-10): git reads its own config, includes and boolean spellings.
  // `git config` runs nothing the config names.
  const pc = await runner.exec(git, ["-C", src.root, "config", "--get-regexp", "^(extensions\\.partialclone|remote\\..*\\.promisor)$"], { env: srcEnv, cwd, capture: true });
  if (runner.timedOut) return null;
  if (pc.code === 0) {
    for (const l of pc.stdout.split("\n").filter(Boolean)) {
      const [key, ...value] = l.split(" ");
      if (key === "extensions.partialclone" || (key.endsWith(".promisor") && TRUE.test(value.join(" ")))) throw partialRefusal(repo);
    }
  } else if (pc.code !== 1) throw gitTrouble(pc, repo, `read ${repo}'s config`);
  const refs = await runner.exec(git, ["-C", src.root, "show-ref", "--head"], { env: srcEnv, cwd, capture: true });
  if (runner.timedOut) return null;
  if (refs.overflow) throw scanFail("scan-failed", `${repo} has more refs than ow-tools reads (64 MB of ref names)`);
  if (refs.code === 1 && !refs.stdout.trim() && !refs.stderr.trim()) return { refs: 0 }; // no refs at all
  if (refs.code !== 0) throw gitTrouble(refs, repo, `list ${repo}'s refs`);
  const lines = refs.stdout.split("\n").filter(Boolean);
  const parsed = lines.map((l) => REF_LINE.exec(l));
  if (parsed.some((m) => !m) || new Set(parsed.map((m) => m[1].length)).size !== 1) throw scanFail("scan-failed", `git listed ${repo}'s refs in a form ow-tools does not read`);
  const format = parsed[0][1].length === 64 ? "sha256" : "sha1";
  const mirror = join(priv, "history.git");
  const init = await runner.exec(git, ["init", "--quiet", "--bare", `--object-format=${format}`, `--template=${join(priv, "empty")}`, mirror], { env: gitEnv(priv), cwd: join(priv, "empty"), capture: true });
  if (runner.timedOut) return null;
  if (init.code !== 0) throw gitTrouble(init, repo, "make the private copy of the refs");
  mkdirSync(join(mirror, "objects", "info"), { recursive: true });
  writeFileSync(join(mirror, "objects", "info", "alternates"), `${src.objects}\n`, { mode: 0o600 });
  // The refs in one transaction, then HEAD on its own (detached at the
  // repository's HEAD commit): git refuses HEAD and its referent together.
  // Each ref is copied as refs/ow/<n> (SS-09): `--all` needs no names, two
  // names that differ only in case (or a name and a folder of it) can't
  // collide on a case-insensitive volume, and no branch name, which can
  // itself hold a secret, is written in the private folder.
  const named = parsed.filter((m) => m[2] !== "HEAD");
  const head = parsed.find((m) => m[2] === "HEAD");
  if (named.length) {
    const input = `${named.map((m, i) => `update refs/ow/${i + 1} ${m[1]}`).join("\n")}\n`;
    const up = await runner.exec(git, [`--git-dir=${mirror}`, "update-ref", "--stdin"], { env: gitEnv(priv), cwd: join(priv, "empty"), input, capture: true });
    if (runner.timedOut) return null;
    if (up.code !== 0) throw gitTrouble(up, repo, "copy the refs");
  }
  if (head) {
    const up = await runner.exec(git, [`--git-dir=${mirror}`, "update-ref", "--no-deref", "HEAD", head[1]], { env: gitEnv(priv), cwd: join(priv, "empty"), capture: true });
    if (runner.timedOut) return null;
    if (up.code !== 0) throw gitTrouble(up, repo, "copy HEAD");
  }
  // Nothing the repository holds can put a gitleaks file where gitleaks looks.
  for (const f of [".gitleaks.toml", ".gitleaksignore"]) if (present(join(mirror, f))) throw scanFail("scan-failed", `the private copy unexpectedly holds ${f}`);
  return { mirror, refs: parsed.length };
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// Every row matches ROW, or the report is deleted unread and the scan is
// NOT-CHECKED: nothing from a row that fails is shown.
export function parseReport(text) {
  const body = text.endsWith("\n") ? text.slice(0, -1) : text;
  if (!body) return [];
  const rows = [];
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = ROW.exec(lines[i]);
    const path = m ? m[1].replace(/\\(["\\])/g, "$1") : null;
    if (!m || [...path].length > MAX_PATH || path.startsWith("/") || path.split("/").some((s) => s === "" || s === "." || s === "..")) return { invalid: i + 1 };
    rows.push({ path, commit: m[2], line: Number(m[3]), rule: m[4] });
  }
  const seen = new Set();
  return rows
    .filter((r) => {
      const k = JSON.stringify(r);
      return seen.has(k) ? false : seen.add(k);
    })
    // By code unit, never the machine's locale (D-1), so every machine prints one order.
    .sort((a, b) => cmp(a.path, b.path) || cmp(a.commit, b.commit) || a.line - b.line || cmp(a.rule, b.rule));
}

function readStatus(file) {
  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return { logs: 0, failed: null };
  }
  let logs = 0;
  let failed = null;
  for (const line of text.split("\n").filter(Boolean)) {
    const m = /^(\d+) (.*)$/.exec(line);
    if (!m || !/(^| )log -p( |$)/.test(m[2])) continue;
    logs++;
    if (m[1] !== "0" && failed === null) failed = Number(m[1]);
  }
  return { logs, failed };
}

const SCANNED = "the text files of the committed history: every ref and HEAD, two-parent merges included; the working tree was not scanned";
// What the scan does not read, said in every result (owner decisions OD-1 and
// OD-2; design §16.3 has the full list).
const NOT_READ = [
  "binary-looking files (a NUL byte, UTF-16 text) and commit and tag messages",
  "paths gitleaks' built-in allowlist skips (dependency folders such as node_modules/, lock files, binary and office formats, any path containing gitleaks.toml)",
  "octopus merges' own changes, older stash entries, refs that point at a blob or tree, ORIG_HEAD and FETCH_HEAD, reflogs and submodule histories",
];
const IGNORED = [
  "the repository's .gitleaks.toml and .gitleaksignore",
  "inline gitleaks:allow comments",
  "GITLEAKS_* environment variables",
  "the repository's git config, hooks, attributes, hidden refs and replace refs",
];

// Any error that isn't one of the stated outcomes is still NOT-CHECKED, and
// its message (which could name anything) is not passed on.
export async function scanSecrets(opts = {}, deps = {}) {
  try {
    return await scan(opts, deps);
  } catch (err) {
    if (err instanceof OwError) throw err;
    throw scanFail("scan-failed", "an internal error stopped the scan");
  }
}

async function scan({ repo, timeout } = {}, deps = {}) {
  const env = deps.env || process.env;
  if (!repo) throw notChecked(EXIT.USAGE, "scan-secrets needs the repository folder: ow-tools scan-secrets <repo> [--json]");
  const seconds = timeout ?? DEFAULT_TIMEOUT;
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > MAX_TIMEOUT) throw notChecked(EXIT.USAGE, `--timeout must be a whole number of seconds from 1 to ${MAX_TIMEOUT}`);
  // The repository first (SS-05): no program is looked up, let alone run for
  // its version, before ow-tools knows which folders are the repository's.
  const src = inspectRepo(repo);
  const tools = requirements(env, [src.root, src.gitDir]);
  scannerGate(tools.gitleaks);
  const template = readTemplate(deps.template);
  sweepStale();

  const priv = mkdtempSync(join(tmpdir(), PRIVATE_PREFIX)); // 0700
  const runner = new Runner(Date.now() + seconds * 1000);
  let oldMask = null;
  try {
    oldMask = process.umask(0o077); // what gitleaks and git create in the folder is theirs alone
  } catch {
    /* a worker thread: the folder itself is 0700 */
  }
  const cleanup = () => rmSync(priv, { recursive: true, force: true });
  const SIGNAL_CODES = { SIGHUP: 1, SIGINT: 2, SIGQUIT: 3, SIGTERM: 15 };
  // An interrupt or a kill signal stops gitleaks and the git under it, and
  // removes the private folder (report included) before ow-tools exits.
  const onSignal = (sig) => {
    runner.stop();
    cleanup();
    process.exit(128 + SIGNAL_CODES[sig]);
  };
  const onCrash = () => {
    runner.stop();
    cleanup();
    process.stderr.write(`ow-tools: internal error; scan-secrets stopped. NOT-CHECKED: ${NOT_SCANNED}\n`);
    process.exit(EXIT.FAILED);
  };
  for (const sig of Object.keys(SIGNAL_CODES)) process.on(sig, onSignal);
  process.on("uncaughtException", onCrash);
  try {
    writeFileSync(join(priv, OWNER), `${process.pid}\n`, { mode: 0o600 });
    for (const d of ["home", "tmp", "empty", "bin"]) mkdirSync(join(priv, d), { mode: 0o700 });
    const built = await buildMirror(runner, src, priv, tools.git, repo);
    if (runner.timedOut) throw scanFail("timeout", `the scan passed --timeout (${seconds} s)`);
    let rows = [];
    if (built.refs > 0) {
      const report = join(priv, "report.txt");
      const statusFile = join(priv, "git-status");
      const errFile = join(priv, "git-errors");
      const tmpl = join(priv, "report.tmpl");
      const config = join(priv, "gitleaks.toml");
      writeFileSync(tmpl, template, { mode: 0o600 });
      writeFileSync(config, GITLEAKS_CONFIG, { mode: 0o600 });
      writeFileSync(join(priv, "bin", "git"), gitWrapper(tools.git, statusFile, errFile), { mode: 0o700 });
      chmodSync(join(priv, "bin", "git"), 0o700);
      const args = [
        "git", "--no-banner", "--redact", "--exit-code", String(LEAKS_EXIT),
        "--report-format", "template", "--report-template", tmpl, "--report-path", report,
        "--config", config, "--gitleaks-ignore-path", join(priv, "empty"), "--ignore-gitleaks-allow",
        "--log-opts", LOG_OPTS.join(" "), built.mirror,
      ];
      // Scanner stdout and stderr are discarded: only the exit code is kept.
      // GOTRACEBACK=none: a gitleaks crash writes no goroutine dump (and,
      // with core dumps on, no core file of its memory).
      const r = await runner.exec(tools.gitleaks, args, { env: gitEnv(priv, { PATH: `${join(priv, "bin")}:/usr/bin:/bin`, GOTRACEBACK: "none" }), cwd: join(priv, "empty") });
      if (runner.timedOut) throw scanFail("timeout", `the scan passed --timeout (${seconds} s)`);
      if (r.error) throw scanFail("scan-failed", "gitleaks could not be started");
      if (r.code !== 0 && r.code !== LEAKS_EXIT) throw scanFail("scan-failed", `gitleaks stopped (${r.code === null ? r.signal : `exit ${r.code}`}); its output is not shown, because it can quote what it read`);
      const git = readStatus(statusFile);
      if (git.logs === 0) throw scanFail("scan-failed", "gitleaks did not read the history through git");
      if (git.failed !== null) {
        if (MISSING_OBJECT.test(readStart(errFile, 1 << 16))) throw incomplete(repo); // SS-10: the useful next step
        throw scanFail("scan-failed", `git stopped part-way through the history (exit ${git.failed}), so the scan is incomplete`);
      }
      let text = "";
      try {
        if (!lstatSync(report).isFile() || statSync(report).size > MAX_REPORT) throw new Error("report");
        text = readFileSync(report, "utf8");
      } catch {
        rmSync(report, { force: true });
        throw scanFail("scan-failed", "gitleaks wrote no report ow-tools can read");
      }
      const parsed = parseReport(text);
      rmSync(report, { force: true });
      if (parsed.invalid) throw refusal("report-row-invalid", `report row ${parsed.invalid} did not match the strict pattern (path, commit, line, rule id); the scan stopped, the report was deleted unread, and nothing from it is shown`);
      rows = parsed;
      if ((rows.length > 0) !== (r.code === LEAKS_EXIT)) throw scanFail("scan-failed", "gitleaks' exit code and its report disagree");
    }
    const status = rows.length ? "HITS" : "CLEAN";
    return {
      status,
      result: status,
      repo,
      scanned: SCANNED,
      refs: built.refs,
      hits: rows.length,
      rows,
      repo_files: src.files,
      ignored: IGNORED,
      not_read: NOT_READ,
      // A superproject's submodule histories are separate repositories (SS-03f).
      not_scanned: src.submodules,
      scanner: { gitleaks: tools.gitleaksVersion, git: tools.gitVersion, rules: "gitleaks built-in rules and its built-in path allowlist" },
      redaction: "path, commit, line and rule id only; ow-tools never shows the matched text. A path is shown as it is, so a secret in a file or folder name is shown",
      note: status === "HITS"
        ? "Each row is a secret committed to the history: rotate it. Removing it from the history is the client's choice."
        : built.refs === 0
          ? "The repository has no refs, so nothing in its history is reachable to scan (commits with no ref left are not scanned)."
          : `No committed secret matched gitleaks' built-in rules in what was read. Not read: ${NOT_READ[0]}; ${NOT_READ[1]}. A secret in a form the rules don't know can still be there.`,
    };
  } finally {
    for (const sig of Object.keys(SIGNAL_CODES)) process.off(sig, onSignal);
    process.off("uncaughtException", onCrash);
    runner.stop();
    cleanup();
    if (oldMask !== null) process.umask(oldMask);
  }
}

export function scanSecretsText(r) {
  const files = Object.entries(r.repo_files).filter(([, s]) => s === "present, ignored").map(([f]) => f);
  const lines = [
    r.status === "HITS"
      ? `HITS: ${r.hits} finding(s) in the committed history of ${r.repo} (${r.refs} refs including HEAD, two-parent merges included; ${r.scanner.rules}). Path, commit, line and rule only; the matched text is never shown, and a path is shown as it is:`
      : `CLEAN: no committed secret found in ${r.repo} (${r.refs} refs including HEAD, two-parent merges included; ${r.scanner.rules}; the working tree was not scanned).`,
    ...r.rows.map((x) => `  ${x.path}  ${x.commit}  line ${x.line}  ${x.rule}`),
    ...(files.length ? [`Ignored: the repository's own ${files.join(" and ")}.`] : []),
    ...r.not_scanned.map((x) => `Not scanned: ${x.path} (${x.why}).`),
    r.note,
  ];
  return lines.join("\n");
}
