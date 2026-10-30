// `ow-tools export` (design §5.2, §5.7, §5.9): Markdown → branded, accessible
// PDF, Word and PowerPoint; a sheet folder (CSV + model.md) → XLSX. Every run
// writes `export/<name>.export.json`, the record of what was exported (SA-007).
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { PLUGIN_ROOT, VERSION, failed, isDir, isFile, missing, nowDate, oneLine, refused, run, sha256File, timeZone, usage, which } from "./core.mjs";
import { loadBrand } from "./brand.mjs";
import { today } from "./calc.mjs";
import { digestTree } from "./digest.mjs";
import { brandDocx } from "./docx.mjs";
import { withTempDir, writePrivate } from "./guards.mjs";
import { preflight } from "./preflight.mjs";
import { PANDOC_DECK_FROM, brandPptx, buildReferenceDeck, deckChecks } from "./pptx.mjs";
import { buildWorkbook, readSheetFolder } from "./xlsx.mjs";

export const NOT_CONFORMANCE =
  "Structure checked in the source this tool generated; this is not a conformance test. Run your organisation's accessibility checker on the exported file.";
export const HASH_NOTE = "The SHA-256 detects accidental change only; it is not tamper-evidence.";
const FORMATS = ["pdf", "docx"];
const MD_FORMATS = ["pdf", "docx", "pptx"];
// No YAML metadata (Bug 1, round 3): a YAML block's values are Markdown that
// pandoc renders (an `abstract` holding an image embedded any file). ow-tools
// sets the only metadata it needs (`lang`) on the command line.
// No TeX math either (1.1.1, Bug 7): a `$…$` would become an equation, and
// Typst's PDF/UA output refuses an equation without alt text. Dollar signs
// stay text, as they should in a quote or an invoice.
export const PANDOC_FROM = "gfm-autolink_bare_uris-yaml_metadata_block-tex_math_dollars-tex_math_gfm";

export const typstString = (s) => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

export function brandTyp(brand, { title, banner, logoFile }) {
  const [lang, region] = brand.lang.split("-");
  const fonts = (f) => `(${[f, brand.fonts.body, "Libertinus Serif"].filter(Boolean).map(typstString).join(", ")},)`;
  return `#let brand = (
  title: ${typstString(title)},
  author: ${brand.name ? typstString(brand.name) : "()"},
  name: ${typstString(brand.name || "")},
  banner: ${banner ? typstString(banner) : "none"},
  footer: ${typstString(brand.footer || "")},
  logo: ${logoFile ? typstString(logoFile) : "none"},
  logo-alt: ${typstString(brand.logo_alt || "")},
  text: rgb(${typstString(brand.colors.text)}),
  background: rgb(${typstString(brand.colors.background)}),
  primary: rgb(${typstString(brand.colors.primary)}),
  accent: rgb(${typstString(brand.colors.accent)}),
  header-text: rgb(${typstString(brand.headerText)}),
  link: rgb(${typstString(brand.link)}),
  rule: rgb("#9A9A9A"),
  body-fonts: ${fonts(brand.fonts.body)},
  heading-fonts: ${fonts(brand.fonts.heading)},
  lang: ${typstString(lang)},
  region: ${region ? typstString(region) : "none"},
  paper: ${typstString(brand.page === "a4" ? "a4" : "us-letter")},
)
`;
}

function availableFonts() {
  const r = run("typst", ["fonts"]);
  return new Set(r.stdout.split("\n").map((l) => l.trim().toLowerCase()).filter(Boolean));
}

// SA-010 / F-012: list every image pandoc itself will read (its AST, not a
// regex) and refuse unless each is one of the copies ow-tools made in the
// temp folder. Reference images, odd titles and nested brackets are all
// Image nodes here, whatever the preflight's line check saw.
export function imagesPandocReads(file, from, allowed, cwd) {
  const r = run("pandoc", [file, "-f", from, "-t", "json"], { cwd });
  if (r.status !== 0) throw failed(`pandoc could not read the document: ${oneLine(r.stderr)}`);
  const targets = [];
  const walk = (node) => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === "object") {
      if (node.t === "Image" && Array.isArray(node.c) && Array.isArray(node.c[2])) targets.push(String(node.c[2][0]));
      for (const v of Object.values(node)) if (v && typeof v === "object") walk(v);
    }
  };
  // The whole document: metadata as well as blocks (round 3, Bug 1).
  walk(JSON.parse(r.stdout));
  const stray = targets.filter((t) => !allowed.has(t));
  if (stray.length) {
    const problems = [`${stray.length} image(s) pandoc would read are not in the form ![alt](file) the preflight checks (a reference or shortcut image, a title in single quotes, or brackets in the alt text); write each as ![alt](file)`];
    throw refused("unchecked-image", `not exported; fix these first:\n  ${problems[0]}`, { problems });
  }
  return targets;
}

