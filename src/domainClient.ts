/** Thin adapter to the Rust domain. No business rules are implemented here. */
import init, { Domain, focus_elapsed } from "./generated/hyperforest_bridge";
import type { Action, Focus, State } from "./model";
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
function midnight(now: number): number {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}
export function todayTotals(
  state: State,
  treeId: string,
  now: number,
): Map<string, number> {
  return treeTotals(state, treeId, now, midnight(now));
}
export function todayTime(state: State, now: number): number {
  return domain(state).time_between(midnight(now), now);
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
