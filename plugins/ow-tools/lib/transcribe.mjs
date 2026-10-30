// `ow-tools transcribe` and `ow-tools speakers` (design §5.1).
import { availableParallelism } from "node:os";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import {
  DIARIZATION_MODEL,
  DIARIZATION_REVISION,
  PY_PROJECT,
  VERSION,
  WHISPER_MODELS,
  diarizationCached,
  failed,
  hfHome,
  isFile,
  localDate,
  missing,
  modelPath,
  oneLine,
  refused,
  run,
  sha256File,
  usage,
  venvDir,
  verifyWhisperModel,
  which,
} from "./core.mjs";
import { assertAudioInput, assertIgnored, withTempDir, withTmpSiblings, writePrivate } from "./guards.mjs";
import { mergeTranscript, speakerStats, wordsFromWhisper } from "./merge.mjs";
import { renderTranscript } from "./render.mjs";

const posix = (p) => p.split(sep).join("/");

// The workstream is the first two segments under opchain-work/
// (e.g. intake/meridian-tile), or none outside it. Never an absolute path (R2).
export function workstreamOf(dir) {
  const parts = resolve(dir).split(sep);
  const i = parts.lastIndexOf("opchain-work");
  if (i < 0 || i === parts.length - 1) return null;
  return parts.slice(i + 1, i + 3).join("/");
}

export function transcribeRequirements(model = "large-v3-turbo", env = process.env) {
  const out = [];
  if (!which("ffmpeg", env)) out.push("ffmpeg");
  if (!which("whisper-cli", env)) out.push("whisper-cli (whisper.cpp)");
  const whisper = verifyWhisperModel(model, env);
  if (!whisper.ok) out.push(`Whisper model ${model} (${whisper.detail})`);
  if (!which("uv", env)) out.push("uv");
  if (!isFile(join(venvDir(env), "bin", "python"))) out.push("Python 3.12 environment for pyannote");
  if (!diarizationCached(env)) out.push(`speaker model ${DIARIZATION_MODEL}`);
  return out;
}

function readSize(p) {
  try {
    return statSync(p).size;
  } catch {
    return -1;
  }
}

function toolVersion(cmd, args, re) {
  const r = run(cmd, args);
  const m = (r.stdout + r.stderr).match(re);
  return m ? m[1] : "unknown";
}

// Transcripts are written 0600 through a guarded sibling (F-006).
export function writeTranscript(dir, doc) {
  mkdirSync(dir, { recursive: true });
  writePrivate(join(dir, "transcript.json"), JSON.stringify(doc, null, 2) + "\n");
  writePrivate(join(dir, "transcript.md"), renderTranscript(doc));
}

