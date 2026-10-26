use crate::{graph::*, model::*, time::*};
use alloc::{vec, vec::Vec};

fn import_id(state: &Snapshot, source: &Id, suffix: &[u8]) -> Id {
    let mut id = source.clone();
    id.extend_from_slice(suffix);
    while state.nodes.iter().any(|node| node.id == id)
        || state.sessions.iter().any(|session| session.id == id)
    {
        id.push(b'_');
    }
    id
}

fn active_node(state: &Snapshot, id: &Id) -> Result<usize, Error> {
    let index = node_index(state, id)?;
    if state.nodes[index].finished_at.is_some() {
        return Err(Error::FinishedNode);
    }
    Ok(index)
}

fn save_focus(state: &mut Snapshot, session_id: Id, now: u64) -> Result<(), Error> {
    if let Some(focus) = &state.focus {
        let duration = focus_elapsed(focus, now)?;
        let periods = focus_periods(focus, now);
        state.sessions.push(Session {
            imported_at: None,
            id: session_id,
            tree_id: focus.tree_id.clone(),
            node_id: focus.node_id.clone(),
            credit_node_id: None,
            title: focus.title.clone(),
            group: focus.group.clone(),
            started_at: focus.started_at,
            ended_at: now.max(focus.started_at),
            duration_ms: duration,
            periods,
        });
        state.focus = None;
    }
    Ok(())
}

