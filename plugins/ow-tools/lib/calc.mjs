// `ow-tools calc` (design §5.4): dates and arithmetic the ow- skills would
// otherwise have to mark "NOT machine-checked". Exact integer arithmetic in
// minor units; dates as calendar days with no time zone drift.
import { readFileSync } from "node:fs";
import { localDate, nowDate, refused, timeZone, usage } from "./core.mjs";

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDate(s, what = "date") {
  const m = ISO.exec(String(s || ""));
  if (!m) throw usage(`${what} must be YYYY-MM-DD, got: ${s}`);
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) throw usage(`${what} is not a real date: ${s}`);
  return d;
}
const fmt = (d) => d.toISOString().slice(0, 10);
const addUTC = (d, n) => new Date(d.getTime() + n * 86400000);
const isWeekend = (d) => d.getUTCDay() === 0 || d.getUTCDay() === 6;

export function today({ tz } = {}) {
  const now = nowDate();
  const zone = tz || timeZone();
  let date;
  try {
    date = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    throw usage(`unknown time zone: ${zone}`);
  }
  return { date: tz ? date : localDate(now), tz: zone, clock: "tool" };
}

// The contract calendar (ow-uat design §8.1, ow-tools 1.2.0): weekdays except the US federal
// holidays of 5 U.S.C. 6103, on the day they are observed. A holiday on a Saturday is observed
// the Friday before (New Year's Day then falls on 31 December of the year before); on a Sunday,
// the Monday after. Computed for 2022 to 2099: a count that reaches a weekday in any other year refuses
// (calendar-out-of-range); the start date, never counted, may lie outside.
export const CALENDARS = ["us-federal"];
export const FEDERAL_YEARS = [2022, 2099];
const nthWeekday = (y, m, wd, n) => {
  const first = new Date(Date.UTC(y, m - 1, 1));
  return new Date(Date.UTC(y, m - 1, 1 + ((wd - first.getUTCDay() + 7) % 7) + 7 * (n - 1)));
};
const lastWeekday = (y, m, wd) => {
  const last = new Date(Date.UTC(y, m, 0));
  return new Date(Date.UTC(y, m - 1, last.getUTCDate() - ((last.getUTCDay() - wd + 7) % 7)));
};
const observed = (d) => (d.getUTCDay() === 6 ? addUTC(d, -1) : d.getUTCDay() === 0 ? addUTC(d, 1) : d);
/** The observed federal holidays that fall in calendar year `y` (YYYY-MM-DD, sorted). */
export function usFederalHolidays(y) {
  const out = [];
  for (const year of [y, y + 1]) {
    const days = [
      new Date(Date.UTC(year, 0, 1)), nthWeekday(year, 1, 1, 3), nthWeekday(year, 2, 1, 3), lastWeekday(year, 5, 1),
      new Date(Date.UTC(year, 5, 19)), new Date(Date.UTC(year, 6, 4)), nthWeekday(year, 9, 1, 1), nthWeekday(year, 10, 1, 2),
      new Date(Date.UTC(year, 10, 11)), nthWeekday(year, 11, 4, 4), new Date(Date.UTC(year, 11, 25)),
    ];
    // Juneteenth is a federal holiday from 2021 on; every year in range has it.
    for (const d of year === y ? days : days.slice(0, 1)) {
      const o = fmt(observed(d));
      if (o.startsWith(String(y))) out.push(o);
    }
  }
  return [...new Set(out)].sort();
}
/**
 * Whether a weekday is a contract-calendar holiday, a year at a time, as the count reaches it. Only a
 * weekday the count actually classifies has to lie in 2022 to 2099, so an answer near either end is given
 * (OW-04 round 1, R1-17: 2099-12-29 + 1 and 2022-01-20 - 5 refused on an estimated span).
 */
function federalHoliday() {
  const years = new Map();
  return (d) => {
    const y = d.getUTCFullYear();
    if (y < FEDERAL_YEARS[0] || y > FEDERAL_YEARS[1]) {
      throw refused("calendar-out-of-range", `the us-federal calendar covers ${FEDERAL_YEARS[0]} to ${FEDERAL_YEARS[1]}; ${y} is outside it`);
    }
    if (!years.has(y)) years.set(y, new Set(usFederalHolidays(y)));
    return years.get(y).has(fmt(d));
  };
}

