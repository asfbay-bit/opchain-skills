"""ow-tools speaker separation: a 16 kHz mono WAV in, speaker turns JSON out.

Two modes:
  diarize.py --fetch                 one-time setup, run by the user: downloads the
                                     model into HF_HOME using HF_TOKEN from the
                                     environment. Never prints the token.
  diarize.py WAV OUT [--speakers N]  a transcription run: offline only. Refuses to
                                     start unless HF_HUB_OFFLINE=1, and drops any
                                     token from its own environment first.

All the merge logic lives in ow-tools' Node code (lib/merge.mjs), where it is
tested without the model. This file only loads the pipeline and writes turns.
"""

import argparse
import json
import os
import sys
import time
import wave

DEFAULT_MODEL = "pyannote/speaker-diarization-community-1"


def fail(msg, code=5):
    print(f"diarize: {msg}", file=sys.stderr)
    sys.exit(code)


def load_wav(path):
    import numpy as np
    import torch

    with wave.open(path, "rb") as w:
        if w.getnchannels() != 1 or w.getsampwidth() != 2:
            fail("expected 16-bit mono WAV (ow-tools normalises with ffmpeg first)", 4)
        rate = w.getframerate()
        frames = w.readframes(w.getnframes())
    samples = np.frombuffer(frames, dtype="<i2").astype("float32") / 32768.0
    return {"waveform": torch.from_numpy(samples).unsqueeze(0), "sample_rate": rate}


def turns(annotation):
    out = []
    for segment, _track, label in annotation.itertracks(yield_label=True):
        out.append({"start": round(segment.start, 3), "end": round(segment.end, 3), "speaker": label})
    out.sort(key=lambda t: (t["start"], t["end"], t["speaker"]))
    return out


def fetch(model):
    token = os.environ.get("HF_TOKEN")
    if not token:
        fail(
            "HF_TOKEN is not set; read it from your keychain (macOS) or from ~/.config/ow-tools/hf-token,"
            " which is read only at mode 0600 (Linux), in the same command (see ow-tools doctor)",
            3,
        )
    from pyannote.audio import Pipeline

    Pipeline.from_pretrained(model, token=token)
    print(f"fetched {model} into {os.environ.get('HF_HOME', 'the default Hugging Face cache')}")


def run(args):
    if os.environ.get("HF_HUB_OFFLINE") != "1":
        fail("refusing to run without HF_HUB_OFFLINE=1 (transcription never uses the network)", 4)
    for name in ("HF_TOKEN", "HUGGING_FACE_HUB_TOKEN"):
        os.environ.pop(name, None)

    import torch
    from pyannote.audio import Pipeline

    started = time.monotonic()
    try:
        pipeline = Pipeline.from_pretrained(args.model)
    except Exception as exc:  # noqa: BLE001 - surface one line, never a traceback with paths
        fail(f"model not available offline ({type(exc).__name__}); run the one-time fetch from ow-tools doctor", 3)
    if pipeline is None:
        fail("model not available offline; run the one-time fetch from ow-tools doctor", 3)
    if args.device == "mps":
        if not torch.backends.mps.is_available():
            fail("--device mps requested but MPS is not available", 4)
        pipeline.to(torch.device("mps"))

    kwargs = {}
    if args.speakers:
        kwargs["num_speakers"] = args.speakers
    output = pipeline(load_wav(args.wav), **kwargs)

    # pyannote.audio 4 returns an object with both views; 3.x returns an Annotation.
    regular = getattr(output, "speaker_diarization", output)
    exclusive = getattr(output, "exclusive_speaker_diarization", None)
    result = {
        "model": args.model,
        "pyannote_audio": __import__("pyannote.audio").audio.__version__,
        "device": args.device,
        "seconds": round(time.monotonic() - started, 2),
        "turns": turns(regular),
        "exclusive_turns": turns(exclusive) if exclusive is not None else None,
    }
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(result, fh)


def main():
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("wav", nargs="?")
    p.add_argument("out", nargs="?")
    p.add_argument("--fetch", action="store_true")
    p.add_argument("--model", default=DEFAULT_MODEL)
    p.add_argument("--speakers", type=int)
    p.add_argument("--device", choices=["cpu", "mps"], default="cpu")
    args = p.parse_args()
    if args.fetch:
        fetch(args.model)
    elif args.wav and args.out:
        run(args)
    else:
        p.error("give WAV and OUT, or --fetch")


if __name__ == "__main__":
    main()
