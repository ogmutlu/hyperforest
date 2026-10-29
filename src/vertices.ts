import type { GoalNode, Vertex, VertexKind, VertexSettings } from "./model";
import type { IconName } from "./icons";

export const VERTEX_KINDS: {
  kind: VertexKind;
  label: string;
  icon: IconName;
}[] = [
  { kind: "vanilla", label: "Vanilla vertex", icon: "vertex" },
  { kind: "deadline", label: "Deadline vertex", icon: "deadline" },
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

/** Short thoughts wrap inside an oval whose outline follows the text's size. */
export function thoughtLines(title: string): string[] {
  const lines: string[] = [];
  for (const word of title.split(/\s+/)) {
    const chunks = [...word].reduce<string[]>((parts, character, index) => {
      if (index % 26 === 0) parts.push("");
      parts[parts.length - 1] += character;
      return parts;
    }, []);
    for (const chunk of chunks) {
      const last = lines.at(-1);
      if (last && [...last, ...chunk].length < 27)
        lines[lines.length - 1] = `${last} ${chunk}`;
      else lines.push(chunk);
    }
  }
  return lines.length ? lines : [""];
}

export function vertexGeometry(node: GoalNode): { rx: number; ry: number } {
  if (node.vertex?.kind !== "thought") {
    const radius = node.id === node.treeId ? 24 : 18;
    return { rx: radius, ry: radius };
  }
  const lines = thoughtLines(thoughtPreview(node));
  return {
    rx: Math.max(
      70,
      Math.max(...lines.map((line) => [...line].length)) * 5.8 + 28,
    ),
    ry: Math.max(32, lines.length * 13 + 17),
  };
}

/** Local calendar boundaries, including Monday-based weeks and DST transitions. */
export function habitProgress(
  vertex: Extract<Vertex, { kind: "habit" }>,
  now: number,
): number {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (vertex.interval === "week")
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  if (vertex.interval === "month") start.setDate(1);
  return vertex.completions.filter((at) => at >= start.getTime() && at <= now)
    .length;
}

export function isWebsite(resource: string): boolean {
  return /^https?:\/\//.test(resource);
}
