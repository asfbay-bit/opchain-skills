# Phase: question (`/ow-research-question <workstream>`)

Frames one research topic and writes `research/<ws>/RS-nn-<slug>/question.md`. Sends nothing: no search and no page request happens in this phase.

## 1. Step 0 and the workstream

1. Run step 0 of `references/ow-protocol.md`. Its lines come first on the screen, before anything this phase prints; "nothing else" below means nothing else after them (`references/routing-and-resume.md`). The handling answer goes in `question.md` (`handling`, `handling_source`). The workstream's line is the newest `question.md` of that workstream; for a client, also the `handling` key of `intake/<client>/intake.yaml` (ow-start) and `plans/<client>/plan.yaml` (ow-build-plan), read as a header and nothing else; else `profile.md`'s `handling` default. **Ask once per client:** for a client's first topic, ask the protocol's handling question even when `profile.md` stores "no", unless one of those two files records the client's answer. Where the answers differ, a level wins over "no": record the level (`-run` holds to any of them).
2. **No workstream given:** never guess. Ask exactly `Which workstream is this for: a client's slug, or business?`, print nothing else, and write nothing until the user answers.
3. **The workstream `frameworks`:** refuse. Say exactly `"frameworks" is reserved for framework texts; nothing was written.` and then `Name the client's slug or business; for a whole framework text, say "use ow-research-framework <id>".`, and nothing else. Write nothing.
4. **A whole framework or regulation text** ("get me NIST 800-53", "the HIPAA rules"): this phase does not take it. Say exactly `Whole framework or regulation texts come through /ow-research-framework; nothing was written.` and then `The open list: <ids>. For this one, say "use ow-research-framework <id>".` (`references/framework-sources.md`), and nothing else. Write nothing. A question *about* a rule (what it requires of a 20-person firm) is a `regulations` topic here.
5. The topic id: `RS-01` when the workstream has no topic folder yet, else the next number after the highest `RS-nn` in `research/<ws>/`. The slug is two to four plain words from the question, never the client's name.

## 2. Frame the question with the user

Ask one thing at a time; propose an answer the user can accept or change:

1. **The question**, in one or two sentences, and **the decision it serves**: a Build Plan (`serves: build-plan plans/<client>/`), a draft (`draft`), a vendor evaluation (`vendor-eval`), or a decision of the user's own (`decision`).
2. **The kind**: `background`, `technical-feasibility`, `market` or `regulations` (`references/confidence-rules.md` §3).
3. **Scope** (what is in and out) and **what "answered" means**: the facts that would settle it.
4. **Depth**: quick (5 page requests), standard (15) or deep (40). Propose quick unless the question needs more.
5. **The generic description** used in every query: the kind of business, its size band, the tools it uses by product name, its region. Never the client's name, a person, a domain or a quote from the client's files. A size is a band, never an exact count ("10–25 staff"); a region is a state or a country, never a town; and a query carries at most one distinctive detail besides the product names, since a combination can point to one small business. Example: "a ceramics studio with 10–25 staff and a retail shop, using a cloud point-of-sale system and a shared order spreadsheet".
6. **Keep out** (`keep_out`): ask for the client's business name, every variant they go by and every domain they use, and the names of the client's own customers and suppliers that its files name and that it wants kept out (a customer named on a purchase order, a supplier on an invoice); for the business workstream, your own business name and domains. The user confirms the list. People are not listed: they are kept out by kind (`references/self-checks.md` §3).
7. **Owners of the facts** (`owners`): the hosts of the vendor and the official publishers whose own pages count as primary sources for this question. Propose the narrowest that holds the facts: the exact documentation host (`developer.<vendor>`, `help.<vendor>`), or a host with a path where the owner's pages share a host with others (`github.com/<vendor>/`). Write `*.<host>` only when the user wants every subdomain counted. Never propose a shared platform's root (`github.com`, or a service host that serves every tenant, such as `raw.githubusercontent.com`; a tenant's own subdomain, such as `<vendor>.readthedocs.io`, is that tenant's and may be proposed), a support site without the path of its reference pages, or a host where users write (`community.`, `forum.`, `partners.`, `discuss.`). The user confirms each. A host not on this list is never primary, whatever its page claims.
8. **By name** (only if the user asks to search for the client itself, for example its own public website): write each exact query or URL the user approves, one at a time, into `by_name` with its date. A general approval ("search for them as needed") is not an approval: ask for the exact words.

Then show the whole question back and ask: `Confirm this question? Nothing is searched until you do.` On yes, write it with `confirmed: yes (<date>, by the user)`. If the session ends first, write the draft with `confirmed: no`; its screen is `Draft for <ws>: RS-nn <slug> (<kind>, <depth>).`, the self-check line, and that question, and nothing else.

## 3. A handling level

With a level set (from step 0), still write the question, with the level in `handling` and the step 0b answers in `environment_approved` and `connections_off`, and say exactly `Handling level recorded: no request will be sent for this topic; the run will use the files you supply.` Ask the user to put the pages and files they want used in `research/<ws>/RS-nn-<slug>/inbox/`. If the environment is not confirmed as approved, stop before any material is shared (protocol step 0b) and write nothing.

## 4. Write `question.md`

As `references/research-files-schema.md` §1 says. Then run this phase's self-checks (`references/self-checks.md`): **Query privacy** over the generic description, **No credentials** and **No private names**; record them in its `## Self-checks (same-session self-check)` table. A Query privacy FINDING here (the description carries a keep-out term, a person or a pasted sentence) is fixed with the user before the file is written.

**Write-once.** If `queries.md` already exists in the folder, the question is never edited: say exactly `This question has been run; it is never edited. A changed question is a new topic.` and offer a new topic. A draft (`confirmed: no`) may be rewritten until it is confirmed.

## 5. STATUS and NEXT

Append one STATUS line: `<date> (clock: <source>) | ow-research 1.0.2 | research/<ws>/RS-nn-<slug>/question.md | next: ow-research /ow-research-run research/<ws>/RS-nn-<slug>/ | awaiting: none` (a draft: `awaiting: question confirmation`). Print the screen's self-check line, then the question NEXT block from SKILL.md (a draft prints no NEXT: it is not finished).
