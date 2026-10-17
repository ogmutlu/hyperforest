import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { DesktopWorkspace } from "./desktop";
import { focusElapsed } from "./domainClient";
import { formatTime } from "./presentation";

export async function connectTray(
  workspace: DesktopWorkspace | null,
  report: (error: string) => void,
): Promise<() => void> {
  let quitting = false;
  let connected = true;
  let updates: Promise<void> = Promise.resolve();
  let actions: Promise<void> = Promise.resolve();
  const sync = (): void => {
    const snapshot = workspace?.getSnapshot();
    const focus = snapshot?.focus;
    const payload = {
      focusName: focus
        ? (snapshot?.nodes.find((vertex) => vertex.id === focus.nodeId)
            ?.title ?? focus.title)
        : "No active focus",
      timer: formatTime(focus ? focusElapsed(focus, Date.now()) : 0),
      running: !!focus && focus.runningSince !== null,
      paused: !!focus && focus.runningSince === null,
    };
    updates = updates
      .then(async () => {
        if (connected) await invoke("desktop_tray_state", payload);
      })
      .catch((reason: unknown) => report(String(reason)));
  };
  const unlisten = await listen<string>("hyperforest-tray-action", (event) => {
    actions = actions
      .then(async () => {
        if (!connected || quitting) return;
        const focus = workspace?.getSnapshot().focus;
        if (event.payload === "toggle-focus") {
          if (!focus) await invoke("desktop_show_window");
          else
            await workspace!.commit(
              focus.runningSince === null
                ? { type: "start", id: focus.nodeId }
                : { type: "pause" },
              Date.now(),
            );
        }
        if (event.payload === "finish" && focus)
          await workspace!.commit(
            { type: "finish", id: crypto.randomUUID() },
            Date.now(),
          );
        if (event.payload === "quit") {
          quitting = true;
          if (focus && focus.runningSince !== null)
            await workspace!.commit({ type: "pause" }, Date.now());
          await workspace?.flush();
          await invoke("desktop_quit");
        }
      })
      .catch((reason: unknown) => {
        quitting = false;
        report(String(reason));
        void invoke("desktop_show_window").catch(() => {});
      });
  });
  const unsubscribe = workspace?.subscribe(sync);
  const interval = setInterval(sync, 1000);
  sync();
  return () => {
    connected = false;
    clearInterval(interval);
    unsubscribe?.();
    unlisten();
  };
}
