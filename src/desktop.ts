import { noteNames, readWorkspace, workspaceFiles } from "./workspaceFiles";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { z } from "zod";
import { apply, validateState } from "./domainClient";
import type { Action, State } from "./model";
import { structureYaml, simpleYaml } from "./export";
import { STORAGE_KEY, Workspace } from "./storage";

export const desktopEnabled = isTauri();
const loadedSchema = z.object({
  directory: z.string(),
  yaml: z.string().nullable(),
  notes: z.record(z.string(), z.string()),
  backup_error: z.string().nullable().optional(),
});
export type DiskWorkspace = z.infer<typeof loadedSchema>;
export { noteNames } from "./workspaceFiles";
export function diskState(loaded: DiskWorkspace): State {
  return readWorkspace(loaded.yaml, loaded.notes);
}
export function diskPayload(state: State, now: number) {
  return {
    ...workspaceFiles(state),
    structure: structureYaml(state, now),
    simple: simpleYaml(state, now),
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
    super(storage);
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
      this.persist(validateState(JSON.parse(raw) as unknown)),
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
