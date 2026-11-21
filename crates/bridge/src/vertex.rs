//! Vertex metadata and bridge conversions for habit values/units.
use crate::document::{safe_number, Document};
use hyperforest_domain as d;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum HabitInterval {
    Day,
    Week,
    Month,
    Custom,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Weekday {
    Mon,
    Tue,
    Wed,
    Thu,
    Fri,
    Sat,
    Sun,
}

const ALL_WEEKDAYS: [Weekday; 7] = [
    Weekday::Mon,
    Weekday::Tue,
    Weekday::Wed,
    Weekday::Thu,
    Weekday::Fri,
    Weekday::Sat,
    Weekday::Sun,
];

pub fn weekdays_to_mask(days: &[Weekday]) -> u8 {
    let mut mask = 0_u8;
    for day in days {
        let bit = match day {
            Weekday::Mon => 0,
            Weekday::Tue => 1,
            Weekday::Wed => 2,
            Weekday::Thu => 3,
            Weekday::Fri => 4,
            Weekday::Sat => 5,
            Weekday::Sun => 6,
        };
        mask |= 1 << bit;
    }
    mask
}

pub fn weekdays_from_mask(mask: u8) -> Vec<Weekday> {
    ALL_WEEKDAYS
        .iter()
        .enumerate()
        .filter(|(bit, _)| (mask & (1 << bit)) != 0)
        .map(|(_, day)| *day)
        .collect()
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum HabitValueKind {
    Number,
    TimeOfDay,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum HabitBound {
    AtLeast,
    AtMost,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum HabitAggregate {
    #[default]
    Sum,
    PerEntry,
}

#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HabitMeasure {
    pub value_kind: HabitValueKind,
    pub bound: HabitBound,
    pub target: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unit: Option<String>,
    #[serde(default)]
    pub aggregate: HabitAggregate,
}

#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HabitEntry {
    pub at: u64,
    pub value: f64,
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
    Bucket,
    Deadline {
        deadline_at: u64,
    },
    Thought {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        text: Option<String>,
    },
    Reading {
        resource: String,
        #[serde(default, skip_serializing_if = "is_zero")]
        progress_percent: f64,
        #[serde(default, skip_serializing_if = "is_zero_pages")]
        pages_read: u32,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        total_pages: Option<u32>,
    },
    Habit {
        frequency: u16,
        interval: HabitInterval,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        weekdays: Vec<Weekday>,
        #[serde(default)]
        completions: Vec<u64>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        measure: Option<HabitMeasure>,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        entries: Vec<HabitEntry>,
    },
}

fn is_zero(value: &f64) -> bool {
    *value == 0.0
}
fn is_zero_pages(value: &u32) -> bool {
    *value == 0
}

pub fn interval_to_domain(interval: HabitInterval) -> d::HabitInterval {
    match interval {
        HabitInterval::Day => d::HabitInterval::Day,
        HabitInterval::Week => d::HabitInterval::Week,
        HabitInterval::Month => d::HabitInterval::Month,
        HabitInterval::Custom => d::HabitInterval::Custom,
    }
}

pub fn interval_from_domain(interval: d::HabitInterval) -> HabitInterval {
    match interval {
        d::HabitInterval::Day => HabitInterval::Day,
        d::HabitInterval::Week => HabitInterval::Week,
        d::HabitInterval::Month => HabitInterval::Month,
        d::HabitInterval::Custom => HabitInterval::Custom,
    }
}

pub fn value_to_domain(kind: HabitValueKind, value: f64) -> Result<u64, String> {
    if !value.is_finite() || value < 0.0 {
        return Err("Choose a nonnegative habit value.".into());
    }
    match kind {
        HabitValueKind::Number => {
            if value > 1_000_000_000.0 {
                return Err("Habit value must be between 0 and 1000000000.".into());
            }
            let scaled = (value * d::HABIT_VALUE_SCALE as f64).round();
            if !scaled.is_finite() || scaled < 0.0 || scaled > d::MAX_HABIT_NUMBER as f64 {
                return Err("Habit value must be between 0 and 1000000000.".into());
            }
            Ok(scaled as u64)
        }
        HabitValueKind::TimeOfDay => {
            if value.fract() != 0.0 || value > d::MAX_HABIT_TIME_OF_DAY as f64 {
                return Err("Choose a valid time of day between 00:00 and 23:59.".into());
            }
            Ok(value as u64)
        }
    }
}

pub fn value_from_domain(kind: d::HabitValueKind, value: u64) -> f64 {
    match kind {
        d::HabitValueKind::Number => value as f64 / d::HABIT_VALUE_SCALE as f64,
        d::HabitValueKind::TimeOfDay => value as f64,
    }
}

pub fn normalize_unit(kind: HabitValueKind, unit: Option<&str>) -> Result<Option<String>, String> {
    let Some(raw) = unit else {
        return Ok(None);
    };
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    if kind == HabitValueKind::TimeOfDay {
        return Err("Time-of-day habits do not use a unit.".into());
    }
    if trimmed.chars().count() > 24 || trimmed.chars().any(char::is_control) {
        return Err("Use a short habit unit of at most 24 characters.".into());
    }
    Ok(Some(trimmed.into()))
}

pub fn measure_to_domain(measure: &HabitMeasure) -> Result<d::HabitMeasure, String> {
    let _ = normalize_unit(measure.value_kind, measure.unit.as_deref())?;
    let target = value_to_domain(measure.value_kind, measure.target)?;
    let aggregate = match measure.value_kind {
        HabitValueKind::Number => match measure.aggregate {
            HabitAggregate::Sum => d::HabitAggregate::Sum,
            HabitAggregate::PerEntry => d::HabitAggregate::PerEntry,
        },
        HabitValueKind::TimeOfDay => d::HabitAggregate::PerEntry,
    };
    let domain = d::HabitMeasure {
        value_kind: match measure.value_kind {
            HabitValueKind::Number => d::HabitValueKind::Number,
            HabitValueKind::TimeOfDay => d::HabitValueKind::TimeOfDay,
        },
        bound: match measure.bound {
            HabitBound::AtLeast => d::HabitBound::AtLeast,
            HabitBound::AtMost => d::HabitBound::AtMost,
        },
        target,
        aggregate,
    };
    d::habit::validate_measure(domain).map_err(crate::message)?;
    Ok(domain)
}

pub fn measure_from_domain(measure: d::HabitMeasure, unit: Option<String>) -> HabitMeasure {
    let value_kind = match measure.value_kind {
        d::HabitValueKind::Number => HabitValueKind::Number,
        d::HabitValueKind::TimeOfDay => HabitValueKind::TimeOfDay,
    };
    HabitMeasure {
        value_kind,
        bound: match measure.bound {
            d::HabitBound::AtLeast => HabitBound::AtLeast,
            d::HabitBound::AtMost => HabitBound::AtMost,
        },
        target: value_from_domain(measure.value_kind, measure.target),
        unit: if value_kind == HabitValueKind::Number {
            unit
        } else {
            None
        },
        aggregate: match measure.aggregate {
            d::HabitAggregate::Sum => HabitAggregate::Sum,
            d::HabitAggregate::PerEntry => HabitAggregate::PerEntry,
        },
    }
}

pub fn habit_from_domain(habit: &d::Habit, unit: Option<String>) -> Vertex {
    let measure = habit.measure.map(|m| measure_from_domain(m, unit));
    let entries = match habit.measure {
        Some(m) => habit
            .entries
            .iter()
            .map(|entry| HabitEntry {
                at: entry.at,
                value: value_from_domain(m.value_kind, entry.value),
            })
            .collect(),
        None => vec![],
    };
    Vertex::Habit {
        frequency: habit.frequency,
        interval: interval_from_domain(habit.interval),
        weekdays: weekdays_from_mask(habit.weekdays),
        completions: habit.completions.clone(),
        measure,
        entries,
    }
}

impl Vertex {
    pub fn allows_isolation(&self) -> bool {
        matches!(self, Self::Thought { .. } | Self::Bucket)
    }

    pub fn habit_unit(&self) -> Option<String> {
        match self {
            Self::Habit {
                measure: Some(m), ..
            } => normalize_unit(m.value_kind, m.unit.as_deref())
                .ok()
                .flatten(),
            _ => None,
        }
    }

    pub fn to_domain_habit(&self) -> Result<Option<d::Habit>, String> {
        let Self::Habit {
            frequency,
            interval,
            weekdays,
            completions,
            measure,
            entries,
        } = self
        else {
            return Ok(None);
        };
        if *frequency == 0 || *frequency > 1000 {
            return Err("Choose a habit frequency from 1 to 1000.".into());
        }
        let weekdays_mask = weekdays_to_mask(weekdays);
        if *interval == HabitInterval::Custom {
            if weekdays_mask == 0 {
                return Err("Choose at least one day of the week for a custom habit.".into());
            }
        } else if !weekdays.is_empty() {
            return Err("Specific weekdays are only used with custom habit intervals.".into());
        }
        for at in completions {
            safe_number(*at)?;
        }
        if completions.windows(2).any(|pair| pair[0] > pair[1]) {
            return Err("Habit repetitions must be in time order.".into());
        }
        let domain_measure = measure.as_ref().map(measure_to_domain).transpose()?;
        let mut domain_entries = Vec::with_capacity(entries.len());
        for entry in entries {
            safe_number(entry.at)?;
            let Some(m) = measure.as_ref() else {
                return Err("Repetition habits cannot contain valued entries.".into());
            };
            domain_entries.push(d::HabitEntry {
                at: entry.at,
                value: value_to_domain(m.value_kind, entry.value)?,
            });
        }
        if domain_entries
            .windows(2)
            .any(|pair| pair[0].at > pair[1].at)
        {
            return Err("Habit entries must be in time order.".into());
        }
        let habit = d::Habit {
            frequency: *frequency,
            interval: interval_to_domain(*interval),
            weekdays: weekdays_mask,
            completions: completions.clone(),
            measure: domain_measure,
            entries: domain_entries,
        };
        d::habit::validate_habit(&habit).map_err(crate::message)?;
        Ok(Some(habit))
    }

    pub fn validate_new(&self) -> Result<(), String> {
        self.validate()?;
        if matches!(
            self,
            Self::Habit {
                completions,
                entries,
                ..
            } if !completions.is_empty() || !entries.is_empty()
        ) {
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
            Self::Thought { text: Some(text) } => {
                if text.trim().is_empty() || text.chars().count() > 20_000 {
                    return Err("Write a thought of 1 to 20000 characters.".into());
                }
            }
            Self::Reading {
                resource,
                progress_percent,
                pages_read,
                total_pages,
            } => {
                validate_resource(resource)?;
                if !progress_percent.is_finite() || !(0.0..=100.0).contains(progress_percent) {
                    return Err("Reading progress must be between 0 and 100 percent.".into());
                }
                if total_pages.is_some_and(|total| total == 0 || *pages_read > total) {
                    return Err(
                        "Pages read must be between zero and the total number of pages.".into(),
                    );
                }
            }
            Self::Habit { .. } => {
                let _ = self.to_domain_habit()?;
            }
            _ => {}
        }
        Ok(())
    }

    /// Configuration edits cannot replace or erase the recorded counter history.
    pub fn configure(&self, next: Self) -> Result<Self, String> {
        if core::mem::discriminant(self) != core::mem::discriminant(&next) {
            return Err("A vertex's kind cannot be changed.".into());
        }
        next.validate()?;
        Ok(next)
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
        if matches!(vertex, Vertex::Bucket) {
            260.0
        } else if matches!(vertex, Vertex::Thought { .. }) {
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
                || (other.y - y).abs()
                    >= (if matches!(other.vertex, Vertex::Bucket) {
                        180.0
                    } else {
                        70.0
                    }) + (if matches!(document.nodes[index].vertex, Vertex::Bucket) {
                        180.0
                    } else {
                        70.0
                    }) + 16.0
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
                .map(|node| {
                    node.y
                        + if matches!(node.vertex, Vertex::Bucket) {
                            180.0
                        } else {
                            110.0
                        }
                })
                .fold(130.0, f64::max);
            (
                desired.0,
                bottom
                    + if matches!(document.nodes[index].vertex, Vertex::Bucket) {
                        204.0
                    } else {
                        134.0
                    },
            )
        });
    document.nodes[index].x = point.0;
    document.nodes[index].y = point.1;
    Ok(document)
}
