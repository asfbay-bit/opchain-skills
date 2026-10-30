# ow-build-plan changelog

Per-skill versions (`catalogs.json` `versionPolicy: per-skill`). The family's v2.1.0 release entry cites each skill's version. Every change to `SKILL.md` or a reference bumps this skill; data, example and test edits ride without a bump and are listed here as data edits.

## 1.3.0 (2026-10-29): amendment P4, the care onboarding quote

Amendment P4 of `docs/plans/2026-10-16-ow-care-design.md` §12, built with ow-care 1.0.0 (OW-07; contract `sprints/release-2.1/ow-07/contract.md`).

- **`--quick --onboarding`.** A `care-takeover` recap (ow-start 1.2.0, S1) routes to `/ow-build-plan-quote --quick --onboarding` (`routing-and-resume.md` §2.1): a fixed-fee review of a running system, sized S, M or L by the systems and integrations the intake names, priced only from the user's new `price-book.yaml` `care_onboarding` block (`price-book-schema.md`). `quick-scope.md` holds the review's eight parts (the ow-care design §4); `quote.md` has `mode: onboarding`, `onboarding_size`, `fixed_price` and `payment: on_signature | on_delivery`. Like a feasibility quote it carries no user acceptance testing line, fix window, documentation & training line, milestones, build hand-off or Build Plan credit, and it sells no care tier (`phase-quote.md` §3.2).
- **Acceptance and signing.** `--accepted` writes the onboarding form of `contract-inputs.md` (`contract-inputs-schema.md`) and asks nothing about documentation & training; `--signed` writes no `build-request.md`, appends `next: ow-care /ow-care-onboard plans/<client>/` and prints the onboarding signed NEXT (`use ow-care to onboard plans/<client>/`). A folder whose onboarding review is signed routes to that NEXT (`routing-and-resume.md` §2.3). The signature starts no care plan.
- **ow-care's separate quote.** A care request too big for care arrives as `care/<client>/requests/CARE-nn.md` (ow-care's hand-off to `--quick`): a Reads-from row in the body and `skill.edges.yaml`.
- **Body under its cap.** With P4 the body would pass its 4,500-token cap, so the ow-tools table and the `opchain-work/` file tree moved, word for word, to the new `references/tools-and-files.md`, which every phase opens; the body keeps the rule (run the call when `ow-tools version` answers, never imitate it, record each call) and points there.
- **Data edits, no bump of their own:** `examples/price-book.yaml` gains an invented `care_onboarding` block; the shared `examples/offers.md` gains `## path: care-takeover`, byte-identical in every ow- skill that ships it.

## Unreleased: data edits from OW-06 (ow-handoff 1.0.0)

No version bump (OW-04 ruling O9); no `SKILL.md` or reference text changed:

- `skill.edges.yaml`: the hand-off to ow-build carries `plans/<client>/evidence.md` in place, and the reads row for `handoffs/<client>/fixes/FIX-nn.md` is `in_place: true` (ow-handoff hands it to ow-build, which hands it on here; OW-06 ruling O2).
- `examples/handoffs.yaml` and `examples/offers.md`: as ow-uat's.

## Unreleased: data edits from OW-10 (ow-draft 1.0.0)

