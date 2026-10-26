import { describe, expect, it } from "vitest";
import { apply, totals, validateState } from "../src/domainClient";
import { archiveBackup, exportArchive } from "../src/export";
import type { State, VertexSettings } from "../src/model";
import { habitProgress, thoughtLines, vertexGeometry } from "../src/vertices";
import { sampleWorkspace } from "./sampleWorkspace";

const settings: VertexSettings[] = [
  { kind: "vanilla" },
  { kind: "deadline", deadlineAt: 2000000000000 },
  { kind: "thought" },
  { kind: "reading", resource: "/home/me/a reading.pdf" },
  { kind: "habit", frequency: 3, interval: "week" },
];
const find = (state: State, id: string) =>
  state.nodes.find((node) => node.id === id)!;

describe("vertex kinds", () => {
  it.each(settings)(
    "$kind retains shared graph and focus behavior and its metadata",
    (vertex) => {
      let state = sampleWorkspace(1000);
      state = apply(
        state,
        { type: "move", id: "read", x: 145.5, y: 720 },
        1000,
      );
      const previous = state.nodes.map(({ id, x, y }) => ({ id, x, y }));
      state = apply(
        state,
        {
          type: "isolate",
          id: "new",
          treeId: "project",
          title: "New vertex",
          vertex,
        },
        2000,
      );
      expect(
        state.nodes
          .filter((node) => node.id !== "new")
          .map(({ id, x, y }) => ({ id, x, y })),
      ).toEqual(previous);
      const added = find(state, "new");
      expect(added.parentId).toBeNull();
      expect(added.vertex).toMatchObject(vertex);
      expect(
        state.nodes
          .filter((node) => node.id !== "new")
          .every((node) => node.x !== added.x || node.y !== added.y),
      ).toBe(true);
      state = apply(state, { type: "move", id: "new", x: -45, y: 350 }, 2001);
      state = apply(
        state,
        { type: "connect", id: "new", parentId: "discover" },
        2002,
      );
      state = apply(
        state,
        {
          type: "edit",
          id: "new",
          title: "Renamed",
          notes: "My notes",
          estimateMinutes: 10,
        },
        2003,
      );
      state = apply(
        state,
        { type: "color", id: "new", color: "#aabbcc" },
        2004,
      );
      state = apply(state, { type: "fill", id: "new", filled: false }, 2005);
      state = apply(state, { type: "start", id: "new" }, 3000);
      state = apply(state, { type: "finish", id: "focus-session" }, 5000);
      expect(totals(state, "project", 5000).get("new")).toBe(2000);
      expect(find(state, "new")).toMatchObject({
        vertex,
        x: -45,
        y: 350,
        parentId: "discover",
        title: "Renamed",
        notes: "My notes",
        filled: false,
      });
      const restored = JSON.parse(
        archiveBackup(exportArchive(state, 5000)),
      ) as State;
      expect(find(restored, "new")).toMatchObject(find(state, "new"));
      state = apply(
        state,
        { type: "complete", id: "new", sessionId: "finish-session" },
        6000,
      );
      expect(find(state, "new")).toMatchObject({ vertex, finishedAt: 6000 });
    },
  );

  it("loads older version-1 vertices as vanilla and rejects unknown kinds", () => {
    const old = sampleWorkspace(1000);
    const nodes = old.nodes.map(({ vertex, ...node }) => {
      void vertex;
      return node;
    });
    expect(
      validateState({ ...old, nodes }).nodes.every(
        (node) => node.vertex?.kind === "vanilla",
      ),
    ).toBe(true);
    expect(() =>
      validateState({
        ...old,
        nodes: nodes.map((node) => ({ ...node, vertex: { kind: "unknown" } })),
      }),
    ).toThrow();
  });

  it.each([
    { kind: "deadline", deadlineAt: -1 },
    { kind: "deadline", deadlineAt: 9007199254740991 },
    { kind: "reading", resource: "javascript:alert(1)" },
    { kind: "reading", resource: "file:///etc/passwd" },
    { kind: "reading", resource: "https://" },
    { kind: "habit", frequency: 0, interval: "day" },
    { kind: "habit", frequency: 1001, interval: "day" },
    { kind: "habit", frequency: 1, interval: "year" },
    { kind: "habit", frequency: 1, interval: "day", completions: [2000, 1000] },
  ])("rejects invalid imported metadata: %j", (vertex) => {
    const state = sampleWorkspace(1000);
    expect(() =>
      validateState({
        ...state,
        nodes: state.nodes.map((node) =>
          node.id === "read" ? { ...node, vertex } : node,
        ),
      }),
    ).toThrow();
  });

  it("keeps repetition history through edits, undo, reload, and archive transfer", () => {
    let state = apply(
      sampleWorkspace(1000),
      {
        type: "add",
        id: "habit",
        parentId: "project",
        title: "Practice",
        vertex: { kind: "habit", frequency: 2, interval: "day" },
      },
      1000,
    );
    state = apply(state, { type: "recordHabit", id: "habit" }, 2000);
    state = apply(state, { type: "recordHabit", id: "habit" }, 3000);
    state = apply(
      state,
      {
        type: "configureVertex",
        id: "habit",
        vertex: { kind: "habit", frequency: 5, interval: "week" },
      },
      4000,
    );
    expect(find(state, "habit").vertex).toEqual({
      kind: "habit",
      frequency: 5,
      interval: "week",
      completions: [2000, 3000],
    });
    state = validateState(JSON.parse(JSON.stringify(state)));
    state = apply(
      state,
      { type: "recordHabit", id: "habit", undo: true },
      4000,
    );
    expect(find(state, "habit").vertex).toMatchObject({ completions: [2000] });
    const restored = JSON.parse(
      archiveBackup(exportArchive(state, 4000)),
    ) as State;
    expect(find(restored, "habit").vertex).toEqual(find(state, "habit").vertex);
    expect(() =>
      apply(state, { type: "recordHabit", id: "habit" }, 1999),
    ).toThrow("clock");
    expect(() =>
      apply(state, { type: "recordHabit", id: "read" }, 4000),
    ).toThrow("Only habit");
    expect(() =>
      apply(
        state,
        { type: "configureVertex", id: "habit", vertex: { kind: "thought" } },
        4000,
      ),
    ).toThrow("kind cannot be changed");
    state = apply(
      state,
      { type: "complete", id: "habit", sessionId: "finish" },
      5000,
    );
    expect(() =>
      apply(state, { type: "recordHabit", id: "habit" }, 6000),
    ).toThrow("Finished vertices");
  });

  it("displays habit progress within local days, Monday-based weeks, and months", () => {
    const now = new Date(2026, 9, 26, 15).getTime();
    const completions = [
      new Date(2026, 8, 30, 12).getTime(),
      new Date(2026, 9, 25, 12).getTime(),
      new Date(2026, 9, 26, 8).getTime(),
      now + 1000,
    ];
    const vertex = { kind: "habit" as const, frequency: 3, completions };
    expect(habitProgress({ ...vertex, interval: "day" }, now)).toBe(1);
    expect(habitProgress({ ...vertex, interval: "week" }, now)).toBe(1);
    expect(habitProgress({ ...vertex, interval: "month" }, now)).toBe(2);
    expect(
      habitProgress(
        { ...vertex, interval: "week" },
        new Date(2026, 10, 1, 12).getTime(),
      ),
    ).toBe(2);
  });

  it("wraps short thoughts and adjusts their oval when the text changes", () => {
    const node = {
      ...sampleWorkspace(1000).nodes[0]!,
      vertex: { kind: "thought" as const },
    };
    const small = vertexGeometry({ ...node, title: "An idea" });
    const large = vertexGeometry({
      ...node,
      title: "An idea with more words and a second line",
    });
    expect(large.rx).toBeGreaterThan(small.rx);
    expect(large.ry).toBeGreaterThan(small.ry);
    expect(thoughtLines("x".repeat(100)).join("")).toBe("x".repeat(100));
    expect(thoughtLines("Thoughts with several words").join(" ")).toBe(
      "Thoughts with several words",
    );
  });
});
