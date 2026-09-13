#!/usr/bin/env node
// opchain plugin — PreToolUse(Bash) gate on `git commit`.
//
// This is the one mechanism in opchain that makes a check run without the user
// asking for it by name. Skill-description matching produced zero autonomous
// invocations across 87 measured transcripts; a PreToolUse deny produces 100%,
// because it is not a suggestion.
//
// ── v2, after an adversarial audit found five real bypasses in v1 ────────────
// Every fix below has a reproduction in test-gate.cjs. The v1 defects were:
//
//   GATE-01  `git commit -a`, `-am`, `<pathspec>`, and `git add -A && commit`
//            all defeated the tree binding, because `git write-tree` hashes the
//            index as it stands BEFORE the command runs — and those forms stage
//            their content afterwards. Verified: an `eval(process.env.PAYLOAD)`
//            appended to a tracked file committed cleanly past a green gate.
//            Fixed by computing the PROSPECTIVE tree (what the commit will
//            actually contain) in a scratch index.
//   GATE-01b `--no-verify` was matched against the raw command, so a commit
//            *message* mentioning it disabled the gate. Fixed by matching the
//            quote-stripped string, in argument position.
//   GATE-03  Any uncaught throw produced empty stdout, and empty stdout means
//            ALLOW. `JSON.parse("null")` reached a property access and did
//            exactly that. Fixed by a top-level handler that denies.
//   GATE-04  `git -C <dir> commit` and `sh -c '…'` were not detected, because
//            options taking a separate value token broke the matcher. `git -C`
//            is how an agent commits from a worktree. Fixed.
//   GATE-05  A checkpoint with no `updated_at` skipped the freshness backstop,
//            so the cheapest forgery was `{"last_run_verdict":"PASS"}` with no
//            timestamp at all. Fixed by denying when the time is unknowable.
//   GATE-06  A PASS with no `verified_tree` was still allowed for 10 minutes —
//            the tree-less window of the repo-local ancestor, in which any
//            fresh PASS cleared any commit whatever changed after the check.
//            Meanwhile oc-bug-check's SKILL.md documented the verdict only at
//            `skill_state.last_run.verdict`, with no tree, so a skill following
//            its own docs was denied by the gate that ships — while the opchain
//            repo itself kept running the ancestor, which accepted exactly that
//            shape. Fixed: the tree is mandatory at every age, `last_run.verdict`
//            is read, verdict fields that disagree deny, and the repo's own
//            sessions run this file.
//   GATE-07  The wrapper re-scan for `sh -c '…'` failed both ways. It covered
//            the WHOLE command once a wrapper appeared anywhere, so a quoted
//            JSON dry-run payload mentioning `git commit`, piped into this
//            gate, plus an unrelated `sh -c` on the next line was denied as a
//            commit. And its anchor was looser than the one for `git`, so
//            `FOO=1 bash -c`, `/bin/sh -c`, `nice sh -c` and `then sh -c` each
//            ran a commit past the gate. Its prefix grammar also backtracked
//            exponentially: 26 × `time` outran the hook's 10s timeout, and a
//            killed hook writes no deny. And `\'` inside single quotes was read
//            as an escape, hiding `echo 'a\' ; git commit …` in a span bash had
//            closed. Fixed: the re-scan covers only what the wrapper can run, a
//            wrapper is found in the same command position as `git`, the prefix
//            grammar parses one way, and quote spans follow bash's rules.
//   GATE-08  Quoted text was data to every matcher, but bash reads inside it.
//            `echo "$(git commit -m x)"` committed: a substitution runs inside
//            double quotes. So did `` echo `git commit -m x` `` (a backtick was
//            no command position), `\git commit` and `"git" commit` (bash
//            removes quotes before it looks a command up), `\sh -c '…'`, and
//            `find . -exec sh -c '…' \;` (a command in argument position). A
//            here-document body or a comment quotes nothing, so the apostrophe
//            in `don't` there opened a span that hid the commit after it. Fixed:
//            the command is read a second time the way bash reads it, and a
//            commit found by either reading is a commit.
//   GATE-09  Both readings still read data as commands. The span reading lexed
//            a here-document body as shell, so `cat > notes.md <<'EOF'` prose
//            mentioning `$(git commit …)` was a commit, and one `"` in that
//            prose mis-paired every quote after it. Both read comments, so
//            `ls # then git commit later` was a commit, and
//            `git commit -m x # --no-verify` passed as an explicit bypass.
//            Fixed: what the shell reading knows masks what the span reading
//            lexes. A comment that could start no command is hidden from both,
//            a body only a plain `cat` or `tee` reads — output going nowhere a
//            command could run it — is hidden from the span reading, and no
//            comment carries the bypass flag.
//   GATE-10  `exec git commit` committed past the gate. `exec` replaces the
//            shell with the command after it, transparently, exactly like
//            `nice` — but it was absent from the prefix chain, so `git` was
//            never read in command position. The same held for `caffeinate git
//            commit`, `builtin exec git commit`, `builtin eval '…'`, and
//            `script -q /dev/null git commit` (whose log-file argument is a
//            value token before git). Each was verified to create a real commit
//            under a pty, and `bash -n` accepts all of them. `doas`, `chronic`,
//            `unbuffer`, `watch` and `parallel` were probed alongside them but
//            were absent on the box, so none could be confirmed to commit; they
//            are left out until a probe can actually run them. Fixed: `exec`,
//            `builtin`, `caffeinate` and `script` join the prefix chain.
//   GATE-11  The tree binding could never match in a repo that tracks
//            `.checkpoints/`, which oc-git-ops and oc-checkpoint-protocol both
//            tell users to do. The run must hash the tree BEFORE writing the
//            checkpoint that carries the hash, and writing that checkpoint then
//            changed the tree — so every honest PASS was denied, and the deny
//            said to re-run the gate, which moved the tree again. The opchain
//            repo never saw it: it gitignores this one file, and so did every
//            fixture. Fixed: the gate and the documented recipe both drop
//            `.checkpoints/oc-bug-check.checkpoint.json` from the scratch index
//            before hashing. It is the evidence, not the code under test, so
//            whether it is untracked, tracked, rewritten or staged no longer
//            moves the tree. Every other file, other checkpoints included, still
//            does.
//
// The through-line: every one of these failed OPEN. A gate whose error path is
// "allow" is a formality, not a gate. Hence rule 0.
//
// Rules:
//   0. FAIL CLOSED. Any state we cannot evaluate is a deny, never an allow.
//   1. NODE, NOT BASH+JQ. The retired repo-local ancestor soft-skipped when
//      `jq` was missing, so a fresh container silently had no gate. Node
//      always exists.
//   2. VERDICTS BOUND TO CONTENT. `write_checkpoint` is a public MCP tool and
//      the agent authors the file, so a bare `verdict: PASS` is self-attestation.
//      Binding it to a tree hash makes a stale or forged PASS NON-MATCHING.
//   3. OPT-IN PER REPO. Plugins install globally. A gate that denies commits in
//      unrelated repos gets uninstalled, taking the protection with it.
//   4. UNSUPPORTED != PASS. A gate that could not read your stack must not
//      report green.
//
// Contract: stdin is the hook JSON; stdout is either nothing (allow) or a
// PreToolUse deny object; exit 0 either way.

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

