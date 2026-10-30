# Type module: document (`draft.md`)

Reports, assessments, recommendations, proposals and RFP responses, one-pagers, case studies, blog posts, site copy, policies, SOPs, plans and memos.

## Structure rules

- **One H1** (`# <title>`), then `##` sections, no level skipped.
- **The key message comes first**: stated in the first section's first lines, as the brief words it.
- **Tables have a header row**; **every image has alt text** and is a local file; **link text says where it goes** (never "here", "click here" or "read more", never a bare address), and every link is `https:`.
- Length within the brief's, ±10%.
- No raw HTML, no script, no MDX or JSX line, no front matter of its own.

## The client form (`candidates/C-n/<slug>.md`, written by `-freeze`)

- The ow- header kept (ow-tools strips it), the internal section removed.
- **Each `[E-nn]` becomes a numbered note** `[1]`, `[2]`, … in order of first use; one number per item.
- A `## Sources` section at the end lists each note once: `<n>. [<title>](<the source's https link>), <publisher>, <date written out>.` (a finding's publisher is its link's site; a file's is the file's owner, such as "the client's order sheet"; with no link: `<n>. <title>, <publisher>, <date written out>.`). **Never a level, an E-nn or a quote from the record** (protocol §12).

## Export

`ow-tools export drafts/<ws>/DR-nn-<slug>/candidates/C-n/<slug>.md --out drafts/<ws>/DR-nn-<slug>/export/C-n/` (PDF and Word).