pub fn apply(state: &mut Snapshot, command: Command, now: u64) -> Result<(), Error> {
    match command {
        Command::Create { id, title } => {
            state.trees.push(Tree {
                id: id.clone(),
                title: title.clone(),
                created_at: now,
                pedantic: false,
            });
            state.nodes.push(Node {
                id: id.clone(),
                tree_id: id,
                parent_id: None,
                title,
                estimate_ms: 0,
                finished_at: None,
                linked_tree_id: None,
                color: None,
                colors: vec![],
                multiple_colors: false,
            });
        }
        Command::Add {
            id,
            tree_id,
            parent_id,
            title,
            linked_tree_id,
        } => {
            tree_index(state, &tree_id)?;
            let mut color = None;
            let mut colors = vec![];
            let mut multiple_colors = false;
            if let Some(parent_id) = &parent_id {
                let parent = &state.nodes[active_node(state, parent_id)?];
                if parent.tree_id != tree_id {
                    return Err(Error::CrossTreeConnection);
                }
                if parent.id == tree_id {
                    color = Some(next_color(state, &tree_id));
                } else {
                    color = Some(assigned_color(state, parent));
                    multiple_colors = parent.multiple_colors;
                    if multiple_colors {
                        colors = assigned_colors(state, parent);
                    }
                }
            }
            if let Some(target) = &linked_tree_id {
                tree_index(state, target)?;
            }
            state.nodes.push(Node {
                id,
                tree_id,
                parent_id,
                title,
                estimate_ms: 0,
                finished_at: None,
                linked_tree_id,
                color,
                colors,
                multiple_colors,
            });
        }
        Command::Edit {
            id,
            title,
            estimate_ms,
        } => {
            let index = node_index(state, &id)?;
            state.nodes[index].title = title.clone();
            state.nodes[index].estimate_ms = estimate_ms;
            if let Ok(tree) = tree_index(state, &id) {
                state.trees[tree].title = title;
            }
        }
        Command::Connect { id, parent_id } => {
            let index = active_node(state, &id)?;
            let node = &state.nodes[index];
            if node.id == node.tree_id {
                return Err(Error::RootConnection);
            }
            if let Some(parent_id) = &parent_id {
                let parent = &state.nodes[active_node(state, parent_id)?];
                if parent.tree_id != node.tree_id {
                    return Err(Error::CrossTreeConnection);
                }
                if contains_id(&subtree_ids(state, &id), parent_id) {
                    return Err(Error::Cycle);
                }
            }
            if let Some(focus) = &state.focus {
                if contains_id(&subtree_ids(state, &id), &focus.node_id) {
                    return Err(Error::ActiveSession);
                }
            }
            state.nodes[index].parent_id = parent_id;
        }
        Command::SetPedantic { tree_id, enabled } => {
            let index = tree_index(state, &tree_id)?;
            state.trees[index].pedantic = enabled;
        }
        Command::SetColor { id, color } => {
            let index = active_node(state, &id)?;
            state.nodes[index].color = color;
            state.nodes[index].colors.clear();
            if state.nodes[index].multiple_colors {
                state.nodes[index].colors = vec![assigned_color(state, &state.nodes[index])];
            }
        }
        Command::SetMultipleColors { id, enabled } => {
            let index = active_node(state, &id)?;
            let colors = assigned_colors(state, &state.nodes[index]);
            state.nodes[index].multiple_colors = enabled;
            if enabled {
                state.nodes[index].colors = colors;
            } else {
                state.nodes[index].color = Some(colors[0]);
                state.nodes[index].colors.clear();
            }
        }
        Command::SetColors { id, colors } => {
            let index = active_node(state, &id)?;
            if !state.nodes[index].multiple_colors {
                return Err(Error::EnableMultipleColors);
            }
            if colors.is_empty() {
                return Err(Error::InvalidColors);
            }
            state.nodes[index].color = Some(colors[0]);
            state.nodes[index].colors = colors;
        }
        Command::Complete { id, session_id } => {
            let index = active_node(state, &id)?;
            if state.nodes[index].id == state.nodes[index].tree_id {
                return Err(Error::RootCompletion);
            }
            let ids = subtree_ids(state, &id);
            if let Some(focus) = &state.focus {
                if contains_id(&ids, &focus.node_id) {
                    save_focus(state, session_id, now)?;
                }
            }
            let mut i = 0;
            while i < state.nodes.len() {
                if contains_id(&ids, &state.nodes[i].id) && state.nodes[i].finished_at.is_none() {
                    state.nodes[i].finished_at = Some(now);
                }
                i += 1;
            }
        }
        Command::Delete { id } => {
            let index = node_index(state, &id)?;
            let root = state.nodes[index].id == state.nodes[index].tree_id;
            let mut ids = subtree_ids(state, &id);
            if root {
                ids.clear();
                let mut i = 0;
                while i < state.nodes.len() {
                    if state.nodes[i].tree_id == id {
                        ids.push(state.nodes[i].id.clone());
                    }
                    i += 1;
                }
            }
            if let Some(focus) = &state.focus {
                if contains_id(&ids, &focus.node_id) {
                    return Err(Error::ActiveSession);
                }
            }
            let mut i = state.nodes.len();
            while i > 0 {
                i -= 1;
                if contains_id(&ids, &state.nodes[i].id) {
                    state.nodes.remove(i);
                }
            }
            if root {
                let tree = tree_index(state, &id)?;
                state.trees.remove(tree);
            }
        }
        Command::ReorderTree { id, earlier } => {
            let index = tree_index(state, &id)?;
            let target = if earlier {
                index.saturating_sub(1)
            } else {
                (index + 1).min(state.trees.len() - 1)
            };
            state.trees.swap(index, target);
        }
        Command::Start { id } => {
            active_node(state, &id)?;
            let index = resolve_focus(state, &id)?;
            let node = &state.nodes[index];
            if node.finished_at.is_some() {
                return Err(Error::FinishedNode);
            }
            if let Some(focus) = &mut state.focus {
                if focus.node_id != node.id {
                    return Err(Error::CurrentSession);
                }
                if focus.running_since.is_none() {
                    if now < focus.started_at {
                        return Err(Error::InvalidTime);
                    }
                    {
                        if let Some(last) = focus.periods.last() {
                            if now < last.end {
                                return Err(Error::InvalidTime);
                            }
                        }
                    }
                    focus.running_since = Some(now);
                }
            } else {
                state.focus = Some(Focus {
                    tree_id: node.tree_id.clone(),
                    node_id: node.id.clone(),
                    title: session_title(state, node),
                    group: node_path(state, &node.id)?,
                    started_at: now,
                    running_since: Some(now),
                    elapsed_ms: 0,
                    periods: vec![],
                });
            }
        }
        Command::Pause => {
            if let Some(focus) = &state.focus {
                if focus.running_since.is_some() {
                    let elapsed = focus_elapsed(focus, now)?;
                    let periods = focus_periods(focus, now);
                    if let Some(focus) = &mut state.focus {
                        focus.elapsed_ms = elapsed;
                        focus.periods = periods;
                        focus.running_since = None;
                    }
                }
            }
        }
        Command::Save { session_id } => save_focus(state, session_id, now)?,
        Command::Discard => state.focus = None,
        Command::AddSession {
            id,
            node_id,
            started_at,
            duration_ms,
        } => {
            let index = resolve_focus(state, &node_id)?;
            let node = &state.nodes[index];
            let ended_at = started_at.checked_add(duration_ms).ok_or(Error::Overflow)?;
            if duration_ms == 0 || ended_at > now {
                return Err(Error::InvalidSession);
            }
            state.sessions.push(Session {
                imported_at: None,
                id,
                tree_id: node.tree_id.clone(),
                node_id: node.id.clone(),
                credit_node_id: None,
                title: session_title(state, node),
                group: node_path(state, &node.id)?,
                started_at,
                ended_at,
                duration_ms,
                periods: vec![Period {
                    start: started_at,
                    end: ended_at,
                }],
            });
        }
        Command::ImportSession {
            id,
            title,
            started_at,
            ended_at,
            duration_ms,
            periods,
        } => {
            // Queue replay after a crash must not add the same session twice.
            if state.sessions.iter().any(|session| session.id == id) {
                return Ok(());
            }
            // A tree and its linked vertices represent the same destination.
            // Prefer an explicitly named tree, even if a previous import created
            // a fallback child with that title.
            let mut matches: Vec<Id> = state
                .trees
                .iter()
                .filter(|tree| tree.title == title)
                .map(|tree| tree.id.clone())
                .collect();
            if matches.is_empty() {
                for node in state.nodes.iter().filter(|node| node.title == title) {
                    let target = state.nodes[resolve_focus(state, &node.id)?].id.clone();
                    if !matches.contains(&target) {
                        matches.push(target);
                    }
                }
            }
            let node_id =
                if matches.len() == 1 {
                    matches[0].clone()
                } else {
                    let tree_id = match state.trees.iter().find(|tree| tree.title == b"hiper") {
                        Some(tree) => tree.id.clone(),
                        None => {
                            let tree_id = import_id(state, &id, b"-tree");
                            apply(
                                state,
                                Command::Create {
                                    id: tree_id.clone(),
                                    title: b"hiper".to_vec(),
                                },
                                now,
                            )?;
                            tree_id
                        }
                    };
                    match state.nodes.iter().find(|node| {
                        node.parent_id.as_ref() == Some(&tree_id) && node.title == title
                    }) {
                        Some(node) => node.id.clone(),
                        None => {
                            let node_id = import_id(state, &id, b"-node");
                            apply(
                                state,
                                Command::Add {
                                    id: node_id.clone(),
                                    tree_id: tree_id.clone(),
                                    parent_id: Some(tree_id),
                                    title,
                                    linked_tree_id: None,
                                },
                                now,
                            )?;
                            node_id
                        }
                    }
                };
            let node = &state.nodes[node_index(state, &node_id)?];
            if ended_at > now || ended_at < started_at || duration_ms == 0 {
                return Err(Error::InvalidSession);
            }
            let session = Session {
                imported_at: Some(now),
                id,
                tree_id: node.tree_id.clone(),
                node_id: node.id.clone(),
                credit_node_id: None,
                title: session_title(state, node),
                group: node_path(state, &node.id)?,
                started_at,
                ended_at,
                duration_ms,
                periods,
            };
            state.sessions.push(session);
        }
        Command::DeleteSession { id } => {
            let mut index = 0;
            while index < state.sessions.len() && state.sessions[index].id != id {
                index += 1;
            }
            if index == state.sessions.len() {
                return Err(Error::MissingSession);
            }
            state.sessions.remove(index);
        }
    }
    // Freeze automatic colors after each successful command, matching persisted
    // workspaces: later sibling insertion must not recolor existing goals.
    let mut colors = vec![];
    let mut i = 0;
    while i < state.nodes.len() {
        colors.push(assigned_color(state, &state.nodes[i]));
        i += 1;
    }
    i = 0;
    while i < state.nodes.len() {
        state.nodes[i].color = Some(colors[i]);
        i += 1;
    }
    Ok(())
}
