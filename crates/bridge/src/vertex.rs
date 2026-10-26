//! Vertex metadata and counters live beside notes and layout, outside the proof domain.
use crate::document::{safe_number, Document};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum HabitInterval {
    Day,
    Week,
    Month,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Vertex {
    #[default]
    Vanilla,
    Deadline {
        deadline_at: u64,
    },
    Thought,
    Reading {
        resource: String,
    },
    Habit {
        frequency: u16,
        interval: HabitInterval,
        #[serde(default)]
        completions: Vec<u64>,
    },
}

impl Vertex {
    pub fn validate_new(&self) -> Result<(), String> {
        self.validate()?;
        if matches!(self, Self::Habit { completions, .. } if !completions.is_empty()) {
            return Err("New habits start with an empty repetition counter.".into());
        }
        Ok(())
    }

    pub fn validate(&self) -> Result<(), String> {
        match self {
            Self::Deadline { deadline_at } => {
                safe_number(*deadline_at)?;
                if *deadline_at > 8_640_000_000_000_000 {
                    return Err("Choose a valid deadline date and time.".into());
                }
            }
            Self::Reading { resource } => validate_resource(resource)?,
            Self::Habit {
                frequency,
                completions,
                ..
            } => {
                if *frequency == 0 || *frequency > 1000 {
                    return Err("Choose a habit frequency from 1 to 1000.".into());
                }
                for at in completions {
                    safe_number(*at)?;
                }
                if completions.windows(2).any(|pair| pair[0] > pair[1]) {
                    return Err("Habit repetitions must be in time order.".into());
                }
            }
            _ => {}
        }
        Ok(())
    }

    /// Configuration edits cannot replace or erase the recorded counter history.
    pub fn configure(&self, mut next: Self) -> Result<Self, String> {
        if core::mem::discriminant(self) != core::mem::discriminant(&next) {
            return Err("A vertex's kind cannot be changed.".into());
        }
        if let (
            Self::Habit { completions, .. },
            Self::Habit {
                completions: records,
                ..
            },
        ) = (self, &mut next)
        {
            *records = completions.clone();
        }
        next.validate()?;
        Ok(next)
    }

    pub fn record(&mut self, now: u64, undo: bool) -> Result<(), String> {
        let Self::Habit { completions, .. } = self else {
            return Err("Only habit vertices have a repetition counter.".into());
        };
        if undo {
            completions
                .pop()
                .ok_or("There is no habit repetition to undo.")?;
        } else {
            if completions.last().is_some_and(|last| *last > now) {
                return Err("The clock is earlier than the last habit repetition.".into());
            }
            completions.push(now);
        }
        Ok(())
    }
}

pub fn validate_resource(resource: &str) -> Result<(), String> {
    if resource.len() > 8192 || resource.chars().any(char::is_control) {
        return Err("Use a file path or an http(s) website address.".into());
    }
    // A colon before any path separator denotes a URI scheme (except Windows drives).
    if let Some((scheme, _)) = resource.split_once(':') {
        let windows_drive = scheme.len() == 1 && scheme.as_bytes()[0].is_ascii_alphabetic();
        if !scheme.contains('/')
            && !scheme.contains('\\')
            && !windows_drive
            && !resource.starts_with("https://")
            && !resource.starts_with("http://")
        {
            return Err("Use a file path or an http(s) website address.".into());
        }
    }
    if matches!(resource, "http://" | "https://") {
        return Err("Include the website address after http(s)://.".into());
    }
    Ok(())
}

/// Choose an empty spot for just the new vertex. Existing coordinates never change.
pub fn place_new(mut document: Document, id: &str, parent_id: &str) -> Result<Document, String> {
    let parent = document
        .nodes
        .iter()
        .find(|node| node.id == parent_id)
        .ok_or("The parent vertex no longer exists.")?;
    let tree_id = parent.tree_id.clone();
    let desired = (parent.x, parent.y + 170.0);
    let mut candidates = vec![desired];
    // Prefer available space inside the original canvas, near the chosen parent.
    for row in 0..4 {
        for column in 0..5 {
            candidates.push((
                130.0 + f64::from(column) * 200.0,
                110.0 + f64::from(row) * 160.0,
            ));
        }
    }
    candidates.sort_by(|a, b| {
        let score =
            |point: &(f64, f64)| (point.0 - desired.0).powi(2) + (point.1 - desired.1).powi(2);
        score(a).total_cmp(&score(b))
    });
    let width = |vertex: &Vertex| {
        if matches!(vertex, Vertex::Thought) {
            180.0
        } else {
            90.0
        }
    };
    let index = document
        .nodes
        .iter()
        .position(|node| node.id == id)
        .ok_or("The new vertex no longer exists.")?;
    let half_width = width(&document.nodes[index].vertex);
    let clear = |x: f64, y: f64| {
        document.nodes.iter().all(|other| {
            other.id == id
                || other.tree_id != tree_id
                || (other.x - x).abs() >= width(&other.vertex) + half_width + 16.0
                || (other.y - y).abs() >= 140.0
        })
    };
    let point = candidates
        .into_iter()
        .find(|(x, y)| clear(*x, *y))
        .unwrap_or_else(|| {
            let bottom = document
                .nodes
                .iter()
                .filter(|node| node.id != id && node.tree_id == tree_id)
                .map(|node| node.y)
                .fold(130.0, f64::max);
            (desired.0, bottom + 170.0)
        });
    document.nodes[index].x = point.0;
    document.nodes[index].y = point.1;
    Ok(document)
}
