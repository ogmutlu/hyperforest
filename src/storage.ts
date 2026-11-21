import { apply, syncAchievements, validateState } from "./domainClient";
import type { Action, State } from "./model";

export const STORAGE_KEY = "hyperforest.workspace.v1";
export class Workspace {
  private state: State;
  private readonly listeners = new Set<() => void>();
  private original: string | null;
  protected backfilledCount = 0;
  constructor(
    private readonly storage: Pick<
      Storage,
      "getItem" | "setItem" | "removeItem"
    >,
    protected readonly trackAchievements = true,
  ) {
    this.original = storage.getItem(STORAGE_KEY);
    if (this.original === null) {
      this.state = {
        version: 1,
        trees: [],
        nodes: [],
        sessions: [],
        focus: null,
        ...(trackAchievements ? { achievements: [] } : {}),
      };
      this.write(this.state);
    } else {
      let loaded = validateState(JSON.parse(this.original) as unknown);
      if (trackAchievements && loaded.achievements === undefined) {
        loaded = syncAchievements(loaded, Date.now(), true);
        this.backfilledCount = loaded.achievements?.length ?? 0;
      }
      this.state = loaded;
    }
  }
  consumeBackfilledCount(): number {
    const count = this.backfilledCount;
    this.backfilledCount = 0;
    return count;
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
    let next = apply(this.state, action, now);
    if (this.trackAchievements) next = syncAchievements(next, now, false);
    this.write(next);
  }
  replace(raw: string): void | Promise<void> {
    this.refresh();
    let next = validateState(JSON.parse(raw) as unknown);
    if (this.trackAchievements && next.achievements === undefined) {
      next = syncAchievements(next, Date.now(), true);
    }
    this.write(next);
  }
  clear(): void | Promise<void> {
    this.refresh();
    this.write({
      version: 1,
      trees: [],
      nodes: [],
      sessions: [],
      focus: null,
      ...(this.trackAchievements ? { achievements: [] } : {}),
    });
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
