import { describe, expect, it } from "vitest";
import { apply, validateState } from "../src/domainClient";
import type { Action, GoalNode, State } from "../src/model";
import { sampleWorkspace } from "./sampleWorkspace";
import { archiveBackup, exportArchive } from "../src/export";
import { bucketAt, snapThought, vertexGeometry } from "../src/vertices";

function setup(): State {
  let state = apply(
    sampleWorkspace(1000),
    { type: "pedantic", treeId: "project", enabled: true },
    2000,
  );
  for (const [id, vertex] of [
    ["thought", { kind: "thought" }],
    ["bucket", { kind: "bucket" }],
  ] as const)
    state = apply(
      state,
      { type: "isolate", id, treeId: "project", title: id, vertex },
      2000,
    );
  return state;
}
const node = (state: State, id: string): GoalNode =>
  state.nodes.find((item) => item.id === id)!;
const step = (state: State, action: Action) => apply(state, action, 3000);

describe("standalone annotations in pedantic mode", () => {
  it("allows thoughts and buckets on creation, reload, and enabling pedantic", () => {
    let state = setup();
    expect(validateState(state).trees[0]?.pedantic).toBe(true);
    state = step(state, {
      type: "color",
      id: "thought",
      color: node(state, "read").color,
    });
    state = step(state, {
      type: "pedantic",
      treeId: "project",
      enabled: false,
    });
    expect(
      step(state, { type: "pedantic", treeId: "project", enabled: true })
        .trees[0]?.pedantic,
    ).toBe(true);
  });
  it("still rejects isolated ordinary goals, broken color groups, and disconnected subtrees", () => {
    const state = setup();
    expect(() =>
      step(state, {
        type: "isolate",
        id: "goal",
        treeId: "project",
        title: "goal",
      }),
    ).toThrow(/connected/);
    expect(() =>
      step(state, { type: "connect", id: "read", parentId: "thought" }),
    ).toThrow(/connected/);
    const red = step(state, { type: "color", id: "read", color: "#ff0000" });
    expect(() =>
      step(red, { type: "color", id: "build", color: "#ff0000" }),
    ).toThrow(/connected subtree/);
  });
});

describe("bucket membership", () => {
  it("persists groups in backups, carries members, and releases a vertex dragged out", () => {
    let state = setup();
    state = step(state, {
      type: "move",
      id: "thought",
      x: 600,
      y: 400,
      bucketId: "bucket",
    });
    state = step(state, {
      type: "move",
      id: "read",
      x: 650,
      y: 450,
      bucketId: "bucket",
    });
    const before = node(state, "bucket");
    const restored = validateState(
      JSON.parse(archiveBackup(exportArchive(state, 3000))),
    );
    expect(node(restored, "thought").bucketId).toBe("bucket");
    state = step(restored, {
      type: "move",
      id: "bucket",
      x: before.x + 75,
      y: before.y - 40,
    });
    expect(node(state, "thought")).toMatchObject({
      x: 675,
      y: 360,
      parentId: null,
    });
    expect(node(state, "read")).toMatchObject({
      x: 725,
      y: 410,
      parentId: "discover",
    });
    state = step(state, { type: "move", id: "thought", x: 20, y: 20 });
    expect(node(state, "thought").bucketId).toBeUndefined();
    const arranged = step(state, { type: "layout", treeId: "project" });
    expect(node(arranged, "read").x - node(arranged, "bucket").x).toBe(
      node(state, "read").x - node(state, "bucket").x,
    );
  });
  it("releases contents when deleting or finishing a bucket", () => {
    const state = step(setup(), {
      type: "move",
      id: "thought",
      x: 600,
      y: 400,
      bucketId: "bucket",
    });
    for (const action of [
      { type: "delete", id: "bucket" },
      { type: "complete", id: "bucket", sessionId: "done" },
    ] as const) {
      const next = step(state, action);
      expect(node(next, "thought")).toMatchObject({
        x: 600,
        y: 400,
        parentId: null,
      });
      expect(node(next, "thought").bucketId).toBeUndefined();
    }
  });
  it("rejects invalid membership, roots, nested buckets, and cross-tree containers", () => {
    const state = step(setup(), {
      type: "create",
      id: "other",
      title: "Other tree",
    });
    const other = step(state, {
      type: "isolate",
      id: "other-bucket",
      treeId: "other",
      title: "Other bucket",
      vertex: { kind: "bucket" },
    });
    for (const [id, bucketId] of [
      ["thought", "missing"],
      ["thought", "read"],
      ["project", "bucket"],
      ["bucket", "bucket"],
      ["thought", "other-bucket"],
    ]) {
      expect(() =>
        step(other, { type: "move", id: id!, x: 0, y: 0, bucketId: bucketId! }),
      ).toThrow(/bucket/i);
    }
    const invalid = structuredClone(state);
    node(invalid, "thought").bucketId = "missing";
    expect(() => validateState(invalid)).toThrow(/bucket/i);
  });
});

it("snaps thoughts edge-to-edge, without changing distant or differently grouped vertices", () => {
  const base = node(setup(), "thought");
  const left = { ...base, id: "left", x: 100, y: 200 };
  const right = { ...base, id: "right", x: 0, y: 0 };
  const width = vertexGeometry(left).rx + vertexGeometry(right).rx;
  expect(
    snapThought(right, { x: 100 + width + 10, y: 205 }, [left, right]),
  ).toEqual({ x: 100 + width, y: 200 });
  const far = { x: 100 + width + 40, y: 200 };
  expect(snapThought(right, far, [left, right])).toEqual(far);
  expect(
    snapThought({ ...right, bucketId: "bucket" }, far, [left, right]),
  ).toEqual(far);
});

it("detects bucket drops and expands bounds around contents", () => {
  const state = setup();
  const bucket = { ...node(state, "bucket"), x: 500, y: 500 };
  const thought = {
    ...node(state, "thought"),
    bucketId: "bucket",
    x: 740,
    y: 620,
  };
  const nodes = [bucket, thought];
  expect(bucketAt(thought, { x: 500, y: 500 }, nodes)).toBe("bucket");
  expect(bucketAt(thought, { x: 1500, y: 500 }, nodes)).toBeUndefined();
  expect(vertexGeometry(bucket, nodes).rx).toBeGreaterThan(260);
});

it("persists thought and bucket dimensions without moving bucket contents", () => {
  let state = step(setup(), {
    type: "move",
    id: "thought",
    x: 600,
    y: 400,
    bucketId: "bucket",
  });
  state = step(state, {
    type: "resizeVertex",
    id: "thought",
    x: 600,
    y: 400,
    width: 300,
    height: 120,
  });
  state = step(state, {
    type: "resizeVertex",
    id: "bucket",
    x: 550,
    y: 420,
    width: 700,
    height: 500,
  });
  const restored = validateState(
    JSON.parse(archiveBackup(exportArchive(state, 3000))),
  );
  expect(node(restored, "thought")).toMatchObject({
    x: 600,
    y: 400,
    bucketId: "bucket",
    size: { width: 300, height: 120 },
  });
  expect(node(restored, "bucket").size).toEqual({ width: 700, height: 500 });
  for (const [id, width, height] of [
    ["read", 300, 100],
    ["thought", 10, 100],
    ["bucket", 300, 10],
    ["bucket", 20000, 300],
  ] as const)
    expect(() =>
      step(state, { type: "resizeVertex", id, x: 0, y: 0, width, height }),
    ).toThrow(/resize|size/);
});