// xlsx needs Node only, so it is never absent where ow-tools runs.
export function exportRequirements(formats) {
  const need = [];
  if (formats.some((f) => f !== "xlsx")) need.push("pandoc");
  if (formats.includes("pdf")) need.push("typst");
  if (formats.includes("docx") || formats.includes("pptx")) need.push("zip", "unzip");
  return [...new Set(need)].filter((c) => !which(c));
}

// The export record (SA-007 (b)): per format, what was exported from what,
// by which ow-tools, when. Merged by format, so a PDF run and a later PPTX
// run of the same source both stay on record. Written 0600.
export function recordExport(outDir, name, entries) {
  const path = join(outDir, `${name}.export.json`);
  let rec = null;
  try {
    rec = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    rec = null;
  }
  if (!rec || rec.ow_artefact !== "ow-tools/export-record" || rec.schema !== 1 || typeof rec.outputs !== "object") {
    rec = { ow_artefact: "ow-tools/export-record", schema: 1, name, outputs: {} };
  }
  const t = today();
  const when = { date: t.date, tz: t.tz || timeZone(), time: nowDate().toISOString(), clock: "tool" };
  for (const e of entries) {
    rec.outputs[e.format] = {
      file: basename(e.output),
      sha256: sha256File(e.output),
      bytes: statSync(e.output).size,
      source: e.source,
      source_sha256: e.sourceSha,
      source_form: e.sourceForm,
      replaced: e.replaced,
      written_by: `ow-tools ${VERSION}`,
      ...when,
    };
  }
  rec.hash_note = HASH_NOTE;
  writePrivate(path, `${JSON.stringify(rec, null, 2)}\n`);
  return path;
}

async function exportSheet({ src, out, fmts }) {
  if (fmts.some((f) => f !== "xlsx")) throw usage("a sheet folder exports to xlsx only (--formats xlsx)");
  // The folder digest first: it refuses a symlinked folder or file before
  // anything is read through it or written.
  const tree = digestTree(src);
  const book = readSheetFolder(src);
  const bytes = buildWorkbook(book);
  const outDir = resolve(out ?? join(dirname(src), "export"));
  mkdirSync(outDir, { recursive: true });
  const name = basename(src);
  const xlsx = join(outDir, `${name}.xlsx`);
  const replaced = existsSync(xlsx);
  writePrivate(xlsx, bytes);
  const record = recordExport(outDir, name, [{ format: "xlsx", output: xlsx, source: `${name}/`, sourceSha: tree.sha256, sourceForm: tree.form, replaced }]);
  return {
    status: "done",
    title: book.model.title || name,
    outputs: { xlsx },
    sha256: { source: tree.sha256, xlsx: sha256File(xlsx) },
    source_form: tree.form,
    record,
    replaced: replaced ? [xlsx] : [],
    sheets: book.order,
    banner: Boolean(book.model.banner),
    notes: ["The workbook is set to recalculate when it opens; formula cells hold no stored value until then"],
    checked: [
      "every mapped formula cell is empty in the CSV",
      "every reference lands on a sheet and cell that exist",
      "functions from the allowed list only; no link, web or DDE formula; no other workbook",
      "CSV text that starts with =, +, - or @ is written as text",
    ],
    statement: NOT_CONFORMANCE,
    hash_note: HASH_NOTE,
  };
}

