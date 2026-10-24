// `ow-tools export <deck.md> --formats pptx` (design §5.7, amendment T2):
// Markdown → a branded PPTX through pandoc, one slide per H2, speaker notes
// from `::: notes` blocks. ow-tools builds the reference deck per run from
// brand.yaml (theme colours and fonts, the logo on the master) and then edits
// the result in place (the banner on every slide, image descriptions, table
// header rows, the title), with the same unzip, edit, zip pattern as docx.mjs.
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { failed, oneLine, run } from "./core.mjs";
import { xmlEscape } from "./docx.mjs";

export const PANDOC_DECK_FROM = "gfm-autolink_bare_uris+fenced_divs-yaml_metadata_block-tex_math_dollars-tex_math_gfm";
const NOTES_OPEN = /^\s{0,3}:::\s*notes\s*$/;
const DIV_CLOSE = /^\s{0,3}:::\s*$/;
const DIV_ANY = /^\s{0,3}:{3,}/;
const ATX = /^\s{0,3}(#{1,6})(?:\s+.*)?$/;
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const IMG = /!\[[^\]]*\]\(/;
const TABLE_DELIM = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

// Deck rules on top of the 1.0.0 preflight (design §5.7). `lines` is the
// preflight's blanked line array, so numbers match the source file.
export function deckChecks(lines) {
  const problems = [];
  const bad = (i, msg) => problems.push(`line ${i + 1}: ${msg}`);
  let fence = null;
  let notes = -1;
  let seenH1 = false;
  let slide = null; // { line, visuals }
  let h2 = 0;
  lines.forEach((l, i) => {
    const f = FENCE.exec(l);
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null;
      return;
    }
    if (f) {
      fence = f[1];
      return;
    }
    if (NOTES_OPEN.test(l)) {
      if (notes >= 0) bad(i, "a notes block opens inside another one");
      else if (!slide) bad(i, "speaker notes before the first slide (H2)");
      notes = i;
      return;
    }
    if (DIV_CLOSE.test(l)) {
      if (notes < 0) bad(i, "a ::: line closes nothing; speaker notes are ::: notes … :::");
      notes = -1;
      return;
    }
    if (DIV_ANY.test(l)) {
      bad(i, "only ::: notes blocks are supported in a deck");
      return;
    }
    if (notes >= 0) return; // anything goes inside the speaker notes
    const h = ATX.exec(l);
    if (h) {
      const level = h[1].length;
      if (level === 1) seenH1 = true;
      else if (level === 2) {
        slide = { line: i, visuals: 0 };
        h2++;
      } else bad(i, "a deck has one heading per slide (##); H3 or deeper goes in the slide text or the notes");
      return;
    }
    if (!l.trim()) return;
    // A thematic break (or a setext underline) starts a new slide in pandoc
    // (Bug 4): refused before pandoc runs.
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(l)) {
      bad(i, "a line of ---, *** or ___ (a thematic break or a setext heading) would start an extra slide; use ## headings for slides");
      return;
    }
    if (!slide) {
      if (seenH1) bad(i, "text between the title (#) and the first slide (##); put it on a slide");
      return;
    }
    const visuals = (l.match(/!\[[^\]]*\]\(/g) || []).length + (TABLE_DELIM.test(l) && l.includes("-") && lines[i - 1]?.includes("|") ? 1 : 0);
    slide.visuals += visuals;
    if (visuals && slide.visuals > 1) bad(i, "a slide holds at most one image or table (pandoc would split it into two slides)");
  });
  if (notes >= 0) bad(notes, "a ::: notes block is never closed with :::");
  if (h2 === 0) problems.push("a deck needs at least one slide (## heading)");
  return { problems, slides: h2 };
}

const hex = (c) => c.replace("#", "").toUpperCase();
const srgb = (c) => `<a:srgbClr val="${hex(c)}"/>`;

