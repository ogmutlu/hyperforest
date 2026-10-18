use alloc::vec::Vec;

/// Stable identity, supplied by the caller. Equality is byte-for-byte.
pub type Id = Vec<u8>;
pub type Text = Vec<u8>;
pub type Color = u32;
pub const MAX_NODES: usize = 2000;
pub const DEFAULT_COLORS: [Color; 8] = [
    0xdfc491, 0x80c9bc, 0x9ca8dc, 0xb7c894, 0xcb99bc, 0x86b7db, 0xdd9689, 0xa5cfb4,
];

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
    Overflow,
    Limit,
}
