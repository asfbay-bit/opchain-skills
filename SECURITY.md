# Security Policy

This repository holds the opchain skills, the Claude Code plugin (including its hooks, which run on your machine), and the MCP server code.

**Report a vulnerability:** use [GitHub private vulnerability reporting on this repo](https://github.com/asfbay-bit/opchain-skills/security/advisories/new), or email **security@opchain.dev**.

For issues in the opchain.dev website or its hosted APIs, report on [ainatx/opchain](https://github.com/ainatx/opchain/security/advisories/new) instead — but either channel works; we'll route it.

## Supported versions

The latest released skill catalog (currently 1.8.x). Older bundles are not patched — upgrade to the current release.

## What to expect

- Acknowledgement within **3 business days**.
- Critical issues patched within **7 days**; high within **30** (policy: <https://opchain.dev/security>).
- Credit in the GHSA advisory unless you ask otherwise.

## Safe harbor

Good-faith research is welcome. Avoid privacy violations, data destruction, and service degradation, and we will not pursue legal action over your research or report.

## What we care most about

- The plugin hooks (`plugins/opchain/hooks/*.cjs`) — they run with user permissions on contributor machines. They are designed to be zero-dependency, egress-free, and fail-closed; anything that breaks those properties is a serious report.
- Prompt-injection vectors in skill content that could cause an agent to take unintended actions.
- The MCP server (`mcp/`, hosted at `opchain.dev/mcp`).
