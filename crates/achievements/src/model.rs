//! Typed achievement identities, caller-supplied integer facts, and result records.
use alloc::vec::Vec;

pub const HOUR_MS: u64 = 3_600_000;
pub const MINUTE_MS: u64 = 60_000;
pub const MAX_UNLOCKED_RECORDS: usize = 10_000;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Error {
    Overflow,
    InvalidUnlock,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CoreAchievement {
    // Early cumulative focus
    FirstSpark,
    QuarterHour,
    FirstHour,
    TwoHourMark,
    ThreeHourMark,
    // Daily initiation & bursts
    BreakingTheIce,
    DoubleTap,
    HatTrick,
    FiveSessionDay,
    DayAndNight,
    BeatYesterday,
    NewPersonalBest,
    // Single-session lengths
    ToeInTheWater,
    Pomodoro,
    LockedIn,
    DeepHour,
    UltradianWave,
    Hyperfocus,
    InTheZone,
    MarathonMind,
    // Single-day focus
    SolidHour,
    GoodDay,
    DedicatedDay,
    DeepWorkday,
    FullShift,
    Overclocked,
    // Focus on one goal / tree
    DiggingIn,
    GoingDeep,
    IronThrone,
    // Consistency, forgiving windows & comebacks
    ThreeInARow,
    FullWeek,
    UnbrokenFortnight,
    MonthlyRhythm,
    FiveOfSeven,
    SteadyMonth,
    WeekendWarrior,
    WeeklyRhythm,
    SeasonOfFocus,
    BounceBack,
    ComebackKid,
    // Habits (repetition & valued)
    FirstCheck,
    HabitFormer,
    TargetMet,
    AssemblyLine,
    MeasuredProgress,
    AboveAndBeyond,
    WithinBounds,
    FiveOfSevenHabit,
    HabitStreak,
    IronDiscipline,
    BeforeTheSun,
    // Graph craft, completion, readings & notes
    FirstSeed,
    BranchingOut,
    LivingCanopy,
    ForestKeeper,
    DeepRoots,
    HubOfIdeas,
    Hyperlinked,
    FullSpectrum,
    BucketBrigade,
    CircuitNetwork,
    OneStepComplete,
    CleanDesk,
    AheadOfSchedule,
    SubtreeSweep,
    FirstNote,
    FieldJournal,
    CoverToCover,
    ResearchComplete,
    WellRead,
    // Factorio, ADHD & formal-methods Easter eggs
    GettingOnTrack,
    LazyBastard,
    ForestMustGrow,
    MainBus,
    LogisticsNetwork,
    SpaghettiBase,
    RefactorSpaghetti,
    WatchYourStep,
    ThereIsNoSpoon,
    NoTimeForChitChat,
    SteamAllTheWay,
    BetterLateThanNever,
    ThanksForTheFish,
    Squirrel,
    BrainDump,
    YakShaving,
    RubberDuck,
    StrictFormalist,
    TransitiveClosure,
    Qed,
    NightOwl,
    EarlyBird,
    PhotoFinish,
    GhostWhisperer,
    // Additional secret achievements
    ModusPonens,
    AxiomOfChoice,
    FixedPoint,
    HaltingProblem,
    MidnightOil,
    PowerLunch,
    JustFiveMinutes,
    RabbitHole,
    ZeroInbox,
    Polymath,
    WeekendScholar,
    FortyTwo,
    // Consecutive high-focus-day combos
    OrangeStreak3,
    YellowStreak3,
    GreenStreak3,
    GreenStreak5,
    GreenStreak7,
    CyanStreak3,
    BlueStreak3,
    // Discoverable linguistics secret achievements
    GricesMaxim,
    TowerOfBabel,
    Schwa,
    ChomskyHierarchy,
    RosettaStone,
    MinimalPair,
    GlottalStop,
}

pub const ALL_CORE: &[CoreAchievement] = &[
    CoreAchievement::FirstSpark,
    CoreAchievement::QuarterHour,
    CoreAchievement::FirstHour,
    CoreAchievement::TwoHourMark,
    CoreAchievement::ThreeHourMark,
    CoreAchievement::BreakingTheIce,
    CoreAchievement::DoubleTap,
    CoreAchievement::HatTrick,
    CoreAchievement::FiveSessionDay,
    CoreAchievement::DayAndNight,
    CoreAchievement::BeatYesterday,
    CoreAchievement::NewPersonalBest,
    CoreAchievement::ToeInTheWater,
    CoreAchievement::Pomodoro,
    CoreAchievement::LockedIn,
    CoreAchievement::DeepHour,
    CoreAchievement::UltradianWave,
    CoreAchievement::Hyperfocus,
    CoreAchievement::InTheZone,
    CoreAchievement::MarathonMind,
    CoreAchievement::SolidHour,
    CoreAchievement::GoodDay,
    CoreAchievement::DedicatedDay,
    CoreAchievement::DeepWorkday,
    CoreAchievement::FullShift,
    CoreAchievement::Overclocked,
    CoreAchievement::DiggingIn,
    CoreAchievement::GoingDeep,
    CoreAchievement::IronThrone,
    CoreAchievement::ThreeInARow,
    CoreAchievement::FullWeek,
    CoreAchievement::UnbrokenFortnight,
    CoreAchievement::MonthlyRhythm,
    CoreAchievement::FiveOfSeven,
    CoreAchievement::SteadyMonth,
    CoreAchievement::WeekendWarrior,
    CoreAchievement::WeeklyRhythm,
    CoreAchievement::SeasonOfFocus,
    CoreAchievement::BounceBack,
    CoreAchievement::ComebackKid,
    CoreAchievement::FirstCheck,
    CoreAchievement::HabitFormer,
    CoreAchievement::TargetMet,
    CoreAchievement::AssemblyLine,
    CoreAchievement::MeasuredProgress,
    CoreAchievement::AboveAndBeyond,
    CoreAchievement::WithinBounds,
    CoreAchievement::FiveOfSevenHabit,
    CoreAchievement::HabitStreak,
    CoreAchievement::IronDiscipline,
    CoreAchievement::BeforeTheSun,
    CoreAchievement::FirstSeed,
    CoreAchievement::BranchingOut,
    CoreAchievement::LivingCanopy,
    CoreAchievement::ForestKeeper,
    CoreAchievement::DeepRoots,
    CoreAchievement::HubOfIdeas,
    CoreAchievement::Hyperlinked,
    CoreAchievement::FullSpectrum,
    CoreAchievement::BucketBrigade,
    CoreAchievement::CircuitNetwork,
    CoreAchievement::OneStepComplete,
    CoreAchievement::CleanDesk,
    CoreAchievement::AheadOfSchedule,
    CoreAchievement::SubtreeSweep,
    CoreAchievement::FirstNote,
    CoreAchievement::FieldJournal,
    CoreAchievement::CoverToCover,
    CoreAchievement::ResearchComplete,
    CoreAchievement::WellRead,
    CoreAchievement::GettingOnTrack,
    CoreAchievement::LazyBastard,
    CoreAchievement::ForestMustGrow,
    CoreAchievement::MainBus,
    CoreAchievement::LogisticsNetwork,
    CoreAchievement::SpaghettiBase,
    CoreAchievement::RefactorSpaghetti,
    CoreAchievement::WatchYourStep,
    CoreAchievement::ThereIsNoSpoon,
    CoreAchievement::NoTimeForChitChat,
    CoreAchievement::SteamAllTheWay,
    CoreAchievement::BetterLateThanNever,
    CoreAchievement::ThanksForTheFish,
    CoreAchievement::Squirrel,
    CoreAchievement::BrainDump,
    CoreAchievement::YakShaving,
    CoreAchievement::RubberDuck,
    CoreAchievement::StrictFormalist,
    CoreAchievement::TransitiveClosure,
    CoreAchievement::Qed,
    CoreAchievement::NightOwl,
    CoreAchievement::EarlyBird,
    CoreAchievement::PhotoFinish,
    CoreAchievement::GhostWhisperer,
    CoreAchievement::ModusPonens,
    CoreAchievement::AxiomOfChoice,
    CoreAchievement::FixedPoint,
    CoreAchievement::HaltingProblem,
    CoreAchievement::MidnightOil,
    CoreAchievement::PowerLunch,
    CoreAchievement::JustFiveMinutes,
    CoreAchievement::RabbitHole,
    CoreAchievement::ZeroInbox,
    CoreAchievement::Polymath,
    CoreAchievement::WeekendScholar,
    CoreAchievement::FortyTwo,
    CoreAchievement::OrangeStreak3,
    CoreAchievement::YellowStreak3,
    CoreAchievement::GreenStreak3,
    CoreAchievement::GreenStreak5,
    CoreAchievement::GreenStreak7,
    CoreAchievement::CyanStreak3,
    CoreAchievement::BlueStreak3,
    CoreAchievement::GricesMaxim,
    CoreAchievement::TowerOfBabel,
    CoreAchievement::Schwa,
    CoreAchievement::ChomskyHierarchy,
    CoreAchievement::RosettaStone,
    CoreAchievement::MinimalPair,
    CoreAchievement::GlottalStop,
];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MilestoneSeries {
    /// Every +5 hours focused (`5, 10, 15, 20, ...`).
    FocusHours,
    /// Every +10 saved focus sessions (`10, 20, 30, ...`).
    FocusSessions,
    /// Every +5 sessions of >= 25 minutes (`5, 10, 15, ...`).
    PomodoroPacks,
    /// Every +5 distinct active focus days (`5, 10, 15, ...`).
    ActiveDays,
    /// Every +5 days with >= 1 hour focused (`5, 10, 15, ...`).
    SolidDays,
    /// Every +5 finished subgoals (`5, 10, 15, ...`).
    FinishedGoals,
    /// Every +10 met habit days across all habits (`10, 20, 30, ...`).
    MetHabitDays,
    /// Repeatable forgiving 4h+ combo: unlocks at 3d and every +1d after; resets on break.
    YellowCombos,
    /// Repeatable forgiving 5h+ combo: unlocks at 3d and every +1d after; resets on break.
    GreenCombos,
    /// Every non-overlapping forgiving 5h+ × 5-day workweek (1, 2, 3, ...).
    GreenWorkweeks,
    /// Repeatable forgiving 7h+ combo: unlocks at 2d and every +1d after; resets on break.
    DeepDoubles,
    /// Every non-overlapping forgiving 7h+ × 5-day workweek (1, 2, 3, ...).
    DeepWorkweeks,
}

impl MilestoneSeries {
    pub fn step(self) -> u64 {
        match self {
            Self::FocusHours => 5,
            Self::FocusSessions => 10,
            Self::PomodoroPacks => 5,
            Self::ActiveDays => 5,
            Self::SolidDays => 5,
            Self::FinishedGoals => 5,
            Self::MetHabitDays => 10,
            Self::YellowCombos => 1,
            Self::GreenCombos => 1,
            Self::GreenWorkweeks => 1,
            Self::DeepDoubles => 1,
            Self::DeepWorkweeks => 1,
        }
    }
}

pub const ALL_SERIES: &[MilestoneSeries] = &[
    MilestoneSeries::FocusHours,
    MilestoneSeries::FocusSessions,
    MilestoneSeries::PomodoroPacks,
    MilestoneSeries::ActiveDays,
    MilestoneSeries::SolidDays,
    MilestoneSeries::FinishedGoals,
    MilestoneSeries::MetHabitDays,
    MilestoneSeries::YellowCombos,
    MilestoneSeries::GreenCombos,
    MilestoneSeries::GreenWorkweeks,
    MilestoneSeries::DeepDoubles,
    MilestoneSeries::DeepWorkweeks,
];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DailyMilestone {
    FirstSparkToday,
    QuarterHourToday,
    HalfHourToday,
    FirstHourToday,
    TwoHoursToday,
    ThreeHoursToday,
    FourHoursToday,
    FiveHoursToday,
    SixHoursToday,
    SevenHoursToday,
    DoubleTapToday,
    HabitCheckToday,
}

pub const ALL_DAILY: &[DailyMilestone] = &[
    DailyMilestone::FirstSparkToday,
    DailyMilestone::QuarterHourToday,
    DailyMilestone::HalfHourToday,
    DailyMilestone::FirstHourToday,
    DailyMilestone::TwoHoursToday,
    DailyMilestone::ThreeHoursToday,
    DailyMilestone::FourHoursToday,
    DailyMilestone::FiveHoursToday,
    DailyMilestone::SixHoursToday,
    DailyMilestone::SevenHoursToday,
    DailyMilestone::DoubleTapToday,
    DailyMilestone::HabitCheckToday,
];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AchievementId {
    Core(CoreAchievement),
    Endless {
        series: MilestoneSeries,
        milestone: u64,
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct UnlockedRecord {
    pub id: AchievementId,
    pub unlocked_at: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct AchievementProgress {
    pub id: AchievementId,
    pub unlocked_at: Option<u64>,
    pub current: u64,
    pub target: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct DailyProgress {
    pub id: DailyMilestone,
    pub completed: bool,
    pub current: u64,
    pub target: u64,
    pub applicable: bool,
}

/// Caller-supplied local-calendar projection of one saved session.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct LocalSessionFact {
    pub session_index: usize,
    /// Local calendar day index (days since 1970-01-01 in local time).
    pub local_day: i32,
    /// Monotonic local ISO week index (Monday-based).
    pub iso_week: i32,
    /// Local weekday: 0 = Monday .. 6 = Sunday.
    pub weekday: u8,
    /// Session start minute in local day (0..=1439).
    pub start_minute: u16,
    /// Session end minute in local day (0..=1439).
    pub end_minute: u16,
    /// True if any active focus period overlaps 00:00..04:00 local time.
    pub touches_night: bool,
    pub duration_ms: u64,
    pub ended_at: u64,
}

/// Caller-supplied per-habit summary computed via `hyperforest_domain::habit`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HabitFact {
    pub active: bool,
    pub is_valued: bool,
    pub is_at_most: bool,
    pub total_logs: u64,
    pub met_periods: u64,
    pub best_period_streak: u64,
    pub best_daily_streak: u64,
    pub best_rolling_5_of_7: u64,
    pub has_double_target: bool,
    pub has_before_six_am: bool,
    pub met_today: bool,
    /// Distinct local day indices on which this habit was met.
    pub met_days: Vec<i32>,
}

/// Integer facts projected from bridge-only document metadata.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct MetadataFacts {
    pub non_empty_notes: u64,
    pub max_note_chars: u64,
    pub completed_readings: u64,
    pub completed_readings_with_hour: u64,
    pub max_bucket_members: u64,
    pub max_buckets_with_two_plus_in_tree: u64,
    pub max_thoughts_in_tree: u64,
    /// Bitmask of the 6 vertex kinds present in the workspace (bits 0..6).
    pub vertex_kinds_mask: u8,
    pub finished_deadline_on_time: bool,
    pub finished_deadline_photo_finish: bool,
    pub finished_deadline_seven_days_early: bool,
    pub finished_deadline_overdue: bool,
    pub has_ghost_whisperer: bool,
    pub has_finished_fish: bool,
    pub max_finished_in_one_day: u64,
    pub has_qed_vertex: bool,
    pub has_getting_on_track: bool,
    pub has_modus_ponens: bool,
    pub has_finished_forty_two: bool,
    pub concise_thoughts: u64,
    pub unicode_vertices: u64,
    pub has_schwa: bool,
    pub has_chomsky_hierarchy: bool,
    pub readings_with_notes: u64,
    pub has_minimal_pair: bool,
    pub has_ipa_symbol: bool,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct AchievementInput {
    pub today_local_day: i32,
    pub local_sessions: Vec<LocalSessionFact>,
    pub habit_facts: Vec<HabitFact>,
    pub metadata: MetadataFacts,
}
