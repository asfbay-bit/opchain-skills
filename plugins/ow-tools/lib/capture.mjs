// `ow-tools capture` (design §5.6, amendment T1): screenshots of a running
// test environment for ow-documentation, from a declarative plan (navigate,
// click, fill test data, wait, shot), in an installed Chrome or Chromium on a
// dedicated per-workstream profile. ow-tools never reads, types or stores a
// credential, never evaluates JavaScript, and never reads a cookie: the user
// signs in themselves in the headed window (`--sign-in`).
//
// The profile does hold the signed-in test session, like any browser
// profile. It lives in the ow-tools data folder (0700), is listed by
// `--profiles` and removed by `--delete-profile`, and ow-handoff's access
// removal names it.
import { chmodSync, closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync, writeSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, relative, resolve, sep } from "node:path";
import { dataHome, failed, isFile, localDate, missing, refused, usage, which } from "./core.mjs";
import { HOST, blockedAddress, ipv4, isLinkLocalHost, isLoopbackHost } from "./addr.mjs";
import { CDP_METHODS, killTree, launchBrowser } from "./cdp.mjs";
import { assertIgnored, withTmpSiblings, writePrivate } from "./guards.mjs";
import { sha256File } from "./hash.mjs";

export const SHOTS_IGNORE_LINES = ["opchain-work/**/shots/"];
export const DATA_CHECK = "pending (not done by ow-tools)";
export const ENVIRONMENTS = ["test", "uat", "staging", "demo", "production"];
const PROFILE_ID = /^[a-z0-9][a-z0-9-]{0,62}$/;
const STEP_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
const KINDS = ["navigate", "click", "fill", "wait", "shot"];
const MAX_STEPS = 200;
const DEFAULT_VIEWPORT = { width: 1280, height: 800 };
// Under Claude Code's 120 s Bash timeout, for --sign-in too (Bug 4): a run
// that is killed mid-wait is the likeliest way a session outlives it. A
// longer sign-in passes --timeout and runs with run_in_background.
export const DEFAULT_TIMEOUT = 110;