export async function transcribe(opts, log = () => {}) {
  const { audio, out, speakers, language = "auto", model = "large-v3-turbo", device = "cpu", force = false, banner } = opts;
  if (!audio) throw usage("usage: ow-tools transcribe <workstream>/audio/[<file>] [--out DIR] [--speakers N]");
  if (banner !== undefined && !/^[^\u0000-\u001f\u007f]{1,200}$/.test(banner)) throw usage("--banner must be one line of at most 200 characters");
  if (!WHISPER_MODELS[model]) throw usage(`unknown model ${model}; use large-v3-turbo or medium`);
  if (speakers !== undefined && !(Number.isInteger(speakers) && speakers > 0 && speakers < 21)) {
    throw usage("--speakers must be a whole number from 1 to 20");
  }
  if (!["cpu", "mps"].includes(device)) throw usage("--device must be cpu or mps");
  if (!/^(auto|[a-z]{2,3})$/.test(language)) throw usage("--language must be auto or a language code such as en");

  const audioAbs = assertAudioInput(audio);
  const outDir = resolve(out ?? dirname(dirname(audioAbs)));
  const jsonPath = join(outDir, "transcript.json");
  const mdPath = join(outDir, "transcript.md");
  assertIgnored([audioAbs, ...withTmpSiblings([jsonPath, mdPath])]);
  if (!force && (existsSync(jsonPath) || existsSync(mdPath))) {
    throw refused("output-exists", `a transcript already exists in ${outDir}; pass --out <folder> for another recording, or --force to replace it`);
  }
  const need = transcribeRequirements(model);
  if (need.length) throw missing(`transcription needs: ${need.join(", ")}. Run ow-tools doctor for the exact steps.`, { missing: need });

  const timings = {};
  const t = () => performance.now() / 1000;
  return withTempDir(async (tmp) => {
    let t0 = t();
    const wav = join(tmp, "audio.wav");
    log("normalising audio");
    // -protocol_whitelist file: ffmpeg picks a demuxer from the bytes, not the
    // name, so a "recording" that is really a playlist could otherwise open
    // other files' URLs or the network. Only the local file protocol is allowed.
    let r = run("ffmpeg", ["-nostdin", "-loglevel", "error", "-y", "-protocol_whitelist", "file", "-i", audioAbs, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wav]);
    if (r.status !== 0) throw failed(`ffmpeg could not read the recording: ${oneLine(r.stderr)}`);
    timings.normalise_s = t() - t0;
    const durationS = (readSize(wav) - 44) / 32000;

    t0 = t();
    log("transcribing (whisper.cpp)");
    const threads = String(Math.min(8, Math.max(1, availableParallelism())));
    // On long English recordings large-v3-turbo can drift into lowercase text
    // with no punctuation (seen in the spike, §10). A punctuated starting
    // prompt keeps sentences and capitals; it is not added for other languages.
    const prompt = ["auto", "en"].includes(language) ? ["--prompt", "Hello, and thanks for joining the call. Let's get started."] : [];
    r = run("whisper-cli", ["-m", modelPath(model), "-f", wav, "-l", language, "-t", threads, ...prompt, "-ojf", "-of", join(tmp, "whisper"), "-np"]);
    if (r.status !== 0 || !isFile(join(tmp, "whisper.json"))) throw failed(`whisper-cli failed: ${oneLine(r.stderr)}`);
    const whisper = wordsFromWhisper(JSON.parse(readFileSync(join(tmp, "whisper.json"), "utf8")));
    timings.transcribe_s = t() - t0;

    t0 = t();
    log("separating speakers (pyannote, offline)");
    const env = { ...process.env };
    for (const k of ["HF_TOKEN", "HUGGING_FACE_HUB_TOKEN"]) delete env[k];
    Object.assign(env, {
      UV_PROJECT_ENVIRONMENT: venvDir(),
      UV_OFFLINE: "1",
      HF_HOME: hfHome(),
      HF_HUB_OFFLINE: "1",
      TRANSFORMERS_OFFLINE: "1",
      HF_DATASETS_OFFLINE: "1",
      HF_HUB_DISABLE_TELEMETRY: "1",
      PYTHONDONTWRITEBYTECODE: "1",
    });
    // --no-sync: run in the environment the user built; never install into it.
    const args = ["run", "--frozen", "--no-sync", "--project", PY_PROJECT, "python", join(PY_PROJECT, "diarize.py"), wav, join(tmp, "turns.json"), "--device", device, "--revision", DIARIZATION_REVISION];
    if (speakers) args.push("--speakers", String(speakers));
    r = run("uv", args, { env });
    if (r.status !== 0 || !isFile(join(tmp, "turns.json"))) {
      throw (r.status === 3 ? missing : failed)(`speaker separation failed: ${oneLine(r.stderr)}`);
    }
    const turns = JSON.parse(readFileSync(join(tmp, "turns.json"), "utf8"));
    timings.diarize_s = t() - t0;

    t0 = t();
    const merged = mergeTranscript(whisper, turns.turns, turns.exclusive_turns);
    timings.merge_s = t() - t0;

    const doc = {
      ow_artefact: "ow-tools/transcript",
      schema: 1,
      written_by: `ow-tools ${VERSION} (protocol 1)`,
      workstream: workstreamOf(outDir),
      subject: posix(relative(outDir, audioAbs)),
      created: localDate(),
      clock: "tool",
      origin: "third-party (recording)",
      ...(banner ? { banner } : {}),
      language: whisper.language,
      source: {
        audio: posix(relative(outDir, audioAbs)),
        sha256: sha256File(audioAbs),
        duration_s: Math.round(durationS * 10) / 10,
      },
      pipeline: {
        normalise: `ffmpeg ${toolVersion("ffmpeg", ["-version"], /ffmpeg version (\S+)/)}`,
        transcribe: `whisper.cpp ${toolVersion("whisper-cli", ["--version"], /version:?\s*(\S+)/)} ${model}`,
        diarize: `pyannote.audio ${turns.pyannote_audio} ${turns.model.split("/").pop()} (${turns.device})`,
        merge: `ow-tools ${VERSION}`,
      },
      speakers: merged.speakers,
      segments: merged.segments,
    };
    writeTranscript(outDir, doc);
    for (const k of Object.keys(timings)) timings[k] = Math.round(timings[k] * 10) / 10;
    return {
      status: "done",
      transcript: { json: jsonPath, md: mdPath },
      duration_s: doc.source.duration_s,
      timings,
      speakers: doc.speakers.map((s) => s.id),
      samples: samples(doc),
      next: `confirm who each speaker is: ow-tools speakers ${jsonPath} --set ${doc.speakers
        .filter((s) => s.id !== "UNKNOWN")
        .map((s) => `${s.id}=<role>`)
        .join(" --set ")}`,
    };
  });
}

