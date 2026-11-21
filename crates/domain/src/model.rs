use alloc::vec::Vec;

/// Stable identity, supplied by the caller. Equality is byte-for-byte.
pub type Id = Vec<u8>;
pub type Text = Vec<u8>;
pub type Color = u32;
pub const MAX_NODES: usize = 2000;
pub const HABIT_VALUE_SCALE: u64 = 1000;
pub const MAX_HABIT_NUMBER: u64 = 1_000_000_000 * HABIT_VALUE_SCALE;
pub const MAX_HABIT_TIME_OF_DAY: u64 = 1439;
pub const MAX_HABIT_RECORDS: usize = 100_000;
pub const DEFAULT_COLORS: [Color; 8] = [
    0xdfc491, 0x80c9bc, 0x9ca8dc, 0xb7c894, 0xcb99bc, 0x86b7db, 0xdd9689, 0xa5cfb4,
];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HabitInterval {
    Day,
    Week,
    Month,
    Custom,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HabitValueKind {
    /// Fixed-point nonnegative value scaled by `HABIT_VALUE_SCALE` (up to 3 decimals).
    Number,
    /// Clock time of day as integer minutes since midnight (`0..=1439`).
    TimeOfDay,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HabitBound {
    /// Completed when value >= target (e.g., pages read).
    AtLeast,
    /// Completed when value <= target (e.g., wake-up time, daily cap).
    AtMost,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HabitAggregate {
    /// Sum logged values in the period and compare against target (`Number` only).
    Sum,
    /// Check each logged entry against the bound; qualifying entries count toward `frequency`.
    PerEntry,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct HabitMeasure {
    pub value_kind: HabitValueKind,
    pub bound: HabitBound,
    pub target: u64,
    pub aggregate: HabitAggregate,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct HabitEntry {
    pub at: u64,
    pub value: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Habit {
    pub frequency: u16,
    pub interval: HabitInterval,
    /// 7-bit weekday mask for `HabitInterval::Custom` (bit 0 = Mon .. bit 6 = Sun); 0 otherwise.
    pub weekdays: u8,
    pub completions: Vec<u64>,
    pub measure: Option<HabitMeasure>,
    pub entries: Vec<HabitEntry>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Tree {
    pub id: Id,
    pub title: Text,
    pub created_at: u64,
    pub pedantic: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Node {
    pub id: Id,
    pub tree_id: Id,
    pub parent_id: Option<Id>,
    pub title: Text,
    pub estimate_ms: u64,
    pub finished_at: Option<u64>,
    pub linked_tree_id: Option<Id>,
    pub color: Option<Color>,
    pub colors: Vec<Color>,
    pub multiple_colors: bool,
    /// Standalone annotations may sit outside the host tree.
    pub allows_isolation: bool,
    /// Core habit configuration and timestamped history, when this vertex is a habit.
    pub habit: Option<Habit>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Period {
    pub start: u64,
    pub end: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Session {
    pub id: Id,
    /// When external history was explicitly assigned to the current tree.
    pub imported_at: Option<u64>,
    pub tree_id: Id,
    pub node_id: Id,
    pub credit_node_id: Option<Id>,
    pub title: Text,
    pub group: Text,
    pub started_at: u64,
    pub ended_at: u64,
    pub duration_ms: u64,
    pub periods: Vec<Period>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Focus {
    pub tree_id: Id,
    pub node_id: Id,
    pub title: Text,
    pub group: Text,
    pub started_at: u64,
    pub running_since: Option<u64>,
    pub elapsed_ms: u64,
    pub periods: Vec<Period>,
}

/// Public interchange value, validated by `State::new` before transitions.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Snapshot {
    pub trees: Vec<Tree>,
    pub nodes: Vec<Node>,
    pub sessions: Vec<Session>,
    pub focus: Option<Focus>,
}

impl Snapshot {
    pub fn empty() -> Self {
        Self {
            trees: Vec::new(),
            nodes: Vec::new(),
            sessions: Vec::new(),
            focus: None,
        }
    }
}

/// Business operations only. Position, fill, notes, and tab visibility are UI data.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Command {
    Create {
        id: Id,
        title: Text,
    },
    Add {
        id: Id,
        tree_id: Id,
        parent_id: Option<Id>,
        title: Text,
        linked_tree_id: Option<Id>,
        allows_isolation: bool,
        habit: Option<Habit>,
    },
    ConfigureHabit {
        id: Id,
        frequency: u16,
        interval: HabitInterval,
        weekdays: u8,
        measure: Option<HabitMeasure>,
    },
    RecordHabit {
        id: Id,
        undo: bool,
        value: Option<u64>,
    },
    SetHabitHistory {
        id: Id,
        completions: Vec<u64>,
        entries: Vec<HabitEntry>,
    },
    Edit {
        id: Id,
        title: Text,
        estimate_ms: u64,
    },
    Connect {
        id: Id,
        parent_id: Option<Id>,
    },
    SetPedantic {
        tree_id: Id,
        enabled: bool,
    },
    SetColor {
        id: Id,
        color: Option<Color>,
    },
    SetMultipleColors {
        id: Id,
        enabled: bool,
    },
    SetColors {
        id: Id,
        colors: Vec<Color>,
    },
    Complete {
        id: Id,
        session_id: Id,
    },
    Delete {
        id: Id,
    },
    ReorderTree {
        id: Id,
        earlier: bool,
    },
    Start {
        id: Id,
    },
    Pause,
    Save {
        session_id: Id,
    },
    Discard,
    AddSession {
        id: Id,
        node_id: Id,
        started_at: u64,
        duration_ms: u64,
    },
    ImportSession {
        id: Id,
        title: Text,
        started_at: u64,
        ended_at: u64,
        duration_ms: u64,
        periods: Vec<Period>,
    },
    DeleteSession {
        id: Id,
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Error {
    MissingNode,
    MissingTree,
    MissingSession,
    DuplicateId,
    InvalidName,
    DuplicateName,
    InvalidGraph,
    Cycle,
    RootConnection,
    CrossTreeConnection,
    FinishedNode,
    FinishedParent,
    ActiveSession,
    CurrentSession,
    RootCompletion,
    Disconnected,
    DisconnectedColor,
    InvalidColors,
    EnableMultipleColors,
    InvalidTime,
    InvalidSession,
    NotHabit,
    InvalidHabit,
    HabitHistoryEmpty,
    HabitKindMismatch,
    Overflow,
    Limit,
}
