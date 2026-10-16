import { useCallback, useEffect, useRef, useState } from "react";
import type { SetStateAction } from "react";

/** Coalesce pointer samples into one render per animation frame. The ref keeps
 * the final sample available to pointer-up even before that frame has painted. */
export function useFrameState<T>(initial: T) {
  const [value, commit] = useState(initial);
  const latest = useRef(initial);
  const frame = useRef<number | null>(null);
  const flush = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    commit(latest.current);
    return latest.current;
  }, []);
  const set = useCallback(
    (update: SetStateAction<T>) => {
      latest.current =
        typeof update === "function"
          ? (update as (previous: T) => T)(latest.current)
          : update;
      if (frame.current === null) frame.current = requestAnimationFrame(flush);
    },
    [flush],
  );
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );
  return [value, set, flush, latest] as const;
}