// A field ow-tools never types into: by type, by autocomplete, or by a name,
// id, selector, label or placeholder that names a secret (design §5.6). The
// text is folded first (accents removed: `contraseña` → `contrasena`), then
// any one of these refuses (1.1.1, OW-03 follow-ups):
//
// - a password word in a non-Latin script (`пароль`, `パスワード`, `密码`, …);
// - a phrase about a code that was sent (`the code we texted you`) or an
//   N-digit code (`Enter the 6-digit code`; a ZIP code is not one);
// - words: the text split into words (camelCase, snake_case, kebab-case, any
//   punctuation; a trailing digit dropped: `otp1` → `otp`). A strong word
//   anywhere (`password`, `otp`, `cvv`, `iban`, `secret`, …); a word pair
//   (`card number`, `seed phrase`, `access token`, …); or a weak word that is
//   the field's only word once selector and label filler is set aside (`pin`,
//   `pass`, `token`, `routing`, `pan`: `#pin` and "Your PIN" refuse,
//   `pinLocation`, `boarding_pass` and `tokenCount` don't);
// - stems inside one word: long stems anywhere (`newpassword`, `userpin`,
//   `kennwort`), short ones only at the word's start or end (`smsotp`,
//   `totpcode`, `loginpwd`), so `hotpot`, `footprint` and `camfactor` stay
//   ordinary. Real words that merely hold a stem (`secretary`, `classname`,
//   `liban`) are removed first;
// - long stems across words, in the text with separators removed
//   (`mot_de_passe` → `motdepasse`, `credit_card`), and again with leet digits
//   and symbols read as letters (`p@ssw0rd`, `pa55word`). Short stems are
//   never matched across words, so `apiBanner` (iban) and `photo-kent`
//   (token) stay ordinary.
export function nameWords(text) {
  return String(text)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.replace(/(?<=[a-z])\d+$/, ""));
}
// Always a secret, as a whole word.
export const SECRET_WORDS = Object.freeze([
  "otp", "otpcode", "mfa", "mfacode", "totp", "hotp", "2fa", "tfa", "twofa", "pincode", "pinnumber", "passcode", "password", "passwd", "pwd",
  "pw", "psw", "pswd", "pword", "passw", "passwrd", "passphrase", "secret", "cvv", "cvc", "csc", "cvn", "ssn", "iban", "apikey", "onetimecode",
  "onetimepassword", "cardnumber", "cardnum", "cardno", "ccnum", "ccnumber", "ccn", "cccsc", "ccexp", "creditcard", "securitycode",
  "verificationcode", "authcode", "smscode", "emailcode", "logincode", "accesscode", "authenticator", "mnemonic", "seedphrase", "recoverykey",
  "socialsecurity", "privatekey", "accesstoken", "apitoken", "authtoken", "refreshtoken", "bearertoken", "sessiontoken", "idtoken",
  // other languages (Latin script, accents folded)
  "senha", "heslo", "haslo", "geslo", "sifre", "passord", "jelszo", "lozinka", "parool", "adgangskode", "kennwort", "wachtwoord",
]);
// A secret only as the field's one word (filler set aside), or in a pair.
export const WEAK_WORDS = Object.freeze(["pin", "pass", "token", "routing", "pan"]);
// Selector and label filler, set aside before the one-word test.
export const FILLER_WORDS = Object.freeze([
  "input", "textarea", "name", "id", "field", "data", "testid", "test", "cy", "qa", "aria", "label", "placeholder", "enter", "your", "the",
  "a", "an", "please", "here", "my", "new", "confirm", "current", "old", "user",
]);
export const SECRET_SEQUENCES = Object.freeze([
  ["one", "time"], ["two", "factor"], ["two", "step"], ["2", "step"], ["card", "number"], ["card", "num"], ["card", "no"], ["cc", "num"],
  ["cc", "number"], ["cc", "csc"], ["cc", "exp"], ["credit", "card"], ["social", "security"], ["security", "code"], ["security", "answer"],
  ["security", "pin"], ["verification", "code"], ["verify", "code"], ["auth", "code"], ["authentication", "code"], ["sms", "code"],
  ["text", "code"], ["email", "code"], ["login", "code"], ["signin", "code"], ["sign", "in", "code"], ["access", "code"], ["magic", "code"],
  ["recovery", "code"], ["recovery", "key"], ["recovery", "phrase"], ["backup", "code"], ["seed", "phrase"], ["secret", "phrase"],
  ["api", "key"], ["access", "key"], ["private", "key"], ["access", "token"], ["api", "token"], ["auth", "token"], ["refresh", "token"],
  ["bearer", "token"], ["session", "token"], ["id", "token"], ["security", "token"], ["reset", "token"], ["account", "number"],
  ["routing", "number"], ["routing", "no"], ["pass", "code"], ["pass", "word"], ["pass", "phrase"], ["pin", "code"], ["pin", "number"],
  ["atm", "pin"], ["card", "pin"], ["login", "pin"], ["account", "pin"], ["sim", "pin"], ["secure", "pin"], ["login", "pass"],
  ["admin", "pass"], ["digit", "code"], ["digit", "pin"],
]);
// Inside one word, anywhere.
export const SECRET_STEMS_ANYWHERE = Object.freeze([
  "password", "passwd", "passwrd", "passwort", "motdepasse", "contrasena", "passcode", "passphrase", "kennwort", "wachtwoord", "losenord",
  "salasana", "jelszo", "lozinka", "adgangskode", "matkhau", "cardnumber", "ccnumber", "creditcard", "securitycode", "verificationcode",
  "verifycode", "recoverycode", "recoverykey", "recoveryphrase", "backupcode", "seedphrase", "accountnumber", "routingnumber", "apikey",
  "privatekey", "socialsecurity", "authenticator", "mnemonic", "secret", "userpin", "atmpin", "securepin", "cardpin", "loginpin", "accountpin",
  "simpin", "userpass", "loginpass", "adminpass", "emailcode", "logincode", "accesscode", "magiccode", "smscode", "authcode", "onetimecode",
  "twostep", "otpcode", "mfacode", "pincode", "pinnumber",
]);
// Inside one word, only at its start or end.
export const SECRET_STEMS_EDGE = Object.freeze(["otp", "totp", "mfa", "pwd", "psw", "pswd", "pword", "cvc", "cvv", "ssn", "twofa", "tfa"]);
// Inside one word, only at its end (`accesstoken`, `bankiban`; never `ibanez`).
export const SECRET_STEMS_END = Object.freeze(["token", "iban", "passw"]);
// Across words, in the text with separators removed: long, unambiguous stems only.
export const SECRET_STEMS_ACROSS = Object.freeze([
  "password", "passwd", "passwort", "motdepasse", "contrasena", "passcode", "passphrase", "kennwort", "wachtwoord", "losenord", "salasana",
  "matkhau", "cardnumber", "ccnumber", "creditcard", "securitycode", "verificationcode", "verifycode", "recoverycode", "recoverykey",
  "recoveryphrase", "backupcode", "seedphrase", "accountnumber", "routingnumber", "privatekey", "socialsecurity", "authenticator",
  "onetimecode", "onetimepassword",
]);
// A password in another script, matched in the text as written.
export const SECRET_SCRIPTS = Object.freeze([
  "пароль", "парол", "лозинка", "гасло", "パスワード", "暗証番号", "비밀번호", "密码", "密碼", "口令", "סיסמה", "كلمة المرور", "كلمة السر",
  "รหัสผ่าน", "पासवर्ड", "κωδικός πρόσβασης",
]);
// A code that was sent, or an N-digit code (a ZIP or postal code is not one).
export const SECRET_PHRASES = Object.freeze([
  /\bcodes?\b[^.\n]{0,30}?\b(?:sent|texted|emailed|messaged)\b/,
  /\b(?:sent|texted|emailed|messaged)\b[^.\n]{0,30}?\bcodes?\b/,
  /\b\d{1,2}\s*-?\s*digits?\s+(?:(?:verification|security|login|sign-?in|sms|one-time|access|auth)\s+)?(?:code|pin|passcode)\b/,
]);
// Real words that contain a stem and are not secrets.
export const ORDINARY_WORDS = Object.freeze([
  "secretary", "secretariat", "classname", "businessname", "passenger", "passport", "compass", "bypass", "trespass", "tokenize", "tokenizer",
  "footprint", "hotpink", "laptop", "desktop", "hotplate", "spinner", "opinion", "pinterest", "shipping", "option", "options", "topping",
  "liban",
]);
const WORDS = new Set(SECRET_WORDS);
const WEAK = new Set(WEAK_WORDS);
const FILLER = new Set(FILLER_WORDS);
const ORDINARY = [...ORDINARY_WORDS].sort((a, b) => b.length - a.length);
const scrub = (s) => ORDINARY.reduce((t, w) => t.split(w).join(" "), s);
// ł, ø, đ, ß and æ don't decompose; the rest fold through NFD.
const fold = (s) => String(s).replace(/[łŁ]/g, "l").replace(/[øØ]/g, "o").replace(/[đĐ]/g, "d").replace(/ß/g, "ss").replace(/[æÆ]/g, "ae").normalize("NFD").replace(/\p{M}/gu, "");
const LEET = { "@": "a", 4: "a", $: "s", 5: "s", 0: "o", 3: "e", 1: "i", "!": "i", 7: "t" };
const unleet = (s) => s.replace(/[@4$5031!7]/g, (c) => LEET[c]);
const inWord = (word) => {
  const x = scrub(word.replace(/\d+/g, ""));
  return x.split(" ").filter(Boolean).some((p) =>
    SECRET_STEMS_ANYWHERE.some((st) => p.includes(st)) ||
    SECRET_STEMS_EDGE.some((st) => p.startsWith(st) || p.endsWith(st)) ||
    SECRET_STEMS_END.some((st) => p !== st && p.endsWith(st)), // `token` alone is a weak word, not a stem
  );
};
function byWords(text) {
  const w = nameWords(text);
  if (w.some((x) => WORDS.has(x))) return true;
  if (SECRET_SEQUENCES.some((seq) => w.some((_, k) => seq.every((s, j) => w[k + j] === s)))) return true;
  const core = w.filter((x) => !FILLER.has(x));
  if (core.length === 1 && WEAK.has(core[0])) return true;
  if (w.some(inWord)) return true;
  const across = scrub(text.toLowerCase().replace(/[^a-z]+/g, ""));
  return SECRET_STEMS_ACROSS.some((st) => across.includes(st));
}
export function secretName(text) {
  const raw = String(text).normalize("NFC").toLowerCase();
  const t = fold(text);
  const lower = t.toLowerCase();
  if (SECRET_SCRIPTS.some((s) => raw.includes(s) || lower.includes(s))) return true;
  // Phrases are read in the words too, so `#Enter_the_code_we_texted_you` counts.
  const spoken = nameWords(t).join(" ");
  if (SECRET_PHRASES.some((re) => re.test(lower) || re.test(spoken))) return true;
  return byWords(t) || byWords(unleet(t));
}
const SECRET_AUTOCOMPLETE = /\b(current-password|new-password|one-time-code|cc-number|cc-csc|cc-exp(?:-month|-year)?)\b/i;
// A plan value that looks like a credential is refused, whatever the field.
export const SECRET_VALUE = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
  /\bsk[-_](?:live|test|proj)?[-_]?[A-Za-z0-9]{20,}/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./,
  /^(?=\S{24,}$)(?=.*[a-z])(?=.*[A-Z])(?=.*\d)\S+$/,
];

