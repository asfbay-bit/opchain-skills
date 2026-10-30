# ow-tools (Claude Code plugin)

**Runs code on your machine.** ow-tools is the one code add-on for the ow- planning skills. The ow- skills are text only and work on any host. Everything that needs code lives here, and only Claude Code installs it:

| Part | What it does |
|---|---|
| **Transcription** | A recorded call → `transcript.json` + `transcript.md`, with speakers separated and then confirmed by you. ffmpeg → whisper.cpp (`large-v3-turbo`) → pyannote (`speaker-diarization-community-1`) → merge. **Local only.** |
| **Export** | Markdown → branded, accessible **PDF, Word and PowerPoint** (one slide per `##`, speaker notes), styled from your `opchain-work/brand.yaml`. pandoc + Typst (tagged PDF/UA-1). A sheet folder (CSV files + a formula map) → **Excel** with its formulas kept. Every export leaves a record of what was exported (`export/<name>.export.json`). |
| **calc** | Today's date, business days with your holidays or on the contract calendar (`--calendar us-federal`, weekdays except US federal holidays as observed, 2022 to 2099), totals and payment splits, and care-plan hours with rollover, checked by a tool so skills don't have to mark them "not machine-checked". |
| **digest** | The SHA-256 of a file, or of a folder in a form a shell one-liner reproduces. It detects accidental change only; it is not tamper-evidence. |
| **health** | Read-only monthly checks of what a `health.yaml` lists: dependency advisories and outdated packages, TLS certificate and domain expiry, HTTP status, a backup file's age. **Uses the network** (see Privacy). |
| **capture** | Screenshots of a running test environment from a plan (navigate, click, fill test data, wait, shot), in your installed Chrome or Chromium on a separate profile per workstream. You sign in yourself. **Uses the network** (see Privacy). |
| **scan-secrets** | Scans the text files of a repository's committed history (every branch, tag and HEAD, two-parent merges included) for secrets with gitleaks, in **redacted form only**: each hit is a path, a commit, a line and a rule id, never the matched text. A path is shown as it is, so a secret in a file or folder name is shown. `CLEAN` and `HITS` both exit 0; anything else is NOT-CHECKED and says so. The working tree is never scanned, and some things are never read (see Privacy). |
| **Session start** | Lists the open workstreams in `opchain-work/STATUS.md` with their next step and anything overdue. Silent in every other folder, and silent when the `node` on your PATH is older than 20. |

Without ow-tools the ow- skills still work: paste a transcript or notes, and keep the Markdown as the document.

## Install

```
/plugin marketplace add https://raw.githubusercontent.com/asfbay-bit/opchain-skills/main/plugins/ow-tools/.claude-plugin/marketplace.json
/plugin install ow-tools@opchain-work-tools
```

Before a release is tagged the entry follows the mirror's `main`; from the first tagged release on, it names that release's tag (`ref: v<semver>`), which the mirror carries as a tag of its own, so an update is a new release, never a mirror sync. To check the copy you installed against what opchain.dev published, compare `shasum -a 256 SECURITY-MANIFEST.md` in the plugin folder with `https://opchain.dev/work/ow-tools-security-manifest.sha256`.

This marketplace lists **ow-tools only**, so an administrator can approve it (for example in `strictKnownMarketplaces`) without approving anything else. Then run `/ow-tools` to see what's missing on your machine.

## What it needs

`/ow-tools` (or `ow-tools doctor`) checks each requirement and prints the command that fixes it. **ow-tools installs nothing itself**, not even into its own Python environment: transcription runs `uv run --frozen --no-sync`. You run every step in your own terminal.

