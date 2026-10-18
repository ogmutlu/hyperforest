import { expect, it, vi } from "vitest";
import { apply } from "../src/domainClient";
import type { State } from "../src/model";
const { ipc, listeners } = vi.hoisted(() => ({
  ipc: vi.fn(),
  listeners: new Map<string, (event: { payload: string }) => void>(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: ipc, isTauri: () => false }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: async (
    name: string,
    listener: (event: { payload: string }) => void,
  ) => {
    listeners.set(name, listener);
    return () => {
      listeners.delete(name);
    };
  },
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
import { DesktopWorkspace, diskPayload } from "../src/desktop";
import { connectTray } from "../src/tray";

it("tray shows the vertex name, ticks each second, freezes on pause and stops on disconnect", async () => {
  vi.useFakeTimers();
  const time = 100000;
  vi.setSystemTime(time);
  ipc.mockReset();
  let disconnect: (() => void) | undefined;
  try {
    let state: State = {
      version: 1,
      trees: [],
      nodes: [],
      sessions: [],
      focus: null,
    };
    state = apply(
      state,
      { type: "create", id: "root", title: "Work" },
      time - 5000,
    );
    state = apply(state, { type: "start", id: "root" }, time - 4000);
    const payload = diskPayload(state, time);
    const workspace = new DesktopWorkspace({
      directory: "/tmp/tray-test",
      yaml: payload.yaml,
      notes: payload.notes,
    });
    ipc.mockImplementation(
      async (
        command: string,
        args: { request?: ReturnType<typeof diskPayload> },
      ) =>
        command === "desktop_save"
          ? {
              directory: "/tmp/tray-test",
              yaml: args.request!.yaml,
              notes: args.request!.notes,
            }
          : command === "desktop_pending_sessions"
            ? []
            : undefined,
    );
    disconnect = await connectTray(workspace, vi.fn());
    expect(ipc).toHaveBeenLastCalledWith("desktop_tray_state", {
      focusName: "Work",
      timer: "00:00:04",
      running: true,
      paused: false,
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(ipc).toHaveBeenLastCalledWith("desktop_tray_state", {
      focusName: "Work",
      timer: "00:00:05",
      running: true,
      paused: false,
    });
    await workspace.commit({ type: "pause" }, Date.now());
    await vi.advanceTimersByTimeAsync(2000);
    expect(ipc).toHaveBeenLastCalledWith("desktop_tray_state", {
      focusName: "Work",
      timer: "00:00:05",
      running: false,
      paused: true,
    });
    disconnect();
    const calls = ipc.mock.calls.length;
    await vi.advanceTimersByTimeAsync(2000);
    expect(ipc.mock.calls).toHaveLength(calls);
  } finally {
    disconnect?.();
    vi.useRealTimers();
  }
});

it("tray toggles and finishes the shared session and quit pauses and saves before exit", async () => {
  ipc.mockReset();
  const time = Date.now();
  let state: State = {
    version: 1,
    trees: [],
    nodes: [],
    sessions: [],
    focus: null,
  };
  state = apply(
    state,
    { type: "create", id: "root", title: "Work" },
    time - 5000,
  );
  state = apply(state, { type: "start", id: "root" }, time - 4000);
  const payload = diskPayload(state, time);
  const workspace = new DesktopWorkspace({
    directory: "/tmp/tray-test",
    yaml: payload.yaml,
    notes: payload.notes,
  });
  ipc.mockImplementation(
    async (
      command: string,
      args: { request?: ReturnType<typeof diskPayload> },
    ) =>
      command === "desktop_save"
        ? {
            directory: "/tmp/tray-test",
            yaml: args.request!.yaml,
            notes: args.request!.notes,
          }
        : command === "desktop_pending_sessions"
          ? []
          : undefined,
  );
  const report = vi.fn();
  const disconnect = await connectTray(workspace, report);
  const action = listeners.get("hyperforest-tray-action")!;
  action({ payload: "toggle-focus" });
  await vi.waitFor(() =>
    expect(workspace.getSnapshot().focus?.runningSince).toBeNull(),
  );
  expect(workspace.getSnapshot().focus!.elapsedMs).toBeGreaterThanOrEqual(4000);
  action({ payload: "toggle-focus" });
  await vi.waitFor(() =>
    expect(workspace.getSnapshot().focus?.runningSince).not.toBeNull(),
  );
  const saves = ipc.mock.calls.filter(
    ([command]) => command === "desktop_save",
  ).length;
  action({ payload: "toggle-focus" });
  action({ payload: "toggle-focus" });
  await vi.waitFor(() =>
    expect(
      ipc.mock.calls.filter(([command]) => command === "desktop_save"),
    ).toHaveLength(saves + 2),
  );
  expect(workspace.getSnapshot().focus?.runningSince).not.toBeNull();
  action({ payload: "finish" });
  await vi.waitFor(() => expect(workspace.getSnapshot().focus).toBeNull());
  expect(workspace.getSnapshot().sessions).toHaveLength(1);
  await workspace.commit({ type: "start", id: "root" }, Date.now());
  action({ payload: "quit" });
  await vi.waitFor(() =>
    expect(ipc.mock.calls.some(([command]) => command === "desktop_quit")).toBe(
      true,
    ),
  );
  expect(workspace.getSnapshot().focus?.runningSince).toBeNull();
  expect(report).not.toHaveBeenCalled();
  disconnect();
  expect(listeners.size).toBe(0);
});

it("a failed save prevents quit and reopens the window", async () => {
  ipc.mockReset();
  listeners.clear();
  const time = Date.now();
  let state: State = {
    version: 1,
    trees: [],
    nodes: [],
    sessions: [],
    focus: null,
  };
  state = apply(
    state,
    { type: "create", id: "root", title: "Work" },
    time - 5000,
  );
  state = apply(state, { type: "start", id: "root" }, time - 4000);
  const payload = diskPayload(state, time);
  const workspace = new DesktopWorkspace({
    directory: "/tmp/tray-test",
    yaml: payload.yaml,
    notes: payload.notes,
  });
  ipc.mockImplementation(async (command: string) => {
    if (command === "desktop_pending_sessions") return [];
    if (command === "desktop_save") throw new Error("Disk full");
  });
  const report = vi.fn();
  const disconnect = await connectTray(workspace, report);
  listeners.get("hyperforest-tray-action")!({ payload: "finish" });
  await vi.waitFor(() =>
    expect(report).toHaveBeenCalledWith("Error: Disk full"),
  );
  expect(workspace.getSnapshot().focus?.runningSince).not.toBeNull();
  expect(workspace.getSnapshot().sessions).toHaveLength(0);
  report.mockClear();
  listeners.get("hyperforest-tray-action")!({ payload: "quit" });
  await vi.waitFor(() =>
    expect(report).toHaveBeenCalledWith("Error: Disk full"),
  );
  expect(ipc.mock.calls.some(([command]) => command === "desktop_quit")).toBe(
    false,
  );
  expect(
    ipc.mock.calls.some(([command]) => command === "desktop_show_window"),
  ).toBe(true);
  expect(workspace.getSnapshot().focus?.runningSince).not.toBeNull();
  disconnect();
});

it("starting from an idle tray opens the app to choose a goal", async () => {
  ipc.mockReset();
  const report = vi.fn();
  const disconnect = await connectTray(null, report);
  try {
    listeners.get("hyperforest-tray-action")!({ payload: "toggle-focus" });
    await vi.waitFor(() =>
      expect(ipc).toHaveBeenCalledWith("desktop_show_window"),
    );
    expect(ipc.mock.calls.some(([command]) => command === "desktop_save")).toBe(
      false,
    );
    expect(report).not.toHaveBeenCalled();
  } finally {
    disconnect();
  }
});
