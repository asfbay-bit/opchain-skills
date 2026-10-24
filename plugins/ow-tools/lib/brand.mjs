// brand.yaml (design §5.2): a strict reader for one small, documented shape,
// and the WCAG contrast rules the exported documents are built to. Anything
// outside the shape is refused by name rather than guessed at.
import { readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { isFile, refused } from "./core.mjs";

const SHAPE = {
  schema: "scalar",
  name: "scalar",
  logo: "scalar",
  logo_alt: "scalar",
  colors: { text: "scalar", background: "scalar", primary: "scalar", accent: "scalar" },
  fonts: { heading: "scalar", body: "scalar" },
  footer: "scalar",
  lang: "scalar",
  page: "scalar",
};

export const NEUTRAL = {
  schema: 1,
  name: "",
  logo: null,
  logo_alt: null,
  colors: { text: "#1A1A1A", background: "#FFFFFF", primary: "#1F3A5F", accent: "#2B5D8A" },
  fonts: { heading: null, body: null },
  footer: "",
  lang: "en-US",
  page: "letter",
};

function stripComment(s) {
  let q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === "\\" && q === '"') i++;
      else if (c === q) q = null;
    } else if (c === '"' || c === "'") q = c;
    else if (c === "#" && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i);
  }
  return s;
}

