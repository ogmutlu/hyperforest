//! Executable examples of the future proof obligations. These are tests, not proofs.
use hyperforest_domain::{graph, time, Command, Error, Period, State};

fn id(value: &str) -> Vec<u8> {
    value.as_bytes().to_vec()
}
fn tree() -> State {
    State::empty()
        .apply(
            Command::Create {
                id: id("root"),
                title: id("Work"),
            },
            1000,
        )
        .unwrap()
}
fn add(state: &State, name: &str, parent: &str) -> State {
    state
        .apply(
            Command::Add {
                id: id(name),
                tree_id: id("root"),
                parent_id: Some(id(parent)),
                title: id(name),
                linked_tree_id: None,
            },
            1000,
        )
        .unwrap()
}

#[test]
fn rejected_commands_do_not_change_the_input() {
    let state = add(&add(&tree(), "branch", "root"), "leaf", "branch");
    let original = state.clone();
    assert_eq!(
        state.apply(
            Command::Connect {
                id: id("branch"),
                parent_id: Some(id("leaf"))
            },
            2000
        ),
        Err(Error::Cycle)
    );
    assert_eq!(state, original);
    let active = state
        .apply(Command::Start { id: id("leaf") }, 2000)
        .unwrap();
    assert_eq!(
        active.apply(Command::Delete { id: id("branch") }, 3000),
        Err(Error::ActiveSession)
    );
    assert!(active.snapshot().focus.is_some());
}

#[test]
fn pause_resume_and_midnight_account_for_exact_intervals() {
    let state = tree()
        .apply(Command::Start { id: id("root") }, 2000)
        .unwrap()
        .apply(Command::Pause, 5000)
        .unwrap();
    assert_eq!(state.apply(Command::Pause, 9000).unwrap(), state);
    let state = state
        .apply(Command::Start { id: id("root") }, 10000)
        .unwrap();
    assert_eq!(
        time::time_between(state.snapshot(), 4000, 13000).unwrap(),
        4000
    );
    assert_eq!(
        time::totals(state.snapshot(), 13000, None).unwrap(),
        vec![6000]
    );
    let saved = state
        .apply(
            Command::Save {
                session_id: id("s"),
            },
            13000,
        )
        .unwrap();
    assert_eq!(
        saved.snapshot().sessions[0].periods,
        vec![
            Period {
                start: 2000,
                end: 5000
            },
            Period {
                start: 10000,
                end: 13000
            }
        ]
    );
    assert_eq!(
        time::time_between(saved.snapshot(), 4000, 13000).unwrap(),
        4000
    );
}

#[test]
fn disconnected_components_credit_the_root_once_and_follow_reconnection() {
    let state = add(&add(&tree(), "branch", "root"), "leaf", "branch")
        .apply(
            Command::AddSession {
                id: id("s"),
                node_id: id("leaf"),
                started_at: 2000,
                duration_ms: 3000,
            },
            6000,
        )
        .unwrap()
        .apply(
            Command::Connect {
                id: id("leaf"),
                parent_id: None,
            },
            6000,
        )
        .unwrap();
    assert_eq!(
        time::totals(state.snapshot(), 6000, None).unwrap(),
        vec![3000, 0, 3000]
    );
    let reconnected = state
        .apply(
            Command::Connect {
                id: id("leaf"),
                parent_id: Some(id("branch")),
            },
            6000,
        )
        .unwrap();
    assert_eq!(
        time::totals(reconnected.snapshot(), 6000, None).unwrap(),
        vec![3000, 3000, 3000]
    );
    let deleted = reconnected
        .apply(Command::Delete { id: id("branch") }, 6000)
        .unwrap();
    assert_eq!(deleted.snapshot().sessions.len(), 1);
    assert_eq!(
        time::time_between(deleted.snapshot(), 0, 6000).unwrap(),
        3000
    );
}

#[test]
fn malformed_intervals_and_overflow_are_explicit_errors() {
    let state = tree()
        .apply(
            Command::AddSession {
                id: id("s"),
                node_id: id("root"),
                started_at: 2000,
                duration_ms: 3000,
            },
            6000,
        )
        .unwrap();
    let mut snapshot = state.snapshot().clone();
    snapshot.sessions[0].periods.push(Period {
        start: 2500,
        end: 4000,
    });
    assert_eq!(State::new(snapshot), Err(Error::InvalidSession));
    assert_eq!(
        tree().apply(
            Command::AddSession {
                id: id("huge"),
                node_id: id("root"),
                started_at: u64::MAX,
                duration_ms: 1
            },
            u64::MAX
        ),
        Err(Error::Overflow)
    );
    assert_eq!(
        time::period_duration(&[
            Period {
                start: 0,
                end: u64::MAX
            },
            Period { start: 0, end: 1 }
        ]),
        Err(Error::Overflow)
    );
}

#[test]
fn all_parent_assignments_of_a_small_graph_are_classified_by_acyclicity() {
    let state = add(&add(&add(&tree(), "a", "root"), "b", "root"), "c", "root");
    // 5^3 assignments: disconnected, root, a, b, or c, including self-edges.
    let candidates = [
        None,
        Some(id("root")),
        Some(id("a")),
        Some(id("b")),
        Some(id("c")),
    ];
    for a in &candidates {
        for b in &candidates {
            for c in &candidates {
                let mut snapshot = state.snapshot().clone();
                snapshot.nodes[1].parent_id = a.clone();
                snapshot.nodes[2].parent_id = b.clone();
                snapshot.nodes[3].parent_id = c.clone();
                let validation = State::new(snapshot.clone());
                // Independent reachability oracle: a walk in an acyclic 4-node graph
                // must hit a missing parent in at most 4 edges.
                let mut acyclic = true;
                for node in &snapshot.nodes {
                    let mut cursor = Some(node.id.clone());
                    for _ in 0..=snapshot.nodes.len() {
                        cursor = cursor.and_then(|id| {
                            snapshot
                                .nodes
                                .iter()
                                .find(|n| n.id == id)
                                .and_then(|n| n.parent_id.clone())
                        });
                    }
                    acyclic &= cursor.is_none();
                }
                assert_eq!(validation.is_ok(), acyclic);
                if let Ok(valid) = validation {
                    for node in &valid.snapshot().nodes {
                        assert!(graph::subtree_ids(valid.snapshot(), &node.id).len() <= 4);
                        assert!(graph::node_path(valid.snapshot(), &node.id).is_ok());
                    }
                }
            }
        }
    }
}
