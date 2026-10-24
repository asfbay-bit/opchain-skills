// ow-tools PDF page template. Compiled with `typst compile --pdf-standard ua-1`.
// ow-tools writes brand.typ (escaped values from brand.yaml) and body.typ
// (pandoc's Typst output) beside this file in a private temp folder per export.
#import "brand.typ": brand

// pandoc's Typst writer emits #divider() / #horizontalRule for `---`.
#let horizontalRule = line(start: (25%, 0%), end: (75%, 0%), stroke: 0.5pt + brand.rule)
#let divider = if "divider" in std { divider } else { horizontalRule }

#set document(title: brand.title, author: brand.author)
#set text(font: brand.body-fonts, size: 11pt, fill: brand.text, lang: brand.lang, region: brand.region)
#set par(leading: 0.7em, spacing: 1.1em)
#set page(
  paper: brand.paper,
  margin: (x: 2.3cm, top: 2.8cm, bottom: 2.5cm),
  fill: brand.background,
  header: context {
    set text(size: 9pt)
    grid(
      columns: (1fr, auto),
      align: (left + horizon, right + horizon),
      if brand.logo != none { image(brand.logo, height: 0.9cm, alt: brand.logo-alt) } else { brand.name },
      if brand.banner != none { strong(brand.banner) } else { [] },
    )
  },
  footer: context {
    set text(size: 9pt)
    grid(
      columns: (1fr, auto),
      brand.footer,
      [Page #counter(page).display() of #counter(page).final().first()],
    )
  },
)

#show heading: set text(font: brand.heading-fonts, weight: "bold")
#show heading: set block(above: 1.4em, below: 0.7em)
#show heading.where(level: 1): set text(size: 20pt, fill: brand.primary)
#show heading.where(level: 2): set text(size: 16pt, fill: brand.primary)
#show heading.where(level: 3): set text(size: 14pt, fill: brand.primary)
#show heading.where(level: 4): set text(size: 12pt, fill: brand.text)

#set table(
  inset: 6pt,
  stroke: 0.5pt + brand.rule,
  fill: (x, y) => if y == 0 { brand.accent },
)
#show table.cell.where(y: 0): set text(fill: brand.header-text, weight: "bold")

// Links are underlined as well as coloured: colour is never the only signal.
#show link: it => underline(text(fill: brand.link, it))

#include "body.typ"
