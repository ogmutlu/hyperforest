import { apply, validateState } from "./domainClient";
import type { Action, State } from "./model";

export const STORAGE_KEY = "hyperforest.workspace.v1";
export class Workspace {
  private state: State;
  private readonly listeners = new Set<() => void>();
  private original: string | null;
  constructor(
    private readonly storage: Pick<
      Storage,
      "getItem" | "setItem" | "removeItem"
    >,
  ) {
    this.original = storage.getItem(STORAGE_KEY);
    this.state =
      this.original === null
        ? { version: 1, trees: [], nodes: [], sessions: [], focus: null }
        : validateState(JSON.parse(this.original) as unknown);
    if (this.original === null) this.write(this.state);
  }
  getSnapshot = (): State => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private notify(): void {
    for (const listener of this.listeners) listener();
  }
  refresh = (): void => {
    const raw = this.storage.getItem(STORAGE_KEY);
    if (raw === this.original) return;
    if (raw === null)
      throw new Error(
        "Workspace was removed in another tab. Reload to create a new one.",
      );
    const state = validateState(JSON.parse(raw) as unknown);
    this.original = raw;
    this.state = state;
    this.notify();
  };
  commit(action: Action, now: number): void | Promise<void> {
    this.refresh();
    this.write(apply(this.state, action, now));
  }
  replace(raw: string): void | Promise<void> {
    this.refresh();
    this.write(validateState(JSON.parse(raw) as unknown));
  }
  clear(): void | Promise<void> {
    this.refresh();
    this.write({ version: 1, trees: [], nodes: [], sessions: [], focus: null });
  }
  private write(state: State): void {
    const raw = JSON.stringify(state);
    // Do not update the visible state if quota/security errors prevent saving.
    this.storage.setItem(STORAGE_KEY, raw);
    this.original = raw;
    this.state = state;
    this.notify();
  }
}
export async function transact(
  work: () => void | Promise<void>,
): Promise<void> {
  if ("locks" in navigator) await navigator.locks.request(STORAGE_KEY, work);
  else await work();
}
