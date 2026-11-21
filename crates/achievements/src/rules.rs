//! Pure integer metric extraction and achievement predicate evaluation.
use crate::model::*;
use alloc::vec::Vec;
use hyperforest_domain as d;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Metrics {
    // Focus & sessions
    pub total_focus_ms: u64,
    pub session_count: u64,
    pub pomodoro_count: u64,
    pub longest_session_ms: u64,
    pub max_day_focus_ms: u64,
    pub active_days: u64,
    pub solid_days: u64,
    pub max_sessions_in_day: u64,
    pub max_vertices_in_day: u64,
    pub max_trees_in_day: u64,
    pub best_focus_streak: u64,
    pub current_focus_streak: u64,
    pub best_streak_2h: u64,
    pub current_streak_2h: u64,
    pub best_streak_4h: u64,
    pub current_streak_4h: u64,
    pub best_streak_5h: u64,
    pub current_streak_5h: u64,
    pub best_streak_6h: u64,
    pub current_streak_6h: u64,
    pub best_streak_7h: u64,
    pub current_streak_7h: u64,
    pub best_streak_7_5h: u64,
    pub current_streak_7_5h: u64,
    pub yellow_combo_unlocks: u64,
    pub yellow_combo_live: u64,
    pub green_combo_unlocks: u64,
    pub green_combo_live: u64,
    pub deep_combo_unlocks: u64,
    pub deep_combo_live: u64,
    pub green_workweeks: u64,
    pub deep_workweeks: u64,
    pub best_rolling_5_of_7: u64,
    pub best_rolling_20_of_30: u64,
    pub best_week_streak: u64,
    pub has_weekend_warrior: bool,
    pub has_day_and_night: bool,
    pub has_beat_yesterday: bool,
    pub has_personal_best: bool,
    pub has_bounce_back: bool,
    pub has_comeback_kid: bool,
    pub has_breaking_the_ice: bool,
    pub has_night_owl: bool,
    pub has_early_bird: bool,
    pub has_watch_your_step: bool,
    pub zero_pause_15m_sessions: u64,
    pub max_vertex_focus_ms: u64,
    pub max_tree_focus_ms: u64,
    pub focused_tree_count: u64,
    pub max_weekend_day_focus_ms: u64,
    pub has_midnight_oil: bool,
    pub has_power_lunch: bool,
    pub has_just_five_minutes: bool,
    pub has_fixed_point: bool,
    pub has_halting_problem: bool,
    pub has_forty_two_session: bool,
    pub trees_with_ten_plus_nodes: u64,
    pub has_zero_inbox: bool,
    // Today
    pub today_focus_ms: u64,
    pub today_sessions: u64,
    pub today_met_habits: u64,
    pub has_active_habits: bool,
    // Graph & completion
    pub tree_count: u64,
    pub node_count: u64,
    pub finished_count: u64,
    pub max_tree_depth: u64,
    pub max_direct_children: u64,
    pub has_linked_tree: bool,
    pub max_links_in_tree: u64,
    pub has_link_chain_3: bool,
    pub max_subtree_sweep: u64,
    pub has_clean_desk: bool,
    pub max_disconnected_non_pedantic: u64,
    pub has_refactor_spaghetti: bool,
    pub has_strict_formalist: bool,
    pub has_circuit_network: bool,
    pub has_lazy_bastard: bool,
    // Habits
    pub total_habit_logs: u64,
    pub total_met_habit_days: u64,
    pub has_any_met_habit: bool,
    pub has_valued_met_habit: bool,
    pub has_above_and_beyond: bool,
    pub best_at_most_streak: u64,
    pub best_daily_habit_streak: u64,
    pub best_habit_5_of_7: u64,
    pub has_before_six_am: bool,
    pub max_distinct_habits_met_in_day: u64,
    // Metadata pass-through
    pub metadata: MetadataFacts,
    // Sorted session timestamps & cumulative totals for deterministic backfill
    pub session_end_times: Vec<(u64, u64)>, // (ended_at, duration_ms)
    pub finished_times: Vec<u64>,
    pub tree_created_times: Vec<u64>,
}

struct DayAgg {
    day: i32,
    iso_week: i32,
    weekday: u8,
    focus_ms: u64,
    sessions: u64,
    has_morning: bool,
    has_evening: bool,
    node_indices: Vec<usize>,
    tree_indices: Vec<usize>,
}