function scalar(raw, where) {
  const s = raw.trim();
  if (s.startsWith('"')) {
    const m = /^"((?:[^"\\]|\\.)*)"$/.exec(s);
    if (!m) throw refused("brand-invalid", `brand.yaml ${where}: unterminated or extra text after a quoted value`);
    return m[1].replace(/\\(.)/g, (_, c) => (c === "n" ? " " : c));
  }
  if (s.startsWith("'")) {
    const m = /^'((?:[^']|'')*)'$/.exec(s);
    if (!m) throw refused("brand-invalid", `brand.yaml ${where}: unterminated or extra text after a quoted value`);
    return m[1].replace(/''/g, "'");
  }
  if (/^[&*!|>[\]@`%]/.test(s) || s === "-" || s.startsWith("- ")) {
    throw refused("brand-invalid", `brand.yaml ${where}: anchors, tags, lists and multi-line values are not supported; write a plain value`);
  }
  return s;
}

function flowMap(raw, where) {
  const body = raw.trim().slice(1, -1);
  const out = {};
  let cur = "";
  let q = null;
  const parts = [];
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (q) {
      cur += c;
      if (c === "\\" && q === '"') cur += body[++i] ?? "";
      else if (c === q) q = null;
    } else if (c === '"' || c === "'") {
      q = c;
      cur += c;
    } else if (c === ",") {
      parts.push(cur);
      cur = "";
    } else if (c === "{" || c === "}") {
      throw refused("brand-invalid", `brand.yaml ${where}: nested braces are not supported`);
    } else cur += c;
  }
  if (cur.trim()) parts.push(cur);
  for (const p of parts) {
    const m = /^\s*([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(p);
    if (!m) throw refused("brand-invalid", `brand.yaml ${where}: could not read one entry of the { } map`);
    out[m[1]] = scalar(m[2], `${where}.${m[1]}`);
  }
  return out;
}

export function parseBrandYaml(text) {
  const root = {};
  let parent = null;
  text.split("\n").forEach((rawLine, i) => {
    const where = `line ${i + 1}`;
    if (/\t/.test(rawLine.replace(/#.*$/, ""))) throw refused("brand-invalid", `brand.yaml ${where}: use spaces, not tabs`);
    const line = stripComment(rawLine).replace(/\s+$/, "");
    if (!line.trim() || line.trim() === "---") return;
    const indent = line.length - line.trimStart().length;
    const m = /^([A-Za-z_][\w-]*)\s*:(?:\s+(.*))?$/.exec(line.trim());
    if (!m) throw refused("brand-invalid", `brand.yaml ${where}: expected "key: value"`);
    const [, key, value = ""] = m;
    if (indent === 0) {
      if (!(key in SHAPE)) throw refused("brand-invalid", `brand.yaml ${where}: unknown key "${key}" (allowed: ${Object.keys(SHAPE).join(", ")})`);
      if (key in root) throw refused("brand-invalid", `brand.yaml ${where}: "${key}" appears twice`);
      if (typeof SHAPE[key] === "object") {
        if (value.trim().startsWith("{")) {
          if (!value.trim().endsWith("}")) throw refused("brand-invalid", `brand.yaml ${where}: a { } map must close on the same line`);
          root[key] = flowMap(value, key);
          parent = null;
        } else if (!value.trim()) {
          root[key] = {};
          parent = key;
        } else throw refused("brand-invalid", `brand.yaml ${where}: "${key}" holds keys, not a single value`);
      } else {
        if (!value.trim()) throw refused("brand-invalid", `brand.yaml ${where}: "${key}" needs a value`);
        root[key] = scalar(value, key);
        parent = null;
      }
    } else {
      if (!parent) throw refused("brand-invalid", `brand.yaml ${where}: unexpected indentation`);
      if (key in root[parent]) throw refused("brand-invalid", `brand.yaml ${where}: "${parent}.${key}" appears twice`);
      root[parent][key] = scalar(value, `${parent}.${key}`);
    }
  });
  for (const [k, sub] of Object.entries(root)) {
    if (typeof sub !== "object") continue;
    for (const kk of Object.keys(sub)) {
      if (!(kk in SHAPE[k])) throw refused("brand-invalid", `brand.yaml: unknown key "${k}.${kk}" (allowed: ${Object.keys(SHAPE[k]).join(", ")})`);
    }
  }
  return root;
}

// WCAG 2.x relative luminance and contrast ratio.
export function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
}

const HEX = /^#[0-9A-Fa-f]{6}$/;
const TEXT_MIN = 4.5;
const LARGE_MIN = 3; // headings H1-H3 are set at 14 pt bold or larger

export function validateBrand(raw, baseDir) {
  const b = {
    ...NEUTRAL,
    ...raw,
    colors: { ...NEUTRAL.colors, ...(raw.colors || {}) },
    fonts: { ...NEUTRAL.fonts, ...(raw.fonts || {}) },
  };
  if (String(b.schema) !== "1") throw refused("brand-invalid", "brand.yaml: schema must be 1");
  b.schema = 1;
  for (const [k, v] of Object.entries(b.colors)) {
    if (!HEX.test(v)) throw refused("brand-invalid", `brand.yaml: colors.${k} must look like "#1A2B3C"`);
    b.colors[k] = v.toUpperCase();
  }
  for (const [k, max] of [["name", 80], ["footer", 120], ["logo_alt", 120]]) {
    if (b[k] != null && (String(b[k]).length > max || /[\u0000-\u001f]/.test(b[k]))) {
      throw refused("brand-invalid", `brand.yaml: ${k} must be one line of at most ${max} characters`);
    }
  }
  for (const k of ["heading", "body"]) {
    if (b.fonts[k] != null && !/^[\w .'-]{1,60}$/.test(b.fonts[k])) throw refused("brand-invalid", `brand.yaml: fonts.${k} is not a font family name`);
  }
  if (!/^[a-z]{2,3}(-[A-Z]{2})?$/.test(b.lang)) throw refused("brand-invalid", `brand.yaml: lang must look like en or en-US`);
  if (!["letter", "a4"].includes(b.page)) throw refused("brand-invalid", `brand.yaml: page must be letter or a4`);
  if (b.logo) {
    if (isAbsolute(b.logo) || b.logo.split(/[\\/]/).includes("..")) throw refused("brand-invalid", "brand.yaml: logo must be a path inside the brand folder (no absolute path, no ..)");
    const abs = resolve(baseDir, b.logo);
    if (!isFile(abs)) throw refused("brand-invalid", "brand.yaml: the logo file was not found");
    const sig = readFileSync(abs).subarray(0, 8).toString("hex");
    if (sig !== "89504e470d0a1a0a") throw refused("brand-invalid", "brand.yaml: logo must be a PNG file (Word needs PNG)");
    if (!b.logo_alt || !String(b.logo_alt).trim()) throw refused("brand-invalid", "brand.yaml: logo_alt is required when logo is set");
    b.logoPath = abs;
  }

  const c = b.colors;
  const ratios = {
    text_on_background: contrast(c.text, c.background),
    headings_on_background: contrast(c.primary, c.background),
  };
  if (ratios.text_on_background < TEXT_MIN) {
    throw refused("brand-contrast", `brand.yaml: text on background is ${ratios.text_on_background}:1; body text needs at least ${TEXT_MIN}:1`);
  }
  if (ratios.headings_on_background < LARGE_MIN) {
    throw refused("brand-contrast", `brand.yaml: primary on background is ${ratios.headings_on_background}:1; headings need at least ${LARGE_MIN}:1`);
  }
  // Black or white always reaches at least 4.58:1 on any colour; take the better.
  const onAccent = [["#FFFFFF", contrast("#FFFFFF", c.accent)], ["#000000", contrast("#000000", c.accent)]].sort((x, y) => y[1] - x[1])[0];
  b.headerText = onAccent[0];
  ratios.table_header = onAccent[1];
  const accentOnBg = contrast(c.accent, c.background);
  b.link = accentOnBg >= TEXT_MIN ? c.accent : c.text; // links are underlined either way
  ratios.links = contrast(b.link, c.background);
  b.ratios = ratios;
  return b;
}

// --brand wins; otherwise the nearest opchain-work/brand.yaml above the file.
export function findBrand(mdPath, explicit) {
  if (explicit) {
    if (!isFile(explicit)) throw refused("brand-missing", "the brand file given with --brand does not exist");
    return resolve(explicit);
  }
  let d = dirname(resolve(mdPath));
  for (;;) {
    if (basename(d) === "opchain-work" && isFile(join(d, "brand.yaml"))) return join(d, "brand.yaml");
    if (isFile(join(d, "opchain-work", "brand.yaml"))) return join(d, "opchain-work", "brand.yaml");
    const up = dirname(d);
    if (up === d) return null;
    d = up;
  }
}

export function loadBrand(mdPath, explicit) {
  const path = findBrand(mdPath, explicit);
  if (!path) return { brand: validateBrand({}, dirname(resolve(mdPath))), path: null };
  return { brand: validateBrand(parseBrandYaml(readFileSync(path, "utf8")), dirname(path)), path };
}
