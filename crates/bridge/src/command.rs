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
    ResizeVertex {
        id: String,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
    },
    Create {
        id: String,
        title: String,
    },
    Add {
        id: String,
        parent_id: String,
        title: String,
        linked_tree_id: Option<String>,
        #[serde(default)]
        vertex: crate::vertex::Vertex,
    },
    ConfigureVertex {
        id: String,
        vertex: crate::vertex::Vertex,
    },
    SetHabitHistory {
        id: String,
        #[serde(default)]
        completions: Vec<u64>,
        expected: Option<Vec<u64>>,
        #[serde(default)]
        entries: Vec<crate::vertex::HabitEntry>,
        expected_entries: Option<Vec<crate::vertex::HabitEntry>>,
    },
    RecordHabit {
        id: String,
        #[serde(default)]
        undo: bool,
        #[serde(default)]
        value: Option<f64>,
    },
    Isolate {
        id: String,
        tree_id: String,
        title: String,
        linked_tree_id: Option<String>,
        #[serde(default)]
        vertex: crate::vertex::Vertex,
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
    ImportSession {
        id: String,
        title: String,
        started_at: u64,
        ended_at: u64,
        duration_ms: u64,
        periods: Vec<crate::document::Period>,
    },
    DeleteSession {
        id: String,
    },
    Move {
        id: String,
        x: f64,
        y: f64,
        bucket_id: Option<String>,
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
    let mut added_vertex = None;
    let mut habit_unit_update: Option<(String, Option<String>)> = None;
    let command = match action {
        Action::ResizeVertex {
            id,
            x,
            y,
            width,
            height,
        } => {
            let index = editable(&document, &id)?;
            let size = crate::document::Size { width, height };
            size.validate(&document.nodes[index].vertex)?;
            if !x.is_finite() || !y.is_finite() {
                return Err("Invalid vertex position.".into());
            }
            document.nodes[index].size = Some(size);
            document.nodes[index].x = x;
            document.nodes[index].y = y;
            return Ok(document);
        }
        Action::ConfigureVertex {
            id: identity,
            vertex,
        } => {
            let index = editable(&document, &identity)?;
            if core::mem::discriminant(&document.nodes[index].vertex)
                != core::mem::discriminant(&vertex)
            {
                return Err("A vertex's kind cannot be changed.".into());
            }
            if let crate::vertex::Vertex::Habit {
                frequency,
                interval,
                weekdays,
                measure,
                ..
            } = vertex
            {
                let weekdays_mask = crate::vertex::weekdays_to_mask(&weekdays);
                if interval == crate::vertex::HabitInterval::Custom {
                    if weekdays_mask == 0 {
                        return Err(
                            "Choose at least one day of the week for a custom habit.".into()
                        );
                    }
                } else if !weekdays.is_empty() {
                    return Err(
                        "Specific weekdays are only used with custom habit intervals.".into(),
                    );
                }
                let unit = match &measure {
                    Some(m) => crate::vertex::normalize_unit(m.value_kind, m.unit.as_deref())?,
                    None => None,
                };
                let domain_measure = measure
                    .as_ref()
                    .map(crate::vertex::measure_to_domain)
                    .transpose()?;
                habit_unit_update = Some((identity.clone(), unit));
                d::Command::ConfigureHabit {
                    id: id(identity),
                    frequency,
                    interval: crate::vertex::interval_to_domain(interval),
                    weekdays: weekdays_mask,
                    measure: domain_measure,
                }
            } else {
                // The full thought is presentation metadata; its domain title stays short.
                if let crate::vertex::Vertex::Thought { text: Some(text) } = &vertex {
                    document.nodes[index].title = text
                        .split_whitespace()
                        .take(6)
                        .collect::<Vec<_>>()
                        .join(" ")
                        .chars()
                        .take(80)
                        .collect();
                }
                document.nodes[index].vertex = document.nodes[index].vertex.configure(vertex)?;
                return Ok(document);
            }
        }
        Action::SetHabitHistory {
            id: identity,
            completions,
            expected,
            entries,
            expected_entries,
        } => {
            let index = editable(&document, &identity)?;
            let crate::vertex::Vertex::Habit {
                completions: records,
                measure,
                entries: current_entries,
                ..
            } = &document.nodes[index].vertex
            else {
                return Err("Only habits have repetition history.".into());
            };
            match measure {
                None => {
                    if !entries.is_empty()
                        || completions.len() > d::MAX_HABIT_RECORDS
                        || completions.iter().any(|at| *at > now)
                    {
                        return Err(
                            "Habit history must contain at most 100000 repetitions, no later than now."
                                .into(),
                        );
                    }
                    if expected
                        .as_ref()
                        .is_some_and(|expected| expected != records)
                    {
                        return Err(
                            "Habit history changed in another tab. Reopen it before saving.".into(),
                        );
                    }
                    d::Command::SetHabitHistory {
                        id: id(identity),
                        completions,
                        entries: vec![],
                    }
                }
                Some(m) => {
                    if !completions.is_empty()
                        || entries.len() > d::MAX_HABIT_RECORDS
                        || entries.iter().any(|entry| entry.at > now)
                    {
                        return Err(
                            "Habit history must contain at most 100000 entries, no later than now."
                                .into(),
                        );
                    }
                    if expected_entries
                        .as_ref()
                        .is_some_and(|expected| expected != current_entries)
                    {
                        return Err(
                            "Habit history changed in another tab. Reopen it before saving.".into(),
                        );
                    }
                    let mut domain_entries = Vec::with_capacity(entries.len());
                    for entry in entries {
                        crate::document::safe_number(entry.at)?;
                        domain_entries.push(d::HabitEntry {
                            at: entry.at,
                            value: crate::vertex::value_to_domain(m.value_kind, entry.value)?,
                        });
                    }
                    d::Command::SetHabitHistory {
                        id: id(identity),
                        completions: vec![],
                        entries: domain_entries,
                    }
                }
            }
        }
        Action::RecordHabit {
            id: identity,
            undo,
            value,
        } => {
            let index = editable(&document, &identity)?;
            let crate::vertex::Vertex::Habit {
                completions,
                measure,
                entries,
                ..
            } = &document.nodes[index].vertex
            else {
                return Err("Only habits have a repetition counter or value history.".into());
            };
            if !undo {
                let last_at = match measure {
                    None => completions.last().copied(),
                    Some(_) => entries.last().map(|entry| entry.at),
                };
                if last_at.is_some_and(|last| last > now) {
                    return Err("The clock is earlier than the last habit record.".into());
                }
            }
            let domain_value = if undo {
                None
            } else {
                match (measure, value) {
                    (None, None) => None,
                    (None, Some(_)) => {
                        return Err("Repetition habits do not take a numeric value.".into());
                    }
                    (Some(_), None) => {
                        return Err("Enter a value to record for this habit.".into());
                    }
                    (Some(m), Some(v)) => Some(crate::vertex::value_to_domain(m.value_kind, v)?),
                }
            };
            d::Command::RecordHabit {
                id: id(identity),
                undo,
                value: domain_value,
            }
        }
        Action::Move {
            id,
            x,
            y,
            bucket_id,
        } => {
            let index = editable(&document, &id)?;
            if !x.is_finite() || !y.is_finite() {
                return Err("Invalid vertex position.".into());
            }
            if let Some(target) = &bucket_id {
                if document.nodes[index].id == document.nodes[index].tree_id
                    || matches!(document.nodes[index].vertex, crate::vertex::Vertex::Bucket)
                    || !document.nodes.iter().any(|bucket| {
                        bucket.id == *target
                            && bucket.tree_id == document.nodes[index].tree_id
                            && bucket.finished_at.is_none()
                            && matches!(bucket.vertex, crate::vertex::Vertex::Bucket)
                    })
                {
                    return Err("Choose an active bucket in this hypertree.".into());
                }
            }
            let dx = x - document.nodes[index].x;
            let dy = y - document.nodes[index].y;
            for member in &mut document.nodes {
                if member.bucket_id.as_deref() == Some(&id) {
                    member.x += dx;
                    member.y += dy;
                }
            }
            document.nodes[index].bucket_id = bucket_id;
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
            vertex,
        } => {
            vertex.validate_new()?;
            let allows_isolation = vertex.allows_isolation();
            let habit = vertex.to_domain_habit()?;
            added_vertex = Some((identity.clone(), parent_id.clone(), vertex));
            let parent = &document.nodes[find_node(&document, &parent_id)?];
            d::Command::Add {
                id: id(identity),
                tree_id: parent.tree_id.as_bytes().to_vec(),
                parent_id: Some(id(parent_id)),
                title: title(name),
                linked_tree_id: linked_tree_id.map(id),
                allows_isolation,
                habit,
            }
        }
        Action::Isolate {
            id: identity,
            tree_id,
            title: name,
            linked_tree_id,
            vertex,
        } => {
            vertex.validate_new()?;
            let allows_isolation = vertex.allows_isolation();
            let habit = vertex.to_domain_habit()?;
            added_vertex = Some((identity.clone(), tree_id.clone(), vertex));
            d::Command::Add {
                id: id(identity),
                tree_id: id(tree_id),
                parent_id: None,
                title: title(name),
                linked_tree_id: linked_tree_id.map(id),
                allows_isolation,
                habit,
            }
        }
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
        Action::ImportSession {
            id: identity,
            title: name,
            started_at,
            ended_at,
            duration_ms,
            periods,
        } => d::Command::ImportSession {
            id: id(identity),
            title: title(name),
            started_at,
            ended_at,
            duration_ms,
            periods: periods
                .into_iter()
                .map(|p| d::Period {
                    start: p.start,
                    end: p.end,
                })
                .collect(),
        },
        Action::DeleteSession { id: identity } => d::Command::DeleteSession { id: id(identity) },
    };
    let imported = matches!(&command, d::Command::ImportSession { .. });
    let old_node_count = document.nodes.len();
    let next = state.apply(command, now).map_err(crate::message)?;
    document = document.merge(next.snapshot())?;
    if let Some((id, text)) = notes {
        let index = find_node(&document, &id)?;
        document.nodes[index].notes = text;
    }
    if imported && document.nodes.len() != old_node_count {
        let tree_id = document
            .trees
            .iter()
            .find(|tree| tree.title == "hiper")
            .map(|tree| tree.id.clone());
        if let Some(tree_id) = tree_id {
            document = crate::layout::arrange(document, &tree_id)?;
        }
    }
    if let Some((id, unit)) = habit_unit_update {
        let index = find_node(&document, &id)?;
        if let crate::vertex::Vertex::Habit {
            measure: Some(ref mut m),
            ..
        } = document.nodes[index].vertex
        {
            m.unit = unit;
        }
    }
    if let Some((id, parent_id, vertex)) = added_vertex {
        let index = find_node(&document, &id)?;
        if !matches!(vertex, crate::vertex::Vertex::Habit { .. }) {
            document.nodes[index].vertex = vertex;
        } else if let crate::vertex::Vertex::Habit {
            measure: Some(ref mut m),
            ..
        } = document.nodes[index].vertex
        {
            m.unit = vertex.habit_unit();
        }
        document = crate::vertex::place_new(document, &id, &parent_id)?;
    }
    Ok(document)
}
