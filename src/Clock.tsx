/** Clock subscriptions live in the small components that display changing time. */
import { useEffect, useState } from "react";
import { focusElapsed, todayTime } from "./domainClient";
import { formatHms, formatTime } from "./presentation";
import type { Focus, State } from "./model";

function useNow(interval: number | null, revision: object): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    if (interval === null) return;
    const timer = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(timer);
  }, [interval, revision]);
  return now;
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
  return (
    <>
      {formatHms(
        todayTime(state, Math.max(now, state.focus?.runningSince ?? now)),
      )}
    </>
  );
}
