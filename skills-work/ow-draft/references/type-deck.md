# Type module: deck (`deck.md`)

Quarterly reviews, proposals presented live, workshop decks.

## Structure rules

- One `# <title>`, then **one slide per `##`**; **one message per slide, in its title**.
- **Speaker notes** go in a `::: notes` … `:::` block under the slide they belong to; every slide has notes.
- **At most 40 words on a slide** (outside its notes), at most one image or table per slide, no `###` or deeper, no `---`, `***` or `___` line, nothing between the title and the first slide. These are the ow-tools deck rules; the preflight refuses the rest.
- Every factual claim on a slide or in its notes carries an `[E-nn]` marker.

## The client form (`candidates/C-n/<slug>.md`, written by `-freeze`)

- Each `[E-nn]` becomes a numbered note `[1]`, `[2]`, … in order of first use.
- **A last slide, `## Sources`**, lists each note once in the document module's form (title, publisher, date written out; never a level), with notes of its own saying where the sources are. So a deck of five content slides exports as six slides.

## Export

`ow-tools export drafts/<ws>/DR-nn-<slug>/candidates/C-n/<slug>.md --formats pptx --out drafts/<ws>/DR-nn-<slug>/export/C-n/`, adding `pdf,docx` when the user asks for a handout. Without pandoc (exit 3 naming it): the deck stays Markdown, and the screen says no PowerPoint file was made here.
