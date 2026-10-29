import { useEffect, useState } from "react";
import type { Action, GoalNode, Vertex } from "./model";
import { Icon } from "./icons";

export function ReadingProgress({
  node,
  vertex,
  busy,
  run,
}: {
  node: GoalNode;
  vertex: Extract<Vertex, { kind: "reading" }>;
  busy: boolean;
  run: (action: Action) => Promise<boolean>;
}) {
  const [percent, setPercent] = useState(vertex.progressPercent ?? 0);
  const [total, setTotal] = useState(vertex.totalPages ?? 0);
  const [pages, setPages] = useState(vertex.pagesRead ?? 0);
  useEffect(() => {
    setPercent(vertex.progressPercent ?? 0);
    setTotal(vertex.totalPages ?? 0);
    setPages(vertex.pagesRead ?? 0);
  }, [vertex.progressPercent, vertex.totalPages, vertex.pagesRead]);
  const disabled = busy || node.finishedAt !== undefined;
  return (
    <form
      className="reading-progress"
      aria-label="Reading progress"
      onSubmit={(event) => {
        event.preventDefault();
        void run({
          type: "configureVertex",
          id: node.id,
          vertex: {
            kind: "reading",
            resource: vertex.resource,
            progressPercent: percent,
            pagesRead: pages,
            ...(total ? { totalPages: total } : {}),
          },
        });
      }}
    >
      <label>
        Progress (%)
        <input
          aria-label="Reading percent"
          type="number"
          min={0}
          max={100}
          step="any"
          required
          disabled={disabled}
          value={percent}
          onChange={(event) => {
            const value = Number(event.target.value);
            setPercent(value);
            if (total) setPages(Math.round((total * value) / 100));
          }}
        />
      </label>
      <label>
        Pages read
        <input
          aria-label="Pages read"
          type="number"
          min={0}
          max={total || undefined}
          step={1}
          required
          disabled={disabled || !total}
          value={pages}
          onChange={(event) => {
            const value = Number(event.target.value);
            setPages(value);
            if (total) setPercent(Math.round((value / total) * 10000) / 100);
          }}
        />
      </label>
      <label>
        Total pages
        <input
          aria-label="Total pages"
          type="number"
          min={1}
          max={4294967295}
          step={1}
          disabled={disabled}
          value={total || ""}
          placeholder="Optional"
          onChange={(event) => {
            const value = Number(event.target.value);
            setTotal(value);
            if (value) setPages(Math.round((value * percent) / 100));
            else setPages(0);
          }}
        />
      </label>
      <button className="quiet-button" disabled={disabled} type="submit">
        <Icon name="check" size={14} /> Save progress
      </button>
      <progress
        aria-label="Saved reading progress"
        max={100}
        value={vertex.progressPercent ?? 0}
      />
    </form>
  );
}
