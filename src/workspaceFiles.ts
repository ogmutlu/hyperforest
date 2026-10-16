/** Current workspace.yaml + notes/*.md format, shared by desktop and exports. */
import { parse, stringify } from "yaml";
import { z } from "zod";
import { validateState } from "./domainClient";
import type { GoalNode, State } from "./model";

export function notesFilename(state: State, node: GoalNode): string {
  const tree = state.trees.find((item) => item.id === node.treeId)!;
  const title = `${tree.title} - ${node.title}`
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, "-")
    .replace(/[. ]+$/, "");
  return `${title || "notes"}.md`;
}
const diskSchema = z
  .object({
    nodes: z.array(
      z.object({ id: z.string(), notesFile: z.string() }).passthrough(),
    ),
  })
  .passthrough();

export function noteNames(state: State): Map<string, string> {
  const result = new Map<string, string>();
  const used = new Set<string>();
  for (const node of state.nodes) {
    const filename = notesFilename(state, node);
    const stem = [...filename.slice(0, -3)].slice(0, 45).join("");
    let hash = 2166136261;
    for (const character of node.id)
      hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
    let name = node.notesFile ?? `${stem} --${hash.toString(16)}.md`;
    let suffix = 2;
    while (used.has(name))
      name = `${stem} --${hash.toString(16)} (${suffix++}).md`;
    used.add(name);
    result.set(node.id, name);
  }
  return result;
}
export function readWorkspace(
  yaml: string | null,
  notes: Record<string, string>,
): State {
  if (yaml === null)
    return { version: 1, trees: [], nodes: [], sessions: [], focus: null };
  const document = diskSchema.parse(
    parse(yaml, { maxAliasCount: 100 }) as unknown,
  );
  const nodes = document.nodes.map((node) => {
    if (
      node.notesFile.includes("/") ||
      node.notesFile.includes("\\") ||
      !node.notesFile.endsWith(".md")
    )
      throw new Error("Invalid Markdown path in workspace.yaml.");
    const text = notes[node.notesFile];
    if (text === undefined)
      throw new Error(`Missing Markdown file: notes/${node.notesFile}`);
    return { ...node, notes: text };
  });
  return validateState({ ...document, nodes });
}
export function workspaceFiles(state: State): {
  yaml: string;
  notes: Record<string, string>;
} {
  const names = noteNames(state);
  const nodes = state.nodes.map((node) => {
    const { notes, ...rest } = node;
    void notes;
    return { ...rest, notesFile: names.get(node.id)! };
  });
  return {
    yaml: stringify({ ...state, nodes }),
    notes: Object.fromEntries(
      state.nodes.map((node) => [names.get(node.id)!, node.notes]),
    ),
  };
}
