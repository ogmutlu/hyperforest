import type { Page } from "@playwright/test";

/** Mock native file transport, never the domain or archive codec. */
export async function installDesktopMock(
  page: Page,
  initial: {
    directory: string;
    yaml: string | null;
    notes: Record<string, string>;
  } | null = null,
): Promise<void> {
  await page.addInitScript((initial) => {
    if (initial && !localStorage.getItem("test.desktop.files"))
      localStorage.setItem("test.desktop.files", JSON.stringify(initial));
    const callbacks = new Map<number, (event: { payload: string }) => void>();
    const handlers = new Map<number, { event: string; handler: number }>();
    let nextId = 1;
    Object.assign(window, {
      isTauri: true,
      __TAURI_EVENT_PLUGIN_INTERNALS__: {
        unregisterListener: (_event: string, id: number) => handlers.delete(id),
      },
      testTrayAction: (payload: string) => {
        for (const item of handlers.values())
          if (item.event === "hyperforest-tray-action")
            callbacks.get(item.handler)?.({ payload });
      },
      __TAURI_INTERNALS__: {
        transformCallback: (callback: (event: { payload: string }) => void) => {
          const id = nextId++;
          callbacks.set(id, callback);
          return id;
        },
        unregisterCallback: (id: number) => callbacks.delete(id),
        metadata: {
          currentWebview: { label: "main" },
          currentWindow: { label: "main" },
        },
        invoke: async (
          command: string,
          args: {
            directory?: string;
            request?: {
              yaml: string;
              notes: Record<string, string>;
              imported_sessions?: string[];
            };
            value?: number;
            event?: string;
            handler?: number;
            eventId?: number;
            running?: boolean;
            paused?: boolean;
            contents?: number[];
            resource?: string;
            options?: { directory?: boolean };
          },
        ) => {
          const key = "test.desktop.files";
          if (command === "plugin:event|listen") {
            const id = nextId++;
            handlers.set(id, { event: args.event!, handler: args.handler! });
            return id;
          }
          if (command === "plugin:event|unlisten") {
            handlers.delete(args.eventId!);
            return null;
          }
          if (command === "desktop_export_archive") {
            if (localStorage.getItem("test.cancel-export") === "yes")
              return false;
            if (localStorage.getItem("test.fail-export") === "yes")
              throw "No space left on device";
            localStorage.setItem(
              "test.exported-zip",
              JSON.stringify(args.contents),
            );
            return true;
          }
          if (command === "desktop_import_archive")
            return JSON.parse(
              localStorage.getItem("test.import-zip") ?? "null",
            );
          if (command === "desktop_tray_state") {
            localStorage.setItem("test.tray-state", JSON.stringify(args));
            return null;
          }
          if (command === "desktop_quit") {
            localStorage.setItem("test.quit", "yes");
            return null;
          }
          if (command === "desktop_show_window") return null;
          if (command === "plugin:webview|set_webview_zoom") {
            localStorage.setItem("test.zoom", String(args.value));
            return null;
          }
          if (command === "desktop_load")
            return JSON.parse(localStorage.getItem(key) ?? "null");
          if (command === "plugin:dialog|open")
            return args.options?.directory
              ? "/tmp/hyperforest-desktop-test"
              : "/tmp/a reading.pdf";
          if (command === "desktop_select")
            return { directory: args.directory, yaml: null, notes: {} };
          if (command === "desktop_pending_sessions")
            return JSON.parse(localStorage.getItem("test.hiper-inbox") ?? "[]");
          if (command === "desktop_save") {
            if (localStorage.getItem("test.fail-save") === "yes")
              throw new Error("Disk is full");
            if (args.directory !== "/tmp/hyperforest-desktop-test")
              throw new Error("desktop_save requires the selected directory");
            const loaded = {
              directory: "/tmp/hyperforest-desktop-test",
              yaml: args.request!.yaml,
              notes: args.request!.notes,
            };
            localStorage.setItem(key, JSON.stringify(loaded));
            const inbox = JSON.parse(
              localStorage.getItem("test.hiper-inbox") ?? "[]",
            ) as { filename: string; contents: string }[];
            localStorage.setItem(
              "test.hiper-inbox",
              JSON.stringify(
                inbox.filter(
                  (entry) =>
                    !args.request!.imported_sessions?.includes(entry.filename),
                ),
              ),
            );
            return loaded;
          }
          if (command === "desktop_enable_backups") return null;
          if (command === "desktop_open_note") {
            localStorage.setItem("test.opened-note", "yes");
            return null;
          }
          if (command === "desktop_open_resource") {
            localStorage.setItem("test.opened-resource", args.resource!);
            return null;
          }
          throw new Error(`Unexpected command ${command}`);
        },
      },
    });
  }, initial);
}
