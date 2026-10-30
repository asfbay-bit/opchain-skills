# Acceptance checks: format (schema 1)

An acceptance check is something the **client** can verify without reading code. `acceptance.md` (and the checks inside `quick-scope.md`) use this format exactly: the quote, the build and the acceptance testing later read the same ids.

    ---
    (header: ow_artefact: ow-build-plan/acceptance, subject: plans/<client>/scope.md, origin: skill)
    ---
    # Acceptance checks: <client>

    ## WP-3 Order intake

    ### AC-3.1
    - when: an order arrives by email from a known customer
    - then: it appears in the order system within 5 minutes, with the original email attached, and nobody retypes it
    - how we check: send 10 sample orders from last month's real set; all 10 arrive correctly
    - test data: 10 orders from September's export (evidence E-01)
    - cases: 10
    - kind: normal

    ### AC-3.2
    - when: an order arrives with an item code the system does not know
    - then: it goes to the exceptions list with the reason, not into the order system
    - how we check: send 3 orders with unknown codes; all 3 are on the exceptions list and none in the system
    - test data: 3 September orders with their codes altered
    - cases: 3
    - kind: error

Rules:

- One `## WP-n <name>` section per in-scope work package, in scope order; each holds at least one `### AC-n.m` (n is the package number).
- Every check has all six keys. `when` is one event; `then` is what the client can see; `how we check` says what to run and what counts as passing; `test data` names the data and where it comes from (an evidence id when it exists); `cases` is a whole number of at least 1; `kind` is `normal` or `error`.
- Error cases get checks too: across the plan, at least one check is `kind: error` (a missing field, a duplicate, a system that is down).
- Plain words. No code, no tool names the client does not use, no confidence labels and no quotes from the record.
- Test data that holds personal or regulated data is named and counted, never copied here.
