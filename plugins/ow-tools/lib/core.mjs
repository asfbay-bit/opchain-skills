// Shared plumbing for ow-tools: where things live, exit codes, subprocesses.
// Node built-ins only: the plugin ships no package.json, so Claude Code never
// runs an npm install for it.
import { spawnSync } from "node:child_process";
import { accessSync, constants, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256File } from "./hash.mjs";

export { sha256File };

export const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const PY_PROJECT = join(PLUGIN_ROOT, "python");
export const VERSION = JSON.parse(
  readFileSync(join(PLUGIN_ROOT, ".claude-plugin", "plugin.json"), "utf8"),
).version;

// Exit codes are the contract the ow- skills read (design §4.1).
export const EXIT = { OK: 0, USAGE: 2, MISSING: 3, REFUSED: 4, FAILED: 5 };

export class OwError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    this.extra = extra;
  }
}
export const usage = (msg) => new OwError(EXIT.USAGE, msg);
// Every exit-4 refusal carries a stable `reason` code, listed with its next
// step in design §14.3, so a calling skill can relay it in its own words.
export const refused = (reason, msg, extra = {}) => new OwError(EXIT.REFUSED, msg, { reason, ...extra });
export const missing = (msg, extra) => new OwError(EXIT.MISSING, msg, extra);
export const failed = (msg, extra) => new OwError(EXIT.FAILED, msg, extra);

// Venv, models and the Hugging Face cache live outside every repository.
// CLAUDE_PLUGIN_DATA is not visible to commands run through the Bash tool, so
// ow-tools keeps its own location.
export function dataHome(env = process.env) {
  if (env.OW_TOOLS_HOME) return resolve(env.OW_TOOLS_HOME);
  const base = env.XDG_DATA_HOME ? resolve(env.XDG_DATA_HOME) : join(homedir(), ".local", "share");
  return join(base, "ow-tools");
}

export const WHISPER_MODELS = {
  "large-v3-turbo": {
    file: "ggml-large-v3-turbo.bin",
    bytes: 1624555275,
    sha256: "1fc70f774d38eb169993ac391eea357ef47c88757ef72ee5943879b7e8e2bc69",
  },
  medium: {
    file: "ggml-medium.bin",
    bytes: 1533763059,
    sha256: "6c14d5adee5f86394037b4e4e8b59f1673b6cee10e3cf0b11bbdbee79c156208",
  },
};
export const WHISPER_MODEL_URL = (file) => `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${file}`;
export const DIARIZATION_MODEL = "pyannote/speaker-diarization-community-1";
export const KEYCHAIN_SERVICE = "ow-tools-huggingface";

export const modelPath = (name, env) => join(dataHome(env), "models", WHISPER_MODELS[name].file);
export const hfHome = (env) => join(dataHome(env), "hf");
export const lockHash = () => sha256File(join(PY_PROJECT, "uv.lock")).slice(0, 12);
export const venvDir = (env) => join(dataHome(env), `venv-${lockHash()}`);
export const diarizationCached = (env) =>
  isDir(join(hfHome(env), "hub", `models--${DIARIZATION_MODEL.replace("/", "--")}`, "snapshots"));

export function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}
export function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

// PATH lookup without spawning a shell: the session hook must stay cheap.
export function which(cmd, env = process.env) {
  for (const dir of (env.PATH || "").split(delimiter)) {
    if (!dir) continue;
    const p = join(dir, cmd);
    try {
      accessSync(p, constants.X_OK);
      if (statSync(p).isFile()) return p;
    } catch {
      /* next */
    }
  }
  return null;
}

export function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    ...opts,
  });
  return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || "", error: r.error };
}

// Full major.minor.patch compare (F-010); a pre-release suffix is ignored.
export function semverAtLeast(found, min) {
  const parse = (v) => String(v).replace(/^v/, "").split(/[.+-]/).slice(0, 3).map((n) => Number.parseInt(n, 10) || 0);
  const a = parse(found);
  const b = parse(min);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return true;
}

// Last non-empty line of a tool's stderr, for an exit-5 message. Never the whole log:
// a tool's log can echo file contents.
export function oneLine(text, n = 200) {
  const line = String(text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .pop();
  return (line || "no error output").slice(0, n);
}

export function localDate(now = nowDate()) {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return parts; // en-CA formats as YYYY-MM-DD
}
export function timeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}
// Tests pin the clock with OW_TOOLS_NOW (an ISO timestamp).
export function nowDate(env = process.env) {
  return env.OW_TOOLS_NOW ? new Date(env.OW_TOOLS_NOW) : new Date();
}
