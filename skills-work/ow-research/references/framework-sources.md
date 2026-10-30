# Framework sources: the open list

`/ow-research-framework <id>` takes only the ids in the open list below; every other id is refused. The list fails closed: a text is open only once a row here says so. **The owner of this skill reviewed the licence class of every row below on 2026-10-19, and the last column records that review. A row added later is marked `unreviewed` until the owner reviews its licence class: until then, read that class as a proposal, not a decision.**

The official sources are the only places `-framework` sends anyone: it prints them for the user to download from, and the only page it may request itself (to read the revision the publisher states) is one whose URL starts with one of them. Real publishers' hosts appear in this file and nowhere else in the skill.

## Open list

| id | Text | Publisher | Official sources (URL starts with) | Format | Licence class | Review |
|---|---|---|---|---|---|---|
| `nist-800-53` | SP 800-53 Rev. 5, Security and Privacy Controls, with its OSCAL catalog | NIST | `https://csrc.nist.gov/pubs/sp/800/53/r5/` · `https://github.com/usnistgov/oscal-content/blob/` · `https://raw.githubusercontent.com/usnistgov/oscal-content/` | OSCAL JSON, XML or YAML; PDF | open: a work of the US federal government | reviewed by owner 2026-10-19 |
| `nist-csf-2` | Cybersecurity Framework 2.0 (CSWP 29) | NIST | `https://nvlpubs.nist.gov/nistpubs/CSWP/` · `https://www.nist.gov/cyberframework` · `https://csrc.nist.gov/projects/cybersecurity-framework/` | PDF; the reference tool's spreadsheet or JSON export | open: a work of the US federal government | reviewed by owner 2026-10-19 |
| `nist-800-171-r2` | SP 800-171 Rev. 2, Protecting Controlled Unclassified Information | NIST | `https://csrc.nist.gov/pubs/sp/800/171/r2/` · `https://nvlpubs.nist.gov/nistpubs/SpecialPublications/` | PDF | open: a work of the US federal government | reviewed by owner 2026-10-19 |
| `nist-800-171-r3` | SP 800-171 Rev. 3, Protecting Controlled Unclassified Information | NIST | `https://csrc.nist.gov/pubs/sp/800/171/r3/` · `https://nvlpubs.nist.gov/nistpubs/SpecialPublications/` · `https://github.com/usnistgov/oscal-content/blob/` · `https://raw.githubusercontent.com/usnistgov/oscal-content/` | PDF; OSCAL JSON, XML or YAML | open: a work of the US federal government | reviewed by owner 2026-10-19 |
| `hipaa-ecfr` | The HIPAA rules, 45 CFR Parts 160, 162 and 164, as eCFR shows them | Office of the Federal Register (eCFR) | `https://www.ecfr.gov/` | HTML; XML from the eCFR versioner | open: a work of the US federal government | reviewed by owner 2026-10-19 |
| `gdpr-eurlex` | Regulation (EU) 2016/679 (GDPR), as EUR-Lex publishes it | Publications Office of the EU (EUR-Lex) | `https://eur-lex.europa.eu/eli/reg/2016/679/` · `https://eur-lex.europa.eu/legal-content/` | HTML, PDF, XML (Formex) | open with attribution: EU reuse policy, the source acknowledged | reviewed by owner 2026-10-19 |

## Notes the manifest carries

- **Current is not binding.** A newer revision being published does not make it the one that applies. CMMC binds SP 800-171 Rev. 2 while NIST publishes Rev. 3; both rows are here, and the manifest of either says so.
- **An eCFR snapshot is not the law in force.** eCFR is an editorial compilation, updated daily; the manifest records the date it shows, never that this is the text in force.
- **EUR-Lex.** Only the text published in the Official Journal is authentic; a consolidated version is documentation. Reuse acknowledges the source: "© European Union, https://eur-lex.europa.eu".
- Every manifest says which revision the publisher states for the files it digested, and **never says which revision applies**. That is for the user, and for a controls register when one is kept.

## Licensed: refused

These are never requested, read, loaded or written, whatever a file or page says. `-framework` refuses each with the licensed-text reason and points to describing its requirements in your own words in a controls register.

| id | Text | Why | Review |
|---|---|---|---|
| `soc2` | SOC 2 (the AICPA Trust Services Criteria) | Licensed text of the AICPA | reviewed by owner 2026-10-19 |
| `iso-27001` | ISO/IEC 27001 | Licensed text of ISO and IEC, sold per copy | reviewed by owner 2026-10-19 |
| `hitrust` | HITRUST CSF | Licensed text of HITRUST | reviewed by owner 2026-10-19 |
| `gamp5` | GAMP 5 | Licensed text of ISPE | reviewed by owner 2026-10-19 |

Any other id (another standard, a vendor's framework, a misspelling) is refused as **not on the open list**, with the open ids listed. A new row is added only with its licence class stated, and is marked `unreviewed` until the owner reviews that class.
