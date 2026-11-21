import { habitPeriodBounds, localDayIndex, localWeekday } from "./calendar";
import type {
  GoalNode,
  HabitMeasure,
  HabitPeriodStatus,
  Vertex,
  VertexKind,
  VertexSettings,
  Weekday,
} from "./model";
import type { IconName } from "./icons";

export const WEEKDAYS: {
  id: Weekday;
  short: string;
  medium: string;
  label: string;
}[] = [
  { id: "mon", short: "Mo", medium: "Mon", label: "Monday" },
  { id: "tue", short: "Tu", medium: "Tue", label: "Tuesday" },
  { id: "wed", short: "We", medium: "Wed", label: "Wednesday" },
  { id: "thu", short: "Th", medium: "Thu", label: "Thursday" },
  { id: "fri", short: "Fr", medium: "Fri", label: "Friday" },
  { id: "sat", short: "Sa", medium: "Sat", label: "Saturday" },
  { id: "sun", short: "Su", medium: "Sun", label: "Sunday" },
];

export const VERTEX_KINDS: {
  kind: VertexKind;
  label: string;
  icon: IconName;
}[] = [
  { kind: "vanilla", label: "Vanilla vertex", icon: "vertex" },
  { kind: "deadline", label: "Deadline vertex", icon: "deadline" },
  { kind: "bucket", label: "Bucket vertex", icon: "bucket" },
  { kind: "thought", label: "Thought vertex", icon: "thought" },
  { kind: "reading", label: "Reading vertex", icon: "reading" },
  { kind: "habit", label: "Habit vertex", icon: "habit" },
];

export function defaultVertex(kind: VertexKind): VertexSettings {
  switch (kind) {
    case "deadline":
      return { kind, deadlineAt: Date.now() + 86400000 };
    case "reading":
      return { kind, resource: "" };
    case "habit":
      return { kind, frequency: 1, interval: "day" };
    default:
      return { kind };
  }
}

export function thoughtTitle(text: string): string {
  return [...text.trim().split(/\s+/).slice(0, 6).join(" ")]
    .slice(0, 80)
    .join("");
}

export function thoughtText(node: GoalNode): string {
  return node.vertex?.kind === "thought"
    ? (node.vertex.text ?? node.title)
    : node.title;
}

/** Keep previews bounded; the editor always receives the complete text. */
export function thoughtPreview(node: GoalNode): string {
  const text = thoughtText(node).trim().replace(/\s+/g, " ");
  const characters = [...text];
  return characters.length > 130
    ? `${characters.slice(0, 127).join("")}...`
    : text;
}

/** Thought text wraps inside a softly rounded card. */
export function thoughtLines(title: string, columns = 26): string[] {
  const lines: string[] = [];
  for (const word of title.split(/\s+/)) {
    const chunks = [...word].reduce<string[]>((parts, character, index) => {
      if (index % columns === 0) parts.push("");
      parts[parts.length - 1] += character;
      return parts;
    }, []);
    for (const chunk of chunks) {
      const last = lines.at(-1);
      if (last && [...last, ...chunk].length < columns + 1)
        lines[lines.length - 1] = `${last} ${chunk}`;
      else lines.push(chunk);
    }
  }
  return lines.length ? lines : [""];
}

export function vertexGeometry(
  node: GoalNode,
  nodes: GoalNode[] = [],
): { rx: number; ry: number } {
  if (node.vertex?.kind === "bucket") {
    let rx = (node.size?.width ?? 520) / 2,
      ry = (node.size?.height ?? 360) / 2;
    for (const member of nodes) {
      if (member.bucketId !== node.id) continue;
      const size = vertexGeometry(member);
      rx = Math.max(rx, Math.abs(member.x - node.x) + size.rx + 24);
      ry = Math.max(ry, Math.abs(member.y - node.y) + size.ry + 48);
    }
    return { rx, ry };
  }
  if (node.vertex?.kind !== "thought") {
    const radius = node.id === node.treeId ? 24 : 18;
    return { rx: radius, ry: radius };
  }
  if (node.size) return { rx: node.size.width / 2, ry: node.size.height / 2 };
  const lines = thoughtLines(thoughtPreview(node));
  return {
    rx: Math.max(
      70,
      Math.max(...lines.map((line) => [...line].length)) * 5.8 + 28,
    ),
    ry: Math.max(32, lines.length * 13 + 17),
  };
}

/** Local calendar boundaries, including Monday-based weeks, custom weekdays, and DST transitions. */
export function habitProgress(
  vertex: Extract<Vertex, { kind: "habit" }>,
  now: number,
): number {
  const [start] = habitPeriodBounds(vertex.interval, now);
  return vertex.completions.filter((at) => at >= start && at <= now).length;
}