function allow() {
  process.exit(0);
}

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}

// RULE 0. Without this, any thrown error exits non-zero with empty stdout —
// which the hook contract reads as "allow". v1 shipped that hole (GATE-03).
process.on("uncaughtException", (e) => {
  deny(
    `opchain: the commit gate errored (${e && e.message}) and refuses to allow an ` +
      "unverified commit. This is a bug in the gate — please report it. To proceed " +
      "anyway: `git commit --no-verify`.",
  );
});

function git(args, cwd, env) {
  const r = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: env ? { ...process.env, ...env } : process.env,
  });
  return r.status === 0 ? (r.stdout || "").trim() : null;
}

// ── parse hook input ────────────────────────────────────────────────────────
let input;
try {
  input = JSON.parse(fs.readFileSync(0, "utf8") || "{}");
} catch {
  allow(); // malformed harness input is not the user's problem
}
if (!input || typeof input !== "object" || input.tool_name !== "Bash") allow();

const rawCommand = String((input.tool_input && input.tool_input.command) || "");

// Quoted literals are data, not syntax. Strip them ONCE and use the result for
// every structural decision — v1 stripped for the commit match but not for the
// bypass match, so a commit message could turn the gate off (GATE-01b).
//
// Spans follow bash's quoting rules, in one left-to-right pass: outside quotes
// `\x` is an escaped character; `'…'` has no escapes and ends at the next `'`;
// `"…"` honours `\`. `-m "he said \" --no-verify \""` is one argument, so a
// `"[^"]*"` span ending at the escaped quote left `--no-verify` exposed
// (GATE-01b, round 2). That round's fix — neutralising every `\"` and `\'`
// before finding spans — was wrong inside single quotes, where bash has no
// escapes: `echo 'a\' ; git commit -m x ; echo ''` hid a real commit inside a
// span bash had already closed (GATE-07).
//
// The source is the command as the shell reading masks it (GATE-09, below): the
// same length, with what that reading knows is a comment or a data here-document
// body blanked, so a span never opens on prose. Three views, position-aligned
// with `joined` and built from the SAME spans: `stripped` drops each quoted span,
// `masked` blanks it (structure only), `unquoted` blanks just the quote
// characters (nested commands survive as syntax). Because the spans are shared,
// text outside a span is always visible to the strict matcher.
const SPAN = /\\[\s\S]|'[^']*'|"(?:[^"\\]|\\[\s\S])*"/g;