| For | Needs |
|---|---|
| everything | Node.js 20+ |
| transcription | ffmpeg · whisper.cpp (`whisper-cli`) · the Whisper `large-v3-turbo` model (~1.6 GB) · uv, which builds a private Python 3.12 environment with pyannote (~1 GB; your own `python3` is untouched) · the pyannote model, fetched once with a free Hugging Face read token after you accept its terms |
| export | pandoc · Typst 0.14+ · `zip` / `unzip` (PowerPoint: pandoc, `zip`, `unzip`; Excel: nothing beyond Node) |
| capture | Google Chrome or Chromium, installed by you (`brew install --cask google-chrome`); ow-tools never downloads a browser |
| health | Nothing beyond Node; `pip-audit` (optional) for Python projects |
| scan-secrets | gitleaks 8.19 or newer (`brew install gitleaks`) and git 2.45.1 or newer (`brew install git`; Apple's own git is older) |

The venv, models and Hugging Face cache live in `~/.local/share/ow-tools` (or `$OW_TOOLS_HOME`), outside every repository. Uninstalling the plugin doesn't remove that folder; `ow-tools doctor` prints where it is.

Built and tested on macOS (Apple Silicon). Linux gets the same checks with generic install hints. Windows is not supported.

## Privacy

- **Audio and transcripts never leave the machine.** The speaker model runs with Hugging Face's offline switches on and no token in its environment. ffmpeg runs with `-protocol_whitelist file`, so a "recording" that is really a playlist can't make it open a network address. There is no telemetry and no update check.
- **Two verbs use the network, and only for what you list.** Every other verb sends nothing anywhere.
  - **`health`** sends the name and version of each public-registry npm package in the lockfile to OSV (`api.osv.dev`), each direct dependency's name to the npm registry (`registry.npmjs.org`), each listed domain to its registry's RDAP server (found through `data.iana.org`), a TLS handshake to each listed host and a GET to each listed URL; pip-audit, if you have it and list a pinned requirements file, sends those Python package names and versions to OSV too (and keeps its own cache in your user cache folder). When OSV's batch answer doesn't line up with the packages asked about, each one is asked again on its own (the same name and version, at most 50). It never sends a package that resolves to a private registry, a git URL, a tarball or a path (yarn's `file:` and `link:` entries included), nor your project's own npm scope; an `npm:` alias is checked under the real package's name, never the alias. An npm organisation's private packages hosted on the public registry look public, so list their scope in `private_scopes`. pnpm and yarn berry lockfiles don't record a registry, so their packages are sent only when `health.yaml` says `registry: public`. An advisory ow-tools can't rate (a malware entry, a missing severity, a failed lookup), or an answer from OSV it can't fully read, is reported as needing attention, never OK. It sends no cookie or credential, follows no redirect, refuses private and loopback addresses, and never reads `.npmrc`, `.pypirc`, `.netrc` or your keychain. `--no-network` sends nothing at all.
  - **`capture`** looks up each host name the plan lists once, before the browser starts (a name that points at your own machine or a cloud metadata address is refused), then drives your browser to those origins only: every other request the page makes is blocked, and the browser resolves no other host name and reaches each listed one at the address ow-tools checked. (A service worker or a WebSocket on an allowed host isn't seen by the request guard; the host map still keeps it to the plan's hosts.) It types the plan's test data into the test environment. It never types into, reads or stores a password, one-time-code or similar field, never reads a cookie and never runs the plan's own JavaScript (a plan can't carry any). The capture profile holds the test session you signed in to, like any browser profile, in `~/.local/share/ow-tools/capture/<workstream>/`. Its cookies are encrypted with a key in your keychain: **the first time, macOS asks to let Chrome (or Chromium) use its "Chrome Safe Storage" item; choose Always Allow**, so later headless runs don't stop to ask. After any run against an environment marked `production`, ow-tools wipes the profile's cookies and site storage, so a production session is never kept: on Ctrl-C or a kill signal too, and if the run is killed outright, the next run on that profile wipes first.
  - **Timeouts.** A capture run stops after 110 seconds unless you pass `--timeout` (up to 590), so it ends inside Claude Code's two-minute Bash limit. For a sign-in that takes longer, Claude runs it in the background with a longer `--timeout`. `ow-tools capture --delete-profile <workstream>` removes a profile.
- **`scan-secrets` shows where a secret is, never the matched text.** gitleaks writes only the path, commit, line and rule id of each hit, through ow-tools' own report template; every row is checked against a strict pattern, and a row that doesn't fit stops the scan with the report deleted unread. gitleaks' own output is discarded. **A path is shown as it is**, so a secret used as a file or folder name appears in the output. The scan reads the committed history through a private copy in a folder only you can read, which borrows the repository's objects (none is copied) and is removed when the scan ends, including on Ctrl-C; while git runs, its temporary merge objects there can hold committed text, compressed. No file in the repository is created or changed, though git may refresh the timestamps of its pack and object files.
- **What the repository can and can't do to the scan.** Its own `.gitleaks.toml`, `.gitleaksignore`, inline `gitleaks:allow` comments, git config, hooks and attributes are never used, nothing in it runs, and no `GITLEAKS_*` variable reaches gitleaks. git runs with every network transport refused. A shallow or partial clone is refused, because part of its history isn't there to scan. But gitleaks' **built-in** allowlist still applies: it skips some paths, such as dependency folders (`node_modules/`, a virtualenv's `lib/`), lock files, binary and office formats, and any path containing `gitleaks.toml`, so a key under such a path is not reported.
- **What is not read.** Binary-looking files (a NUL byte, or UTF-16 text such as a Windows PowerShell `>` redirect), commit and tag messages, the changes an octopus merge (three or more parents) makes itself, older stash entries, refs that point straight at a file, `ORIG_HEAD`, `FETCH_HEAD`, reflogs, and submodule histories (a superproject's result lists them; scan each on its own). A `CLEAN` means none of what was read matched gitleaks' rules.
- Recordings must be in a folder named `audio/`, and screenshots go in a folder named `shots/`. If a recording, transcript or screenshot would be committable in a git repository, ow-tools refuses and prints the `.gitignore` lines to add. It never edits `.gitignore` itself. Transcripts, screenshots and exports are written readable by you only (0600).
- The Hugging Face token is read only by the one-time fetch command you run. Store it in your keychain (macOS) or in `~/.config/ow-tools/hf-token` at mode `0600` (Linux; at any other mode `ow-tools doctor` reports it as not stored and the fetch command doesn't read it), never in a repository. Once the model is fetched you can delete the token.
- Normalised audio and intermediate files go to a private temp folder that is removed when the run ends, including on failure.
- Exports leave out anything between `<!-- ow:internal -->` and `<!-- ow:end-internal -->`, such as a quote's internal pricing appendix. The markers are matched regardless of case and spacing; any other HTML comment that mentions "internal" (a misspelt or mid-line marker) stops the export, so a section is never let through by a typo.
- Exports embed only images from the document's folder, or from the `opchain-work/` folder it sits in, after following symlinks, and only real PNG, JPEG or GIF files. A path that leads anywhere else stops the export.
- When the export preflight refuses a document, it names line numbers only; it never repeats the document's text. Refusals from the newer verbs name a cell, key or step id the same way, never the value.

## Commands

| Command | |
|---|---|
| `/ow-start-transcribe <workstream>/audio/` | Transcribe and confirm speakers (`--setup` shows what's needed) |
| `/ow-tools` | Status and setup |
| `ow-tools …` | The command line the ow- skills call. Run `ow-tools help` for the list and `ow-tools help network` for what each verb sends. Exit codes: 0 done · 2 usage · 3 missing requirement · 4 refused by a rule (with a stable `reason`) · 5 a tool failed |

## Changes

- **1.3.1:** model provenance (the design's SA-004): the speaker model is fetched and loaded at one pinned revision of `pyannote/speaker-diarization-community-1` (a commit of the model repository, named in `lib/core.mjs`; `doctor` prints the fetch with it, and a cache of any other revision counts as not fetched), and the Whisper model's SHA-256 is checked before every transcription, not only by `doctor` (the last full check is remembered in a `.verified` file beside the model, keyed on its size, time and inode, so an unchanged file is not re-hashed each run). The marketplace entry's `ref` moves from `main` to the release tag at each release cut (the design's SA-001); the manifest's SHA-256 is published at `https://opchain.dev/work/ow-tools-security-manifest.sha256`, apart from the mirror. Nothing else changes.
- **1.3.0:** `scan-secrets`, the redacted secrets scan ow-handoff runs when it takes stock of a client's repository (the design's §5.5 and §16). `doctor` checks gitleaks and git (the copies on PATH's absolute folders, run by their full path), and `version --json` lists `scan-secrets` under `capabilities`. Nothing else changes.
- **1.2.0:** `calc date --calendar us-federal`, the contract calendar ow-uat counts clause dates on (`version --json` lists it under `capabilities.calc.calendars`; the design's §15). A call without `--calendar` behaves as in 1.1.2.
- **1.1.2:** the session-start list shows each open item of ow-start's logs on its own line (a meeting, an action or a decision review, by the newest line per item), so closing one action no longer hides the other open actions and reviews of that workstream.
- **1.1.1:** capture's secret-field check reads more names (abbreviations such as `psw`, card, PIN, recovery and one-time-code names, "Enter the 6-digit code", other languages, leet spellings) and no longer refuses ordinary fields such as `lead_routing`, `passType`, `pinLocation` or `tokenCount`. SIGQUIT and an internal error wipe a production session like Ctrl-C does. Two runs can't share a profile (`profile-in-use`). Origins must be host names or IP addresses, and cloud metadata addresses are refused in one list. health asks OSV about each package on its own when a batch answer doesn't line up. A `$…$` in a document is text, so it no longer stops a PDF.
- **1.1.0:** capture, health, PowerPoint and Excel export, digest and calc hours.

## Licences

ow-tools is Apache-2.0. It runs, but does not include, ffmpeg, whisper.cpp (MIT), pyannote.audio (MIT), pandoc (GPL, run as a separate program), Typst (Apache-2.0), your installed Chrome or Chromium, pip-audit (Apache-2.0) when you have it, and gitleaks (MIT) and git (GPL-2.0, run as a separate program) for `scan-secrets`. The pyannote `speaker-diarization-community-1` model is CC-BY-4.0, by pyannote. The Whisper model weights are MIT, by OpenAI. Every file and what it runs is listed in [SECURITY-MANIFEST.md](SECURITY-MANIFEST.md).
