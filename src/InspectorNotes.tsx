import { useState } from "react";
import type { Action, GoalNode } from "./model";
import { Icon } from "./icons";

export function InspectorNotes({
  node,
  busy,
  run,
}: {
  node: GoalNode;
  busy: boolean;
  run: (action: Action) => Promise<boolean>;
}) {
  const [notes, setNotes] = useState(node.notes);
  const [saved, setSaved] = useState(node.notes);
  return (
    <form
      className="inspector-notes"
      onSubmit={(event) => {
        event.preventDefault();
        void run({
          type: "edit",
          id: node.id,
          title: node.title,
          estimateMinutes: node.estimateMinutes,
          notes,
          expected: {
            title: node.title,
            estimateMinutes: node.estimateMinutes,
            notes: saved,
          },
        }).then((success) => {
          if (success) setSaved(notes);
        });
      }}
    >
      <label htmlFor="inspector-notes-text">Notes</label>
      <textarea
        id="inspector-notes-text"
        autoFocus
        aria-label="Vertex notes"
        rows={12}
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        readOnly={node.finishedAt !== undefined}
      />
      <button
        type="submit"
        className="quiet-button"
        disabled={busy || notes === saved || node.finishedAt !== undefined}
      >
        <Icon name="check" size={16} /> Save notes
      </button>
    </form>
  );
}
