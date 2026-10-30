# The contract calendar

Two clauses (deemed acceptance and the delivery backstop), the cannot-reproduce window and the readiness notice count **business days on the contract's calendar**: weekdays, except US federal holidays on the day they are observed. Fix bounds and session scheduling count on `profile.md`'s calendar instead (weekends and the holidays it lists).

## 1. Which calendar a clause names

The frozen clause in `uat.yaml` carries a `calendar` value, copied unchanged from `contract-inputs.md`.

| The clause says | Calendar |
|---|---|
| `us-federal`, `US federal`, `United States federal`, `weekdays except US federal holidays` (any case) | `us-federal` |
| anything else, or nothing | **not supported** (owner decision O8) |

With a calendar that is not supported, compute no clause date. The request's first sentence says the clause's date cannot be computed here; `--deemed` and `--backstop` refuse with the reason `calendar-not-supported`, and NEXT says to take it up under the contract. These dates move money: never count them on another calendar.

## 2. Computing a date

**With ow-tools** that has the capability (`ow-tools version --json` lists `us-federal` under `capabilities.calc.calendars`): run

    ow-tools calc date --from <YYYY-MM-DD> --business-days <N> --calendar us-federal

and record the capability you saw, the command and its raw output beside the date (in the request's row, `backstop.md`, or the UAT-nn's "What happened"). Detect the capability, never a version number. An exit with a reason code (`calendar-out-of-range`, a usage error) is reported as it is, and the date is then counted from the table below.

**Without it** (no ow-tools, or one that lacks the capability): count from the table in section 4 and label the date `contract-calendar.md table; not machine-checked`. A count that starts before 2026 or runs past 2031 leaves the table: ask the user for the date, record it `user-stated; not machine-checked`, and say the table does not cover that year. A count that crosses into a new year within the table uses that year's rows (2030-12-20 plus 10 business days is 2031-01-07: 25 December and 1 January are skipped).

Counting: start the day after `--from`; count each weekday that is not in the table; the Nth such day is the date. Example: a request sent on Friday 2026-11-20 with N = 10 is deemed on **Monday 2026-12-07** (Thanksgiving, 2026-11-26, is skipped; weekdays alone would give 2026-12-04).

## 3. The rules (5 U.S.C. 6103)

| Holiday | Date |
|---|---|
| New Year's Day | 1 January |
| Birthday of Martin Luther King, Jr. | third Monday in January |
| Washington's Birthday | third Monday in February |
| Memorial Day | last Monday in May |
| Juneteenth National Independence Day | 19 June |
| Independence Day | 4 July |
| Labor Day | first Monday in September |
| Columbus Day | second Monday in October |
| Veterans Day | 11 November |
| Thanksgiving Day | fourth Thursday in November |
| Christmas Day | 25 December |

**Observed days.** A holiday on a Saturday is observed the Friday before; on a Sunday, the Monday after. The observed day is the day off. New Year's Day on a Saturday is observed on 31 December of the year before (2028-01-01 is a Saturday, so 2027-12-31 is the holiday). Inauguration Day is not on this calendar (it applies in one area only).

ow-tools computes the same rules for 2022 to 2099 and refuses other years with the reason `calendar-out-of-range`.

## 4. The table, 2026 to 2031 (observed days)

