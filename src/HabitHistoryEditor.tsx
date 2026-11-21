import { useMemo, useState } from "react";
import { localDay, parseDay } from "./calendar";
import type { Action, GoalNode, HabitEntry } from "./model";
import { formatHabitTime, formatHabitValue, parseHabitTime } from "./vertices";
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
  const vertex = node.vertex?.kind === "habit" ? node.vertex : null;
  const measure = vertex?.measure;
  const [original] = useState(() => (vertex ? [...vertex.completions] : []));
  const [originalEntries] = useState<HabitEntry[]>(() =>
    vertex?.entries ? vertex.entries.map((entry) => ({ ...entry })) : [],
  );
  const [records, setRecords] = useState(original);
  const [entries, setEntries] = useState<HabitEntry[]>(originalEntries);
  const today = localDay(Date.now());
  const [day, setDay] = useState(today);
  const [quantity, setQuantity] = useState(
    String(original.filter((at) => localDay(at) === today).length),
  );
  const [newValue, setNewValue] = useState(() =>
    measure?.valueKind === "timeOfDay" ? formatHabitTime(measure.target) : "",
  );
  const [page, setPage] = useState(0);
  const [error, setError] = useState("");
  const finished = node.finishedAt !== undefined;

  const days = useMemo(() => {
    const counts = new Map<string, number>();
    for (const at of records) {
      const d = localDay(at);
      counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    return [...counts].sort(([a], [b]) => b.localeCompare(a));
  }, [records]);

  const valuedDays = useMemo(() => {
    const map = new Map<string, HabitEntry[]>();
    for (const entry of entries) {
      const d = localDay(entry.at);
      const list = map.get(d) ?? [];
      list.push(entry);
      map.set(d, list);
    }
    return [...map].sort(([a], [b]) => b.localeCompare(a));
  }, [entries]);

  const rowCount = measure ? valuedDays.length : days.length;
  const lastPage = Math.max(0, Math.ceil(rowCount / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);

  const selectDay = (next: string) => {
    setDay(next);
    if (!measure) {
      setQuantity(String(records.filter((at) => localDay(at) === next).length));
    }
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
    const kept = existing.slice(0, count);
    const at = day === today ? Date.now() : date.getTime();
    const added = Array.from(
      { length: Math.max(0, count - kept.length) },
      () => at,
    );
    setRecords([...otherDays, ...kept, ...added].sort((a, b) => a - b));
    setError("");
  };

  const addValuedEntry = () => {
    if (!measure) return;
    const date = parseDay(day);
    if (!date || day < "1970-01-01" || day > today) {
      setError("Choose a date from 1970 through today.");
      return;
    }
    const parsed =
      measure.valueKind === "timeOfDay"
        ? parseHabitTime(newValue)
        : newValue.trim() === ""
          ? null
          : Number(newValue);
    if (
      parsed === null ||
      !Number.isFinite(parsed) ||
      parsed < 0 ||
      (measure.valueKind === "number" && parsed > 1000000000)
    ) {
      setError(
        measure.valueKind === "timeOfDay"
          ? "Enter a valid time (HH:MM)."
          : "Enter a nonnegative number up to 1000000000.",
      );
      return;
    }
    if (entries.length >= 100000) {
      setError("A habit can contain at most 100000 entries.");
      return;
    }
    const at = day === today ? Date.now() : date.getTime();
    setEntries([...entries, { at, value: parsed }].sort((a, b) => a.at - b.at));
    if (measure.valueKind === "number") setNewValue("");
    setError("");
  };

  const selectedDayEntries = measure
    ? entries
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => localDay(entry.at) === day)
    : [];

  return (
    <form
      className="habit-history-editor"
      onSubmit={(event) => {
        event.preventDefault();
        const action: Action = measure
          ? {
              type: "setHabitHistory",
              id: node.id,
              entries,
              expectedEntries: originalEntries,
            }
          : {
              type: "setHabitHistory",
              id: node.id,
              expected: original,
              completions: records,
            };
        void run(action).then((success) => {
          if (success) close();
        });
      }}
    >
      <h2>Change habit history</h2>
      <p>
        {node.title} ·{" "}
        {measure
          ? `${entries.length} entries across ${valuedDays.length} recorded days`
          : `${records.length} repetitions across ${days.length} recorded days`}
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
        {!measure ? (
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
        ) : (
          <div className="habit-day-value-add">
            <label>
              {measure.valueKind === "timeOfDay" ? "Time" : "Value"}
              {measure.valueKind === "timeOfDay" ? (
                <input
                  type="time"
                  aria-label="Value on date"
                  value={newValue}
                  onChange={(event) => setNewValue(event.target.value)}
                  disabled={busy || finished}
                />
              ) : (
                <input
                  type="number"
                  aria-label="Value on date"
                  min={0}
                  max={1000000000}
                  step="any"
                  placeholder={measure.unit || "Value"}
                  value={newValue}
                  onChange={(event) => setNewValue(event.target.value)}
                  disabled={busy || finished}
                />
              )}
            </label>
            <button
              type="button"
              className="quiet-button"
              disabled={busy || finished}
              onClick={addValuedEntry}
            >
              <Icon name="plus" size={14} /> Add entry
            </button>
          </div>
        )}
      </div>
      {measure && (
        <div className="habit-day-entries">
          {selectedDayEntries.length ? (
            <ul>
              {selectedDayEntries.map(({ entry, index }) => (
                <li key={`${entry.at}-${index}`}>
                  <span>{formatHabitValue(measure, entry.value)}</span>
                  <button
                    type="button"
                    className="icon-button danger"
                    aria-label={`Remove entry ${formatHabitValue(measure, entry.value)}`}
                    disabled={busy || finished}
                    onClick={() =>
                      setEntries((prev) => prev.filter((_, i) => i !== index))
                    }
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="vertex-detail-muted">No entries on {day}.</p>
          )}
        </div>
      )}
      <p className="vertex-detail-muted">
        {measure
          ? "Add or remove entries for any date. Other days stay unchanged. Changes apply when you save."
          : "Set a day's count to zero to clear it. Other days stay unchanged. Changes apply when you save."}
      </p>
      <div className="habit-history-days">
        <table aria-label="Recorded habit days">
          <thead>
            <tr>
              <th>Date</th>
              <th>{measure ? "Recorded" : "Repetitions"}</th>
              <th>
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {!measure
              ? days
                  .slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
                  .map(([date, count]) => (
                    <tr
                      key={date}
                      className={date === day ? "selected-day" : ""}
                    >
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
                  ))
              : valuedDays
                  .slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
                  .map(([date, list]) => {
                    const summary =
                      measure.valueKind === "timeOfDay"
                        ? list.map((e) => formatHabitTime(e.value)).join(", ")
                        : (measure.aggregate ?? "sum") === "sum"
                          ? formatHabitValue(
                              measure,
                              list.reduce((sum, e) => sum + e.value, 0),
                            )
                          : list
                              .map((e) => formatHabitValue(measure, e.value))
                              .join(", ");
                    return (
                      <tr
                        key={date}
                        className={date === day ? "selected-day" : ""}
                      >
                        <td>{parseDay(date)!.toLocaleDateString()}</td>
                        <td>{summary}</td>
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
                    );
                  })}
          </tbody>
        </table>
        {rowCount === 0 && (
          <p>{measure ? "No recorded entries." : "No recorded repetitions."}</p>
        )}
      </div>
      {rowCount > PAGE_SIZE && (
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