pub fn extract(snapshot: &d::Snapshot, input: &AchievementInput) -> Result<Metrics, Error> {
    let mut m = Metrics {
        tree_count: snapshot.trees.len() as u64,
        node_count: snapshot.nodes.len() as u64,
        metadata: input.metadata,
        ..Metrics::default()
    };

    // Tree creation times
    let mut i = 0;
    while i < snapshot.trees.len() {
        m.tree_created_times.push(snapshot.trees[i].created_at);
        i += 1;
    }
    m.tree_created_times.sort_unstable();

    // Node & graph metrics
    let mut finish_timestamps: Vec<u64> = Vec::new();
    i = 0;
    while i < snapshot.nodes.len() {
        let node = &snapshot.nodes[i];
        if let Some(at) = node.finished_at {
            m.finished_count = m.finished_count.checked_add(1).ok_or(Error::Overflow)?;
            finish_timestamps.push(at);
        }
        if node.linked_tree_id.is_some() {
            m.has_linked_tree = true;
        }
        // Depth from root (bounded walk)
        let mut depth = 1_u64;
        let mut cur = node.parent_id.as_ref();
        let mut steps = 0usize;
        while let Some(pid) = cur {
            if steps >= snapshot.nodes.len() {
                break;
            }
            depth += 1;
            steps += 1;
            cur = snapshot
                .nodes
                .iter()
                .find(|n| n.id == *pid)
                .and_then(|n| n.parent_id.as_ref());
        }
        if depth > m.max_tree_depth {
            m.max_tree_depth = depth;
        }
        // Direct children & clean desk
        let mut children_total = 0_u64;
        let mut children_finished = 0_u64;
        let mut children_active = 0_u64;
        let mut j = 0;
        while j < snapshot.nodes.len() {
            if snapshot.nodes[j].parent_id.as_ref() == Some(&node.id) {
                children_total += 1;
                if snapshot.nodes[j].finished_at.is_some() {
                    children_finished += 1;
                } else {
                    children_active += 1;
                }
            }
            j += 1;
        }
        if children_total > m.max_direct_children {
            m.max_direct_children = children_total;
        }
        if children_finished >= 3 && children_active == 0 {
            m.has_clean_desk = true;
        }
        i += 1;
    }

    // Subtree sweep: max nodes sharing the exact same finished_at timestamp
    finish_timestamps.sort_unstable();
    m.finished_times = finish_timestamps.clone();
    i = 0;
    while i < finish_timestamps.len() {
        let ts = finish_timestamps[i];
        let mut count = 1_u64;
        while i + 1 < finish_timestamps.len() && finish_timestamps[i + 1] == ts {
            i += 1;
            count += 1;
        }
        if count > m.max_subtree_sweep {
            m.max_subtree_sweep = count;
        }
        i += 1;
    }

    // Per-tree graph metrics (links, spaghetti, pedantic, formalist, circuit network)
    let mut t = 0;
    while t < snapshot.trees.len() {
        let tree = &snapshot.trees[t];
        let mut links = 0_u64;
        let mut disconnected = 0_u64;
        let mut active_non_annotation = 0_u64;
        let mut has_multi_color = false;
        let mut distinct_colors: Vec<u32> = Vec::new();
        let mut n = 0;
        while n < snapshot.nodes.len() {
            let node = &snapshot.nodes[n];
            if node.tree_id == tree.id {
                if node.linked_tree_id.is_some() {
                    links += 1;
                }
                if node.finished_at.is_none() {
                    let standalone = node.allows_isolation
                        && node.id != tree.id
                        && node.parent_id.is_none()
                        && !snapshot.nodes.iter().any(|child| {
                            child.finished_at.is_none()
                                && child.parent_id.as_ref() == Some(&node.id)
                        });
                    if !standalone {
                        active_non_annotation += 1;
                        if node.id != tree.id && node.parent_id.is_none() {
                            disconnected += 1;
                        }
                        let colors = d::graph::assigned_colors(snapshot, node);
                        if node.multiple_colors && colors.len() >= 2 {
                            has_multi_color = true;
                        }
                        let mut c = 0;
                        while c < colors.len() {
                            if !distinct_colors.contains(&colors[c]) {
                                distinct_colors.push(colors[c]);
                            }
                            c += 1;
                        }
                    }
                }
            }
            n += 1;
        }
        if links > m.max_links_in_tree {
            m.max_links_in_tree = links;
        }
        if !tree.pedantic && disconnected > m.max_disconnected_non_pedantic {
            m.max_disconnected_non_pedantic = disconnected;
        }
        if tree.pedantic && active_non_annotation >= 10 {
            m.has_refactor_spaghetti = true;
            if has_multi_color {
                m.has_strict_formalist = true;
            }
        }
        if tree.pedantic && distinct_colors.len() >= 3 {
            m.has_circuit_network = true;
        }
        let total_in_tree = snapshot
            .nodes
            .iter()
            .filter(|n| n.tree_id == tree.id)
            .count();
        if total_in_tree >= 10 {
            m.trees_with_ten_plus_nodes += 1;
        }
        let finished_non_root = snapshot
            .nodes
            .iter()
            .filter(|n| n.tree_id == tree.id && n.id != tree.id && n.finished_at.is_some())
            .count();
        let active_non_root = snapshot
            .nodes
            .iter()
            .filter(|n| n.tree_id == tree.id && n.id != tree.id && n.finished_at.is_none())
            .count();
        if finished_non_root >= 5 && active_non_root == 0 {
            m.has_zero_inbox = true;
        }
        t += 1;
    }

    // Transitive closure: link chain of 3 hypertrees (A -> B -> C)
    let mut a = 0;
    while a < snapshot.nodes.len() && !m.has_link_chain_3 {
        if let Some(ref target_b) = snapshot.nodes[a].linked_tree_id {
            let mut b = 0;
            while b < snapshot.nodes.len() {
                if snapshot.nodes[b].tree_id == *target_b {
                    if let Some(ref target_c) = snapshot.nodes[b].linked_tree_id {
                        if *target_c != snapshot.nodes[a].tree_id && *target_c != *target_b {
                            m.has_link_chain_3 = true;
                            break;
                        }
                    }
                }
                b += 1;
            }
        }
        a += 1;
    }

    // Session & focus metrics
    let mut days: Vec<DayAgg> = Vec::new();
    let mut vertex_totals: Vec<(usize, u64)> = Vec::new();
    let mut tree_totals: Vec<(usize, u64)> = Vec::new();
    let mut ordered_sessions: Vec<(u64, u64)> = Vec::new(); // (ended_at, duration_ms)

    i = 0;
    while i < snapshot.sessions.len() {
        let session = &snapshot.sessions[i];
        m.session_count = m.session_count.checked_add(1).ok_or(Error::Overflow)?;
        m.total_focus_ms = m
            .total_focus_ms
            .checked_add(session.duration_ms)
            .ok_or(Error::Overflow)?;
        if session.duration_ms > m.longest_session_ms {
            m.longest_session_ms = session.duration_ms;
        }
        if session.duration_ms >= 25 * MINUTE_MS {
            m.pomodoro_count += 1;
        }
        if session.periods.len() >= 6 {
            m.has_watch_your_step = true;
        }
        if session.periods.len() == 1 && session.duration_ms >= 15 * MINUTE_MS {
            m.zero_pause_15m_sessions += 1;
        }
        if session.duration_ms >= MINUTE_MS && session.duration_ms <= 5 * MINUTE_MS {
            m.has_just_five_minutes = true;
        }
        if session.duration_ms >= 42 * MINUTE_MS && session.duration_ms < 43 * MINUTE_MS {
            m.has_forty_two_session = true;
        }
        ordered_sessions.push((session.ended_at, session.duration_ms));

        if let Ok(n_idx) = d::graph::node_index(snapshot, &session.node_id) {
            let est = snapshot.nodes[n_idx].estimate_ms;
            if est > 0 && session.duration_ms / MINUTE_MS == est / MINUTE_MS {
                m.has_fixed_point = true;
            }
            if let Some(entry) = vertex_totals.iter_mut().find(|(idx, _)| *idx == n_idx) {
                entry.1 = entry
                    .1
                    .checked_add(session.duration_ms)
                    .ok_or(Error::Overflow)?;
            } else {
                vertex_totals.push((n_idx, session.duration_ms));
            }
        }
        if let Ok(t_idx) = d::graph::tree_index(snapshot, &session.tree_id) {
            if let Some(entry) = tree_totals.iter_mut().find(|(idx, _)| *idx == t_idx) {
                entry.1 = entry
                    .1
                    .checked_add(session.duration_ms)
                    .ok_or(Error::Overflow)?;
            } else {
                tree_totals.push((t_idx, session.duration_ms));
            }
            // Breaking the ice: session started within 24h of tree creation
            let created = snapshot.trees[t_idx].created_at;
            if session.started_at >= created
                && session.started_at.saturating_sub(created) <= 24 * HOUR_MS
            {
                m.has_breaking_the_ice = true;
            }
        }
        i += 1;
    }

    // Personal best: after >= 5 prior sessions, a later session beats all previous durations
    ordered_sessions.sort_by_key(|(ended, _)| *ended);
    m.session_end_times = ordered_sessions.clone();
    let mut running_max = 0_u64;
    i = 0;
    while i < ordered_sessions.len() {
        let dur = ordered_sessions[i].1;
        if i >= 5 && dur > running_max {
            m.has_personal_best = true;
        }
        if dur > running_max {
            running_max = dur;
        }
        i += 1;
    }

    i = 0;
    while i < vertex_totals.len() {
        if vertex_totals[i].1 > m.max_vertex_focus_ms {
            m.max_vertex_focus_ms = vertex_totals[i].1;
        }
        if vertex_totals[i].1 >= 10 * HOUR_MS
            && snapshot.nodes[vertex_totals[i].0].finished_at.is_some()
        {
            m.has_halting_problem = true;
        }
        i += 1;
    }
    m.focused_tree_count = tree_totals.len() as u64;
    i = 0;
    while i < tree_totals.len() {
        if tree_totals[i].1 > m.max_tree_focus_ms {
            m.max_tree_focus_ms = tree_totals[i].1;
        }
        i += 1;
    }

    // Lazy Bastard: >= 10h focus with <= 5 vertices in workspace
    if m.total_focus_ms >= 10 * HOUR_MS && m.node_count > 0 && m.node_count <= 5 {
        m.has_lazy_bastard = true;
    }

    // Local-day session aggregation
    i = 0;
    while i < input.local_sessions.len() {
        let sf = input.local_sessions[i];
        if sf.touches_night {
            m.has_night_owl = true;
        }
        if sf.start_minute < 6 * 60 + 30 && sf.duration_ms > 0 {
            m.has_early_bird = true;
        }
        if sf.duration_ms > 0 && (sf.end_minute < sf.start_minute || sf.duration_ms >= 24 * HOUR_MS)
        {
            m.has_midnight_oil = true;
        }
        if sf.start_minute >= 12 * 60
            && sf.start_minute < 14 * 60
            && sf.duration_ms >= 25 * MINUTE_MS
        {
            m.has_power_lunch = true;
        }
        if sf.local_day == input.today_local_day {
            m.today_focus_ms = m
                .today_focus_ms
                .checked_add(sf.duration_ms)
                .ok_or(Error::Overflow)?;
            m.today_sessions += 1;
        }
        let n_idx = snapshot
            .sessions
            .get(sf.session_index)
            .and_then(|s| d::graph::node_index(snapshot, &s.node_id).ok());
        let t_idx = snapshot
            .sessions
            .get(sf.session_index)
            .and_then(|s| d::graph::tree_index(snapshot, &s.tree_id).ok());

        let pos = days.iter().position(|d| d.day == sf.local_day);
        let agg = if let Some(idx) = pos {
            &mut days[idx]
        } else {
            days.push(DayAgg {
                day: sf.local_day,
                iso_week: sf.iso_week,
                weekday: sf.weekday,
                focus_ms: 0,
                sessions: 0,
                has_morning: false,
                has_evening: false,
                node_indices: Vec::new(),
                tree_indices: Vec::new(),
            });
            days.last_mut().unwrap()
        };
        agg.focus_ms = agg
            .focus_ms
            .checked_add(sf.duration_ms)
            .ok_or(Error::Overflow)?;
        agg.sessions += 1;
        if sf.start_minute < 12 * 60 {
            agg.has_morning = true;
        }
        if sf.start_minute >= 18 * 60 || sf.end_minute >= 18 * 60 {
            agg.has_evening = true;
        }
        if let Some(n) = n_idx {
            if !agg.node_indices.contains(&n) {
                agg.node_indices.push(n);
            }
        }
        if let Some(t) = t_idx {
            if !agg.tree_indices.contains(&t) {
                agg.tree_indices.push(t);
            }
        }
        i += 1;
    }

    days.sort_by_key(|d| d.day);
    m.active_days = days.len() as u64;

    // Day-level stats, streaks, rolling windows, bounce back, comeback kid, weekend warrior
    let mut streak = 0_u64;
    let mut had_gap = false;
    let mut weeks: Vec<i32> = Vec::new();
    i = 0;
    while i < days.len() {
        let d = &days[i];
        if d.focus_ms > m.max_day_focus_ms {
            m.max_day_focus_ms = d.focus_ms;
        }
        if (d.weekday == 5 || d.weekday == 6) && d.focus_ms > m.max_weekend_day_focus_ms {
            m.max_weekend_day_focus_ms = d.focus_ms;
        }
        if d.focus_ms >= HOUR_MS {
            m.solid_days += 1;
        }
        if d.sessions > m.max_sessions_in_day {
            m.max_sessions_in_day = d.sessions;
        }
        if d.node_indices.len() as u64 > m.max_vertices_in_day {
            m.max_vertices_in_day = d.node_indices.len() as u64;
        }
        if d.tree_indices.len() as u64 > m.max_trees_in_day {
            m.max_trees_in_day = d.tree_indices.len() as u64;
        }
        if d.has_morning && d.has_evening {
            m.has_day_and_night = true;
        }
        if !weeks.contains(&d.iso_week) {
            weeks.push(d.iso_week);
        }
        if i == 0 {
            streak = 1;
        } else {
            let prev = &days[i - 1];
            let diff = d.day - prev.day;
            if diff == 1 {
                streak += 1;
                if d.focus_ms > prev.focus_ms && prev.focus_ms > 0 {
                    m.has_beat_yesterday = true;
                }
                if prev.weekday == 5 && d.weekday == 6 && prev.iso_week == d.iso_week {
                    m.has_weekend_warrior = true;
                }
            } else {
                had_gap = true;
                if diff >= 8 {
                    // At least 7 full zero-focus days between prev.day and d.day
                    m.has_comeback_kid = true;
                }
                streak = 1;
            }
        }
        if streak > m.best_focus_streak {
            m.best_focus_streak = streak;
        }
        if had_gap && streak >= 3 {
            m.has_bounce_back = true;
        }

        // Rolling 7-day and 30-day windows ending at days[i]
        let mut count_7 = 0_u64;
        let mut count_30 = 0_u64;
        let mut back = i;
        loop {
            let delta = d.day - days[back].day;
            if delta < 7 {
                count_7 += 1;
            }
            if delta < 30 {
                count_30 += 1;
            } else {
                break;
            }
            if back == 0 {
                break;
            }
            back -= 1;
        }
        if count_7 > m.best_rolling_5_of_7 {
            m.best_rolling_5_of_7 = count_7;
        }
        if count_30 > m.best_rolling_20_of_30 {
            m.best_rolling_20_of_30 = count_30;
        }
        i += 1;
    }

    // Live strict daily focus streak (active if last focus day is today or yesterday)
    if let Some(last) = days.last() {
        if last.day >= input.today_local_day - 1 {
            m.current_focus_streak = streak;
        }
    }

    // Consecutive high-focus-day combos (aligned with Monthly Focus Calendar tiers)
    (m.best_streak_2h, m.current_streak_2h) =
        threshold_day_streak(&days, 2 * HOUR_MS, input.today_local_day);
    (m.best_streak_4h, m.current_streak_4h) =
        threshold_day_streak(&days, 4 * HOUR_MS, input.today_local_day);
    (m.best_streak_5h, m.current_streak_5h) =
        threshold_day_streak(&days, 5 * HOUR_MS, input.today_local_day);
    (m.best_streak_6h, m.current_streak_6h) =
        threshold_day_streak(&days, 6 * HOUR_MS, input.today_local_day);
    (m.best_streak_7h, m.current_streak_7h) =
        threshold_day_streak(&days, 7 * HOUR_MS, input.today_local_day);
    (m.best_streak_7_5h, m.current_streak_7_5h) =
        threshold_day_streak(&days, 7 * HOUR_MS + 30 * MINUTE_MS, input.today_local_day);
    (m.yellow_combo_unlocks, m.yellow_combo_live) =
        combo_run_stats(&days, 4 * HOUR_MS, 3, input.today_local_day);
    (m.green_combo_unlocks, m.green_combo_live) =
        combo_run_stats(&days, 5 * HOUR_MS, 3, input.today_local_day);
    (m.deep_combo_unlocks, m.deep_combo_live) =
        combo_run_stats(&days, 7 * HOUR_MS, 2, input.today_local_day);
    m.green_workweeks = count_non_overlapping_runs(&days, 5 * HOUR_MS, 5);
    m.deep_workweeks = count_non_overlapping_runs(&days, 7 * HOUR_MS, 5);

    // Consecutive ISO weeks with focus
    weeks.sort_unstable();
    let mut week_run = 0_u64;
    i = 0;
    while i < weeks.len() {
        if i == 0 || weeks[i] != weeks[i - 1] + 1 {
            week_run = 1;
        } else {
            week_run += 1;
        }
        if week_run > m.best_week_streak {
            m.best_week_streak = week_run;
        }
        i += 1;
    }

    // Habit metrics
    let mut habit_day_counts: Vec<(i32, u64)> = Vec::new();
    i = 0;
    while i < input.habit_facts.len() {
        let hf = &input.habit_facts[i];
        if hf.active {
            m.has_active_habits = true;
        }
        m.total_habit_logs = m
            .total_habit_logs
            .checked_add(hf.total_logs)
            .ok_or(Error::Overflow)?;
        m.total_met_habit_days = m
            .total_met_habit_days
            .checked_add(hf.met_days.len() as u64)
            .ok_or(Error::Overflow)?;
        if hf.met_periods > 0 {
            m.has_any_met_habit = true;
            if hf.is_valued {
                m.has_valued_met_habit = true;
            }
        }
        if hf.has_double_target {
            m.has_above_and_beyond = true;
        }
        if hf.is_at_most && hf.best_period_streak > m.best_at_most_streak {
            m.best_at_most_streak = hf.best_period_streak;
        }
        if hf.best_daily_streak > m.best_daily_habit_streak {
            m.best_daily_habit_streak = hf.best_daily_streak;
        }
        if hf.best_rolling_5_of_7 > m.best_habit_5_of_7 {
            m.best_habit_5_of_7 = hf.best_rolling_5_of_7;
        }
        if hf.has_before_six_am {
            m.has_before_six_am = true;
        }
        if hf.met_today {
            m.today_met_habits += 1;
        }
        let mut d_idx = 0;
        while d_idx < hf.met_days.len() {
            let day = hf.met_days[d_idx];
            if let Some(entry) = habit_day_counts.iter_mut().find(|(k, _)| *k == day) {
                entry.1 += 1;
            } else {
                habit_day_counts.push((day, 1));
            }
            d_idx += 1;
        }
        i += 1;
    }
    i = 0;
    while i < habit_day_counts.len() {
        if habit_day_counts[i].1 > m.max_distinct_habits_met_in_day {
            m.max_distinct_habits_met_in_day = habit_day_counts[i].1;
        }
        i += 1;
    }

    Ok(m)
}

