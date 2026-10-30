# `/ow-uat-pack`: the tester packs and the results template

Run step 0 and the resume step (`references/routing-and-resume.md` §1); a basis mismatch blocks this verb. Formats: `references/scenario-format.md` §2 to §4. Self-checks: `references/self-checks.md`.

1. **Refuse** while a production test (`uat.yaml` `environment.production` set) has a scenario with a `side_effect` and neither a test-mode, internal-recipient or test-account line nor the client's dated approval in `uat.yaml` `side_effects`. Name each scenario; write nothing.
2. **Refuse** while the Data check finds a scenario holding pasted record values instead of a pointer: name the scenario; it is replaced through `-plan` (a new scenario) before any pack is written.
3. **Write one pack per tester role**, `uat-pack-<role>.md` (`<role>` in lower case with hyphens): the six sections, the role's scenarios, its sessions, and "your login comes from <client contact role>". Read `brand.yaml` (name, colours, footer, language) for the HTML styling; absent, neutral styling, and say so.
4. **Exports.** If you can run code here and `ow-tools version` answers, run `ow-tools export uat/<client>/uat-pack-<role>.md` for each role and record the command and its raw output in `pack.yaml`; a preflight refusal (exit 4 naming a line) is fixed in the Markdown and run again. Otherwise write `export/uat-pack-<role>.html` yourself and say that the PDF and Word packs need ow-tools. Never imitate the tool's output.
5. **The results template**, `export/results-template.csv`: the six columns exactly (`tester id,scenario,result,cases passed,note,records created`), one row per scenario with only the scenario filled. No name column.
6. **Self-checks** on every pack and export: Data check, People by role or id, No credentials (pattern match only: NOT-CHECKED until the user confirms a read-through of the packs, recorded with the date in `pack.yaml`), No internal numbers, No private names. FINDING: fix and re-run; refuse while one stands. A typed waiver of the four that are never waived is refused.
7. **Write `pack.yaml` last.**

STATUS: `uat/<client>/pack.yaml` with `next: ow-uat /ow-uat-run uat/<client>/ | awaiting: session 1 on <date>`.

The NEXT block names the run, after each session (`use ow-uat-run on uat/<client>/`). Say where the packs are and that they go to the client contact, who hands each tester theirs and their login.
