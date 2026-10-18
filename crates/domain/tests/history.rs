use hyperforest_domain::{history, time, Error, Period, Session, Snapshot};

fn session(id: u8, periods: &[(u64, u64)]) -> Session {
    let periods: Vec<_> = periods
        .iter()
        .map(|(start, end)| Period {
            start: *start,
            end: *end,
        })
        .collect();
    Session {
        imported_at: None,
        id: vec![id],
        tree_id: vec![1],
        node_id: vec![1],
        credit_node_id: None,
        title: vec![],
        group: vec![],
        started_at: periods[0].start,
        ended_at: periods.last().unwrap().end,
        duration_ms: time::period_duration(&periods).unwrap(),
        periods,
    }
}

#[test]
fn clipped_history_excludes_pauses_and_counts_zero_days_in_the_average() {
    let mut state = Snapshot::empty();
    state.sessions = vec![
        session(1, &[(50, 120), (230, 300)]),
        session(2, &[(350, 400)]),
    ];
    let original = state.clone();
    let result = history::statistics(&state, &[0, 1], &[100, 250, 400, 500]).unwrap();
    assert_eq!(result.daily_ms, vec![40, 100, 0]);
    assert_eq!(result.total_ms, 140);
    assert_eq!(result.average_day_ms, 46);
    assert_eq!(result.active_days, 2);
    assert_eq!(result.average_active_day_ms, 70);
    assert_eq!(result.average_session_ms, 70);
    assert_eq!(result.longest_session_ms, 90);
    assert_eq!(
        result
            .sessions
            .iter()
            .map(|value| value.duration_ms)
            .collect::<Vec<_>>(),
        vec![90, 50]
    );
    assert_eq!(state, original);
    // Subject subsets cannot accidentally include other sessions.
    assert_eq!(
        history::statistics(&state, &[1], &[100, 500])
            .unwrap()
            .total_ms,
        50
    );
}

#[test]
fn day_attribution_conserves_time_for_every_small_interval_and_selection() {
    let mut state = Snapshot::empty();
    state.sessions = vec![session(1, &[(2, 5), (8, 15)]), session(2, &[(12, 19)])];
    for start in 0..20 {
        for split in start + 1..21 {
            for end in split + 1..22 {
                for selected in [vec![], vec![0], vec![1], vec![0, 1]] {
                    let result =
                        history::statistics(&state, &selected, &[start, split, end]).unwrap();
                    let expected: u64 = selected
                        .iter()
                        .map(|index| {
                            time::session_between(&state.sessions[*index], start, end).unwrap()
                        })
                        .sum();
                    assert_eq!(result.total_ms, expected);
                    assert_eq!(result.daily_ms.iter().sum::<u64>(), expected);
                    assert_eq!(
                        result
                            .sessions
                            .iter()
                            .map(|value| value.duration_ms)
                            .sum::<u64>(),
                        expected
                    );
                }
            }
        }
    }
}

#[test]
fn empty_ranges_and_exact_endpoints_do_not_invent_activity() {
    let mut state = Snapshot::empty();
    state.sessions = vec![session(1, &[(100, 200)])];
    for boundaries in [vec![0, 100], vec![200, 300, 400]] {
        let result = history::statistics(&state, &[0], &boundaries).unwrap();
        assert_eq!(result.total_ms, 0);
        assert_eq!(result.active_days, 0);
        assert_eq!(result.average_session_ms, 0);
        assert_eq!(result.average_active_day_ms, 0);
        assert!(result.sessions.is_empty());
    }
}

#[test]
fn invalid_queries_and_overflow_are_rejected() {
    let mut state = Snapshot::empty();
    state.sessions = vec![session(1, &[(0, u64::MAX)]), session(2, &[(0, u64::MAX)])];
    for boundaries in [vec![], vec![0], vec![0, 0], vec![2, 1]] {
        assert_eq!(
            history::statistics(&state, &[], &boundaries),
            Err(Error::InvalidTime)
        );
    }
    for indices in [vec![2], vec![0, 0], vec![1, 0]] {
        assert_eq!(
            history::statistics(&state, &indices, &[0, 1]),
            Err(Error::InvalidSession)
        );
    }
    assert_eq!(
        history::statistics(&state, &[0, 1], &[0, u64::MAX]),
        Err(Error::Overflow)
    );
}