/// Returns `(current, target)` for a core achievement. Satisfied iff `current >= target`.
/// Streak-based achievements report `best` once satisfied (for unlocking/backfill) and
/// `live` while still locked so "Almost There" only surfaces currently active streaks.
pub fn core_progress(id: CoreAchievement, m: &Metrics) -> (u64, u64) {
    let flag = |b: bool| (u64::from(b), 1);
    let streak = |best: u64, live: u64, target: u64| {
        if best >= target {
            (best, target)
        } else {
            (live, target)
        }
    };
    match id {
        // Early cumulative focus
        CoreAchievement::FirstSpark => (m.session_count.min(1), 1),
        CoreAchievement::QuarterHour => (m.total_focus_ms, 15 * MINUTE_MS),
        CoreAchievement::FirstHour => (m.total_focus_ms, HOUR_MS),
        CoreAchievement::TwoHourMark => (m.total_focus_ms, 2 * HOUR_MS),
        CoreAchievement::ThreeHourMark => (m.total_focus_ms, 3 * HOUR_MS),
        // Daily initiation & bursts
        CoreAchievement::BreakingTheIce => flag(m.has_breaking_the_ice),
        CoreAchievement::DoubleTap => (m.max_sessions_in_day, 2),
        CoreAchievement::HatTrick => (m.max_sessions_in_day, 3),
        CoreAchievement::FiveSessionDay => (m.max_sessions_in_day, 5),
        CoreAchievement::DayAndNight => flag(m.has_day_and_night),
        CoreAchievement::BeatYesterday => flag(m.has_beat_yesterday),
        CoreAchievement::NewPersonalBest => flag(m.has_personal_best),
        // Single-session lengths
        CoreAchievement::ToeInTheWater => (m.longest_session_ms, 15 * MINUTE_MS),
        CoreAchievement::Pomodoro => (m.longest_session_ms, 25 * MINUTE_MS),
        CoreAchievement::LockedIn => (m.longest_session_ms, 45 * MINUTE_MS),
        CoreAchievement::DeepHour => (m.longest_session_ms, HOUR_MS),
        CoreAchievement::UltradianWave => (m.longest_session_ms, 90 * MINUTE_MS),
        CoreAchievement::Hyperfocus => (m.longest_session_ms, 2 * HOUR_MS),
        CoreAchievement::InTheZone => (m.longest_session_ms, 3 * HOUR_MS),
        CoreAchievement::MarathonMind => (m.longest_session_ms, 4 * HOUR_MS),
        // Single-day focus
        CoreAchievement::SolidHour => (m.max_day_focus_ms, HOUR_MS),
        CoreAchievement::GoodDay => (m.max_day_focus_ms, 2 * HOUR_MS),
        CoreAchievement::DedicatedDay => (m.max_day_focus_ms, 4 * HOUR_MS),
        CoreAchievement::DeepWorkday => (m.max_day_focus_ms, 6 * HOUR_MS),
        CoreAchievement::FullShift => (m.max_day_focus_ms, 8 * HOUR_MS),
        CoreAchievement::Overclocked => (m.max_day_focus_ms, 10 * HOUR_MS),
        // Single goal / tree focus
        CoreAchievement::DiggingIn => (m.max_vertex_focus_ms, HOUR_MS),
        CoreAchievement::GoingDeep => (m.max_vertex_focus_ms, 5 * HOUR_MS),
        CoreAchievement::IronThrone => (m.max_tree_focus_ms, 25 * HOUR_MS),
        // Consistency & comebacks
        CoreAchievement::ThreeInARow => streak(m.best_focus_streak, m.current_focus_streak, 3),
        CoreAchievement::FullWeek => streak(m.best_focus_streak, m.current_focus_streak, 7),
        CoreAchievement::UnbrokenFortnight => {
            streak(m.best_focus_streak, m.current_focus_streak, 14)
        }
        CoreAchievement::MonthlyRhythm => streak(m.best_focus_streak, m.current_focus_streak, 30),
        CoreAchievement::FiveOfSeven => (m.best_rolling_5_of_7, 5),
        CoreAchievement::SteadyMonth => (m.best_rolling_20_of_30, 20),
        CoreAchievement::WeekendWarrior => flag(m.has_weekend_warrior),
        CoreAchievement::WeeklyRhythm => (m.best_week_streak, 4),
        CoreAchievement::SeasonOfFocus => (m.best_week_streak, 12),
        CoreAchievement::BounceBack => flag(m.has_bounce_back),
        CoreAchievement::ComebackKid => flag(m.has_comeback_kid),
        // Habits
        CoreAchievement::FirstCheck => (m.total_habit_logs.min(1), 1),
        CoreAchievement::HabitFormer => (m.total_habit_logs, 10),
        CoreAchievement::TargetMet => flag(m.has_any_met_habit),
        CoreAchievement::AssemblyLine => (m.max_distinct_habits_met_in_day, 3),
        CoreAchievement::MeasuredProgress => flag(m.has_valued_met_habit),
        CoreAchievement::AboveAndBeyond => flag(m.has_above_and_beyond),
        CoreAchievement::WithinBounds => (m.best_at_most_streak, 7),
        CoreAchievement::FiveOfSevenHabit => (m.best_habit_5_of_7, 5),
        CoreAchievement::HabitStreak => (m.best_daily_habit_streak, 7),
        CoreAchievement::IronDiscipline => (m.best_daily_habit_streak, 30),
        CoreAchievement::BeforeTheSun => flag(m.has_before_six_am),
        // Graph craft, completion, readings & notes
        CoreAchievement::FirstSeed => (m.tree_count.min(1), 1),
        CoreAchievement::BranchingOut => (m.node_count, 10),
        CoreAchievement::LivingCanopy => (m.node_count, 50),
        CoreAchievement::ForestKeeper => (m.tree_count, 5),
        CoreAchievement::DeepRoots => (m.max_tree_depth, 5),
        CoreAchievement::HubOfIdeas => (m.max_direct_children, 5),
        CoreAchievement::Hyperlinked => flag(m.has_linked_tree),
        CoreAchievement::FullSpectrum => (u64::from(m.metadata.vertex_kinds_mask.count_ones()), 6),
        CoreAchievement::BucketBrigade => (m.metadata.max_bucket_members, 5),
        CoreAchievement::CircuitNetwork => flag(m.has_circuit_network),
        CoreAchievement::OneStepComplete => (m.finished_count.min(1), 1),
        CoreAchievement::CleanDesk => flag(m.has_clean_desk),
        CoreAchievement::AheadOfSchedule => flag(m.metadata.finished_deadline_on_time),
        CoreAchievement::SubtreeSweep => (m.max_subtree_sweep, 5),
        CoreAchievement::FirstNote => (m.metadata.non_empty_notes.min(1), 1),
        CoreAchievement::FieldJournal => (m.metadata.non_empty_notes, 10),
        CoreAchievement::CoverToCover => (m.metadata.completed_readings.min(1), 1),
        CoreAchievement::ResearchComplete => (m.metadata.completed_readings_with_hour.min(1), 1),
        CoreAchievement::WellRead => (m.metadata.completed_readings, 5),
        // Easter eggs
        CoreAchievement::GettingOnTrack => flag(m.metadata.has_getting_on_track),
        CoreAchievement::LazyBastard => flag(m.has_lazy_bastard),
        CoreAchievement::ForestMustGrow => flag(m.node_count >= 100 && m.tree_count >= 5),
        CoreAchievement::MainBus => (m.max_links_in_tree, 3),
        CoreAchievement::LogisticsNetwork => (m.metadata.max_buckets_with_two_plus_in_tree, 3),
        CoreAchievement::SpaghettiBase => (m.max_disconnected_non_pedantic, 10),
        CoreAchievement::RefactorSpaghetti => flag(m.has_refactor_spaghetti),
        CoreAchievement::WatchYourStep => flag(m.has_watch_your_step),
        CoreAchievement::ThereIsNoSpoon => flag(m.metadata.finished_deadline_seven_days_early),
        CoreAchievement::NoTimeForChitChat => (m.metadata.max_finished_in_one_day, 5),
        CoreAchievement::SteamAllTheWay => (m.zero_pause_15m_sessions, 10),
        CoreAchievement::BetterLateThanNever => flag(m.metadata.finished_deadline_overdue),
        CoreAchievement::ThanksForTheFish => flag(m.metadata.has_finished_fish),
        CoreAchievement::Squirrel => (m.max_vertices_in_day, 4),
        CoreAchievement::BrainDump => (m.metadata.max_thoughts_in_tree, 5),
        CoreAchievement::YakShaving => (m.max_tree_depth, 6),
        CoreAchievement::RubberDuck => (m.metadata.max_note_chars, 1000),
        CoreAchievement::StrictFormalist => flag(m.has_strict_formalist),
        CoreAchievement::TransitiveClosure => flag(m.has_link_chain_3),
        CoreAchievement::Qed => flag(m.metadata.has_qed_vertex),
        CoreAchievement::NightOwl => flag(m.has_night_owl),
        CoreAchievement::EarlyBird => flag(m.has_early_bird),
        CoreAchievement::PhotoFinish => flag(m.metadata.finished_deadline_photo_finish),
        CoreAchievement::GhostWhisperer => flag(m.metadata.has_ghost_whisperer),
        CoreAchievement::ModusPonens => flag(m.metadata.has_modus_ponens),
        CoreAchievement::AxiomOfChoice => (m.trees_with_ten_plus_nodes, 3),
        CoreAchievement::FixedPoint => flag(m.has_fixed_point),
        CoreAchievement::HaltingProblem => flag(m.has_halting_problem),
        CoreAchievement::MidnightOil => flag(m.has_midnight_oil),
        CoreAchievement::PowerLunch => flag(m.has_power_lunch),
        CoreAchievement::JustFiveMinutes => flag(m.has_just_five_minutes),
        CoreAchievement::RabbitHole => (m.metadata.max_note_chars, 5000),
        CoreAchievement::ZeroInbox => flag(m.has_zero_inbox),
        CoreAchievement::Polymath => (m.focused_tree_count, 5),
        CoreAchievement::WeekendScholar => (m.max_weekend_day_focus_ms, 4 * HOUR_MS),
        CoreAchievement::FortyTwo => {
            flag(m.has_forty_two_session || m.metadata.has_finished_forty_two)
        }
        CoreAchievement::OrangeStreak3 => streak(m.best_streak_2h, m.current_streak_2h, 3),
        CoreAchievement::YellowStreak3 => streak(m.best_streak_4h, m.current_streak_4h, 3),
        CoreAchievement::GreenStreak3 => streak(m.best_streak_5h, m.current_streak_5h, 3),
        CoreAchievement::GreenStreak5 => streak(m.best_streak_5h, m.current_streak_5h, 5),
        CoreAchievement::GreenStreak7 => streak(m.best_streak_5h, m.current_streak_5h, 7),
        CoreAchievement::CyanStreak3 => streak(m.best_streak_6h, m.current_streak_6h, 3),
        CoreAchievement::BlueStreak3 => streak(m.best_streak_7_5h, m.current_streak_7_5h, 3),
        CoreAchievement::GricesMaxim => (m.metadata.concise_thoughts, 3),
        CoreAchievement::TowerOfBabel => (m.metadata.unicode_vertices, 3),
        CoreAchievement::Schwa => flag(m.metadata.has_schwa),
        CoreAchievement::ChomskyHierarchy => flag(m.metadata.has_chomsky_hierarchy),
        CoreAchievement::RosettaStone => (m.metadata.readings_with_notes, 3),
        CoreAchievement::MinimalPair => flag(m.metadata.has_minimal_pair),
        CoreAchievement::GlottalStop => flag(m.metadata.has_ipa_symbol),
    }
}

