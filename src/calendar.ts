/** Local calendar conversion only. Rust owns interval attribution and averages. */
import type { HabitInterval, Session, State } from "./model";

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

/** Monotonic local calendar day index (days since 1970-01-01 in local time). */
export function localDayIndex(time: number): number {
  const d = new Date(time);
  return Math.floor(
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000,
  );
}

/** Monotonic Monday-based local ISO week index (1970-01-01 was Thursday = 3). */
export function localIsoWeekIndex(dayIndex: number): number {
  return Math.floor((dayIndex + 3) / 7);
}

/** Local weekday: 0 = Monday .. 6 = Sunday. */
export function localWeekday(dayIndex: number): number {
  return (((dayIndex + 3) % 7) + 7) % 7;
}

/** Local half-open `[start, end)` for the period containing `now`. */
export function habitPeriodBounds(
  interval: HabitInterval,
  now: number,
): [number, number] {
  const start = periodStartDate(interval, now);
  const end = new Date(start.getTime());
  if (interval === "day" || interval === "custom")
    end.setDate(end.getDate() + 1);
  else if (interval === "week") end.setDate(end.getDate() + 7);
  else end.setMonth(end.getMonth() + 1);
  return [Math.max(0, start.getTime()), Math.max(0, end.getTime())];
}

/** Local midnight boundaries covering every day of a given month (length = days + 1). */
export function habitMonthDayBoundaries(year: number, month: number): number[] {
  const days = new Date(year, month + 1, 0).getDate();
  const result: number[] = [];
  for (let day = 1; day <= days + 1; day++) {
    const d = new Date(year, month, day, 0, 0, 0, 0);
    result.push(Math.max(0, d.getTime()));
  }
  return result;
}

function periodStartDate(interval: HabitInterval, at: number): Date {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  if (interval === "week") d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  if (interval === "month") d.setDate(1);
  return d;
}

function buildPeriodBoundaries(
  interval: HabitInterval,
  minAt: number,
  maxAt: number,
): number[] {
  const cursor = periodStartDate(interval, minAt);
  const endLimit = periodStartDate(interval, maxAt);
  const boundaries = [Math.max(0, cursor.getTime())];
  let guard = 0;
  while (cursor <= endLimit && guard < 20000) {
    if (interval === "day" || interval === "custom")
      cursor.setDate(cursor.getDate() + 1);
    else if (interval === "week") cursor.setDate(cursor.getDate() + 7);
    else cursor.setMonth(cursor.getMonth() + 1);
    boundaries.push(Math.max(0, cursor.getTime()));
    guard++;
  }
  return boundaries;
}

function periodTouchesNight(start: number, end: number): boolean {
  if (end <= start) return false;
  if (end - start >= 24 * 3600000) return true;
  const s = new Date(start);
  const e = new Date(end);
  const sMin = s.getHours() * 60 + s.getMinutes();
  const eMin = e.getHours() * 60 + e.getMinutes();
  if (localDayIndex(start) === localDayIndex(end)) {
    return sMin < 240;
  }
  // Crosses local midnight: touches [00:00, 04:00) whenever end > midnight
  return (
    sMin < 240 ||
    eMin > 0 ||
    end > new Date(e.getFullYear(), e.getMonth(), e.getDate()).getTime()
  );
}

export interface AchievementCalendarContext {
  todayLocalDay: number;
  sessions: {
    sessionIndex: number;
    localDay: number;
    isoWeek: number;
    weekday: number;
    startMinute: number;
    endMinute: number;
    touchesNight: boolean;
    durationMs: number;
    endedAt: number;
  }[];
  habits: {
    nodeId: string;
    periodBoundaries: number[];
    dayBoundaries: number[];
    firstDayIndex: number;
    todayStart: number;
    todayEnd: number;
  }[];
  finishedDays: { count: number }[];
}

export function achievementCalendarContext(
  state: State,
  now: number,
): AchievementCalendarContext {
  const todayLocalDay = localDayIndex(now);
  const sessions = state.sessions.map((session, sessionIndex) => {
    const start = new Date(session.startedAt);
    const end = new Date(session.endedAt);
    const localDay = localDayIndex(session.startedAt);
    const touchesNight = session.periods.some((p) =>
      periodTouchesNight(p.start, p.end),
    );
    return {
      sessionIndex,
      localDay,
      isoWeek: localIsoWeekIndex(localDay),
      weekday: localWeekday(localDay),
      startMinute: start.getHours() * 60 + start.getMinutes(),
      endMinute: end.getHours() * 60 + end.getMinutes(),
      touchesNight,
      durationMs: session.durationMs,
      endedAt: session.endedAt,
    };
  });

  const [todayStart, todayEnd] = habitPeriodBounds("day", now);
  const habits: AchievementCalendarContext["habits"] = [];
  for (const node of state.nodes) {
    if (node.vertex?.kind !== "habit") continue;
    const timestamps = node.vertex.measure
      ? (node.vertex.entries ?? []).map((e) => e.at)
      : node.vertex.completions;
    if (timestamps.length === 0) {
      habits.push({
        nodeId: node.id,
        periodBoundaries: [],
        dayBoundaries: [],
        firstDayIndex: todayLocalDay,
        todayStart,
        todayEnd,
      });
      continue;
    }
    const minAt = timestamps[0]!;
    const maxAt = Math.max(timestamps.at(-1)!, now);
    const periodBoundaries = buildPeriodBoundaries(
      node.vertex.interval,
      minAt,
      maxAt,
    );
    const dayBoundaries = buildPeriodBoundaries("day", minAt, maxAt);
    habits.push({
      nodeId: node.id,
      periodBoundaries,
      dayBoundaries,
      firstDayIndex: localDayIndex(minAt),
      todayStart,
      todayEnd,
    });
  }

  const finishedCounts = new Map<number, number>();
  for (const node of state.nodes) {
    if (node.finishedAt !== undefined) {
      const day = localDayIndex(node.finishedAt);
      finishedCounts.set(day, (finishedCounts.get(day) ?? 0) + 1);
    }
  }
  const finishedDays = [...finishedCounts.values()].map((count) => ({ count }));

  return { todayLocalDay, sessions, habits, finishedDays };
}
