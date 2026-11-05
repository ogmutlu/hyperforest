import { useMemo, useState } from "react";
import { localDay, parseDay } from "./calendar";
import type { Action, GoalNode } from "./model";
import { Icon } from "./icons";

const PAGE_SIZE = 14;
export function HabitHistoryEditor({
  node,
  busy,
  run,
  close,
}: {
  node: GoalNode;
  busy: boolean;
  run: (action: Action) => Promise<boolean>;
  close: () => void;
}) {
  const [original] = useState(() =>
    node.vertex?.kind === "habit" ? [...node.vertex.completions] : [],
  );
  const [records, setRecords] = useState(original);
  const today = localDay(Date.now());
  const [day, setDay] = useState(today);
  const [quantity, setQuantity] = useState(
    String(original.filter((at) => localDay(at) === today).length),
  );
  const [page, setPage] = useState(0);
  const [error, setError] = useState("");
  const finished = node.finishedAt !== undefined;
  const days = useMemo(() => {
    const counts = new Map<string, number>();
    for (const at of records) {
      const day = localDay(at);
      counts.set(day, (counts.get(day) ?? 0) + 1);
    }
    return [...counts].sort(([a], [b]) => b.localeCompare(a));
  }, [records]);
  const lastPage = Math.max(0, Math.ceil(days.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  const selectDay = (next: string) => {
    setDay(next);
    setQuantity(String(records.filter((at) => localDay(at) === next).length));
    setError(
      !parseDay(next) || next < "1970-01-01" || next > today
        ? "Choose a date from 1970 through today."
        : "",
    );
  };
  const changeCount = (value: string) => {
    setQuantity(value);
    const date = parseDay(day),
      count = Number(value);
    if (!date || day < "1970-01-01" || day > today) {
      setError("Choose a date from 1970 through today.");
      return;
    }
    if (
      !value.trim() ||
      !Number.isInteger(count) ||
      count < 0 ||
      count > 100000
    ) {
      setError("Enter a whole number from 0 to 100000.");
      return;
    }
    const existing = records.filter((at) => localDay(at) === day);
    const otherDays = records.filter((at) => localDay(at) !== day);
    if (otherDays.length + count > 100000) {
      setError("A habit can contain at most 100000 repetitions.");
      return;
    }
    // Keep the exact timestamps of retained repetitions; only newly added records
    // use noon on a past day or the current instant for today.
    const kept = existing.slice(0, count);
    const at = day === today ? Date.now() : date.getTime();
    const added = Array.from(
      { length: Math.max(0, count - kept.length) },
      () => at,
    );
    setRecords([...otherDays, ...kept, ...added].sort((a, b) => a - b));
    setError("");
  };
  return (
    <form
      className="habit-history-editor"
      onSubmit={(event) => {
        event.preventDefault();
        void run({
          type: "setHabitHistory",
          id: node.id,
          expected: original,
          completions: records,
        }).then((success) => {
          if (success) close();
        });
      }}
    >
      <h2>Change habit history</h2>
      <p>
        {node.title} · {records.length} repetitions across {days.length}{" "}
        recorded days
      </p>
      <div className="habit-day-editor">
        <label>
          Date
          <input
            type="date"
            aria-label="Habit date"
            min="1970-01-01"
            max={today}
            value={day}
            onChange={(event) => selectDay(event.target.value)}
            required
            disabled={busy || finished}
          />
        </label>
        <label>
          Repetitions
          <input
            type="number"
            aria-label="Repetitions on date"
            min={0}
            max={100000}
            step={1}
            value={quantity}
            onChange={(event) => changeCount(event.target.value)}
            required
            disabled={busy || finished}
          />
        </label>
      </div>
      <p className="vertex-detail-muted">
        Set a day's count to zero to clear it. Other days stay unchanged.
        Changes apply when you save.
      </p>
      <div className="habit-history-days">
        <table aria-label="Recorded habit days">
          <thead>
            <tr>
              <th>Date</th>
              <th>Repetitions</th>
              <th>
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {days
              .slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
              .map(([date, count]) => (
                <tr key={date} className={date === day ? "selected-day" : ""}>
                  <td>{parseDay(date)!.toLocaleDateString()}</td>
                  <td>{count}</td>
                  <td>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Edit habit day ${date}`}
                      title="Edit day"
                      onClick={() => selectDay(date)}
                    >
                      <Icon name="pencil" size={14} />
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {!days.length && <p>No recorded repetitions.</p>}
      </div>
      {days.length > PAGE_SIZE && (
        <div className="habit-history-pagination">
          <button
            type="button"
            className="quiet-button"
            aria-label="Previous habit days"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            Previous
          </button>
          <span>
            Page {currentPage + 1} of {lastPage + 1}
          </span>
          <button
            type="button"
            className="quiet-button"
            aria-label="Next habit days"
            disabled={currentPage === lastPage}
            onClick={() => setPage(currentPage + 1)}
          >
            Next
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <button type="button" className="quiet-button" onClick={close}>
          Cancel
        </button>
        <button
          type="submit"
          className="primary-button"
          disabled={busy || finished || Boolean(error)}
        >
          Save history <Icon name="check" size={16} />
        </button>
      </div>
    </form>
  );
}
