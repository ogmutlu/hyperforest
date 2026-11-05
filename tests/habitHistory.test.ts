import { expect, it } from "vitest";
import { apply, validateState } from "../src/domainClient";
import type { State } from "../src/model";
import { sampleWorkspace } from "./sampleWorkspace";
import { archiveBackup, exportArchive } from "../src/export";

function setup() {
  return apply(
    sampleWorkspace(1000),
    {
      type: "add",
      id: "habit",
      parentId: "project",
      title: "Daily practice",
      vertex: { kind: "habit", frequency: 1, interval: "day" },
    },
    1000,
  );
}
function history(state: State) {
  const vertex = state.nodes.find((node) => node.id === "habit")!.vertex;
  if (vertex?.kind !== "habit") throw new Error("Not a habit");
  return vertex.completions;
}
it("edits large habit histories, sorts timestamps, and preserves archive roundtrips", () => {
  let state = setup();
  const records = Array.from(
    { length: 600 },
    (_, index) => 1000 + index * 1000,
  ).reverse();
  state = apply(
    state,
    {
      type: "setHabitHistory",
      id: "habit",
      expected: [],
      completions: records,
    },
    700000,
  );
  expect(history(state)).toEqual([...records].reverse());
  const restored = validateState(
    JSON.parse(archiveBackup(exportArchive(state, 700000))),
  );
  expect(history(restored)).toEqual(history(state));
  const next = apply(
    restored,
    {
      type: "setHabitHistory",
      id: "habit",
      expected: history(restored),
      completions: history(restored).slice(0, 400),
    },
    700000,
  );
  expect(history(next)).toHaveLength(400);
  expect(
    history(
      apply(next, { type: "recordHabit", id: "habit", undo: true }, 700000),
    ),
  ).toHaveLength(399);
});
it("rejects stale, future, non-habit, and finished history edits without changing the source", () => {
  const state = apply(setup(), { type: "recordHabit", id: "habit" }, 2000);
  expect(() =>
    apply(
      state,
      { type: "setHabitHistory", id: "habit", expected: [], completions: [] },
      3000,
    ),
  ).toThrow(/another tab/);
  expect(() =>
    apply(
      state,
      { type: "setHabitHistory", id: "habit", completions: [4000] },
      3000,
    ),
  ).toThrow(/no later/);
  expect(() =>
    apply(
      state,
      { type: "setHabitHistory", id: "read", completions: [] },
      3000,
    ),
  ).toThrow(/Only habits/);
  const finished = apply(
    state,
    { type: "complete", id: "habit", sessionId: "done" },
    3000,
  );
  expect(() =>
    apply(
      finished,
      { type: "setHabitHistory", id: "habit", completions: [] },
      3000,
    ),
  ).toThrow(/Finished/);
  expect(history(state)).toEqual([2000]);
});