/// Current metric value for an endless series, in the series' native unit
/// (`FocusHours` uses milliseconds for smooth progress bars; others use counts).
pub fn series_current_and_unit(series: MilestoneSeries, m: &Metrics) -> (u64, u64) {
    match series {
        MilestoneSeries::FocusHours => (m.total_focus_ms, HOUR_MS),
        MilestoneSeries::FocusSessions => (m.session_count, 1),
        MilestoneSeries::PomodoroPacks => (m.pomodoro_count, 1),
        MilestoneSeries::ActiveDays => (m.active_days, 1),
        MilestoneSeries::SolidDays => (m.solid_days, 1),
        MilestoneSeries::FinishedGoals => (m.finished_count, 1),
        MilestoneSeries::MetHabitDays => (m.total_met_habit_days, 1),
        MilestoneSeries::YellowCombos => (m.yellow_combo_unlocks, 1),
        MilestoneSeries::GreenCombos => (m.green_combo_unlocks, 1),
        MilestoneSeries::GreenWorkweeks => (m.green_workweeks, 1),
        MilestoneSeries::DeepDoubles => (m.deep_combo_unlocks, 1),
        MilestoneSeries::DeepWorkweeks => (m.deep_workweeks, 1),
    }
}

/// Live `(current, target)` display progress for the next locked endless milestone.
/// Repeatable streak combos show your live run progress toward the initial threshold
/// (e.g. `1 / 3 days`) and then `+1 day` per step (`3 / 4`, `4 / 5`, ...) while active;
/// once broken, they reset to `0 / initial`.
pub fn series_live_progress(
    series: MilestoneSeries,
    m: &Metrics,
    default_target: u64,
) -> (u64, u64) {
    match series {
        MilestoneSeries::YellowCombos => (
            m.yellow_combo_live,
            m.yellow_combo_live.saturating_add(1).max(3),
        ),
        MilestoneSeries::GreenCombos => (
            m.green_combo_live,
            m.green_combo_live.saturating_add(1).max(3),
        ),
        MilestoneSeries::DeepDoubles => (
            m.deep_combo_live,
            m.deep_combo_live.saturating_add(1).max(2),
        ),
        _ => (series_current_and_unit(series, m).0, default_target),
    }
}

