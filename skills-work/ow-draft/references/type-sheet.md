# Type module: sheet (`sheet/`)

Cost comparisons, schedules, simple models.

## Structure rules

- **One CSV per sheet** in `sheet/`, each with a header row, and **each named by a `## Sheet: <name>` section in `sheet/model.md`** (`<name>` is the file name without `.csv`). A CSV with no section never ships.
- **Every computed cell is a formula in `model.md`** (`| Cell | Formula | Format |`) **and empty in its CSV**; never a typed result.
- **Only the functions the export allows**: ABS, AND, AVERAGE, COUNT, COUNTA, COUNTIF, IF, IFERROR, MAX, MIN, NOT, OR, ROUND, ROUNDDOWN, ROUNDUP, SUM, SUMIF, SUMPRODUCT. Nothing that reaches outside the workbook or builds a reference from text.
- **Every input cell is cited** in `sheet/sources.csv`: `cell,item,title,publisher,date,link`, one row per input cell (`Costs!B2`), `item` its `E-nn`; never a level. `sources.csv` is the workbook's Sources sheet and needs no `## Sheet:` section.
- **No internal comment in `model.md`**: no `ow:internal` section and no comment at all; the sheet folder ships whole.
- A document that quotes a sheet's computed total quotes the `calc` output recorded in `evidence.md`, never a cell.

## The client form

The sheet folder is client-ready: `-freeze` copies `sheet/` to `candidates/C-n/<slug>/` as it is, and digests the folder.

## Export

`ow-tools export drafts/<ws>/DR-nn-<slug>/candidates/C-n/<slug>/ --formats xlsx --out drafts/<ws>/DR-nn-<slug>/export/C-n/`; the CSVs go along as they are.
