//! Pure integer habit rules: validation, period/day completion, and streaks.
use crate::model::*;
use alloc::{vec, vec::Vec};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CompletionState {
    Unrecorded,
    Met,
    Missed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PeriodStatus {
    pub recorded_count: u64,
    pub qualifying_count: u64,
    pub total_value: u64,
    pub state: CompletionState,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct StreakSummary {
    pub current: u64,
    pub best: u64,
    pub met_count: u64,
}

pub fn validate_measure(measure: HabitMeasure) -> Result<(), Error> {
    match measure.value_kind {
        HabitValueKind::Number => {
            if measure.target > MAX_HABIT_NUMBER {
                return Err(Error::InvalidHabit);
            }
            if measure.bound == HabitBound::AtLeast && measure.target == 0 {
                return Err(Error::InvalidHabit);
            }
        }
        HabitValueKind::TimeOfDay => {
            if measure.aggregate != HabitAggregate::PerEntry
                || measure.target > MAX_HABIT_TIME_OF_DAY
            {
                return Err(Error::InvalidHabit);
            }
        }
    }
    Ok(())
}

pub fn validate_value(measure: HabitMeasure, value: u64) -> Result<(), Error> {
    match measure.value_kind {
        HabitValueKind::Number => {
            if value > MAX_HABIT_NUMBER {
                return Err(Error::InvalidHabit);
            }
        }
        HabitValueKind::TimeOfDay => {
            if value > MAX_HABIT_TIME_OF_DAY {
                return Err(Error::InvalidHabit);
            }
        }
    }
    Ok(())
}

pub fn validate_habit(habit: &Habit) -> Result<(), Error> {
    if habit.frequency == 0 || habit.frequency > 1000 {
        return Err(Error::InvalidHabit);
    }
    match habit.interval {
        HabitInterval::Custom => {
            if habit.weekdays == 0 || habit.weekdays > 0x7f {
                return Err(Error::InvalidHabit);
            }
        }
        _ => {
            if habit.weekdays != 0 {
                return Err(Error::InvalidHabit);
            }
        }
    }
    match habit.measure {
        None => {
            if !habit.entries.is_empty() || habit.completions.len() > MAX_HABIT_RECORDS {
                return Err(Error::InvalidHabit);
            }
            let mut i = 1;
            while i < habit.completions.len() {
                if habit.completions[i] < habit.completions[i - 1] {
                    return Err(Error::InvalidHabit);
                }
                i += 1;
            }
        }
        Some(measure) => {
            validate_measure(measure)?;
            if !habit.completions.is_empty() || habit.entries.len() > MAX_HABIT_RECORDS {
                return Err(Error::InvalidHabit);
            }
            let mut i = 0;
            while i < habit.entries.len() {
                validate_value(measure, habit.entries[i].value)?;
                if i > 0 && habit.entries[i].at < habit.entries[i - 1].at {
                    return Err(Error::InvalidHabit);
                }
                i += 1;
            }
        }
    }
    Ok(())
}

pub fn validate_new_habit(habit: &Habit) -> Result<(), Error> {
    validate_habit(habit)?;
    if !habit.completions.is_empty() || !habit.entries.is_empty() {
        return Err(Error::InvalidHabit);
    }
    Ok(())
}

/// Configuration edits cannot switch between incompatible tracking representations.
pub fn measure_compatible(current: Option<HabitMeasure>, next: Option<HabitMeasure>) -> bool {
    match (current, next) {
        (None, None) => true,
        (Some(a), Some(b)) => a.value_kind == b.value_kind,
        _ => false,
    }
}

pub fn satisfies(measure: HabitMeasure, value: u64) -> bool {
    match measure.bound {
        HabitBound::AtLeast => value >= measure.target,
        HabitBound::AtMost => value <= measure.target,
    }
}

/// Evaluate habit completion over the half-open interval `[from, to)`.
/// An unrecorded period is always `Unrecorded`, never `Met` (even for `AtMost`).
pub fn evaluate_period(habit: &Habit, from: u64, to: u64) -> Result<PeriodStatus, Error> {
    if to < from {
        return Err(Error::InvalidTime);
    }
    let frequency = u64::from(habit.frequency);
    match habit.measure {
        None => {
            let mut count = 0_u64;
            let mut i = 0;
            while i < habit.completions.len() {
                let at = habit.completions[i];
                if at >= from && at < to {
                    count = count.checked_add(1).ok_or(Error::Overflow)?;
                }
                i += 1;
            }
            let state = if count == 0 {
                CompletionState::Unrecorded
            } else if count >= frequency {
                CompletionState::Met
            } else {
                CompletionState::Missed
            };
            Ok(PeriodStatus {
                recorded_count: count,
                qualifying_count: count,
                total_value: count,
                state,
            })
        }
        Some(measure) => {
            let mut recorded = 0_u64;
            let mut qualifying = 0_u64;
            let mut total = 0_u64;
            let mut i = 0;
            while i < habit.entries.len() {
                let entry = habit.entries[i];
                if entry.at >= from && entry.at < to {
                    recorded = recorded.checked_add(1).ok_or(Error::Overflow)?;
                    total = total.checked_add(entry.value).ok_or(Error::Overflow)?;
                    if satisfies(measure, entry.value) {
                        qualifying = qualifying.checked_add(1).ok_or(Error::Overflow)?;
                    }
                }
                i += 1;
            }
            let state = if recorded == 0 {
                CompletionState::Unrecorded
            } else {
                match measure.aggregate {
                    HabitAggregate::Sum => {
                        if satisfies(measure, total) {
                            CompletionState::Met
                        } else {
                            CompletionState::Missed
                        }
                    }
                    HabitAggregate::PerEntry => {
                        if qualifying >= frequency {
                            CompletionState::Met
                        } else {
                            CompletionState::Missed
                        }
                    }
                }
            };
            Ok(PeriodStatus {
                recorded_count: recorded,
                qualifying_count: qualifying,
                total_value: total,
                state,
            })
        }
    }
}

/// Evaluate consecutive half-open periods `[boundaries[i], boundaries[i + 1])`.
pub fn evaluate_periods(habit: &Habit, boundaries: &[u64]) -> Result<Vec<PeriodStatus>, Error> {
    if boundaries.len() < 2 {
        return Err(Error::InvalidTime);
    }
    let mut i = 1;
    while i < boundaries.len() {
        if boundaries[i] <= boundaries[i - 1] {
            return Err(Error::InvalidTime);
        }
        i += 1;
    }
    let period_count = boundaries.len() - 1;
    let mut statuses = vec![
        PeriodStatus {
            recorded_count: 0,
            qualifying_count: 0,
            total_value: 0,
            state: CompletionState::Unrecorded,
        };
        period_count
    ];
    let from = boundaries[0];
    let to = boundaries[period_count];
    match habit.measure {
        None => {
            let mut idx = 0;
            while idx < habit.completions.len() {
                let at = habit.completions[idx];
                if at >= from && at < to {
                    let p = period_index(boundaries, at);
                    statuses[p].recorded_count = statuses[p]
                        .recorded_count
                        .checked_add(1)
                        .ok_or(Error::Overflow)?;
                    statuses[p].qualifying_count = statuses[p].recorded_count;
                    statuses[p].total_value = statuses[p].recorded_count;
                }
                idx += 1;
            }
        }
        Some(measure) => {
            let mut idx = 0;
            while idx < habit.entries.len() {
                let entry = habit.entries[idx];
                if entry.at >= from && entry.at < to {
                    let p = period_index(boundaries, entry.at);
                    statuses[p].recorded_count = statuses[p]
                        .recorded_count
                        .checked_add(1)
                        .ok_or(Error::Overflow)?;
                    statuses[p].total_value = statuses[p]
                        .total_value
                        .checked_add(entry.value)
                        .ok_or(Error::Overflow)?;
                    if satisfies(measure, entry.value) {
                        statuses[p].qualifying_count = statuses[p]
                            .qualifying_count
                            .checked_add(1)
                            .ok_or(Error::Overflow)?;
                    }
                }
                idx += 1;
            }
        }
    }
    let frequency = u64::from(habit.frequency);
    i = 0;
    while i < period_count {
        let s = &mut statuses[i];
        s.state = if s.recorded_count == 0 {
            CompletionState::Unrecorded
        } else {
            match habit.measure {
                None => {
                    if s.recorded_count >= frequency {
                        CompletionState::Met
                    } else {
                        CompletionState::Missed
                    }
                }
                Some(measure) => match measure.aggregate {
                    HabitAggregate::Sum => {
                        if satisfies(measure, s.total_value) {
                            CompletionState::Met
                        } else {
                            CompletionState::Missed
                        }
                    }
                    HabitAggregate::PerEntry => {
                        if s.qualifying_count >= frequency {
                            CompletionState::Met
                        } else {
                            CompletionState::Missed
                        }
                    }
                },
            }
        };
        i += 1;
    }
    Ok(statuses)
}

fn period_index(boundaries: &[u64], at: u64) -> usize {
    let mut low = 0;
    let mut high = boundaries.len() - 1;
    while low + 1 < high {
        let mid = low + (high - low) / 2;
        if boundaries[mid] <= at {
            low = mid;
        } else {
            high = mid;
        }
    }
    low
}

/// Summarize total met periods, best consecutive met streak, and current trailing streak.
pub fn summarize_streaks(statuses: &[PeriodStatus]) -> StreakSummary {
    let mut best = 0_u64;
    let mut run = 0_u64;
    let mut met_count = 0_u64;
    let mut i = 0;
    while i < statuses.len() {
        if statuses[i].state == CompletionState::Met {
            run += 1;
            met_count += 1;
            if run > best {
                best = run;
            }
        } else {
            run = 0;
        }
        i += 1;
    }
    StreakSummary {
        current: run,
        best,
        met_count,
    }
}