// ---- browser -------------------------------------------------------------------
export function browserCandidates(env = process.env) {
  const home = env.HOME || homedir();
  return {
    path: ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"],
    files: [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      join(home, "Applications", "Google Chrome.app", "Contents", "MacOS", "Google Chrome"),
      join(home, "Applications", "Chromium.app", "Contents", "MacOS", "Chromium"),
    ],
  };
}

// PATH first, then the standard install paths. Nothing is ever downloaded.
export function findBrowser(cands = browserCandidates(), env = process.env) {
  for (const name of cands.path) {
    const p = which(name, env);
    if (p) return p;
  }
  return cands.files.find((f) => isFile(f)) || null;
}

// ---- plan ------------------------------------------------------------------------
const planBad = (msg, extra = {}) => refused("plan-invalid", `capture plan: ${msg}`, extra);

function checkKeys(obj, allowed, where) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw planBad(`${where} must be an object`);
  // A key is shown only when it is a plain short word (F-021): plan text never
  // reaches the session unbounded.
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) throw planBad(`${where}: ${/^[a-z_]{1,32}$/.test(k) ? `unknown key "${k}"` : "an unknown key"} (allowed: ${allowed.join(", ")})`);
  }
}

function line(v, max, what) {
  if (typeof v !== "string" || !v.length || v.length > max || /[\u0000-\u001f\u007f]/.test(v)) throw planBad(`${what} must be one line of 1-${max} characters`);
  return v;
}

function origin(text, testOrigins, what) {
  if (testOrigins.includes(text)) return text;
  let u;
  try {
    u = new URL(text);
  } catch {
    throw planBad(`${what} is not a URL`);
  }
  if (u.protocol !== "https:") throw planBad(`${what} must be https://`);
  if (u.username || u.password) throw planBad(`${what} must not hold a user name or password`);
  if (isLoopbackHost(u.hostname)) throw planBad(`${what} must not be a loopback address`);
  if (isLinkLocalHost(u.hostname)) throw planBad(`${what} must not be a link-local or cloud-metadata address`);
  // An IPv6 literal must be global unicast (Bug 6): no IPv4-compatible,
  // NAT64 or 6to4 wrapping of a private address, no documentation range.
  if (u.hostname.startsWith("[") && blockedAddress(u.hostname)) throw planBad(`${what} must not be a special-purpose IPv6 address`);
  // SA-020: a host name, or an IP literal; nothing else reaches the
  // host-resolver rules (`,` would start another rule, `*` is a wildcard).
  if (!u.hostname.startsWith("[") && !ipv4(u.hostname) && !HOST.test(u.hostname)) {
    throw planBad(`${what} must name a host (letters, digits, hyphens and dots, with a top-level name) or an IP address`);
  }
  if (u.origin !== text.replace(/\/$/, "")) throw planBad(`${what} must be an origin only (scheme, host, port), with no path`);
  return u.origin;
}

function inOrigins(url, origins, what) {
  let u;
  try {
    u = new URL(url);
  } catch {
    throw planBad(`${what} is not a URL`);
  }
  if (u.username || u.password) throw planBad(`${what} must not hold a user name or password`);
  if (!origins.includes(u.origin)) throw refused("origin-not-allowed", `capture plan: ${what} is outside allowed_origins`, { step: what });
  return u.href;
}

