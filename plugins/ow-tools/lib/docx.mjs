// Brand a pandoc-generated .docx in place (design §5.2): fonts and colours in
// styles.xml, a header (logo + banner) and footer (footer text + page number),
// page size, and the core title. Uses the system zip/unzip; no npm packages.
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { failed, oneLine, run } from "./core.mjs";

export const xmlEscape = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const hex = (c) => c.replace("#", "").toUpperCase();
const fontsTag = (f) => `<w:rFonts w:ascii="${xmlEscape(f)}" w:hAnsi="${xmlEscape(f)}" w:cs="${xmlEscape(f)}" w:eastAsia="${xmlEscape(f)}" />`;

function styleBlock(xml, id) {
  const re = new RegExp(`<w:style [^>]*w:styleId="${id}"[^>]*>[\\s\\S]*?</w:style>`);
  const m = re.exec(xml);
  return m ? { text: m[0], index: m.index } : null;
}

function editStyle(xml, id, fn) {
  const s = styleBlock(xml, id);
  if (!s) return xml;
  return xml.slice(0, s.index) + fn(s.text) + xml.slice(s.index + s.text.length);
}

function setRunProp(style, tag, value) {
  // Replace an existing <w:tag .../> (possibly multi-line) or add one to rPr.
  const re = new RegExp(`<w:${tag}\\b[^>]*/>`);
  if (re.test(style)) return style.replace(re, value);
  if (/<w:rPr>/.test(style)) return style.replace(/<w:rPr>/, `<w:rPr>${value}`);
  return style.replace(/<\/w:style>$/, `<w:rPr>${value}</w:rPr></w:style>`);
}

export function brandStyles(xml, brand) {
  let out = xml;
  // Body defaults: font and text colour.
  out = out.replace(/(<w:rPrDefault>\s*<w:rPr>)([\s\S]*?)(<\/w:rPr>)/, (_, a, inner, z) => {
    let r = inner;
    if (brand.fonts.body) r = r.replace(/<w:rFonts\b[^>]*\/>/, fontsTag(brand.fonts.body));
    r = r.replace(/<w:color\b[^>]*\/>/, "") + `<w:color w:val="${hex(brand.colors.text)}" />`;
    return a + r + z;
  });
  for (let n = 1; n <= 9; n++) {
    out = editStyle(out, `Heading${n}`, (s) => {
      let r = setRunProp(s, "color", `<w:color w:val="${hex(n <= 3 ? brand.colors.primary : brand.colors.text)}" />`);
      if (!/<w:b\s*\/>/.test(r)) r = r.replace(/<w:rPr>/, "<w:rPr><w:b />");
      if (brand.fonts.heading) r = setRunProp(r, "rFonts", fontsTag(brand.fonts.heading));
      return r;
    });
  }
  out = editStyle(out, "Title", (s) => (brand.fonts.heading ? setRunProp(s, "rFonts", fontsTag(brand.fonts.heading)) : s));
  out = editStyle(out, "Hyperlink", (s) => setRunProp(setRunProp(s, "color", `<w:color w:val="${hex(brand.link)}" />`), "u", '<w:u w:val="single" />'));
  out = editStyle(out, "Table", (s) =>
    s.replace(
      /<w:tblStylePr w:type="firstRow">[\s\S]*?<\/w:tblStylePr>/,
      `<w:tblStylePr w:type="firstRow"><w:rPr><w:b /><w:color w:val="${hex(brand.headerText)}" /></w:rPr>` +
        `<w:tcPr><w:tcBorders><w:bottom w:val="single" /></w:tcBorders>` +
        `<w:shd w:val="clear" w:color="auto" w:fill="${hex(brand.colors.accent)}" /><w:vAlign w:val="bottom" /></w:tcPr></w:tblStylePr>`,
    ),
  );
  return out;
}

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

const runText = (t, bold = false) =>
  `<w:r><w:rPr>${bold ? "<w:b />" : ""}<w:sz w:val="18" /></w:rPr><w:t xml:space="preserve">${xmlEscape(t)}</w:t></w:r>`;

function logoDrawing(brand) {
  // 0.9 cm tall; width kept to the PNG's aspect ratio.
  const png = readFileSync(brand.logoPath);
  const w = png.readUInt32BE(16);
  const h = png.readUInt32BE(20);
  const cy = 324000;
  const cx = Math.round((cy * w) / h);
  const alt = xmlEscape(brand.logo_alt);
  return (
    `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}" />` +
    `<wp:docPr id="9001" name="Logo" descr="${alt}" /><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic><pic:nvPicPr><pic:cNvPr id="9002" name="logo.png" descr="${alt}" /><pic:cNvPicPr /></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="rIdOwLogo" /><a:stretch><a:fillRect /></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0" /><a:ext cx="${cx}" cy="${cy}" /></a:xfrm><a:prstGeom prst="rect"><a:avLst /></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
  );
}

export function headerXml(brand, banner) {
  const left = brand.logoPath ? logoDrawing(brand) : runText(brand.name || "");
  const right = banner ? `<w:r><w:tab /></w:r>${runText(banner, true)}` : "";
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${NS}><w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="9360" /></w:tabs></w:pPr>` +
    `${left}${right}</w:p></w:hdr>`
  );
}

