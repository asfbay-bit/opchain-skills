# Authoring a oc-stack-forge pack

A **pack** is a unit of oc-stack-forge coverage: a language, framework, deploy
target, or mobile platform that oc-stack-forge can recommend or scaffold. Each
pack is a directory under `skills/oc-stack-forge/packs/<id>/` containing a
`pack.yml` and (optionally) reference docs.

This file is the spec; `_schema.json` is the machine-readable contract.
`scripts/gen-stack-packs.mjs` validates every pack on every build.

## Layout

```
skills/oc-stack-forge/packs/
├── _schema.json                 ← machine-readable contract
├── CONTRIBUTING.md              ← this file
└── <pack-id>/
    ├── pack.yml                 ← required
    ├── language.md              ← optional reference (pointed to by langRef)
    ├── framework.md             ← optional reference (pointed to by frameworkRef)
    └── deploy.md                ← optional reference (pointed to by deployRef)
```

The directory name **must** match the `id` field in `pack.yml`.

## `pack.yml` skeleton

Add `# yaml-language-server: $schema=../_schema.json` at the top of each
`pack.yml` so editors with the YAML LSP give you autocomplete + inline
validation. The build's hand-rolled validator (`gen-stack-packs.mjs`) runs
the same rules regardless.

### Language pack

```yaml
# yaml-language-server: $schema=../_schema.json
id: python
displayName: Python
kind: language
status: stable
since: 1.4.0
testRunner: pytest
buildCmd: python -m build
lintCmd: ruff check .
frameworks: [django, fastapi]
langRef: language.md
```

### Framework pack

```yaml
# yaml-language-server: $schema=../_schema.json
id: django
displayName: Django
kind: framework
status: stable
since: 1.4.0
language: python
defaultPlatform: fly-io
supportedPlatforms: [fly-io, render, aws-elastic-beanstalk]
frameworkRef: framework.md
```

### Deploy-target pack

```yaml
# yaml-language-server: $schema=../_schema.json
id: cloudflare-workers
displayName: Cloudflare Workers
kind: deploy-target
status: stable
since: 1.4.0
deployRef: deploy.md
```

### Mobile pack

```yaml
# yaml-language-server: $schema=../_schema.json
id: ios-swiftui
displayName: iOS (SwiftUI)
kind: mobile
mobilePlatform: ios
status: stable
since: 1.4.0
defaultPlatform: app-store
supportedPlatforms: [app-store]
mobileRef: mobile.md
```

## Field reference

See `_schema.json` for the canonical types and conditional requirements.
A few notes the schema can't capture cleanly:

- **`id`** is the *only* identifier — it shows up in the directory name, in
  the generated coverage flag (`skills.coverage.<id>.enabled`), and as the
  target of cross-pack `language` / `frameworks` / `defaultPlatform` /
  `supportedPlatforms` references. Pick something stable; renames mean a
  flag rename + a migration.
- **`status`** drives the coverage-flag default. `stable` → `default: true`
  (pack visible by default); `beta` / `experimental` / `deprecated` →
  `default: false`. Operators can override per-environment via PostHog or
  the `FLAG_SKILLS_COVERAGE_<ID>_ENABLED` env var.
- **`since`** is the opchain release the pack landed in (semver). Pin it
  when the pack first ships; do not bump on subsequent edits.
- **Adapter graph.** `language`, `frameworks`, `defaultPlatform`, and
  `supportedPlatforms` are pack-id references resolved at build time. The
  build fails if any reference points to a missing pack or creates a cycle.
  Bidirectional consistency is enforced: a framework's `language` must
  list this framework in *its* `frameworks` array (and vice versa).
- **Coverage flag generation.** Packs of kind `language`, `framework`, or
  `mobile` get a `skills.coverage.<id>.enabled` flag. Packs of kind
  `deploy-target` do not — they're sub-selections under another offer,
  not top-level coverage units.

## Reference-doc budget

Each `*Ref` doc has a **soft cap of 50KB** and a **hard cap of 100KB**.

- Under 50KB: clean PASS.
- 50KB – 100KB: build emits a warning. Trim or split the doc.
- Over 100KB: build fails. Ref docs ride along inside the per-skill zip
  shown on `/skills/oc-stack-forge`; bloat is visible to anyone downloading
  the bundle.

Ref docs are Markdown only (`.md`). Keep them focused on what oc-stack-forge
needs to *recommend* the pack — opinionated defaults, gotchas, scaffold
templates. Don't duplicate language tutorials.

## Status lifecycle

```
experimental ──► beta ──► stable ──► deprecated
                                            │
                                            └─► (eventually removed in a future release)
```

- **experimental** — early signal, breaking changes expected, hidden by default.
- **beta** — API stable but limited coverage, hidden by default. Opt-in via flag.
- **stable** — full coverage, visible by default. Most packs ship here.
- **deprecated** — superseded by another pack. Requires a `deprecated` block
  pointing to a replacement. Hidden by default; oc-stack-forge shows a
  migration note when consulted.

Bumping from beta → stable is a normal PR. Bumping to deprecated requires
naming a replacement pack and adding migration notes (see schema).

## Build pipeline

`gen-stack-packs.mjs` is the first script in `prebuild`, so coverage flags
are registered before `gen-flags` runs, before `gen-skills-catalog`
validates skill frontmatter, and before any test or build consumes the
flag registry. Order:

```
gen-stack-packs   → emits src/generated/coverage-flags.json
gen-flags         → reads src/lib/flags/registry.js (now incl. coverage flags)
gen-catalog       → validates SKILL.md against the full flag set
…
```

## Adding a new pack — checklist

1. Create `skills/oc-stack-forge/packs/<id>/pack.yml` matching one of the
   skeletons above. Match `id` to the directory name.
2. Add ref docs as needed; keep each under 50KB.
3. Run `npm run prebuild` and confirm `gen-stack-packs.mjs` reports your
   pack as PASS.
4. Run `npm test` — pack-registry tests will fail if the adapter graph or
   bidirectional reference invariants are off.
5. If your pack is a language/framework/mobile pack, the build will register
   a new `skills.coverage.<id>.enabled` flag. Confirm it appears in
   `site/src/lib/flags/registry.ts` after `gen-flags`.
6. Commit `pack.yml` + ref docs only — `src/generated/coverage-flags.json`
   is committed as a baseline but gets overwritten on every build; let CI
   handle the regen and review the diff for sanity.