// `deps.preflight` is a test seam: a test can stand in a preflight that
// misses something, to show the pandoc check refuses it on its own.
export async function exportDoc({ file, brand: brandPath, out, formats }, deps = {}) {
  if (!file) throw usage("usage: ow-tools export <file.md|sheet-folder> [--brand brand.yaml] [--out DIR] [--formats pdf,docx,pptx|xlsx]");
  const src = resolve(file);
  if (isDir(src)) return exportSheet({ src, out, fmts: [...new Set(formats ?? ["xlsx"])] });
  if (!isFile(src) || extname(src) !== ".md") throw usage("give a Markdown (.md) file, or a sheet folder for xlsx");
  const fmts = [...new Set(formats ?? FORMATS)];
  if (!fmts.length || fmts.some((f) => !MD_FORMATS.includes(f))) throw usage("--formats takes pdf, docx and pptx for a Markdown file (xlsx takes a sheet folder)");

  const text = readFileSync(src, "utf8");
  const pre = (deps.preflight ?? preflight)(text, src);
  const deck = fmts.includes("pptx") ? deckChecks(pre.lines) : null;
  const problems = [...pre.problems, ...(deck ? deck.problems : [])];
  if (problems.length) throw refused("preflight", `not exported; fix these in ${basename(src)} first:\n  ${problems.join("\n  ")}`, { problems });
  const { brand, path: brandFile } = loadBrand(src, brandPath);

  const need = exportRequirements(fmts);
  if (need.length) throw missing(`export needs: ${need.join(", ")}. Run ow-tools doctor for the exact steps.`, { missing: need });

  const outDir = resolve(out ?? join(dirname(src), "export"));
  const name = basename(src, ".md");
  const outputs = {};
  const notes = [];
  const replaced = [];
  const deckInfo = {};
  // Every format is built in the private temp folder and moved into export/
  // only after all of them pass (Bug 4, SA-017): a failure leaves export/ as
  // it was, with no unbranded deck, no half-done PDF and no 0644 file.
  const staged = {};
  const target = (ext, tmp) => (staged[ext] = join(tmp, "out", `${name}.${ext}`));

  await withTempDir(async (tmp) => {
    // Copy images in under neutral names so nothing outside the temp folder
    // is reachable from Typst (--root). Preflight has already confined each
    // image to the document's folder (or its opchain-work/ folder), resolved
    // symlinks and checked the file really is a PNG, JPEG or GIF; the copy
    // takes the type it detected, not the name's extension.
    mkdirSync(join(tmp, "out"), { mode: 0o700 });
    let body = pre.body;
    // O14: the H1 is the deck's title only, never a slide (a setext H1's
    // underline goes with it).
    const setext = /^\s{0,3}=+\s*$/.test(pre.lines[pre.titleLine + 1] ?? "");
    let deckBody = pre.lines.map((l, i) => (i === pre.titleLine || (setext && i === pre.titleLine + 1) ? "" : l)).join("\n");
    mkdirSync(join(tmp, "assets"));
    pre.images.forEach((img, n) => {
      const local = `assets/img-${n}.${img.type}`;
      copyFileSync(img.abs, join(tmp, local));
      body = body.split(`](${img.src}`).join(`](${local}`);
      deckBody = deckBody.split(`](${img.src}`).join(`](${local}`);
    });
    writePrivate(join(tmp, "doc.md"), body);
    const allowedImages = new Set(pre.images.map((img, n) => `assets/img-${n}.${img.type}`));
    if (fmts.includes("pdf") || fmts.includes("docx")) imagesPandocReads(join(tmp, "doc.md"), PANDOC_FROM, allowedImages, tmp);

    if (fmts.includes("pdf")) {
      let r = run("pandoc", [join(tmp, "doc.md"), "-f", PANDOC_FROM, "-t", "typst", "-o", join(tmp, "body.typ")], { cwd: tmp });
      if (r.status !== 0) throw failed(`pandoc (Typst) failed: ${oneLine(r.stderr)}`);
      // pandoc centres every table; body text reads better left-aligned
      // (right-aligned number columns keep their own alignment).
      const typBody = readFileSync(join(tmp, "body.typ"), "utf8").replace(/align\(center\)\[#table\(/g, "align(left)[#table(");
      writePrivate(join(tmp, "body.typ"), typBody);
      let logoFile = null;
      if (brand.logoPath) {
        logoFile = "assets/logo.png";
        copyFileSync(brand.logoPath, join(tmp, logoFile));
      }
      writePrivate(join(tmp, "brand.typ"), brandTyp(brand, { title: pre.title, banner: pre.banner, logoFile }));
      copyFileSync(join(PLUGIN_ROOT, "templates", "ow.typ"), join(tmp, "main.typ"));
      const fonts = availableFonts();
      for (const f of [brand.fonts.body, brand.fonts.heading].filter(Boolean)) {
        if (!fonts.has(f.toLowerCase())) notes.push(`font "${f}" is not installed; the PDF uses a fallback font`);
      }
      const pdf = target("pdf", tmp);
      r = run("typst", ["compile", "--root", tmp, "--pdf-standard", "ua-1", join(tmp, "main.typ"), pdf]);
      if (r.status !== 0) throw failed(`typst could not build an accessible PDF: ${oneLine(r.stderr)}`);
      outputs.pdf = pdf;
    }

    if (fmts.includes("docx")) {
      const docx = target("docx", tmp);
      const r = run("pandoc", [join(tmp, "doc.md"), "-f", PANDOC_FROM, "-t", "docx", "-M", `lang=${brand.lang}`, "--resource-path", tmp, "-o", docx], { cwd: tmp });
      if (r.status !== 0) throw failed(`pandoc (Word) failed: ${oneLine(r.stderr)}`);
      brandDocx(docx, brand, { title: pre.title, banner: pre.banner, workDir: tmp });
      outputs.docx = docx;
      if (brand.fonts.body || brand.fonts.heading) notes.push("Word shows a substitute font on machines without the brand fonts");
    }

    if (fmts.includes("pptx")) {
      writePrivate(join(tmp, "deck.md"), deckBody);
      imagesPandocReads(join(tmp, "deck.md"), PANDOC_DECK_FROM, allowedImages, tmp);
      const ref = buildReferenceDeck(brand, tmp);
      const pptx = target("pptx", tmp);
      const r = run("pandoc", [join(tmp, "deck.md"), "-f", PANDOC_DECK_FROM, "-t", "pptx", "--slide-level=2", "--reference-doc", ref, "-M", `lang=${brand.lang}`, "--resource-path", tmp, "-o", pptx], { cwd: tmp });
      if (r.status !== 0) throw failed(`pandoc (PowerPoint) failed: ${oneLine(r.stderr)}`);
      Object.assign(deckInfo, brandPptx(pptx, brand, { title: pre.title, banner: pre.banner, alts: pre.images.map((i) => i.alt), slides: deck.slides, workDir: tmp }));
      outputs.pptx = pptx;
      if (brand.fonts.body || brand.fonts.heading) notes.push("PowerPoint shows a substitute font on machines without the brand fonts");
    }

    // Everything passed: move each output into export/ 0600, through a
    // guarded sibling, so a crash mid-move never leaves a partial file.
    mkdirSync(outDir, { recursive: true });
    for (const [ext, from] of Object.entries(staged)) {
      const final = join(outDir, `${name}.${ext}`);
      if (existsSync(final)) replaced.push(final);
      writePrivate(final, readFileSync(from));
      outputs[ext] = final;
    }
  });

  const sourceSha = sha256File(src);
  const record = recordExport(
    outDir,
    name,
    Object.entries(outputs).map(([format, output]) => ({ format, output, source: basename(src), sourceSha, sourceForm: "file-bytes", replaced: replaced.includes(output) })),
  );
  return {
    status: "done",
    title: pre.title,
    outputs,
    sha256: { source: sourceSha, ...(outputs.pdf ? { pdf: sha256File(outputs.pdf) } : {}), ...(outputs.pptx ? { pptx: sha256File(outputs.pptx) } : {}) },
    record,
    replaced,
    ...(outputs.pptx ? { slides: deckInfo.slides, notes_slides: deckInfo.notes } : {}),
    brand: brandFile ? brandFile : "none found; neutral styling",
    contrast: brand.ratios,
    removed_internal_sections: pre.removedSections,
    banner: Boolean(pre.banner),
    notes,
    checked: [
      "one level-1 heading, no skipped levels",
      "alt text on every image",
      "a header row on every table",
      "link text that says where it goes",
      "internal sections removed",
      `brand contrast (text ${brand.ratios.text_on_background}:1, headings ${brand.ratios.headings_on_background}:1, table header ${brand.ratios.table_header}:1)`,
      ...(outputs.pdf ? ["PDF built in Typst's PDF/UA-1 mode (tagged, title and language set)"] : []),
      ...(outputs.pptx ? ["one slide per ## heading, no H3 or deeper outside the notes, every picture described, every table's header row marked, the banner on every slide"] : []),
    ],
    statement: NOT_CONFORMANCE,
    hash_note: HASH_NOTE,
  };
}
