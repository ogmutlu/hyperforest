/** Formatting and local-calendar search; no state transitions. */
import type { GoalNode } from "./model";

export function formatTime(ms: number): string {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  return `${Math.floor(seconds / 3600)
    .toString()
    .padStart(2, "0")}:${Math.floor((seconds / 60) % 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
export function formatHms(ms: number): string {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  return `${Math.floor(seconds / 3600)}h${Math.floor(seconds / 60) % 60}m${seconds % 60}s`;
}
export function shortTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds > 0 && seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(ms / 60000);
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
    : `${minutes}m`;
}

// Rust resolves and persists all default colors. These helpers only read the
// normalized snapshot; they never assign or validate a color.
export const DEFAULT_COLORS = [
  "#dfc491",
  "#80c9bc",
  "#9ca8dc",
  "#b7c894",
  "#cb99bc",
  "#86b7db",
  "#dd9689",
  "#a5cfb4",
] as const;
export function assignedNodeColor(node: GoalNode): string {
  return node.color;
}
export function assignedNodeColors(node: GoalNode): string[] {
  return node.colors ?? [node.color];
}
