// `ow-tools health --config health.yaml [--no-network]` (design §5.8,
// amendment T3): read-only checks that ow-care's monthly health check runs.
// It checks only what health.yaml lists, writes nothing in the repository or
// under a listed path, sends no credential, and never reads .npmrc, .pypirc,
// .netrc or a keychain. Every result is OK, attention or not checked (reason).
import { lstatSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { dataHome, nowDate, refused, run, usage, which } from "./core.mjs";
import { HOST } from "./addr.mjs";
import { writePrivate } from "./guards.mjs";
import { LOCKFILES, PLAIN_SEMVER, directDeps, packageSet, projectScope, readLockfile } from "./lockfiles.mjs";
import { DESTINATIONS, NetError, createNet } from "./net.mjs";

// ---- health.yaml -------------------------------------------------------------
const SCALARS = new Set(["schema", "repo", "python", "registry"]);
const LISTS = new Set(["lockfiles", "hosts", "domains", "urls", "backups", "private_scopes"]);
const THRESHOLDS = { cert_days: "days", domain_days: "days", backup_days: "days", advisory: ["low", "moderate", "high", "critical"], outdated: ["major", "minor", "patch"] };
export const DEFAULT_THRESHOLDS = Object.freeze({ cert_days: 30, domain_days: 30, backup_days: 2, advisory: "high", outdated: "major" });
const SCOPE = /^@[a-z0-9][a-z0-9._-]{0,213}$/;
const MAX_ITEMS = 50;

function bad(line, key, what) {
  return refused("config-invalid", `health.yaml line ${line}: ${key}: ${what}`, { line, key });
}

function scalarValue(raw, line, key) {
  const s = raw.trim();
  if (/^[&*!|>[\]{}@`%]/.test(s) || s === "-" || s.startsWith("- ")) throw bad(line, key, "anchors, tags, flow maps and multi-line values are not supported; write a plain value");
  if (s.startsWith('"')) {
    const m = /^"((?:[^"\\]|\\["\\])*)"$/.exec(s);
    if (!m) throw bad(line, key, "an unterminated or escaped quoted value");
    return m[1].replace(/\\(["\\])/g, "$1");
  }
  if (s.startsWith("'")) {
    const m = /^'((?:[^']|'')*)'$/.exec(s);
    if (!m) throw bad(line, key, "an unterminated quoted value");
    return m[1].replace(/''/g, "'");
  }
  if (/\s#/.test(s)) throw bad(line, key, "a comment on a value line; put it on its own line");
  return s;
}

function flowList(raw, line, key) {
  const body = raw.trim().slice(1, -1).trim();
  if (!body) return [];
  if (/[[\]{}]/.test(body)) throw bad(line, key, "nested lists or maps are not supported");
  return body.split(",").map((p) => scalarValue(p, line, key));
}

function flowMap(raw, line, key) {
  const body = raw.trim().slice(1, -1).trim();
  const out = {};
  if (!body) return out;
  if (/[[\]{}]/.test(body)) throw bad(line, key, "nested lists or maps are not supported");
  for (const p of body.split(",")) {
    const m = /^\s*([a-z_]+)\s*:\s*(.+?)\s*$/.exec(p);
    if (!m) throw bad(line, key, "expected { name: value, … }");
    out[m[1]] = { value: scalarValue(m[2], line, `${key}.${m[1]}`), line };
  }
  return out;
}

export function parseHealthYaml(text) {
  const raw = {};
  let block = null; // { key, kind: "list" | "map" }
  text.replace(/\r\n?/g, "\n").split("\n").forEach((rawLine, i) => {
    const line = i + 1;
    if (/\t/.test(rawLine)) throw bad(line, "(line)", "use spaces, not tabs");
    if (!rawLine.trim() || /^\s*#/.test(rawLine) || rawLine.trim() === "---") return;
    const indent = rawLine.length - rawLine.trimStart().length;
    const t = rawLine.trim();
    if (indent === 0) {
      const m = /^([a-z_]+)\s*:(?:\s+(.*))?$/.exec(t);
      if (!m) throw bad(line, "(line)", 'expected "key: value"');
      const [, key, value = ""] = m;
      if (!SCALARS.has(key) && !LISTS.has(key) && key !== "thresholds") throw bad(line, key, `unknown key (allowed: ${[...SCALARS, ...LISTS, "thresholds"].join(", ")})`);
      if (key in raw) throw bad(line, key, "appears twice");
      block = null;
      if (key === "thresholds") {
        if (!value.trim()) {
          raw[key] = { value: {}, line };
          block = { key, kind: "map" };
        } else if (/^\{.*\}$/.test(value.trim())) raw[key] = { value: flowMap(value, line, key), line };
        else throw bad(line, key, "holds names and values, not a single value");
      } else if (LISTS.has(key)) {
        if (!value.trim()) {
          raw[key] = { value: [], line, lines: [] };
          block = { key, kind: "list" };
        } else if (/^\[.*\]$/.test(value.trim())) raw[key] = { value: flowList(value, line, key), line, lines: [] };
        else throw bad(line, key, "is a list: write [a, b] or one '- item' per line");
      } else {
        if (!value.trim()) throw bad(line, key, "needs a value");
        raw[key] = { value: scalarValue(value, line, key), line };
      }
      return;
    }
    if (!block) throw bad(line, "(line)", "unexpected indentation");
    if (block.kind === "list") {
      const m = /^-\s+(.*)$/.exec(t);
      if (!m) throw bad(line, block.key, "a list item starts with '- '");
      raw[block.key].value.push(scalarValue(m[1], line, block.key));
      raw[block.key].lines.push(line);
    } else {
      const m = /^([a-z_]+)\s*:\s+(.+)$/.exec(t);
      if (!m) throw bad(line, block.key, "expected 'name: value'");
      if (m[1] in raw[block.key].value) throw bad(line, `${block.key}.${m[1]}`, "appears twice");
      raw[block.key].value[m[1]] = { value: scalarValue(m[2], line, `${block.key}.${m[1]}`), line };
    }
  });
  return raw;
}

function checkUrlValue(v, line, key) {
  let u;
  try {
    u = new URL(v);
  } catch {
    throw bad(line, key, "not a URL");
  }
  if (u.protocol !== "https:") throw bad(line, key, "only https:// URLs are checked");
  if (u.username || u.password || /^[^/]*\/\/[^/]*@/.test(v)) throw bad(line, key, "a URL with a user name or password is never used; remove it");
  if (u.search) throw bad(line, key, "a URL with a query string is not checked (it can carry a token); list the URL without it");
  if (u.hash) throw bad(line, key, "remove the #fragment");
  if (!HOST.test(u.hostname)) throw bad(line, key, "the host must be a public host name, not an IP address or localhost");
  return u.href;
}

// The strict reader: the documented shape (design §5.8) and nothing else.
export function readHealthConfig(text, baseDir) {
  const raw = parseHealthYaml(text);
  if (raw.schema?.value !== "1") throw bad(raw.schema?.line ?? 1, "schema", "must be 1");
  const at = (key, k) => raw[key].lines?.[k] ?? raw[key].line;
  const list = (key, check) => {
    if (!raw[key]) return [];
    const v = raw[key].value;
    if (v.length > MAX_ITEMS) throw bad(raw[key].line, key, `at most ${MAX_ITEMS} items`);
    return v.map((x, k) => check(x, at(key, k), key));
  };
  const cfg = {
    repo: raw.repo ? resolve(baseDir, raw.repo.value) : null,
    registry: null,
    python: raw.python ? resolve(baseDir, raw.python.value) : null,
    lockfiles: list("lockfiles", (x, line, key) => {
      if (!LOCKFILES.includes(x)) throw bad(line, key, `one of ${LOCKFILES.join(", ")}`);
      return x;
    }),
    hosts: list("hosts", (x, line, key) => {
      const m = /^([^:]+)(?::(\d{1,5}))?$/.exec(x.toLowerCase());
      if (!m || !HOST.test(m[1])) throw bad(line, key, "a public host name (with an optional :port), not an IP address, URL or localhost");
      const port = Number(m[2] || 443);
      if (port < 1 || port > 65535) throw bad(line, key, "port out of range");
      return { host: m[1], port };
    }),
    domains: list("domains", (x, line, key) => {
      if (!HOST.test(x.toLowerCase())) throw bad(line, key, "a registered domain name such as example.com");
      return x.toLowerCase();
    }),
    urls: list("urls", checkUrlValue),
    backups: list("backups", (x) => (isAbsolute(x) ? x : resolve(baseDir, x))),
    private_scopes: list("private_scopes", (x, line, key) => {
      if (!SCOPE.test(x)) throw bad(line, key, "an npm scope such as @acme");
      return x;
    }),
    thresholds: { ...DEFAULT_THRESHOLDS },
  };
  if (raw.registry) {
    if (raw.registry.value !== "public") throw bad(raw.registry.line, "registry", "the only value is public (every package the lockfile doesn't place elsewhere comes from the public npm registry)");
    cfg.registry = "public";
  }
  if (cfg.lockfiles.length && !cfg.repo) throw bad(raw.lockfiles.line, "lockfiles", "needs repo: the folder that holds them");
  for (const [k, { value, line }] of Object.entries(raw.thresholds?.value || {})) {
    const kind = THRESHOLDS[k];
    if (!kind) throw bad(line, `thresholds.${k}`, `unknown (allowed: ${Object.keys(THRESHOLDS).join(", ")})`);
    if (kind === "days") {
      if (!/^\d{1,3}$/.test(value) || Number(value) < 1 || Number(value) > 365) throw bad(line, `thresholds.${k}`, "a whole number of days from 1 to 365");
      cfg.thresholds[k] = Number(value);
    } else {
      if (!kind.includes(value)) throw bad(line, `thresholds.${k}`, `one of ${kind.join(", ")}`);
      cfg.thresholds[k] = value;
    }
  }
  return cfg;
}

// ---- results -----------------------------------------------------------------
const ok = (check, target, detail) => ({ check, target, result: "OK", detail });
const attention = (check, target, detail, extra = {}) => ({ check, target, result: "attention", detail, ...extra });
const notChecked = (check, target, reason) => ({ check, target, result: "not checked", reason });
const SEVERITY = ["low", "moderate", "high", "critical"];
export const ADVISORY_CAP = 200;
const DAY = 86400000;
const daysUntil = (when, now) => Math.floor((when.getTime() - now.getTime()) / DAY);

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const k = next++;
        out[k] = await fn(items[k], k);
      }
    }),
  );
  return out;
}

const netReason = (err) => (err instanceof NetError ? err.reason : "unreachable");
const encodeName = (name) => (name.startsWith("@") ? `@${encodeURIComponent(name.slice(1))}` : encodeURIComponent(name));
const major = (v) => {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v || ""));
  return m ? m.slice(1, 4).map(Number) : null;
};

function behind(installed, latest, level) {
  const a = major(installed);
  const b = major(latest);
  if (!a || !b) return null;
  // Below 1.0 a minor release is the breaking one.
  if (level === "major") return a[0] === 0 && b[0] === 0 ? b[1] > a[1] : b[0] > a[0];
  if (level === "minor") return b[0] > a[0] || (b[0] === a[0] && b[1] > a[1]);
  return b[0] > a[0] || (b[0] === a[0] && (b[1] > a[1] || (b[1] === a[1] && b[2] > a[2])));
}

// ---- dependency checks ----------------------------------------------------------
function lockfilePackages(cfg) {
  if (!cfg.repo) return null;
  const names = cfg.lockfiles.length ? cfg.lockfiles : LOCKFILES;
  const found = [];
  for (const n of names) {
    const r = readLockfile(join(cfg.repo, n));
    if (r.error === "no lockfile" && !cfg.lockfiles.length) continue;
    found.push({ file: n, ...r });
  }
  return found;
}

// Which packages may be sent: public registry only, never a private scope,
// and "unrecorded" (pnpm, yarn berry) only when health.yaml says registry: public.
// The project's own npm scope (from package.json's name) is held back like a
// listed private scope (SA-014). A version that isn't plain semver (a URL, a
// git spec, an alias or a path) is never sent, whatever `registry` says (OD-1).
export function sendable(pkgs, cfg) {
  const scopes = [...cfg.private_scopes, ...(cfg.ownScope ? [cfg.ownScope] : [])];
  const send = [];
  const held = [];
  for (const p of pkgs) {
    const privateScope = scopes.some((s) => p.name.startsWith(`${s}/`));
    const plain = PLAIN_SEMVER.test(String(p.version));
    if (!privateScope && plain && (p.source === "public" || (p.source === "unrecorded" && cfg.registry === "public"))) send.push(p);
    else {
      const why = privateScope ? "private scope" : p.source === "local" ? "local package" : !plain || p.source === "private" ? "private registry" : "registry not recorded in the lockfile";
      held.push({ ...p, why });
    }
  }
  return { send, held };
}

// CVSS 3.x base score from a vector, for advisories without a named
// severity (SA-012), by the 3.1 specification and its Roundup (R09: a 7.0
// is 7.0, so high). Anything else is "unknown", which is never OK.
export function cvss3Score(vector) {
  const m = /^CVSS:3\.[01]\/(.*)$/.exec(String(vector || ""));
  if (!m) return null;
  const v = Object.fromEntries(m[1].split("/").map((kv) => kv.split(":")));
  const W = { AV: { N: 0.85, A: 0.62, L: 0.55, P: 0.2 }, AC: { L: 0.77, H: 0.44 }, UI: { N: 0.85, R: 0.62 }, CIA: { H: 0.56, L: 0.22, N: 0 } };
  const changed = v.S === "C";
  const PR = { N: 0.85, L: changed ? 0.68 : 0.62, H: changed ? 0.5 : 0.27 }[v.PR];
  const [av, ac, ui, c, i, a] = [W.AV[v.AV], W.AC[v.AC], W.UI[v.UI], W.CIA[v.C], W.CIA[v.I], W.CIA[v.A]];
  if ([av, ac, ui, c, i, a, PR].some((x) => x === undefined) || !["U", "C"].includes(v.S)) return null;
  const iss = 1 - (1 - c) * (1 - i) * (1 - a);
  const impact = changed ? 7.52 * (iss - 0.029) - 3.25 * (iss - 0.02) ** 15 : 6.42 * iss;
  const expl = 8.22 * av * ac * PR * ui;
  const roundUp = (x) => {
    const n = Math.round(x * 100000);
    return n % 10000 === 0 ? n / 100000 : (Math.floor(n / 10000) + 1) / 10;
  };
  return impact <= 0 ? 0 : roundUp(Math.min(changed ? 1.08 * (impact + expl) : impact + expl, 10));
}
// The published bands: 9.0+ critical, 7.0–8.9 high, 4.0–6.9 medium, below low.
export function cvss3Severity(vector) {
  const score = cvss3Score(vector);
  if (score === null) return null;
  return score >= 9 ? "critical" : score >= 7 ? "high" : score >= 4 ? "moderate" : "low";
}

// A malware entry is critical whatever severity it also names (R10): the MAL-
// check comes first and stays first.
export function rateAdvisory(j) {
  const id = String(j?.id || "");
  if (/^MAL-/.test(id) || j?.database_specific?.["malicious-packages-origins"]) return "critical";
  const s = String(j?.database_specific?.severity || "").toLowerCase();
  if (s === "medium") return "moderate";
  if (SEVERITY.includes(s)) return s;
  for (const sev of Array.isArray(j?.severity) ? j.severity : []) {
    const r = /^CVSS_V3/.test(sev?.type || "") ? cvss3Severity(sev.score) : null;
    if (r) return r;
  }
  return "unknown";
}

// 1.1.1 (Bug 4): a batch answer whose length doesn't match its queries is
// never read by position. Each package in that batch is asked on its own
// (`POST /v1/query`, the same name and version), at most this many in a run;
// the rest are attention.
export const REQUERY_CAP = 50;
const affectedNames = (j) => (Array.isArray(j?.affected) ? new Set(j.affected.filter((a) => !a?.package?.ecosystem || a.package.ecosystem === "npm").map((a) => String(a?.package?.name ?? ""))) : null);

async function advisories(net, file, pkgs, cfg, { requeryCap = REQUERY_CAP } = {}) {
  const { send, held } = sendable(pkgs, cfg);
  const results = held.map((p) => notChecked("advisories", `${file}: ${p.name}@${p.version}`, p.why === "registry not recorded in the lockfile" ? "registry not recorded in the lockfile; add registry: public to health.yaml if every package comes from the public npm registry" : p.why));
  if (!send.length) return results;
  const hits = new Map(); // id → [pkg]
  // Bug 5 (round 3): a reply ow-tools can't fully read never becomes OK.
  const flags = new Map(); // "name@version" → [why]
  const flag = (p, why) => (flags.get(`${p.name}@${p.version}`) || flags.set(`${p.name}@${p.version}`, []).get(`${p.name}@${p.version}`)).push(why);
  let requeried = 0;
  // One query's answer, for exactly that package.
  const attribute = (p, res) => {
    if (!res || typeof res !== "object" || Array.isArray(res)) return flag(p, "the advisory service gave no answer for it");
    if (res.next_page_token) flag(p, "the advisory service has more advisories for it than one page");
    if (res.vulns !== undefined && !Array.isArray(res.vulns)) return flag(p, "the advisory service answered with an unexpected shape");
    for (const v of res.vulns || []) {
      if (typeof v?.id !== "string" || !/^[A-Za-z0-9._:-]{1,80}$/.test(v.id)) {
        flag(p, "an advisory id ow-tools couldn't read");
        continue;
      }
      if (!hits.has(v.id)) hits.set(v.id, []);
      hits.get(v.id).push(p);
    }
  };
  for (let k = 0; k < send.length; k += 1000) {
    const batch = send.slice(k, k + 1000);
    const body = { queries: batch.map((p) => ({ package: { name: p.name, ecosystem: "npm" }, version: p.version })) };
    let r;
    try {
      r = await net.request(`https://${DESTINATIONS.osv}/v1/querybatch`, { method: "POST", body, cap: 4 * 1024 * 1024 });
    } catch (err) {
      return [...results, notChecked("advisories", file, netReason(err))];
    }
    if (r.status !== 200) return [...results, notChecked("advisories", file, `advisory service answered ${r.status}`)];
    let j;
    try {
      j = JSON.parse(r.body.toString("utf8"));
    } catch {
      return [...results, notChecked("advisories", file, "advisory service answered with something unreadable")];
    }
    const replies = Array.isArray(j?.results) ? j.results : null;
    if (replies && replies.length === batch.length) {
      batch.forEach((p, n) => attribute(p, replies[n]));
      continue;
    }
    for (const p of batch) {
      if (requeried >= requeryCap) {
        flag(p, `the advisory service's batch answer didn't line up with the queries, and it wasn't asked again on its own (more than ${requeryCap})`);
        continue;
      }
      requeried++;
      let one;
      try {
        const r1 = await net.request(`https://${DESTINATIONS.osv}/v1/query`, { method: "POST", body: { package: { name: p.name, ecosystem: "npm" }, version: p.version }, cap: 4 * 1024 * 1024 });
        if (r1.status !== 200) {
          flag(p, `the advisory service answered ${r1.status} when asked about it on its own`);
          continue;
        }
        one = JSON.parse(r1.body.toString("utf8"));
      } catch {
        flag(p, "the advisory service couldn't be asked about it on its own");
        continue;
      }
      attribute(p, one);
    }
  }
  // Fail closed (SA-012): a malware entry is critical; an advisory whose
  // severity can't be read, whose detail fetch failed, or that lies past the
  // 200 ow-tools rates, is attention, never OK.
  const all = [...hits.keys()];
  const ids = all.slice(0, ADVISORY_CAP);
  const severity = new Map(all.slice(ADVISORY_CAP).map((id) => [id, "not rated (more than 200 advisories)"]));
  const named = new Map(); // id → the npm packages its detail names
  await pool(ids, 6, async (id) => {
    try {
      const r = await net.request(`https://${DESTINATIONS.osv}/v1/vulns/${encodeURIComponent(id)}`, { cap: 512 * 1024 });
      if (r.status !== 200) throw new Error("not 200");
      const j = JSON.parse(r.body.toString("utf8"));
      severity.set(id, rateAdvisory(j));
      const names = affectedNames(j);
      if (names) named.set(id, names);
    } catch {
      severity.set(id, "unknown (detail not fetched)");
    }
  });
  // 1.1.1 (Bug 4): an advisory whose detail names other packages was
  // attributed to this one by mistake; the package is attention.
  for (const [id, list] of hits) for (const p of list) if (named.has(id) && !named.get(id).has(p.name)) flag(p, `${id} names other packages, so the answer may not be about this one`);
  const min = SEVERITY.indexOf(cfg.thresholds.advisory);
  const byPkg = new Map();
  for (const [id, list] of hits) for (const p of list) (byPkg.get(`${p.name}@${p.version}`) || byPkg.set(`${p.name}@${p.version}`, []).get(`${p.name}@${p.version}`)).push({ id, severity: severity.get(id) || "unknown" });
  for (const k of flags.keys()) if (!byPkg.has(k)) byPkg.set(k, []);
  for (const [k, list] of byPkg) {
    const unrated = list.filter((a) => !SEVERITY.includes(a.severity));
    const odd = flags.get(k) || [];
    const top = odd.length > 0 || unrated.length > 0 || list.some((a) => SEVERITY.indexOf(a.severity) >= min);
    const detail = list.map((a) => `${a.id} (${a.severity})`).join(", ");
    const why = [detail, unrated.length ? "severity not available, so not rated below the threshold" : "", ...odd].filter(Boolean).join("; ");
    results.push(top ? attention("advisories", `${file}: ${k}`, why, { advisories: list }) : { check: "advisories", target: `${file}: ${k}`, result: "OK", detail: `listed below the threshold: ${detail}`, advisories: list });
  }
  const clean = send.length - byPkg.size;
  const summary = `${send.length} package(s) sent to the advisory service; ${clean} with no known advisory`;
  results.push(flags.size ? attention("advisories", file, `${summary}; ${flags.size} whose answer ow-tools couldn't fully read`) : ok("advisories", file, summary));
  return results;
}

async function outdated(net, file, pkgs, cfg) {
  const direct = directDeps(cfg.repo);
  if (!direct) return [notChecked("outdated", file, "no package.json")];
  const { send } = sendable(pkgs, cfg);
  const byName = new Map();
  for (const p of send) {
    const cur = byName.get(p.name);
    if (!cur || (p.direct && !cur.direct) || (!cur.direct && (major(p.version) || [0])[0] > (major(cur.version) || [0])[0])) byName.set(p.name, p);
  }
  const todo = direct.filter((n) => byName.has(n));
  const results = direct.filter((n) => !byName.has(n)).map((n) => notChecked("outdated", `${file}: ${n}`, pkgs.some((p) => p.name === n) ? "not a public-registry package" : "not in the lockfile"));
  const rows = await pool(todo, 6, async (name) => {
    const p = byName.get(name);
    try {
      const r = await net.request(`https://${DESTINATIONS.npm}/${encodeName(name)}/latest`);
      if (r.status !== 200) return notChecked("outdated", `${file}: ${name}`, `registry answered ${r.status}`);
      const latest = JSON.parse(r.body.toString("utf8")).version;
      const b = behind(p.version, latest, cfg.thresholds.outdated);
      if (b === null) return notChecked("outdated", `${file}: ${name}`, "version not comparable");
      return b ? attention("outdated", `${file}: ${name}`, `${p.version} installed, ${latest} latest`) : ok("outdated", `${file}: ${name}`, `${p.version} installed, ${latest} latest`);
    } catch (err) {
      return notChecked("outdated", `${file}: ${name}`, netReason(err));
    }
  });
  return [...results, ...rows];
}

// pip-audit (O8): only with a fully pinned requirements file, and only in its
// no-install mode, so it never builds an environment or installs anything.
export function pipAuditArgs(file) {
  return ["-r", file, "--disable-pip", "--no-deps", "--vulnerability-service", "osv", "--format", "json", "--progress-spinner", "off"];
}

function python(cfg, noNetwork) {
  if (!cfg.python) return [];
  const target = "python requirements";
  if (noNetwork) return [notChecked("python-advisories", target, "network off")];
  if (!which("pip-audit")) return [notChecked("python-advisories", target, "pip-audit not installed")];
  let text;
  try {
    const st = lstatSync(cfg.python);
    if (!st.isFile()) return [notChecked("python-advisories", target, "not a regular file")];
    text = readFileSync(cfg.python, "utf8");
  } catch {
    return [notChecked("python-advisories", target, "no requirements file")];
  }
  const lines = text.split("\n").map((l) => l.replace(/#.*$/, "").trim()).filter(Boolean);
  if (!lines.length || lines.some((l) => !/^[A-Za-z0-9][A-Za-z0-9._-]*(\[[A-Za-z0-9,._-]+\])?==[A-Za-z0-9.+!-]+(\s*;.*)?(\s+--hash=\S+)*$/.test(l))) {
    return [notChecked("python-advisories", target, "the requirements file is not fully pinned (name==version on every line)")];
  }
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, NETRC: "/dev/null", PIP_CONFIG_FILE: "/dev/null", PIP_NO_INPUT: "1", PYTHONDONTWRITEBYTECODE: "1" };
  const r = run("pip-audit", pipAuditArgs(cfg.python), { env, timeout: 120000 });
  if (r.error || (r.status !== 0 && r.status !== 1)) return [notChecked("python-advisories", target, "pip-audit failed")];
  let j;
  try {
    j = JSON.parse(r.stdout);
  } catch {
    return [notChecked("python-advisories", target, "pip-audit output unreadable")];
  }
  const deps = Array.isArray(j) ? j : j.dependencies || [];
  const vuln = deps.filter((d) => (d.vulns || []).length);
  if (!vuln.length) return [ok("python-advisories", target, `${deps.length} package(s) checked by pip-audit; no known advisory`)];
  return vuln.map((d) => attention("python-advisories", `${target}: ${d.name}@${d.version}`, (d.vulns || []).map((v) => String(v.id).slice(0, 40)).join(", ")));
}

// ---- TLS, domain, HTTP, backup -----------------------------------------------------
async function tlsCheck(net, { host, port }, cfg, now) {
  const target = port === 443 ? host : `${host}:${port}`;
  try {
    const c = await net.certificate(host, port);
    if (!c.authorized) return attention("tls", target, `certificate not trusted (${c.error || "unknown reason"})`);
    const when = new Date(c.valid_to);
    if (Number.isNaN(when.getTime())) return notChecked("tls", target, "certificate date unreadable");
    const days = daysUntil(when, now);
    const detail = `certificate expires ${when.toISOString().slice(0, 10)} (${days} days)`;
    return days <= cfg.thresholds.cert_days ? attention("tls", target, detail) : ok("tls", target, detail);
  } catch (err) {
    return notChecked("tls", target, netReason(err));
  }
}

const RDAP_CACHE_DAYS = 30;
async function rdapBootstrap(net, env) {
  const file = join(dataHome(env), "rdap", "dns.json");
  try {
    const cached = JSON.parse(readFileSync(file, "utf8"));
    if (cached.fetched && Date.now() - Date.parse(cached.fetched) < RDAP_CACHE_DAYS * DAY && Array.isArray(cached.services)) return cached.services;
  } catch {
    /* fetch below */
  }
  const r = await net.request(`https://${DESTINATIONS.iana}/rdap/dns.json`, { cap: 1024 * 1024 });
  if (r.status !== 200) throw new NetError("unreachable", "the RDAP bootstrap list was not available");
  const services = JSON.parse(r.body.toString("utf8")).services;
  if (!Array.isArray(services)) throw new NetError("unreachable", "the RDAP bootstrap list was unreadable");
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writePrivate(file, JSON.stringify({ fetched: new Date().toISOString(), services }));
  return services;
}

export function rdapBase(services, domain) {
  const labels = domain.split(".");
  for (let k = 0; k < labels.length; k++) {
    const tld = labels.slice(k).join(".");
    for (const [names, urls] of services) {
      if (Array.isArray(names) && names.includes(tld)) {
        const u = (urls || []).find((x) => /^https:\/\//.test(x));
        if (u) return u.endsWith("/") ? u : `${u}/`;
      }
    }
  }
  return null;
}

async function domainChecks(cfg, now, deps) {
  if (!cfg.domains.length) return [];
  let services;
  try {
    services = await rdapBootstrap(deps.bootstrapNet, deps.env);
  } catch (err) {
    return cfg.domains.map((d) => notChecked("domain", d, netReason(err)));
  }
  const bases = new Map(cfg.domains.map((d) => [d, rdapBase(services, d)]));
  const rdapHosts = [...new Set([...bases.values()].filter(Boolean).map((u) => new URL(u).hostname))];
  const net = deps.makeNet(rdapHosts);
  return pool(cfg.domains, 4, async (d) => {
    const base = bases.get(d);
    if (!base) return notChecked("domain", d, "no RDAP server for this domain's ending");
    try {
      const r = await net.request(`${base}domain/${encodeURIComponent(d)}`, { accept: "application/rdap+json" });
      if (r.status >= 300 && r.status < 400) return notChecked("domain", d, `RDAP server redirects to ${r.locationHost}`);
      if (r.status !== 200) return notChecked("domain", d, `RDAP server answered ${r.status}`);
      const j = JSON.parse(r.body.toString("utf8"));
      const exp = (j.events || []).find((e) => e.eventAction === "expiration")?.eventDate;
      if (!exp || Number.isNaN(Date.parse(exp))) return notChecked("domain", d, "no expiry date published");
      const days = daysUntil(new Date(exp), now);
      const detail = `registration expires ${new Date(exp).toISOString().slice(0, 10)} (${days} days)`;
      return days <= cfg.thresholds.domain_days ? attention("domain", d, detail) : ok("domain", d, detail);
    } catch (err) {
      return notChecked("domain", d, netReason(err));
    }
  });
}

async function httpCheck(net, url) {
  try {
    const r = await net.request(url, { accept: "*/*" });
    if (r.status >= 200 && r.status < 300) return ok("http", url, `HTTP ${r.status}`);
    if (r.status >= 300 && r.status < 400) return attention("http", url, `HTTP ${r.status}, redirects to ${r.locationHost || "(no Location)"}; not followed`);
    return attention("http", url, `HTTP ${r.status}`);
  } catch (err) {
    return notChecked("http", url, netReason(err) === "too-large" ? "response too large" : netReason(err));
  }
}

// lstat only: the backup is never opened.
function backupCheck(path, cfg, now) {
  let st;
  try {
    st = lstatSync(path);
  } catch {
    return attention("backup", path, "no file at this path");
  }
  if (st.isSymbolicLink()) return notChecked("backup", path, "symlink");
  if (!st.isFile()) return notChecked("backup", path, "not a regular file");
  const days = Math.floor((now.getTime() - st.mtimeMs) / DAY);
  const detail = `last changed ${new Date(st.mtimeMs).toISOString().slice(0, 10)} (${days} days ago)`;
  return days > cfg.thresholds.backup_days ? attention("backup", path, detail) : ok("backup", path, detail);
}

// ---- the verb -------------------------------------------------------------------
// `deps` is for tests: resolver, connector and destination table go to net.mjs.
export async function health({ config, noNetwork = false }, deps = {}) {
  if (!config) throw usage("usage: ow-tools health --config <health.yaml> [--json] [--no-network]");
  const path = resolve(config);
  let text;
  try {
    const st = lstatSync(path);
    if (!st.isFile()) throw usage("--config must be a regular file (a symlink is not read)");
    text = readFileSync(path, "utf8");
  } catch (err) {
    if (err.code === 2) throw err;
    throw usage("no health.yaml at the --config path");
  }
  const cfg = readHealthConfig(text, dirname(path));
  cfg.ownScope = cfg.repo ? projectScope(cfg.repo) : null;
  const now = nowDate();
  const env = deps.env || process.env;
  const requests = [];
  const log = (r) => requests.push(r);
  const makeNet = (extra = []) =>
    createNet({ hosts: [...cfg.hosts.map((h) => h.host), ...cfg.urls.map((u) => new URL(u).hostname), ...extra], resolver: deps.resolver, connector: deps.connector, destinations: deps.destinations, timeoutMs: deps.timeoutMs, log });
  const net = makeNet();
  const results = [];

  // Dependencies (lockfile parsing is local, and runs under --no-network too).
  const locks = lockfilePackages(cfg);
  if (locks === null || locks.length === 0) {
    if (cfg.repo || cfg.lockfiles.length) results.push(notChecked("advisories", "repo", "no lockfile"), notChecked("outdated", "repo", "no lockfile"));
  } else {
    for (const l of locks) {
      if (l.error) {
        results.push(notChecked("advisories", l.file, l.error), notChecked("outdated", l.file, l.error));
        continue;
      }
      const set = packageSet(l.packages);
      if (noNetwork) {
        const { send, held } = sendable(set, cfg);
        results.push({ ...notChecked("advisories", l.file, "network off"), detail: `${set.length} packages read: ${send.length} would be sent, ${held.length} held back` }, notChecked("outdated", l.file, "network off"));
        continue;
      }
      results.push(...(await advisories(net, l.file, set, cfg, { requeryCap: deps.requeryCap })), ...(await outdated(net, l.file, set, cfg)));
    }
  }
  results.push(...python(cfg, noNetwork));

  if (noNetwork) {
    for (const h of cfg.hosts) results.push(notChecked("tls", h.port === 443 ? h.host : `${h.host}:${h.port}`, "network off"));
    for (const d of cfg.domains) results.push(notChecked("domain", d, "network off"));
    for (const u of cfg.urls) results.push(notChecked("http", u, "network off"));
  } else {
    results.push(...(await pool(cfg.hosts, 4, (h) => tlsCheck(net, h, cfg, now))));
    results.push(...(await domainChecks(cfg, now, { bootstrapNet: net, makeNet, env })));
    results.push(...(await pool(cfg.urls, 4, (u) => httpCheck(net, u))));
  }
  for (const b of cfg.backups) results.push(backupCheck(b, cfg, now));

  const count = (r) => results.filter((x) => x.result === r).length;
  return {
    status: "done",
    network: noNetwork ? "off" : "on",
    thresholds: cfg.thresholds,
    summary: { ok: count("OK"), attention: count("attention"), not_checked: count("not checked") },
    results,
    requests: requests.map((r) => ({ ...r })),
    note: "Read-only: nothing was written to a checked system, and no credential was used. A check that couldn't run says why.",
  };
}

export function healthText(r) {
  const lines = [`ow-tools health — ${r.summary.ok} OK · ${r.summary.attention} attention · ${r.summary.not_checked} not checked · network ${r.network}`, ""];
  // One column for the result, the reason in the detail column (Bug 14).
  for (const x of r.results) {
    const said = [x.reason, x.detail].filter(Boolean).join("; ");
    lines.push(`${x.result.padEnd(11)}  ${x.check.padEnd(17)}  ${x.target}${said ? ` — ${said}` : ""}`);
  }
  lines.push("", r.note);
  return lines.join("\n");
}