export function isHabitScheduledOn(
  vertex: Extract<Vertex, { kind: "habit" }>,
  time: number,
): boolean {
  if (vertex.interval !== "custom") return true;
  const weekday = WEEKDAYS[localWeekday(localDayIndex(time))]?.id;
  return weekday !== undefined && (vertex.weekdays ?? []).includes(weekday);
}

export function formatHabitWeekdays(weekdays?: Weekday[]): string {
  if (!weekdays?.length) return "";
  const selected = new Set(weekdays);
  return WEEKDAYS.filter((day) => selected.has(day.id))
    .map((day) => day.medium)
    .join(", ");
}

export function formatHabitPeriodLabel(
  interval: Extract<Vertex, { kind: "habit" }>["interval"],
  weekdays?: Weekday[],
): string {
  if (interval === "custom") {
    const days = formatHabitWeekdays(weekdays);
    return days ? `· ${days}` : "today";
  }
  return `this ${interval}`;
}

export function formatHabitNumber(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

export function formatHabitTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(1439, Math.round(minutes)));
  const hh = String(Math.floor(clamped / 60)).padStart(2, "0");
  const mm = String(clamped % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function parseHabitTime(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

export function currentLocalTimeMinutes(now: number): number {
  const d = new Date(now);
  return d.getHours() * 60 + d.getMinutes();
}

export function formatHabitValue(measure: HabitMeasure, value: number): string {
  if (measure.valueKind === "timeOfDay") return formatHabitTime(value);
  const num = formatHabitNumber(value);
  return measure.unit ? `${num} ${measure.unit}` : num;
}

export function formatHabitTarget(measure: HabitMeasure): string {
  const op = measure.bound === "atLeast" ? "≥" : "≤";
  return `${op} ${formatHabitValue(measure, measure.target)}`;
}

export function formatHabitProgressText(
  vertex: Extract<Vertex, { kind: "habit" }>,
  status: HabitPeriodStatus,
  latestValueInPeriod?: number,
  now?: number,
): string {
  const measure = vertex.measure;
  if (
    vertex.interval === "custom" &&
    now !== undefined &&
    !isHabitScheduledOn(vertex, now) &&
    status.recordedCount === 0
  ) {
    const days = formatHabitWeekdays(vertex.weekdays);
    return days ? `Rest day · ${days}` : "Rest day";
  }
  const periodLabel =
    vertex.interval === "custom"
      ? `today · ${formatHabitWeekdays(vertex.weekdays)}`
      : vertex.interval === "day"
        ? "today"
        : `this ${vertex.interval}`;
  if (!measure) {
    return `${status.recordedCount} / ${vertex.frequency} ${formatHabitPeriodLabel(vertex.interval, vertex.weekdays)}`;
  }
  if (measure.valueKind === "timeOfDay") {
    if (
      vertex.frequency === 1 &&
      (vertex.interval === "day" || vertex.interval === "custom")
    ) {
      const shown =
        latestValueInPeriod !== undefined
          ? formatHabitTime(latestValueInPeriod)
          : "—";
      return `${shown} (${formatHabitTarget(measure)}) ${periodLabel}`;
    }
    return `${status.qualifyingCount} / ${vertex.frequency} (${formatHabitTarget(measure)}) ${periodLabel}`;
  }
  const aggregate = measure.aggregate ?? "sum";
  if (aggregate === "sum") {
    if (measure.bound === "atMost" && status.recordedCount === 0) {
      return `Not logged · ${formatHabitTarget(measure)} ${periodLabel}`;
    }
    const unit = measure.unit ? ` ${measure.unit}` : "";
    const op = measure.bound === "atMost" ? "≤ " : "";
    return `${formatHabitNumber(status.totalValue)} / ${op}${formatHabitNumber(measure.target)}${unit} ${periodLabel}`;
  }
  return `${status.qualifyingCount} / ${vertex.frequency} (${formatHabitTarget(measure)}) ${periodLabel}`;
}

export function formatHabitLifetimeText(
  vertex: Extract<Vertex, { kind: "habit" }>,
): string {
  const measure = vertex.measure;
  if (!measure) return `${vertex.completions.length} total`;
  const entries = vertex.entries ?? [];
  if (entries.length === 0) return "0 entries";
  if (measure.valueKind === "timeOfDay") {
    const avg =
      entries.reduce((acc, item) => acc + item.value, 0) / entries.length;
    return `Avg ${formatHabitTime(avg)} · ${entries.length} ${entries.length === 1 ? "entry" : "entries"}`;
  }
  const aggregate = measure.aggregate ?? "sum";
  if (aggregate === "sum") {
    const total = entries.reduce((acc, item) => acc + item.value, 0);
    return `${formatHabitValue(measure, total)} total · ${entries.length} ${entries.length === 1 ? "entry" : "entries"}`;
  }
  const qualifying = entries.filter((item) =>
    measure.bound === "atLeast"
      ? item.value >= measure.target
      : item.value <= measure.target,
  ).length;
  return `${qualifying} / ${entries.length} on target`;
}

export function isWebsite(resource: string): boolean {
  return /^https?:\/\//.test(resource);
}

/** Magnetic edge snapping; leaves tree connections and saved neighbours untouched. */
export function snapThought(
  node: GoalNode,
  point: { x: number; y: number },
  nodes: GoalNode[],
  threshold = 16,
  bucketId: string | null = node.bucketId ?? null,
): { x: number; y: number } {
  if (node.vertex?.kind !== "thought") return point;
  const size = vertexGeometry(node);
  let best = point,
    distance = threshold + 1;
  for (const other of nodes) {
    if (
      other.id === node.id ||
      other.treeId !== node.treeId ||
      other.vertex?.kind !== "thought" ||
      other.finishedAt !== undefined ||
      (other.bucketId ?? null) !== bucketId
    )
      continue;
    const target = vertexGeometry(other);
    const candidates: { x: number; y: number }[] = [];
    if (Math.abs(point.y - other.y) < size.ry + target.ry) {
      for (const side of [-1, 1])
        candidates.push({
          x: other.x + side * (size.rx + target.rx),
          y: Math.abs(point.y - other.y) <= threshold ? other.y : point.y,
        });
    }
    if (Math.abs(point.x - other.x) < size.rx + target.rx) {
      for (const side of [-1, 1])
        candidates.push({
          x: Math.abs(point.x - other.x) <= threshold ? other.x : point.x,
          y: other.y + side * (size.ry + target.ry),
        });
    }
    for (const candidate of candidates) {
      const d = Math.hypot(candidate.x - point.x, candidate.y - point.y);
      if (
        d <= threshold &&
        d < distance &&
        !nodes.some((obstacle) => {
          if (
            obstacle.id === node.id ||
            obstacle.id === other.id ||
            obstacle.treeId !== node.treeId ||
            obstacle.finishedAt !== undefined ||
            obstacle.vertex?.kind !== "thought"
          )
            return false;
          const bounds = vertexGeometry(obstacle);
          return (
            Math.abs(candidate.x - obstacle.x) < size.rx + bounds.rx - 1 &&
            Math.abs(candidate.y - obstacle.y) < size.ry + bounds.ry - 1
          );
        })
      ) {
        best = candidate;
        distance = d;
      }
    }
  }
  return best;
}

/** Drop by centre, allowing the bucket to expand around the complete vertex. */
export function bucketAt(
  node: GoalNode,
  point: { x: number; y: number },
  nodes: GoalNode[],
): string | undefined {
  if (node.id === node.treeId || node.vertex?.kind === "bucket")
    return undefined;
  return [...nodes].reverse().find((bucket) => {
    if (
      bucket.vertex?.kind !== "bucket" ||
      bucket.treeId !== node.treeId ||
      bucket.finishedAt !== undefined
    )
      return false;
    const size = vertexGeometry(bucket, nodes);
    return (
      Math.abs(point.x - bucket.x) < size.rx &&
      point.y > bucket.y - size.ry + 65 &&
      point.y < bucket.y + size.ry
    );
  })?.id;
}

/** Resize from the bottom-right, keeping the opposite corner and contents fixed. */
export function resizedVertex(
  node: GoalNode,
  width: number,
  height: number,
  nodes: GoalNode[],
) {
  const current = vertexGeometry(node, nodes);
  const left = node.x - current.rx,
    top = node.y - current.ry;
  let minimumWidth = node.vertex?.kind === "bucket" ? 240 : 140;
  let minimumHeight = node.vertex?.kind === "bucket" ? 180 : 64;
  if (node.vertex?.kind === "bucket") {
    for (const member of nodes) {
      if (member.bucketId !== node.id) continue;
      const size = vertexGeometry(member);
      minimumWidth = Math.max(minimumWidth, member.x + size.rx + 24 - left);
      minimumHeight = Math.max(minimumHeight, member.y + size.ry + 48 - top);
    }
  }
  const size = {
    width: Math.min(10000, Math.max(minimumWidth, width)),
    height: Math.min(10000, Math.max(minimumHeight, height)),
  };
  return { x: left + size.width / 2, y: top + size.height / 2, size };
}
