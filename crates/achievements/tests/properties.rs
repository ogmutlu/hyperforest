use hyperforest_achievements::{
    evaluate, sync, AchievementId, AchievementInput, CoreAchievement, DailyMilestone,
    LocalSessionFact, MilestoneSeries, UnlockedRecord, HOUR_MS, MINUTE_MS,
};
use hyperforest_domain::{Command, State};

fn id(s: &str) -> Vec<u8> {
    s.as_bytes().to_vec()
}

#[test]
fn sync_is_monotonic_idempotent_and_never_skips_endless_steps() {
    let state = State::empty()
        .apply(
            Command::Create {
                id: id("root"),
                title: id("Work"),
            },
            1000,
        )
        .unwrap()
        .apply(
            Command::AddSession {
                id: id("s1"),
                node_id: id("root"),
                started_at: 2000,
                duration_ms: 17 * HOUR_MS,
            },
            20 * HOUR_MS,
        )
        .unwrap();
    let input = AchievementInput {
        today_local_day: 100,
        local_sessions: vec![LocalSessionFact {
            session_index: 0,
            local_day: 100,
            iso_week: 14,
            weekday: 2,
            start_minute: 9 * 60,
            end_minute: 10 * 60,
            touches_night: false,
            duration_ms: 17 * HOUR_MS,
            ended_at: 2000 + 17 * HOUR_MS,
        }],
        ..AchievementInput::default()
    };

    let first = sync(state.snapshot(), &input, &[], 20 * HOUR_MS, false).unwrap();
    // 17 hours unlocks 5h, 10h, 15h without skipping any step.
    for milestone in [5, 10, 15] {
        assert!(first.unlocked.iter().any(|r| r.id
            == AchievementId::Endless {
                series: MilestoneSeries::FocusHours,
                milestone
            }));
    }
    assert!(!first.unlocked.iter().any(|r| r.id
        == AchievementId::Endless {
            series: MilestoneSeries::FocusHours,
            milestone: 20
        }));

    // Idempotence: syncing again yields no new unlocks and identical list.
    let second = sync(
        state.snapshot(),
        &input,
        &first.unlocked,
        25 * HOUR_MS,
        false,
    )
    .unwrap();
    assert!(second.newly_unlocked.is_empty());
    assert_eq!(second.unlocked, first.unlocked);

    // Monotonicity: even if the workspace is later cleared, prior unlocks & timestamps stay.
    let after_clear = sync(
        State::empty().snapshot(),
        &AchievementInput::default(),
        &first.unlocked,
        30 * HOUR_MS,
        false,
    )
    .unwrap();
    assert_eq!(after_clear.unlocked, first.unlocked);

    // Evaluation exposes 20h as the single next locked FocusHours target.
    let eval = evaluate(state.snapshot(), &input, &first.unlocked).unwrap();
    let locked_hours: Vec<_> = eval
        .endless
        .iter()
        .filter(|p| {
            p.unlocked_at.is_none()
                && matches!(
                    p.id,
                    AchievementId::Endless {
                        series: MilestoneSeries::FocusHours,
                        ..
                    }
                )
        })
        .collect();
    assert_eq!(locked_hours.len(), 1);
    assert_eq!(
        locked_hours[0].id,
        AchievementId::Endless {
            series: MilestoneSeries::FocusHours,
            milestone: 20
        }
    );

    // Daily milestones reflect today's 17h focus.
    assert!(eval
        .daily
        .iter()
        .any(|d| d.id == DailyMilestone::FourHoursToday && d.completed));
}

#[test]
fn backfill_uses_historical_timestamps_and_respects_existing_records() {
    let state = State::empty()
        .apply(
            Command::Create {
                id: id("root"),
                title: id("Work"),
            },
            5000,
        )
        .unwrap()
        .apply(
            Command::AddSession {
                id: id("s1"),
                node_id: id("root"),
                started_at: 10_000,
                duration_ms: 20 * MINUTE_MS,
            },
            50 * MINUTE_MS,
        )
        .unwrap();
    let input = AchievementInput::default();
    let existing = vec![UnlockedRecord {
        id: AchievementId::Core(CoreAchievement::FirstSeed),
        unlocked_at: 1234,
    }];
    let res = sync(state.snapshot(), &input, &existing, 99 * HOUR_MS, true).unwrap();
    let seed = res
        .unlocked
        .iter()
        .find(|r| r.id == AchievementId::Core(CoreAchievement::FirstSeed))
        .unwrap();
    assert_eq!(seed.unlocked_at, 1234);
    let spark = res
        .unlocked
        .iter()
        .find(|r| r.id == AchievementId::Core(CoreAchievement::FirstSpark))
        .unwrap();
    assert_eq!(spark.unlocked_at, 10_000 + 20 * MINUTE_MS);
}
