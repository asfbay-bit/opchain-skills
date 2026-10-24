// `ow-tools export <sheet-folder> --formats xlsx` (design §5.9, amendment
// T6): CSV files plus a formula map (`model.md`) → an XLSX with formulas,
// number formats, one bold frozen header row per sheet and, when
// `sources.csv` is given, a Sources sheet. Node built-ins only (XLSX is
// zipped XML). Refusals name `sheet!cell` only, never a value.
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { refused, usage } from "./core.mjs";
import { xmlEscape } from "./docx.mjs";
import { zip } from "./zip.mjs";

const MAX_CSV_BYTES = 10 * 1024 * 1024;
const SHEET_NAME = /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,30}$/;

// Functions a sheet may use. Nothing that reaches outside the workbook
// (WEBSERVICE, HYPERLINK, FILTERXML, RTD, DDE, CALL, REGISTER) and nothing
// that builds a reference from text (INDIRECT, OFFSET).
export const FUNCTIONS = Object.freeze([
  "ABS", "AND", "AVERAGE", "COUNT", "COUNTA", "COUNTIF", "IF", "IFERROR", "MAX", "MIN", "NOT", "OR",
  "ROUND", "ROUNDDOWN", "ROUNDUP", "SUM", "SUMIF", "SUMPRODUCT",
]);
const ALLOWED_FN = new Set(FUNCTIONS);
const OUTWARD_FN = new Set(["WEBSERVICE", "HYPERLINK", "FILTERXML", "RTD", "DDE", "DDEAUTO", "CALL", "REGISTER", "REGISTER.ID", "IMPORTXML", "IMPORTDATA", "IMPORTRANGE", "IMAGE"]);

export const FORMATS = {
  text: { id: 49 },
  integer: { id: 3 },
  decimal: { id: 4 },
  percent: { id: 10 },
  date: { id: 164, code: "yyyy-mm-dd" },
};

// ---- CSV (RFC 4180) --------------------------------------------------------
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += c;
    } else if (c === '"' && cell === "") q = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (q) throw usage("a CSV file has an unclosed quoted field");
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// ---- cell references -------------------------------------------------------
export function colNum(letters) {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}
export function colName(n) {
  let s = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}
// Excel's grid (F-019): columns A to XFD, rows 1 to 1,048,576.
export const MAX_ROWS = 1048576;
export const MAX_COLS = 16384;
const CELL = /^\$?([A-Za-z]{1,3})\$?([1-9][0-9]{0,6})$/;
export function parseCell(ref) {
  const m = CELL.exec(ref);
  if (!m) return null;
  const col = colNum(m[1]);
  if (col > MAX_COLS || Number(m[2]) > MAX_ROWS) return null;
  return { col, row: Number(m[2]), name: `${m[1].toUpperCase()}${m[2]}` };
}
function parseRange(ref) {
  const [a, b] = ref.split(":");
  const s = parseCell(a);
  const e = b === undefined ? s : parseCell(b);
  if (!s || !e) return null;
  return { r1: Math.min(s.row, e.row), r2: Math.max(s.row, e.row), c1: Math.min(s.col, e.col), c2: Math.max(s.col, e.col) };
}