export function brandTheme(xml, brand) {
  const slot = (name, color) => (x) => x.replace(new RegExp(`<a:${name}>[\\s\\S]*?</a:${name}>`), `<a:${name}>${srgb(color)}</a:${name}>`);
  let out = xml;
  for (const fn of [
    slot("dk1", brand.colors.text),
    slot("lt1", brand.colors.background),
    slot("dk2", brand.colors.primary),
    slot("lt2", brand.colors.background),
    slot("accent1", brand.colors.primary),
    slot("accent2", brand.colors.accent),
    slot("hlink", brand.link),
  ]) out = fn(out);
  const face = (kind, f) => (x) => (f ? x.replace(new RegExp(`(<a:${kind}><a:latin typeface=")[^"]*(")`), `$1${xmlEscape(f)}$2`) : x);
  out = face("majorFont", brand.fonts.heading)(out);
  out = face("minorFont", brand.fonts.body)(out);
  return out;
}

const EMU_IN = 914400;

function logoPic(brand, slide) {
  const png = readFileSync(brand.logoPath);
  const w = png.readUInt32BE(16);
  const h = Math.max(1, png.readUInt32BE(20));
  const cy = Math.round(EMU_IN * 0.45);
  const cx = Math.round((cy * w) / h);
  const x = slide.cx - cx - Math.round(EMU_IN * 0.3);
  const y = Math.round(EMU_IN * 0.15);
  const alt = xmlEscape(brand.logo_alt);
  return (
    `<p:pic><p:nvPicPr><p:cNvPr id="9101" name="Logo" descr="${alt}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr userDrawn="1"/></p:nvPicPr>` +
    `<p:blipFill><a:blip r:embed="rIdOwLogo"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
    `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
  );
}

