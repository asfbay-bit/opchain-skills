# The logs' self-checks

Each is a **same-session self-check: the same assistant that wrote the file, applying a checklist; a discipline, not an independent review** (protocol §8). Each is agent-checked and reports OK, FINDING or NOT-CHECKED (reason). `-log-meeting` writes the table into `notes.md`, `-log-decision` into `DEC-nn.md`; every verb that writes, `-action` and `-log` also print one line of results on their screen (`references/logs-status-and-index.md` §5). A verb prints its NEXT block only when none is FINDING.

**Three can never be waived: People by role, No client text in STATUS, No private names.** A request to skip one, or to write a name anyway, is refused, and the check runs; the screen says `refused` and `<check> can never be waived`.

| Check | Runs in | Passes when |
|---|---|---|
| Trace | `-log-meeting`, `-log-decision` | Every decision, action and open question cites a transcript time (the words are there, within ten seconds), a notes line or an attached source |
| Owner and date | `-log-meeting` | Every action has an owner role and a due date, or `no date: asked` |
| People by role | every verb | No person's name, email address or phone number in any file written, yours included |
| No client text in STATUS | `-log-meeting`, `-action`, `-log-decision` | Every line holds only ids, roles, paths, dates and the forms in `references/logs-schema.md` §6 |
| Follow-up clean | `-log-meeting` | The follow-up has no internal notes, none of our numbers, and no name |
| Never edited | `-log-decision` | No existing `DEC-nn.md` changed; a change is a new file that supersedes |
| No private names | every verb | No blocklisted name and no private skill, however it is spaced, hyphenated, underscored, joined or cased |
| Index copies nothing | `-log` | The screen shows each indexed file's path, its header date and the one key its row names: no amount in any form, no person's name, no other header value and no body text |

## Follow-up clean: what "internal" means (owner decision D1)

An internal number is **ours only**:

- our effort and hours ("I spent six hours on this", "it took us most of a week");
- our rates ("at my usual rate", "our day rate");
- our costs, margin, profit or loss on the work ("this is costing us", "we lose money on it");
- multipliers and modifiers on our price;
- overruns against our own plan ("it ran past what we estimated").

Also kept out: anything under an internal marker, our working notes, ids, file names and tool words. A rate or a charge is ours with or without an amount ("our day rate", "my rate goes up", "I charge a premium", "we are over budget"). An idiom with no plain marker ("take a small hit") is the self-check's to catch (owner decision D2).

**Allowed** (the client's side): the client's schedule and dates ("your team will test in the week of 9 November"), the client's figures and ratios ("your team packs about 40 orders a week", "about 3% of orders need a second look"), the client's own costs ("last month's reshipping cost your business three pallets of tile"), payment terms and dates, and the length of the meeting ("thanks for the 30-minute call today").

## People by role: the categories

Kept out of every file the logs verbs write:

- a person's name: a name the transcript or notes use for a speaker or anyone else, written as a name, with an honorific (Ms, Mr, Mrs, Dr), as `<Name> from <organisation>`, or on a `cc:` line;
- an email address or a phone number, in any shape: a 7-digit local number, ten digits run together, and an international number with its country code included.

**Allowed**: roles (`you`, `client ops lead`, `vendor account manager`, `the bookkeeper`, `client CFO`), a `cc:` line that holds only a role; the client's business name; product and system names (QuickBooks Online, the order sheet); places, weekdays and months; a noun at the start of a sentence ("Stoneware from Laguna arrives on Monday"); speaker labels with a confirmed role (`SPEAKER_01, confirmed by you`). A capitalised word is not a name by itself.

## No client text in STATUS

A logs STATUS line is a closed grammar: a date and clock, `ow-start <version>`, a `logs/<workstream>/…` path with an id (`MTG-nn`, `#A-nn`, `DEC-nn`), and the `next:` and `awaiting:` forms of logs-schema §6, where the only free word is an attendee role from that meeting's `notes.md` (or `you`). Anything else, such as a description in the path or the action's words in `awaiting:`, is FINDING.
