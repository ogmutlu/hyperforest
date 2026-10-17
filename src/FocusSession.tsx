import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import type { Focus } from "./model";
import { FocusTimer } from "./Clock";
import { ActionMenu } from "./ActionMenu";
import { Icon } from "./icons";

/** Timer size is local presentation state. Only explicit actions change time. */
export function FocusSession({
  focus,
  title,
  color,
  busy,
  error,
  minimized,
  onMinimize,
  onExpand,
  onPause,
  onResume,
  onFinish,
  onDiscard,
}: {
  focus: Focus;
  title: string;
  color: string;
  busy: boolean;
  error: string;
  minimized: boolean;
  onMinimize: () => void;
  onExpand: () => void;
  onPause: () => void;
  onResume: () => void;
  onFinish: () => void;
  onDiscard: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const running = focus.runningSince !== null;
  useEffect(() => {
    if (minimized) dialog.current?.close();
    else if (!dialog.current?.open) {
      dialog.current?.showModal();
      // Start keyboard interaction on the view rather than Minimize, the first
      // button. Tab still visits controls, whose native Space behavior is kept.
      dialog.current?.focus();
    }
  }, [minimized]);
  const discard = (): void => {
    if (confirm("Discard this unsaved focus session?")) onDiscard();
  };
  return (
    <>
      {!minimized && (
        <dialog
          ref={dialog}
          className="focus-screen"
          aria-label="Focus session"
          aria-describedby="focus-shortcuts"
          tabIndex={-1}
          data-running={running}
          onKeyDown={(event) => {
            if (
              event.code !== "Space" ||
              event.ctrlKey ||
              event.altKey ||
              event.metaKey ||
              event.shiftKey ||
              event.nativeEvent.isComposing
            )
              return;
            if (
              event.target instanceof Element &&
              event.target.closest(
                "button, summary, a, input, textarea, select, [role=button], [role=textbox], [contenteditable]:not([contenteditable=false])",
              )
            )
              return;
            event.preventDefault();
            if (!event.repeat && !busy) (running ? onPause : onResume)();
          }}
          style={{ "--node-color": color } as CSSProperties}
          onCancel={(event) => {
            event.preventDefault();
            onMinimize();
          }}
        >
          <button className="quiet-button focus-minimize" onClick={onMinimize}>
            Minimize
          </button>
          <div className="focus-disc" aria-hidden="true" />
          <div className="focus-content">
            <div className="eyebrow">ONE THING. YOUR WHOLE ATTENTION.</div>
            <h2>{title}</h2>
            <div className="focus-timer" data-testid="focus-timer">
              <FocusTimer focus={focus} />
            </div>
            <p className="focus-status" role="status">
              {running ? "Focusing" : "Paused"}
            </p>
            <div className="focus-actions">
              <button
                className="primary-button"
                aria-keyshortcuts="Space"
                disabled={busy}
                onClick={running ? onPause : onResume}
              >
                <Icon name={running ? "pause" : "play"} />
                {running ? "Pause" : "Resume"}
              </button>
              <button
                className="quiet-button"
                disabled={busy}
                onClick={onFinish}
              >
                Save & finish <Icon name="check" />
              </button>
              <ActionMenu label="Session actions">
                <button
                  className="quiet-button danger"
                  disabled={busy}
                  onClick={discard}
                >
                  Discard session
                </button>
              </ActionMenu>
            </div>
            <span className="focus-lineage">{focus.group}</span>
            <small id="focus-shortcuts" className="focus-shortcuts">
              Space to pause/resume · Esc to minimize
            </small>
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
          </div>
        </dialog>
      )}
      {minimized && (
        <section
          className="focus-dock"
          aria-label="Focus timer"
          data-running={running}
        >
          <div className="focus-dock-summary">
            <strong title={title}>{title}</strong>
            <small>
              {running ? "Focusing" : "Paused"} · <FocusTimer focus={focus} />
            </small>
          </div>
          <button
            className="primary-button"
            disabled={busy}
            onClick={running ? onPause : onResume}
          >
            <Icon name={running ? "pause" : "play"} size={16} />
            {running ? "Pause" : "Resume"}
          </button>
          <button className="quiet-button" onClick={onExpand}>
            Expand
          </button>
          <ActionMenu label="Session actions" above>
            <button className="quiet-button" disabled={busy} onClick={onFinish}>
              Save & finish
            </button>
            <button
              className="quiet-button danger"
              disabled={busy}
              onClick={discard}
            >
              Discard session
            </button>
          </ActionMenu>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
        </section>
      )}
    </>
  );
}
