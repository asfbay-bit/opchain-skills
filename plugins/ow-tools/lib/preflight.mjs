// Export preflight (design §5.2): read the Markdown an ow- skill wrote, take
// out what never goes to a client, and refuse structure that would export
// inaccessibly. Pure apart from the image checks, which read the files. Lines
// are blanked, not deleted, so every message keeps the source line number.
// Messages name line numbers and never quote the document's text (design §8).
import { closeSync, openSync, readSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";

// Markers are matched without regard to case or spacing ("<!-- OW: Internal -->"
// counts). Any other HTML comment that mentions "internal" is refused, so a
// misspelt marker can never let an internal section through silently.
const INTERNAL_START = /^\s*<!--\s*ow\s*:\s*internal\s*-->\s*$/i;
const INTERNAL_END = /^\s*<!--\s*ow\s*:\s*end\s*-\s*internal\s*-->\s*$/i;
const COMMENT = /<!--[\s\S]*?(?:-->|$)/g;
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const ATX = /^\s{0,3}(#{1,6})(?:\s+(.*?))?\s*#*\s*$/;
const SETEXT = /^\s{0,3}(=+|-+)\s*$/;
const DELIM = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const BAD_LINK_TEXT = /^(here|click here|link|this link|read more|more)$/i;
const URLISH = /^(https?:\/\/|www\.)\S+$/i;

const cells = (row) =>
  row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((c) => c.trim());

// A line without its code spans. An escaped backtick (\`) is a literal
// backtick, not a code span, so it can't hide raw HTML or an image (Bug 8).
const withoutCode = (l) => l.replace(/\\`/g, "").replace(/(`+)[\s\S]*?\1/g, "");

const plain = (s) => s.replace(/[*_`]/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").trim();

// Image types both engines embed without extra tools: Typst reads all three,
// and pandoc's Word writer embeds them as they are. SVG needs rsvg-convert for
// Word and can reference other files; WebP is not read by pandoc. Both refused.
export function imageType(path) {
  const head = Buffer.alloc(12);
  const fd = openSync(path, "r");
  try {
    readSync(fd, head, 0, 12, 0);
  } finally {
    closeSync(fd);
  }
  const hex = head.toString("hex");
  if (hex.startsWith("89504e470d0a1a0a")) return "png";
  if (hex.startsWith("ffd8ff")) return "jpg";
  if (hex.startsWith("474946383761") || hex.startsWith("474946383961")) return "gif";
  return null;
}

// Images may come from the document's folder or, when the document sits inside
// an opchain-work/ folder, from anywhere under that folder (a shared brand/
// image). Symlinks are resolved first, so a link can't point outside.
export function imageRoot(mdPath) {
  const docDir = realpathSync(dirname(resolve(mdPath)));
  for (let d = docDir; ; ) {
    if (basename(d) === "opchain-work") return d;
    const up = dirname(d);
    if (up === d) return docDir;
    d = up;
  }
}

export function preflight(text, mdPath) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const problems = [];
  const bad = (i, msg) => problems.push(`line ${i + 1}: ${msg}`);
  let banner = null;

  // The ow- artefact header (ow-protocol v1 §4) never reaches a client: a YAML
  // block at the very top holding ow_artefact. banner_text, when set, is the
  // first line after it (§3b) and is kept for every page header. The audit's
  // older one-line form (banner above an `ow_artefact: … | …` line) is read too.
  if (lines[0] === "---") {
    const end = lines.indexOf("---", 1);
    if (end > 0 && lines.slice(1, end).some((l) => /^ow_artefact:/.test(l))) {
      for (let i = 0; i <= end; i++) lines[i] = "";
      const next = lines[end + 1] ?? "";
      if (next.trim() && !/^\s{0,3}#/.test(next)) {
        banner = next.trim();
        lines[end + 1] = "";
      }
    }
  } else if (/^ow_artefact:/.test(lines[0] || "")) lines[0] = "";
  else if (/^ow_artefact:/.test(lines[1] || "") && (lines[0] || "").trim()) {
    banner = lines[0].trim();
    lines[0] = "";
    lines[1] = "";
  }

  // Internal sections.
  const removed = [];
  let open = -1;
  let sections = 0;
  lines.forEach((l, i) => {
    if (INTERNAL_START.test(l)) {
      if (open >= 0) bad(i, "an ow:internal section opens inside another one");
      else sections++;
      open = i;
      lines[i] = "";
    } else if (INTERNAL_END.test(l)) {
      if (open < 0) bad(i, "ow:end-internal without an opening ow:internal");
      open = -1;
      lines[i] = "";
    } else if (open >= 0) {
      if (l.trim()) removed.push({ i, text: l.trim() });
      lines[i] = "";
    }
  });
  if (open >= 0) bad(open, "ow:internal section never closed with <!-- ow:end-internal -->");

  // What is left holds no well-formed marker. Any comment still mentioning
  // "internal" (misspelt, mid-line, split over lines, never closed) is refused,
  // fenced code included: the stripper above doesn't skip fences either.
  const rest = lines.join("\n");
  for (const m of rest.matchAll(COMMENT)) {
    if (/internal/i.test(m[0])) {
      bad(rest.slice(0, m.index).split("\n").length - 1, "an HTML comment mentions \"internal\" but is not a marker; write exactly <!-- ow:internal --> and <!-- ow:end-internal --> on lines of their own");
    }
  }

  // Structure checks, outside fenced code.
  const headings = [];
  const images = [];
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const f = FENCE.exec(l);
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null;
      continue;
    }
    if (f) {
      fence = f[1];
      continue;
    }
    if (/^ow_artefact:/.test(l)) bad(i, "an artefact header line is only allowed at the top");
    if (/ow\s*:\s*(end\s*-\s*)?internal/i.test(l) && !/<!--/.test(l)) bad(i, "stray ow:internal marker");

    const atx = ATX.exec(l);
    const prev = i > 0 ? lines[i - 1] : "";
    if (atx) headings.push({ i, level: atx[1].length, text: plain(atx[2] || "") });
    else if (SETEXT.exec(l) && prev.trim() && !/^\s*([#|>*+-]|\d+[.)])/.test(prev) && !DELIM.test(l) && !l.includes("|")) {
      headings.push({ i: i - 1, level: l.trim()[0] === "=" ? 1 : 2, text: plain(prev) });
    }

    // A YAML metadata block below the ow- header (Bug 1, round 3): its values
    // would be Markdown pandoc renders. pandoc reads none (the reader has
    // yaml_metadata_block off, and the image check walks the metadata too);
    // this refusal says so instead of letting the block print as text. A
    // block is `---`, after a blank line, then `key:` lines up to a closing
    // `---` or `...` with no blank line between.
    if (/^---\s*$/.test(l) && !prev.trim() && /^[A-Za-z_][\w -]*:(\s|$)/.test(lines[i + 1] || "")) {
      let j = i + 1;
      while (j < lines.length && lines[j].trim() && !/^(---|\.\.\.)\s*$/.test(lines[j])) j++;
      if (/^(---|\.\.\.)\s*$/.test(lines[j] || "")) bad(i, "a YAML metadata block is not exported (only the ow- header at the very top is read); remove it");
    }
    // Code spans don't hide HTML, and an escaped backtick opens none (Bug 8).
    if (/<[A-Za-z!/]/.test(withoutCode(l)) && !/^\s*<!--.*-->\s*$/.test(l)) {
      if (/<https?:\/\//i.test(l)) bad(i, "a bare URL as link text; write [what it is](url)");
      else bad(i, "raw HTML is not exported; use Markdown");
    }
    const INLINE_IMAGE = /!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
    for (const m of l.matchAll(INLINE_IMAGE)) {
      const [, alt, src] = m;
      if (!alt.trim()) bad(i, "an image has no alt text");
      if (/^[a-z]+:\/\//i.test(src)) bad(i, "an image is remote; exports use local files only");
      else images.push({ i, src, alt });
    }
    // Any other image form (a reference or shortcut image, a title in single
    // quotes or brackets, brackets in the alt text, a path with spaces) is
    // refused here, by line (SA-010 / F-012). export also checks every image
    // pandoc itself reads, so nothing this regex misses can reach a client.
    if (withoutCode(l).replace(INLINE_IMAGE, "").includes("![")) {
      bad(i, /!\[[^\]]*\]\[[^\]]*\]/.test(l) ? "reference-style images are not supported; use ![alt](file)" : "an image not written as ![alt](file) (a reference or shortcut image, a title in single quotes, brackets in the alt text or a space in the path); write it as ![alt](file)");
    }
    for (const m of l.matchAll(/(?<!!)\[([^\]]+)\]\(([^)]+)\)/g)) {
      const [, t, href] = m;
      const txt = plain(t);
      if (BAD_LINK_TEXT.test(txt)) bad(i, "link text like \"here\" or \"read more\" doesn't say where it goes");
      else if (URLISH.test(txt) || txt === href.trim()) bad(i, "a bare URL as link text; write [what it is](url)");
    }
    if (DELIM.test(l) && l.includes("-") && i > 0 && prev.includes("|")) {
      const head = cells(prev);
      if (head.some((c) => !c)) bad(i - 1, "a table header cell is empty; every column needs a header");
      if (cells(l).length !== head.length) bad(i, "the table delimiter row doesn't match the header's columns");
    }
  }

  const h1 = headings.filter((h) => h.level === 1);
  if (h1.length === 0) problems.push("the document needs exactly one level-1 heading (# Title); found none");
  if (h1.length > 1) bad(h1[1].i, "a second level-1 heading; the document needs exactly one");
  for (let k = 1; k < headings.length; k++) {
    if (headings[k].level > headings[k - 1].level + 1) {
      bad(headings[k].i, `heading level jumps from ${headings[k - 1].level} to ${headings[k].level}`);
    }
  }
  if (headings.length && headings[0].level !== 1) bad(headings[0].i, "the first heading must be the level-1 title");

  if (images.length) {
    const base = dirname(resolve(mdPath));
    const root = imageRoot(mdPath);
    const where = root === realpathSync(base) ? "the document's folder" : "the opchain-work folder";
    for (const img of images) {
      if (isAbsolute(img.src)) {
        bad(img.i, "an image uses an absolute path; use a path relative to the document");
        continue;
      }
      let abs;
      try {
        abs = realpathSync(resolve(base, decodeURI(img.src)));
      } catch (err) {
        bad(img.i, err instanceof URIError ? "an image path has a malformed %-escape" : "an image file was not found");
        continue;
      }
      const rel = relative(root, abs);
      if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
        bad(img.i, `an image is outside ${where}; copy it beside the document`);
        continue;
      }
      const type = statSync(abs).isFile() ? imageType(abs) : null;
      if (!type) bad(img.i, "an image is not a PNG, JPEG or GIF file");
      else Object.assign(img, { abs, type });
    }
  }

  const body = lines.join("\n").replace(/^\n+/, "");
  for (const r of removed) {
    if (r.text.length <= 3) continue;
    const at = lines.findIndex((l) => l.includes(r.text));
    if (at >= 0) bad(at, `text from the internal section (line ${r.i + 1}) also appears here, outside it`);
  }
  return {
    ok: problems.length === 0,
    problems,
    title: h1[0]?.text || null,
    titleLine: h1[0]?.i ?? null,
    banner,
    body,
    lines,
    images,
    removedSections: sections,
  };
}
