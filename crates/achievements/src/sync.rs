//! Pure evaluation and monotonic, idempotent unlock synchronization.
use crate::{model::*, rules};
use alloc::vec::Vec;
use hyperforest_domain as d;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EvaluationResult {
    pub core: Vec<AchievementProgress>,
    pub endless: Vec<AchievementProgress>,
    pub daily: Vec<DailyProgress>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SyncResult {
    pub unlocked: Vec<UnlockedRecord>,
    pub newly_unlocked: Vec<UnlockedRecord>,
}

fn find_unlocked(records: &[UnlockedRecord], id: AchievementId) -> Option<u64> {
    let mut i = 0;
    while i < records.len() {
        if records[i].id == id {
            return Some(records[i].unlocked_at);
        }
        i += 1;
    }
    None
}

fn highest_unlocked_milestone(records: &[UnlockedRecord], series: MilestoneSeries) -> u64 {
    let mut best = 0_u64;
    let mut i = 0;
    while i < records.len() {
        if let AchievementId::Endless {
            series: s,
            milestone,
        } = records[i].id
        {
            if s == series && milestone > best {
                best = milestone;
            }
        }
        i += 1;
    }
    best
}

pub fn evaluate(
    snapshot: &d::Snapshot,
    input: &AchievementInput,
    unlocked: &[UnlockedRecord],
) -> Result<EvaluationResult, Error> {
    let metrics = rules::extract(snapshot, input)?;
    let mut core = Vec::with_capacity(ALL_CORE.len());
    let mut i = 0;
    while i < ALL_CORE.len() {
        let id = ALL_CORE[i];
        let (current, target) = rules::core_progress(id, &metrics);
        core.push(AchievementProgress {
            id: AchievementId::Core(id),
            unlocked_at: find_unlocked(unlocked, AchievementId::Core(id)),
            current,
            target,
        });
        i += 1;
    }

    let mut endless = Vec::new();
    i = 0;
    while i < ALL_SERIES.len() {
        let series = ALL_SERIES[i];
        let step = series.step();
        let (current_raw, unit_scale) = rules::series_current_and_unit(series, &metrics);
        let current_units = current_raw / unit_scale;
        let earned_top = (current_units / step)
            .checked_mul(step)
            .ok_or(Error::Overflow)?;
        let highest = highest_unlocked_milestone(unlocked, series).max(earned_top);
        let mut milestone = step;
        while milestone <= highest {
            let id = AchievementId::Endless { series, milestone };
            let target = milestone.checked_mul(unit_scale).ok_or(Error::Overflow)?;
            if let Some(unlocked_at) = find_unlocked(unlocked, id) {
                endless.push(AchievementProgress {
                    id,
                    unlocked_at: Some(unlocked_at),
                    current: current_raw.max(target),
                    target,
                });
            }
            milestone = milestone.checked_add(step).ok_or(Error::Overflow)?;
        }
        // Always expose the single next locked milestone as an active target.
        let next_milestone = highest.checked_add(step).ok_or(Error::Overflow)?;
        let next_target = next_milestone
            .checked_mul(unit_scale)
            .ok_or(Error::Overflow)?;
        let (live_current, live_target) =
            rules::series_live_progress(series, &metrics, next_target);
        endless.push(AchievementProgress {
            id: AchievementId::Endless {
                series,
                milestone: next_milestone,
            },
            unlocked_at: None,
            current: live_current,
            target: live_target,
        });
        i += 1;
    }

    let mut daily = Vec::with_capacity(ALL_DAILY.len());
    i = 0;
    while i < ALL_DAILY.len() {
        daily.push(rules::daily_progress(ALL_DAILY[i], &metrics));
        i += 1;
    }

    Ok(EvaluationResult {
        core,
        endless,
        daily,
    })
}

/// Monotonically latches all newly satisfied core and endless achievements.
/// Preserves every existing record and timestamp; never duplicates IDs; never skips endless steps.
pub fn sync(
    snapshot: &d::Snapshot,
    input: &AchievementInput,
    existing: &[UnlockedRecord],
    now: u64,
    backfill: bool,
) -> Result<SyncResult, Error> {
    let metrics = rules::extract(snapshot, input)?;
    let mut unlocked: Vec<UnlockedRecord> = Vec::with_capacity(existing.len());
    let mut newly_unlocked: Vec<UnlockedRecord> = Vec::new();

    // Preserve existing unlocks verbatim, deduplicating defensively.
    let mut i = 0;
    while i < existing.len() {
        if find_unlocked(&unlocked, existing[i].id).is_none() {
            unlocked.push(existing[i]);
        }
        i += 1;
    }

    // Core achievements
    i = 0;
    while i < ALL_CORE.len() {
        let id = AchievementId::Core(ALL_CORE[i]);
        if find_unlocked(&unlocked, id).is_none() {
            let (current, target) = rules::core_progress(ALL_CORE[i], &metrics);
            if current >= target {
                if unlocked.len() >= MAX_UNLOCKED_RECORDS {
                    return Err(Error::InvalidUnlock);
                }
                let at = if backfill {
                    rules::backfill_timestamp(id, &metrics, now)
                } else {
                    now
                };
                let record = UnlockedRecord {
                    id,
                    unlocked_at: at,
                };
                unlocked.push(record);
                newly_unlocked.push(record);
            }
        }
        i += 1;
    }

    // Endless milestone series (no skipped milestones)
    i = 0;
    while i < ALL_SERIES.len() {
        let series = ALL_SERIES[i];
        let step = series.step();
        let (current_raw, unit_scale) = rules::series_current_and_unit(series, &metrics);
        let current_units = current_raw / unit_scale;
        let max_earned = (current_units / step)
            .checked_mul(step)
            .ok_or(Error::Overflow)?;
        let mut milestone = step;
        while milestone <= max_earned {
            let id = AchievementId::Endless { series, milestone };
            if find_unlocked(&unlocked, id).is_none() {
                if unlocked.len() >= MAX_UNLOCKED_RECORDS {
                    return Err(Error::InvalidUnlock);
                }
                let at = if backfill {
                    rules::backfill_timestamp(id, &metrics, now)
                } else {
                    now
                };
                let record = UnlockedRecord {
                    id,
                    unlocked_at: at,
                };
                unlocked.push(record);
                newly_unlocked.push(record);
            }
            milestone = milestone.checked_add(step).ok_or(Error::Overflow)?;
        }
        i += 1;
    }

    Ok(SyncResult {
        unlocked,
        newly_unlocked,
    })
}
