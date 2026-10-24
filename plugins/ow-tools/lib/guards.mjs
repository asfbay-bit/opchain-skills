// Privacy guards that run before ow-tools writes anything (design §8).
import { chmodSync, mkdtempSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { isDir, isFile, missing, refused, run, usage } from "./core.mjs";

export const IGNORE_LINES = ["opchain-work/**/audio/", "opchain-work/**/transcript.*"];

const RECORDING = /\.(m4a|mp4|webm|mp3|wav|aac|ogg|oga|opus|flac|mov|mkv)$/i;

// Recordings are always kept in a folder named `audio` (ow-start §8): one
// folder rule is safer than an extension list in .gitignore. ow-start's NEXT
// names the folder ("use ow-tools to transcribe intake/<client>/audio/"), so
// a folder holding exactly one recording stands for that recording.
export function assertAudioInput(file) {
  let abs = resolve(file);
  if (isDir(abs)) {
    if (basename(abs) !== "audio") throw refused("not-in-audio-folder", `recordings must sit in a folder named "audio"; ${file} is a different folder`);
    const found = readdirSync(abs).filter((n) => RECORDING.test(n) && isFile(join(abs, n))).sort();
    if (found.length === 0) throw refused("no-recording", `no recording in ${file} (looked for .m4a, .mp4, .webm, .mp3, .wav and similar)`);
    if (found.length > 1) throw usage(`${file} holds ${found.length} recordings; name one: ${found.join(", ")}`);
    abs = join(abs, found[0]);
  }
  if (!isFile(abs)) throw refused("no-recording", `no such recording: ${file}`);
  if (basename(dirname(abs)) !== "audio") {
    throw refused(
      "not-in-audio-folder",
      `recordings must sit in a folder named "audio" (e.g. intake/<client>/audio/); move ${basename(abs)} there and run again`,
    );
  }
  return abs;
}

function nearestExisting(p) {
  let d = resolve(p);
  while (!isDir(d)) {
    const up = dirname(d);
    if (up === d) return null;
    d = up;
  }
  return d;
}

// Every path must be git-ignored when it sits inside a work tree. Paths
// outside any repository pass. Tracked files count as not ignored, which is
// what we want: a recording already committed is a leak to fix, not to extend.
// git missing is exit 3, never a pass (F-005): another tool could still commit
// from this work tree.
function vcs(args) {
  const r = run("git", args);
  if (r.error) throw missing("git is needed to check that these files are git-ignored; install git, then run again", { missing: ["git"] });
  return r;
}

export function notIgnored(paths) {
  const bad = [];
  for (const p of paths) {
    const abs = resolve(p);
    const probe = nearestExisting(isDir(abs) ? abs : dirname(abs));
    if (!probe) continue;
    const top = vcs(["-C", probe, "rev-parse", "--show-toplevel"]);
    if (top.status !== 0) continue; // not in a repository
    const root = realpathSync(top.stdout.trim());
    // Resolve symlinks (macOS /var → /private/var) on the part that exists.
    const real = join(realpathSync(probe), relative(probe, abs));
    const rel = relative(root, real).split(sep).join("/");
    // 0 = ignored; 1 = not ignored; anything else is treated as not ignored.
    const r = vcs(["-C", root, "check-ignore", "-q", "--", rel]);
    if (r.status !== 0) bad.push({ path: rel, repo: root });
  }
  return bad;
}

export function assertIgnored(paths, lines = IGNORE_LINES) {
  const bad = notIgnored(paths);
  if (bad.length === 0) return;
  throw refused(
    "not-ignored",
    `these would be committable in ${bad[0].repo}: ${bad.map((b) => b.path).join(", ")}. ` +
      `Add these lines to that repository's .gitignore, then run again:\n  ${lines.join("\n  ")}`,
    { not_ignored: bad.map((b) => b.path), add_to_gitignore: lines },
  );
}

// The sibling a private write goes through before its rename (F-006): the
// guard checks it too, so a crash between write and rename can't leave a
// committable copy that a narrower .gitignore misses.
export const tmpSibling = (path) => `${path}.tmp-${process.pid}`;
export const withTmpSiblings = (paths) => paths.flatMap((p) => [p, tmpSibling(p)]);

// Written 0600, through the sibling, then renamed into place.
export function writePrivate(path, data) {
  const tmp = tmpSibling(path);
  rmSync(tmp, { force: true });
  writeFileSync(tmp, data, { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, path);
}

// A private (0700) temp folder that is always removed, including on failure.
export async function withTempDir(fn) {
  const dir = mkdtempSync(resolve(tmpdir(), "ow-tools-"));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
