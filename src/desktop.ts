import { invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { parse, stringify } from "yaml";
import { z } from "zod";
import { apply, stateSchema } from "./domain";
import type { Action, State } from "./domain";
import { notesFilename, structureYaml } from "./export";
import { STORAGE_KEY, Workspace } from "./storage";

export const desktopEnabled = isTauri();
const loadedSchema = z.object({
  directory: z.string(),
  yaml: z.string().nullable(),
  notes: z.record(z.string(), z.string()),
  backup_error: z.string().nullable().optional(),
});
export type DiskWorkspace = z.infer<typeof loadedSchema>;
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
export function diskState(loaded: DiskWorkspace): State {
  if (loaded.yaml === null)
    return { version: 1, trees: [], nodes: [], sessions: [], focus: null };
  const document = diskSchema.parse(
    parse(loaded.yaml, { maxAliasCount: 100 }) as unknown,
  );
  const nodes = document.nodes.map((node) => {
    if (
      node.notesFile.includes("/") ||
      node.notesFile.includes("\\") ||
      !node.notesFile.endsWith(".md")
    )
      throw new Error("Invalid Markdown path in workspace.yaml.");
    const notes = loaded.notes[node.notesFile];
    if (notes === undefined)
      throw new Error(`Missing Markdown file: notes/${node.notesFile}`);
    return { ...node, notes };
  });
  return stateSchema.parse({ ...document, nodes });
}
export function diskPayload(
  state: State,
  now: number,
): { yaml: string; structure: string; notes: Record<string, string> } {
  const names = noteNames(state);
  const nodes = state.nodes.map((node) => {
    const { notes, ...rest } = node;
    void notes;
    return { ...rest, notesFile: names.get(node.id)! };
  });
  return {
    yaml: stringify({ ...state, nodes }),
    structure: structureYaml(state, now),
    notes: Object.fromEntries(
      state.nodes.map((node) => [names.get(node.id)!, node.notes]),
    ),
  };
}
class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
}

export class DesktopWorkspace extends Workspace {
  readonly directory: string;
  backupError: string | null = null;
  timerError: string | null = null;
  private queue: Promise<void> = Promise.resolve();
  constructor(loaded: DiskWorkspace) {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify(diskState(loaded)));
    super(storage, Date.now());
    this.directory = loaded.directory;
  }
  private enqueue(work: () => Promise<void>): Promise<void> {
    const pending = this.queue.then(work);
    this.queue = pending.catch(() => {});
    return pending;
  }
  private async persist(state: State): Promise<void> {
    const loaded = loadedSchema.parse(
      await invoke("desktop_save", {
        directory: this.directory,
        request: diskPayload(state, Date.now()),
      }),
    );
    super.replace(JSON.stringify(diskState(loaded)));
    this.backupError = loaded.backup_error ?? null;
  }
  override commit(action: Action, now: number): Promise<void> {
    return this.enqueue(() =>
      this.persist(apply(this.getSnapshot(), action, now)),
    );
  }
  override replace(raw: string): Promise<void> {
    return this.enqueue(() =>
      this.persist(stateSchema.parse(JSON.parse(raw) as unknown)),
    );
  }
  override clear(): Promise<void> {
    return this.replace(
      JSON.stringify({
        version: 1,
        trees: [],
        nodes: [],
        sessions: [],
        focus: null,
      }),
    );
  }
  flush(): Promise<void> {
    return this.enqueue(() => this.persist(this.getSnapshot()));
  }
  async openNote(id: string): Promise<void> {
    await this.flush();
    const name = noteNames(this.getSnapshot()).get(id);
    if (!name) throw new Error("Vertex no longer exists.");
    await invoke("desktop_open_note", { name, directory: this.directory });
  }
}
async function enableDailyBackups(workspace: DesktopWorkspace): Promise<void> {
  try {
    await invoke("desktop_enable_backups");
    workspace.timerError = null;
  } catch (reason: unknown) {
    workspace.timerError = `Daily timer could not be enabled: ${String(reason)}`;
  }
}
export async function loadDesktop(): Promise<DesktopWorkspace | null> {
  const raw: unknown = await invoke("desktop_load");
  if (raw === null) return null;
  const workspace = new DesktopWorkspace(loadedSchema.parse(raw));
  await enableDailyBackups(workspace);
  return workspace;
}
export async function chooseDesktop(
  current?: DesktopWorkspace,
): Promise<DesktopWorkspace | null> {
  await current?.flush();
  const directory = await open({
    directory: true,
    multiple: false,
    title: "Choose hyperforest data directory",
  });
  if (!directory) return null;
  const loaded = loadedSchema.parse(
    await invoke("desktop_select", { directory }),
  );
  try {
    const workspace = new DesktopWorkspace(loaded);
    if (loaded.yaml === null && current)
      await workspace.replace(JSON.stringify(current.getSnapshot()));
    else await workspace.flush();
    await enableDailyBackups(workspace);
    return workspace;
  } catch (reason: unknown) {
    if (current)
      await invoke("desktop_select", { directory: current.directory });
    throw reason;
  }
}
