import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DeadlineTimer, HabitProgress } from "./Clock";
import { desktopEnabled } from "./desktop";
import type { Action, GoalNode } from "./model";
import { Icon } from "./icons";
import { isWebsite } from "./vertices";

export function VertexDetails({
  node,
  busy,
  editing,
  configure,
  run,
}: {
  node: GoalNode;
  busy: boolean;
  editing: boolean;
  configure: () => void;
  run: (action: Action) => Promise<boolean>;
}) {
  const [error, setError] = useState("");
  const vertex = node.vertex;
  if (!vertex || vertex.kind === "vanilla" || vertex.kind === "thought")
    return null;
  const finished = node.finishedAt !== undefined;
  return (
    <div className={`vertex-details vertex-details-${vertex.kind}`}>
      <Icon name={vertex.kind} size={18} />
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
          <button
            className="quiet-button"
            disabled={busy || finished}
            onClick={() => {
              void run({ type: "recordHabit", id: node.id });
            }}
          >
            <Icon name="plus" size={14} /> Record repetition
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
            <Icon name="history" size={16} />
          </button>
        </>
      )}
      {editing && !finished && (
        <button
          className="quiet-button vertex-configure"
          disabled={busy}
          onClick={configure}
        >
          <Icon name="pencil" size={14} />{" "}
          {vertex.kind === "deadline"
            ? "Edit deadline"
            : vertex.kind === "habit"
              ? "Edit frequency"
              : "Edit attachment"}
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
