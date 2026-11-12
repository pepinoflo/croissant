// "Days" in the app roll over at 3 a.m. local time, so a late-night session
// still counts for the evening it belongs to.

const ROLLOVER_HOURS = 3;
const DAY_MS = 86_400_000;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Local calendar day for a timestamp, as "YYYY-MM-DD". */
export function dayKey(ts: number): string {
  const d = new Date(ts - ROLLOVER_HOURS * 3_600_000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Whole-day index of a day key, for differences between days. */
export function dayIndex(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function dayFromIndex(index: number): string {
  const d = new Date(index * DAY_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function addDays(key: string, n: number): string {
  return dayFromIndex(dayIndex(key) + n);
}

export function daysBetween(fromKey: string, toKey: string): number {
  return dayIndex(toKey) - dayIndex(fromKey);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayOf(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export { DAY_MS };