export function footerXml(brand) {
  const field = (instr) =>
    `<w:r><w:rPr><w:sz w:val="18" /></w:rPr><w:fldChar w:fldCharType="begin" /></w:r>` +
    `<w:r><w:rPr><w:sz w:val="18" /></w:rPr><w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r>` +
    `<w:r><w:rPr><w:sz w:val="18" /></w:rPr><w:fldChar w:fldCharType="end" /></w:r>`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${NS}><w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="9360" /></w:tabs></w:pPr>` +
    `${runText(brand.footer || "")}<w:r><w:tab /></w:r>${runText("Page ")}${field("PAGE")}${runText(" of ")}${field("NUMPAGES")}</w:p></w:ftr>`
  );
}

const PAGE = { letter: '<w:pgSz w:w="12240" w:h="15840" />', a4: '<w:pgSz w:w="11906" w:h="16838" />' };
const MARGINS = '<w:pgMar w:top="1584" w:right="1304" w:bottom="1418" w:left="1304" w:header="709" w:footer="709" w:gutter="0" />';

export function brandDocument(xml, brand) {
  const refs = '<w:headerReference w:type="default" r:id="rIdOwHeader" /><w:footerReference w:type="default" r:id="rIdOwFooter" />';
  const tail = PAGE[brand.page] + MARGINS;
  if (/<w:sectPr>/.test(xml)) {
    return xml.replace(/<w:sectPr>([\s\S]*?)<\/w:sectPr>(\s*<\/w:body>)/, (_, inner, end) =>
      `<w:sectPr>${refs}${inner.replace(/<w:pgSz\b[^>]*\/>|<w:pgMar\b[^>]*\/>/g, "")}${tail}</w:sectPr>${end}`);
  }
  return xml.replace(/<\/w:body>/, `<w:sectPr>${refs}${tail}</w:sectPr></w:body>`);
}

export function brandRels(xml) {
  const add =
    '<Relationship Id="rIdOwHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header-ow.xml" />' +
    '<Relationship Id="rIdOwFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer-ow.xml" />';
  return xml.replace(/<\/Relationships>/, `${add}</Relationships>`);
}

export function brandContentTypes(xml) {
  let out = xml;
  if (!/Extension="png"/i.test(out)) out = out.replace(/<Types([^>]*)>/, '<Types$1><Default Extension="png" ContentType="image/png" />');
  return out.replace(
    /<\/Types>/,
    '<Override PartName="/word/header-ow.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml" />' +
      '<Override PartName="/word/footer-ow.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml" /></Types>',
  );
}

export function brandCore(xml, title, lang) {
  let out = xml.replace(/<dc:title>[\s\S]*?<\/dc:title>|<dc:title\s*\/>/, `<dc:title>${xmlEscape(title)}</dc:title>`);
  if (!/<dc:title>/.test(out)) out = out.replace(/<\/cp:coreProperties>/, `<dc:title>${xmlEscape(title)}</dc:title></cp:coreProperties>`);
  out = out.replace(/<dc:language>[\s\S]*?<\/dc:language>/, `<dc:language>${xmlEscape(lang)}</dc:language>`);
  return out;
}

export function brandDocx(docxPath, brand, { title, banner, workDir }) {
  const dir = join(workDir, "docx");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  let r = run("unzip", ["-q", docxPath, "-d", dir]);
  if (r.status !== 0) throw failed(`could not open the Word file pandoc wrote: ${oneLine(r.stderr)}`);
  const edit = (rel, fn) => writeFileSync(join(dir, rel), fn(readFileSync(join(dir, rel), "utf8")));
  edit("word/styles.xml", (x) => brandStyles(x, brand));
  edit("word/document.xml", (x) => brandDocument(x, brand));
  edit("word/_rels/document.xml.rels", (x) => brandRels(x));
  edit("[Content_Types].xml", brandContentTypes);
  edit("docProps/core.xml", (x) => brandCore(x, title, brand.lang));
  writeFileSync(join(dir, "word", "header-ow.xml"), headerXml(brand, banner));
  writeFileSync(join(dir, "word", "footer-ow.xml"), footerXml(brand));
  if (brand.logoPath) {
    mkdirSync(join(dir, "word", "media"), { recursive: true });
    copyFileSync(brand.logoPath, join(dir, "word", "media", "ow-logo.png"));
    writeFileSync(
      join(dir, "word", "_rels", "header-ow.xml.rels"),
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rIdOwLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/ow-logo.png" /></Relationships>',
    );
  }
  rmSync(docxPath, { force: true });
  // -nw: "[Content_Types].xml" is a literal name, not a wildcard class.
  r = run("zip", ["-X", "-q", "-nw", docxPath, "[Content_Types].xml"], { cwd: dir });
  if (r.status === 0) r = run("zip", ["-X", "-q", "-nw", "-r", docxPath, ".", "-x", "[Content_Types].xml"], { cwd: dir });
  if (r.status !== 0) throw failed(`could not write the branded Word file: ${oneLine(r.stderr)}`);
}
