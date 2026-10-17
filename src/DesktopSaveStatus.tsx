import { useId, useSyncExternalStore } from "react";
import type { DesktopWorkspace } from "./desktop";
import { ActionMenu } from "./ActionMenu";

/** Native save details and storage actions stay in the desktop status bar. */
export function DesktopSaveStatus({
  workspace,
  busy,
  error,
  onChoose,
  onBackup,
}: {
  workspace: DesktopWorkspace;
  busy: boolean;
  error: string;
  onChoose: () => void;
  onBackup: () => void;
}) {
  const hintId = useId();
  useSyncExternalStore(workspace.subscribe, workspace.getSnapshot);
  const savedAt = workspace.getLastSavedAt();
  const issue = error || workspace.backupError || workspace.timerError;
  const label = issue
    ? "Needs attention"
    : savedAt === null
      ? "Saving…"
      : "Autosaved";
  const details = (
    <>
      <p>
        Data directory: <span>{workspace.directory}</span>
      </p>
      <p>
        {savedAt === null
          ? "Waiting for first save"
          : `Last saved: ${new Date(savedAt).toLocaleTimeString()}`}
      </p>
      {issue && <p className="storage-issue">{issue}</p>}
    </>
  );
  return (
    <div className="desktop-save-status" data-error={!!issue}>
      <ActionMenu
        label={label}
        descriptionId={hintId}
        trigger={
          <>
            <i aria-hidden="true" />
            {label}
          </>
        }
      >
        <div className="storage-details">{details}</div>
        <button className="quiet-button" disabled={busy} onClick={onChoose}>
          Change directory
        </button>
        <button className="quiet-button" disabled={busy} onClick={onBackup}>
          Back up now
        </button>
      </ActionMenu>
      <div id={hintId} role="tooltip" className="save-details-tooltip">
        {details}
      </div>
    </div>
  );
}
