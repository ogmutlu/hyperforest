/** Local calendar conversion only. Rust owns interval attribution and averages. */
import type { Session } from "./model";

/** Strict date-only parsing; JavaScript otherwise normalizes dates like Feb 30. */
export function parseDay(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) && localDay(date.getTime()) === value
    ? date
    : null;
}

export function localDateTime(time: number): string {
  const date = new Date(time);
  return new Date(time - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function localDay(time: number): string {
  return localDateTime(time).slice(0, 10);
}

/** Blank endpoints mean first saved session through today, inclusive.
 * Advance calendar dates rather than adding 24h: DST days can be 23 or 25h.
 */
export function historyDays(
  sessions: Session[],
  from: string,
  to: string,
  now: number,
): number[] {
  const today = localDay(now);
  let first = today;
  for (const session of sessions) {
    const day = localDay(session.startedAt);
    if (day < first) first = day;
  }
  const end = to || today;
  const start = from || (first < end ? first : end);
  if (!parseDay(start) || !parseDay(end))
    throw new Error(
      "Enter dates as YYYY-MM-DD or choose them from the calendar.",
    );
  if (start > end || start < "1970-01-01" || end > today)
    throw new Error("Choose a valid date range ending no later than today.");
  const cursor = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  if (!Number.isFinite(cursor.getTime()) || !Number.isFinite(last.getTime()))
    throw new Error("Choose a valid date range.");
  const boundaries = [Math.max(0, cursor.getTime())];
  while (cursor <= last) {
    cursor.setDate(cursor.getDate() + 1);
    boundaries.push(cursor.getTime());
  }
  return boundaries;
}

export function matchingSessionIndices(
  sessions: Session[],
  subject: string,
): number[] {
  const query = subject.trim().toLocaleLowerCase();
  const indices: number[] = [];
  sessions.forEach((session, index) => {
    if (
      !query ||
      `${session.title} ${session.group}`.toLocaleLowerCase().includes(query)
    )
      indices.push(index);
  });
  return indices;
}
