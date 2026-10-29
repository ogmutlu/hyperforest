import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { Dialog } from "./App";

const schema = z.object({
  enabled: z.boolean(),
  intervalDays: z.number().int().min(1).max(365),
});

export function BackupSettings({
  close,
  configured,
}: {
  close: () => void;
  configured: (timerError: string | null) => void;
}) {
  const [settings, setSettings] = useState({ enabled: true, intervalDays: 7 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let active = true;
    void invoke("desktop_backup_settings")
      .then((value) => {
        const next = schema.parse(value);
        if (active) {
          setSettings(next);
          setLoading(false);
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(String(reason));
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <Dialog
      label="Backup settings"
      close={close}
      className="backup-settings-dialog"
    >
      <h2>Recovery backups</h2>
      <p className="creation-hint">
        Autosave writes your current work on every change. These settings
        control separate recovery snapshots.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          void invoke<string | null>("desktop_set_backup_settings", {
            settings,
          })
            .then((warning) => {
              configured(warning);
              setError(
                warning
                  ? `Settings saved, but the background timer could not be configured: ${warning}`
                  : "",
              );
              setSaved(true);
            })
            .catch((reason: unknown) => setError(String(reason)))
            .finally(() => setBusy(false));
        }}
      >
        <label className="backup-toggle">
          <input
            type="checkbox"
            aria-label="Automatic recovery backups"
            checked={settings.enabled}
            disabled={loading || busy}
            onChange={(event) => {
              setSettings({ ...settings, enabled: event.target.checked });
              setSaved(false);
            }}
          />
          Automatic recovery backups
        </label>
        <label>
          Back up every (days)
          <input
            type="number"
            aria-label="Backup interval in days"
            min={1}
            max={365}
            step={1}
            required
            disabled={loading || busy || !settings.enabled}
            value={settings.intervalDays}
            onChange={(event) => {
              setSettings({
                ...settings,
                intervalDays: Number(event.target.value),
              });
              setSaved(false);
            }}
          />
        </label>
        <p className="creation-hint">
          Default: 7 days (once a week). Keep up to 30 dated recovery snapshots.
          You can also use Back up now.
        </p>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        {saved && !error && (
          <p role="status" className="backup-saved">
            Backup settings saved.
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="quiet-button" onClick={close}>
            Done
          </button>
          <button
            type="submit"
            className="primary-button"
            disabled={loading || busy}
          >
            Save backup settings
          </button>
        </div>
      </form>
    </Dialog>
  );
}