// ---- model.md --------------------------------------------------------------
// Sections `## Sheet: <name>` (the CSV file `<name>.csv`), each with one
// table `| Cell | Formula | Format |`. Everything else is prose and ignored.
export function parseModel(text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let banner = null;
  let title = null;
  let i = 0;
  if (lines[0] === "---") {
    const end = lines.indexOf("---", 1);
    if (end > 0 && lines.slice(1, end).some((l) => /^ow_artefact:/.test(l))) {
      i = end + 1;
      const next = lines[i] ?? "";
      if (next.trim() && !/^\s{0,3}#/.test(next)) {
        banner = next.trim();
        i++;
      }
    }
  }
  const sheets = [];
  let cur = null;
  let header = null;
  // model.md is Markdown the skills write, so an internal marker in it would
  // look honoured and isn't: any comment mentioning "internal" stops the
  // export (SA-018 / F-020), as in Markdown export.
  const text2 = lines.join("\n");
  for (const m of text2.matchAll(/<!--[\s\S]*?(?:-->|$)/g)) {
    if (/internal/i.test(m[0])) {
      const at = text2.slice(0, m.index).split("\n").length;
      throw refused("preflight", `model.md line ${at}: an internal-section marker or a comment mentioning "internal"; a workbook has no internal sections, so move that sheet out of the folder`, { line: at });
    }
  }
  for (; i < lines.length; i++) {
    const l = lines[i];
    const where = `model.md line ${i + 1}`;
    const h1 = /^#\s+(.+?)\s*$/.exec(l);
    if (h1 && title === null) title = h1[1].replace(/^Model:\s*/i, "");
    const h2 = /^##\s+Sheet:\s*(.+?)\s*$/i.exec(l);
    if (h2) {
      if (!SHEET_NAME.test(h2[1])) throw usage(`${where}: a sheet name must be 1-31 letters, digits, spaces, ".", "_" or "-"`);
      if (sheets.some((s) => s.name.toLowerCase() === h2[1].toLowerCase())) throw usage(`${where}: that sheet appears twice`);
      cur = { name: h2[1], line: i + 1, cells: [] };
      sheets.push(cur);
      header = null;
      continue;
    }
    if (/^##\s/.test(l)) {
      cur = null;
      continue;
    }
    if (!cur || !/^\s*\|/.test(l)) {
      header = l.trim() === "" ? header : null;
      continue;
    }
    const cells = l.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
    if (!header) {
      header = cells.map((c) => c.toLowerCase());
      if (header[0] !== "cell" || header[1] !== "formula") throw usage(`${where}: a formula table starts | Cell | Formula | Format |`);
      continue;
    }
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
    const [cell = "", formula = "", format = ""] = cells;
    cur.cells.push({ line: i + 1, cell: cell.replace(/`/g, ""), formula: formula.replace(/^`|`$/g, ""), format: format.replace(/`/g, "") });
  }
  return { title, banner, sheets };
}

// ---- formulas --------------------------------------------------------------
const TOKEN = new RegExp(
  [
    String.raw`(?<str>"(?:[^"]|"")*")`,
    String.raw`(?<qref>'(?:[^']|'')+'!\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?)`,
    String.raw`(?<sref>[A-Za-z_][A-Za-z0-9_.]*!\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?)`,
    String.raw`(?<fn>[A-Za-z][A-Za-z0-9.]*)\s*(?=\()`,
    String.raw`(?<ref>\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?)(?![A-Za-z0-9_(!])`,
    String.raw`(?<bool>TRUE|FALSE)(?![A-Za-z0-9_(])`,
    String.raw`(?<num>\d+(?:\.\d+)?(?:[Ee][+-]?\d+)?%?)`,
    String.raw`(?<op><>|<=|>=|[-+*/^&=<>(),:])`,
    String.raw`(?<sp>\s+)`,
  ].join("|"),
  "y",
);

// Returns the formula text to store (no leading "=") and every reference in
// it, or throws a refusal naming `where` (sheet!cell) and a reason code.
export function checkFormula(formula, where) {
  if (!formula.startsWith("=")) throw usage(`${where}: a formula starts with "="`);
  const body = formula.slice(1);
  if (/[|]/.test(body)) throw refused("dde-or-link-formula", `${where}: a DDE-style formula is never written`, { cell: where });
  if (/[[\]]/.test(body)) throw refused("external-reference", `${where}: a reference to another workbook is never written`, { cell: where });
  const out = [];
  const refs = [];
  let depth = 0;
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < body.length) {
    const at = TOKEN.lastIndex;
    const m = TOKEN.exec(body);
    if (!m || m.index !== at) throw refused("formula-syntax", `${where}: the formula has something ow-tools does not write (only cell references, the allowed functions, numbers, text and operators)`, { cell: where });
    const g = m.groups;
    if (g.fn) {
      const name = g.fn.toUpperCase();
      if (OUTWARD_FN.has(name)) throw refused("dde-or-link-formula", `${where}: a function that reaches outside the workbook is never written`, { cell: where });
      if (!ALLOWED_FN.has(name)) throw refused("function-not-allowed", `${where}: a function outside the allowed list (${FUNCTIONS.join(", ")})`, { cell: where });
      out.push(name);
    } else if (g.qref || g.sref) {
      const t = g.qref || g.sref;
      const bang = t.lastIndexOf("!");
      let sheet = t.slice(0, bang);
      if (sheet.startsWith("'")) sheet = sheet.slice(1, -1).replace(/''/g, "'");
      const range = t.slice(bang + 1);
      refs.push({ sheet, range });
      out.push(`${t.slice(0, bang + 1)}${range.toUpperCase()}`);
    } else if (g.ref) {
      refs.push({ sheet: null, range: g.ref });
      out.push(g.ref.toUpperCase());
    } else if (g.op) {
      if (g.op === "(") depth++;
      if (g.op === ")" && --depth < 0) throw refused("formula-syntax", `${where}: unbalanced parentheses`, { cell: where });
      out.push(g.op);
    } else out.push(m[0]);
  }
  if (depth !== 0) throw refused("formula-syntax", `${where}: unbalanced parentheses`, { cell: where });
  return { text: out.join(""), refs };
}

