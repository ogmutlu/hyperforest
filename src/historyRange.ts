/** Local interface preference; never part of workspace YAML or domain state. */
import { localDay, parseDay } from "./calendar";

export interface HistoryRange {
  from: string;
  to: string;
}
const KEY = "hyperforest.history-range";

function valid(range: HistoryRange): boolean {
  const today = localDay(Date.now());
  const endpoint = (value: string): boolean =>
    value === "" ||
    (!!parseDay(value) && value >= "1970-01-01" && value <= today);
  return (
    endpoint(range.from) &&
    endpoint(range.to) &&
    (!range.from || !range.to || range.from <= range.to)
  );
}

export function loadHistoryRange(): HistoryRange {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (
      value &&
      typeof value === "object" &&
      "from" in value &&
      "to" in value &&
      typeof value.from === "string" &&
      typeof value.to === "string"
    ) {
      const range = { from: value.from, to: value.to };
      if (valid(range)) return range;
    }
  } catch {
    /* Unavailable storage or a damaged preference uses the default. */
  }
  return { from: "", to: "" };
}

export function saveHistoryRange(range: HistoryRange): void {
  // Partial date entry must not replace the last completed selection.
  if (!valid(range)) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(range));
  } catch {
    /* Preferences must not prevent history access or workspace saves. */
  }
}
