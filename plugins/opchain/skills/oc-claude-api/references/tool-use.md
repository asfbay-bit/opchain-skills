# Tool Use

Schema-first tool design for the Claude API. Covers tool definitions,
`tool_choice`, strict validation, parallel calls, the deferred-load (tool
search) pattern, and error handling. Examples are Python/JSON; TypeScript and
other SDKs share the same field names.

## Schema-first tool design

Write the schema before the implementation. The description is **prescriptive
about when to call**, not just what the tool does — recent Opus models reach for
tools conservatively, and trigger conditions in the description give measurable
lift in should-call rate.

```json
{
  "name": "get_weather",
  "description": "Get current weather for a city. Call this when the user asks about current conditions, temperature, or a forecast for a named location.",
  "input_schema": {
    "type": "object",
    "properties": {
      "location": { "type": "string", "description": "City and state, e.g. San Francisco, CA" },
      "unit": { "type": "string", "enum": ["celsius", "fahrenheit"] }
    },
    "required": ["location"]
  }
}
```

- Clear, specific names (`get_current_weather` > `weather`).
- A description per property; `enum` for fixed value sets.
- Mark only truly-required params in `required`.

### Strict tool use

Set `strict: true` as a **top-level field on the tool definition** (a sibling of
`name`/`description`/`input_schema`) — **not** on `tool_choice`. Requires
`additionalProperties: false` and `required`. Guarantees `tool_use.input`
validates exactly against the schema. No beta header.

### Always parse, never string-match

Recent models (Fable 5, the 4.6/4.7/4.8 family) may escape JSON differently
(Unicode, forward slashes) in `tool_use.input`. Parse with `json.loads()` /
`JSON.parse()` — never raw-string-match the serialized input. The SDKs already
expose `block.input` as a parsed object.

## `tool_choice`

| Value | Behavior |
|---|---|
| `{"type": "auto"}` | Claude decides (default) |
| `{"type": "any"}` | Must use at least one tool |
| `{"type": "tool", "name": "..."}` | Must use the named tool |
| `{"type": "none"}` | Cannot use tools |

Add `"disable_parallel_tool_use": true` to any of these to cap at one tool per
response.

## Parallel tool calls

Parallel calls are **on by default** — one assistant message can carry multiple
`tool_use` blocks.

- Execute them concurrently.
- Return **all** `tool_result` blocks in a **single** user message. Splitting
  them across multiple user messages silently trains Claude to stop calling
  tools in parallel.
- For a failed tool, return a `tool_result` with `"is_error": true` and an
  informative message — **don't drop it**. Claude acknowledges the error and
  adapts.

```python
# All results for one parallel round go in ONE user message
messages.append({
    "role": "user",
    "content": [
        {"type": "tool_result", "tool_use_id": a.id, "content": result_a},
        {"type": "tool_result", "tool_use_id": b.id, "content": result_b, "is_error": True},
    ],
})
```

## Deferred-load (tool search)

With a large tool library, loading every schema upfront wastes context. Mark
tools `defer_loading: true` and add a tool-search tool so Claude discovers and
loads only the relevant schemas. Discovered schemas are **appended, not swapped**
— this preserves the prompt cache (see `prompt-caching.md`).

```json
{
  "tools": [
    { "type": "tool_search_tool_regex_20251119", "name": "tool_search_tool_regex" },
    { "name": "get_weather", "defer_loading": true, "input_schema": { ... } },
    { "name": "search_flights", "defer_loading": true, "input_schema": { ... } }
  ]
}
```

Variants: `tool_search_tool_regex_20251119` (regex) and
`tool_search_tool_bm25_20251119` (BM25).

**Never defer everything.** The search tool itself must not have
`defer_loading: true`, and at least one real tool must stay non-deferred — or the
API returns `400 All tools have defer_loading set`.

## Tool runner vs manual loop

- **Tool runner (recommended).** `client.beta.messages.tool_runner(...)` /
  `toolRunner(...)` drives the call → execute → feed-back loop and stops when
  Claude has no more tool calls. Schemas generate from function signatures
  (Python `@beta_tool`), Zod (`betaZodTool`), etc.
- **Manual loop.** Use when you need human-in-the-loop approval, custom logging,
  or conditional execution. Loop until `stop_reason == "end_turn"`; always append
  the full `response.content` (preserving `tool_use` blocks); match each
  `tool_result` to its `tool_use_id`.

## Error / stop-reason handling

Check `stop_reason` before reading content:

- `tool_use` — execute the tool(s), continue.
- `pause_turn` — server-side tool loop hit its iteration limit; re-send the
  user message + assistant response to resume (no extra "Continue." message —
  the trailing `server_tool_use` block signals resume). Cap continuations to
  avoid infinite loops.
- `refusal` — surface it; don't retry the same prompt. On Fable 5, guard before
  reading `content[0]` (a refused turn may have empty content).
- `max_tokens` — raise `max_tokens` or stream.

**Server-tool errors don't raise** — web search / web fetch errors come back as
HTTP 200 with a result block whose `content` is an error object
(`{error_code: ...}`). For web search, success `content` is a *list*, error
`content` is an *object* — branch before indexing.
