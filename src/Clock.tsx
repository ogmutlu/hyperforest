/** Clock subscriptions live in the small components that display changing time. */
import { useEffect, useState } from "react";
import { focusElapsed, habitPeriod, todayTime } from "./domainClient";
import { habitPeriodBounds } from "./calendar";
import { formatTime } from "./presentation";
import type { Focus, State, Vertex } from "./model";
import {
  formatHabitPeriodLabel,
  formatHabitProgressText,
  formatHabitWeekdays,
  habitProgress,
  isHabitScheduledOn,
} from "./vertices";

function useNow(interval: number | null, revision: object | number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    if (interval === null) return;
    const timer = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(timer);
  }, [interval, revision]);
  return now;
}
export function DeadlineTimer({ deadlineAt }: { deadlineAt: number }) {
  const now = useNow(1000, deadlineAt);
  const remaining = deadlineAt - now;
  const absolute = Math.abs(remaining);
  const days = Math.floor(absolute / 86400000);
  return (
    <>
      {remaining < 0 ? "Overdue by " : ""}
      {days ? `${days}d ` : ""}
      {formatTime(absolute % 86400000)}
      {remaining >= 0 ? " left" : ""}
    </>
  );
}
export function HabitProgress({
  vertex,
  state,
  nodeId,
}: {
  vertex: Extract<Vertex, { kind: "habit" }>;
  state?: State;
  nodeId?: string;
}) {
  const now = useNow(10000, vertex);
  if (!vertex.measure) {
    const progress = habitProgress(vertex, now);
    if (
      vertex.interval === "custom" &&
      !isHabitScheduledOn(vertex, now) &&
      progress === 0
    ) {
      const days = formatHabitWeekdays(vertex.weekdays);
      return (
        <span className="habit-rest-day">
          {days ? `Rest day · ${days}` : "Rest day"}
        </span>
      );
    }
    return (
      <>
        {progress} / {vertex.frequency}{" "}
        {formatHabitPeriodLabel(vertex.interval, vertex.weekdays)}
      </>
    );
  }
  const [from, to] = habitPeriodBounds(vertex.interval, now);
  const status =
    state && nodeId
      ? habitPeriod(state, nodeId, from, Math.min(to, now + 1))
      : {
          recordedCount: 0,
          qualifyingCount: 0,
          totalValue: 0,
          state: "unrecorded" as const,
        };
  const latestInPeriod = (vertex.entries ?? [])
    .filter((entry) => entry.at >= from && entry.at <= now)
    .at(-1)?.value;
  return (
    <span className={`habit-state-${status.state}`}>
      {formatHabitProgressText(vertex, status, latestInPeriod, now)}
    </span>
  );
}
export function FocusTimer({ focus }: { focus: Focus }) {
  const now = useNow(focus.runningSince === null ? null : 1000, focus);
  return (
    <>
      {formatTime(
        focusElapsed(focus, Math.max(now, focus.runningSince ?? now)),
      )}
    </>
  );
}
export function TodayCounter({ state }: { state: State }) {
  // Keep the day boundary fresh even when idle, without rerendering the graph.
  const now = useNow(state.focus?.runningSince != null ? 1000 : 10000, state);
  const minutes = Math.floor(
    todayTime(state, Math.max(now, state.focus?.runningSince ?? now)) / 60000,
  );
  return (
    <>
      {Math.floor(minutes / 60)}h {minutes % 60}m
    </>
  );
}
