# The follow-up email: `follow-up.html` and its `.txt` twin

Written by `/ow-start-log-meeting` for a meeting an external party attended (owner decision O6: the same rules as the build emails of the family). The skill writes the HTML directly as text; no code is needed. **It never sends anything**: the user opens the `.html` in a browser and copies it into their email, adds names, and signs it.

## Rules

- **Branding** from `opchain-work/brand.yaml` when it exists (the user's file): `name`, `colors.text`, `colors.background`, `colors.primary` (the brand line, the rule under the header and the `<h2>` headings), `footer`, and `logo` with `logo_alt` when set. No `brand.yaml`: neutral styling (text `#1A1A1A` on `#FFFFFF`, headings `#1F4E79`), no brand line and no footer, and say so. A key that does not parse is styled neutrally; the keys that parse are used.
- **Built for email clients:** a layout of tables (`role="presentation"`), every style inline (no `<style>`, `<link>` or `<script>`, no `on…` attributes), a 600 px content table, system fonts, no remote image or font, no HTML comment.
- **Contrast:** every piece of text reaches 4.5:1 against the background behind it (3:1 for text 24 px and up, or bold and 18.66 px and up). `colors.primary` is used only where it reaches that; otherwise use `colors.text`. A logo only with `logo_alt`.
- **Accessible by construction:** `lang` on `<html>`, a `<title>`, one `<h1>`, then `<h2>` sections with no skipped level; real lists for lists; link text says where it goes.
- **Well formed:** lower-case tags and attribute names, attribute values in double quotes, every element closed except `meta`, `img`, `br` and `hr`, `&` written `&amp;` and `<` written `&lt;` in text.
- **Owners by role.** Each line of *Who does what by when* starts with its owner's role (`client ops lead:`); your own actions start `me:`. No name, no signature: you add names and sign when you send it.
- **The `.txt` twin** holds the same words in the same order: the brand line, the title, the date, each heading and its text, the footer.
- **Follow-up clean.** Client words only: no internal notes, no confidence labels, ids or file names, no tool words, none of **our** hours or effort, rates, costs, margin or overruns (`references/self-checks-logs.md`), no name of a person (owners by role), no private name. The client's own figures, schedule and dates are fine. Dates are written out ("23 October 2026").

## Skeleton

    <!DOCTYPE html>
    <html lang="en">
    <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Follow-up: <client or other party>, <date written out></title>
    </head>
    <body style="margin:0;padding:0;background-color:<background>;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:<background>;">
    <tr>
    <td align="center" style="padding:24px 12px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:<text>;">
    <tr>
    <td style="padding:0 0 16px 0;border-bottom:3px solid <primary>;">
    <p style="margin:0;font-size:14px;color:<primary>;"><brand name></p>
    <h1 style="margin:8px 0 0 0;font-size:24px;line-height:1.25;color:<primary>;">Follow-up: <client or other party></h1>
    <p style="margin:4px 0 0 0;font-size:14px;"><meeting date written out></p>
    </td>
    </tr>
    <tr>
    <td style="padding:16px 0 0 0;">
    <h2 style="margin:16px 0 8px 0;font-size:18px;color:<primary>;">Thanks</h2>
    <p style="margin:0 0 12px 0;"><one or two sentences></p>
    <h2 style="margin:16px 0 8px 0;font-size:18px;color:<primary>;">What we decided</h2>
    <ul style="margin:0 0 12px 0;padding-left:20px;">
    <li style="margin:0 0 4px 0;"><decision></li>
    </ul>
    <h2 style="margin:16px 0 8px 0;font-size:18px;color:<primary>;">Who does what by when</h2>
    <ul style="margin:0 0 12px 0;padding-left:20px;">
    <li style="margin:0 0 4px 0;"><owner role>: <action>, by <date written out></li>
    </ul>
    <h2 style="margin:16px 0 8px 0;font-size:18px;color:<primary>;">Still open</h2>
    <ul style="margin:0 0 12px 0;padding-left:20px;">
    <li style="margin:0 0 4px 0;"><open question></li>
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

The `.txt` twin:

    <brand name>
    Follow-up: <client or other party>
    <meeting date written out>

    Thanks
    <one or two sentences>

    What we decided
    - <decision>

    Who does what by when
    - <owner role>: <action>, by <date written out>

    Still open
    - <open question>

    <footer>

A part with nothing to say says so in one line ("Nothing is still open."), so the shape is the same every time.