function spanViews(source) {
  const joined = source.replace(/\\\n/g, " ");
  return {
    stripped: joined.replace(SPAN, (m) => (m[0] === "\\" ? m : "")),
    masked: joined.replace(SPAN, (m) => (m[0] === "\\" ? m : " ".repeat(m.length))),
    unquoted: joined.replace(/['"]/g, " "),
  };
}

/**
 * Does this command actually INVOKE `git commit`?
 *
 * Substring matching is wrong and harmful: it blocks `echo "git commit"`,
 * heredocs, and `grep -r 'git commit' docs/`. (The retired repo-local ancestor
 * did exactly that, and it blocked this file's own test runs twice.) False
 * positives teach people to bypass, which costs the true positives too.
 *
 * So: `git` must be in command position — start of string, after a shell
 * separator or group opener, or after `find`'s `-exec`, which runs the words
 * that follow it (GATE-08) — and `commit` must be its subcommand. Global
 * options taking a SEPARATE value token (`-C <dir>`, `-c <k=v>`) are consumed
 * explicitly; v1 missed those (GATE-04).
 */
const CMD_POS = String.raw`(?:^|[;&|\n(){]|&&|\|\||\bdo\b|\bthen\b|\belse\b|\s-(?:exec|execdir|ok|okdir)\s)`;
const ENVPFX = String.raw`(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*`;
// Prefix commands that exec the command after them transparently — `nice git`,
// `stdbuf -oL git`, `time git`, `flock /l git`, `xargs git`, and (GATE-10)
// `exec git`, `caffeinate git`, `builtin exec git`, `script -q /dev/null git`
// (the log-file is a value token, not a flag). Allow a chain of them, each with
// its own flags/values, between command position and git (GATE-04 r2). A value
// may not itself be a prefix name: if it could, `time time … ls` parses 2^n
// ways, and 26 of them outran the hook's 10s timeout — a killed hook writes no
// deny (GATE-07). Adding names only shrinks that ambiguity (more tokens are
// forbidden as values), never grows it. No match is lost: such a token still
// parses as the next prefix.
const PREFIXES =
  "nice|stdbuf|time|setsid|flock|ionice|timeout|env|command|sudo|nohup|xargs|exec|builtin|caffeinate|script";
const PREFIX = String.raw`(?:(?:${PREFIXES})(?:\s+-\S+|\s+(?!(?:${PREFIXES})\s)[^\s-]\S*)*\s+)*`;
// `git`, or an absolute/relative path to it (`/usr/bin/git`) — GATE-04 r2.
const GIT = String.raw`(?:[^\s;&|()]*/)?git`;
const GITOPT = String.raw`(?:(?:-[cC]|--git-dir|--work-tree|--namespace|--exec-path)\s+\S+\s+|-[^\s]+\s+|--\S+\s+)*`;
const GIT_COMMIT = new RegExp(`${CMD_POS}\\s*${ENVPFX}${PREFIX}${GIT}\\s+${GITOPT}commit(?![-\\w])`);

// Wrappers that execute nested command text (`sh -c '…'`, `eval "…"`, `… | sh`).
// That text lives INSIDE quotes, so `stripped` deleted it. For these, re-scan a
// variant where the quote characters become whitespace — keeping the nested
// command as syntax rather than discarding it as data. A wrapper is found in the
// same command position as `git` itself (env prefix, `nice`-style prefix, path);
// a looser anchor let `FOO=1 bash -c`, `/bin/sh -c` and `then sh -c` through.
const WRAPPER = new RegExp(
  `${CMD_POS}\\s*${ENVPFX}${PREFIX}(?:[^\\s;&|()]*/)?(?:sh|bash|zsh|env|eval|xargs|command|sudo|timeout|nohup)(?![-\\w])`,
);

// Inside a wrapper's argument the nested command follows `-c` and whitespace,
// not a shell separator, so the strict command-position anchor cannot match.
// Having already established this IS a wrapper invocation, accept `git … commit`
// at any whitespace boundary within it — or after a separator, `(` or backtick,
// since `sh -c 'true;git commit'` and `sh -c 'echo $(git commit)'` put nothing
// between them and git (GATE-08).
const GIT_COMMIT_LOOSE = new RegExp(String.raw`(?:^|[\s;&|(){}\x60])${ENVPFX}${PREFIX}${GIT}\s+${GITOPT}commit(?![-\w])`);

/**
 * The simple commands of `masked`, as [start, end, piped]. Split at unquoted
 * `;` `&` `&&` `|` `||` newline and subshell parens — not at redirections
 * (`2>&1`, `&>`, `>|`), nor inside `$(…)` `<(…)` `>(…)` or backticks, which
 * belong to the word they appear in. `piped`: stdin is the previous stage.
 */
function simpleCommands(s) {
  const out = [];
  let start = 0;
  let piped = false;
  let depth = 0;
  let tick = false;
  const cut = (i, width, nextPiped) => {
    out.push([start, i, piped]);
    start = i + width;
    piped = nextPiped;
    return width - 1;
  };
  for (let i = 0; i < s.length; i++) {
    const p = s[i - 1];
    const c = s[i];
    const n = s[i + 1];
    if (c === "`") tick = !tick;
    if (tick || c === "`") continue;
    if (c === "(" && (depth > 0 || p === "$" || p === "<" || p === ">")) depth++;
    else if (c === ")" && depth > 0) depth--;
    else if (depth > 0) continue;
    else if (c === "(" || c === ")" || c === ";" || c === "\n") i += cut(i, 1, false);
    else if (c === "&" && n === "&") i += cut(i, 2, false);
    else if (c === "&" && p !== ">" && p !== "<" && n !== ">") i += cut(i, 1, false);
    else if (c === "|" && n === "|") i += cut(i, 2, false);
    else if (c === "|" && p !== ">") i += cut(i, n === "&" ? 2 : 1, true);
  }
  out.push([start, s.length, piped]);
  return out;
}

/**
 * Does a wrapper run `git commit`? The loose re-scan covers only text that
 * wrapper can execute. It once covered the whole command whenever a wrapper
 * appeared anywhere, so a quoted JSON dry-run payload mentioning `git commit`
 * on one line plus an unrelated `sh -c` on the next was denied (GATE-07).
 *
 * The scope is the wrapper's own simple command, not just its `-c` argument:
 * finding that argument means parsing each shell's flags (`-lc`, `-o pipefail
 * -c`) with a regex — the unwinnable game v3 walked away from. It widens, and
 * never narrows, where stdin can carry commands in: piped into (`… | sh`) it
 * covers everything before, since a group, subshell or loop upstream can feed
 * it; with a here-doc (`sh <<EOF`) it covers everything after, where the body is.
 */
function wrapperRunsCommit({ masked, unquoted }) {
  for (const [start, end, piped] of simpleCommands(masked)) {
    const own = masked.slice(start, end);
    if (!WRAPPER.test(own)) continue;
    const scope = unquoted.slice(piped ? 0 : start, own.includes("<<") ? masked.length : end);
    if (GIT_COMMIT_LOOSE.test(scope)) return true;
  }
  return false;
}

// ── the shell reading (GATE-08) ─────────────────────────────────────────────
// Everything above reads a quoted span as data and never looks inside it again.
// Bash does. `$(…)` and `` `…` `` run wherever they appear outside single
// quotes: inside double quotes, and in an unquoted here-document body. Bash
// removes quote marks and escapes before it looks a command up, so `\git`,
// `"git"` and `g\it` all run git. And a here-document body or a comment quotes
// nothing, so an apostrophe there must not open a span.
//
// So the command is read a second time, the way bash reads it: one pass that
// labels every character and lifts out each command substitution as a command
// of its own, checked by the same matchers. A commit found by either reading is
// a commit. The span reading stays: it shows a here-document body to the strict
// matcher, the only cover for a stdin consumer no wrapper list names (`dash
// <<EOF`, `ssh host bash <<EOF`). What this reading knows masks what the span
// reading lexes — a comment, a body only `cat` or `tee` reads (GATE-09) — so
// beside it, a verdict can change only for a command that holds one of those.
const SYN = 0; // shell syntax: unquoted, unescaped
const LIT = 1; // literal text: quoted or escaped
const QUO = 2; // what quote removal deletes: quote marks, escaping backslashes

/**
 * Read `src` as bash would, returning its top command. A command is
 * { src, kinds, start, end, skip, subs, comments, heredocs, via }: `kinds`
 * labels each character; `skip` maps where a substitution (read as `_`), a
 * here-document body or a hidden comment (read as nothing) starts to [end,
 * reading]; `subs` holds every command bash runs on this one's behalf —
 * substitutions in its text, in its double quotes, and in its unquoted
 * here-document bodies; `comments` holds [start, end, hidden]; `heredocs` holds
 * { op, body, end, runs } — where `<<` is, where the body starts and ends, and
 * whether it runs a substitution; `via` is how its parent runs it: "" for the
 * top, `$` `<` `>` or `$"` for `$(…)` `<(…)` `>(…)` or `"$(…)"`, `` ` `` for a
 * backtick.
 *
 * An unterminated quote or substitution runs to the end: bash runs nothing past
 * it. A `<<` with no delimiter line is not a here-document — `((x<<=1))` is
 * arithmetic — so what follows it stays visible. Delimiter lines are looked up
 * in an index, not scanned for per `<<`, so no input shape outruns the hook's
 * timeout (a killed hook writes no deny).
 */
function readShell(src) {
  const n = src.length;
  const kinds = new Uint8Array(n); // SYN until labelled
  let lim = n; // narrowed while an unquoted here-document body is read
  let lines = null;

  const command = (start) => ({
    src,
    kinds,
    start,
    end: n,
    skip: new Map(),
    subs: [],
    comments: [],
    heredocs: [],
    via: "",
  });

  function top(cmd, i, nested) {
    let depth = 0;
    let pending = [];
    while (i < lim) {
      const c = src[i];
      const d = i + 1 < lim ? src[i + 1] : "";
      if (c === "\\" && d) {
        kinds[i] = QUO;
        kinds[i + 1] = d === "\n" ? QUO : LIT;
        i += 2;
      } else if (c === "'") i = single(i);
      else if (c === "$" && d === "'") i = ansi(i);
      else if (c === '"') i = double(cmd, i);
      else if (c === "`") i = backtick(cmd, i, false);
      else if ((c === "$" || c === "<" || c === ">") && d === "(") i = paren(cmd, i);
      else if (c === "#" && (i === cmd.start || /[\s;&|()]/.test(src[i - 1]))) {
        // A comment quotes nothing. It is hidden from the matchers only if its text
        // could start no command were `#` an ordinary word — as an interactive
        // bash without interactive_comments reads it, and as `${x:-a #b}` and
        // `(( x # ))` are read, where it is no comment — so a separator, group or
        // substitution in it keeps it visible, as every comment was (GATE-09).
        const eol = src.indexOf("\n", i);
        const to = eol < 0 || eol >= lim ? lim : eol;
        const hidden = !/[;&|(){}`]/.test(src.slice(i, to));
        cmd.comments.push([i, to, hidden]);
        if (hidden) cmd.skip.set(i, [to, ""]);
        i = to;
      } else if (c === "<" && d === "<" && src[i + 2] === "<") i += 3; // a here-string
      else if (c === "<" && d === "<") {
        const h = delimiter(i + 2);
        if (h) pending.push(Object.assign(h, { op: i }));
        i += 2;
      } else if (c === "\n" && pending.length) {
        i++;
        for (const h of pending) i = heredoc(cmd, i, h);
        pending = [];
      } else if (c === ")" && nested && depth === 0) return i;
      else {
        if (c === "(") depth++;
        else if (c === ")" && depth > 0) depth--;
        i++;
      }
    }
    return lim;
  }

  // '…' — nothing escapes inside.
  function single(i) {
    let close = src.indexOf("'", i + 1);
    if (close < 0 || close >= lim) close = lim;
    kinds[i] = QUO;
    kinds.fill(LIT, i + 1, close);
    if (close === lim) return lim;
    kinds[close] = QUO;
    return close + 1;
  }

  // $'…' — backslash escapes, \' included.
  function ansi(i) {
    kinds[i] = kinds[i + 1] = QUO;
    let j = i + 2;
    for (; j < lim && src[j] !== "'"; j++) {
      kinds[j] = LIT;
      if (src[j] === "\\" && j + 1 < lim) kinds[++j] = LIT;
    }
    if (j < lim) kinds[j++] = QUO;
    return j;
  }

  // "…" — `\` escapes only $ ` " \ and newline; $(…), `…` and ${…} still expand.
  function double(cmd, i) {
    kinds[i] = QUO;
    for (let j = i + 1; j < lim; ) {
      const c = src[j];
      const d = j + 1 < lim ? src[j + 1] : "";
      if (c === '"') {
        kinds[j] = QUO;
        return j + 1;
      }
      if (c === "\\" && d && '$`"\\\n'.includes(d)) {
        kinds[j] = QUO;
        kinds[j + 1] = d === "\n" ? QUO : LIT;
        j += 2;
      } else if (c === "$" && d === "(") j = paren(cmd, j, true);
      else if (c === "`") j = backtick(cmd, j, true);
      else if (c === "$" && d === "{") j = brace(cmd, j);
      else kinds[j++] = LIT;
    }
    return lim;
  }

  // ${…} inside double quotes: a " opens a nested string rather than closing the
  // outer one, and $(…) and `…` still expand.
  function brace(cmd, i) {
    kinds[i] = kinds[i + 1] = LIT;
    for (let j = i + 2; j < lim; ) {
      const c = src[j];
      const d = j + 1 < lim ? src[j + 1] : "";
      if (c === "}") {
        kinds[j] = LIT;
        return j + 1;
      }
      if (c === "\\" && d) {
        kinds[j] = kinds[j + 1] = LIT;
        j += 2;
      } else if (c === '"') j = double(cmd, j);
      else if (c === "$" && d === "(") j = paren(cmd, j, true);
      else if (c === "`") j = backtick(cmd, j, true);
      else if (c === "$" && d === "{") j = brace(cmd, j);
      else kinds[j++] = LIT;
    }
    return lim;
  }

  // $(…), <(…), >(…) — a command of its own, up to its unmatched ).
  function paren(cmd, i, inDouble) {
    const sub = command(i + 2);
    sub.via = src[i] + (inDouble ? '"' : "");
    sub.end = top(sub, i + 2, true);
    const to = Math.min(sub.end + 1, lim);
    cmd.skip.set(i, [to, "_"]);
    cmd.subs.push(sub);
    return to;
  }

  // `…` — unescape \` \$ \\ (and \" inside double quotes), then read the body as
  // a command of its own.
  function backtick(cmd, i, inDouble) {
    const escapes = inDouble ? '`$\\"' : "`$\\";
    let body = "";
    let j = i + 1;
    for (; j < lim && src[j] !== "`"; j++) {
      if (src[j] === "\\" && j + 1 < lim && escapes.includes(src[j + 1])) j++;
      body += src[j];
    }
    const to = Math.min(j + 1, lim);
    cmd.skip.set(i, [to, "_"]);
    cmd.subs.push(Object.assign(readShell(body), { via: "`" }));
    return to;
  }

  // The delimiter after << or <<-: its word with quotes removed, and whether any
  // part of it was quoted.
  function delimiter(j) {
    const tabs = src[j] === "-";
    if (tabs) j++;
    while (src[j] === " " || src[j] === "\t") j++;
    let word = "";
    let quoted = false;
    while (j < lim && !/[\s;&|()<>]/.test(src[j])) {
      const c = src[j];
      if (c === "'" || c === '"') {
        const close = src.indexOf(c, j + 1);
        if (close < 0 || close >= lim) return null;
        word += src.slice(j + 1, close);
        quoted = true;
        j = close + 1;
      } else if (c === "\\") {
        word += src[j + 1] || "";
        quoted = true;
        j += 2;
      } else {
        word += c;
        j++;
      }
    }
    return word || quoted ? { word, quoted, tabs } : null;
  }

  // A here-document body runs from `i` through the first later line that is
  // exactly its delimiter (leading tabs stripped, for <<-). Quoted, it is data.
  // Unquoted, its $(…) and `…` run.
  function heredoc(cmd, i, h) {
    if (!lines) {
      lines = new Map(); // line text → starts; "\n" + text for the tab-stripped form
      for (let at = 0; at < n; ) {
        let eol = src.indexOf("\n", at);
        if (eol < 0) eol = n;
        const line = src.slice(at, eol);
        for (const key of [line, "\n" + line.replace(/^\t+/, "")]) {
          if (!lines.has(key)) lines.set(key, []);
          lines.get(key).push(at);
        }
        at = eol + 1;
      }
    }
    const starts = lines.get(h.tabs ? "\n" + h.word : h.word) || [];
    let lo = 0;
    for (let hi = starts.length; lo < hi; ) {
      const mid = (lo + hi) >> 1;
      if (starts[mid] < i) lo = mid + 1;
      else hi = mid;
    }
    const at = starts[lo];
    if (at === undefined || at >= lim) return i; // no delimiter line: not a here-document
    const outside = cmd.subs.length;
    if (!h.quoted) {
      const outer = lim;
      lim = at;
      expand(cmd, i);
      lim = outer;
    }
    const eol = src.indexOf("\n", at);
    const end = eol < 0 || eol >= lim ? lim : eol + 1;
    cmd.skip.set(i, [end, ""]); // after expand(), whose substitutions it covers
    cmd.heredocs.push({ op: h.op, body: i, end, runs: cmd.subs.length > outside });
    return end;
  }

  // An unquoted here-document body: quote marks are literal characters, but
  // `\` escapes and substitutions work.
  function expand(cmd, i) {
    while (i < lim) {
      const c = src[i];
      if (c === "\\") i += 2;
      else if (c === "$" && src[i + 1] === "(") i = paren(cmd, i);
      else if (c === "`") i = backtick(cmd, i, false);
      else i++;
    }
  }

  const root = command(0);
  top(root, 0, false);
  return root;
}

/**
 * One command's views in the shell reading:
 *   words    — what the matchers read. Quote marks and escapes are gone and
 *              quoted text joins its word, so `"git" commit` reads `git commit`;
 *              a quoted character that would be syntax reads `_`, so
 *              `echo "a; git commit"` stays one word. A substitution reads `_`;
 *              a here-document body or a hidden comment reads as nothing.
 *   stripped — for the bypass flag: every quoted or escaped character, and every
 *              comment, reads `_`.
 *   masked   — position-aligned with the command's text, syntax only.
 *   at       — a masked offset → its offset in `words`.
 */
function shellViews(cmd) {
  const { src, kinds, start, end, skip } = cmd;
  const comments = new Map(cmd.comments.map(([from, to]) => [from, to]));
  let words = "";
  let stripped = "";
  let masked = "";
  let comment = start; // `stripped` reads a comment the matchers still see as `_`
  const at = new Int32Array(end - start + 1);
  for (let i = start; i < end; ) {
    at[i - start] = words.length;
    const s = skip.get(i);
    if (s) {
      const to = Math.min(s[0], end);
      words += s[1];
      stripped += s[1];
      masked += " ".repeat(to - i);
      i = to;
      continue;
    }
    if (comments.has(i)) comment = comments.get(i);
    const c = src[i];
    if (kinds[i] === SYN) {
      words += c;
      stripped += i < comment ? "_" : c;
      masked += c;
    } else {
      if (kinds[i] === LIT) {
        words += /[\s;&|()<>{}`$'"\\=#]/.test(c) ? "_" : c;
        stripped += "_";
      }
      masked += " ";
    }
    i++;
  }
  at[end - start] = words.length;
  return { words, stripped, masked, at };
}

/** `cmd.src` from `from` to `to`, with the comments this reading hides blanked. */
function withoutComments(cmd, from, to) {
  const { comments } = cmd; // in source order, so their ends are sorted too
  let lo = 0;
  for (let hi = comments.length; lo < hi; ) {
    const mid = (lo + hi) >> 1;
    if (comments[mid][1] <= from) lo = mid + 1;
    else hi = mid;
  }
  let text = "";
  let k = from;
  for (let c = lo; c < comments.length && comments[c][0] < to; c++) {
    const [a, b, hidden] = comments[c];
    if (!hidden) continue;
    const x = Math.max(a, k);
    const y = Math.min(b, to);
    text += cmd.src.slice(k, x) + " ".repeat(y - x);
    k = y;
  }
  return text + cmd.src.slice(k, to);
}

/**
 * The shell reading's verdict: the strict matcher over `words`; the wrapper
 * re-scan, with wrappers found in `words` (`\sh`, `"sh"`) and each wrapper's
 * scope read with its quote marks and backslashes both blanked (`sh -c '\git
 * commit'`) and deleted (`sh -c 'g"i"t commit'`); then every substitution.
 */
function shellRunsCommit(cmd) {
  const v = shellViews(cmd);
  if (GIT_COMMIT.test(v.words)) return true;
  for (const [start, end, piped] of simpleCommands(v.masked)) {
    if (!WRAPPER.test(v.words.slice(v.at[start], v.at[end]))) continue;
    const from = piped ? 0 : start;
    // A here-document upstream of a pipe feeds this wrapper too.
    const to = v.masked.slice(from, end).includes("<<") ? v.masked.length : end;
    const scope = withoutComments(cmd, cmd.start + from, cmd.start + to);
    if (GIT_COMMIT_LOOSE.test(scope.replace(/['"\\]/g, " "))) return true;
    if (GIT_COMMIT_LOOSE.test(scope.replace(/['"\\]/g, ""))) return true;
  }
  return cmd.subs.some(shellRunsCommit);
}

const shell = readShell(rawCommand);

// ── what the span reading must not lex (GATE-09) ────────────────────────────
// The span reading lexed every here-document body as shell. That is its cover
// for a program that runs its stdin under a name no wrapper list holds — and it
// is why `cat > notes.md <<'EOF'` prose mentioning `$(git commit …)` was denied,
// and why one `"` in such prose mis-paired every quote after it. So it now skips
// a body nothing in the command could run: one a plain `cat` or `tee` reads,
// whose output stays put. It also skips every comment the shell reading hides.
const DATA_READER = /^(?:cat|tee)$/;
// Group marks and reserved words that can put a reader inside a compound
// command, whose output a later `|` takes whole; `exec` can aim stdout at a
// process.
const COMPOUND = /[(){}]|\b(?:if|then|else|elif|case|for|select|while|until|do|function|coproc|exec|repeat|foreach)\b/;
const QUIET_DEVICE = /^\/dev\/(?:null|stdout|stderr|tty)$/;

/**
 * Can nothing in this command run here-document `h` of `cmd`? Every test fails
 * toward "something could", which leaves the body in the span reading's view as
 * before. `v` and `list` are `cmd`'s shell views and simple commands.
 *   - `cmd` is the top command, or a `"$(…)"`, whose output is one quoted word;
 *     a bare `$(…)`, `<(…)` or `>(…)` can splice or feed its output anywhere.
 *   - An unquoted body runs no substitution.
 *   - The reader is a bare `cat` or `tee`, outside any compound command, not
 *     piped onward, with no substitution in its words, and only options,
 *     operands and plain redirections.
 *   - Every file it writes is a quiet device or named nowhere else in the
 *     command, so `cat > x.sh <<'EOF' … sh x.sh` stays visible.
 */
function hereDocIsData(cmd, h, v, list) {
  if (cmd.via !== "" && cmd.via !== '$"') return false;
  if (h.runs) return false;
  const at = h.op - cmd.start;
  const k = list.findIndex(([s, e]) => at >= s && at < e);
  if (k < 0) return false;
  const [s, e] = list[k];
  if ((list[k + 1] && list[k + 1][2]) || COMPOUND.test(v.masked.slice(0, s))) return false;
  if (/`|[$<>]\(/.test(cmd.src.slice(cmd.start + s, cmd.start + e))) return false;
  const words = v.words.slice(v.at[s], v.at[e]).trim().split(/\s+/);
  if (!DATA_READER.test(words[0])) return false;
  const writes = [];
  for (let t = 1; t < words.length; t++) {
    const w = words[t];
    let m;
    if ((m = /^<<-?(.*)$/.exec(w))) {
      if (!m[1]) t++; // its delimiter
    } else if ((m = /^\d*<([^&<>]*)$/.exec(w))) {
      if (!m[1]) t++; // a file it reads
    } else if ((m = /^(?:\d*>\||\d*>>?|&>>?)(.*)$/.exec(w))) {
      const target = m[1] || words[++t] || "";
      if (/^&[12]$/.test(target)) continue; // onto the terminal
      if (!target || /[&<>]/.test(target)) return false;
      if (!QUIET_DEVICE.test(target)) writes.push(target);
    } else if (/[&<>]/.test(w)) {
      return false;
    } else if (words[0] === "tee" && w[0] !== "-") {
      writes.push(w);
    }
  }
  if (writes.length > 8) return false; // each costs a scan of the command
  for (const file of writes) {
    const base = file.slice(file.lastIndexOf("/") + 1);
    if (!/[^_.]/.test(base)) return false; // nothing to find it by
    // In `words`, `_` stands for a quoted character, so it matches any.
    const name = new RegExp(base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/_/g, "."), "g");
    const before = rawCommand.slice(0, h.body).match(name) || [];
    const after = rawCommand.slice(h.end).match(name) || [];
    if (before.length + after.length !== 1) return false;
  }
  return true;
}

/**
 * The command, same length, with what the span reading must not lex blanked.
 * Blanked with an inert character, not a space: a data body is mostly spaces and
 * newlines, and the strict matcher's `\s*` rescans a whitespace run from every
 * newline in it — a 33KB body took 64ms, and a killed hook writes no deny.
 */
function spanSource(root) {
  const out = rawCommand.split("");
  const blank = (from, to) => {
    for (let i = from; i < to; i++) if (out[i] !== "\n") out[i] = "\x01";
  };
  let budget = 64; // each here-document can cost a scan of the command; past this, none is skipped
  (function walk(cmd) {
    if (cmd.src !== rawCommand) return; // a backtick body is a string of its own
    for (const [from, to, hidden] of cmd.comments) if (hidden) blank(from, to);
    if (cmd.heredocs.length) {
      const v = shellViews(cmd);
      const list = simpleCommands(v.masked);
      for (const h of cmd.heredocs) if (budget-- > 0 && hereDocIsData(cmd, h, v, list)) blank(h.body, h.end);
    }
    cmd.subs.forEach(walk);
  })(root);
  return out.join("");
}

const span = spanViews(spanSource(shell));

if (!(GIT_COMMIT.test(span.stripped) || wrapperRunsCommit(span) || shellRunsCommit(shell))) {
  allow();
}

const cwd = input.cwd || process.cwd();
const repoRoot = git(["rev-parse", "--show-toplevel"], cwd) || cwd;

/** Only gate repos that asked for it — rule 3. */
if (
  !(
    process.env.OPCHAIN_GATE === "1" ||
    fs.existsSync(path.join(repoRoot, ".checkpoints")) ||
    fs.existsSync(path.join(repoRoot, ".opchain"))
  )
) {
  allow();
}

// Explicit, logged bypass — in argument position, and outside quotes in BOTH
// readings, so neither a commit message (GATE-01b), a span one reading closed in
// the wrong place (GATE-08: `don't` in here-document prose, then
// `-m ' --no-verify '`), nor a comment (GATE-09: `git commit -m x # --no-verify`)
// can trigger it.
const BYPASS = /(?:^|\s)(?:--no-verify|OPCHAIN_BYPASS=1)(?:\s|$)/;
if (BYPASS.test(span.stripped) && BYPASS.test(shellViews(shell).stripped)) {
  process.stderr.write("[opchain] ⚠ commit gate bypassed explicitly (--no-verify / OPCHAIN_BYPASS=1)\n");
  allow();
}

// ── read the bug-check verdict ──────────────────────────────────────────────
const cpPath = path.join(repoRoot, ".checkpoints", "oc-bug-check.checkpoint.json");

const INVOKE =
  'Run the gate, then retry:\n\n    Skill(skill="oc-bug-check", args="/oc-bugcheck run")\n\n' +
  "If it returns PASS the commit proceeds. If FAIL, fix what it surfaces. If\n" +
  "UNSUPPORTED, the gate could not read this stack — that is not a pass; either\n" +
  "add stack support or bypass deliberately with `git commit --no-verify`.";

if (!fs.existsSync(cpPath)) {
  deny(`opchain: oc-bug-check has not run in this repo, so this commit is unverified.\n\n${INVOKE}`);
}

let cp;
try {
  cp = JSON.parse(fs.readFileSync(cpPath, "utf8"));
} catch (e) {
  deny(`opchain: .checkpoints/oc-bug-check.checkpoint.json is not valid JSON (${e.message}).\n\n${INVOKE}`);
}
if (!cp || typeof cp !== "object" || Array.isArray(cp)) {
  deny(`opchain: .checkpoints/oc-bug-check.checkpoint.json is not a JSON object.\n\n${INVOKE}`);
}

const st = (cp.skill_state && typeof cp.skill_state === "object" && cp.skill_state) || {};

// The verdict is recorded in up to three places: `last_run_verdict` (the flat
// field this gate reads first), `verdict`, and `last_run.verdict` (the detailed
// record oc-bug-check's SKILL.md has always documented, and all the retired
// repo-local gate read). Any of them counts, but every one present must agree —
// a checkpoint saying PASS in one field and FAIL in another is not evidence of
// a pass (RULE 0). Without this, a stale flat PASS could outvote a fresh FAIL.
const lastRun = (st.last_run && typeof st.last_run === "object" && st.last_run) || {};
const recorded = [
  ...new Set(
    [st.last_run_verdict, st.verdict, lastRun.verdict]
      .filter((v) => v !== undefined && v !== null && v !== "")
      .map((v) => String(v).toUpperCase()),
  ),
];

if (recorded.includes("UNSUPPORTED")) {
  deny(
    "opchain: oc-bug-check returned UNSUPPORTED — it did not recognize this stack,\n" +
      "so types, lint, tests and build were never run. An absence of findings is not\n" +
      "a pass.\n\nAdd stack support (skills/oc-bug-check/SKILL.md § Stack-Specific\n" +
      "Adaptations) or bypass deliberately with `git commit --no-verify`.",
  );
}
if (recorded.length > 1) {
  deny(
    `opchain: the oc-bug-check checkpoint records conflicting verdicts (${recorded.join(", ")}),\n` +
      "so it is not evidence of a PASS.\n\n" +
      INVOKE,
  );
}
if (recorded[0] !== "PASS") {
  deny(`opchain: last oc-bug-check verdict was ${recorded[0] || "(none recorded)"}, not PASS.\n\n${INVOKE}`);
}

// ── an unknowable time is not evidence (GATE-05) ────────────────────────────
const ts = Date.parse(cp.updated_at || "");
if (Number.isNaN(ts)) {
  deny(
    "opchain: the oc-bug-check checkpoint records a PASS but no readable `updated_at`,\n" +
      "so there is no way to tell when — or whether — it ran.\n\n" +
      INVOKE,
  );
}

// ── the tree is mandatory at every age (GATE-06) ────────────────────────────
// Recency is not coverage: a PASS recorded one minute ago says nothing about a
// file edited thirty seconds ago. Only the tree hash can say that.
const verifiedTree = st.verified_tree || st.verified_for_tree || null;
if (!verifiedTree) {
  deny(
    "opchain: oc-bug-check recorded a PASS but no `skill_state.verified_tree`, so there is\n" +
      "no way to tell whether it covered the code you are committing — however recently\n" +
      "it ran. The run must record the tree hash alongside the verdict\n" +
      "(skills/oc-bug-check/SKILL.md § Commit gate contract).\n\n" +
      INVOKE,
  );
}

// ── bind the verdict to the FULL working-tree state ─────────────────────────
/**
 * v2 tried to PREDICT what a command would stage — parse the shell, classify
 * `-a` vs pathspec vs `git add … &&`, hash a matching scratch index. A re-audit
 * broke it three ways in a day (`git add <path> && commit`, `-C <ref>`,
 * `--fixup`). Predicting arbitrary bash with a regex is unwinnable, and every
 * missed form fails OPEN.
 *
 * v3 stops predicting. It binds the PASS to the ENTIRE current state of the
 * repo — every tracked modification and every untracked, non-ignored file —
 * computed as `git add -A` in a throwaway index. The invariant:
 *
 *     if the full working state equals what oc-bug-check verified, then NO
 *     commit form can introduce unverified content, because there is none
 *     present to introduce — staged, unstaged, or brand-new.
 *
 * This is airtight against `-a`, `-am`, pathspecs, `git add <anything> &&`,
 * `--fixup`, and forms not yet invented, because it never inspects the command
 * at all. The cost is a stricter contract: the tree must be clean relative to
 * what was verified. That is the honest meaning of "bug-check passed on this
 * code" — and oc-bug-check records `verified_tree` the same way (`git add -A`),
 * so a plain `/oc-bugcheck` run followed by an immediate commit still passes.
 *
 * One path is left out: the bug-check checkpoint itself (GATE-11). The run hashes
 * the tree and then writes it into that file, so counting the file would make
 * every PASS describe a tree that stopped existing the moment it was recorded —
 * in any repo that tracks `.checkpoints/`. `rm --cached` in the scratch index
 * drops it whether it is untracked, tracked, modified or already staged.
 */
const CHECKPOINT_REL = ".checkpoints/oc-bug-check.checkpoint.json";

function fullWorkingTree() {
  const scratch = path.join(os.tmpdir(), `opchain-idx-${process.pid}-${Date.now()}`);
  try {
    const rel = git(["rev-parse", "--git-path", "index"], repoRoot);
    const realIdx = rel && path.isAbsolute(rel) ? rel : path.join(repoRoot, rel || ".git/index");
    if (fs.existsSync(realIdx)) fs.copyFileSync(realIdx, scratch);
    const env = { GIT_INDEX_FILE: scratch }; // isolates all writes from the real index
    if (!fs.existsSync(scratch) && git(["read-tree", "HEAD"], repoRoot, env) === null) return null;
    if (git(["add", "-A", "--", "."], repoRoot, env) === null) return null;
    // `-f`: the scratch entry always matches the file `add -A` just read, but an
    // up-to-date refusal here would be a spurious deny, not a safer one.
    if (git(["rm", "--cached", "-f", "-q", "--ignore-unmatch", "--", CHECKPOINT_REL], repoRoot, env) === null) return null;
    return git(["write-tree"], repoRoot, env);
  } finally {
    try {
      fs.rmSync(scratch, { force: true });
    } catch {
      /* scratch cleanup is best-effort */
    }
  }
}

const actual = fullWorkingTree();

// RULE 0: if we cannot hash the state, we cannot claim it was verified.
if (!actual) {
  deny(
    "opchain: could not hash the working tree (unmerged index, index.lock held, or\n" +
      "git unavailable), so the recorded PASS cannot be bound to this commit. Resolve\n" +
      "the repo state and retry, or bypass with `git commit --no-verify`.",
  );
}

if (verifiedTree !== actual) {
  deny(
    "opchain: the repo has changed since oc-bug-check passed, so the PASS does not\n" +
      "cover what you are about to commit.\n\n" +
      `    verified:      ${String(verifiedTree).slice(0, 12)}\n` +
      `    working tree:  ${String(actual).slice(0, 12)}\n\n` +
      "Some tracked or untracked file differs from the state that was checked. (If\n" +
      "nothing changed, the tree was recorded wrongly — it must be the full working\n" +
      "tree, not bare `git write-tree`; see oc-bug-check § Commit gate contract.)\n" +
      "Re-run the gate so the verdict covers the current code:\n\n" +
      INVOKE,
  );
}

allow();
