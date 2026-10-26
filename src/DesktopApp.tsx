import { useCallback, useEffect, useState, useRef } from "react";
import { connectTray } from "./tray";
import { App } from "./App";
import { TutorialButton } from "./TutorialContext";
import { DesktopSaveStatus } from "./DesktopSaveStatus";
import { chooseDesktop, loadDesktop } from "./desktop";
import type { DesktopWorkspace } from "./desktop";

const ZOOM_KEY = "hyperforest.interface-zoom";
function savedZoom(): number {
  try {
    const value = Number(localStorage.getItem(ZOOM_KEY));
    return Number.isFinite(value) && value >= 0.5 && value <= 2
      ? Math.round(value * 10) / 10
      : 1;
  } catch {
    return 1;
  }
}

export function DesktopApp() {
  const [workspace, setWorkspace] = useState<DesktopWorkspace | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [interfaceZoom, setInterfaceZoom] = useState(savedZoom);
  const requestedZoom = useRef(interfaceZoom);
  const zoomQueue = useRef(Promise.resolve());
  const zoom = useCallback((value: number) => {
    const next = Math.max(0.5, Math.min(2, Math.round(value * 10) / 10));
    requestedZoom.current = next;
    zoomQueue.current = zoomQueue.current
      .then(async () => {
        const { getCurrentWebview } = await import("@tauri-apps/api/webview");
        await getCurrentWebview().setZoom(next);
        setInterfaceZoom(next);
        localStorage.setItem(ZOOM_KEY, String(next));
      })
      .catch((reason: unknown) => {
        setError(String(reason));
      });
  }, []);
  useEffect(() => {
    zoom(requestedZoom.current);
  }, [zoom]);
  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (!event.ctrlKey && !event.metaKey) return;
      if (!["+", "=", "-", "_", "0"].includes(event.key)) return;
      event.preventDefault();
      zoom(
        event.key === "0"
          ? 1
          : requestedZoom.current +
              (["-", "_"].includes(event.key) ? -0.1 : 0.1),
      );
    };
    const wheel = (event: WheelEvent): void => {
      if (
        !event.ctrlKey ||
        event.deltaY === 0 ||
        (event.target instanceof Element && event.target.closest(".graph-svg"))
      )
        return;
      event.preventDefault();
      zoom(requestedZoom.current + (event.deltaY < 0 ? 0.1 : -0.1));
    };
    window.addEventListener("keydown", key);
    document.addEventListener("wheel", wheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", key);
      document.removeEventListener("wheel", wheel);
    };
  }, [zoom]);
  useEffect(() => {
    void loadDesktop()
      .then(setWorkspace)
      .catch((reason: unknown) => setError(String(reason)))
      .finally(() => setReady(true));
  }, []);
  const flush = useCallback(async () => {
    if (!workspace) return;
    try {
      await workspace.flush();
      setError(
        workspace.syncError ??
          workspace.timerError ??
          workspace.backupError ??
          "",
      );
    } catch (reason: unknown) {
      setError(String(reason));
    }
  }, [workspace]);
  useEffect(() => {
    if (!workspace) return;
    void flush();
    const timer = setInterval(() => {
      void flush();
    }, 30000);
    const visible = (): void => {
      if (document.visibilityState === "visible") void flush();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [workspace, flush]);
  useEffect(() => {
    let disposed = false;
    let disconnect: (() => void) | undefined;
    void connectTray(workspace, setError)
      .then((cleanup) => {
        if (disposed) cleanup();
        else disconnect = cleanup;
      })
      .catch((reason: unknown) => setError(String(reason)));
    return () => {
      disposed = true;
      disconnect?.();
    };
  }, [workspace]);
  const choose = async (): Promise<void> => {
    setBusy(true);
    try {
      const next = await chooseDesktop(workspace ?? undefined);
      if (next) {
        setWorkspace(next);
        setError("");
      }
    } catch (reason: unknown) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };
  const zoomControls = (
    <div className="interface-zoom" aria-label="Interface zoom">
      <button
        className="quiet-button"
        aria-label="Zoom interface out"
        title="Ctrl+-"
        disabled={interfaceZoom <= 0.5}
        onClick={() => zoom(requestedZoom.current - 0.1)}
      >
        −
      </button>
      <button
        className="quiet-button"
        aria-label="Reset interface zoom"
        title="Ctrl+0"
        onClick={() => zoom(1)}
      >
        {Math.round(interfaceZoom * 100)}%
      </button>
      <button
        className="quiet-button"
        aria-label="Zoom interface in"
        title="Ctrl++"
        disabled={interfaceZoom >= 2}
        onClick={() => zoom(requestedZoom.current + 0.1)}
      >
        +
      </button>
    </div>
  );
  return (
    <>
      {workspace && (
        <div className="desktop-status-bar">
          <DesktopSaveStatus
            workspace={workspace}
            busy={busy}
            error={error}
            onChoose={() => {
              void choose();
            }}
            onBackup={() => {
              setBusy(true);
              void flush().finally(() => setBusy(false));
            }}
          />
          {zoomControls}
        </div>
      )}
      {error && (
        <div className="desktop-error" role="alert">
          {error}
        </div>
      )}
      {workspace ? (
        <App
          key={workspace.directory}
          workspace={workspace}
          showSaveStatus={false}
        />
      ) : (
        <main className="empty-workspace">
          <h1>hyperforest</h1>
          <p>
            Select a directory for workspace.yaml, Markdown notes, and daily
            backups.
          </p>
          <button
            className="primary-button"
            disabled={busy || !ready}
            onClick={() => {
              void choose();
            }}
          >
            Choose directory
          </button>
          {zoomControls}
          {!ready && <p>Loading…</p>}
          <footer className="page-footer">
            <TutorialButton />
          </footer>
        </main>
      )}
    </>
  );
}
