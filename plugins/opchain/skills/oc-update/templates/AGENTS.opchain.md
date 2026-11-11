<!-- opchain:agents-section -->
## opchain

This repository uses opchain development skills. These rules apply to every
coding agent working here (Codex, Cursor, Copilot, Claude Code, and others) and
to people.

opchain manages the text between these markers and rewrites it on update, so
put your own guidance outside them. To stop opchain writing this section,
replace it with an HTML comment, on a line of its own, that reads
`opchain:agents-section off`. This section names no version on purpose:
`.opchain-install.json` records the installed release (a plugin-only install
reports it through the plugin manager).

### Start Every Task Here

1. Read `.checkpoints/` first. Each `<skill>.checkpoint.json` records the last
   phase, status and `next_actions`. Resume from there instead of starting over,
   and do not hand-edit another skill's checkpoint.
2. Pick the opchain skill that matches the task and follow its `SKILL.md`.
   Skills live in `.agents/skills/oc-*/` (Codex and other agents) or
   `.claude/skills/oc-*/` (Claude Code), or come from the opchain plugin.
   Without slash commands, name the step in words, for example "review this
   change with the oc-code-auditor skill". In Claude Code the `/oc-*` verbs
   are aliases for the same steps.

### Vendored Skills Are Read-Only

- Never hand-edit vendored `oc-*` skills under `.claude/skills/`,
  `.agents/skills/` or `.codex/skills/`. `.opchain-install.json` tracks them
  and the next update replaces them.
- Change them only by running the opchain updater (the `oc-update` skill, or
  `/oc-update` in Claude Code), and commit that update in its own pull request.
<!-- /opchain:agents-section -->