// N calendar days, or N business days (Mon-Fri minus the given holidays, or the
// contract calendar). The start date itself is never counted; N may be negative.
// Both modes return the same keys (F-008), and holidays only apply to business days.
export function addDate({ from, days, businessDays, holidays, calendar }) {
  const start = parseDate(from, "--from");
  if ((days === undefined) === (businessDays === undefined)) throw usage("give exactly one of --days N or --business-days N");
  if (calendar !== undefined) {
    if (!CALENDARS.includes(calendar)) throw usage(`unknown calendar "${calendar}"; ow-tools knows ${CALENDARS.join(", ")}`);
    if (days !== undefined) throw usage("--calendar counts business days: use it with --business-days, not --days");
    if (holidays?.length) throw usage("--calendar brings its own holidays: give --calendar or --holidays, not both");
  }
  if (days !== undefined && holidays?.length) throw usage("--holidays only applies to --business-days");
  const hol = new Set((holidays || []).map((h) => fmt(parseDate(h, "holiday"))));
  const n = days ?? businessDays;
  if (!Number.isInteger(n) || Math.abs(n) > 3650) throw usage("the count must be a whole number of at most 3650");
  if (days !== undefined) return { date: fmt(addUTC(start, n)), from: fmt(start), days: n, calendar: "every day", holidays_skipped: [] };
  const isHoliday = calendar ? federalHoliday() : (d) => hol.has(fmt(d));
  const step = n < 0 ? -1 : 1;
  const skipped = [];
  let d = start;
  let left = Math.abs(n);
  while (left > 0) {
    d = addUTC(d, step);
    if (isWeekend(d)) continue;
    if (isHoliday(d)) {
      skipped.push(fmt(d));
      continue;
    }
    left--;
  }
  return { date: fmt(d), from: fmt(start), business_days: n, calendar: calendar ?? "Mon-Fri", holidays_skipped: skipped };
}

