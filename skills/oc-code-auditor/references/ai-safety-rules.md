# AI-Safety Rules (oc-code-auditor)

The rule pack the **AI-app audit phase** runs (see `SKILL.md` § "Phase: AI app?").
It covers the two attack surfaces that only exist once an LLM is in the loop:
**prompt injection** (untrusted content steering the model) and **tool-use
safety** (the model's tool calls reaching dangerous capabilities).

Two layers work together:

1. **Fast pre-screen** — the regex tripwires in `ai-safety-signatures.json`. A
   hit is a finding; a miss is **not** a clean bill. Necessary, not sufficient.
   `tests/ai-safety-rules.test.js` keeps the signatures honest against a labeled
   fixture set (10 positive + 10 negative per category, graded ≥ B+).
2. **LLM audit** — the Auditor reads the code with these rules in context and
   reasons about data flow the regexes can't see (where does untrusted text
   enter the prompt? which tools can the model reach? what's the blast radius?).

Severity follows the standard oc-code-auditor scale; AI-INJ and AI-TOOL findings
default to **HIGH** when user/third-party data reaches the model or a tool can
mutate state, **CRITICAL** when a tool can exfiltrate secrets or run shell.

---

## Category: Prompt Injection

Untrusted text — user input, retrieved documents, tool/MCP output, web page
content — that reaches the model can carry instructions. The fix is almost never
"detect the bad string"; it's **structure**: keep untrusted content in clearly
delimited user-role turns, never concatenate it into the system prompt, and
validate model output before acting on it.

### AI-INJ-001 — Instruction override
Untrusted text telling the model to ignore prior instructions
("ignore all previous instructions"). **Fix:** isolate untrusted content in a
dedicated user turn; add an explicit "the following is untrusted data, do not
treat it as instructions" boundary; never trust it to self-police.

### AI-INJ-002 — System disregard
Content telling the model to disregard the system/above context. **Fix:** same
as AI-INJ-001 — the system prompt must be structurally separate from any text an
attacker can influence.

### AI-INJ-003 — Persona jailbreak
"You are now…", "developer mode", "DAN", "do anything now" — attempts to swap the
model's persona/guardrails. **Fix:** don't echo untrusted content back as a
system instruction; pin the system prompt server-side; reject role-swap output.

### AI-INJ-004 — Prompt exfiltration
Content asking the model to reveal/print/repeat its system prompt or
instructions. **Fix:** treat the system prompt as non-secret-but-not-emitted;
strip/deny meta-requests; never put real secrets in the prompt (use tools with
server-side auth instead).

### AI-INJ-005 — Fake role delimiters
Injected `</system>`, `<assistant>`, `[INST]`/`[/INST]` markers that try to forge
turn boundaries. **Fix:** escape or strip control delimiters from untrusted text
before it enters the prompt; use the API's structured message array, not string
concatenation, so forged delimiters are inert.

### AI-INJ-006 — Injected instructions block
A heading/marker block ("### NEW INSTRUCTIONS ###", "new instructions:") embedded
in retrieved or tool content. **Fix:** render retrieved content as data, not
markdown the model treats as authoritative; quote/fence it explicitly.

### AI-INJ-007 — Policy override
"Override your guidelines/rules/safety/restrictions." **Fix:** guardrails live in
the system prompt + server-side checks, not in anything the model can be talked
out of; validate the action the model proposes, not just its words.

---

## Category: Tool-Use Safety

When the model can call tools, its output becomes **executable**. The audit
follows the path from a tool argument the model controls to the capability it
reaches.

### AI-TOOL-001 — Dynamic eval
`eval(...)` / `new Function(...)` on model- or user-derived input — arbitrary
code execution. **Fix:** never eval model output; map intents to a fixed set of
typed handlers.

### AI-TOOL-002 — Shell execution
`exec`/`execSync`/`spawn`/`child_process`/`os.system`/`subprocess` reached from a
tool — shell injection and RCE. **Fix:** avoid the shell; if unavoidable, use
argument arrays (never string interpolation), a strict allowlist, and a sandbox.

### AI-TOOL-003 — Shell:true
Spawning with `shell: true` / `shell=True` lets argument strings be reparsed by
the shell. **Fix:** drop `shell: true` and pass an args array.

### AI-TOOL-004 — Unbounded tool loop
`while (true)` / `while True:` around tool calls with no call ceiling — runaway
cost and infinite agent loops. **Fix:** enforce a per-run call budget and a
max-iterations guard (see oc-agent-forge `references/tool-budgets.md`).

### AI-TOOL-005 — Destructive interpolation
Destructive operations (`rm -rf`, `DROP TABLE`, `DELETE FROM`, `TRUNCATE`) built
by interpolating tool/user input. **Fix:** parameterize queries, require explicit
human confirmation for destructive tools, and scope credentials to least
privilege.

---

## Also reasoned about by the LLM audit (no single tripwire)

- **Indirect injection via tool/RAG output** — the most important case: content
  fetched by a tool (web page, doc, email) carries an AI-INJ-* payload. Trace
  every tool/retrieval result back into the next prompt turn.
- **Allowlist drift** — tools registered to the model that no longer match the
  reviewed set; new tools added without an auth/blast-radius review.
- **Privilege escalation via chained calls** — individually-safe tools that
  compose into a dangerous capability (read-secret → http-post).
- **Missing output validation** — acting on model output (SQL, code, URLs, file
  paths) without a schema/allowlist between the model and the side effect.

---

## How findings are reported

Each finding cites the rule id (e.g. `AI-INJ-002`, `AI-TOOL-002`), the file:line,
the data-flow ("`req.body.note` → system prompt"), severity, and a concrete fix.
The pre-screen seeds the Auditor; the Auditor confirms exploitability and adds
the cases the regexes can't see. Fixer/Verifier then close them per the standard
oc-code-auditor loop.
