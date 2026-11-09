# Prompt Caching

Apps built through `oc-claude-api` ship caching from the first commit. This doc
covers `cache_control` usage, what to cache, TTL, hit-rate measurement, and the
cost math.

## The one invariant

**Prompt caching is a prefix match. Any byte change anywhere in the prefix
invalidates everything after it.** The cache key is the exact rendered bytes up
to each `cache_control` breakpoint. Render order is `tools` → `system` →
`messages`. Design the prompt-assembly path so stable content physically
precedes volatile content, and most caching works for free.

## What to cache

| Region | Cache it? | Notes |
|---|---|---|
| Tool definitions | ✅ | Sort by name, freeze the set. Adding/removing/reordering a tool invalidates everything. |
| System prompt | ✅ | Must be frozen — no `datetime.now()`, no per-user IDs, no conditional sections. |
| Large shared context (retrieved docs, few-shot, big preamble) | ✅ | Breakpoint at the end of the *shared* span, before the varying question. |
| The varying question / per-request input | ❌ | Differs every request — leave it after the last breakpoint, unmarked. |
| Multi-turn history | ✅ | Breakpoint on the last block of the most-recent turn; hits accrue as the conversation grows. |

## Syntax

```python
# Manual placement on a system block
system=[{
    "type": "text",
    "text": LARGE_SHARED_PROMPT,
    "cache_control": {"type": "ephemeral"},        # 5-minute TTL (default)
}]

# 1-hour TTL for bursty traffic
"cache_control": {"type": "ephemeral", "ttl": "1h"}

# Automatic — caches the last cacheable block, simplest when you don't need
# fine-grained placement
client.messages.create(..., cache_control={"type": "ephemeral"})
```

- Max **4** breakpoints per request.
- Goes on any content block: system text, tool definitions, message `text` /
  `image` / `tool_use` / `tool_result` / `document` blocks.
- **Minimum cacheable prefix is model-dependent.** Opus 4.8/4.7/4.6, Haiku 4.5:
  4096 tokens. Fable 5, Sonnet 4.6: 2048. Shorter prefixes silently don't cache
  (`cache_creation_input_tokens: 0`, no error).

## Measuring hit rate

The response `usage` object reports cache activity:

| Field | Meaning |
|---|---|
| `cache_creation_input_tokens` | Tokens written this request (~1.25× write premium) |
| `cache_read_input_tokens` | Tokens served from cache (~0.1× price) |
| `input_tokens` | Uncached remainder, full price |

Total prompt size = the sum of all three. Hit rate for the `cache-audit`
target:

```
hit_rate = cache_read / (cache_read + cache_creation + input)   # target ≥ 0.60
```

If `cache_read_input_tokens` is **zero** across repeated identical-prefix
requests, a silent invalidator is at work. Diff the rendered prompt bytes
between two requests to find it.

### Silent invalidators (grep for these in prompt-assembly code)

| Pattern | Why it breaks caching |
|---|---|
| `datetime.now()` / `Date.now()` in system prompt | Prefix changes every request |
| `uuid4()` / request IDs early in content | Every request is unique |
| `json.dumps(d)` without `sort_keys=True` | Non-deterministic serialization |
| f-string with session/user ID in system prompt | Per-user prefix, no cross-user sharing |
| `if flag: system += ...` | Each flag combination is a distinct prefix |
| `tools=build_tools(user)` varying per user | Tools render at position 0; nothing caches |

Fix by moving the dynamic piece after the last breakpoint, making it
deterministic, or deleting it if it isn't load-bearing.

## Cost math (break-even)

Cache reads cost ~0.1× base input price. Writes cost **1.25× for 5-minute TTL,
2× for 1-hour TTL**.

- **5-minute TTL:** two requests break even (1.25× + 0.1× = 1.35× vs 2×
  uncached).
- **1-hour TTL:** needs three requests (2× + 0.2× = 2.2× vs 3× uncached). The
  doubled write cost buys cache survival across idle gaps in bursty traffic.

Don't add `cache_control` to a prompt whose first ~1K tokens differ every
request — it pays the write premium with zero reads. Leave caching off there.

## Architectural notes

- **Keep the system prompt frozen.** Inject "current date / mode / user name"
  later in `messages` (as a `{"role": "system", ...}` message on Opus 4.8, or as
  user-turn text elsewhere) — a message at turn 5 invalidates nothing before it.
- **Don't change tools or model mid-conversation.** Both force a full rebuild.
  For dynamic tool sets use tool search (it appends schemas, preserving the
  cache); for a cheaper sub-task spawn a subagent rather than swapping models.
- **Fork operations must copy the parent's exact `system`/`tools`/`model`**, then
  append fork-specific content — otherwise the fork misses the parent's cache.