// Decimal strings → integer minor units, without floating point.
export function toMinor(value, what = "amount") {
  const s = String(value).trim();
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) throw usage(`${what} must be a number with at most 2 decimals, got: ${value}`);
  const minor = BigInt(m[2]) * 100n + BigInt((m[3] || "0").padEnd(2, "0"));
  return m[1] ? -minor : minor;
}
export function fromMinor(minor) {
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  return `${neg ? "-" : ""}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
}

// items: [{ label, quantity?, unit_price } | { label, amount }], one currency.
export function total({ items, currency }) {
  if (!Array.isArray(items) || items.length === 0) throw usage("items must be a non-empty JSON array");
  const currencies = new Set(items.map((i) => i.currency || currency).filter(Boolean));
  if (currencies.size > 1) throw usage(`one currency per total, got: ${[...currencies].join(", ")}`);
  let sum = 0n;
  const lines = items.map((it, i) => {
    const label = String(it.label ?? `item ${i + 1}`);
    let amount;
    if (it.amount !== undefined) {
      amount = toMinor(it.amount, `${label} amount`);
    } else {
      const q = it.quantity ?? 1;
      if (!(Number.isInteger(q) && q >= 0)) throw usage(`${label}: quantity must be a whole number`);
      amount = toMinor(it.unit_price, `${label} unit_price`) * BigInt(q);
    }
    sum += amount;
    return { label, amount: fromMinor(amount) };
  });
  return { currency: [...currencies][0] || null, lines, total: fromMinor(sum) };
}

// "40/40/20" of a total: floor each share in minor units, remainder to the last.
export function split({ total: t, schedule }) {
  const parts = String(schedule || "").split("/").map((p) => p.trim());
  if (parts.length < 2 || parts.some((p) => !/^\d+$/.test(p))) throw usage("--schedule looks like 40/40/20 or 50/50");
  const pct = parts.map(Number);
  if (pct.reduce((a, b) => a + b, 0) !== 100) throw usage("the schedule must add up to 100");
  const whole = toMinor(t, "--total");
  const shares = pct.map((p) => (whole * BigInt(p)) / 100n);
  const used = shares.reduce((a, b) => a + b, 0n);
  shares[shares.length - 1] += whole - used;
  return { total: fromMinor(whole), schedule: pct.join("/"), amounts: shares.map(fromMinor) };
}

// ---- calc hours (design §5.4, amendment T4) ------------------------------
// Care-plan hours in integer minutes. The ledger is the read contract ow-care
// writes; the rollover rule is the frozen `rollover: { share, of, months }`.

export const HOUR_KINDS = ["care", "health", "report", "meeting"];
const MONTH_ID = /^M-(\d{2,3})$/;
const ENTRY_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$/;
const LEDGER_KEYS = new Set(["schema", "months"]);
const MONTH_KEYS = new Set(["id", "included", "entries", "extra_approved", "credit"]);
const ENTRY_KEYS = new Set(["id", "kind", "minutes"]);

// "0.25,unused,1" → { num: 25, den: 100, of: "unused", months: 1 }. The share
// stays an exact fraction; nothing here is floating point.
export function parseRollover(text) {
  const m = /^(0(?:\.\d{1,4})?|1(?:\.0{1,4})?),(unused|included),([1-9]|1[0-2])$/.exec(String(text || "").replace(/\s+/g, ""));
  if (!m) throw usage("--rollover takes <share>,<of>,<months>, e.g. 0.25,unused,1 (share 0 to 1, of unused or included, months 1 to 12)");
  const [whole, frac = ""] = m[1].split(".");
  const den = 10 ** frac.length;
  const num = Number(whole) * den + Number(frac || 0);
  if (num === 0) throw usage("--rollover share must be more than 0");
  return { share: m[1], num, den, of: m[2], months: Number(m[3]) };
}

const quarterDown = (num, den, minutes) => Math.floor((num * minutes) / (den * 15)) * 15;

// At most 100,000 minutes (about 1,667 hours) per entry or month field:
// every sum stays a safe integer, so the arithmetic stays exact (F-022).
export const MAX_MINUTES = 100000;
function minutesField(v, where, entryId) {
  if (!Number.isSafeInteger(v)) throw usage(`${where} must be a whole number of minutes`);
  if (v < 0) throw usage(`${where} must not be negative`);
  if (v > MAX_MINUTES) throw usage(`${where} is more than ${MAX_MINUTES} minutes`);
  if (v % 15 !== 0) {
    throw refused("not-quarter-hour", `${entryId ?? where} is not a whole quarter-hour (minutes must be a multiple of 15)`, { entry: entryId ?? where });
  }
  return v;
}

export function readLedger(ledger) {
  if (!ledger || typeof ledger !== "object" || Array.isArray(ledger)) throw usage("the ledger must be a JSON object");
  for (const k of Object.keys(ledger)) if (!LEDGER_KEYS.has(k)) throw usage(`unknown ledger key "${k}"`);
  if (ledger.schema !== 1) throw usage("the ledger needs schema: 1");
  if (!Array.isArray(ledger.months) || ledger.months.length === 0) throw usage("the ledger needs a non-empty months list");
  const seenEntries = new Set();
  return ledger.months.map((m, i) => {
    if (!m || typeof m !== "object" || Array.isArray(m)) throw usage(`month ${i + 1} must be an object`);
    for (const k of Object.keys(m)) if (!MONTH_KEYS.has(k)) throw usage(`month ${i + 1}: unknown key "${k}"`);
    const id = String(m.id ?? "");
    const mm = MONTH_ID.exec(id);
    // Month identity: ids run M-01, M-02, … in order with none missing.
    if (!mm || Number(mm[1]) !== i + 1) throw usage(`month ${i + 1} must have id M-${String(i + 1).padStart(2, "0")}`);
    if (!Array.isArray(m.entries)) throw usage(`${id}.entries must be a list`);
    const entries = m.entries.map((e, j) => {
      if (!e || typeof e !== "object" || Array.isArray(e)) throw usage(`${id} entry ${j + 1} must be an object`);
      for (const k of Object.keys(e)) if (!ENTRY_KEYS.has(k)) throw usage(`${id} entry ${j + 1}: unknown key "${k}"`);
      if (!ENTRY_ID.test(String(e.id ?? ""))) throw usage(`${id} entry ${j + 1}: id must be 1-40 letters, digits, ".", "_" or "-"`);
      if (seenEntries.has(`${id}/${e.id}`)) throw usage(`${id}: entry id ${e.id} appears twice`);
      seenEntries.add(`${id}/${e.id}`);
      if (!HOUR_KINDS.includes(e.kind)) throw usage(`${id} entry ${e.id}: kind must be one of ${HOUR_KINDS.join(", ")}`);
      return { id: e.id, kind: e.kind, minutes: minutesField(e.minutes, `${id} entry ${e.id}: minutes`, e.id) };
    });
    return {
      id,
      included: minutesField(m.included, `${id}.included`),
      entries,
      extra_approved: minutesField(m.extra_approved ?? 0, `${id}.extra_approved`),
      credit: minutesField(m.credit ?? 0, `${id}.credit`),
    };
  });
}

// Oldest hours first: rolled-in batches (oldest month first), then the
// month's own included minutes, then approved extra.
export function hours({ ledger, rollover }) {
  const rule = typeof rollover === "string" ? parseRollover(rollover) : rollover;
  const months = readLedger(ledger);
  let batches = []; // { from, minutes, lastMonth }
  const out = [];
  months.forEach((m, i) => {
    const rolledIn = batches.reduce((a, b) => a + b.minutes, 0);
    const available = rolledIn + m.included;
    const used = Object.fromEntries(HOUR_KINDS.map((k) => [k, 0]));
    let total = 0;
    for (const e of m.entries) {
      total += e.minutes;
      used[e.kind] += e.minutes;
      if (total > available + m.extra_approved) {
        throw refused("over-available", `${m.id}: entry ${e.id} goes past the available minutes without an approved extra`, { month: m.id, entry: e.id });
      }
    }
    used.total = total;
    // Consume: batches oldest first, then included, then extra.
    let left = total;
    for (const b of batches) {
      const take = Math.min(b.minutes, left);
      b.minutes -= take;
      left -= take;
    }
    const fromIncluded = Math.min(m.included, left);
    left -= fromIncluded;
    const extra = left;
    const ownUnused = m.included - fromIncluded;
    const rolled =
      rule.of === "unused"
        ? quarterDown(rule.num, rule.den, ownUnused)
        : Math.min(ownUnused, quarterDown(rule.num, rule.den, m.included));
    // A batch lapses after its last month; the rest carry on, oldest first.
    const lapsedBatches = batches.filter((b) => b.lastMonth <= i).reduce((a, b) => a + b.minutes, 0);
    batches = batches.filter((b) => b.lastMonth > i && b.minutes > 0);
    if (rolled > 0) batches.push({ from: m.id, minutes: rolled, lastMonth: i + rule.months });
    const rolledOver = batches.reduce((a, b) => a + b.minutes, 0);
    const lapsed = ownUnused - rolled + lapsedBatches;
    const lhs = rolledIn + m.included + extra;
    const rhs = total + rolledOver + lapsed;
    if (lhs !== rhs) throw new Error(`${m.id}: the hours identity does not hold (${lhs} ≠ ${rhs})`);
    out.push({
      id: m.id,
      included: m.included,
      rolled_in: rolledIn,
      available,
      used,
      extra,
      extra_approved: m.extra_approved,
      rolled_over: rolledOver,
      lapsed,
      credit: m.credit,
      identity: `rolled in + included + extra = used + rolled over + lapsed: ${rolledIn} + ${m.included} + ${extra} = ${total} + ${rolledOver} + ${lapsed}`,
    });
  });
  return {
    unit: "minutes",
    rollover: { share: rule.share, of: rule.of, months: rule.months },
    months: out,
    note: "Oldest hours first. Rolled-over minutes are rounded down to the quarter-hour. Not an accounting record.",
  };
}

export function calc(sub, opts) {
  switch (sub) {
    case "today":
      return today(opts);
    case "date":
      return addDate(opts);
    case "total": {
      if (!opts.items) throw usage("usage: ow-tools calc total --items <file.json> [--currency USD]");
      let items;
      try {
        items = JSON.parse(readFileSync(opts.items, "utf8"));
      } catch {
        throw usage(`could not read JSON items from ${opts.items}`);
      }
      return total({ items, currency: opts.currency });
    }
    case "split":
      return split(opts);
    case "hours": {
      if (!opts.ledger || !opts.rollover) throw usage("usage: ow-tools calc hours --ledger <file.json> --rollover <share>,<of>,<months>");
      let ledger;
      try {
        ledger = JSON.parse(readFileSync(opts.ledger, "utf8"));
      } catch {
        throw usage("could not read a JSON ledger from the --ledger file");
      }
      return hours({ ledger, rollover: opts.rollover });
    }
    default:
      throw usage("usage: ow-tools calc today | date | total | split | hours (see ow-tools help)");
  }
}
