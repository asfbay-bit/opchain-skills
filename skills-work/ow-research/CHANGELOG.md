# ow-research changelog

Per-skill versions (`catalogs.json` `versionPolicy: per-skill`). The family's v2.1.0 release entry cites each skill's version. Every change to `SKILL.md` or a reference bumps this skill; data, example and test edits ride without a bump and are listed here as data edits.

## 1.0.2 (2026-10-22): ow-vendor-eval moves to v2.2

Owner decision of 2026-10-22: ow-vendor-eval leaves v2.1.0 for v2.2, handled the way ow-currency was on 2026-10-19.

- **The vendor-evaluation hand-off is gone for now.** An answered topic that serves a vendor evaluation prints the same `NEXT: none` block as the user's own decision: no NEXT line promises `/ow-vendor-eval-evidence`, and `skill.edges.yaml` has no `ow-vendor-eval` hand-off row or `say:` line. The STATUS line for it reads `next: none (closed: answered, RS-nn) | awaiting: none`. `serves: vendor-eval` stays a valid `question.md` value.
- The inbound line in `references/routing-and-resume.md` no longer lists ow-vendor-eval as a source of `use ow-research`.
- **The hand-off returns with ow-vendor-eval in v2.2**, with its NEXT template and edges row, as ow-currency's will.
- Data edits in the same PR: the acceptance checker accepts `ow-research 1.0.2` in STATUS lines and `written_by` (the goldens keep 1.0.1), the tests and text pins carry the new version and the absent hand-off, and the `route-vendor-eval` fixture's comment says the skill is planned.

## 1.0.1 (2026-10-19): the follow-ups from the second evaluation and the security closure

From the second evaluation report (`sprints/release-2.1/ow-09/eval-round-2.md`, passed at 7.4 under the owner's evaluation cap) and the security closure (`docs/audits/2026-10-17-ow-research-1.0-security-review.md`), taken in one follow-up PR.

- **Step 0's lines come first on every screen** (`references/routing-and-resume.md`, and each phase's step 0): the echo of the newest STATUS line, each awaiting line, the stored-"no" notice and the already-shared notice, in prescribed forms. A refusal that prints a line "and nothing else" means nothing else after them.
- **A round figure has one definition** (`references/web-rules.md` §4): a whole number that is a multiple of 100, a percentage in fives, a multiplier in halves. So 95, 175, 180 or 250 equal to one of your figures is refused, not asked about.
- **The figure prompt sits on the plan screen** (`references/phase-run.md` §2): one line per query with such a figure, after the query lines; the user's own confirmation is recorded after the plan and before its approval, never written by the run itself.
- **Approvals:** a decline is written only in brackets after the approved ids; an id after "declined", "not" or "except" is not approved.
- **Handling levels:** a follow-on plan's `plans/<client>-<n>/plan.yaml` counts, the key is read in any case, and a file that does not parse counts as a level set (`references/phase-run.md` §1, `references/web-rules.md` §2).
- **Owners:** a tenant's own subdomain of a shared platform (`<vendor>.readthedocs.io`) may be proposed; the platform's root and its service hosts may not (`references/phase-question.md` §2).
- **The watch line** stands on its own after a blank line, unindented, as `Watched findings: ow-currency is not in this release. …`, so it never reads as the NEXT block's absent case; no other line names ow-currency.
- Data edits in the same PR: the acceptance checker carries each rule above, adjacent quotes from one source are one span for the 25-word rule, ids are not figures in `findings.md`, numbers in words with no currency word are figures, a cap raised past its batch counts only the requests that batch showed, and the goldens' watch lines moved. New goldens for the figure prompt and its confirmation; every round-2 evaluator plant and the closure's probes kept as tests. The existing goldens keep the 1.0.0 they were written with; the new ones are 1.0.1.

## 1.0.0 (2026-10-17): research from sources it opened

Design: `docs/plans/2026-10-16-ow-research-design.md` (decisions 1 to 4; build notes §12).

