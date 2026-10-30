# The branded email: one `.html` and its `.txt` twin

Used by `-update` (`updates/<date>.html`), `-demo --record` (`demos/M<n>-summary.html`) and `-change` (`changes/CO-nn.html`). The skill writes the HTML directly as text; no code is needed. **It never sends anything**: the user opens the `.html` in a browser and copies it into their email, or attaches it. There is no hosted copy.

## Rules

- **Branding** from `opchain-work/brand.yaml` (the same file the Build Plan export uses): `name`, `colors.text`, `colors.background`, `colors.primary` (headings and the rule under the header), `footer`, and `logo` with `logo_alt` when set. No `brand.yaml`: neutral styling (text `#1A1A1A` on `#FFFFFF`, headings `#1F4E79`), and say so.
- **Built for email clients:** a layout of tables (`role="presentation"`), every style inline (no `<style>`, `<link>` or `<script>`, no `on…` attributes), a 600 px content table, system fonts, no remote image or font.
- **Contrast:** every piece of text reaches 4.5:1 between the colour it is drawn in (its own `color`, else the nearest enclosing one, such as the 600 px table's `colors.text`) and the background behind it (the nearest enclosing `background-color`, else the body's); 3:1 for text 24 px and up, or bold and 18.66 px and up. `#rgb`, `#rrggbb` and `rgb()` are measured alike. `colors.primary` is used for the brand line and the `<h2>` headings only when it reaches 4.5:1; otherwise those use `colors.text`. A logo is shown only with `logo_alt`; with no `logo_alt`, leave the logo out.
- **Accessible by construction:** `lang` on `<html>`, a `<title>`, one `<h1>`, then `<h2>` sections with no skipped level; real lists for lists; `alt` text on every image; colour is never the only signal (write "4 of 7 passing", not just a green mark); link text says where it goes (never a bare address, "here" or "click here").
- **Well formed:** lower-case tags and attribute names, every attribute value in double quotes, every element closed except `meta`, `img`, `br` and `hr`, `&` written `&amp;` and `<` written `&lt;` in text.
- **The `.txt` twin** holds the same words in the same order: the brand line, the title, the date, each heading and its text, the footer. A link is written `text (address)` in both. Nothing is in one and not the other.
- **Client words only.** No confidence labels, no fact or evidence ids, no file names, no commit ids, no tool words (checkpoint, evaluator, rubric, gate, sprint, score), no hours, rates, margin, unit prices or modifiers (protocol §12; SKILL.md self-checks). Dates are written out ("20 November 2026").

## Skeleton

    <!DOCTYPE html>
    <html lang="en">
    <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><Title>: <client>, <date written out></title>
    </head>
    <body style="margin:0;padding:0;background-color:<background>;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:<background>;">
    <tr>
    <td align="center" style="padding:24px 12px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:<text>;">
    <tr>
    <td style="padding:0 0 16px 0;border-bottom:3px solid <primary>;">
    <p style="margin:0;font-size:14px;color:<primary>;"><brand name></p>
    <h1 style="margin:8px 0 0 0;font-size:24px;line-height:1.25;color:<primary>;"><Title>: <client></h1>
    <p style="margin:4px 0 0 0;font-size:14px;"><date written out></p>
    </td>
    </tr>
    <tr>
    <td style="padding:16px 0 0 0;">
    <h2 style="margin:16px 0 8px 0;font-size:18px;color:<primary>;"><Section></h2>
    <p style="margin:0 0 12px 0;"><text></p>
    <ul style="margin:0 0 12px 0;padding-left:20px;">
    <li style="margin:0 0 4px 0;"><item></li>
    </ul>
    </td>
    </tr>
    <tr>
    <td style="padding:24px 0 0 0;border-top:1px solid #CCCCCC;font-size:12px;">
    <p style="margin:0;"><footer></p>
    </td>
    </tr>
    </table>
    </td>
    </tr>
    </table>
    </body>
    </html>

With a logo, the header cell starts with `<img src="<logo, relative to the .html>" alt="<logo_alt>" width="160" style="display:block;border:0;">`. A pasted email may not carry a local image; the brand name line stays either way.

The `.txt` twin:

    <brand name>
    <Title>: <client>
    <date written out>

    <Section>
    <text>
    - <item>

    <footer>

## The three emails

| Email | Title | Sections, in order |
|---|---|---|
| `updates/<date>.html` | Weekly update | This week · Milestone progress · Next week · Needs from you · Changes · Risks |
| `demos/M<n>-summary.html` | Milestone <n> demo | What we showed · What works · Not yet · What happens next · Changes to price |
| `changes/CO-nn.html` | Change order CO-nn | What changes · Why · Price · Schedule · Acceptance checks it adds · Approval |

A section with nothing to say says so in one line ("No new risks this week."), so the client sees the same shape every time.
