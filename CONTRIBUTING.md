# Contributing to opchain

Thanks for picking up a skill. Here's how contributions flow.

## This repo is a mirror

This GitHub repo is a **force-push snapshot** of `skills/` from a private
upstream monorepo. The site, build system, and internal tooling live
upstream — only the skill product is published here.

Two consequences:

1. Long-lived branches in this repo will be wiped on the next sync. Don't
   build off `main` here expecting your commits to survive.
2. PRs against this repo can't merge directly — they need a maintainer to
   port the change to the upstream repo. The change then propagates back
   here on the next sync (usually within minutes of upstream merge).

That sounds annoying. In practice it's fine for the kind of change a skill
usually needs (a sentence in a `SKILL.md`, an extra example, a clearer
trigger condition).

## Issues

File them here. We watch this repo's issues and use them to plan upstream
work. Use the provided templates for bugs and feature requests.

## Pull requests

Yes, please.

1. Fork this repo
2. Branch off your fork's `main`
3. Make the change
4. Open a PR against `main` of this repo
5. We'll review, port it upstream, and it'll land back here on the next
   mirror sync

If a PR sits for more than a week without comment, leave a `bump` comment
— it may have fallen off the queue.

### Good PRs look like

- A focused change to one `skills/<name>/SKILL.md` or its supporting files
- Clear rationale in the PR description (what's broken, what you're
  fixing, the trigger that surfaces it)
- A concrete example of the new behavior
- No mass renames, no formatting-only diffs across many files

### Things we won't merge without prior discussion

- Renaming a skill (skill names are public surface — renames break user
  installs)
- New top-level skills — open an issue first so we can agree on scope
- Removing the checkpoint protocol from a skill
- Changes that depend on upstream site behavior we haven't shipped

## Code of conduct

Be decent. Skill design is opinionated work; disagreement is fine,
condescension isn't.

## Questions

Open an issue with the `question` label, or visit https://opchain.dev.