- **Four verbs.** `/ow-research` (topics and framework folders with their state and age; `on <path>` runs the step a folder needs), `/ow-research-question <workstream>` (the question, its kind, scope, depth, the generic description queries use, the keep-out terms and the owners of the facts, confirmed by the user), `/ow-research-run` (queries approved before the first search, every request logged before it is sent, sources with their `retrieved` dates and short quotes, findings with levels, conflicts, gaps and suspicious content under an Answer) and `/ow-research-framework <id>` (an open framework text the user downloaded from its official sources, recorded with its stated revision and digests, labelled unpinned — fetched, not a pack).
- **What leaves the machine:** only queries and page requests, through the host's own tools with their permission prompts left on; nothing under a handling level, without web tools, before approval, or while a Query privacy finding is open. The URL rule, the provenance rule, the caps and the host-enforced residual are in `references/web-rules.md`.
- **References:** `routing-and-resume.md`, `phase-question.md`, `phase-run.md`, `phase-framework.md`, `research-files-schema.md`, `web-rules.md`, `confidence-rules.md`, `framework-sources.md` (the open list; its licence classes reviewed by the owner on 2026-10-19), `self-checks.md` (ten checks, four never waived).
- **Hand-offs:** ow-build-plan's `-collect` takes the findings of a topic that serves a Build Plan; the NEXT blocks to ow-draft and ow-vendor-eval name their planned verbs, with the fields their designs read. ow-currency and ow-controls are not in this release: no line names ow-currency's verb (a watched finding prints only the line saying it is not in this release), and `-framework`'s licensed-text refusal points to a controls register you keep.

### Before release: the security review's changes (2026-10-19)

The security review (`docs/audits/2026-10-17-ow-research-1.0-security-review.md`) and the owner's decisions of 2026-10-19 changed 1.0.0's text before it shipped:

- **Handling level:** any of `question.md`, the workstream's newest `question.md` or `profile.md`'s default is enough, even where another says "no"; `-run` checks it before any resume or reopen (`references/phase-run.md` §1, `references/web-rules.md` §2).
- **Owners:** exact hosts, a host with a path, or `*.<host>` by choice; never a shared platform's root, a support site without a path, or a host where users write. A primary source also needs a primary's standing (`references/confidence-rules.md` §1, `references/phase-question.md` §2).
- **Corroboration is capped:** pages of unclear standing raise a fact to MEDIUM at most, however many agree; HIGH from secondaries needs two independent publishers of known standing (`references/confidence-rules.md` §2).
- **The host's page tool:** a prescribed prompt, page quotes labelled "as returned by the host's page tool", the inbox route for a decision that rests on one page, and a Limits section in `SKILL.md`.
- **Suspicious content** only quotes and describes, in one line form; findings come only from `## Findings`; a search result's title and a page's `<title>` are covered, and a source's title is the page's visible heading.
- **Our own numbers:** attributed or not, and any figure from the workstream's internal files, by value (`references/web-rules.md` §4, `references/self-checks.md` §3).
- **The URL rule:** a backslash, space or control character is refused; credentials in a fragment or path parameter; one list of private names; keep-out terms matched with invisible characters removed. Approvals belong to their run, nothing is sent before the go, and one by-name approval covers one request.
- **`-framework`:** digests before any file is read; each file must name its own text; where it came from is recorded as the user's word; a revision request only to a table URL exactly as listed; the licence class of every row reviewed by the owner (2026-10-19), and a row added later marked `unreviewed` until it is.
- **Claims:** the description, the welcome and the network section say what the host keeps, when a by-name search is allowed, and that the host's own setting can turn its prompts off.

### Before release: the first evaluation and the security re-check (2026-10-19)

- **Approvals:** an approval line carries `human-decided:` and approves only the query ids it names; a declined query is never sent; an approval past the cap counts only after the batch was shown (`references/web-rules.md` §3, `references/phase-run.md` §2).
- **Resume:** one rule, in both references: send the approved requests not yet logged, never re-send a logged one, reopen a page only to record its source; one name per step (`references/routing-and-resume.md` §4, `references/phase-run.md` §6).
- **Our figures, as the owner narrowed them:** refused when said as ours, or when one of our exact figures (prices in words and "900-dollar" too); a round figure that only matches one of ours is asked about in one line and the answer recorded as `marker: figure confirmed`; a market question passes. `findings.md` is held to the same (`references/web-rules.md` §4, `references/self-checks.md`).
- **Handling level:** the client's level that ow-start's `intake.yaml` and ow-build-plan's `plan.yaml` record is read too (the `handling` key only); `-question` asks once per client.
- **Keep-out:** the client's own customers and suppliers its files name.
- **Screens:** refusals and no-ops print only their prescribed lines; the watch block is one line, "ow-currency is not in this release", and ow-currency's hand-off waits for the release that ships it.
- **Standing:** "user file" is how a page arrived, never a standing; a saved forum page stays at MEDIUM at most.
- **findings.md:** its seven sections, in order, once each; each F-nn heads one block.