// ---- read the folder -------------------------------------------------------
function readCsvFile(path) {
  const st = lstatSync(path);
  if (!st.isFile()) throw refused("not-a-file", `${basename(path)} is not a regular file (a symlink is not read)`);
  if (st.size > MAX_CSV_BYTES) throw usage(`${basename(path)} is over 10 MB`);
  const rows = parseCsv(readFileSync(path, "utf8"));
  if (rows.length > MAX_ROWS) throw usage(`${basename(path)} has more rows than a worksheet holds (${MAX_ROWS})`);
  const wide = rows.findIndex((r) => r.length > MAX_COLS);
  if (wide >= 0) throw usage(`${basename(path)} row ${wide + 1} has more columns than a worksheet holds (${MAX_COLS})`);
  return rows;
}

const isNumber = (v) => /^-?(\d+|\d*\.\d+)$/.test(v);
const FORMULA_LIKE = /^[=+\-@]/;

export function readSheetFolder(dir) {
  const names = readdirSync(dir).filter((n) => /\.csv$/i.test(n)).sort();
  const modelPath = join(dir, "model.md");
  let model = { title: null, banner: null, sheets: [] };
  try {
    if (lstatSync(modelPath).isFile()) model = parseModel(readFileSync(modelPath, "utf8"));
    else throw refused("not-a-file", "model.md is not a regular file (a symlink is not read)");
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
    throw usage("the sheet folder needs a model.md (the formula map), even when no cell is computed");
  }
  const sourcesFile = names.find((n) => n.toLowerCase() === "sources.csv");
  const dataFiles = names.filter((n) => n !== sourcesFile);
  if (dataFiles.length === 0) throw usage("the sheet folder has no CSV file");
  const sheets = new Map();
  for (const f of dataFiles) {
    const name = f.slice(0, -4);
    if (!SHEET_NAME.test(name)) throw usage(`${f}: a sheet name (the file name) must be 1-31 letters, digits, spaces, ".", "_" or "-"`);
    if (name.toLowerCase() === "sources") throw usage("sources.csv is the Sources sheet; rename the other file");
    sheets.set(name, { name, rows: readCsvFile(join(dir, f)), map: new Map(), formats: [] });
  }
  if (sourcesFile) sheets.set("Sources", { name: "Sources", rows: readCsvFile(join(dir, sourcesFile)), map: new Map(), formats: [], sources: true });
  // Scoping: a CSV that model.md doesn't name never ships (SA-018). Each data
  // sheet needs its `## Sheet:` section; Sources is the one exception.
  for (const name of sheets.keys()) {
    if (name !== "Sources" && !model.sheets.some((s) => s.name === name)) {
      // OD-8 (owner, 2026-10-17): its own reason, so a caller can tell it from
      // a model that names a missing CSV (unknown-sheet).
      throw refused("sheet-not-in-model", `${name}.csv has no "## Sheet: ${name}" section in model.md; only the sheets model.md names are exported`, { sheet: name });
    }
  }
  const order = model.sheets.map((s) => s.name);
  if (sourcesFile) order.push("Sources");
  return { model, sheets, order };
}

// ---- build -----------------------------------------------------------------
function formatFor(spec, where, numFmts) {
  if (!spec) return null;
  const cur = /^currency:([A-Z]{3})$/.exec(spec);
  if (cur) {
    const code = `"${cur[1]} "#,##0.00`;
    if (!numFmts.has(code)) numFmts.set(code, 165 + numFmts.size);
    return numFmts.get(code);
  }
  if (!FORMATS[spec]) throw usage(`${where}: format must be one of ${Object.keys(FORMATS).join(", ")} or currency:XXX`);
  if (FORMATS[spec].code) numFmts.set(FORMATS[spec].code, FORMATS[spec].id);
  return FORMATS[spec].id;
}

