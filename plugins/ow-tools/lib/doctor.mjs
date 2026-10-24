// `ow-tools doctor` (design §6): check every requirement, print the command
// that fixes it. Print-only (decision 4): nothing here installs, downloads or
// runs a package manager. The Hugging Face token is checked for presence only.
import { statSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { CALENDARS } from "./calc.mjs";
import {
  DIARIZATION_MODEL,
  KEYCHAIN_SERVICE,
  PY_PROJECT,
  VERSION,
  WHISPER_MODELS,
  WHISPER_MODEL_URL,
  dataHome,
  diarizationCached,
  hfHome,
  isFile,
  modelPath,
  run,
  semverAtLeast,
  sha256File,
  venvDir,
  which,
} from "./core.mjs";
import { browserCandidates, findBrowser } from "./capture.mjs";
import { GITLEAKS_MIN, GIT_MIN, cwdRepo, findOnPath } from "./scan-secrets.mjs";

export { semverAtLeast };

const mac = () => platform() === "darwin";
const pkg = (formula) => (mac() ? `brew install ${formula}` : `install ${formula} with your package manager`);
const q = (s) => `"${s}"`;

function versionOf(cmd, args, re) {
  const r = run(cmd, args);
  return (r.stdout + r.stderr).match(re)?.[1] || null;
}

// Linux keeps the token in a file. It counts as stored only at mode 0600 (or
// 0400); any other mode is refused: doctor says so and prints the chmod, and
// the fetch command below reads nothing from the file.
export const TOKEN_FILE = "~/.config/ow-tools/hf-token";
export function tokenFileState(path = join(homedir(), ".config", "ow-tools", "hf-token")) {
  try {
    const st = statSync(path);
    if (!st.isFile()) return "absent";
    return [0o600, 0o400].includes(st.mode & 0o777) ? "stored" : "wrong-mode";
  } catch {
    return "absent";
  }
}

function tokenState() {
  if (mac()) {
    // No -w: presence only. The value is never read here.
    return run("security", ["find-generic-password", "-s", KEYCHAIN_SERVICE]).status === 0 ? "stored" : "absent";
  }
  return tokenFileState();
}

// The Linux form reads the file only when find (POSIX -perm, exact mode)
// confirms 0600 or 0400; any other mode gives an empty HF_TOKEN, and
// diarize.py --fetch refuses to start without one (exit 3).
export function tokenExpression(os = platform()) {
  return os === "darwin"
    ? `"$(security find-generic-password -s ${KEYCHAIN_SERVICE} -w)"`
    : `"$(find ${TOKEN_FILE} -type f \\( -perm 600 -o -perm 400 \\) -exec cat {} +)"`;
}

export function fetchCommand(env = process.env, os = platform()) {
  const token = tokenExpression(os);
  return [
    `HF_TOKEN=${token}`,
    `HF_HOME=${q(hfHome(env))}`,
    "HF_HUB_DISABLE_TELEMETRY=1",
    `UV_PROJECT_ENVIRONMENT=${q(venvDir(env))}`,
    `uv run --frozen --project ${q(PY_PROJECT)} python ${q(join(PY_PROJECT, "diarize.py"))} --fetch`,
  ].join(" ");
}

export function checks({ verifyModel = true, env = process.env } = {}) {
  const out = [];
  const add = (id, caps, ok, detail, fix, optional = false) => out.push({ id, for: caps, ok, detail, fix: ok ? null : fix, ...(optional ? { optional: true } : {}) });
  const node = process.versions.node;
  add("node", ["all"], Number(node.split(".")[0]) >= 20, `Node ${node}`, pkg("node"));

  const ff = which("ffmpeg", env) && versionOf("ffmpeg", ["-version"], /ffmpeg version (\S+)/);
  add("ffmpeg", ["transcribe"], Boolean(ff), ff ? `ffmpeg ${ff}` : "not found", pkg("ffmpeg"));
  const wc = which("whisper-cli", env) && versionOf("whisper-cli", ["--version"], /version:?\s*(\S+)/);
  add("whisper-cli", ["transcribe"], Boolean(wc), wc ? `whisper.cpp ${wc}` : "not found", pkg("whisper-cpp"));

  const m = WHISPER_MODELS["large-v3-turbo"];
  const mp = modelPath("large-v3-turbo", env);
  let modelOk = isFile(mp) && statSync(mp).size === m.bytes;
  let modelDetail = modelOk ? "present" : "not found";
  if (modelOk && verifyModel) {
    modelOk = sha256File(mp) === m.sha256;
    modelDetail = modelOk ? "present, SHA-256 matches" : "present but SHA-256 does not match; download it again";
  }
  add("whisper-model", ["transcribe"], modelOk, `${m.file}: ${modelDetail}`,
    `mkdir -p ${q(join(dataHome(env), "models"))} && curl -fL -o ${q(mp)} ${WHISPER_MODEL_URL(m.file)}   # ~1.6 GB, not gated`);

  const uv = which("uv", env) && versionOf("uv", ["--version"], /uv (\S+)/);
  add("uv", ["transcribe"], Boolean(uv), uv ? `uv ${uv}` : "not found", pkg("uv"));
  const venvOk = isFile(join(venvDir(env), "bin", "python"));
  add("python-env", ["transcribe"], venvOk, venvOk ? `Python 3.12 environment at ${venvDir(env)}` : "not built for this plugin version",
    `UV_PROJECT_ENVIRONMENT=${q(venvDir(env))} uv sync --frozen --project ${q(PY_PROJECT)}   # fetches Python 3.12 and pyannote (~1 GB); your python3 is untouched`);

  const cached = diarizationCached(env);
  if (!cached) {
    const tok = tokenState();
    const loose = tok === "wrong-mode";
    add("hf-token", ["transcribe"], tok === "stored",
      tok === "stored" ? "stored outside every repository" : loose ? `${TOKEN_FILE} is not mode 0600; refused until it is` : "not stored",
      loose ? `chmod 600 ${TOKEN_FILE}` : [
        `1. Sign in at huggingface.co and accept the terms of https://huggingface.co/${DIARIZATION_MODEL}`,
        "2. Create a read token at https://huggingface.co/settings/tokens",
        mac()
          ? `3. security add-generic-password -s ${KEYCHAIN_SERVICE} -a "$USER" -w   # prompts for the token`
          : "3. mkdir -p ~/.config/ow-tools && (umask 077; cat > ~/.config/ow-tools/hf-token)   # paste, then Ctrl-D",
      ].join("\n"));
  }
  add("speaker-model", ["transcribe"], cached, cached ? `${DIARIZATION_MODEL} cached; runs offline` : "not fetched",
    `${fetchCommand(env)}   # one time; afterwards the token can be deleted`);

  const pd = which("pandoc", env) && versionOf("pandoc", ["--version"], /pandoc (\S+)/);
  add("pandoc", ["export", "pptx"], Boolean(pd), pd ? `pandoc ${pd}` : "not found", pkg("pandoc"));
  const ty = which("typst", env) && versionOf("typst", ["--version"], /typst (\S+)/);
  const tyOk = Boolean(ty) && semverAtLeast(ty, "0.14.0");
  add("typst", ["export"], tyOk, ty ? `typst ${ty}${tyOk ? "" : " (needs 0.14 or newer for tagged PDF/UA-1)"}` : "not found", pkg("typst"));
  for (const z of ["zip", "unzip"]) add(z, ["export", "pptx"], Boolean(which(z, env)), which(z, env) ? "present" : "not found", pkg(z));

  // capture: an installed Chrome or Chromium, found on PATH or at the
  // standard paths. Its version is not asked: that would start the browser.
  const br = findBrowser(browserCandidates(env), env);
  // SA-011: the capture profile keeps its cookie key in the user's keychain.
  const keychain = mac() ? '; on first use macOS asks to let the browser use its "Chrome Safe Storage" (or "Chromium Safe Storage") keychain item: choose Always Allow' : "";
  add("browser", ["capture"], Boolean(br), br ? `found at ${br}${keychain}` : "Chrome or Chromium not found",
    mac() ? "brew install --cask google-chrome" : "install Google Chrome or Chromium with your package manager");
  // health on Python projects only; health runs without it.
  const pa = which("pip-audit", env);
  add("pip-audit", ["health"], Boolean(pa), pa ? "present (used only with a pinned requirements file, in its no-install mode)" : "not found (optional: Python advisories are reported not checked)",
    mac() ? "brew install pip-audit" : "pipx install pip-audit", true);
  // scan-secrets (1.3.0): gitleaks with template reports, and a git that keeps
  // lazy fetch off. Version probes only, of the program scan-secrets itself
  // would find (PATH's absolute folders), run by that absolute path: never a
  // ./gitleaks from the current folder (SS-05b), nor one from inside the
  // repository the current folder is in (RC-03).
  const skip = [cwdRepo()].filter(Boolean);
  const glPath = findOnPath("gitleaks", env, skip);
  const gl = glPath && versionOf(glPath, ["version"], /(\d+\.\d+\.\d+)/);
  const glOk = Boolean(gl) && semverAtLeast(gl, GITLEAKS_MIN);
  add("gitleaks", ["scan-secrets"], glOk, gl ? `gitleaks ${gl}${glOk ? "" : ` (needs ${GITLEAKS_MIN} or newer)`}` : "not found",
    mac() ? `brew ${gl ? "upgrade" : "install"} gitleaks` : `install gitleaks ${GITLEAKS_MIN} or newer with your package manager`);
  const gitPath = findOnPath("git", env, skip);
  const gv = gitPath && versionOf(gitPath, ["--version"], /git version (\d+\.\d+\.\d+)/);
  const gvOk = Boolean(gv) && semverAtLeast(gv, GIT_MIN);
  add("git", ["scan-secrets"], gvOk, gv ? `git ${gv}${gvOk ? "" : ` (needs ${GIT_MIN} or newer)`}` : "not found",
    mac() ? "brew install git" : `install git ${GIT_MIN} or newer with your package manager`);
  return out;
}

// Optional rows (pip-audit) never make a capability "missing".
export function capabilities(list) {
  const caps = {};
  for (const cap of ["transcribe", "export", "pptx", "capture", "scan-secrets"]) {
    const miss = list.filter((c) => (c.for.includes(cap) || c.for.includes("all")) && !c.ok && !c.optional).map((c) => c.id);
    caps[cap] = miss.length ? { ready: false, missing: miss } : { ready: true };
  }
  // Node only: never absent where ow-tools runs.
  for (const cap of ["xlsx", "health", "calc", "digest"]) caps[cap] = { ready: true };
  // The contract calendars calc counts business days on (ow-uat detects them here, never by version number).
  caps.calc.calendars = [...CALENDARS];
  const pa = list.find((c) => c.id === "pip-audit");
  if (pa && !pa.ok) caps.health.note = "Python advisories need pip-audit (optional)";
  return caps;
}

export function doctor(opts = {}) {
  const list = checks(opts);
  return {
    status: list.every((c) => c.ok || c.optional) ? "ready" : "incomplete",
    version: VERSION,
    data_home: dataHome(opts.env),
    capabilities: capabilities(list),
    checks: list,
    note: "ow-tools installs nothing itself. Run the printed commands in your own terminal, then run ow-tools doctor again.",
  };
}

export function doctorText(r) {
  const lines = [`ow-tools ${r.version} — ${r.status}`, `data folder: ${r.data_home}`, ""];
  for (const [cap, s] of Object.entries(r.capabilities)) lines.push(`${cap}: ${s.ready ? "ready" : `missing ${s.missing.join(", ")}`}`);
  lines.push("");
  for (const c of r.checks) {
    lines.push(`${c.ok ? "ok  " : c.optional ? "opt " : "MISS"} ${c.id.padEnd(14)} ${c.detail}`);
    if (c.fix) lines.push(...c.fix.split("\n").map((l) => `       fix: ${l}`));
  }
  lines.push("", r.note);
  return lines.join("\n");
}