function secretField(text) {
  return secretName(text) || /type\s*=\s*["']?password/i.test(text) || SECRET_AUTOCOMPLETE.test(text);
}

export function readPlan(json, { testOrigins = [] } = {}) {
  checkKeys(json, ["schema", "profile", "environment", "decision", "allowed_origins", "viewport", "sign_in", "steps"], "the plan");
  if (json.schema !== 1) throw planBad("schema must be 1");
  if (typeof json.profile !== "string" || !PROFILE_ID.test(json.profile)) throw planBad("profile must be the workstream id: lowercase letters, digits and -");
  if (!ENVIRONMENTS.includes(json.environment)) throw planBad(`environment must be one of ${ENVIRONMENTS.join(", ")}`);
  let decision = null;
  if (json.environment === "production") {
    if (json.decision === undefined) throw refused("production-without-decision", "capture plan: environment is production but the plan has no decision (the client's recorded decision: role and date)");
    checkKeys(json.decision, ["role", "date"], "decision");
    line(json.decision.role, 60, "decision.role");
    if (typeof json.decision.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(json.decision.date) || Number.isNaN(Date.parse(json.decision.date))) {
      throw refused("production-without-decision", "capture plan: decision.date must be the date of the client's decision, YYYY-MM-DD");
    }
    decision = { role: json.decision.role, date: json.decision.date };
  } else if (json.decision !== undefined) throw planBad("decision is only for environment: production");
  if (!Array.isArray(json.allowed_origins) || !json.allowed_origins.length || json.allowed_origins.length > 20) throw planBad("allowed_origins must list 1-20 origins");
  const origins = json.allowed_origins.map((o, k) => origin(o, testOrigins, `allowed_origins[${k}]`));
  const viewport = { ...DEFAULT_VIEWPORT };
  if (json.viewport !== undefined) {
    checkKeys(json.viewport, ["width", "height"], "viewport");
    for (const k of ["width", "height"]) {
      const v = json.viewport[k];
      if (!Number.isInteger(v) || v < 320 || v > 3840) throw planBad(`viewport.${k} must be a whole number from 320 to 3840`);
      viewport[k] = v;
    }
  }
  let signIn = null;
  if (json.sign_in !== undefined) {
    checkKeys(json.sign_in, ["url", "done_selector"], "sign_in");
    signIn = { url: inOrigins(line(json.sign_in.url, 2000, "sign_in.url"), origins, "sign_in.url"), done: line(json.sign_in.done_selector, 300, "sign_in.done_selector") };
  }
  if (!Array.isArray(json.steps) || json.steps.length > MAX_STEPS) throw planBad(`steps must be a list of at most ${MAX_STEPS}`);
  const seen = new Set();
  const steps = json.steps.map((s, k) => {
    if (!s || typeof s !== "object") throw planBad(`step ${k + 1} must be an object`);
    const id = s.id;
    if (typeof id !== "string" || !STEP_ID.test(id)) throw planBad(`step ${k + 1}: id must be 1-40 letters, digits, "_" or "-" (it names the image)`);
    if (seen.has(id.toLowerCase())) throw planBad(`step ${id}: the id appears twice`, { step: id });
    seen.add(id.toLowerCase());
    if (!KINDS.includes(s.do)) throw planBad(`step ${id}: do must be one of ${KINDS.join(", ")}`, { step: id });
    const allowedKeys = { navigate: ["url"], click: ["selector"], fill: ["selector", "value"], wait: ["selector", "timeout_ms"], shot: [] }[s.do];
    checkKeys(s, ["id", "do", ...allowedKeys], `step ${id}`);
    const step = { id, do: s.do };
    if (s.do === "navigate") step.url = inOrigins(line(s.url, 2000, `step ${id} url`), origins, id);
    if (["click", "fill", "wait"].includes(s.do)) step.selector = line(s.selector, 300, `step ${id} selector`);
    if (s.do === "fill") {
      if (secretField(step.selector)) throw refused("secret-field", `capture plan: step ${id} targets a password, one-time-code or similar field; ow-tools never types into one (the user signs in with --sign-in)`, { step: id });
      if (typeof s.value !== "string" || s.value.length > 500 || /[\u0000-\u0008\u000b-\u001f\u007f]/.test(s.value)) throw planBad(`step ${id}: value must be text of at most 500 characters`, { step: id });
      if (SECRET_VALUE.some((re) => re.test(s.value))) throw refused("secret-value", `capture plan: step ${id} carries a value that looks like a credential; plans hold test data only`, { step: id });
      step.value = s.value;
    }
    if (s.do === "wait") {
      const t = s.timeout_ms ?? 10000;
      if (!Number.isInteger(t) || t < 100 || t > 60000) throw planBad(`step ${id}: timeout_ms must be 100 to 60000`, { step: id });
      step.timeout = t;
    }
    return step;
  });
  if (!steps.length && !signIn) throw planBad("give steps, or sign_in for a sign-in run");
  return { profile: json.profile, environment: json.environment, decision, origins, viewport, signIn, steps };
}

// ---- profiles -------------------------------------------------------------------
export const captureRoot = (env) => join(dataHome(env), "capture");
const LAST_USED = ".ow-tools-last-used";

function treeBytes(dir) {
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    const st = lstatSync(p);
    if (st.isDirectory()) n += treeBytes(p);
    else n += st.size;
  }
  return n;
}

export function listProfiles(env) {
  const root = captureRoot(env);
  let names = [];
  try {
    names = readdirSync(root);
  } catch {
    return [];
  }
  return names
    .filter((n) => PROFILE_ID.test(n))
    .map((id) => {
      const p = join(root, id);
      const st = lstatSync(p);
      if (!st.isDirectory()) return null;
      let last = null;
      try {
        last = readFileSync(join(p, LAST_USED), "utf8").trim().slice(0, 10);
      } catch {
        last = null;
      }
      return { id, bytes: treeBytes(p), last_used: /^\d{4}-\d{2}-\d{2}$/.test(last || "") ? last : null };
    })
    .filter(Boolean)
    .sort((a, b) => a.id.localeCompare(b.id));
}

// The one delete ow-tools does: a profile folder, confined to the data folder.
// SA-021: one run per profile at a time. The lock holds the running
// process's id; a lock whose process has gone is stale and taken over.
export const RUN_LOCK = ".ow-tools-run.lock";
const alivePid = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e?.code === "EPERM";
  }
};
function lockHolder(dir) {
  try {
    const pid = Number.parseInt(readFileSync(join(dir, RUN_LOCK), "utf8"), 10);
    return Number.isSafeInteger(pid) && pid > 0 && alivePid(pid) ? pid : null;
  } catch {
    return null;
  }
}
const inUse = (id, pid) => refused("profile-in-use", `capture: another run (process ${pid}) is using the profile ${id}; wait for it to finish`, { profile: id });
export function takeRunLock(dir, id) {
  const path = join(dir, RUN_LOCK);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const fd = openSync(path, "wx", 0o600);
      writeSync(fd, `${process.pid}\n`);
      closeSync(fd);
      return path;
    } catch (e) {
      if (e?.code !== "EEXIST") throw e;
      const pid = lockHolder(dir);
      if (pid) throw inUse(id, pid);
      rmSync(path, { force: true }); // stale: its run is gone
    }
  }
  throw inUse(id, "unknown");
}
export function releaseRunLock(path) {
  try {
    if (Number.parseInt(readFileSync(path, "utf8"), 10) === process.pid) rmSync(path, { force: true });
  } catch {
    /* already gone */
  }
}

