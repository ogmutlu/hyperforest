import { expect, it } from "vitest";
import { apply, focusElapsed } from "../src/domainClient";
import type { State } from "../src/model";
import { structureYaml } from "../src/export";

it("exports nested structure, escaped names, disconnected vertices and live linked time", async () => {
  let state: State = {
    version: 1,
    trees: [],
    nodes: [],
    sessions: [],
    focus: null,
  };
  state = apply(state, { type: "create", id: "a", title: 'Work: "yes"' }, 1000);
  state = apply(state, { type: "create", id: "b", title: "Other" }, 1001);
  state = apply(
    state,
    {
      type: "add",
      id: "link",
      parentId: "a",
      title: "Linked",
      linkedTreeId: "b",
    },
    1002,
  );
  state = apply(state, { type: "pedantic", treeId: "a", enabled: false }, 1003);
  state = apply(
    state,
    { type: "isolate", id: "alone", treeId: "a", title: "Isolated" },
    1004,
  );
  state = apply(state, { type: "start", id: "b" }, 2000);
  const yaml = structureYaml(state, 65000);
  expect(yaml).toContain('name: "Work: \\"yes\\""');
  expect(yaml).toContain('          - name: "Linked"');
  expect(yaml).toContain('      - name: "Isolated"');
  expect(yaml).toContain('focus_time: "00:01:03"');
  expect(yaml).toContain("focus_milliseconds: 63000");
  expect(yaml).toContain('linked_hypertree: "Other"');
  expect(yaml).toContain("children: []");
  const { format } = await import("prettier");
  await expect(format(yaml, { parser: "yaml" })).resolves.toContain(
    "hypertrees:",
  );
});

it("exports an empty workspace", () => {
  expect(
    structureYaml(
      { version: 1, trees: [], nodes: [], sessions: [], focus: null },
      1000,
    ),
  ).toContain("hypertrees: []");
});

it("archives YAML and every Markdown note, with safe distinct filenames and a restorable backup", async () => {
  const { exportArchive, archiveBackup } = await import("../src/export");
  const { unzipSync, strFromU8 } = await import("fflate");
  let state: State = {
    version: 1,
    trees: [],
    nodes: [],
    sessions: [],
    focus: null,
  };
  state = apply(
    state,
    { type: "create", id: "root", title: "Research/Öğuz" },
    1000,
  );
  state = apply(
    state,
    { type: "add", id: "child", parentId: "root", title: "Read" },
    1001,
  );
  state = apply(
    state,
    {
      type: "edit",
      id: "child",
      title: "Read",
      estimateMinutes: 0,
      notes: "# Notes\nÖğuz: [link](https://example.com)\n",
    },
    1002,
  );
  state = apply(
    state,
    { type: "add", id: "duplicate", parentId: "child", title: "Read" },
    1003,
  );
  const archive = exportArchive(state, 5000);
  const files = unzipSync(archive);
  const { noteNames } = await import("../src/workspaceFiles");
  const names = noteNames(state);
  expect(JSON.parse(archiveBackup(archive))).toEqual({
    ...state,
    nodes: state.nodes.map((node) => ({
      ...node,
      notesFile: names.get(node.id),
    })),
  });
  expect(strFromU8(files["structure.yaml"]!)).toBe(structureYaml(state, 5000));
  expect(files["workspace.yaml"]).toBeDefined();
  expect(Object.keys(files).some((name) => name.endsWith(".json"))).toBe(false);
  expect(
    Object.keys(files).filter((name) => name.endsWith(".md")),
  ).toHaveLength(3);
  expect(strFromU8(files[`notes/${names.get("child")!}`]!)).toBe(
    state.nodes.find((node) => node.id === "child")!.notes,
  );
  expect(names.get("child")).not.toBe(names.get("duplicate"));
});

it("rejects missing notes and unsupported JSON archives", async () => {
  const { archiveBackup } = await import("../src/export");
  const { zipSync, strToU8 } = await import("fflate");
  expect(() =>
    archiveBackup(zipSync({ "hyperforest-backup.json": strToU8("{}") })),
  ).toThrow("workspace.yaml");
});

it("simple.yaml contains only readable hierarchy, durations and goal status", async () => {
  const { simpleYaml, exportArchive } = await import("../src/export");
  const { parse } = await import("yaml");
  const { unzipSync, strFromU8 } = await import("fflate");
  let state: State = {
    version: 1,
    trees: [],
    nodes: [],
    sessions: [],
    focus: null,
  };
  state = apply(
    state,
    { type: "create", id: "technical-root-id", title: "Research" },
    1000,
  );
  state = apply(
    state,
    {
      type: "add",
      id: "technical-leaf-id",
      parentId: "technical-root-id",
      title: "Read",
    },
    1000,
  );
  state = apply(
    state,
    {
      type: "addSession",
      id: "technical-session-id",
      nodeId: "technical-leaf-id",
      startedAt: 2000,
      durationMs: 65000,
    },
    70000,
  );
  const report = simpleYaml(state, 70000);
  expect(parse(report)).toEqual({
    hypertrees: [
      {
        name: "Research",
        focused: "0h1m5s",
        children: [{ name: "Read", focused: "0h1m5s" }],
      },
    ],
  });
  expect(report).not.toMatch(
    /technical-|color|[Ii]d:|[Mm]illiseconds|65000|created/,
  );
  const files = unzipSync(exportArchive(state, 70000));
  expect(strFromU8(files["simple.yaml"]!)).toBe(report);
});

it("portable exports freeze a running timer without pausing or changing the source", async () => {
  const { exportArchive, archiveBackup } = await import("../src/export");
  let state: State = {
    version: 1,
    trees: [],
    nodes: [],
    sessions: [],
    focus: null,
  };
  state = apply(state, { type: "create", id: "root", title: "Research" }, 1000);
  state = apply(state, { type: "start", id: "root" }, 2000);
  state = apply(state, { type: "pause" }, 3000);
  state = apply(state, { type: "start", id: "root" }, 5000);
  const restored = JSON.parse(
    archiveBackup(exportArchive(state, 7000)),
  ) as State;
  expect(restored.focus).toMatchObject({
    runningSince: null,
    elapsedMs: 3000,
    periods: [
      { start: 2000, end: 3000 },
      { start: 5000, end: 7000 },
    ],
  });
  expect(focusElapsed(restored.focus!, 3_600_000)).toBe(3000);
  expect(state.focus).toMatchObject({
    runningSince: 5000,
    elapsedMs: 1000,
    periods: [{ start: 2000, end: 3000 }],
  });
});
