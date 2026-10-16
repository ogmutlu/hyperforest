//! Translate transport commands; presentation edits stay in this adapter.
use crate::document::{color, millis, Document};
use hyperforest_domain as d;
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Expected {
    title: String,
    notes: String,
    estimate_minutes: f64,
}

#[derive(Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Action {
    Create {
        id: String,
        title: String,
    },
    Add {
        id: String,
        parent_id: String,
        title: String,
        linked_tree_id: Option<String>,
    },
    Isolate {
        id: String,
        tree_id: String,
        title: String,
    },
    Edit {
        id: String,
        title: String,
        estimate_minutes: f64,
        notes: String,
        expected: Option<Expected>,
    },
    Connect {
        id: String,
        parent_id: Option<String>,
    },
    Pedantic {
        tree_id: String,
        enabled: bool,
    },
    Color {
        id: String,
        color: Option<String>,
    },
    MultipleColors {
        id: String,
        enabled: bool,
    },
    Colors {
        id: String,
        colors: Vec<String>,
    },
    Complete {
        id: String,
        session_id: String,
    },
    Delete {
        id: String,
    },
    ReorderTree {
        id: String,
        direction: i8,
    },
    Start {
        id: String,
    },
    Pause,
    Finish {
        id: String,
    },
    Discard,
    AddSession {
        id: String,
        node_id: String,
        started_at: u64,
        duration_ms: u64,
    },
    DeleteSession {
        id: String,
    },
    Move {
        id: String,
        x: f64,
        y: f64,
    },
    Layout {
        tree_id: String,
    },
    Fill {
        id: String,
        filled: bool,
    },
    ShowFinished {
        tree_id: String,
        enabled: bool,
    },
}
fn id(value: String) -> Vec<u8> {
    value.into_bytes()
}
fn title(value: String) -> Vec<u8> {
    value.trim().as_bytes().to_vec()
}
fn find_node(document: &Document, id: &str) -> Result<usize, String> {
    document
        .nodes
        .iter()
        .position(|node| node.id == id)
        .ok_or_else(|| crate::message(d::Error::MissingNode))
}
fn editable(document: &Document, id: &str) -> Result<usize, String> {
    let index = find_node(document, id)?;
    if document.nodes[index].finished_at.is_some() {
        return Err(crate::message(d::Error::FinishedNode));
    }
    Ok(index)
}

pub fn apply(
    mut document: Document,
    state: &d::State,
    action: Action,
    now: u64,
) -> Result<Document, String> {
    let mut notes = None;
    let command = match action {
        Action::Move { id, x, y } => {
            let index = editable(&document, &id)?;
            if !x.is_finite() || !y.is_finite() {
                return Err("Invalid vertex position.".into());
            }
            document.nodes[index].x = x;
            document.nodes[index].y = y;
            return Ok(document);
        }
        Action::Fill { id, filled } => {
            let index = editable(&document, &id)?;
            document.nodes[index].filled = filled;
            return Ok(document);
        }
        Action::ShowFinished { tree_id, enabled } => {
            let tree = document
                .trees
                .iter_mut()
                .find(|tree| tree.id == tree_id)
                .ok_or_else(|| crate::message(d::Error::MissingTree))?;
            tree.show_finished = enabled;
            return Ok(document);
        }
        Action::Layout { tree_id } => return crate::layout::arrange(document, &tree_id),
        Action::Create {
            id: identity,
            title: name,
        } => d::Command::Create {
            id: id(identity),
            title: title(name),
        },
        Action::Add {
            id: identity,
            parent_id,
            title: name,
            linked_tree_id,
        } => {
            let parent = &document.nodes[find_node(&document, &parent_id)?];
            d::Command::Add {
                id: id(identity),
                tree_id: parent.tree_id.as_bytes().to_vec(),
                parent_id: Some(id(parent_id)),
                title: title(name),
                linked_tree_id: linked_tree_id.map(id),
            }
        }
        Action::Isolate {
            id: identity,
            tree_id,
            title: name,
        } => d::Command::Add {
            id: id(identity),
            tree_id: id(tree_id),
            parent_id: None,
            title: title(name),
            linked_tree_id: None,
        },
        Action::Edit {
            id: identity,
            title: name,
            estimate_minutes,
            notes: text,
            expected,
        } => {
            if !estimate_minutes.is_finite() || estimate_minutes < 0.0 {
                return Err("The estimate must be nonnegative.".into());
            }
            let node = &document.nodes[find_node(&document, &identity)?];
            if let Some(expected) = expected {
                if node.title != expected.title
                    || node.notes != expected.notes
                    || node.estimate_minutes != expected.estimate_minutes
                {
                    return Err("This goal was edited in another tab. Copy your notes and reopen it before saving.".into());
                }
            }
            notes = Some((identity.clone(), text));
            d::Command::Edit {
                id: id(identity),
                title: title(name),
                estimate_ms: millis((estimate_minutes * 60000.0).round())?,
            }
        }
        Action::Connect {
            id: identity,
            parent_id,
        } => d::Command::Connect {
            id: id(identity),
            parent_id: parent_id.map(id),
        },
        Action::Pedantic { tree_id, enabled } => d::Command::SetPedantic {
            tree_id: id(tree_id),
            enabled,
        },
        Action::Color {
            id: identity,
            color: value,
        } => d::Command::SetColor {
            id: id(identity),
            color: value.as_deref().map(color).transpose()?,
        },
        Action::MultipleColors {
            id: identity,
            enabled,
        } => d::Command::SetMultipleColors {
            id: id(identity),
            enabled,
        },
        Action::Colors {
            id: identity,
            colors,
        } => d::Command::SetColors {
            id: id(identity),
            colors: colors.iter().map(|c| color(c)).collect::<Result<_, _>>()?,
        },
        Action::Complete {
            id: identity,
            session_id,
        } => d::Command::Complete {
            id: id(identity),
            session_id: id(session_id),
        },
        Action::Delete { id: identity } => d::Command::Delete { id: id(identity) },
        Action::ReorderTree {
            id: identity,
            direction,
        } => {
            if direction != -1 && direction != 1 {
                return Err("Invalid tab direction.".into());
            }
            d::Command::ReorderTree {
                id: id(identity),
                earlier: direction == -1,
            }
        }
        Action::Start { id: identity } => d::Command::Start { id: id(identity) },
        Action::Pause => d::Command::Pause,
        Action::Finish { id: identity } => d::Command::Save {
            session_id: id(identity),
        },
        Action::Discard => d::Command::Discard,
        Action::AddSession {
            id: identity,
            node_id,
            started_at,
            duration_ms,
        } => d::Command::AddSession {
            id: id(identity),
            node_id: id(node_id),
            started_at,
            duration_ms,
        },
        Action::DeleteSession { id: identity } => d::Command::DeleteSession { id: id(identity) },
    };
    let arrange_tree = match &command {
        d::Command::Add {
            tree_id,
            parent_id: Some(_),
            ..
        } => Some(crate::document::text(tree_id)?),
        _ => None,
    };
    let next = state.apply(command, now).map_err(crate::message)?;
    document = document.merge(next.snapshot())?;
    if let Some((id, text)) = notes {
        let index = find_node(&document, &id)?;
        document.nodes[index].notes = text;
    }
    if let Some(tree) = arrange_tree {
        document = crate::layout::arrange(document, &tree)?;
    }
    Ok(document)
}
