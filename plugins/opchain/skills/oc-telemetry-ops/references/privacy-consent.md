# Privacy & Consent

opchain's brand is open-source, Apache-2.0, **local-first, no backend**. Telemetry that
betrayed that would cost more credibility than the `/dashboard` could ever buy.
So the design is conservative by construction: off by default, local-only,
aggregate-only on export, and content-free at the schema level.

## The consent model

| State | Behavior |
|---|---|
| **Default (never enabled)** | No store, no writes, nothing recorded. The `telemetry_handle` field is absent. |
| **Enabled** (`/oc-telemetry enable`) | A `telemetry_meta.consent_enabled=true` value in the gitignored local SQLite store authorizes metering. |
| **Disabled** (`/oc-telemetry disable`) | The same local value is `false`; metering stops immediately and the local store is kept (deletion is the user's call). |

**Tracked state is not consent.** A cloned checkpoint can contain legacy
`telemetry_handle` data, but it never authorizes a write. Only the local
`usage.sqlite` metadata row authorizes a write; a missing store is off. Existing
checkpoint fields are retained as historical/informational data and are not
migrated or deleted by the CLI. The write path checks local consent on every run.

## What is recorded vs. never recorded

| Recorded (counts + categories) | Never recorded |
|---|---|
| which skill ran (`oc-app-architect`) | prompt / message / system-prompt text |
| which phase / command verb (`/oc-build`) | tool inputs or outputs |
| model **tier** (`opus`, not the full id) | file names, file paths, repo or project names |
| token **counts** and attributed `cost_usd` | user name, email, machine name, IP |
| outcome (pass/fail) + eval **score** | anything that could re-identify a person or a project |
| timestamps + duration | the contents of any checkpoint or source file |

The rule: **categories and counts, never content or identity.** If a value could
identify who or what, it isn't stored — enforced by the schema (a missing column
can't hold data) rather than by a redaction step that could be forgotten.

## The anonymous handle

`telemetry_handle.id` is a **random, machine-local** id minted at `enable` time. It
is not derived from any user identity (no hash of email/username/hostname) — it
exists only to group a machine's own runs locally. It is never exported (the
aggregate is identity-free; see `aggregation.md`). Rotating it (`enable` after a
`disable`) simply starts a new local grouping.

## Relationship to site analytics (don't conflate)

| | oc-telemetry-ops | Site PostHog (`ConsentBanner.astro`) |
|---|---|---|
| Measures | the **skills pipeline's** own usage (which skills run, what they cost) | **website visitor** behavior (page views, clicks) |
| Where | local `.checkpoints/usage.sqlite` | browser → PostHog (consent-gated) |
| Default | OFF | OFF until consent banner accepted |
| Leaves the machine? | only the anonymized aggregate, on explicit `export` | yes (to PostHog), post-consent |

They are separate surfaces with separate consent. Enabling one does not enable the
other.

## Regulated environments

The store contains no content and no PII by design, so it is safe to keep locally
even in regulated environments. But because it is **gitignored**, it never enters
the repo, never ships in a PR, and never reaches the public mirror — so there is no
path by which usage data leaves the developer's machine unless they explicitly run
`/oc-telemetry export` and publish the (already anonymized) aggregate.

## Principles

1. **Off by default; presence ≠ consent.** Only `enabled: true` authorizes a write.
2. **Local-first.** Raw data is a local file, gitignored, never auto-uploaded.
3. **Content-free by schema.** No column holds prompt text, paths, or identity.
4. **Aggregate-only export.** Only counts/sums leave the machine, only on request.
5. **Reversible.** `disable` stops metering at once; deleting the store is always
   the user's choice.
