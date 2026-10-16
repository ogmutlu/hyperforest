//! Graph queries. All traversals have explicit bounds, even on untrusted snapshots.
use crate::model::*;
use alloc::{vec, vec::Vec};

pub fn node_index(state: &Snapshot, id: &Id) -> Result<usize, Error> {
    let mut i = 0;
    while i < state.nodes.len() {
        if state.nodes[i].id == *id {
            return Ok(i);
        }
        i += 1;
    }
    Err(Error::MissingNode)
}

pub fn tree_index(state: &Snapshot, id: &Id) -> Result<usize, Error> {
    let mut i = 0;
    while i < state.trees.len() {
        if state.trees[i].id == *id {
            return Ok(i);
        }
        i += 1;
    }
    Err(Error::MissingTree)
}

pub fn contains_id(ids: &[Id], id: &Id) -> bool {
    let mut i = 0;
    while i < ids.len() {
        if ids[i] == *id {
            return true;
        }
        i += 1;
    }
    false
}

pub fn subtree_ids(state: &Snapshot, id: &Id) -> Vec<Id> {
    let mut result = vec![id.clone()];
    let mut cursor = 0;
    while cursor < result.len() && cursor <= state.nodes.len() {
        let mut i = 0;
        while i < state.nodes.len() {
            let node = &state.nodes[i];
            if node.parent_id.as_ref() == Some(&result[cursor]) && !contains_id(&result, &node.id) {
                result.push(node.id.clone());
            }
            i += 1;
        }
        cursor += 1;
    }
    result
}

pub fn node_path(state: &Snapshot, id: &Id) -> Result<Text, Error> {
    let mut parts = Vec::new();
    let mut current = Some(id.clone());
    while let Some(next) = current {
        if parts.len() > state.nodes.len() {
            return Err(Error::Cycle);
        }
        let node = &state.nodes[node_index(state, &next)?];
        parts.push(node.title.clone());
        current = node.parent_id.clone();
    }
    let mut text = Vec::new();
    let mut i = parts.len();
    while i > 0 {
        i -= 1;
        if !text.is_empty() {
            text.extend_from_slice(b" / ");
        }
        text.extend_from_slice(&parts[i]);
    }
    Ok(text)
}

pub fn can_link_tree(state: &Snapshot, source: &Id, target: &Id) -> bool {
    let mut pending = vec![target.clone()];
    let mut visited = Vec::new();
    while let Some(current) = pending.pop() {
        if current == *source {
            return false;
        }
        if !contains_id(&visited, &current) {
            visited.push(current.clone());
            let mut i = 0;
            while i < state.nodes.len() {
                let node = &state.nodes[i];
                if node.tree_id == current {
                    if let Some(link) = &node.linked_tree_id {
                        pending.push(link.clone());
                    }
                }
                i += 1;
            }
        }
    }
    true
}

pub fn resolve_focus(state: &Snapshot, id: &Id) -> Result<usize, Error> {
    let mut index = node_index(state, id)?;
    let mut remaining = state.nodes.len();
    while let Some(target) = &state.nodes[index].linked_tree_id {
        if remaining == 0 {
            return Err(Error::Cycle);
        }
        index = node_index(state, target)?;
        remaining -= 1;
    }
    Ok(index)
}

pub fn session_title(state: &Snapshot, node: &Node) -> Text {
    if node.id == node.tree_id {
        return b"General".to_vec();
    }
    let mut i = 0;
    while i < state.nodes.len() {
        if state.nodes[i].parent_id.as_ref() == Some(&node.id)
            && state.nodes[i].finished_at.is_none()
        {
            return b"General".to_vec();
        }
        i += 1;
    }
    node.title.clone()
}

pub fn assigned_color(state: &Snapshot, node: &Node) -> Color {
    if node.multiple_colors && !node.colors.is_empty() {
        return node.colors[0];
    }
    if let Some(color) = node.color {
        return color;
    }
    if node.id == node.tree_id {
        return DEFAULT_COLORS[0];
    }
    let mut ancestor = node;
    let mut remaining = state.nodes.len();
    while ancestor.parent_id.as_ref() != Some(&node.tree_id) && remaining > 0 {
        match &ancestor.parent_id {
            None => break,
            Some(id) => match node_index(state, id) {
                Ok(index) => ancestor = &state.nodes[index],
                Err(_) => break,
            },
        }
        remaining -= 1;
    }
    let mut sibling = 0;
    let mut i = 0;
    while i < state.nodes.len() {
        if state.nodes[i].parent_id.as_ref() == Some(&node.tree_id) {
            if state.nodes[i].id == ancestor.id {
                return DEFAULT_COLORS[sibling % 7 + 1];
            }
            sibling += 1;
        }
        i += 1;
    }
    DEFAULT_COLORS[1]
}

pub fn assigned_colors(state: &Snapshot, node: &Node) -> Vec<Color> {
    if node.multiple_colors && !node.colors.is_empty() {
        node.colors.clone()
    } else {
        vec![assigned_color(state, node)]
    }
}

pub fn next_color(state: &Snapshot, tree_id: &Id) -> Color {
    let mut used = Vec::new();
    let mut i = 0;
    while i < state.nodes.len() {
        let node = &state.nodes[i];
        if node.tree_id == *tree_id && node.finished_at.is_none() {
            used.extend(assigned_colors(state, node));
        }
        i += 1;
    }
    i = 1;
    while i < DEFAULT_COLORS.len() {
        if !used.contains(&DEFAULT_COLORS[i]) {
            return DEFAULT_COLORS[i];
        }
        i += 1;
    }
    // At most MAX_NODES * 32 colors are used. This bounded search has more
    // candidates than that and avoids an unbounded palette-generation loop.
    let mut seed = 1_u32;
    while seed <= 65536 {
        let value = (seed * 7919) % 2097152;
        let color = ((96 + (value & 127)) << 16)
            | ((96 + ((value >> 7) & 127)) << 8)
            | (96 + ((value >> 14) & 127));
        if !used.contains(&color) {
            return color;
        }
        seed += 1;
    }
    DEFAULT_COLORS[1]
}
