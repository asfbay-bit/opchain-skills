# Changelog recipe — how `/oc-release draft` composes the entry

The `/changelog` page is the source-of-truth narrative for what shipped. Each
release entry follows the same structure so readers can scan multiple
releases without re-learning the layout.

This recipe is the canonical instruction `/oc-release draft` follows. Update
this file when the layout evolves; the next release auto-conforms.

---

## Section structure

Each minor release is one `<article class="hero-card …" id="vN-N" data-card>`
in `site/src/pages/changelog.astro`: `hero-card--next` while it is being built
(Coming Next tab), `hero-card--released is-open` once it is the newest shipped
release, and a collapsed `hero-card--released` after that until it ages out to a
compact `<article class="rel-card">` (the five-hero window in
`site-release-surfaces.md` L4). Patches get a `rel-card` of their own and extend
the open hero's version/date range, in the site PR that follows the patch tag. Inside a hero, in order:

1. `<button class="hero-head">` — `hero-badge` ("latest release" / "previous
   release"), `hero-ver` (`vN.N.N · shipped <Mon DD, YYYY>`), `hero-title`, and
   `hero-desc` — the lede. One paragraph, ≤ 4 sentences. Answers: "what is this
   release ABOUT?"
2. `<div class="card-body">` → `<div class="card-body-inner hero-body-inner">`,
   opening with a `tag-row` of `tag` chips (shipped, skill-count delta, …).
3. `<h3>What's new</h3>` + a `tile-grid` of `tile`s (`tile-name` + `tile-desc`)
   — one per headline change, leading with the user-visible change.
4. `<h3>{New scenarios | New skills | New platform}</h3>` or a `callout` —
   release-specific sections. Use the heading that fits; multiple are fine.
5. Configuration — required when any new `.opchain/*.yaml` keys or env vars or
   flags ship. Skip if the release adds no config surface.
6. `<div class="compat-box">` — compatibility, **always present**. Either
   "back-compatible with vX.Y; no migration required" or the migration steps.
7. Security posture — present when the release touches auth / regulated flows /
   external surfaces. Optional otherwise.

A `rel-card` is the compact form: a `rc-row` button (`ver-pill`, `rc-title`,
`rc-date`, `rc-summary`) over a `card-body-inner`.

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

## The previous release as the template

The most recent shipped hero in `site/src/pages/changelog.astro` (at v1.9, the
`#v1-9` card) is the canonical template. When `/oc-release draft` runs, it reads
that entry and mirrors:

- The DOM structure (hero card, tag row, tiles, compat box, classes).
- The voice (declarative, present tense, second person where natural).
- The length (4-8 "What's new" tiles, 2-3 scenarios, ≤ 5-paragraph total).

Bigger releases (e.g. v2.0) may need additional sections ("Migration" with a
step list, "Deprecations"), but the existing structure covers v1.x cleanly.

---

## Entry skeleton

`/oc-release draft` produces a card of this shape (placeholders in `<…>`):

```html
<article class="hero-card hero-card--next is-open" id="<vN-N>" data-card>
  <button class="hero-head" type="button" aria-expanded="true"
          aria-controls="<vN-N>-body" data-disclosure-toggle>
    <span class="hero-chevron" aria-hidden="true">▶</span>
    <span class="hero-badge"><committed | in progress></span>
    <span class="hero-ver"><vN.N.0> · next · <status></span>
    <span class="hero-title"><theme></span>
    <span class="hero-desc"><lede: what this release is about, ≤ 4 sentences></span>
  </button>
  <div class="card-body" id="<vN-N>-body" data-disclosure-body>
    <div class="card-body-inner hero-body-inner">
      <div class="tag-row"><span class="tag"><skill-count delta></span></div>
      <h3>What&rsquo;s new</h3>
      <div class="tile-grid">
        <div class="tile">
          <span class="tile-name"><user-visible change></span>
          <span class="tile-desc"><one-sentence explanation></span>
        </div>
      </div>
      <div class="compat-box">
        <strong>Back-compatible with <vN.N-1>.</strong> <migration notes, or none>
      </div>
    </div>
  </div>
</article>
```

For a minor release, the release PR (before the tag) turns the card into `hero-card hero-card--released is-open`,
its badge "latest release" and its `hero-ver` `vN.N.0 · shipped <Mon DD, YYYY>`.
Copy badge text from the live cards rather than from this skeleton if the two
differ.

The exact prose is generated from the sprint checkpoints + merged PR
titles + the release plan headline ranking from `/oc-release plan`.
