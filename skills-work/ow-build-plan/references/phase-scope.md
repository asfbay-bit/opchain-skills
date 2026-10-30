# Phase: scope (`/ow-build-plan-scope`)

Run step 0 of `references/ow-protocol.md` first. Read `plan.yaml`, `evidence.md` and the five `map/` files. With no map, say so and offer `/ow-build-plan-map`. The scope is **builder-neutral**: it names what changes and how the client will know it works, never a price, a tool of the user's own, or these skills' wording. Name a technology only where the client's systems require it.

## 1. Write `scope.md`

Header (`ow_artefact: ow-build-plan/scope`, `subject: plans/<client>/map/current.md`), then:

    # Scope: <client>

    ## Work packages
    ### WP-1 <name in plain words>
    - what changes: <one or two sentences>
    - from the map: <fact lines it rests on, by file and E-nn>
    - systems: <names>

    ## Out of scope
    - <explicit exclusion>          (never empty: at least one line)

    ## Assumptions
    - [<confidence> <E-nn>] <what must be true>

    ## Client dependencies
    | what | from (role) | by |
    |---|---|---|

    ## Open questions
    - <every remaining UNKNOWN from the map>. Who can answer: <role>.

    ## UAT approach
    - tester roles: <role names only, as the user states them; never a person's name>
    - test mix: <what each role checks, by work package>

Work packages are numbered `WP-1`, `WP-2`, … in the order the client would see them working. Anything the client asked for that is not in a package goes under Out of scope with one plain reason. Ask the user which roles will test; never default the number of roles.

## 2. Write `acceptance.md`

Every in-scope work package has at least one acceptance check, in the format of `references/acceptance-check-format.md`, and error cases get checks too.

## 3. Write `risks.md`

    # Risks: <client>

    ### R-1 <short name>
    - likelihood: low | medium | high
    - impact: low | medium | high
    - mitigation: <what reduces it, and when>
    - owner: <role>
    - evidence: <E-nn, or "inferred">

Every risk has an owner (a role, on either side) and a mitigation.

## 4. Self-checks

At the end of `scope.md`:

    ## Self-checks (same-session self-check)
    Same-session self-check: the same assistant that wrote the scope, applying a checklist; a discipline, not an independent review. Agent-checked.
    | check | result |
    |---|---|
    | Acceptance coverage | OK |
    | Out of scope present | OK |
    | Risk owners | OK |
    | Evidence trace | OK |

- **Acceptance coverage**: every `WP-n` in `scope.md` has at least one `AC-n.m` in `acceptance.md`, each with `test data` and a whole-number `cases`; at least one check is `kind: error`.
- **Out of scope present**: the list has at least one line.
- **Risk owners**: every `R-n` has an owner and a mitigation.
- **Evidence trace**: every HIGH or MEDIUM assumption and every "from the map" line cites an `E-nn` that exists.

A FINDING names the item; fix and run again before the NEXT block. `-export` leaves this section out of the plan.

## 5. STATUS and NEXT

Append: `… | plans/<client>/scope.md | next: ow-build-plan /ow-build-plan-quote plans/<client>/ | awaiting: plan to <client> by <plan_delivery>`. Print the scope NEXT block from SKILL.md.
