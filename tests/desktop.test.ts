import { beforeEach, expect, it, vi } from "vitest";
import { apply } from "../src/domain";
import type { State } from "../src/domain";
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
it("does not change visible state when disk writes fail and serializes successful changes", async () => {
  const payload = diskPayload(example(), 2000);
  const workspace = new DesktopWorkspace({
    directory: "/tmp/forest",
    yaml: payload.yaml,
    notes: payload.notes,
  });
  const previous = workspace.getSnapshot();
  ipc.mockRejectedValueOnce("Disk is full");
  await expect(
    workspace.commit({ type: "create", id: "failed", title: "Failed" }, 3000),
  ).rejects.toBe("Disk is full");
  expect(workspace.getSnapshot()).toBe(previous);
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
  expect(workspace.getSnapshot().trees.map((tree) => tree.id)).toEqual([
    "root",
    "a",
    "b",
  ]);
});