export function deleteProfile(id, env) {
  if (typeof id !== "string" || !PROFILE_ID.test(id)) {
    throw refused("profile-id-invalid", "a profile id is lowercase letters, digits and - only (no /, no .., no other characters)");
  }
  const root = captureRoot(env);
  let rootSt;
  try {
    rootSt = lstatSync(root);
  } catch {
    throw refused("profile-not-found", "there are no capture profiles");
  }
  if (rootSt.isSymbolicLink() || !rootSt.isDirectory()) throw refused("profile-not-contained", "the capture folder is not a plain folder; nothing deleted");
  const target = join(root, id);
  let st;
  try {
    st = lstatSync(target);
  } catch {
    throw refused("profile-not-found", "no capture profile with that id");
  }
  if (st.isSymbolicLink()) throw refused("profile-not-contained", "that profile is a symlink; nothing deleted");
  if (!st.isDirectory()) throw refused("profile-not-contained", "that profile is not a folder; nothing deleted");
  const realRoot = realpathSync(root);
  const real = realpathSync(target);
  const rel = relative(realRoot, real);
  if (!rel || rel.startsWith("..") || rel.includes(sep)) throw refused("profile-not-contained", "that profile is not directly inside the capture folder; nothing deleted");
  const holder = lockHolder(real);
  if (holder) throw inUse(id, holder);
  const bytes = treeBytes(real);
  rmSync(real, { recursive: true, force: true });
  return { status: "deleted", id, removed: real, bytes };
}

// ---- the browser run ---------------------------------------------------------------
export const PREFS = Object.freeze({
  credentials_enable_service: false,
  credentials_enable_autosignin: false,
  profile: { password_manager_enabled: false, default_content_setting_values: { automatic_downloads: 2, notifications: 2, geolocation: 2, media_stream_camera: 2, media_stream_mic: 2 } },
  autofill: { enabled: false, profile_enabled: false, credit_card_enabled: false },
  download: { prompt_for_download: false },
  safebrowsing: { enabled: false },
  translate: { enabled: false },
  signin: { allowed: false },
  sync: { requested: false },
});

function deepMerge(a, b) {
  const out = { ...(a && typeof a === "object" && !Array.isArray(a) ? a : {}) };
  for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === "object" && !Array.isArray(v) ? deepMerge(out[k], v) : v;
  return out;
}

// The profile folder, created 0700 and checked; nothing written in it yet.
function openProfile(id, env) {
  const root = captureRoot(env);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const rootSt = lstatSync(root);
  if (rootSt.isSymbolicLink()) throw refused("profile-not-contained", "the capture folder is a symlink; refusing to use it");
  const dir = join(root, id);
  mkdirSync(join(dir, "Default"), { recursive: true, mode: 0o700 });
  if (lstatSync(dir).isSymbolicLink()) throw refused("profile-not-contained", "that profile is a symlink; refusing to use it");
  chmodSync(root, 0o700);
  chmodSync(dir, 0o700);
  return dir;
}

function writeProfilePrefs(dir) {
  const prefsPath = join(dir, "Default", "Preferences");
  let cur = {};
  try {
    cur = JSON.parse(readFileSync(prefsPath, "utf8"));
  } catch {
    cur = {};
  }
  writeFileSync(prefsPath, JSON.stringify(deepMerge(cur, PREFS)), { mode: 0o600 });
  writeFileSync(join(dir, "First Run"), "", { mode: 0o600 });
  return dir;
}

export function prepareProfile(id, env) {
  return writeProfilePrefs(openProfile(id, env));
}

// Chrome resolves only the plan's host names, and only to the address
// ow-tools checked (Bug 6): `MAP host address` for each, everything else
// NOTFOUND. An IP-literal origin (already checked by the plan reader) is
// excluded from the catch-all, since Chrome applies it to literals too; a
// name ow-tools couldn't resolve gets no rule, so the browser can't reach it.
export function hostRules(pins) {
  const rules = pins.map((p) => (p.literal ? `EXCLUDE ${p.host.replace(/^\[|\]$/g, "")}` : `MAP ${p.host} ${p.address.includes(":") ? `[${p.address}]` : p.address}`));
  return `--host-resolver-rules=${[...rules, "MAP * ~NOTFOUND"].join(" , ")}`;
}

export function browserArgs({ profileDir, headless, viewport, pins = [] }) {
  return [
    "--remote-debugging-pipe",
    `--user-data-dir=${profileDir}`,
    ...(headless ? ["--headless"] : []),
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-sync",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-domain-reliability",
    "--disable-client-side-phishing-detection",
    "--disable-breakpad",
    "--disable-features=Translate,OptimizationHints,MediaRouter,AutofillServerCommunication,PasswordManagerOnboarding",
    "--metrics-recording-only",
    "--no-pings",
    // No --use-mock-keychain (SA-011): the cookie key lives in the user's
    // keychain (macOS asks once; "Always Allow"), not a fixed public key.
    "--no-proxy-server",
    hostRules(pins),
    `--window-size=${viewport.width},${viewport.height}`,
    "about:blank",
  ];
}

// Browser caches can hold page content; they go after every run.
export const TEMP_STATE = [
  ["Default", "Cache"], ["Default", "Code Cache"], ["Default", "GPUCache"], ["Default", "DawnGraphiteCache"], ["Default", "DawnWebGPUCache"],
  ["Default", "Service Worker", "CacheStorage"], ["Default", "Service Worker", "ScriptCache"], ["GPUPersistentCache"], ["ShaderCache"],
  ["GrShaderCache"], ["GraphiteDawnCache"], ["Crashpad"], ["SingletonLock"], ["SingletonSocket"], ["SingletonCookie"],
];
function cleanTempState(dir) {
  for (const parts of TEMP_STATE) rmSync(join(dir, ...parts), { recursive: true, force: true });
}

// After any run against an environment marked production, the signed-in
// session and everything the pages stored are wiped (owner decision
// 2026-10-17): a production session is never kept.
export const SESSION_STATE = [
  ["Default", "Cookies"], ["Default", "Cookies-journal"], ["Default", "Network"], ["Default", "Local Storage"], ["Default", "Session Storage"],
  ["Default", "IndexedDB"], ["Default", "Service Worker"], ["Default", "WebStorage"], ["Default", "Shared Storage"], ["Default", "File System"],
  ["Default", "databases"], ["Default", "Storage"], ["Default", "Sessions"], ["Default", "Current Session"], ["Default", "Last Session"],
  ["Default", "History"], ["Default", "History-journal"], ["Default", "Top Sites"], ["Default", "Visited Links"], ["Default", "Login Data"],
  ["Default", "Login Data-journal"], ["Default", "Web Data"], ["Default", "Web Data-journal"],
  // SA-019: session-adjacent stores too.
  ["Default", "Device Bound Sessions"], ["Default", "Device Bound Sessions-journal"], ["Default", "Account Web Data"],
  ["Default", "Account Web Data-journal"], ["Default", "Login Data For Account"], ["Default", "Login Data For Account-journal"],
  ["Default", "Reporting and NEL"], ["Default", "Reporting and NEL-journal"], ["Default", "Trust Tokens"], ["Default", "Trust Tokens-journal"],
];
// Written before a production run starts and removed only after its wipe:
// a run that was killed (even SIGKILL) leaves it, and the next run on the
// profile, whatever its environment, wipes the session first (SA-019 / F-025).
export const PRODUCTION_PENDING = ".ow-tools-production-pending";
function wipeSession(dir) {
  for (const parts of SESSION_STATE) rmSync(join(dir, ...parts), { recursive: true, force: true });
}

