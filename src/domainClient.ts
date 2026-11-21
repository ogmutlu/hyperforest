/** Thin adapter to the Rust domain. No business rules are implemented here. */
import init, { Domain, focus_elapsed } from "./generated/hyperforest_bridge";
import {
  achievementCalendarContext,
  focusDayIndex,
  focusDayStart,
} from "./calendar";
import type {
  AchievementEvaluation,
  Action,
  Focus,
  HabitPeriodStatus,
  State,
} from "./model";
export async function initializeDomain(): Promise<void> {
  await init({
    module_or_path: new URL(
      "./generated/hyperforest_bridge_bg.wasm",
      import.meta.url,
    ),
  });
}

const handles = new WeakMap<State, Domain>();
function domain(state: State): Domain {
  let handle = handles.get(state);
  if (!handle) {
    handle = new Domain(JSON.stringify(state));
    handles.set(state, handle);
  }
  return handle;
}
function snapshot(handle: Domain): State {
  const state = JSON.parse(handle.snapshot()) as State;
  handles.set(state, handle);
  return state;
}

export function validateState(input: unknown): State {
  return snapshot(new Domain(JSON.stringify(input)));
}

export function apply(state: State, action: Action, now: number): State {
  return snapshot(domain(state).apply(JSON.stringify(action), now));
}

export function nodePath(state: State, id: string): string {
  return domain(state).path(id);
}
export function subtreeIds(state: State, id: string): Set<string> {
  return new Set(JSON.parse(domain(state).subtree(id)) as string[]);
}
export function canLinkTree(
  state: State,
  source: string,
  target: string,
): boolean {
  return domain(state).can_link(source, target);
}
export function focusElapsed(focus: Focus, now: number): number {
  return focus_elapsed(JSON.stringify(focus), now);
}

interface TotalsCache {
  now: number;
  from: number;
  values: number[];
}
const lifetimeCache = new WeakMap<State, TotalsCache>();
const dailyCache = new WeakMap<State, TotalsCache>();
function values(state: State, now: number, from: number): number[] {
  const cache = from < 0 ? lifetimeCache : dailyCache;
  // Without a running focus, lifetime totals do not change with the clock.
  const sample = from < 0 && state.focus?.runningSince == null ? 0 : now;
  let entry = cache.get(state);
  if (!entry || entry.now !== sample || entry.from !== from) {
    entry = {
      now: sample,
      from,
      values: JSON.parse(domain(state).totals(now, from)) as number[],
    };
    cache.set(state, entry);
  }
  return entry.values;
}
function treeTotals(
  state: State,
  treeId: string,
  now: number,
  from: number,
): Map<string, number> {
  const totals = values(state, now, from);
  return new Map(
    state.nodes.flatMap((node, index) =>
      node.treeId === treeId ? [[node.id, totals[index] ?? 0] as const] : [],
    ),
  );
}
export function totals(
  state: State,
  treeId: string,
  now: number,
): Map<string, number> {
  return treeTotals(state, treeId, now, -1);
}
export function todayTotals(
  state: State,
  treeId: string,
  now: number,
): Map<string, number> {
  return treeTotals(state, treeId, now, focusDayStart(now));
}
export function todayTime(state: State, now: number): number {
  return domain(state).time_between(focusDayStart(now), now);
}

export interface HistoryStatistics {
  totalMs: number;
  averageDayMs: number;
  averageActiveDayMs: number;
  averageSessionMs: number;
  longestSessionMs: number;
  activeDays: number;
  dailyMs: number[];
  sessions: { index: number; durationMs: number }[];
}
export function historyStatistics(
  state: State,
  selected: number[],
  boundaries: number[],
): HistoryStatistics {
  return JSON.parse(
    domain(state).history(JSON.stringify(selected), JSON.stringify(boundaries)),
  ) as HistoryStatistics;
}

export function habitPeriod(
  state: State,
  id: string,
  from: number,
  to: number,
): HabitPeriodStatus {
  return JSON.parse(
    domain(state).habit_period(id, from, to),
  ) as HabitPeriodStatus;
}

export function habitPeriods(
  state: State,
  id: string,
  boundaries: number[],
): HabitPeriodStatus[] {
  return JSON.parse(
    domain(state).habit_periods(id, JSON.stringify(boundaries)),
  ) as HabitPeriodStatus[];
}

interface AchievementCacheEntry {
  day: number;
  value: AchievementEvaluation;
}
const achievementCache = new WeakMap<State, AchievementCacheEntry>();

export function evaluateAchievements(
  state: State,
  now: number,
): AchievementEvaluation {
  const day = focusDayIndex(now);
  const cached = achievementCache.get(state);
  if (cached && cached.day === day) return cached.value;
  const ctx = achievementCalendarContext(state, now);
  const value = JSON.parse(
    domain(state).evaluate_achievements(JSON.stringify(ctx)),
  ) as AchievementEvaluation;
  achievementCache.set(state, { day, value });
  return value;
}

export function syncAchievements(
  state: State,
  now: number,
  backfill = false,
): State {
  const ctx = achievementCalendarContext(state, now);
  return snapshot(
    domain(state).sync_achievements(JSON.stringify(ctx), now, backfill),
  );
}
