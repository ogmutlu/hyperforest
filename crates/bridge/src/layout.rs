//! Layout is presentation, deliberately outside the integer-only domain.
use crate::document::Document;

pub fn arrange(mut document: Document, tree_id: &str) -> Result<Document, String> {
    if !document.trees.iter().any(|tree| tree.id == tree_id) {
        return Err("This hypertree no longer exists.".into());
    }
    let count = document.nodes.len();
    let mut children = vec![Vec::new(); count];
    let mut roots = Vec::new();
    for (i, node) in document.nodes.iter().enumerate() {
        if node.tree_id == tree_id && node.finished_at.is_none() {
            if let Some(parent) = &node.parent_id {
                if let Some(index) = document.nodes.iter().position(|item| item.id == *parent) {
                    children[index].push(i);
                }
            } else {
                roots.push(i);
            }
        }
    }
    let mut order = Vec::new();
    let mut stack: Vec<_> = roots
        .iter()
        .map(|i| (*i, usize::from(document.nodes[*i].id != tree_id)))
        .collect();
    while let Some((i, depth)) = stack.pop() {
        order.push((i, depth));
        for child in &children[i] {
            stack.push((*child, depth + 1));
        }
    }
    let mut weights = vec![1.0_f64; count];
    for (i, _) in order.iter().rev() {
        weights[*i] = children[*i]
            .iter()
            .map(|child| weights[*child])
            .sum::<f64>()
            .max(1.0);
    }
    let max_depth = order.iter().map(|(_, d)| *d).max().unwrap_or(2).max(2) as f64;
    let total: f64 = roots.iter().map(|i| weights[*i]).sum();
    let mut left = 90.0;
    let mut pending = Vec::new();
    for i in roots {
        let width = 920.0 * weights[i] / total.max(1.0);
        pending.push((i, usize::from(document.nodes[i].id != tree_id), left, width));
        left += width;
    }
    while let Some((i, depth, left, width)) = pending.pop() {
        // The distinguished root keeps its manually chosen position.
        if document.nodes[i].id != tree_id {
            document.nodes[i].x = left + width / 2.0;
            document.nodes[i].y = 130.0 + depth as f64 * 430.0 / max_depth;
        }
        let mut offset = left;
        for child in &children[i] {
            let share = width * weights[*child] / weights[i];
            pending.push((*child, depth + 1, offset, share));
            offset += share;
        }
    }
    Ok(document)
}
