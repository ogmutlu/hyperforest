import { describe, expect, it } from "vitest";
import {
  apply,
  evaluateAchievements,
  habitPeriod,
  habitPeriods,
  syncAchievements,
  validateState,
} from "../src/domainClient";
import { archiveBackup, exportArchive } from "../src/export";
import type { State } from "../src/model";
import { Workspace, STORAGE_KEY } from "../src/storage";
import { sampleWorkspace } from "./sampleWorkspace";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function memoryStorage(initial?: State) {
  const map = new Map<string, string>();
  if (initial) map.set(STORAGE_KEY, JSON.stringify(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}

describe("valued habits (domain + bridge)", () => {
  it("tracks lower-bound numeric habits and upper-bound time-of-day habits with archive round-trips", () => {
    const day1 = new Date(2026, 9, 10, 0, 0, 0, 0).getTime();
    const day2 = new Date(2026, 9, 11, 0, 0, 0, 0).getTime();
    const day3 = new Date(2026, 9, 12, 0, 0, 0, 0).getTime();

    let state = sampleWorkspace(day1);
    state = apply(
      state,
      {
        type: "add",
        id: "pages",
        parentId: "project",
        title: "Read daily",
        vertex: {
          kind: "habit",
          frequency: 1,
          interval: "day",
          measure: {
            valueKind: "number",
            bound: "atLeast",
            target: 30,
            unit: "pages",
            aggregate: "sum",
          },
        },
      },
      day1 + 1000,
    );
    state = apply(
      state,
      {
        type: "add",
        id: "wake",
        parentId: "project",
        title: "Wake early",
        vertex: {
          kind: "habit",
          frequency: 1,
          interval: "day",
          measure: {
            valueKind: "timeOfDay",
            bound: "atMost",
            target: 7 * 60 + 30,
            aggregate: "perEntry",
          },
        },
      },
      day1 + 1000,
    );

    // Unrecorded upper-bound day is unrecorded, never met.
    expect(habitPeriod(state, "wake", day1, day2).state).toBe("unrecorded");

    // Accumulate pages across two entries on day 1 (12.5 + 17.5 = 30 -> met).
    state = apply(
      state,
      { type: "recordHabit", id: "pages", value: 12.5 },
      day1 + 2 * HOUR,
    );
    expect(habitPeriod(state, "pages", day1, day2).state).toBe("missed");
    state = apply(
      state,
      { type: "recordHabit", id: "pages", value: 17.5 },
      day1 + 4 * HOUR,
    );
    const p1 = habitPeriod(state, "pages", day1, day2);
    expect(p1.state).toBe("met");
    expect(p1.totalValue).toBe(30);

    // Wake up: day 1 at 07:15 (met), day 2 at 08:05 (missed).
    state = apply(
      state,
      { type: "recordHabit", id: "wake", value: 7 * 60 + 15 },
      day1 + 7 * HOUR,
    );
    state = apply(
      state,
      { type: "recordHabit", id: "wake", value: 8 * 60 + 5 },
      day2 + 8 * HOUR,
    );
    const wakeStatuses = habitPeriods(state, "wake", [day1, day2, day3]);
    expect(wakeStatuses.map((s) => s.state)).toEqual(["met", "missed"]);

    // Archive export/import round-trips valued habits identically.
    const restored = validateState(
      JSON.parse(archiveBackup(exportArchive(state, day3))),
    );
    expect(restored.nodes.find((n) => n.id === "pages")?.vertex).toEqual(
      state.nodes.find((n) => n.id === "pages")?.vertex,
    );
    expect(restored.nodes.find((n) => n.id === "wake")?.vertex).toEqual(
      state.nodes.find((n) => n.id === "wake")?.vertex,
    );

    // Reconfiguring target keeps entries; switching mode is rejected.
    const updated = apply(
      restored,
      {
        type: "configureVertex",
        id: "pages",
        vertex: {
          kind: "habit",
          frequency: 1,
          interval: "day",
          measure: {
            valueKind: "number",
            bound: "atLeast",
            target: 50,
            unit: "pg",
            aggregate: "sum",
          },
        },
      },
      day3 + 1000,
    );
    const pagesVertex = updated.nodes.find((n) => n.id === "pages")!.vertex;
    expect(pagesVertex?.kind === "habit" && pagesVertex.entries?.length).toBe(
      2,
    );
    expect(() =>
      apply(
        updated,
        {
          type: "configureVertex",
          id: "pages",
          vertex: { kind: "habit", frequency: 1, interval: "day" },
        },
        day3 + 2000,
      ),
    ).toThrow(/tracking mode/i);

    // Custom weekday schedule (every Tuesday & Friday) persists through archive transfer.
    const custom = apply(
      updated,
      {
        type: "configureVertex",
        id: "pages",
        vertex: {
          kind: "habit",
          frequency: 1,
          interval: "custom",
          weekdays: ["tue", "fri"],
          measure: {
            valueKind: "number",
            bound: "atLeast",
            target: 40,
            unit: "pages",
            aggregate: "sum",
          },
        },
      },
      day3 + 3000,
    );
    const customRestored = validateState(
      JSON.parse(archiveBackup(exportArchive(custom, day3 + 4000))),
    );
    const customVertex = customRestored.nodes.find(
      (n) => n.id === "pages",
    )!.vertex;
    expect(
      customVertex?.kind === "habit" ? customVertex.interval : undefined,
    ).toBe("custom");
    expect(
      customVertex?.kind === "habit" ? customVertex.weekdays : undefined,
    ).toEqual(["tue", "fri"]);

    // Empty weekdays on custom interval is rejected.
    expect(() =>
      apply(
        customRestored,
        {
          type: "configureVertex",
          id: "pages",
          vertex: {
            kind: "habit",
            frequency: 1,
            interval: "custom",
            weekdays: [],
            measure: {
              valueKind: "number",
              bound: "atLeast",
              target: 40,
              unit: "pages",
              aggregate: "sum",
            },
          },
        },
        day3 + 5000,
      ),
    ).toThrow(/day of the week/i);
  });
});

describe("Steam-style achievements, open-ended +5h milestones, daily wins, and backfill", () => {
  it("unlocks core, endless (+5h), valued-habit, and daily milestones and persists through ZIP", () => {
    const today = new Date(2026, 10, 15, 10, 0, 0, 0).getTime();
    let state = sampleWorkspace(today - 10 * DAY);
    state = apply(
      state,
      {
        type: "addSession",
        id: "s1",
        nodeId: "read",
        startedAt: today - 7 * HOUR,
        durationMs: 6 * HOUR,
      },
      today,
    );
    state = apply(
      state,
      {
        type: "add",
        id: "fish",
        parentId: "project",
        title: "Fish",
      },
      today,
    );
    state = apply(
      state,
      { type: "complete", id: "fish", sessionId: "fin-fish" },
      today,
    );
    state = syncAchievements(state, today, false);
    const ids = new Set((state.achievements ?? []).map((item) => item.id));
    expect(ids.has("first_seed")).toBe(true);
    expect(ids.has("first_spark")).toBe(true);
    expect(ids.has("hyperfocus")).toBe(true);
    expect(ids.has("endless:focus_hours:5")).toBe(true);
    expect(ids.has("endless:focus_hours:10")).toBe(false);
    expect(ids.has("thanks_for_the_fish")).toBe(true);

    const evalResult = evaluateAchievements(state, today);
    expect(
      evalResult.daily.find((d) => d.id === "daily:four_hours")?.completed,
    ).toBe(true);
    const nextHours = evalResult.endless.find(
      (item) => item.id === "endless:focus_hours:10",
    );
    expect(nextHours?.unlockedAt).toBeNull();
    expect(nextHours?.current).toBe(6 * HOUR);

    // Persists through ZIP export/import.
    const restored = validateState(
      JSON.parse(archiveBackup(exportArchive(state, today))),
    );
    expect(restored.achievements).toEqual(state.achievements);
  });

  it("retroactively backfills legacy workspaces without achievements field", () => {
    const now = new Date(2026, 10, 15, 14, 0, 0, 0).getTime();
    const legacy = apply(
      sampleWorkspace(now - 2 * DAY),
      {
        type: "addSession",
        id: "legacy-s1",
        nodeId: "read",
        startedAt: now - DAY,
        durationMs: 11 * HOUR,
      },
      now,
    );
    // Simulate pre-update workspace with no `achievements` key.
    delete legacy.achievements;
    const workspace = new Workspace(memoryStorage(legacy));
    expect(workspace.consumeBackfilledCount()).toBeGreaterThan(0);
    expect(workspace.consumeBackfilledCount()).toBe(0);
    const ids = new Set(
      (workspace.getSnapshot().achievements ?? []).map((item) => item.id),
    );
    expect(ids.has("endless:focus_hours:5")).toBe(true);
    expect(ids.has("endless:focus_hours:10")).toBe(true);
  });
});
