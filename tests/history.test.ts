import { afterEach, expect, it, vi } from "vitest";
import { historyDays, matchingSessionIndices, parseDay } from "../src/calendar";
import { apply, historyStatistics } from "../src/domainClient";
import type { State } from "../src/model";

afterEach(() => vi.unstubAllEnvs());

it("date entry rejects incomplete and nonexistent dates rather than normalizing them", () => {
  expect(parseDay("2024-02-29")).not.toBeNull();
  for (const value of [
    "2026-02-29",
    "2026-02-30",
    "2026-04-31",
    "2026-13-01",
    "2026-10",
    "07/10/2026",
    "",
  ])
    expect(parseDay(value)).toBeNull();
  expect(() => historyDays([], "2026-02-30", "2026-03-01", Date.now())).toThrow(
    "Enter dates as",
  );
});

it("calendar boundaries follow 23-hour and 25-hour local days", () => {
  vi.stubEnv("TZ", "Europe/Berlin");
  const spring = historyDays(
    [],
    "2026-03-28",
    "2026-03-30",
    new Date(2026, 9, 27).getTime(),
  );
  expect(spring.slice(1).map((end, i) => (end - spring[i]!) / 3600000)).toEqual(
    [24, 23, 24],
  );
  const autumn = historyDays(
    [],
    "2026-10-24",
    "2026-10-26",
    new Date(2026, 9, 27).getTime(),
  );
  expect(autumn.slice(1).map((end, i) => (end - autumn[i]!) / 3600000)).toEqual(
    [24, 25, 24],
  );
});

it("the WASM history query clips midnight sessions, excludes pauses and active focus, and includes empty days", () => {
  vi.stubEnv("TZ", "Europe/Berlin");
  const at = (day: number, hour = 0, minute = 0): number =>
    new Date(2026, 9, day, hour, minute).getTime();
  let state: State = {
    version: 1,
    nodes: [],
    trees: [],
    sessions: [],
    focus: null,
  };
  state = apply(
    state,
    { type: "create", id: "root", title: "Research" },
    at(1),
  );
  state = apply(state, { type: "start", id: "root" }, at(6, 23, 45));
  state = apply(state, { type: "pause" }, at(7, 0, 15));
  state = apply(state, { type: "start", id: "root" }, at(7, 1));
  state = apply(state, { type: "finish", id: "overnight" }, at(7, 1, 15));
  state = apply(
    state,
    {
      type: "addSession",
      id: "manual",
      nodeId: "root",
      startedAt: at(9, 12),
      durationMs: 3600000,
    },
    at(10),
  );
  state = apply(state, { type: "start", id: "root" }, at(10));
  const boundaries = historyDays(
    state.sessions,
    "2026-10-07",
    "2026-10-09",
    at(10),
  );
  const selected = matchingSessionIndices(state.sessions, "RESEARCH");
  const stats = historyStatistics(state, selected, boundaries);
  expect(stats).toMatchObject({
    totalMs: 5400000,
    averageDayMs: 1800000,
    averageSessionMs: 2700000,
    longestSessionMs: 3600000,
    averageActiveDayMs: 2700000,
    activeDays: 2,
    dailyMs: [1800000, 0, 3600000],
  });
  expect(stats.sessions).toEqual([
    { index: 0, durationMs: 1800000 },
    { index: 1, durationMs: 3600000 },
  ]);
  expect(
    historyStatistics(
      state,
      matchingSessionIndices(state.sessions, "unknown"),
      boundaries,
    ).totalMs,
  ).toBe(0);
  // A range before the first record is a valid empty query, including blank From.
  expect(historyDays(state.sessions, "", "2026-10-02", at(10))).toHaveLength(2);
  expect(() =>
    historyDays(state.sessions, "2026-10-09", "2026-10-07", at(10)),
  ).toThrow("valid date range");
});