pub fn daily_progress(id: DailyMilestone, m: &Metrics) -> DailyProgress {
    let (current, target, applicable) = match id {
        DailyMilestone::FirstSparkToday => (m.today_sessions.min(1), 1, true),
        DailyMilestone::QuarterHourToday => (m.today_focus_ms, 15 * MINUTE_MS, true),
        DailyMilestone::HalfHourToday => (m.today_focus_ms, 30 * MINUTE_MS, true),
        DailyMilestone::FirstHourToday => (m.today_focus_ms, HOUR_MS, true),
        DailyMilestone::TwoHoursToday => (m.today_focus_ms, 2 * HOUR_MS, true),
        DailyMilestone::ThreeHoursToday => (m.today_focus_ms, 3 * HOUR_MS, true),
        DailyMilestone::FourHoursToday => (m.today_focus_ms, 4 * HOUR_MS, true),
        DailyMilestone::FiveHoursToday => (m.today_focus_ms, 5 * HOUR_MS, true),
        DailyMilestone::SixHoursToday => (m.today_focus_ms, 6 * HOUR_MS, true),
        DailyMilestone::SevenHoursToday => (m.today_focus_ms, 7 * HOUR_MS, true),
        DailyMilestone::DoubleTapToday => (m.today_sessions, 2, true),
        DailyMilestone::HabitCheckToday => (m.today_met_habits.min(1), 1, m.has_active_habits),
    };
    DailyProgress {
        id,
        completed: applicable && current >= target,
        current,
        target,
        applicable,
    }
}

