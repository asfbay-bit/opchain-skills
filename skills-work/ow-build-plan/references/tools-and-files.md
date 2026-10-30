# The ow-tools add-on, and where files live

Moved here from SKILL.md in 1.3.0 (amendment P4) to keep the body under its cap; the words are the body's. Open this file with each phase file.

## The ow-tools add-on

**If you can run code here and `ow-tools version` answers, run the call; otherwise take the absent-case.** Never imitate the add-on.

| Need | Call | Without the add-on |
|---|---|---|
| PDF and Word files (`-offer`, `-export`) | `ow-tools export <file.md> --out plans/<client>/export/` | Say the PDF and Word files need the ow-tools add-on, which is not installed here; print the Markdown without its header or anything between the `ow:internal` markers |
| A workshop recording (`-collect`) | `ow-tools transcribe plans/<client>/audio/<file> --out plans/<client>/workshops/W<n>/` | Ask for a transcript or notes (MEDIUM cap) |
| Dates and totals (`-offer`, `-start`, `-quote`) | `ow-tools calc date …`, `calc total --items <file.json>`, `calc split …` | Count by hand and mark it: `not machine-checked`, for the user to verify |

Record each call's command and raw output where its phase file says; nothing is machine-checked without them.

## Where files live

    opchain-work/
      price-book.yaml  brand.yaml        yours: prices and branding (copy them from examples/)
      offers.md  handoffs.yaml  profile.md  STATUS.md
      plans/<client>/
        build-plan-offer.md  plan.yaml  collection.md  evidence.md  systems/  map/
        scope.md  acceptance.md  risks.md  quick-scope.md  quote.md
        contract-inputs.md  build-request.md  build-plan.md  export/
        inbox/  audio/  workshops/        client material; never committed

In a git repository, `-start` asks once to add the client material folders to `.gitignore` (`references/phase-start.md`). A follow-on Build Plan goes in `plans/<client>-<n>/`. This skill never writes your files: copy `examples/price-book.yaml` and `examples/brand.yaml` and fill them in; `offers.md` and `handoffs.yaml` come from ow-start's `/ow-setup`, as `examples/offers.md` and `examples/handoffs.yaml`.
