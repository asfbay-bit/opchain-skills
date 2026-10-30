// Pure functions: whisper.cpp JSON → words, and words + speaker turns →
// speaker-labelled segments. No I/O, so every rule here is unit-tested.

// whisper-cli -ojf: transcription[].tokens[] with text and offsets in ms.
// Special tokens look like "[_BEG_]" / "[_TT_71]". A token that starts with a
// space begins a new word; anything else (sub-word pieces, punctuation) joins
// the word before it.
export function wordsFromWhisper(json) {
  const segments = [];
  for (const seg of json.transcription || []) {
    const words = [];
    for (const tok of seg.tokens || []) {
      const text = String(tok.text ?? "");
      if (!text || text.startsWith("[_")) continue;
      const start = (tok.offsets?.from ?? seg.offsets?.from ?? 0) / 1000;
      const end = (tok.offsets?.to ?? start * 1000) / 1000;
      const last = words[words.length - 1];
      if (last && !/^\s/.test(text)) {
        last.text += text;
        last.end = Math.max(last.end, end);
      } else {
        words.push({ start, end: Math.max(start, end), text });
      }
    }
    if (words.length === 0 && String(seg.text || "").trim()) {
      // No token detail: treat the segment as one word-run.
      words.push({ start: seg.offsets.from / 1000, end: seg.offsets.to / 1000, text: seg.text });
    }
    if (words.length) {
      segments.push({ start: seg.offsets?.from / 1000, end: seg.offsets?.to / 1000, words });
    }
  }
  return { language: json.result?.language || null, segments };
}

const UNKNOWN = "UNKNOWN";
const NEAR_S = 1.0; // a word within 1 s of a turn still belongs to it

function speakerFor(word, regular, exclusive) {
  const mid = (word.start + word.end) / 2;
  if (exclusive) {
    const t = exclusive.find((x) => x.start <= mid && mid < x.end);
    if (t) return t.speaker;
  }
  let best = null;
  let bestOverlap = 0;
  for (const t of regular) {
    const ov = Math.min(word.end, t.end) - Math.max(word.start, t.start);
    if (ov > bestOverlap) {
      best = t;
      bestOverlap = ov;
    }
  }
  if (best) return best.speaker;
  let near = null;
  let dist = NEAR_S;
  for (const t of exclusive || regular) {
    const d = mid < t.start ? t.start - mid : mid > t.end ? mid - t.end : 0;
    if (d <= dist) {
      near = t;
      dist = d;
    }
  }
  return near ? near.speaker : UNKNOWN;
}

function inOverlap(word, regular) {
  const mid = (word.start + word.end) / 2;
  const who = new Set(regular.filter((t) => t.start <= mid && mid < t.end).map((t) => t.speaker));
  return who.size > 1;
}

const ISLAND_S = 0.5; // a one-word flip shorter than this is timing jitter

// Words → segments split wherever the speaker changes. A one-word island
// between two runs of the same speaker inside one Whisper segment is absorbed.
export function mergeTranscript(whisper, regularTurns, exclusiveTurns = null) {
  const regular = [...(regularTurns || [])].sort((a, b) => a.start - b.start);
  const exclusive = exclusiveTurns ? [...exclusiveTurns].sort((a, b) => a.start - b.start) : null;
  const out = [];
  for (const seg of whisper.segments) {
    const labelled = seg.words.map((w) => ({
      ...w,
      speaker: speakerFor(w, regular, exclusive),
      overlap: inOverlap(w, regular),
    }));
    for (let i = 1; i < labelled.length - 1; i++) {
      const [a, w, b] = [labelled[i - 1], labelled[i], labelled[i + 1]];
      if (w.speaker !== a.speaker && a.speaker === b.speaker && w.end - w.start < ISLAND_S) {
        w.speaker = a.speaker;
      }
    }
    let run = null;
    for (const w of labelled) {
      if (!run || run.speaker !== w.speaker) {
        run = { start: w.start, end: w.end, speaker: w.speaker, words: [], overlap: false };
        out.push(run);
      }
      run.words.push(w.text);
      run.end = Math.max(run.end, w.end);
      run.overlap = run.overlap || w.overlap;
    }
  }
  const segments = out.map((r) => ({
    start: round(r.start),
    end: round(r.end),
    speaker: r.speaker,
    text: r.words.join("").replace(/\s+/g, " ").trim(),
    overlap: r.overlap,
  })).filter((s) => s.text);
  return { segments, speakers: speakerStats(segments) };
}

export function speakerStats(segments, roles = {}) {
  const talk = new Map();
  for (const s of segments) talk.set(s.speaker, (talk.get(s.speaker) || 0) + (s.end - s.start));
  return [...talk.keys()]
    .sort((a, b) => (a === UNKNOWN) - (b === UNKNOWN) || a.localeCompare(b))
    .map((id) => ({ id, role: roles[id] ?? null, talk_s: round(talk.get(id)) }));
}

const round = (n) => Math.round(n * 1000) / 1000;
