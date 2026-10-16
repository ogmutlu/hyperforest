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
  const sync = (): void => {
    const snapshot = workspace?.getSnapshot();
    const focus = snapshot?.focus;
    void invoke("desktop_tray_state", {
      focusName: focus
        ? (snapshot?.nodes.find((vertex) => vertex.id === focus.nodeId)
            ?.title ?? focus.title)
        : "No active focus",
      timer: formatTime(focus ? focusElapsed(focus, Date.now()) : 0),
      running: !!focus && focus.runningSince !== null,
      paused: !!focus && focus.runningSince === null,
    }).catch((reason: unknown) => report(String(reason)));
  };
  const unlisten = await listen<string>("hyperforest-tray-action", (event) => {
    void (async () => {
      if (quitting) return;
      const focus = workspace?.getSnapshot().focus;
      if (event.payload === "pause" && focus && focus.runningSince !== null)
        await workspace!.commit({ type: "pause" }, Date.now());
      if (event.payload === "resume" && focus && focus.runningSince === null)
        await workspace!.commit(
          { type: "start", id: focus.nodeId },
          Date.now(),
        );
      if (event.payload === "quit") {
        quitting = true;
        if (focus && focus.runningSince !== null)
          await workspace!.commit({ type: "pause" }, Date.now());
        await workspace?.flush();
        await invoke("desktop_quit");
      }
    })().catch((reason: unknown) => {
      quitting = false;
      report(String(reason));
      void invoke("desktop_show_window").catch(() => {});
    });
  });
  const unsubscribe = workspace?.subscribe(sync);
  const interval = setInterval(sync, 1000);
  sync();
  return () => {
    clearInterval(interval);
    unsubscribe?.();
    unlisten();
  };
}
