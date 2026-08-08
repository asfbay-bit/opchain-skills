# Changelog recipe — how `/oc-release draft` composes the entry

The `/changelog` page is the source-of-truth narrative for what shipped. Each
release entry follows the same structure so readers can scan multiple
releases without re-learning the layout.

This recipe is the canonical instruction `/oc-release draft` follows. Update
this file when the layout evolves; the next release auto-conforms.

---

## Section structure

Each release entry is one `<section class="release">` (or
`release--current` for the most recent). Inside, in order:

1. `<header class="rel-head">` — tag + title + date.
2. `<p class="rel-summary">` — the lede. One paragraph, ≤ 4 sentences.
   Answers: "what is this release ABOUT?"
3. `<h3>What's new</h3>` + `<ul>` — bulleted feature list. Each bullet
   starts with the user-visible change in **bold**, then the explanation.
4. `<h3>{New scenarios | New skill | New platform}</h3>` — release-specific
   sections. Use the heading that fits; multiple are fine.
5. `<h3>Configuration</h3>` — required when any new `.opchain/*.yaml` keys
   or env vars or flags ship. Skip if the release adds no config surface.
6. `<h3>Compatibility</h3>` — **always present**. Either "back-compatible
   with vX.Y; no migration required" or a numbered migration list.
7. `<h3>Security posture</h3>` — present when the release touches auth /
   regulated flows / external surfaces. Optional otherwise.

---

## Writing rules

### Lede

- Lead with what the release IS, not what it CHANGES. v1.2's lede:
  "opchain v1.2 wires the skills into the PM-tool MCPs Anthropic ships
  with Claude Code." That's a positioning statement, not a change list.
- Identify the protagonist of the release. v1.0 → "Claude installs the
  catalog." v1.1 → "the tri-agent harness." v1.2 → "the PM ticket
  becomes the thread of execution." v1.3 → "the runtime pm loop, real
  platforms, and the cadence skill that ships them."
- One sentence summarising the SCOPE; one sentence summarising the
  AUDIENCE.

### "What's new" bullets

- **Lead with the user-visible change**, in bold inline-code or bold prose.
- Then a one-sentence explanation of what changed and why.
- Avoid implementation jargon ("replaced placeholder mcp.<provider> with
  concrete tool names" → "**oc-git-ops now actually calls the Linear MCP
  tools** when you `/oc-git-sync TICKET-1234`, with retry / backoff and a
  deferred-action queue if Linear is unreachable.")
- ≤ 280 characters per bullet (the changelog page reading rhythm).

### Scenarios

- One paragraph per scenario.
- Lead sentence: who the protagonist is and what they shipped.
- Body: one sentence on the regulatory / technical / pipeline angle that
  makes it interesting.
- Closing: a deep link `<a href="/demo#<id>">` to the scenario.

### Configuration

- Show the new config in a fenced code block (yaml or sh).
- Default value, then how to override.
- Compatibility note if the new key has a fallback when missing.

### Compatibility

- "Back-compatible with v{X-1}.{Y}" is the most common shape.
- If migration is required: numbered list of steps; deadline date if any;
  rollback path explicit.

### Security posture

- One paragraph; no headers below this h3.
- Lead sentence: who should NOT adopt this release by default and why.
- Body: what the safe-adoption path is (link to the scenarios that show
  the right architecture).
- This section's tone is more conservative than the others. Don't
  oversell.

---

## Example: v1.2 entry as a template

The v1.2 entry in `site/src/pages/changelog.astro` is the canonical template.
When `/oc-release draft` runs, it reads the previous-release entry and mirrors:

- The DOM structure (sections, headers, classes).
- The voice (declarative, present tense, second person where natural).
- The length (5-8 "What's new" bullets, 2-3 scenarios, ≤ 5-paragraph total).

Bigger releases (e.g. a hypothetical v2.0) may need additional sections
("Migration" with a step list, "Deprecations"), but the existing structure
covers v1.x cleanly.

---

## v1.3 entry skeleton

For the v1.3 release `/oc-release draft` produces:

```html
<section class="release release--current">
  <header class="rel-head">
    <span class="rel-tag">v1.3</span>
    <h2>Runtime PM, real platforms, automated releases</h2>
    <span class="rel-date">2026-05-11</span>
  </header>

  <p class="rel-summary">
    opchain v1.3 makes the v1.2 PM-MCP prose executable end-to-end,
    expands the platform menu beyond JS / Cloudflare, and ships
    <code>oc-release-ops</code> — the 18th skill — to automate the
    "scope → /changelog → bump → ship" cadence opchain uses for itself.
  </p>

  <h3>What's new</h3>
  <ul>
    <li><strong>The PM-MCP loop is real.</strong> ...</li>
    <li><strong>Platform menu grew.</strong> ...</li>
    <li><strong><code>oc-release-ops</code> is the 18th skill.</strong> ...</li>
    ...
  </ul>

  <h3>Three new scenarios</h3>
  <ul>
    <li>...runtime-pm-loop...</li>
    <li>...release-ops-dogfood...</li>
    <li>...django-render-shipped...</li>
  </ul>

  <h3>Configuration</h3>
  <p>v1.3 adds <code>tool_overrides</code> to <code>.opchain/pm.yaml</code>...</p>

  <h3>Compatibility</h3>
  <p>v1.3 is back-compatible with v1.2. ...</p>

  <h3>Security posture</h3>
  <p>...</p>
</section>
```

The exact prose is generated from the sprint checkpoints + merged PR
titles + the release plan headline ranking from `/oc-release plan`.