export function buildWorkbook({ sheets, order, model }, { title } = {}) {
  const numFmts = new Map();
  for (const ms of model.sheets) {
    const sh = sheets.get(ms.name);
    if (!sh) throw refused("unknown-sheet", `model.md line ${ms.line}: no CSV file for that sheet`, { line: ms.line });
    for (const c of ms.cells) {
      const range = parseRange(c.cell);
      const at = `${ms.name}!${c.cell}`;
      if (!range) throw usage(`model.md line ${c.line}: the Cell column takes a reference like D5 or D2:D9`);
      const fmt = formatFor(c.format, at, numFmts);
      if (c.formula) {
        if (range.r1 !== range.r2 || range.c1 !== range.c2) throw usage(`model.md line ${c.line}: a formula goes in one cell, not a range`);
        const name = `${colName(range.c1)}${range.r1}`;
        const where = `${ms.name}!${name}`;
        if (range.r1 === 1) throw refused("formula-in-header", `${where}: row 1 is the header row; a formula can't go there`, { cell: where });
        if (sh.map.has(name)) throw usage(`model.md line ${c.line}: ${where} has two formulas`);
        const typed = sh.rows[range.r1 - 1]?.[range.c1 - 1];
        if (typed !== undefined && typed.trim() !== "") {
          throw refused("typed-value-in-formula-cell", `${where}: the CSV has a typed value where model.md gives a formula; leave that cell empty`, { cell: where });
        }
        sh.map.set(name, { ...checkFormula(c.formula, where), row: range.r1, col: range.c1, fmt });
      } else if (fmt !== null) sh.formats.push({ range, fmt });
    }
  }
  // Every reference must land on a sheet that exists, inside its extent.
  const extent = (sh) => {
    let rows = sh.rows.length;
    let cols = Math.max(0, ...sh.rows.map((r) => r.length));
    for (const f of sh.map.values()) {
      rows = Math.max(rows, f.row);
      cols = Math.max(cols, f.col);
    }
    return { rows, cols };
  };
  const extents = new Map([...sheets.values()].map((sh) => [sh.name, extent(sh)]));
  for (const sh of sheets.values()) {
    for (const [name, f] of sh.map) {
      const where = `${sh.name}!${name}`;
      for (const r of f.refs) {
        const target = r.sheet === null ? sh.name : [...sheets.keys()].find((k) => k.toLowerCase() === r.sheet.toLowerCase());
        if (!target) throw refused("unknown-sheet", `${where}: a reference to a sheet that isn't in the workbook`, { cell: where });
        const range = parseRange(r.range);
        const ext = extents.get(target);
        if (!range || range.r2 > ext.rows || range.c2 > ext.cols) {
          throw refused("unknown-cell", `${where}: a reference to a cell outside the ${target === sh.name ? "same" : "other"} sheet's data`, { cell: where });
        }
      }
    }
  }

  // Styles: one xf per (bold, number format, quote-prefix) combination.
  const xfs = [{ bold: false, fmt: 0, quote: false }];
  const xf = (bold, fmt, quote) => {
    const k = xfs.findIndex((x) => x.bold === bold && x.fmt === (fmt ?? 0) && x.quote === quote);
    if (k >= 0) return k;
    xfs.push({ bold, fmt: fmt ?? 0, quote });
    return xfs.length - 1;
  };

  const sheetXml = order.map((name) => {
    const sh = sheets.get(name);
    const fmtAt = (row, col) => {
      let found = null;
      for (const f of sh.formats) if (row >= f.range.r1 && row <= f.range.r2 && col >= f.range.c1 && col <= f.range.c2) found = f.fmt;
      return found;
    };
    const { rows, cols } = extents.get(name);
    // Sparse (F-019): only cells that hold something are visited, so a
    // formula at XFD1048576 costs one cell, not 17 billion.
    const csvCols = Math.max(0, ...sh.rows.map((r) => r.length));
    const widths = new Array(csvCols).fill(10);
    const byRow = new Map();
    const mark = (r, c) => (byRow.get(r) || byRow.set(r, new Set()).get(r)).add(c);
    sh.rows.forEach((row, ri) => row.forEach((v, ci) => v !== "" && mark(ri + 1, ci + 1)));
    for (const f of sh.map.values()) mark(f.row, f.col);
    const rowXml = [];
    for (const r of [...byRow.keys()].sort((a, b) => a - b)) {
      const cells = [];
      for (const c of [...byRow.get(r)].sort((a, b) => a - b)) {
        const ref = `${colName(c)}${r}`;
        const f = sh.map.get(ref);
        if (f) {
          cells.push(`<c r="${ref}" s="${xf(false, f.fmt, false)}"><f>${xmlEscape(f.text)}</f></c>`);
          continue;
        }
        const v = sh.rows[r - 1]?.[c - 1];
        if (v === undefined || v === "") continue;
        if (c <= csvCols) widths[c - 1] = Math.min(60, Math.max(widths[c - 1], v.length + 2));
        const head = r === 1;
        const fmt = head ? null : fmtAt(r, c);
        if (!head && fmt === FORMATS.date.id && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
          const serial = Math.round((Date.UTC(+v.slice(0, 4), +v.slice(5, 7) - 1, +v.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 86400000);
          cells.push(`<c r="${ref}" s="${xf(false, fmt, false)}"><v>${serial}</v></c>`);
        } else if (!head && isNumber(v) && fmt !== FORMATS.text.id) {
          cells.push(`<c r="${ref}" s="${xf(false, fmt, false)}"><v>${v}</v></c>`);
        } else {
          // Text, including text that looks like a formula: a string, never <f>.
          const s = xf(head, head ? null : fmt, FORMULA_LIKE.test(v));
          cells.push(`<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(v)}</t></is></c>`);
        }
      }
      if (cells.length) rowXml.push(`<row r="${r}">${cells.join("")}</row>`);
    }
    const banner = model.banner ? `<headerFooter><oddHeader>${xmlEscape(`&C${model.banner.replace(/&/g, "&&")}`)}</oddHeader></headerFooter>` : "";
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      `<dimension ref="A1:${colName(Math.max(cols, 1))}${Math.max(rows, 1)}"/>` +
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="15"/>' +
      (csvCols ? `<cols>${widths.map((w, k) => `<col min="${k + 1}" max="${k + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "") +
      `<sheetData>${rowXml.join("")}</sheetData>` +
      '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>' +
      banner +
      "</worksheet>"
    );
  });

  const custom = [...numFmts.entries()].filter(([, id]) => id >= 164).sort((a, b) => a[1] - b[1]);
  const styles =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    (custom.length ? `<numFmts count="${custom.length}">${custom.map(([code, id]) => `<numFmt numFmtId="${id}" formatCode="${xmlEscape(code)}"/>`).join("")}</numFmts>` : "") +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    `<cellXfs count="${xfs.length}">${xfs
      .map((x) => `<xf numFmtId="${x.fmt}" fontId="${x.bold ? 1 : 0}" fillId="0" borderId="0" xfId="0"${x.bold ? ' applyFont="1"' : ""}${x.fmt ? ' applyNumberFormat="1"' : ""}${x.quote ? ' quotePrefix="1"' : ""}/>`)
      .join("")}</cellXfs>` +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    "</styleSheet>";

  const workbook =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<bookViews><workbookView xWindow="0" yWindow="0" windowWidth="16000" windowHeight="10000"/></bookViews>' +
    `<sheets>${order.map((n, k) => `<sheet name="${xmlEscape(n)}" sheetId="${k + 1}" r:id="rId${k + 1}"/>`).join("")}</sheets>` +
    '<calcPr calcId="191029" fullCalcOnLoad="1"/>' +
    "</workbook>";
  const wbRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    order.map((_, k) => `<Relationship Id="rId${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${k + 1}.xml"/>`).join("") +
    `<Relationship Id="rId${order.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    "</Relationships>";
  const types =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    order.map((_, k) => `<Override PartName="/xl/worksheets/sheet${k + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    "</Types>";
  const rootRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    "</Relationships>";
  const core =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    `<dc:title>${xmlEscape(title || model.title || "Workbook")}</dc:title>` +
    "</cp:coreProperties>";

  return zip([
    { name: "[Content_Types].xml", data: types },
    { name: "_rels/.rels", data: rootRels },
    { name: "docProps/core.xml", data: core },
    { name: "xl/workbook.xml", data: workbook },
    { name: "xl/_rels/workbook.xml.rels", data: wbRels },
    { name: "xl/styles.xml", data: styles },
    ...sheetXml.map((x, k) => ({ name: `xl/worksheets/sheet${k + 1}.xml`, data: x })),
  ]);
}