function pngSize(buf) {
  if (buf.length < 24 || buf.toString("hex", 0, 8) !== "89504e470d0a1a0a") return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// Unref'd: a wait that lost its race must not keep the process alive.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms).unref());
const stepFail = (reason, msg, extra) => failed(msg, { reason, ...extra });

async function session(b, plan, log) {
  const s = b.session;
  const version = await s.send("Browser.getVersion");
  await s.send("Browser.setDownloadBehavior", { behavior: "deny" });
  await s.send("Target.setDiscoverTargets", { discover: true });
  const { targetInfos } = await s.send("Target.getTargets");
  let page = targetInfos.find((t) => t.type === "page");
  if (!page) page = { targetId: (await s.send("Target.createTarget", { url: "about:blank" })).targetId };
  const { sessionId } = await s.send("Target.attachToTarget", { targetId: page.targetId, flatten: true });
  const call = (m, p) => s.send(m, p, sessionId);
  // A second window (target=_blank, window.open) is closed, never captured.
  s.on((m) => {
    const info = m.params?.targetInfo;
    if (m.method === "Target.targetCreated" && info?.type === "page" && info.targetId !== page.targetId) {
      s.send("Target.closeTarget", { targetId: info.targetId }).catch(() => {});
    }
  });
  const guard = { blockedDocument: false, blockedOther: 0 };
  s.on((m) => {
    if (m.sessionId !== sessionId) return;
    if (m.method === "Page.javascriptDialogOpening") call("Page.handleJavaScriptDialog", { accept: false }).catch(() => {});
    if (m.method !== "Fetch.requestPaused") return;
    // A malformed event is blocked, never trusted and never a crash (Bug 3).
    const url = typeof m.params?.request?.url === "string" ? m.params.request.url : "";
    if (!m.params?.requestId) return;
    let allowed = url !== "" && /^(data|blob|about):/.test(url);
    if (!allowed) {
      try {
        allowed = url !== "" && plan.origins.includes(new URL(url).origin);
      } catch {
        allowed = false;
      }
    }
    if (allowed) call("Fetch.continueRequest", { requestId: m.params.requestId }).catch(() => {});
    else {
      if (m.params.resourceType === "Document") guard.blockedDocument = true;
      else guard.blockedOther++;
      call("Fetch.failRequest", { requestId: m.params.requestId, errorReason: "BlockedByClient" }).catch(() => {});
    }
  });
  await call("Page.enable");
  await call("DOM.enable");
  await call("Emulation.setDeviceMetricsOverride", { width: plan.viewport.width, height: plan.viewport.height, deviceScaleFactor: 1, mobile: false });
  await call("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
  log(`browser ready (${String(version.product || "").slice(0, 60)})`);
  return { s, call, sessionId, guard, product: String(version.product || "") };
}

async function query(x, selector) {
  const { root } = await x.call("DOM.getDocument", { depth: 0 });
  try {
    const { nodeId } = await x.call("DOM.querySelector", { nodeId: root.nodeId, selector });
    return nodeId || null;
  } catch {
    return null; // an invalid selector finds nothing
  }
}

async function waitSelector(x, selector, ms) {
  const end = Date.now() + ms;
  for (;;) {
    const id = await query(x, selector);
    if (id) return id;
    if (Date.now() > end) return null;
    await sleep(200);
  }
}

async function attrs(x, nodeId) {
  const { node } = await x.call("DOM.describeNode", { nodeId });
  const a = node.attributes || [];
  const out = {};
  for (let k = 0; k + 1 < a.length; k += 2) out[a[k].toLowerCase()] = a[k + 1];
  return out;
}

async function navigateAndSettle(x, url) {
  const loaded = x.s.waitFor((m) => m.sessionId === x.sessionId && m.method === "Page.loadEventFired", 30000, "the page to load");
  loaded.catch(() => {});
  const r = await x.call("Page.navigate", { url });
  if (r.errorText) return false;
  await loaded.catch(() => {});
  return true;
}

// After a click, a navigation may start; give it a moment, then let it load.
async function settle(x) {
  const started = x.s.waitFor((m) => m.sessionId === x.sessionId && m.method === "Page.frameStartedLoading", 600, "a navigation");
  started.catch(() => {});
  try {
    await started;
    await x.s.waitFor((m) => m.sessionId === x.sessionId && m.method === "Page.loadEventFired", 30000, "the page to load").catch(() => {});
  } catch {
    /* no navigation */
  }
}

async function mainOrigin(x) {
  const t = await x.call("Page.getFrameTree");
  try {
    return new URL(t.frameTree.frame.url).origin;
  } catch {
    return null;
  }
}

async function runStep(x, plan, step, outDir) {
  x.guard.blockedDocument = false;
  if (step.do === "navigate") {
    const ok = await navigateAndSettle(x, step.url);
    if (!ok && !x.guard.blockedDocument) throw stepFail("navigation-failed", `step ${step.id}: the page did not load`, { step: step.id });
  } else if (step.do === "click" || step.do === "fill") {
    const nodeId = await query(x, step.selector);
    if (!nodeId) throw stepFail("selector-not-found", `step ${step.id}: nothing on the page matches the selector (signed out? run --sign-in)`, { step: step.id });
    if (step.do === "fill") {
      const a = await attrs(x, nodeId);
      // Its name, id and the words a person reads (aria-label, placeholder):
      // a show-password toggle makes type=text, so the words still count.
      const named = ["name", "id", "aria-label", "placeholder"].some((k) => secretName(a[k] || ""));
      if (a.type?.toLowerCase() === "password" || SECRET_AUTOCOMPLETE.test(a.autocomplete || "") || named) {
        throw refused("secret-field", `step ${step.id}: the field is a password, one-time-code or similar field; nothing was typed`, { step: step.id });
      }
      await x.call("DOM.focus", { nodeId });
      await x.call("Input.insertText", { text: step.value });
    } else {
      await x.call("DOM.scrollIntoViewIfNeeded", { nodeId });
      const { model } = await x.call("DOM.getBoxModel", { nodeId });
      const c = model.content;
      const px = (c[0] + c[4]) / 2;
      const py = (c[1] + c[5]) / 2;
      for (const type of ["mousePressed", "mouseReleased"]) await x.call("Input.dispatchMouseEvent", { type, x: px, y: py, button: "left", clickCount: 1 });
      await settle(x);
    }
  } else if (step.do === "wait") {
    if (!(await waitSelector(x, step.selector, step.timeout))) throw stepFail("selector-not-found", `step ${step.id}: the selector did not appear in time`, { step: step.id });
  }
  const here = await mainOrigin(x);
  if (x.guard.blockedDocument || !plan.origins.includes(here)) {
    throw refused("origin-not-allowed", `step ${step.id}: the page went to an origin outside allowed_origins; stopped, and no image was written for this step`, { step: step.id });
  }
  const { data } = await x.call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const buf = Buffer.from(data, "base64");
  const size = pngSize(buf);
  if (!size || size.width !== plan.viewport.width || size.height !== plan.viewport.height) {
    throw stepFail("screenshot-size", `step ${step.id}: the screenshot is not the plan's viewport size`, { step: step.id });
  }
  const file = join(outDir, `${step.id}.png`);
  writePrivate(file, buf);
  return { step: step.id, file, ...size, sha256: sha256File(file), data_check: DATA_CHECK };
}

// Resolve each allowed host once, before launch. An answer that is loopback,
// unspecified or link-local (cloud metadata) refuses the plan: a name like
// 127.0.0.1.nip.io or metadata.google.internal is no test environment.
// `deps.resolver` is the test seam; the default is the system resolver.
async function defaultResolver(host) {
  const { lookup } = await import("node:dns");
  return new Promise((ok, no) => lookup(host, { all: true, verbatim: true }, (err, list) => (err ? no(err) : ok(list.map((x) => x.address)))));
}

export async function pinOrigins(plan, { resolver = defaultResolver, testOrigins = [] } = {}) {
  const testHosts = new Set(testOrigins.map((o) => new URL(o).hostname));
  const pins = [];
  const seen = new Set(); // one lookup per name, whatever its ports
  for (const [k, o] of plan.origins.entries()) {
    const host = new URL(o).hostname;
    if (seen.has(host)) continue;
    seen.add(host);
    if (ipv4(host) || host.startsWith("[")) {
      pins.push({ host, literal: true });
      continue;
    }
    let list = [];
    try {
      list = await resolver(host);
    } catch {
      continue; // unresolvable: no rule, so the browser can't reach it
    }
    if (!testHosts.has(host) && list.some((a) => isLoopbackHost(a) || isLinkLocalHost(a))) {
      throw refused("origin-address-not-allowed", `capture plan: allowed_origins[${k}] resolves to a loopback or link-local (cloud-metadata) address`, { origin: k });
    }
    // Every answer was checked; the browser gets one: the first IPv4 answer
    // (an IPv6 route may be missing), else the first.
    if (list.length) pins.push({ host, address: list.find((a) => ipv4(a)) ?? list[0] });
  }
  return pins;
}

export async function capture(opts, log = () => {}, deps = {}) {
  const env = deps.env || process.env;
  if (opts.profiles) return { status: "ok", profiles: listProfiles(env), note: "Ids, sizes and last-used dates only; ow-tools never reads what a profile holds." };
  if (opts.deleteProfile !== undefined) return deleteProfile(opts.deleteProfile, env);
  if (!opts.plan) throw usage("usage: ow-tools capture --plan <plan.json> --out <…>/shots/ [--sign-in] [--timeout SECONDS] | --profiles | --delete-profile <id>");
  let raw;
  try {
    raw = JSON.parse(readFileSync(opts.plan, "utf8"));
  } catch {
    throw usage("could not read a JSON capture plan from --plan");
  }
  const plan = readPlan(raw, { testOrigins: deps.testOrigins || [] });
  if (opts.signIn && !plan.signIn) throw planBad("--sign-in needs sign_in: { url, done_selector } in the plan");
  const timeout = opts.timeout ?? DEFAULT_TIMEOUT;
  if (!Number.isInteger(timeout) || timeout < 5 || timeout > 590) throw usage("--timeout is 5 to 590 seconds");
  let outDir = null;
  if (plan.steps.length) {
    if (!opts.out) throw usage("--out <…>/shots/ is required when the plan has steps");
    outDir = resolve(opts.out);
    if (basename(outDir) !== "shots") throw refused("not-in-shots-folder", 'screenshots go in a folder named "shots" (e.g. opchain-work/docs/<client>/shots/)');
    assertIgnored(withTmpSiblings(plan.steps.map((s) => join(outDir, `${s.id}.png`))), SHOTS_IGNORE_LINES);
  }
  const binary = findBrowser(deps.browsers || browserCandidates(env), env);
  if (!binary) throw missing("capture needs Chrome or Chromium. Run ow-tools doctor for the exact step.", { missing: ["browser (Chrome or Chromium)"] });
  const pins = await pinOrigins(plan, { resolver: deps.resolver, testOrigins: deps.testOrigins || [] });
  if (outDir) mkdirSync(outDir, { recursive: true });

  const profileDir = openProfile(plan.profile, env);
  // SA-021: before anything is written in the profile (preferences, clean,
  // wipe, marker), so a second run can't touch a running run's profile,
  // remove its production marker or start a second browser on it.
  const lock = takeRunLock(profileDir, plan.profile);
  const production = plan.environment === "production";
  const pending = join(profileDir, PRODUCTION_PENDING);
  let b;
  try {
    writeProfilePrefs(profileDir);
    cleanTempState(profileDir); // a run killed last time left its caches (F-023)
    // SA-019: a production run, or any run after a production run that never
    // finished, starts from a wiped session.
    if (production || existsSync(pending)) wipeSession(profileDir);
    if (production) writeFileSync(pending, `${localDate()}\n`, { mode: 0o600 });
    else rmSync(pending, { force: true });
    b = launchBrowser(binary, browserArgs({ profileDir, headless: !opts.signIn, viewport: plan.viewport, pins }), { env });
  } catch (err) {
    releaseRunLock(lock);
    throw err;
  }
  // Bug 4: an interrupt or a kill signal still closes the browser and wipes a
  // production session before ow-tools exits. The wipe runs at once (a
  // SIGKILL may follow) and again once the browser has gone, so nothing it
  // flushed on the way out survives. A SIGKILL itself can't be handled: the
  // pending marker makes the next run wipe first (SA-019).
  //
  // 1.1.1 (Bug 3): SIGQUIT and an uncaught exception take the same path, so
  // the in-run wipe doesn't wait for the next run.
  let stopping = false;
  const stop = async (code) => {
    if (stopping) return;
    stopping = true;
    killTree(b.proc);
    const tidy = () => {
      cleanTempState(profileDir);
      if (production) wipeSession(profileDir);
    };
    tidy();
    await Promise.race([b.exited, sleep(2000)]);
    tidy();
    if (production) rmSync(pending, { force: true });
    releaseRunLock(lock);
    process.exit(code);
  };
  const SIGNAL_CODES = { SIGHUP: 1, SIGINT: 2, SIGQUIT: 3, SIGTERM: 15 };
  const SIGNALS = Object.keys(SIGNAL_CODES);
  const onSignal = (sig) => stop(128 + SIGNAL_CODES[sig]);
  const onCrash = (err) => {
    stop(1); // the browser is killed and the session wiped before this returns
    process.stderr.write(`ow-tools: internal error; capture stopped${production ? " and the production session was wiped" : ""}: ${String(err?.message || err).slice(0, 300)}\n`);
  };
  for (const sig of SIGNALS) process.on(sig, onSignal);
  process.on("uncaughtException", onCrash);
  const images = [];
  let timer;
  let product = "";
  let blocked = 0;
  try {
    const timedOut = new Promise((_, reject) => {
      timer = setTimeout(() => reject(stepFail("timeout", `capture stopped after ${timeout} s`)), timeout * 1000);
    });
    const spawnErr = b.spawnError.then((err) => {
      throw failed(`the browser did not start: ${String(err?.code || err).slice(0, 80)}`);
    });
    const exitedEarly = b.exited.then(() => {
      throw stepFail("browser-exited", "the browser closed before the run finished");
    });
    const work = (async () => {
      const x = await session(b, plan, log);
      product = x.product;
      if (opts.signIn) {
        log(`sign in in the browser window; ow-tools waits up to ${timeout} s for the page to show you are signed in`);
        if (!(await navigateAndSettle(x, plan.signIn.url)) && !x.guard.blockedDocument) throw stepFail("navigation-failed", "the sign-in page did not load");
        if (!(await waitSelector(x, plan.signIn.done, (timeout - 5) * 1000))) throw stepFail("not-signed-in", "the signed-in page never appeared; nothing captured");
      }
      for (const step of plan.steps) {
        log(`step ${step.id} (${step.do})`);
        images.push(await runStep(x, plan, step, outDir));
      }
      blocked = x.guard.blockedOther;
      await b.session.send("Browser.close").catch(() => {});
    })();
    exitedEarly.catch(() => {});
    spawnErr.catch(() => {});
    work.catch(() => {});
    await Promise.race([work, timedOut, spawnErr, b.exited.then(() => work)]);
  } catch (err) {
    if (err && typeof err === "object" && "extra" in err && images.length) err.extra = { ...err.extra, written: images.map((i) => i.file) };
    throw err;
  } finally {
    for (const sig of SIGNALS) process.off(sig, onSignal);
    process.off("uncaughtException", onCrash);
    clearTimeout(timer);
    // Every exit path closes the browser: asked first, then killed.
    if (b.proc.exitCode === null && b.proc.signalCode === null) b.session.send("Browser.close").catch(() => {});
    await Promise.race([b.exited, sleep(3000)]);
    killTree(b.proc);
    await Promise.race([b.exited, sleep(2000)]);
    cleanTempState(profileDir);
    if (production) {
      wipeSession(profileDir);
      rmSync(pending, { force: true });
    }
    writeFileSync(join(profileDir, LAST_USED), `${localDate()}\n`, { mode: 0o600 });
    releaseRunLock(lock);
  }
  return {
    status: "done",
    mode: opts.signIn ? "sign-in" : "capture",
    environment: plan.environment,
    production_decision: plan.decision ? { ...plan.decision, verified: false, label: "as given in the plan; not verified by ow-tools" } : null,
    profile: plan.profile,
    viewport: plan.viewport,
    browser: product.slice(0, 60),
    images,
    blocked_requests: blocked,
    session: production ? "wiped (production: cookies and site storage removed after the run)" : `kept in ${profileDir} (delete with --delete-profile ${plan.profile})`,
    note: "Every image still needs its data check (real customer data, credentials, a person's name, email or photo) before it is used; ow-tools did not do it.",
  };
}

export function captureText(r) {
  if (r.profiles) return r.profiles.length ? r.profiles.map((p) => `${p.id}  ${(p.bytes / 1048576).toFixed(1)} MB  last used ${p.last_used || "unknown"}`).join("\n") : "no capture profiles";
  if (r.status === "deleted") return `Deleted capture profile ${r.id}: ${r.removed} (${(r.bytes / 1048576).toFixed(1)} MB)`;
  const lines = [`Captured ${r.images.length} image(s) in ${r.environment} (${r.mode}, profile ${r.profile}, ${r.viewport.width}×${r.viewport.height}):`];
  for (const i of r.images) lines.push(`  ${i.file}  data check: ${i.data_check}`);
  if (r.production_decision) lines.push(`Production decision: ${r.production_decision.role}, ${r.production_decision.date} (${r.production_decision.label})`);
  if (r.blocked_requests) lines.push(`${r.blocked_requests} request(s) to origins outside the plan were blocked`);
  lines.push(r.note);
  return lines.join("\n");
}

export { CDP_METHODS };
