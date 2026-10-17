//! Saved-session statistics over caller-supplied local calendar boundaries.
//! No clock, timezone, string search, or presentation rules live here.
use crate::{time, Error, Snapshot};
use alloc::{vec, vec::Vec};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Contribution {
    pub session_index: usize,
    /// Only the portion inside the requested interval, excluding pauses.
    pub duration_ms: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Statistics {
    pub total_ms: u64,
    pub average_day_ms: u64,
    pub average_active_day_ms: u64,
    pub average_session_ms: u64,
    pub longest_session_ms: u64,
    pub active_days: u64,
    pub daily_ms: Vec<u64>,
    pub sessions: Vec<Contribution>,
}

/// `selected` contains increasing, unique snapshot indices (e.g. a subject
/// search). Boundaries must increase strictly; they need not be 24 hours apart.
/// Intervals are half-open [start, end). Only positive overlaps count as sessions.
/// Averages use integer division and include every supplied day, even empty days.
/// Active focus is deliberately excluded: this is the saved-session ledger.
pub fn statistics(
    state: &Snapshot,
    selected: &[usize],
    boundaries: &[u64],
) -> Result<Statistics, Error> {
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
    let mut result = Statistics {
        total_ms: 0,
        average_day_ms: 0,
        average_active_day_ms: 0,
        average_session_ms: 0,
        longest_session_ms: 0,
        active_days: 0,
        daily_ms: vec![0; boundaries.len() - 1],
        sessions: Vec::new(),
    };
    let from = boundaries[0];
    let to = boundaries[boundaries.len() - 1];
    i = 0;
    while i < selected.len() {
        let index = selected[i];
        if index >= state.sessions.len() || (i > 0 && index <= selected[i - 1]) {
            return Err(Error::InvalidSession);
        }
        let session = &state.sessions[index];
        let duration = time::session_between(session, from, to)?;
        if duration > 0 {
            result.total_ms = result
                .total_ms
                .checked_add(duration)
                .ok_or(Error::Overflow)?;
            result.longest_session_ms = result.longest_session_ms.max(duration);
            result.sessions.push(Contribution {
                session_index: index,
                duration_ms: duration,
            });
            let mut p = 0;
            while p < session.periods.len() {
                let start = session.periods[p].start.max(from);
                let end = session.periods[p].end.min(to);
                if start < end {
                    // Find the first touched day, then visit only overlapping
                    // days. Long histories do not require sessions * days work.
                    let mut low = 0;
                    let mut high = boundaries.len() - 1;
                    while low + 1 < high {
                        let middle = low + (high - low) / 2;
                        if boundaries[middle] <= start {
                            low = middle;
                        } else {
                            high = middle;
                        }
                    }
                    let mut day = low;
                    while day < result.daily_ms.len() && boundaries[day] < end {
                        let value = end.min(boundaries[day + 1]) - start.max(boundaries[day]);
                        result.daily_ms[day] = result.daily_ms[day]
                            .checked_add(value)
                            .ok_or(Error::Overflow)?;
                        day += 1;
                    }
                }
                p += 1;
            }
        }
        i += 1;
    }
    i = 0;
    while i < result.daily_ms.len() {
        if result.daily_ms[i] > 0 {
            result.active_days = result.active_days.checked_add(1).ok_or(Error::Overflow)?;
        }
        i += 1;
    }
    let days = u64::try_from(result.daily_ms.len()).map_err(|_| Error::Overflow)?;
    let count = u64::try_from(result.sessions.len()).map_err(|_| Error::Overflow)?;
    result.average_day_ms = result.total_ms / days;
    result.average_active_day_ms = result.total_ms.checked_div(result.active_days).unwrap_or(0);
    result.average_session_ms = result.total_ms.checked_div(count).unwrap_or(0);
    Ok(result)
}
