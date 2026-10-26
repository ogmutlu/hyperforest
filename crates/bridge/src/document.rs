//! Version-1 JSON/YAML schema. Presentation data never enters the domain crate.
use hyperforest_domain as d;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Tree {
    pub id: String,
    pub title: String,
    pub created_at: u64,
    #[serde(default)]
    pub pedantic: bool,
    #[serde(default)]
    pub show_finished: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Node {
    pub id: String,
    pub tree_id: String,
    pub parent_id: Option<String>,
    pub title: String,
    pub estimate_minutes: f64,
    pub notes: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes_file: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub finished_at: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub linked_tree_id: Option<String>,
    #[serde(default = "yes")]
    pub filled: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub colors: Option<Vec<String>>,
    #[serde(default)]
    pub multiple_colors: bool,
    #[serde(default)]
    pub vertex: crate::vertex::Vertex,
    pub x: f64,
    pub y: f64,
}
fn yes() -> bool {
    true
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Period {
    pub start: u64,
    pub end: u64,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub imported_at: Option<u64>,
    pub tree_id: String,
    pub node_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub credit_node_id: Option<String>,
    pub title: String,
    pub group: String,
    pub started_at: u64,
    pub ended_at: u64,
    pub duration_ms: u64,
    #[serde(default)]
    pub periods: Option<Vec<Period>>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Focus {
    pub tree_id: String,
    pub node_id: String,
    pub title: String,
    pub group: String,
    pub started_at: u64,
    pub running_since: Option<u64>,
    pub elapsed_ms: u64,
    #[serde(default)]
    pub periods: Option<Vec<Period>>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Document {
    pub version: u8,
    pub trees: Vec<Tree>,
    pub nodes: Vec<Node>,
    pub sessions: Vec<Session>,
    pub focus: Option<Focus>,
}

pub fn color(value: &str) -> Result<u32, String> {
    if value.len() != 7 || !value.starts_with('#') {
        return Err("Use a color in #rrggbb format.".into());
    }
    u32::from_str_radix(&value[1..], 16).map_err(|_| "Use a color in #rrggbb format.".into())
}
pub fn color_text(color: u32) -> String {
    format!("#{color:06x}")
}
pub fn text(bytes: &[u8]) -> Result<String, String> {
    String::from_utf8(bytes.to_vec()).map_err(|_| "Invalid UTF-8 in domain text.".into())
}
pub fn millis(value: f64) -> Result<u64, String> {
    // JavaScript's exact-integer range is part of the transport contract.
    if !value.is_finite() || value < 0.0 || value > 9_007_199_254_740_991.0 || value.fract() != 0.0
    {
        return Err(
            "Time must be a nonnegative, exactly representable integer number of milliseconds."
                .into(),
        );
    }
    Ok(value as u64)
}
pub fn safe_number(value: u64) -> Result<f64, String> {
    if value > 9_007_199_254_740_991 {
        return Err("Time exceeds JavaScript's exact integer range.".into());
    }
    Ok(value as f64)
}
fn check_periods(periods: &[Period]) -> Result<(), String> {
    for period in periods {
        safe_number(period.start)?;
        safe_number(period.end)?;
    }
    Ok(())
}
fn periods(value: &[Period]) -> Vec<d::Period> {
    value
        .iter()
        .map(|p| d::Period {
            start: p.start,
            end: p.end,
        })
        .collect()
}
/// Omitted periods are exact only when there is no elapsed time, or the entire
/// known span was spent focusing. Never invent pause locations from a total.
fn resolve_periods(
    value: Option<&[Period]>,
    start: u64,
    end: Option<u64>,
    duration: u64,
) -> Result<Vec<d::Period>, String> {
    if let Some(value) = value {
        return Ok(periods(value));
    }
    if duration == 0 {
        return Ok(vec![]);
    }
    if let Some(end) = end {
        if end.checked_sub(start) == Some(duration) {
            return Ok(vec![d::Period { start, end }]);
        }
    }
    Err("Missing focus periods: the saved duration does not identify when pauses occurred. Explicit intervals are required.".into())
}
fn wire_periods(value: &[d::Period]) -> Vec<Period> {
    value
        .iter()
        .map(|p| Period {
            start: p.start,
            end: p.end,
        })
        .collect()
}
fn title(value: &str) -> Result<Vec<u8>, String> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > 100 {
        return Err("Give this goal a name of 1 to 100 characters.".into());
    }
    Ok(value.as_bytes().to_vec())
}

impl Document {
    pub fn domain(&self) -> Result<d::State, String> {
        if self.version != 1 {
            return Err("Unsupported workspace version.".into());
        }
        for tree in &self.trees {
            safe_number(tree.created_at)?;
        }
        for node in &self.nodes {
            node.vertex.validate()?;
            if let Some(at) = node.finished_at {
                safe_number(at)?;
            }
        }
        for session in &self.sessions {
            if let Some(at) = session.imported_at {
                safe_number(at)?;
            }
            safe_number(session.started_at)?;
            safe_number(session.ended_at)?;
            safe_number(session.duration_ms)?;
            check_periods(session.periods.as_deref().unwrap_or_default())?;
        }
        if let Some(focus) = &self.focus {
            safe_number(focus.started_at)?;
            safe_number(focus.elapsed_ms)?;
            if let Some(since) = focus.running_since {
                safe_number(since)?;
            }
            check_periods(focus.periods.as_deref().unwrap_or_default())?;
        }
        let mut nodes = Vec::new();
        for node in &self.nodes {
            if !node.x.is_finite() || !node.y.is_finite() {
                return Err("Invalid vertex position.".into());
            }
            nodes.push(d::Node {
                id: node.id.as_bytes().to_vec(),
                tree_id: node.tree_id.as_bytes().to_vec(),
                parent_id: node.parent_id.as_ref().map(|id| id.as_bytes().to_vec()),
                title: title(&node.title)?,
                estimate_ms: millis((node.estimate_minutes * 60000.0).round())?,
                finished_at: node.finished_at,
                linked_tree_id: node
                    .linked_tree_id
                    .as_ref()
                    .map(|id| id.as_bytes().to_vec()),
                color: node.color.as_deref().map(color).transpose()?,
                colors: node
                    .colors
                    .as_ref()
                    .map(|colors| colors.iter().map(|c| color(c)).collect())
                    .transpose()?
                    .unwrap_or_default(),
                multiple_colors: node.multiple_colors,
            });
            if node.estimate_minutes < 0.0 {
                return Err("The estimate must be nonnegative.".into());
            }
            if node.colors.as_ref().is_some_and(Vec::is_empty) {
                return Err("Vertex colors cannot be empty.".into());
            }
        }
        let trees = self
            .trees
            .iter()
            .map(|tree| {
                Ok(d::Tree {
                    id: tree.id.as_bytes().to_vec(),
                    title: title(&tree.title)?,
                    created_at: tree.created_at,
                    pedantic: tree.pedantic,
                })
            })
            .collect::<Result<_, String>>()?;
        let sessions = self
            .sessions
            .iter()
            .map(|s| {
                Ok(d::Session {
                    imported_at: s.imported_at,
                    id: s.id.as_bytes().to_vec(),
                    tree_id: s.tree_id.as_bytes().to_vec(),
                    node_id: s.node_id.as_bytes().to_vec(),
                    credit_node_id: s.credit_node_id.as_ref().map(|id| id.as_bytes().to_vec()),
                    title: s.title.as_bytes().to_vec(),
                    group: s.group.as_bytes().to_vec(),
                    started_at: s.started_at,
                    ended_at: s.ended_at,
                    duration_ms: s.duration_ms,
                    periods: resolve_periods(
                        s.periods.as_deref(),
                        s.started_at,
                        Some(s.ended_at),
                        s.duration_ms,
                    )?,
                })
            })
            .collect::<Result<Vec<_>, String>>()?;
        let focus = self
            .focus
            .as_ref()
            .map(|f| {
                Ok::<_, String>(d::Focus {
                    tree_id: f.tree_id.as_bytes().to_vec(),
                    node_id: f.node_id.as_bytes().to_vec(),
                    title: f.title.as_bytes().to_vec(),
                    group: f.group.as_bytes().to_vec(),
                    started_at: f.started_at,
                    running_since: f.running_since,
                    elapsed_ms: f.elapsed_ms,
                    periods: resolve_periods(
                        f.periods.as_deref(),
                        f.started_at,
                        f.running_since,
                        f.elapsed_ms,
                    )?,
                })
            })
            .transpose()?;
        d::State::new(d::Snapshot {
            trees,
            nodes,
            sessions,
            focus,
        })
        .map_err(crate::message)
    }

    /// Preserve notes, filenames, coordinates, and visibility by stable identity.
    pub fn merge(&self, snapshot: &d::Snapshot) -> Result<Self, String> {
        let mut trees = Vec::new();
        for tree in &snapshot.trees {
            let id = text(&tree.id)?;
            let old = self.trees.iter().find(|old| old.id == id);
            trees.push(Tree {
                id,
                title: text(&tree.title)?,
                created_at: tree.created_at,
                pedantic: tree.pedantic,
                show_finished: old.is_some_and(|old| old.show_finished),
            });
        }
        let mut nodes = Vec::new();
        for node in &snapshot.nodes {
            let id = text(&node.id)?;
            let old = self.nodes.iter().find(|old| old.id == id);
            nodes.push(Node {
                id,
                tree_id: text(&node.tree_id)?,
                parent_id: node.parent_id.as_deref().map(text).transpose()?,
                title: text(&node.title)?,
                estimate_minutes: node.estimate_ms as f64 / 60000.0,
                notes: old.map(|old| old.notes.clone()).unwrap_or_default(),
                notes_file: old.and_then(|old| old.notes_file.clone()),
                vertex: old.map(|old| old.vertex.clone()).unwrap_or_default(),
                finished_at: node.finished_at,
                linked_tree_id: node.linked_tree_id.as_deref().map(text).transpose()?,
                filled: old.is_none_or(|old| old.filled),
                color: Some(color_text(d::graph::assigned_color(snapshot, node))),
                colors: if node.colors.is_empty() {
                    None
                } else {
                    Some(node.colors.iter().map(|c| color_text(*c)).collect())
                },
                multiple_colors: node.multiple_colors,
                x: old.map(|old| old.x).unwrap_or(550.0),
                y: old.map(|old| old.y).unwrap_or(130.0),
            });
        }
        let sessions = snapshot
            .sessions
            .iter()
            .map(|s| {
                Ok(Session {
                    imported_at: s.imported_at,
                    id: text(&s.id)?,
                    tree_id: text(&s.tree_id)?,
                    node_id: text(&s.node_id)?,
                    credit_node_id: s.credit_node_id.as_deref().map(text).transpose()?,
                    title: text(&s.title)?,
                    group: text(&s.group)?,
                    started_at: s.started_at,
                    ended_at: s.ended_at,
                    duration_ms: s.duration_ms,
                    periods: Some(wire_periods(&s.periods)),
                })
            })
            .collect::<Result<_, String>>()?;
        let focus = snapshot
            .focus
            .as_ref()
            .map(|f| {
                Ok::<_, String>(Focus {
                    tree_id: text(&f.tree_id)?,
                    node_id: text(&f.node_id)?,
                    title: text(&f.title)?,
                    group: text(&f.group)?,
                    started_at: f.started_at,
                    running_since: f.running_since,
                    elapsed_ms: f.elapsed_ms,
                    periods: Some(wire_periods(&f.periods)),
                })
            })
            .transpose()?;
        Ok(Self {
            version: 1,
            trees,
            nodes,
            sessions,
            focus,
        })
    }
}