| observed | day | holiday |
|---|---|---|
| 2026-01-01 | Thu | New Year's Day 2026 |
| 2026-01-19 | Mon | Birthday of Martin Luther King, Jr. 2026 |
| 2026-02-16 | Mon | Washington's Birthday 2026 |
| 2026-05-25 | Mon | Memorial Day 2026 |
| 2026-06-19 | Fri | Juneteenth National Independence Day 2026 |
| 2026-07-03 | Fri | Independence Day 2026 (falls on Sat 2026-07-04) |
| 2026-09-07 | Mon | Labor Day 2026 |
| 2026-10-12 | Mon | Columbus Day 2026 |
| 2026-11-11 | Wed | Veterans Day 2026 |
| 2026-11-26 | Thu | Thanksgiving Day 2026 |
| 2026-12-25 | Fri | Christmas Day 2026 |
| 2027-01-01 | Fri | New Year's Day 2027 |
| 2027-01-18 | Mon | Birthday of Martin Luther King, Jr. 2027 |
| 2027-02-15 | Mon | Washington's Birthday 2027 |
| 2027-05-31 | Mon | Memorial Day 2027 |
| 2027-06-18 | Fri | Juneteenth National Independence Day 2027 (falls on Sat 2027-06-19) |
| 2027-07-05 | Mon | Independence Day 2027 (falls on Sun 2027-07-04) |
| 2027-09-06 | Mon | Labor Day 2027 |
| 2027-10-11 | Mon | Columbus Day 2027 |
| 2027-11-11 | Thu | Veterans Day 2027 |
| 2027-11-25 | Thu | Thanksgiving Day 2027 |
| 2027-12-24 | Fri | Christmas Day 2027 (falls on Sat 2027-12-25) |
| 2027-12-31 | Fri | New Year's Day 2028 (falls on Sat 2028-01-01) |
| 2028-01-17 | Mon | Birthday of Martin Luther King, Jr. 2028 |
| 2028-02-21 | Mon | Washington's Birthday 2028 |
| 2028-05-29 | Mon | Memorial Day 2028 |
| 2028-06-19 | Mon | Juneteenth National Independence Day 2028 |
| 2028-07-04 | Tue | Independence Day 2028 |
| 2028-09-04 | Mon | Labor Day 2028 |
| 2028-10-09 | Mon | Columbus Day 2028 |
| 2028-11-10 | Fri | Veterans Day 2028 (falls on Sat 2028-11-11) |
| 2028-11-23 | Thu | Thanksgiving Day 2028 |
| 2028-12-25 | Mon | Christmas Day 2028 |
| 2029-01-01 | Mon | New Year's Day 2029 |
| 2029-01-15 | Mon | Birthday of Martin Luther King, Jr. 2029 |
| 2029-02-19 | Mon | Washington's Birthday 2029 |
| 2029-05-28 | Mon | Memorial Day 2029 |
| 2029-06-19 | Tue | Juneteenth National Independence Day 2029 |
| 2029-07-04 | Wed | Independence Day 2029 |
| 2029-09-03 | Mon | Labor Day 2029 |
| 2029-10-08 | Mon | Columbus Day 2029 |
| 2029-11-12 | Mon | Veterans Day 2029 (falls on Sun 2029-11-11) |
| 2029-11-22 | Thu | Thanksgiving Day 2029 |
| 2029-12-25 | Tue | Christmas Day 2029 |
| 2030-01-01 | Tue | New Year's Day 2030 |
| 2030-01-21 | Mon | Birthday of Martin Luther King, Jr. 2030 |
| 2030-02-18 | Mon | Washington's Birthday 2030 |
| 2030-05-27 | Mon | Memorial Day 2030 |
| 2030-06-19 | Wed | Juneteenth National Independence Day 2030 |
| 2030-07-04 | Thu | Independence Day 2030 |
| 2030-09-02 | Mon | Labor Day 2030 |
| 2030-10-14 | Mon | Columbus Day 2030 |
| 2030-11-11 | Mon | Veterans Day 2030 |
| 2030-11-28 | Thu | Thanksgiving Day 2030 |
| 2030-12-25 | Wed | Christmas Day 2030 |
| 2031-01-01 | Wed | New Year's Day 2031 |
| 2031-01-20 | Mon | Birthday of Martin Luther King, Jr. 2031 |
| 2031-02-17 | Mon | Washington's Birthday 2031 |
| 2031-05-26 | Mon | Memorial Day 2031 |
| 2031-06-19 | Thu | Juneteenth National Independence Day 2031 |
| 2031-07-04 | Fri | Independence Day 2031 |
| 2031-09-01 | Mon | Labor Day 2031 |
| 2031-10-13 | Mon | Columbus Day 2031 |
| 2031-11-11 | Tue | Veterans Day 2031 |
| 2031-11-27 | Thu | Thanksgiving Day 2031 |
| 2031-12-25 | Thu | Christmas Day 2031 |
