import { useEffect, useMemo, useRef, useState } from "react";
import type { Action, State } from "./model";
import { historyStatistics } from "./domainClient";
import {
  focusDay,
  focusMonthDayBoundaries,
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

const FOCUS_COLOR_TIERS = [
  { label: "—", color: "#A4A9B3", text: "#0b1017" },
  { label: "0.0–1.9h", color: "#DC0C00", text: "#ffffff" },
  { label: "2.0–3.9h", color: "#ED7E07", text: "#0b1017" },
  { label: "4.0–4.9h", color: "#D9AF00", text: "#0b1017" },
  { label: "5.0–5.9h", color: "#00C424", text: "#0b1017" },
  { label: "6.0–7.4h", color: "#00ADC4", text: "#0b1017" },
  { label: "7.5h+", color: "#374DF5", text: "#ffffff" },
] as const;

function focusDayColor(ms: number): {
  hoursText: string;
  color: string;
  text: string;
} {
  if (ms <= 0) return { hoursText: "—", color: "#A4A9B3", text: "#0b1017" };
  const exactHours = ms / 3600000;
  const hoursText = (Math.floor(exactHours * 10) / 10).toFixed(1);
  if (exactHours < 2.0) return { hoursText, color: "#DC0C00", text: "#ffffff" };
  if (exactHours < 4.0) return { hoursText, color: "#ED7E07", text: "#0b1017" };
  if (exactHours < 5.0) return { hoursText, color: "#D9AF00", text: "#0b1017" };
  if (exactHours < 6.0) return { hoursText, color: "#00C424", text: "#0b1017" };
  if (exactHours < 7.5) return { hoursText, color: "#00ADC4", text: "#0b1017" };
  return { hoursText, color: "#374DF5", text: "#ffffff" };
}

function FocusMonthCalendar({
  state,
  subject,
}: {
  state: State;
  subject: string;
}) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const dailyMs = useMemo(() => {
    const boundaries = focusMonthDayBoundaries(year, monthIndex);
    const indices = matchingSessionIndices(state.sessions, subject);
    return historyStatistics(state, indices, boundaries).dailyMs;
  }, [state, subject, year, monthIndex]);
  const offset = (month.getDay() + 6) % 7;
  const todayKey = focusDay(Date.now());

  return (
    <section
      className="history-calendar"
      aria-label="Monthly focus calendar"
      data-testid="history-calendar"
    >
      <div className="history-calendar-header">
        <div>
          <h3>Monthly focus</h3>
          <p className="vertex-detail-muted">
            Hours focused per day (1 decimal place)
          </p>
        </div>
        <div className="history-calendar-nav">
          <button
            type="button"
            className="quiet-button"
            aria-label="Previous focus month"
            onClick={() => setMonth(new Date(year, monthIndex - 1, 1))}
          >
            ←
          </button>
          <strong aria-live="polite">
            {month.toLocaleDateString(undefined, {
              month: "long",
              year: "numeric",
            })}
          </strong>
          <button
            type="button"
            className="quiet-button"
            aria-label="Next focus month"
            onClick={() => setMonth(new Date(year, monthIndex + 1, 1))}
          >
            →
          </button>
        </div>
      </div>
      <div className="history-calendar-weekdays" aria-hidden="true">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="history-calendar-grid">
        {Array.from({ length: offset }, (_, i) => (
          <div key={`blank-${i}`} className="history-calendar-blank" />
        ))}
        {dailyMs.map((ms, index) => {
          const dayNum = index + 1;
          const date = new Date(year, monthIndex, dayNum, 12, 0, 0, 0);
          const iso = localDay(date.getTime());
          const { hoursText, color, text } = focusDayColor(ms);
          const dateLabel = date.toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric",
          });
          return (
            <div
              key={iso}
              className={`history-calendar-day${iso === todayKey ? " today" : ""}${ms === 0 ? " empty" : ""}`}
              style={{
                backgroundColor: ms === 0 ? undefined : color,
                borderColor: color,
                color: ms === 0 ? undefined : text,
              }}
              aria-label={`${dateLabel}: ${ms === 0 ? "0 hours" : `${hoursText} hours`}`}
              title={`${dateLabel}: ${ms === 0 ? "No focus" : `${hoursText}h (${shortTime(ms)})`}`}
            >
              <span className="history-calendar-hours">{hoursText}</span>
              <span className="history-calendar-num">{dayNum}</span>
            </div>
          );
        })}
      </div>
      <div className="history-calendar-legend" aria-label="Focus color scale">
        {FOCUS_COLOR_TIERS.map((tier) => (
          <span key={tier.label} className="history-legend-item">
            <i style={{ backgroundColor: tier.color }} />
            {tier.label}
          </span>
        ))}
      </div>
    </section>
  );
}

/** Presentation and editing of the saved ledger. Rust computes every statistic. */
export function SessionHistory({
  state,
  busy,
  selectedNodeId,
  run,
  persistPreferences = true,
}: {
  state: State;
  busy: boolean;
  selectedNodeId: string | undefined;
  run: (action: Action) => Promise<boolean>;
  persistPreferences?: boolean;
}) {
  const [range, setRange] = useState(() =>
    persistPreferences ? loadHistoryRange() : { from: "", to: "" },
  );
  const { from: historyFrom, to: historyTo } = range;
  const setHistoryFrom = (from: string): void =>
    setRange((range) => ({ ...range, from }));
  const setHistoryTo = (to: string): void =>
    setRange((range) => ({ ...range, to }));
  useEffect(() => {
    if (persistPreferences) saveHistoryRange(range);
  }, [range, persistPreferences]);
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
  const today = focusDay(Date.now());
  const calendarToday = localDay(Date.now());
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
              Focus is clipped to this range (days run 04:00–04:00). Daily
              average includes zero-focus days. Unsaved sessions are excluded.
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
                max={calendarToday}
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
                    manualStart.split("T")[0] === calendarToday
                      ? localDateTime(Date.now()).slice(11)
                      : undefined
                  }
                  onChange={(event) =>
                    setManualStart(
                      `${manualStart.split("T")[0] ?? calendarToday}T${event.target.value}`,
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
        <FocusMonthCalendar state={state} subject={historySubject} />

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
