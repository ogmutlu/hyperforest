import { useEffect, useMemo, useRef, useState } from "react";
import type { Action, State } from "./model";
import { historyStatistics } from "./domainClient";
import {
  historyDays,
  localDateTime,
  localDay,
  matchingSessionIndices,
  parseDay,
} from "./calendar";
import { formatTime, shortTime } from "./presentation";
import { Icon } from "./icons";
import { DateField } from "./DateField";
import { loadHistoryRange, saveHistoryRange } from "./historyRange";

const PAGE_SIZE = 100;

/** Presentation and editing of the saved ledger. Rust computes every statistic. */
export function SessionHistory({
  state,
  busy,
  selectedNodeId,
  run,
}: {
  state: State;
  busy: boolean;
  selectedNodeId: string | undefined;
  run: (action: Action) => Promise<boolean>;
}) {
  const [range, setRange] = useState(loadHistoryRange);
  const { from: historyFrom, to: historyTo } = range;
  const setHistoryFrom = (from: string): void =>
    setRange((range) => ({ ...range, from }));
  const setHistoryTo = (to: string): void =>
    setRange((range) => ({ ...range, to }));
  useEffect(() => {
    saveHistoryRange(range);
  }, [range]);
  const [historySubject, setHistorySubject] = useState("");
  const [changingHistory, setChangingHistory] = useState(false);
  const [addingSession, setAddingSession] = useState(false);
  const [manualNode, setManualNode] = useState("");
  const [manualStart, setManualStart] = useState("");
  const [manualHours, setManualHours] = useState("0");
  const [manualMinutes, setManualMinutes] = useState("30");
  const [manualSeconds, setManualSeconds] = useState("0");
  const [deletingSession, setDeletingSession] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const today = localDay(Date.now());
  const result = useMemo(() => {
    try {
      const boundaries = historyDays(
        state.sessions,
        historyFrom,
        historyTo,
        Date.now(),
      );
      const stats = historyStatistics(
        state,
        matchingSessionIndices(state.sessions, historySubject),
        boundaries,
      );
      return { boundaries, stats, error: "" };
    } catch (reason: unknown) {
      return { boundaries: [], stats: null, error: String(reason) };
    }
  }, [state, historyFrom, historyTo, historySubject]);
  const { stats, boundaries } = result;
  const sessions = useMemo(
    () =>
      [...(stats?.sessions ?? [])].sort(
        (a, b) =>
          state.sessions[b.index]!.startedAt -
            state.sessions[a.index]!.startedAt || b.index - a.index,
      ),
    [state.sessions, stats],
  );
  const pages = Math.max(1, Math.ceil(sessions.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroll.current?.scrollTo({ top: 0 });
  }, [currentPage, historyFrom, historyTo, historySubject]);
  const visible = sessions.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  );
  const clearFilters = (): void => {
    setHistoryFrom("");
    setHistoryTo("");
    setHistorySubject("");
    setPage(0);
  };
  return (
    <div className="history-content">
      <header className="history-heading">
        <div>
          <h2>Session history</h2>
          <p>Saved sessions across all hypertrees</p>
        </div>
        <div className="history-controls">
          <button
            className="quiet-button"
            aria-pressed={changingHistory}
            disabled={busy}
            onClick={() => {
              setChangingHistory(!changingHistory);
              setAddingSession(false);
              setDeletingSession(null);
            }}
          >
            {changingHistory ? "Done changing history" : "Change history"}
          </button>
          {changingHistory && (
            <button
              className="quiet-button"
              disabled={busy || !state.nodes.length}
              onClick={() => {
                setManualNode(selectedNodeId ?? state.nodes[0]?.id ?? "");
                setManualStart(localDateTime(Date.now() - 1800000));
                setManualHours("0");
                setManualMinutes("30");
                setManualSeconds("0");
                setAddingSession(true);
              }}
            >
              Add session
            </button>
          )}
        </div>
      </header>
      <div className="history-scroll" ref={scroll}>
        <div className="history-filters">
          <DateField
            label="From date"
            min="1970-01-01"
            max={parseDay(historyTo) ? historyTo : today}
            value={historyFrom}
            onChange={(value) => {
              setHistoryFrom(value);
              setPage(0);
            }}
          />
          <DateField
            label="To date"
            min={parseDay(historyFrom) ? historyFrom : "1970-01-01"}
            max={today}
            value={historyTo}
            onChange={(value) => {
              setHistoryTo(value);
              setPage(0);
            }}
          />
          <label>
            Subject
            <input
              type="search"
              value={historySubject}
              placeholder="Any title or hypertree"
              list="history-subjects"
              onChange={(event) => {
                setHistorySubject(event.target.value);
                setPage(0);
              }}
            />
          </label>
          <datalist id="history-subjects">
            {[...new Set(state.sessions.map((session) => session.group))].map(
              (group) => (
                <option key={group} value={group} />
              ),
            )}
          </datalist>
          <button className="quiet-button" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
        {result.error && (
          <p className="inline-error" role="alert">
            {result.error}
          </p>
        )}
        {stats && (
          <>
            <dl className="history-statistics" aria-label="History statistics">
              {[
                ["Total focus", shortTime(stats.totalMs)],
                ["Average per day", shortTime(stats.averageDayMs)],
                ["Sessions", String(stats.sessions.length)],
                ["Calendar days", String(stats.dailyMs.length)],
                ["Average session", shortTime(stats.averageSessionMs)],
                ["Longest session", shortTime(stats.longestSessionMs)],
                ["Active days", String(stats.activeDays)],
                ["Average per active day", shortTime(stats.averageActiveDayMs)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <p className="history-explanation">
              {localDay(boundaries[0]!)} – {localDay(boundaries.at(-2)!)} ·
              Focus is clipped to this range. Daily average includes zero-focus
              days. Unsaved sessions are excluded.
            </p>
          </>
        )}
        {changingHistory && addingSession && (
          <form
            className="manual-session"
            onSubmit={(event) => {
              event.preventDefault();
              const durationMs =
                (Number(manualHours) * 3600 +
                  Number(manualMinutes) * 60 +
                  Number(manualSeconds)) *
                1000;
              void run({
                type: "addSession",
                id: crypto.randomUUID(),
                nodeId: manualNode,
                startedAt: new Date(manualStart).getTime(),
                durationMs,
              }).then((success) => {
                if (success) {
                  setAddingSession(false);
                  setPage(0);
                }
              });
            }}
          >
            <label>
              Session subject
              <select
                aria-label="Session subject"
                value={manualNode}
                required
                disabled={busy}
                onChange={(event) => setManualNode(event.target.value)}
              >
                {state.trees.map((item) => (
                  <optgroup key={item.id} label={item.title}>
                    {state.nodes
                      .filter((goal) => goal.treeId === item.id)
                      .map((goal) => (
                        <option key={goal.id} value={goal.id}>
                          {goal.title}
                          {goal.finishedAt !== undefined ? " (finished)" : ""}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <div className="manual-start">
              <DateField
                label="Session start date"
                min="1970-01-01"
                max={today}
                required
                disabled={busy}
                value={manualStart.split("T")[0] ?? ""}
                onChange={(value) =>
                  setManualStart(
                    `${value}T${manualStart.split("T")[1] || "00:00"}`,
                  )
                }
              />
              <label>
                Start time
                <input
                  type="time"
                  required
                  disabled={busy}
                  value={manualStart.split("T")[1] ?? ""}
                  max={
                    manualStart.split("T")[0] === today
                      ? localDateTime(Date.now()).slice(11)
                      : undefined
                  }
                  onChange={(event) =>
                    setManualStart(
                      `${manualStart.split("T")[0] ?? today}T${event.target.value}`,
                    )
                  }
                />
              </label>
            </div>
            <div className="session-duration">
              <label>
                Hours
                <input
                  type="number"
                  required
                  min="0"
                  step="1"
                  value={manualHours}
                  disabled={busy}
                  onChange={(event) => setManualHours(event.target.value)}
                />
              </label>
              <label>
                Minutes
                <input
                  type="number"
                  required
                  min="0"
                  max="59"
                  step="1"
                  value={manualMinutes}
                  disabled={busy}
                  onChange={(event) => setManualMinutes(event.target.value)}
                />
              </label>
              <label>
                Seconds
                <input
                  type="number"
                  required
                  min="0"
                  max="59"
                  step="1"
                  value={manualSeconds}
                  disabled={busy}
                  onChange={(event) => setManualSeconds(event.target.value)}
                />
              </label>
            </div>
            <div className="history-controls">
              <button className="primary-button" type="submit" disabled={busy}>
                Save session
              </button>
              <button
                className="quiet-button"
                type="button"
                disabled={busy}
                onClick={() => setAddingSession(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <p className="history-count" role="status">
          {sessions.length} of {state.sessions.length} sessions
        </p>
        <div className="history-list" tabIndex={0} aria-label="Saved sessions">
          {visible.length ? (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Start</th>
                  <th>Subject</th>
                  <th>Hypertree</th>
                  <th className="history-duration">Focus in range</th>
                  <th className="history-duration">Full session</th>
                  {changingHistory && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {visible.map(({ index, durationMs }) => {
                  const session = state.sessions[index]!;
                  return (
                    <tr key={session.id}>
                      <td>
                        <time
                          dateTime={new Date(session.startedAt).toISOString()}
                        >
                          {new Date(session.startedAt).toLocaleDateString()}
                        </time>
                      </td>
                      <td>
                        {new Date(session.startedAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="history-subject">{session.title}</td>
                      <td>{session.group}</td>
                      <td className="history-duration">
                        {formatTime(durationMs)}
                      </td>
                      <td className="history-duration">
                        {formatTime(session.durationMs)}
                      </td>
                      {changingHistory && (
                        <td>
                          {deletingSession === session.id ? (
                            <div className="history-controls">
                              <button
                                className="quiet-button danger"
                                disabled={busy}
                                onClick={() => {
                                  void run({
                                    type: "deleteSession",
                                    id: session.id,
                                  }).then((success) => {
                                    if (success) setDeletingSession(null);
                                  });
                                }}
                              >
                                Confirm delete
                              </button>
                              <button
                                className="quiet-button"
                                disabled={busy}
                                onClick={() => setDeletingSession(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              className="icon-button danger"
                              aria-label={`Delete session ${session.title}`}
                              disabled={busy}
                              onClick={() => setDeletingSession(session.id)}
                            >
                              <Icon name="trash" />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p>
              {state.sessions.length
                ? "No sessions match these filters."
                : "Your saved sessions will appear here. Start small."}
            </p>
          )}
        </div>
      </div>
      <footer className="history-pagination">
        <span>
          {sessions.length
            ? `${currentPage * PAGE_SIZE + 1}–${Math.min((currentPage + 1) * PAGE_SIZE, sessions.length)} of ${sessions.length}`
            : "0 sessions"}
        </span>
        <div className="history-controls">
          <button
            className="quiet-button"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            Previous page
          </button>
          <span>
            Page {currentPage + 1} of {pages}
          </span>
          <button
            className="quiet-button"
            disabled={currentPage + 1 >= pages}
            onClick={() => setPage(currentPage + 1)}
          >
            Next page
          </button>
        </div>
      </footer>
    </div>
  );
}
