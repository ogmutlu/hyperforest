/** Version-1 transport types. Rust validates all imported state and commands. */
export interface GoalTree {
  id: string;
  title: string;
  createdAt: number;
  pedantic: boolean;
  showFinished: boolean;
}
export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type HabitInterval = "day" | "week" | "month" | "custom";
export type HabitValueKind = "number" | "timeOfDay";
export type HabitBound = "atLeast" | "atMost";
export type HabitAggregate = "sum" | "perEntry";
export interface HabitMeasure {
  valueKind: HabitValueKind;
  bound: HabitBound;
  target: number;
  unit?: string;
  aggregate?: HabitAggregate;
}
export interface HabitEntry {
  at: number;
  value: number;
}
export type VertexSettings =
  | { kind: "vanilla" }
  | { kind: "bucket" }
  | { kind: "deadline"; deadlineAt: number }
  | { kind: "thought"; text?: string }
  | {
      kind: "reading";
      resource: string;
      progressPercent?: number;
      pagesRead?: number;
      totalPages?: number;
    }
  | {
      kind: "habit";
      frequency: number;
      interval: HabitInterval;
      weekdays?: Weekday[];
      measure?: HabitMeasure;
    };
export type VertexKind = VertexSettings["kind"];
export type Vertex =
  | Exclude<VertexSettings, { kind: "habit" }>
  | (Extract<VertexSettings, { kind: "habit" }> & {
      completions: number[];
      entries?: HabitEntry[];
    });

export interface UnlockedAchievement {
  id: string;
  unlockedAt: number;
}

export type AchievementCategory =
  "focus" | "streaks" | "habits" | "graph" | "completion" | "notes" | "secret";

export type AchievementTier = "bronze" | "silver" | "gold" | "platinum";
export type AchievementUnit = "duration" | "count" | "days" | "none";

export interface AchievementView {
  id: string;
  title: string;
  description: string;
  category: AchievementCategory;
  tier: AchievementTier;
  icon: string;
  hidden: boolean;
  endless: boolean;
  unit: AchievementUnit;
  unlockedAt: number | null;
  current: number;
  target: number;
}

export interface DailyWinView {
  id: string;
  title: string;
  description: string;
  unit: AchievementUnit;
  completed: boolean;
  applicable: boolean;
  current: number;
  target: number;
}

export interface AchievementEvaluation {
  core: AchievementView[];
  endless: AchievementView[];
  daily: DailyWinView[];
}

export interface HabitPeriodStatus {
  recordedCount: number;
  qualifyingCount: number;
  totalValue: number;
  state: "unrecorded" | "met" | "missed";
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
  /** Missing in older workspaces; Rust normalizes it to vanilla. */
  vertex?: Vertex;
  bucketId?: string;
  size?: { width: number; height: number };
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
  achievements?: UnlockedAchievement[];
}

export type Action =
  | {
      type: "resizeVertex";
      id: string;
      x: number;
      y: number;
      width: number;
      height: number;
    }
  | { type: "showFinished"; treeId: string; enabled: boolean }
  | { type: "pedantic"; treeId: string; enabled: boolean }
  | { type: "create"; id: string; title: string }
  | { type: "reorderTree"; id: string; direction: -1 | 1 }
  | {
      type: "isolate";
      id: string;
      treeId: string;
      title: string;
      linkedTreeId?: string;
      vertex?: VertexSettings;
    }
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
      vertex?: VertexSettings;
    }
  | { type: "configureVertex"; id: string; vertex: VertexSettings }
  | { type: "recordHabit"; id: string; undo?: boolean; value?: number }
  | {
      type: "setHabitHistory";
      id: string;
      completions?: number[];
      expected?: number[];
      entries?: HabitEntry[];
      expectedEntries?: HabitEntry[];
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
  | { type: "move"; id: string; x: number; y: number; bucketId?: string }
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