/// Deterministic historical timestamp estimate for retroactive backfill.
/// Never returns a timestamp later than `now`.
pub fn backfill_timestamp(id: AchievementId, m: &Metrics, now: u64) -> u64 {
    let ts = match id {
        AchievementId::Core(CoreAchievement::FirstSeed) => m.tree_created_times.first().copied(),
        AchievementId::Core(CoreAchievement::ForestKeeper) => m.tree_created_times.get(4).copied(),
        AchievementId::Core(CoreAchievement::FirstSpark) => {
            m.session_end_times.first().map(|(at, _)| *at)
        }
        AchievementId::Core(CoreAchievement::QuarterHour) => {
            focus_crossing_time(&m.session_end_times, 15 * MINUTE_MS)
        }
        AchievementId::Core(CoreAchievement::FirstHour) => {
            focus_crossing_time(&m.session_end_times, HOUR_MS)
        }
        AchievementId::Core(CoreAchievement::TwoHourMark) => {
            focus_crossing_time(&m.session_end_times, 2 * HOUR_MS)
        }
        AchievementId::Core(CoreAchievement::ThreeHourMark) => {
            focus_crossing_time(&m.session_end_times, 3 * HOUR_MS)
        }
        AchievementId::Core(CoreAchievement::OneStepComplete) => m.finished_times.first().copied(),
        AchievementId::Endless {
            series: MilestoneSeries::FocusHours,
            milestone,
        } => milestone
            .checked_mul(HOUR_MS)
            .and_then(|target| focus_crossing_time(&m.session_end_times, target)),
        AchievementId::Endless {
            series: MilestoneSeries::FocusSessions,
            milestone,
        } => usize::try_from(milestone.saturating_sub(1))
            .ok()
            .and_then(|idx| m.session_end_times.get(idx).map(|(at, _)| *at)),
        AchievementId::Endless {
            series: MilestoneSeries::FinishedGoals,
            milestone,
        } => usize::try_from(milestone.saturating_sub(1))
            .ok()
            .and_then(|idx| m.finished_times.get(idx).copied()),
        _ => None,
    };
    ts.map_or(now, |at| at.min(now))
}

