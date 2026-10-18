/** Version-1 transport types. Rust validates all imported state and commands. */
export interface GoalTree {
  id: string;
  title: string;
  createdAt: number;
  pedantic: boolean;
  showFinished: boolean;
}
export interface GoalNode {
  id: string;
  treeId: string;
  parentId: string | null;
  title: string;
  estimateMinutes: number;
  notes: string;
  notesFile?: string;
  finishedAt?: number;
  linkedTreeId?: string;
  filled: boolean;
  color: string;
  colors?: string[];
  multipleColors: boolean;
  x: number;
  y: number;
}
export interface Period {
  start: number;
  end: number;
}
export interface Focus {
  nodeId: string;
  treeId: string;
  title: string;
  group: string;
  startedAt: number;
  runningSince: number | null;
  elapsedMs: number;
  periods: Period[];
}
export interface Session {
  id: string;
  importedAt?: number;
  treeId: string;
  nodeId: string;
  creditNodeId?: string;
  title: string;
  group: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  periods: Period[];
}
export interface State {
  version: 1;
  trees: GoalTree[];
  nodes: GoalNode[];
  sessions: Session[];
  focus: Focus | null;
}

export type Action =
  | { type: "showFinished"; treeId: string; enabled: boolean }
  | { type: "pedantic"; treeId: string; enabled: boolean }
  | { type: "create"; id: string; title: string }
  | { type: "reorderTree"; id: string; direction: -1 | 1 }
  | { type: "isolate"; id: string; treeId: string; title: string }
  | { type: "color"; id: string; color: string | null }
  | { type: "colors"; id: string; colors: string[] }
  | { type: "multipleColors"; id: string; enabled: boolean }
  | { type: "fill"; id: string; filled: boolean }
  | {
      type: "add";
      id: string;
      parentId: string;
      title: string;
      linkedTreeId?: string;
    }
  | {
      type: "edit";
      expected?: Pick<GoalNode, "title" | "notes" | "estimateMinutes">;
      id: string;
      title: string;
      estimateMinutes: number;
      notes: string;
    }
  | { type: "connect"; id: string; parentId: string | null }
  | { type: "move"; id: string; x: number; y: number }
  | { type: "layout"; treeId: string }
  | { type: "delete"; id: string }
  | { type: "complete"; id: string; sessionId: string }
  | { type: "start"; id: string }
  | { type: "pause" }
  | {
      type: "addSession";
      id: string;
      nodeId: string;
      startedAt: number;
      durationMs: number;
    }
  | {
      type: "importSession";
      id: string;
      title: string;
      startedAt: number;
      endedAt: number;
      durationMs: number;
      periods: Period[];
    }
  | { type: "deleteSession"; id: string }
  | { type: "finish"; id: string }
  | { type: "discard" };
