import { beforeEach, expect, it, vi } from "vitest";
import { apply } from "../src/domainClient";
import type { State } from "../src/model";
import { parse, stringify } from "yaml";
const { ipc } = vi.hoisted(() => ({ ipc: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: ipc, isTauri: () => false }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
import { DesktopWorkspace, diskPayload, diskState } from "../src/desktop";

function example(): State {
  let state: State = {
    version: 1,
    trees: [],
    nodes: [],
    sessions: [],
    focus: null,
  };
  state = apply(
    state,
    { type: "create", id: "root", title: "Öğuz / Work" },
    1000,
  );
  return apply(
    state,
    {
      type: "edit",
      id: "root",
      title: "Öğuz / Work",
      estimateMinutes: 0,
      notes: "# Markdown\nKeep this text.",
    },
    1001,
  );
}
beforeEach(() => {
  ipc.mockReset();
});
it("round-trips complete YAML metadata and real Markdown content with stable safe filenames", () => {
  const payload = diskPayload(example(), 2000);
  const state = diskState({
    directory: "/tmp/forest",
    yaml: payload.yaml,
    notes: payload.notes,
  });
  expect(state.nodes[0]?.notes).toBe("# Markdown\nKeep this text.");
  expect(payload.yaml).not.toContain("Keep this text");
  const filename = state.nodes[0]!.notesFile!;
  expect(filename).not.toContain("/");
  const renamed = apply(
    state,
    {
      type: "edit",
      id: "root",
      title: "Renamed",
      notes: state.nodes[0]!.notes,
      estimateMinutes: 0,
    },
    3000,
  );
  expect(Object.keys(diskPayload(renamed, 3000).notes)).toEqual([filename]);
  expect(() =>
    diskState({ directory: "/tmp/forest", yaml: payload.yaml, notes: {} }),
  ).toThrow(/Missing Markdown/);
});
it("opens current YAML with omitted continuous session periods and writes explicit intervals", () => {
  const state = apply(
    example(),
    {
      type: "addSession",
      id: "saved",
      nodeId: "root",
      startedAt: 2000,
      durationMs: 2805,
    },
    10000,
  );
  const payload = diskPayload(state, 10000);
  const document = parse(payload.yaml) as {
    sessions: Record<string, unknown>[];
  };
  delete document.sessions[0]!.periods;
  const workspace = new DesktopWorkspace({
    directory: "/tmp/forest",
    yaml: stringify(document),
    notes: payload.notes,
  });
  expect(workspace.getSnapshot().sessions[0]).toEqual(state.sessions[0]);
  const saved = diskPayload(workspace.getSnapshot(), 10000);
  expect(saved.notes).toEqual(payload.notes);
  expect(parse(saved.yaml).sessions[0].periods).toEqual([
    { start: 2000, end: 4805 },
  ]);

  // A duration shorter than its span does not identify the actual pause times.
  document.sessions[0]!.durationMs = 2804;
  expect(() =>
    diskState({
      directory: "/tmp/forest",
      yaml: stringify(document),
      notes: payload.notes,
    }),
  ).toThrow(/pauses/);
  document.sessions[0]!.durationMs = 2805;
  document.sessions[0]!.periods = [];
  expect(() =>
    diskState({
      directory: "/tmp/forest",
      yaml: stringify(document),
      notes: payload.notes,
    }),
  ).toThrow(/intervals must match/);
});
it("does not change visible state when disk writes fail and serializes successful changes", async () => {
  const payload = diskPayload(example(), 2000);
  const workspace = new DesktopWorkspace({
    directory: "/tmp/forest",
    yaml: payload.yaml,
    notes: payload.notes,
  });
  const previous = workspace.getSnapshot();
  expect(workspace.getLastSavedAt()).toBeNull();
  ipc.mockRejectedValueOnce("Disk is full");
  await expect(
    workspace.commit({ type: "create", id: "failed", title: "Failed" }, 3000),
  ).rejects.toBe("Disk is full");
  expect(workspace.getSnapshot()).toBe(previous);
  expect(workspace.getLastSavedAt()).toBeNull();
  ipc.mockImplementation(
    async (
      _command: string,
      args: { request: ReturnType<typeof diskPayload> },
    ) => ({
      directory: "/tmp/forest",
      yaml: args.request.yaml,
      notes: args.request.notes,
    }),
  );
  await Promise.all([
    workspace.commit({ type: "create", id: "a", title: "A" }, 3001),
    workspace.commit({ type: "create", id: "b", title: "B" }, 3002),
  ]);
  for (const [command, args] of ipc.mock.calls) {
    if (command === "desktop_save")
      expect(args).toHaveProperty("directory", "/tmp/forest");
  }
  expect(workspace.getLastSavedAt()).not.toBeNull();
  expect(workspace.getSnapshot().trees.map((tree) => tree.id)).toEqual([
    "root",
    "a",
    "b",
  ]);
});

it("desktop and web exchange the same ZIP in both directions without losing notes or history", async () => {
  const { exportArchive, archiveBackup } = await import("../src/export");
  const { Workspace } = await import("../src/storage");
  let state = example();
  state = apply(
    state,
    { type: "add", id: "child", parentId: "root", title: "Logic" },
    1100,
  );
  state = apply(
    state,
    {
      type: "edit",
      id: "child",
      title: "Logic",
      notes: "# Proofs\nÖğuz ∀ x → x\n",
      estimateMinutes: 25,
    },
    1200,
  );
  state = apply(state, { type: "start", id: "child" }, 2000);
  state = apply(state, { type: "pause" }, 4000);
  state = apply(state, { type: "start", id: "child" }, 6000);
  state = apply(state, { type: "finish", id: "session" }, 8000);
  const payload = diskPayload(state, 9000);
  const desktop = new DesktopWorkspace({
    directory: "/tmp/transfer-test",
    yaml: payload.yaml,
    notes: payload.notes,
  });
  const values = new Map<string, string>();
  const web = new Workspace({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  });
  web.replace(archiveBackup(exportArchive(desktop.getSnapshot(), 10000)));
  expect(web.getSnapshot()).toEqual(desktop.getSnapshot());
  web.commit(
    {
      type: "edit",
      id: "child",
      title: "Edited on web",
      notes: "# Web notes\nPreserve Markdown and Unicode: λ",
      estimateMinutes: 40,
    },
    11000,
  );
  ipc.mockImplementation(
    async (
      command: string,
      args: { request: ReturnType<typeof diskPayload> },
    ) => {
      expect(command).toBe("desktop_save");
      return {
        directory: "/tmp/transfer-test",
        yaml: args.request.yaml,
        notes: args.request.notes,
      };
    },
  );
  await desktop.replace(archiveBackup(exportArchive(web.getSnapshot(), 12000)));
  expect(desktop.getSnapshot()).toEqual(web.getSnapshot());
  expect(desktop.getSnapshot().sessions[0]!.periods).toEqual([
    { start: 2000, end: 4000 },
    { start: 6000, end: 8000 },
  ]);
  expect(
    desktop.getSnapshot().nodes.find((node) => node.id === "child")!.notes,
  ).toContain("λ");
});
