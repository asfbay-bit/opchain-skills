---
name: ow-tools
description: "/ow-tools: status and setup of ow-tools, the code add-on for the ow- skills in Claude Code (transcription, PDF/Word/PowerPoint/Excel export, screenshots, health checks, a redacted secrets scan, digests, date and hours arithmetic, the session-start workstream list). Use for 'is ow-tools installed', 'what does ow-tools need', 'set up transcription', 'why can't I export a PDF', 'delete the capture profile', 'install gitleaks for the secrets scan'. NOT for running a transcription (/ow-start-transcribe), exporting a document (the ow- skill's own export verb) or scanning a client's repository (ow-handoff does that)."
---

# /ow-tools

ow-tools **runs code on this machine**. The ow- skills are text only; every piece of code they need is here. Without ow-tools they still work, using a transcript, notes or Markdown instead.

## Steps

1. Run `ow-tools doctor --quick` and show its output as it is. It checks each requirement and prints the command that fixes it. Run plain `ow-tools doctor` only when the user asks to verify the Whisper model's checksum (it reads 1.6 GB).
2. Explain each `MISS` line in one plain sentence. Group them by what they unlock: transcription, PDF and Word export, PowerPoint export, screenshots (capture), or the secrets scan (gitleaks and git). An `opt` line (pip-audit) is optional.
3. The user runs the fixes in their own terminal. **Never run `brew`, `apt`, `sudo`, `uv sync`, `pipx`, a model or browser download or a keychain command yourself.** The commands must match the ones in the ow-tools README. The Hugging Face token is needed once, for the speaker-model fetch. The user stores it in their keychain. It never goes in a file, a repository or this chat.
4. After the user has run the fixes, run `ow-tools doctor` again.

## What ow-tools does

| Command | For |
|---|---|
| `ow-tools transcribe <workstream>/audio/[<file>]` | A recording → `transcript.json` + `transcript.md`, local only (via `/ow-start-transcribe`) |
| `ow-tools speakers <transcript.json> [--set SPEAKER_00=<role>]` | Show sample lines; record who each speaker is |
| `ow-tools export <file.md> [--formats pdf,docx,pptx]` | Branded PDF, Word and PowerPoint from Markdown and `opchain-work/brand.yaml`, with an accessibility pre-check; a record in `export/<name>.export.json` |
| `ow-tools export <sheet-folder> --formats xlsx` | An Excel workbook from CSV files and a formula map (`model.md`), formulas kept |
| `ow-tools calc today \| date \| total \| split \| hours` | Today's date, business days (your holidays, or `--calendar us-federal`), totals, payment splits and care-plan hours, checked by a tool |
| `ow-tools digest <file\|folder>` | A SHA-256 that detects accidental change only; not tamper-evidence |
| `ow-tools health --config health.yaml [--no-network]` | Read-only checks of what `health.yaml` lists. **Sends** package names and versions to OSV and npm, domains to RDAP, and requests to the listed hosts and URLs; `--no-network` sends nothing (`ow-tools help network`) |
| `ow-tools capture --plan plan.json --out <…>/shots/ [--sign-in] [--timeout S]` | Screenshots of the test environment the plan lists, in the user's Chrome or Chromium. The user signs in; ow-tools never types a password. It stops after 110 s by default: for a `--sign-in` that may take longer, pass `--timeout` (up to 590) and start it with `run_in_background`, then wait for it. `--profiles` lists the browser profiles, `--delete-profile <id>` removes one |
| `ow-tools scan-secrets <repo> [--json]` | The text files of a repository's committed history scanned for secrets with gitleaks, redacted: path, commit, line and rule id only, never the matched text. A path is shown as it is, so a secret in a file or folder name is shown. `CLEAN` and `HITS` both exit 0; any other exit is NOT-CHECKED. Never the working tree; the repository's own allowlists and git config are not used, but gitleaks' built-in allowlist skips some paths (dependency folders, lock files, binary formats), and binary or UTF-16 files and commit messages are not read |
| `ow-tools version` | Is it installed, and what is ready |

At session start it also lists the open workstreams in `opchain-work/STATUS.md`. It reads that file and never writes it.

## What it never does

Installs anything or downloads a browser · sends audio, a transcript or document text anywhere (only `health` and `capture` use the network, for what their config or plan lists) · types into a password field, reads a cookie or runs a plan's JavaScript · edits `.gitignore`, `STATUS.md` or any file an ow- skill writes · prints or stores a credential, or the text a scan matched (a capture profile holds the test session the user signed in to; a scan shows each hit's path as it is, so a secret in a file name is shown) · checks screenshots for real data (that is the calling skill's data check) · guesses who a speaker is · claims an exported document passes an accessibility standard (it checks structure only).
