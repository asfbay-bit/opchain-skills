// `ow-tools digest` (design §5.10, amendment T7): the SHA-256 of a file's
// bytes, or of a folder's canonical manifest. The folder form is chosen so a
// shell one-liner reproduces it:
//
//   (cd DIR && find . -type f ! -name .DS_Store ! -name '._*' -print0 \
//      | LC_ALL=C sort -z | xargs -0 shasum -a 256) | shasum -a 256
//
// i.e. one line per regular file, `<sha256 hex><two spaces>./<path>\n`, in
// byte order of `./<path>`, hashed as a whole. Modes, times and empty folders
// are not part of it. A symlink anywhere is refused (exit 4, naming it), and
// so is a name the one-liner would escape (a backslash or a control
// character), so the two can never silently disagree.
//
// It detects accidental change only. It is not tamper-evidence: anyone who
// can change the files can recompute it.
import { lstatSync, readdirSync, realpathSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { refused, usage } from "./core.mjs";
import { sha256File, sha256Text } from "./hash.mjs";

export const DIGEST_NOTE = "detects accidental change only; not tamper-evidence";
export const TREE_FORM = "ow-tools-tree-v1";
// Finder litter (O12): skipped, and always listed in the output.
export const SKIPPED = (name) => name === ".DS_Store" || name.startsWith("._");
const BAD_NAME = /[\\\u0000-\u001f\u007f]/;

const shown = (rel) => JSON.stringify(rel).slice(1, -1);

function refuseSymlink(rel) {
  return refused("symlink-in-tree", `a symlink is not digested; replace it with the file it points to: ${shown(rel)}`, { path: rel });
}

// Walks `root` with lstat only: a symlink is never followed.
function walk(root, rel, out, skipped) {
  const dir = rel ? join(root, rel) : root;
  for (const name of readdirSync(dir)) {
    const r = rel ? `${rel}/${name}` : name;
    if (BAD_NAME.test(name)) throw refused("unsafe-name", `a file name has a backslash or a control character, which the shell form escapes: ${shown(r)}`, { path: r });
    const st = lstatSync(join(root, r));
    if (st.isSymbolicLink()) throw refuseSymlink(r);
    if (st.isDirectory()) walk(root, r, out, skipped);
    else if (st.isFile()) {
      if (SKIPPED(name)) skipped.push(r);
      else out.push(r);
    } else throw refused("not-a-file", `not a regular file or folder: ${shown(r)}`, { path: r });
  }
}

const byBytes = (a, b) => Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));

// Exported for scripts/build-packs.mjs (Sprint C), so packs and pins are
// computed by this one implementation.
// `hooks.beforeRead(path)` is a test seam: it runs between the walk and each
// read, so a test can swap a file or folder for a symlink in that window.
export function digestTree(dir, hooks = {}) {
  const root = resolve(dir);
  const top = lstatSync(root);
  if (top.isSymbolicLink()) throw refuseSymlink(".");
  if (!top.isDirectory()) throw usage("digestTree takes a folder");
  const realRoot = realpathSync(root);
  const rels = [];
  const skipped = [];
  walk(root, "", rels, skipped);
  const entries = rels
    .map((r) => `./${r}`)
    .sort(byBytes)
    .map((p) => {
      let sha;
      hooks.beforeRead?.(join(root, p));
      try {
        // O_NOFOLLOW: a file swapped for a symlink after the walk is refused.
        sha = sha256File(join(root, p), { noFollow: true });
      } catch (err) {
        if (err.code === "ELOOP" || err.code === "ENOTFILE") {
          throw refused("symlink-in-tree", `a file was swapped for a symlink while it was being digested: ${shown(p.slice(2))}`, { path: p.slice(2) });
        }
        throw err;
      }
      // O_NOFOLLOW guards only the last name (F-018): a folder on the path
      // swapped for a symlink is caught by checking the real path after.
      if (realpathSync(join(root, p)) !== join(realRoot, p)) {
        throw refused("symlink-in-tree", `a folder on the path was swapped for a symlink while it was being digested: ${shown(p.slice(2))}`, { path: p.slice(2) });
      }
      return { path: p.slice(2), sha256: sha };
    });
  const manifest = entries.map((e) => `${e.sha256}  ./${e.path}\n`).join("");
  return { sha256: sha256Text(manifest), form: TREE_FORM, files: entries, skipped: skipped.sort(byBytes), manifest };
}

export function digest({ target }) {
  if (!target) throw usage("usage: ow-tools digest <file|folder> [--json]");
  const abs = resolve(target);
  let st;
  try {
    st = lstatSync(abs);
  } catch {
    throw usage("no such file or folder");
  }
  if (st.isSymbolicLink()) throw refused("symlink-in-tree", "the path given is a symlink; give the file or folder itself", { path: basename(abs) });
  if (st.isFile()) {
    return { status: "ok", kind: "file", algorithm: "sha256", form: "file-bytes", sha256: sha256File(abs, { noFollow: true }), bytes: st.size, note: DIGEST_NOTE };
  }
  if (!st.isDirectory()) throw refused("not-a-file", "not a regular file or folder");
  const t = digestTree(abs);
  return {
    status: "ok",
    kind: "folder",
    algorithm: "sha256",
    form: t.form,
    sha256: t.sha256,
    files: t.files.length,
    skipped: t.skipped,
    note: DIGEST_NOTE,
  };
}

export function digestText(r, target) {
  const lines = [`${r.sha256}  ${target}`];
  if (r.kind === "folder") {
    lines.push(`${r.files} file(s), canonical form ${r.form}`);
    if (r.skipped.length) lines.push(`skipped (Finder files): ${r.skipped.map(shown).join(", ")}`);
  }
  lines.push(`This digest ${DIGEST_NOTE}.`);
  return lines.join("\n");
}