/// Returns `(best, current)` forgiving streak of days meeting `min_focus_ms`,
/// allowing up to 1 rest day off (`d.day <= prev_day + 2`) between qualifying days.
/// `current` is non-zero only if the latest qualifying day is within 2 days of `today_local_day`.
fn threshold_day_streak(days: &[DayAgg], min_focus_ms: u64, today_local_day: i32) -> (u64, u64) {
    let mut best = 0_u64;
    let mut run = 0_u64;
    let mut prev_day: Option<i32> = None;
    let mut i = 0;
    while i < days.len() {
        let d = &days[i];
        if d.focus_ms >= min_focus_ms {
            if prev_day.is_some_and(|p| d.day <= p + 2) {
                run += 1;
            } else {
                run = 1;
            }
            if run > best {
                best = run;
            }
            prev_day = Some(d.day);
        }
        i += 1;
    }
    let current = if prev_day.is_some_and(|p| today_local_day <= p + 2) {
        run
    } else {
        0
    };
    (best, current)
}

/// Returns `(total_unlocks, live_run)` for repeatable combos:
/// - Reaching `initial_len` is forgiving (allows up to 1 rest day off: `d.day <= prev_day + 2`).
/// - Extending past `initial_len` is strict consecutive days (`d.day == prev_day + 1`, no off-day).
/// - Once broken, the next qualifying day starts a fresh run from 1.
fn combo_run_stats(
    days: &[DayAgg],
    min_focus_ms: u64,
    initial_len: u64,
    today_local_day: i32,
) -> (u64, u64) {
    let mut unlocks = 0_u64;
    let mut run = 0_u64;
    let mut prev_day: Option<i32> = None;
    let mut i = 0;
    while i < days.len() {
        let d = &days[i];
        if d.focus_ms >= min_focus_ms {
            let max_step = if run >= initial_len { 1 } else { 2 };
            if prev_day.is_some_and(|p| d.day <= p + max_step) {
                run += 1;
            } else {
                run = 1;
            }
            if run >= initial_len {
                unlocks += 1;
            }
            prev_day = Some(d.day);
        }
        i += 1;
    }
    let live_max_gap = if run >= initial_len { 1 } else { 2 };
    let live = if prev_day.is_some_and(|p| today_local_day <= p + live_max_gap) {
        run
    } else {
        0
    };
    (unlocks, live)
}

/// Count non-overlapping forgiving runs of `run_len` qualifying days (`>= min_focus_ms`),
/// allowing up to 1 rest day off (`d.day <= prev_day + 2`) inside a run.
fn count_non_overlapping_runs(days: &[DayAgg], min_focus_ms: u64, run_len: u64) -> u64 {
    let mut completed = 0_u64;
    let mut run = 0_u64;
    let mut prev_day: Option<i32> = None;
    let mut i = 0;
    while i < days.len() {
        let d = &days[i];
        if d.focus_ms >= min_focus_ms {
            if prev_day.is_some_and(|p| d.day <= p + 2) {
                run += 1;
            } else {
                run = 1;
            }
            if run >= run_len {
                completed += 1;
                run = 0;
                prev_day = None;
            } else {
                prev_day = Some(d.day);
            }
        }
        i += 1;
    }
    completed
}

fn focus_crossing_time(sessions: &[(u64, u64)], target_ms: u64) -> Option<u64> {
    let mut acc = 0_u64;
    let mut i = 0;
    while i < sessions.len() {
        acc = acc.saturating_add(sessions[i].1);
        if acc >= target_ms {
            return Some(sessions[i].0);
        }
        i += 1;
    }
    None
}
