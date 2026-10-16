//! Accounting over explicit clock samples and caller-supplied day boundaries.
use crate::{graph::*, model::*};
use alloc::{vec, vec::Vec};

pub fn period_duration(periods: &[Period]) -> Result<u64, Error> {
    let mut total = 0_u64;
    let mut i = 0;
    while i < periods.len() {
        let duration = periods[i]
            .end
            .checked_sub(periods[i].start)
            .ok_or(Error::InvalidTime)?;
        total = total.checked_add(duration).ok_or(Error::Overflow)?;
        i += 1;
    }
    Ok(total)
}

pub fn focus_elapsed(focus: &Focus, now: u64) -> Result<u64, Error> {
    let running = match focus.running_since {
        Some(start) => now.saturating_sub(start),
        None => 0,
    };
    focus.elapsed_ms.checked_add(running).ok_or(Error::Overflow)
}

pub fn focus_periods(focus: &Focus, now: u64) -> Vec<Period> {
    let mut result = focus.periods.clone();
    if let Some(start) = focus.running_since {
        result.push(Period {
            start,
            end: now.max(start),
        });
    }
    result
}

fn overlap(periods: &[Period], from: u64, to: u64) -> Result<u64, Error> {
    let mut result = 0_u64;
    let mut i = 0;
    while i < periods.len() {
        let period = &periods[i];
        let value = period.end.min(to).saturating_sub(period.start.max(from));
        result = result.checked_add(value).ok_or(Error::Overflow)?;
        i += 1;
    }
    Ok(result)
}

pub fn session_between(session: &Session, from: u64, to: u64) -> Result<u64, Error> {
    overlap(&session.periods, from, to)
}

pub fn time_between(state: &Snapshot, from: u64, to: u64) -> Result<u64, Error> {
    if to < from {
        return Err(Error::InvalidTime);
    }
    let mut result = 0_u64;
    let mut i = 0;
    while i < state.sessions.len() {
        result = result
            .checked_add(session_between(&state.sessions[i], from, to)?)
            .ok_or(Error::Overflow)?;
        i += 1;
    }
    if let Some(focus) = &state.focus {
        result = result
            .checked_add(overlap(&focus_periods(focus, to), from, to)?)
            .ok_or(Error::Overflow)?;
    }
    Ok(result)
}

fn credit(
    state: &Snapshot,
    values: &mut [u64],
    tree_id: &Id,
    id: &Id,
    duration: u64,
) -> Result<(), Error> {
    let Ok(mut index) = node_index(state, id) else {
        return Ok(());
    };
    if state.nodes[index].tree_id != *tree_id {
        return Ok(());
    }
    let mut reached_root = false;
    let mut remaining = state.nodes.len();
    loop {
        if remaining == 0 {
            return Err(Error::Cycle);
        }
        values[index] = values[index].checked_add(duration).ok_or(Error::Overflow)?;
        let node = &state.nodes[index];
        if node.id == *tree_id {
            reached_root = true;
        }
        match &node.parent_id {
            Some(parent_id) => index = node_index(state, parent_id)?,
            None => break,
        }
        remaining -= 1;
    }
    if !reached_root {
        let root = node_index(state, tree_id)?;
        values[root] = values[root].checked_add(duration).ok_or(Error::Overflow)?;
    }
    Ok(())
}

/// Cumulative values in snapshot node order. Linked tree totals are evaluated
/// in dependency order without recursion; a shared target is computed once.
/// With `from`, account only for focus intervals overlapping [from, now].
pub fn totals(state: &Snapshot, now: u64, from: Option<u64>) -> Result<Vec<u64>, Error> {
    let mut values = vec![0_u64; state.nodes.len()];
    let mut done = vec![false; state.trees.len()];
    let mut remaining = state.trees.len();
    while remaining > 0 {
        let mut progressed = false;
        let mut t = 0;
        while t < state.trees.len() {
            if !done[t] {
                let tree = &state.trees[t];
                let mut ready = true;
                let mut n = 0;
                while n < state.nodes.len() {
                    let node = &state.nodes[n];
                    if node.tree_id == tree.id {
                        if let Some(link) = &node.linked_tree_id {
                            if let Ok(target) = tree_index(state, link) {
                                if !done[target] {
                                    ready = false;
                                }
                            }
                        }
                    }
                    n += 1;
                }
                if ready {
                    let mut s = 0;
                    while s < state.sessions.len() {
                        let session = &state.sessions[s];
                        if session.tree_id == tree.id && session.started_at >= tree.created_at {
                            let duration = match from {
                                Some(start) => session_between(session, start, now)?,
                                None => session.duration_ms,
                            };
                            credit(
                                state,
                                &mut values,
                                &tree.id,
                                session.credit_node_id.as_ref().unwrap_or(&session.node_id),
                                duration,
                            )?;
                        }
                        s += 1;
                    }
                    if let Some(focus) = &state.focus {
                        if focus.tree_id == tree.id && focus.started_at >= tree.created_at {
                            let duration = match from {
                                Some(start) => overlap(&focus_periods(focus, now), start, now)?,
                                None => focus_elapsed(focus, now)?,
                            };
                            credit(state, &mut values, &tree.id, &focus.node_id, duration)?;
                        }
                    }
                    n = 0;
                    while n < state.nodes.len() {
                        let node = &state.nodes[n];
                        if node.tree_id == tree.id {
                            if let Some(link) = &node.linked_tree_id {
                                if let Ok(root) = node_index(state, link) {
                                    let duration = values[root];
                                    credit(state, &mut values, &tree.id, &node.id, duration)?;
                                }
                            }
                        }
                        n += 1;
                    }
                    done[t] = true;
                    remaining -= 1;
                    progressed = true;
                }
            }
            t += 1;
        }
        if !progressed {
            return Err(Error::Cycle);
        }
    }
    Ok(values)
}