export function bannerShape(banner, slide) {
  const cx = slide.cx - Math.round(EMU_IN * 0.6);
  const cy = Math.round(EMU_IN * 0.3);
  const y = slide.cy - cy - Math.round(EMU_IN * 0.08);
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="9102" name="Banner"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${Math.round(EMU_IN * 0.3)}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>` +
    `<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="ctr"/><a:lstStyle/><a:p><a:pPr algn="ctr"/>` +
    `<a:r><a:rPr lang="en-US" sz="1000" b="1" dirty="0"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill></a:rPr><a:t>${xmlEscape(banner)}</a:t></a:r></a:p></p:txBody></p:sp>`
  );
}

function slideSize(dir) {
  const xml = readFileSync(join(dir, "ppt", "presentation.xml"), "utf8");
  const m = /<p:sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(xml);
  return m ? { cx: Number(m[1]), cy: Number(m[2]) } : { cx: 9144000, cy: 5143500 };
}

function unzipTo(file, dir, what) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const r = run("unzip", ["-q", file, "-d", dir]);
  if (r.status !== 0) throw failed(`could not open ${what}: ${oneLine(r.stderr)}`);
}

function zipFrom(dir, file, what) {
  rmSync(file, { force: true });
  let r = run("zip", ["-X", "-q", "-nw", file, "[Content_Types].xml"], { cwd: dir });
  if (r.status === 0) r = run("zip", ["-X", "-q", "-nw", "-r", file, ".", "-x", "[Content_Types].xml"], { cwd: dir });
  if (r.status !== 0) throw failed(`could not write ${what}: ${oneLine(r.stderr)}`);
}

const edit = (dir, rel, fn) => writeFileSync(join(dir, rel), fn(readFileSync(join(dir, rel), "utf8")));

function addLogoToMaster(dir, brand) {
  const size = slideSize(dir);
  mkdirSync(join(dir, "ppt", "media"), { recursive: true });
  copyFileSync(brand.logoPath, join(dir, "ppt", "media", "ow-logo.png"));
  edit(dir, "ppt/slideMasters/slideMaster1.xml", (x) => x.replace(/<\/p:spTree>/, `${logoPic(brand, size)}</p:spTree>`));
  edit(dir, "ppt/slideMasters/_rels/slideMaster1.xml.rels", (x) =>
    x.replace(/<\/Relationships>/, '<Relationship Id="rIdOwLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/ow-logo.png"/></Relationships>'),
  );
  edit(dir, "[Content_Types].xml", (x) => (/Extension="png"/i.test(x) ? x : x.replace(/<Types([^>]*)>/, '<Types$1><Default Extension="png" ContentType="image/png"/>')));
}

// The reference deck, built per run from pandoc's own default and brand.yaml.
export function buildReferenceDeck(brand, workDir) {
  const ref = join(workDir, "reference.pptx");
  const r = run("pandoc", ["-o", ref, "--print-default-data-file", "reference.pptx"]);
  if (r.status !== 0) throw failed(`pandoc could not write its default reference deck: ${oneLine(r.stderr)}`);
  const dir = join(workDir, "ref");
  unzipTo(ref, dir, "pandoc's reference deck");
  edit(dir, "ppt/theme/theme1.xml", (x) => brandTheme(x, brand));
  if (brand.logoPath) addLogoToMaster(dir, brand);
  zipFrom(dir, ref, "the reference deck");
  return ref;
}

const slideFiles = (dir) =>
  readdirSync(join(dir, "ppt", "slides"))
    .filter((n) => /^slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

// After pandoc: the banner on every slide, each picture's description from
// its alt text, every table's header row flagged, the title set. Then the
// result is checked: slide count, descriptions, header rows, the logo.
export function brandPptx(file, brand, { title, banner, alts, slides, workDir }) {
  const dir = join(workDir, "pptx");
  unzipTo(file, dir, "the deck pandoc wrote");
  const size = slideSize(dir);
  if (brand.logoPath && !readFileSync(join(dir, "ppt", "slideMasters", "slideMaster1.xml"), "utf8").includes('name="Logo"')) addLogoToMaster(dir, brand);
  const names = slideFiles(dir);
  if (names.length !== slides) throw failed(`pandoc made ${names.length} slides from ${slides} slide headings; check the deck for content pandoc splits`);
  for (const n of names) {
    edit(dir, `ppt/slides/${n}`, (x) => {
      let out = x.replace(/descr="[^"]*?img-(\d+)\.(?:png|jpg|gif)[^"]*"/g, (_, k) => `descr="${xmlEscape(alts[Number(k)] ?? "")}"`);
      out = out.replace(/<a:tblPr(?![^>]*firstRow="1")([^>]*?)(\/?)>/g, (_, attrs, slash) => `<a:tblPr firstRow="1"${attrs.replace(/\s*firstRow="[^"]*"/, "")}${slash}>`);
      if (banner) out = out.replace(/<\/p:spTree>/, `${bannerShape(banner, size)}</p:spTree>`);
      for (const pic of out.match(/<p:pic>[\s\S]*?<\/p:pic>/g) || []) {
        const d = /<p:cNvPr[^>]*descr="([^"]*)"/.exec(pic);
        if (!d || !d[1].trim()) throw failed("a picture in the deck has no description after branding");
      }
      return out;
    });
  }
  edit(dir, "docProps/core.xml", (x) => {
    let out = x.replace(/<dc:title>[\s\S]*?<\/dc:title>|<dc:title\s*\/>/, `<dc:title>${xmlEscape(title)}</dc:title>`);
    if (!/<dc:title>/.test(out)) out = out.replace(/<\/cp:coreProperties>/, `<dc:title>${xmlEscape(title)}</dc:title></cp:coreProperties>`);
    return out;
  });
  zipFrom(dir, file, "the branded deck");
  return { slides: names.length, notes: readdirSync(join(dir, "ppt")).includes("notesSlides") ? readdirSync(join(dir, "ppt", "notesSlides")).filter((n) => n.endsWith(".xml")).length : 0 };
}
