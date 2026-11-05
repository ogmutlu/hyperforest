import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DeadlineTimer, HabitProgress } from "./Clock";
import { desktopEnabled } from "./desktop";
import type { Action, GoalNode } from "./model";
import { Icon } from "./icons";
import { isWebsite } from "./vertices";
import { HabitHistory } from "./HabitHistory";
import { ReadingProgress } from "./ReadingProgress";

export function VertexDetails({
  node,
  busy,
  editing,
  configure,
  changeHistory,
  run,
}: {
  node: GoalNode;
  busy: boolean;
  editing: boolean;
  configure: () => void;
  changeHistory: () => void;
  run: (action: Action) => Promise<boolean>;
}) {
  const [error, setError] = useState("");
  const vertex = node.vertex;
  if (!vertex || vertex.kind === "vanilla") return null;
  const finished = node.finishedAt !== undefined;
  return (
    <div className={`vertex-details vertex-details-${vertex.kind}`}>
      <Icon name={vertex.kind} size={18} />
      {vertex.kind === "bucket" && (
        <span>
          Drop vertices into this bucket. Drag its border to move the group;
          drag a vertex out to release it.
        </span>
      )}
      {vertex.kind === "thought" && (
        <button className="quiet-button" disabled={busy} onClick={configure}>
          <Icon name="pencil" size={14} />{" "}
          {finished ? "View thought" : "Edit thought"}
        </button>
      )}
      {vertex.kind === "deadline" && (
        <>
          <time
            className="deadline-countdown"
            aria-label="Deadline countdown"
            dateTime={new Date(vertex.deadlineAt).toISOString()}
          >
            <DeadlineTimer deadlineAt={vertex.deadlineAt} />
          </time>
          <span className="vertex-detail-muted">
            Due {new Date(vertex.deadlineAt).toLocaleString()}
          </span>
        </>
      )}
      {vertex.kind === "reading" && (
        <>
          <span className="reading-resource" title={vertex.resource}>
            {vertex.resource || "No attachment yet"}
          </span>
          {vertex.resource &&
            (desktopEnabled ? (
              <button
                className="quiet-button"
                disabled={busy}
                onClick={() => {
                  void invoke("desktop_open_resource", {
                    resource: vertex.resource,
                  })
                    .then(() => setError(""))
                    .catch((reason: unknown) => setError(String(reason)));
                }}
              >
                Open attachment <Icon name="external" size={14} />
              </button>
            ) : isWebsite(vertex.resource) ? (
              <a
                className="quiet-button"
                href={vertex.resource}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open website <Icon name="external" size={14} />
              </a>
            ) : (
              <span className="vertex-detail-muted">
                Open this file from the desktop app.
              </span>
            ))}
          {editing && !finished && (
            <button
              className="quiet-button vertex-configure"
              disabled={busy}
              onClick={configure}
            >
              <Icon name="pencil" size={14} /> Edit attachment
            </button>
          )}
          <ReadingProgress node={node} vertex={vertex} busy={busy} run={run} />
        </>
      )}
      {vertex.kind === "habit" && (
        <>
          <span className="habit-progress" aria-label="Habit progress">
            <HabitProgress vertex={vertex} />
          </span>
          <span className="vertex-detail-muted">
            {vertex.completions.length} total
          </span>
          <div
            className="habit-actions"
            role="group"
            aria-label="Habit actions"
          >
            <button
              className="icon-button hover-label-button"
              aria-label="Record repetition"
              title="Record repetition"
              disabled={busy || finished}
              onClick={() => {
                void run({ type: "recordHabit", id: node.id });
              }}
            >
              <Icon name="plus" size={16} />
              <span className="hover-label" aria-hidden="true">
                Record repetition
              </span>
            </button>
            <button
              className="icon-button"
              aria-label="Undo last repetition"
              title="Undo last repetition"
              disabled={busy || finished || !vertex.completions.length}
              onClick={() => {
                void run({ type: "recordHabit", id: node.id, undo: true });
              }}
            >
              <Icon name="undo" size={16} />
            </button>
            <HabitHistory
              completions={vertex.completions}
              {...(!finished ? { changeHistory } : {})}
            />
            <button
              className="icon-button hover-label-button"
              aria-label="Change habit history"
              title="Change habit history"
              disabled={busy || finished}
              onClick={changeHistory}
            >
              <Icon name="pencil" size={16} />
              <span className="hover-label" aria-hidden="true">
                Change history
              </span>
            </button>
          </div>
        </>
      )}
      {!finished &&
        (vertex.kind === "deadline" ||
          (editing && vertex.kind === "habit")) && (
          <button
            className="quiet-button vertex-configure"
            disabled={busy}
            onClick={configure}
          >
            <Icon name="pencil" size={14} />{" "}
            {vertex.kind === "deadline" ? "Change deadline" : "Edit frequency"}
          </button>
        )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
