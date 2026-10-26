/** Clock subscriptions live in the small components that display changing time. */
import { useEffect, useState } from "react";
import { focusElapsed, todayTime } from "./domainClient";
import { formatTime } from "./presentation";
import type { Focus, State, Vertex } from "./model";
import { habitProgress } from "./vertices";

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
}: {
  vertex: Extract<Vertex, { kind: "habit" }>;
}) {
  const now = useNow(10000, vertex);
  return (
    <>
      {habitProgress(vertex, now)} / {vertex.frequency} this {vertex.interval}
    </>
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