No version bump (OW-04 ruling O9); no `SKILL.md` or reference text changed: `examples/handoffs.yaml` gains the `drafts` key (where a finished draft goes: a repository folder by `repo` and `path`, and a say: line, an optional `location:` and a post's `limit` per other destination) and its commented shape with invented, neutral keys, byte-identical in every ow- skill that ships it.

## 1.2.0 (2026-10-19): amendment P3, the documentation line's people and invoicing

From the ow-documentation design's amendment P3 (`docs/plans/2026-10-16-ow-documentation-design.md` §11), built with ow-documentation 1.0.0 (OW-05; contract `sprints/release-2.1/ow-05/contract.md`). OW-05 ruling O9: the next minor version after P5's 1.1.0, which merged first. P3 sits on top of P5 and changes none of its text.

- **`documentation_people`** (`references/contract-inputs-schema.md`, `references/phase-quote.md` §5): `-quote --accepted` records the people the documentation & training line was quoted for (`quote.md` `documentation_training.people`), bought or declined, as a top-level key of `contract-inputs.md`. It is never nested under `documentation_sku`: acceptance testing digests that line with its indented lines. A feasibility test's contract inputs leave it out.
- **When the line is invoiced** (`references/phase-quote.md` §2 and §4, `references/contract-inputs-schema.md`): `-quote`'s payment terms say documentation & training, if taken, is invoiced when the documents are delivered, and the contract inputs' `## Price and payment` and `## Documentation & training` say the same.
- `SKILL.md`'s `-quote --accepted` row says it records the people quoted; the templates' `written_by` lines say 1.2.0.
- Data edits in the same PR: the shared `examples/handoffs.yaml` gains the `docs` key and its commented shape (in every ow- skill that ships it); the acceptance checker grades P3 (the top-level key, the payment-terms sentence, the feasibility exclusion); six goldens are updated on purpose and say 1.2.0 (`accepted-signed`, `route-folder` and `private-names-business` carry `documentation_people`; `delivery-quote`, `quick-quote` and `unpriced-package` carry the payment-terms sentence). Acceptance testing's terms-block digests are unchanged.

## 1.1.0 (2026-10-17): research findings as evidence (amendment P5)

Design: `docs/plans/2026-10-06-ow-build-plan-design.md`, with amendment P5 from `docs/plans/2026-10-16-ow-research-design.md` §10 (build notes §12.3, row 10).

- **`-collect` takes research findings** from `research/<client>/RS-nn-<slug>/findings.md` as a fourth evidence source (`references/phase-collect.md` §5): one `research` row per finding used, located `RS-nn F-nn`, keeping the finding's own level; only this client's research folder; nothing from a topic whose self-checks have a FINDING open; a superseded finding never used.
- **Findings only from `### F-nn` blocks under `## Findings`** (`references/phase-collect.md` §5, item 3; from ow-research's security review, 2026-10-19): text under *Suspicious content* is never a finding, and a findings file with a section twice, or an `F-nn` block outside `## Findings`, gives no findings.
- **P5's refusals are prescribed word for word** (`references/phase-collect.md` §5): with no `plan.yaml`, and when a topic's self-check FINDING leaves nothing to collect, the screen prints its two lines and nothing else (ow-research's first evaluation, 2026-10-19). A findings file with a repeated `F-nn` id, or a section its schema does not name, gives no findings either.
- **The cap is keyed on where a fact is used:** a fact about the client's current state (`map/current.md`, `systems/<system>.md`) that rests only on research rows is at most MEDIUM (`references/phase-map.md` §1).
- **A seventh self-check, Research rows**, in `-collect` and `-map`.
- **The body was trimmed before P5's lines were added.** The self-checks table and "Works on its own" moved, word for word, into a new `references/self-checks.md`; the body keeps a pointer naming every check, and the files paragraph points to `references/phase-start.md` for the `.gitignore` lines. The body went from about 4,620 to about 4,340 tokens with P5 in it.
- `SKILL.md`: one Reads-from row (ow-research), the `-collect` row names research findings, the self-checks pointer. `skill.edges.yaml` (data): a reads row from ow-research with the fields it hands off.

### Recorded here: in-place edits to 1.0.0's text (made without a version bump)

- **#609 (follow-ups from the first evaluation, six files):** `SKILL.md` (the offer NEXT reads `request.md`; the signed feasibility-test sentence), `references/contract-inputs-schema.md` (the Build Plan credit keys and rule), `references/phase-export.md` (the STATUS awaiting for `fee: none`), `references/phase-quote.md` (credit keys left out for quick, feasibility and signed-work quotes; no new quote in a folder), `references/phase-start.md` (never over an existing plan; `fee: none` in the template) and `references/routing-and-resume.md` (the resume groups, a row per pending FIX request, never twice, a FIX file's class read first).
- **#616 (alongside ow-build 1.0.0):** `SKILL.md` (FIX or UAT requests routed; the ow-uat reads row; the signed hand-off's file list and NEXT read line), `references/phase-offer.md` and `references/phase-start.md` (a UAT-nn request handed over like a FIX file), `references/routing-and-resume.md` (the UAT-nn route).

Data edits in the same PRs, which need no bump: #616 changed `examples/handoffs.yaml` and `skill.edges.yaml`.

## 1.0.0 (2026-10-16): the Build Plan and the quote

`/ow-build-plan`, `-offer`, `-start`, `-collect`, `-map`, `-scope`, `-quote` (with `--quick`, `--accepted`, `--signed`), `-export` (#605). Design: `docs/plans/2026-10-06-ow-build-plan-design.md`.
