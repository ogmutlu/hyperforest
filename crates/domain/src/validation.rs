use crate::{graph::*, model::*};

fn valid_name(text: &[u8]) -> bool {
    !text.is_empty() && text.len() <= 400 && text[0] > 32 && text[text.len() - 1] > 32
}

fn periods_valid(periods: &[Period], start: u64, end: u64) -> bool {
    let mut previous = start;
    let mut i = 0;
    while i < periods.len() {
        let period = &periods[i];
        if period.start < previous || period.end < period.start || period.end > end {
            return false;
        }
        previous = period.end;
        i += 1;
    }
    true
}

pub fn validate(state: &Snapshot) -> Result<(), Error> {
    if state.nodes.len() > MAX_NODES || state.trees.len() > MAX_NODES {
        return Err(Error::Limit);
    }
    let mut i = 0;
    while i < state.trees.len() {
        let tree = &state.trees[i];
        if tree.id.is_empty() || !valid_name(&tree.title) {
            return Err(Error::InvalidName);
        }
        let root = &state.nodes[node_index(state, &tree.id)?];
        if root.tree_id != tree.id || root.parent_id.is_some() || root.title != tree.title {
            return Err(Error::InvalidGraph);
        }
        let mut j = 0;
        while j < i {
            if state.trees[j].id == tree.id {
                return Err(Error::DuplicateId);
            }
            if state.trees[j].title == tree.title {
                return Err(Error::DuplicateName);
            }
            j += 1;
        }
        i += 1;
    }
    i = 0;
    while i < state.nodes.len() {
        let node = &state.nodes[i];
        if node.id.is_empty() || !valid_name(&node.title) {
            return Err(Error::InvalidName);
        }
        tree_index(state, &node.tree_id)?;
        if let Some(parent_id) = &node.parent_id {
            let parent = &state.nodes[node_index(state, parent_id)?];
            if parent.tree_id != node.tree_id {
                return Err(Error::CrossTreeConnection);
            }
            if node.finished_at.is_none() && parent.finished_at.is_some() {
                return Err(Error::FinishedParent);
            }
        }
        if node.id == node.tree_id && node.finished_at.is_some() {
            return Err(Error::RootCompletion);
        }
        let mut parent = node.parent_id.clone();
        let mut remaining = state.nodes.len();
        while let Some(id) = parent {
            if id == node.id || remaining == 0 {
                return Err(Error::Cycle);
            }
            parent = state.nodes[node_index(state, &id)?].parent_id.clone();
            remaining -= 1;
        }
        let mut j = 0;
        while j < i {
            let other = &state.nodes[j];
            if other.id == node.id {
                return Err(Error::DuplicateId);
            }
            if other.tree_id == node.tree_id
                && other.parent_id == node.parent_id
                && other.title == node.title
                && other.finished_at.is_none()
                && node.finished_at.is_none()
            {
                return Err(Error::DuplicateName);
            }
            j += 1;
        }
        if node.color.is_some_and(|color| color > 0xffffff)
            || node.colors.len() > 32
            || (!node.colors.is_empty() && !node.multiple_colors)
        {
            return Err(Error::InvalidColors);
        }
        j = 0;
        while j < node.colors.len() {
            if node.colors[j] > 0xffffff || node.colors[..j].contains(&node.colors[j]) {
                return Err(Error::InvalidColors);
            }
            j += 1;
        }
        if let Some(target) = &node.linked_tree_id {
            if !can_link_tree(state, &node.tree_id, target) {
                return Err(Error::Cycle);
            }
        }
        i += 1;
    }
    i = 0;
    while i < state.sessions.len() {
        let session = &state.sessions[i];
        if session.id.is_empty() {
            return Err(Error::DuplicateId);
        }
        let mut j = 0;
        while j < i {
            if state.sessions[j].id == session.id {
                return Err(Error::DuplicateId);
            }
            j += 1;
        }
        if session.imported_at.is_some_and(|at| at < session.ended_at)
            || session.ended_at < session.started_at
            || session.duration_ms > session.ended_at - session.started_at
        {
            return Err(Error::InvalidSession);
        }
        if !periods_valid(&session.periods, session.started_at, session.ended_at)
            || crate::time::period_duration(&session.periods)? != session.duration_ms
        {
            return Err(Error::InvalidSession);
        }
        i += 1;
    }
    if let Some(focus) = &state.focus {
        let node = &state.nodes[node_index(state, &focus.node_id)?];
        if node.tree_id != focus.tree_id || node.finished_at.is_some() {
            return Err(Error::FinishedNode);
        }
        let boundary = match focus.running_since {
            Some(since) => {
                if since < focus.started_at || focus.elapsed_ms > since - focus.started_at {
                    return Err(Error::InvalidTime);
                }
                since
            }
            None => u64::MAX,
        };
        if !periods_valid(&focus.periods, focus.started_at, boundary)
            || crate::time::period_duration(&focus.periods)? != focus.elapsed_ms
        {
            return Err(Error::InvalidTime);
        }
    }
    i = 0;
    while i < state.trees.len() {
        if state.trees[i].pedantic {
            validate_pedantic(state, &state.trees[i].id)?;
        }
        i += 1;
    }
    Ok(())
}

fn validate_pedantic(state: &Snapshot, tree_id: &Id) -> Result<(), Error> {
    // Connectivity is the first pedantic obligation and the most useful error.
    let mut n = 0;
    while n < state.nodes.len() {
        let node = &state.nodes[n];
        if node.tree_id == *tree_id
            && node.finished_at.is_none()
            && node.id != *tree_id
            && node.parent_id.is_none()
        {
            return Err(Error::Disconnected);
        }
        n += 1;
    }
    let mut checked = alloc::vec::Vec::new();
    let mut i = 0;
    while i < state.nodes.len() {
        let node = &state.nodes[i];
        if node.tree_id == *tree_id && node.finished_at.is_none() {
            if node.id != *tree_id && node.parent_id.is_none() {
                return Err(Error::Disconnected);
            }
            let colors = assigned_colors(state, node);
            let mut c = 0;
            while c < colors.len() {
                let color = colors[c];
                if !checked.contains(&color) {
                    checked.push(color);
                    let mut count = 0;
                    let mut edges = 0;
                    let mut j = 0;
                    while j < state.nodes.len() {
                        let member = &state.nodes[j];
                        if member.tree_id == *tree_id
                            && member.finished_at.is_none()
                            && assigned_colors(state, member).contains(&color)
                        {
                            count += 1;
                            if let Some(parent_id) = &member.parent_id {
                                let parent = &state.nodes[node_index(state, parent_id)?];
                                if parent.finished_at.is_none()
                                    && assigned_colors(state, parent).contains(&color)
                                {
                                    edges += 1;
                                }
                            }
                        }
                        j += 1;
                    }
                    // A subgraph of a forest is connected iff edges + 1 = vertices.
                    if edges + 1 != count {
                        return Err(Error::DisconnectedColor);
                    }
                }
                c += 1;
            }
        }
        i += 1;
    }
    Ok(())
}
