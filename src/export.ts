import { stringify } from "yaml";
import { readWorkspace, workspaceFiles } from "./workspaceFiles";
import { strToU8, strFromU8, zipSync, unzipSync } from "fflate";
import { assignedNodeColors, formatTime, formatHms } from "./presentation";
import { apply, totals } from "./domainClient";
import type { GoalNode, State } from "./model";

/** Detailed derived report, separate from the editable workspace YAML. */
export function structureYaml(state: State, now: number): string {
  const quote = (value: string): string => JSON.stringify(value);
  const lines = [
    "# hyperforest structure and cumulative focus times",
    `exported_at: ${quote(new Date(now).toISOString())}`,
  ];
  if (!state.trees.length) return lines.join("\n") + "\nhypertrees: []\n";
  lines.push("hypertrees:");
  for (const tree of state.trees) {
    const time = totals(state, tree.id, now);
    lines.push(
      `  - name: ${quote(tree.title)}`,
      `    id: ${quote(tree.id)}`,
      `    created_at: ${quote(new Date(tree.createdAt).toISOString())}`,
      `    focus_time: ${quote(formatTime(time.get(tree.id) ?? 0))}`,
      `    focus_milliseconds: ${time.get(tree.id) ?? 0}`,
      "    vertices:",
    );
    const write = (node: GoalNode, indent: number): void => {
      const pad = " ".repeat(indent);
      lines.push(
        `${pad}- name: ${quote(node.title)}`,
        `${pad}  id: ${quote(node.id)}`,
        `${pad}  focus_time: ${quote(formatTime(time.get(node.id) ?? 0))}`,
        `${pad}  focus_milliseconds: ${time.get(node.id) ?? 0}`,
        `${pad}  colors: [${assignedNodeColors(node).map(quote).join(", ")}]`,
      );
      if (node.finishedAt !== undefined)
        lines.push(
          `${pad}  finished_at: ${quote(new Date(node.finishedAt).toISOString())}`,
        );
      if (node.linkedTreeId) {
        const source = state.trees.find(
          (item) => item.id === node.linkedTreeId,
        );
        lines.push(
          `${pad}  linked_hypertree: ${quote(source?.title ?? "Deleted hypertree")}`,
          `${pad}  linked_hypertree_id: ${quote(node.linkedTreeId)}`,
        );
      }
      const children = state.nodes.filter((item) => item.parentId === node.id);
      if (children.length) {
        lines.push(`${pad}  children:`);
        for (const child of children) write(child, indent + 4);
      } else lines.push(`${pad}  children: []`);
    };
    for (const node of state.nodes.filter(
      (item) => item.treeId === tree.id && item.parentId === null,
    ))
      write(node, 6);
  }
  return lines.join("\n") + "\n";
}

export function exportArchive(state: State, now: number): Uint8Array {
  // A portable snapshot must not accrue time while it is being moved between
  // apps/devices. Pause the copy at this clock sample; the source keeps running.
  if (state.focus?.runningSince != null)
    state = apply(state, { type: "pause" }, now);
  const payload = workspaceFiles(state);
  const files: Record<string, Uint8Array> = {
    "workspace.yaml": strToU8(payload.yaml),
    "structure.yaml": strToU8(structureYaml(state, now)),
    "simple.yaml": strToU8(simpleYaml(state, now)),
    "notes/": new Uint8Array(),
  };
  for (const [name, text] of Object.entries(payload.notes))
    files[`notes/${name}`] = strToU8(text);
  return zipSync(files);
}
export function archiveBackup(contents: Uint8Array): string {
  const files = unzipSync(contents, {
    filter: (file) =>
      file.name === "workspace.yaml" || /^notes\/[^/\\]+\.md$/.test(file.name),
  });
  const workspace = files["workspace.yaml"];
  if (!workspace)
    throw new Error("ZIP must contain workspace.yaml and its Markdown notes.");
  const notes = Object.fromEntries(
    Object.entries(files)
      .filter(([name]) => name.startsWith("notes/") && name.endsWith(".md"))
      .map(([name, data]) => [name.slice(6), strFromU8(data)]),
  );
  return JSON.stringify(readWorkspace(strFromU8(workspace), notes));
}

/** A deliberately small report for reading: names, hierarchy and durations. */
export function simpleYaml(state: State, now: number): string {
  const children = new Map<string, GoalNode[]>();
  for (const node of state.nodes) {
    if (node.parentId !== null) {
      const siblings = children.get(node.parentId) ?? [];
      siblings.push(node);
      children.set(node.parentId, siblings);
    }
  }
  const names = new Map(state.trees.map((tree) => [tree.id, tree.title]));
  const hypertrees = state.trees.map((tree) => {
    const time = totals(state, tree.id, now);
    const describe = (node: GoalNode): SimpleGoal => ({
      name: node.title,
      focused: formatHms(time.get(node.id) ?? 0),
      ...(node.estimateMinutes > 0
        ? { estimate: formatHms(node.estimateMinutes * 60000) }
        : {}),
      ...(node.finishedAt !== undefined ? { finished: true } : {}),
      ...(node.linkedTreeId
        ? { linked: names.get(node.linkedTreeId) ?? "Deleted hypertree" }
        : {}),
      ...((children.get(node.id)?.length ?? 0) > 0
        ? { children: children.get(node.id)!.map(describe) }
        : {}),
    });
    const root = state.nodes.find((node) => node.id === tree.id)!;
    const unconnected = state.nodes.filter(
      (node) =>
        node.treeId === tree.id &&
        node.id !== tree.id &&
        node.parentId === null,
    );
    return {
      ...describe(root),
      ...(unconnected.length ? { unconnected: unconnected.map(describe) } : {}),
    };
  });
  return stringify({ hypertrees });
}
interface SimpleGoal {
  name: string;
  focused: string;
  estimate?: string;
  finished?: boolean;
  linked?: string;
  children?: SimpleGoal[];
}
