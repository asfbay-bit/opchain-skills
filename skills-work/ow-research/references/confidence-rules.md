# Confidence rules

Each finding's level is set from what is recorded about its sources, never from how convincing a page sounds. Record the inputs first, in `sources.md` and the finding's block (`references/research-files-schema.md` §3–4); then read the level off the table.

## 1. The inputs

- **Class.** `primary` only when the source's host is on `question.md` `owners` (the hosts the user confirmed for the vendor and the official publishers), and all three of these hold:
  - the host is an exact entry, or the page sits under an entry's path (`github.com/<vendor>/`), or the entry is written `*.<host>` to take in its subdomains: a subdomain of an entry is not on the list by itself;
  - the page is not one users write: never a community, forum, partner or discussion site (`community.`, `forum.`, `partners.`, `discuss.`), a forum path on the owner's site, or an issue or discussion on a shared platform;
  - its standing is one a primary source has: `vendor reference`, `vendor page`, `official publisher`, `standards body` or `government statistics`.

  Everything else is `secondary`, whatever it calls itself: a page that claims to be official, on a host not on the list, is secondary, and so is a forum post on the vendor's own domain.
- **Basis.** `states`: the source says the claim in so many words. `implies`: the claim follows from what it says, one step away. `inferred`: you put it together across sources, or from something none of them says.
- **Standing.** What kind of publisher it is: `vendor reference`, `vendor page`, `official publisher`, `standards body`, `trade publication`, `industry association`, `government statistics` and `news` are of known standing; `blog`, `forum`, `summary site` and `directory` are of unclear standing. A user file takes the standing of what it is, as the user says: a forum thread saved into `inbox/` is `forum`, a vendor's saved reference page is `vendor reference`. "User file" is how it arrived (`opened: user file`), never a standing, so saved pages of unclear standing stay at MEDIUM at most, however many agree.
- **Independent publishers.** Two sources are independent only when their publishers differ and their sites differ (`blog.example.org` and `news.example.org` are one site). Repeating a claim on more pages of one publisher adds nothing.
- **Conflicts.** A source that says the opposite is listed in the finding's `conflicts` and under *Conflicts*, with what each side says.

## 2. The table

| Sources behind the claim | Basis | Against it | Level |
|---|---|---|---|
| A primary source | states | nothing, or only secondaries (each listed under *Conflicts*) | **HIGH** |
| Two or more secondaries of known standing from independent publishers | states | no primary | **HIGH** |
| A primary source | implies | nothing, or only secondaries | **MEDIUM** |
| One secondary of known standing (or several from one publisher), with or without pages of unclear standing beside it | states | nothing | **MEDIUM** |
| Secondaries of unclear standing from two or more independent publishers, however many agree | states | nothing | **MEDIUM** |
| A secondary of unclear standing, alone or repeated by one publisher | states | nothing | **LOW** |
| Secondaries only | implies | nothing | **LOW** |
| Any | inferred | anything | **LOW**, marked inferred |
| Anything a primary source contradicts, with no primary behind it | any | a primary | **LOW**; the primary's own version is the finding to record |
| Sources of equal standing (class and standing) that disagree: a primary against a primary, or secondaries against secondaries with no primary on either side | any | equal standing | **UNKNOWN** |

A secondary against a primary never lowers the primary's finding: the level stays where the primary puts it, and the clash goes under *Conflicts* so the reader can see it. A forum post cannot outvote the vendor's own reference, and the vendor's reference cannot hide the forum post. In the same way, a page of unclear standing against a secondary of known standing never lowers it: the clash goes under *Conflicts*. Equal standing means the same class and the same kind of standing.

**Corroboration is capped.** Pages of unclear standing (forums, blogs, summary sites, directories: pages anyone can write, or that only repeat others) raise a fact to MEDIUM at most, however many agree, and never count toward the two of known standing that HIGH needs. Two sites cost their owner nothing, so repetition alone never makes a fact HIGH.

## 3. Rules by kind

| Kind | Rule |
|---|---|
| Technical feasibility | An API or product capability is HIGH only from the vendor's own reference (a primary of standing `vendor reference`); secondaries alone are at most MEDIUM. Record the documentation's version or "last updated" date as `stated date` |
| Market and competitors | Prices are recorded "as published on <retrieved date>"; nothing behind a login. A price is a fact about the publisher's page, never advice |
| Regulations and frameworks | Only official publishers on `owners` are primary. A page from a summary site is secondary and LOW, however clear it is; without a primary, a regulation finding is at most LOW. Whole texts go through `-framework` |
| Client and industry background | Describes how firms like the client usually work. Nothing about the client itself unless the user approved a by-name search, and then only what that page states |

## 4. Watching a finding

Mark `watch: yes` when the answer depends on something the publisher may change (a rate limit, a plan's features, a price, a rule's amendment date), and copy the exact passage that says it as the `watched passage` (25 words or fewer, one of that source's quotes). The user can open the page now and then and compare it; ow-currency, which would compare it on a schedule, is not in this release.
