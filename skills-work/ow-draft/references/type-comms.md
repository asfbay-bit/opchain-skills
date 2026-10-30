# Type module: comms (`comms.md`): an email, a post or a newsletter

Announcements and emails a client sends to their own people, newsletters, social posts.

## Structure rules

- **Email**: `# <subject>`, then a `Preview: <one line>` line, the body, and a **call to action** in its own last section (`## What to do`), saying what the reader does and by when.
- **Post**: the text only, within the **`limit`** (characters) the brief or the destination's `handoffs.yaml` `drafts.<key>.limit` gives; the brief's wins. No markers in the post itself: its sources stay in `evidence.md`, and every fact in it still has an item.
- **Newsletter**: `##` sections, each with one message; links with real link text, `https:` only.
- No raw HTML, script, event handler or form in the Markdown.

## The client form (`candidates/C-n/<slug>.md`, written by `-freeze`)

- **Email**: markers removed; when the email states a fact, a short last line `Sources: <title>, <publisher>, <date written out>; …` (never a level).
- **Post**: markers removed, nothing added.
- **Newsletter**: the document module's numbered notes and `## Sources` section.

## Export (written by `-deliver`, from the client form)

- **Email**: `export/C-n/<slug>.html` and `export/C-n/<slug>.txt`, written by this skill from the signed-off client form, its words unchanged (a difference is a new candidate). The HTML holds the text as paragraphs and links only (no entity-encoded character in a link, every `href` `https:`): **no script, no event handler (`on…=`), no form, no `<iframe>`, no style that hides text, every image with alt text, every link `https:` with real link text, text with enough contrast**. Links come only from items' sources or the brief.
- **Post**: `export/C-n/<slug>.txt` and `export/C-n/<slug>.md`, the client form's words, unchanged.
- **Newsletter**: `ow-tools export` (PDF and Word) when asked, plus `export/C-n/<slug>.md` and `export/C-n/<slug>.txt`, the client form's words, unchanged. A difference from the signed-off client form is a new candidate.
