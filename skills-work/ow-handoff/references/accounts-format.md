# `accounts.md`: "all in your name"

Written by `/ow-handoff-accounts` only. `-notes`, `-package`, `-access` and `-close` read it; nothing else edits it. Its record modes (`--transfer`, `--check`, `--complete`, `--waive`) append one line each to `## Records`.

## 1. Header and sections

    ---
    ow_artefact: ow-handoff/accounts
    schema: 1
    written_by: ow-handoff 1.0.1 (protocol 1)
    workstream: <client slug>
    subject: handoffs/<client>/handoff.yaml
    created: <YYYY-MM-DD>
    clock: <source>
    origin: skill
    systems_map: present | none (built without a systems map)
    accounts_steps:
      - { step: inventory, rec: <n>, date: <YYYY-MM-DD> }
    scan: { status: CLEAN | HITS | NOT-CHECKED, reason: <§3 reason or none>, command: "ow-tools scan-secrets <repo> --json", exit: <n>, refs: <the JSON's refs> }
    ---
    # Accounts: <Client>

    ## Accounts
    | What | Kind | Owner of record | Billing | Runs as | Recovery and MFA | Who has access | Source · confidence (internal) | Where the client keeps the login |

    ## Transfer items
    | Id | Account | Kind | How control moves |

    ## Rotate items
    | Secret | Places used | Source |

    ## Repository scan

    ## Completeness

    ## Records

    ## Self-checks

- **One row per** repository, hosting account, domain and DNS, email sender, SaaS, API, integration, webhook and scheduled job. Kind is one of those words.
- **Owner of record** is the client, or it makes a transfer item (kind `ownership`). **Billing** through the builder makes one (`billing`). **Runs as** the builder's identity makes one (`re-authorise`). **Recovery and MFA** held by the builder makes one (`recovery`).
- **Who has access**: every person and service account by role; the builder's own access is marked `builder` for `-access`.
- **Source · confidence (internal)**: `HIGH seen (<what>)`, `MEDIUM stated (<role> <date>)`, `LOW inferred`, `UNKNOWN`. It never reaches a client copy. A row below HIGH shows in the Handoff notes as **to confirm**, never as owned, and does not block `-package`.
- **Where the client keeps the login**: a pointer only ("your password manager, entry Hosting"). Never a login, a password or a value.
- **Transfer items** `TR-nn`, numbered once. **How control moves** is one of: an ownership transfer in the service, a password reset to the client's own email, a share through the client's password manager. **Never by email**, never in the Handoff notes. Choosing care exempts no transfer: care keeps access, not ownership.
- **Rotate items**: each secret by **name** (`SHOP_API_TOKEN`), with every place it is used (env var, CI secret, integration config, job). Names come only from names-only sources: `.env.example`, the config schema, a hosting or CI listing that shows names without values, the user's list, and each scan hit's path and rule id. **No `.env` file or secrets store is opened.**

## 2. Records (the modes)

One line each, appended, never edited; every line ends with protocol §8's sentence.

    - <YYYY-MM-DD> transfer TR-nn: client has owner rights, confirmed by <client role> (as reported). This is a working note …
    - <YYYY-MM-DD> transfer TR-nn: done, confirmed by <client role> (as reported). This is a working note …
    - <YYYY-MM-DD> account check <What>: role owner, billing theirs, access list matches, recovery theirs, runs as the client; confirmed by <client role> (as reported). This is a working note …
    - <YYYY-MM-DD> completeness: confirmed against repository host, hosting, domain and DNS, email sender, every vendor in quote.md, every integration in scope; by <user> and <client role>. This is a working note …
    - <YYYY-MM-DD> waiver TR-nn, <What>: not confirmed; confirmation requested <YYYY-MM-DD>, <YYYY-MM-DD>; waived by <user>. This is a working note …

- **The client account check** names its account and all five things. A line naming fewer is no check.
- **Completeness** (only when `systems_map: none`) names the whole fixed prompt list: repository host, hosting, domain and DNS, email sender, every vendor in `quote.md`, every integration in scope. Until it is recorded, "All in the client's name" is NOT-CHECKED.
- **A waiver** names each item and every date confirmation was requested. A decline in the same words ("but not TR-02") is honoured: that item is not waived.

## 3. The repository scan

`ow-tools scan-secrets <repo> --json`, where code runs and `ow-tools version` answers. The skill records the command, its exit code and the JSON's `status` and rows (path, commit, line, rule id); it never asks for, prints or records a match.

- **Exit 0** is a scan result: `CLEAN` (no rows) or `HITS` (rows), when the JSON's `refs` is 1 or more. **`refs: 0`** (no reachable history: nothing was read) is recorded as `NOT-CHECKED (no reachable history)`, never CLEAN. Each hit becomes a rotate item, named from its path and rule id, with every place it is used once the user names them.
- **Any other exit, no ow-tools, no gitleaks, or a scanner that cannot redact**: `NOT-CHECKED (<reason>)`, with the JSON's `missing` or `reason` as given. The tool's NOT-CHECKED exits are 2 to 5 (2: a usage error; 3: a tool missing or too old; 4: refused; 5: the scan failed or timed out), or 128+n when a signal stopped it; any of them is NOT-CHECKED. "Taking it over" then says: "this repository has not been scanned for committed secrets".
- **What the scan covers, and does not**: committed history on every branch and tag, HEAD included (the delivered tree). It reads text file contents only: **binary files, UTF-16 files, commit messages and tag messages are not scanned**, and gitleaks' built-in path allowlist applies (dependency folders, lock files, binary and office formats). A secret in a file's name is printed as its path. `## Repository scan` copies the JSON's `not_read` list as given, one `- ` line per entry under `Not read:`, for CLEAN and HITS alike, and every `not_scanned` entry (a submodule's history) as it is, and says `CLEAN` means only that nothing read matched the scanner's rules, never that the history holds no secret. The checklist asks the user to read the commit and tag messages for secrets by hand, and records the answer there, dated; until then that line says "commit and tag messages: not read".
- A shallow or partial clone is refused by the scan (exit 4): NOT-CHECKED, with its reason.
- **Uncommitted files** are never scanned or opened: their names are listed as "not scanned", from a plain directory listing that follows no symlink. The skill runs no git command in the client's repository.
- **The builder's own scanner** counts only as rows the user ran and reports in the redacted form (path, commit, line, rule id). The skill never runs a package script, make target or other command the repository defines.
- Removing a secret from history is the client's choice, never the skill's.