// Two sample lines per speaker: the two longest distinct turns, in time order.
export function samples(doc, n = 2) {
  const out = {};
  for (const s of doc.speakers) {
    if (s.id === "UNKNOWN") continue;
    const seen = new Set();
    const picks = doc.segments
      .filter((g) => g.speaker === s.id)
      .sort((a, b) => b.text.length - a.text.length || a.start - b.start)
      .filter((g) => !seen.has(g.text) && seen.add(g.text))
      .slice(0, n)
      .sort((a, b) => a.start - b.start);
    out[s.id] = picks.map((g) => ({ start: g.start, text: g.text }));
  }
  return out;
}

const ROLE_RE = /^[^\u0000-\u001f\u007f|<>]{1,60}$/;

export function setRoles(doc, assignments) {
  const ids = new Set(doc.speakers.map((s) => s.id));
  const roles = Object.fromEntries(doc.speakers.map((s) => [s.id, s.role]));
  for (const a of assignments) {
    const m = /^([A-Z_0-9]+)=(.*)$/.exec(a);
    if (!m) throw usage(`--set takes SPEAKER_NN=<role>, got: ${a}`);
    const [, id, role] = m;
    if (!ids.has(id) || id === "UNKNOWN") throw usage(`no speaker ${id} in this transcript (have: ${[...ids].join(", ")})`);
    const r = role.trim();
    if (!ROLE_RE.test(r)) throw usage(`role for ${id} must be 1-60 characters with no line breaks, "|", "<" or ">"`);
    roles[id] = r;
  }
  return { ...doc, speakers: speakerStats(doc.segments, roles) };
}

export function speakers({ transcript, set = [] }) {
  if (!transcript) throw usage("usage: ow-tools speakers <transcript.json> [--set SPEAKER_00=<role> ...]");
  const path = resolve(transcript);
  if (!isFile(path) || basename(path) !== "transcript.json") throw usage("give the path to a transcript.json written by ow-tools");
  let doc = JSON.parse(readFileSync(path, "utf8"));
  if (doc.ow_artefact !== "ow-tools/transcript" || doc.schema !== 1) throw refused("not-a-transcript", "not an ow-tools transcript (schema 1)");
  if (set.length) {
    // SA-007 (a): the rewrite is held to the same ignore rule as transcribe.
    assertIgnored(withTmpSiblings([path, join(dirname(path), "transcript.md")]));
    doc = setRoles(doc, set);
    writeTranscript(dirname(path), doc);
  }
  return {
    status: set.length ? "roles recorded" : "roles shown",
    speakers: doc.speakers,
    samples: samples(doc),
    unconfirmed: doc.speakers.filter((s) => s.id !== "UNKNOWN" && !s.role).map((s) => s.id),
  };
}
