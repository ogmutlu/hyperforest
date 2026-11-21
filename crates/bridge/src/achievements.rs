//! Bridge adapter for `hyperforest-achievements`: YAML slugs, presentation copy,
//! metadata projection, and WASM serialization.
use crate::document::{safe_number, Document, UnlockedAchievement};
use crate::vertex::Vertex;
use hyperforest_achievements as a;
use hyperforest_domain as d;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionCalendarInput {
    pub session_index: usize,
    pub local_day: i32,
    pub iso_week: i32,
    pub weekday: u8,
    pub start_minute: u16,
    pub end_minute: u16,
    pub touches_night: bool,
    pub duration_ms: u64,
    pub ended_at: u64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HabitCalendarInput {
    pub node_id: String,
    /// Strictly increasing local period boundaries covering this habit's history.
    pub period_boundaries: Vec<u64>,
    /// Strictly increasing local day boundaries covering this habit's history.
    pub day_boundaries: Vec<u64>,
    /// Local day index corresponding to `day_boundaries[0]`.
    pub first_day_index: i32,
    /// Local boundaries `[start, end)` of today.
    pub today_start: u64,
    pub today_end: u64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FinishedDayInput {
    pub count: u64,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarContext {
    pub today_local_day: i32,
    #[serde(default)]
    pub sessions: Vec<SessionCalendarInput>,
    #[serde(default)]
    pub habits: Vec<HabitCalendarInput>,
    #[serde(default)]
    pub finished_days: Vec<FinishedDayInput>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AchievementView {
    pub id: String,
    pub title: String,
    pub description: String,
    pub category: &'static str,
    pub tier: &'static str,
    pub icon: &'static str,
    pub hidden: bool,
    pub endless: bool,
    pub unit: &'static str,
    pub unlocked_at: Option<u64>,
    pub current: u64,
    pub target: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyWinView {
    pub id: &'static str,
    pub title: &'static str,
    pub description: &'static str,
    pub unit: &'static str,
    pub completed: bool,
    pub applicable: bool,
    pub current: u64,
    pub target: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvaluationView {
    pub core: Vec<AchievementView>,
    pub endless: Vec<AchievementView>,
    pub daily: Vec<DailyWinView>,
}

struct CoreMeta {
    slug: &'static str,
    title: &'static str,
    description: &'static str,
    category: &'static str,
    tier: &'static str,
    icon: &'static str,
    hidden: bool,
    unit: &'static str,
}

fn core_meta(id: a::CoreAchievement) -> CoreMeta {
    use a::CoreAchievement::*;
    let m = |slug, title, description, category, tier, icon, hidden, unit| CoreMeta {
        slug,
        title,
        description,
        category,
        tier,
        icon,
        hidden,
        unit,
    };
    match id {
        // Early cumulative focus
        FirstSpark => m("first_spark", "First Spark", "Save your very first focus session.", "focus", "bronze", "flame", false, "none"),
        QuarterHour => m("quarter_hour", "Quarter Hour", "Accumulate 15 minutes of saved focus.", "focus", "bronze", "play", false, "duration"),
        FirstHour => m("first_hour", "First Hour", "Accumulate 1 hour of saved focus.", "focus", "bronze", "play", false, "duration"),
        TwoHourMark => m("two_hour_mark", "Two-Hour Mark", "Accumulate 2 hours of saved focus.", "focus", "bronze", "play", false, "duration"),
        ThreeHourMark => m("three_hour_mark", "Three-Hour Mark", "Accumulate 3 hours of saved focus.", "focus", "bronze", "play", false, "duration"),
        // Daily initiation & bursts
        BreakingTheIce => m("breaking_the_ice", "Gavagai!", "Save a focus session on a hypertree within 24 hours of creating it.", "focus", "bronze", "tree", false, "none"),
        DoubleTap => m("double_tap", "Now There Are Two Wugs", "Save 2 separate focus sessions in a single day.", "focus", "bronze", "play", false, "count"),
        HatTrick => m("hat_trick", "Hat Trick", "Save 3 separate focus sessions in a single day.", "focus", "silver", "play", false, "count"),
        FiveSessionDay => m("five_session_day", "Five-Session Day", "Save 5 separate focus sessions in a single day.", "focus", "silver", "flame", false, "count"),
        DayAndNight => m("day_and_night", "Bouba & Kiki", "Focus both before noon and after 18:00 on the same day.", "focus", "bronze", "history", false, "none"),
        BeatYesterday => m("beat_yesterday", "Great Vowel Shift", "Focus more on a day than the active day right before it.", "focus", "bronze", "arrow", false, "none"),
        NewPersonalBest => m("new_personal_best", "New Personal Best", "Set a new longest single-session record after at least 5 saved sessions.", "focus", "silver", "trophy", false, "none"),
        // Single-session lengths
        ToeInTheWater => m("toe_in_the_water", "Toe in the Water", "Save a single focus session of at least 15 minutes.", "focus", "bronze", "play", false, "duration"),
        Pomodoro => m("pomodoro", "Pomodoro", "Save a single focus session of at least 25 minutes.", "focus", "bronze", "play", false, "duration"),
        LockedIn => m("locked_in", "Locked In", "Save a single focus session of at least 45 minutes.", "focus", "silver", "play", false, "duration"),
        DeepHour => m("deep_hour", "Deep Hour", "Save a single focus session of at least 60 minutes.", "focus", "silver", "flame", false, "duration"),
        UltradianWave => m("ultradian_wave", "Ultradian Wave", "Save a single focus session of at least 90 minutes.", "focus", "silver", "flame", false, "duration"),
        Hyperfocus => m("hyperfocus", "Hyperfocus", "Save a single focus session of at least 2 hours.", "focus", "gold", "flame", false, "duration"),
        InTheZone => m("in_the_zone", "In the Zone", "Save a single focus session of at least 3 hours.", "focus", "gold", "star", false, "duration"),
        MarathonMind => m("marathon_mind", "Marathon Mind", "Save a single focus session of at least 4 hours.", "focus", "platinum", "trophy", false, "duration"),
        // Single-day focus
        SolidHour => m("solid_hour", "Solid Hour", "Focus for at least 1 hour in a single day.", "focus", "bronze", "history", false, "duration"),
        GoodDay => m("good_day", "Good Day", "Focus for at least 2 hours in a single day.", "focus", "bronze", "history", false, "duration"),
        DedicatedDay => m("dedicated_day", "Dedicated Day", "Focus for at least 4 hours in a single day.", "focus", "silver", "history", false, "duration"),
        DeepWorkday => m("deep_workday", "Deep Workday", "Focus for at least 6 hours in a single day.", "focus", "gold", "flame", false, "duration"),
        FullShift => m("full_shift", "Full Shift", "Focus for at least 8 hours in a single day.", "focus", "gold", "trophy", false, "duration"),
        Overclocked => m("overclocked", "Overclocked", "Focus for at least 10 hours in a single calendar day.", "secret", "gold", "flame", true, "duration"),
        // Single goal / tree focus
        DiggingIn => m("digging_in", "Digging In", "Accumulate 1 hour of focus on a single vertex.", "focus", "bronze", "vertex", false, "duration"),
        GoingDeep => m("going_deep", "Going Deep", "Accumulate 5 hours of focus on a single vertex.", "focus", "silver", "vertex", false, "duration"),
        IronThrone => m("iron_throne", "Iron Throne", "Accumulate 25 hours of focus on a single hypertree.", "focus", "gold", "trophy", false, "duration"),
        // Consistency, forgiving windows & comebacks
        ThreeInARow => m("three_in_a_row", "Three in a Row", "Focus on 3 consecutive local calendar days.", "streaks", "bronze", "flame", false, "days"),
        FullWeek => m("full_week", "Full Week", "Focus on 7 consecutive local calendar days.", "streaks", "silver", "flame", false, "days"),
        UnbrokenFortnight => m("unbroken_fortnight", "Unbroken Fortnight", "Focus on 14 consecutive local calendar days.", "streaks", "silver", "flame", false, "days"),
        MonthlyRhythm => m("monthly_rhythm", "Monthly Rhythm", "Focus on 30 consecutive local calendar days.", "streaks", "gold", "trophy", false, "days"),
        FiveOfSeven => m("five_of_seven", "5 of 7", "Focus on at least 5 days within any 7-day window.", "streaks", "bronze", "calendar", false, "days"),
        SteadyMonth => m("steady_month", "Steady Month", "Focus on at least 20 days within any 30-day window.", "streaks", "gold", "calendar", false, "days"),
        WeekendWarrior => m("weekend_warrior", "Weekend Warrior", "Focus on both Saturday and Sunday of the same week.", "streaks", "bronze", "calendar", false, "none"),
        WeeklyRhythm => m("weekly_rhythm", "Weekly Rhythm", "Record focus in 4 consecutive calendar weeks.", "streaks", "silver", "calendar", false, "count"),
        SeasonOfFocus => m("season_of_focus", "Season of Focus", "Record focus in 12 consecutive calendar weeks.", "streaks", "gold", "trophy", false, "count"),
        BounceBack => m("bounce_back", "The Horse Raced Past the Barn Fell", "After a zero-focus gap day, build a fresh 3-day focus streak.", "streaks", "silver", "arrow", false, "none"),
        ComebackKid => m("comeback_kid", "Comeback Kid", "Return and save a focus session after a gap of 7 or more days.", "secret", "silver", "star", true, "none"),
        // Habits
        FirstCheck => m("first_check", "First Check", "Log your first habit repetition or value entry.", "habits", "bronze", "habit", false, "none"),
        HabitFormer => m("habit_former", "Habit Former", "Record 10 habit repetitions or value entries.", "habits", "bronze", "habit", false, "count"),
        TargetMet => m("target_met", "Target Met", "Meet any habit's target for a day, week, or month.", "habits", "bronze", "check", false, "none"),
        AssemblyLine => m("assembly_line", "Assembly Line", "Complete 3 different habits on the same day.", "habits", "silver", "habit", false, "count"),
        MeasuredProgress => m("measured_progress", "Measured Progress", "Meet a valued habit's threshold or upper bound.", "habits", "bronze", "habit", false, "none"),
        AboveAndBeyond => m("above_and_beyond", "Above & Beyond", "Reach at least 2x the target on a lower-bound numeric habit.", "habits", "silver", "star", false, "none"),
        WithinBounds => m("within_bounds", "Within Bounds", "Stay within an upper-bound habit's target for 7 consecutive periods.", "habits", "silver", "check", false, "count"),
        FiveOfSevenHabit => m("five_of_seven_habit", "5 of 7 Habit Days", "Meet a daily habit on at least 5 days within a 7-day window.", "habits", "bronze", "calendar", false, "days"),
        HabitStreak => m("habit_streak", "Habit Streak", "Meet a daily habit for 7 consecutive days.", "habits", "silver", "flame", false, "days"),
        IronDiscipline => m("iron_discipline", "Iron Discipline", "Meet a daily habit for 30 consecutive days.", "habits", "gold", "trophy", false, "days"),
        BeforeTheSun => m("before_the_sun", "Before the Sun", "Meet a time-of-day upper-bound habit at or before 06:00.", "secret", "silver", "deadline", true, "none"),
        // Graph craft, completion, readings & notes
        FirstSeed => m("first_seed", "First Seed", "Create your first hypertree.", "graph", "bronze", "tree", false, "none"),
        BranchingOut => m("branching_out", "Phrase Structure", "Have 10 vertices in your workspace.", "graph", "bronze", "vertex", false, "count"),
        LivingCanopy => m("living_canopy", "Rich Lexicon", "Have 50 vertices in your workspace.", "graph", "silver", "tree", false, "count"),
        ForestKeeper => m("forest_keeper", "Forest Keeper", "Grow 5 distinct hypertrees.", "graph", "gold", "tree", false, "count"),
        DeepRoots => m("deep_roots", "Deep Parse Tree", "Build a vertex chain of depth 5 or more in one hypertree.", "graph", "silver", "tree", false, "count"),
        HubOfIdeas => m("hub_of_ideas", "Polysemy Hub", "Give a single vertex 5 or more direct children.", "graph", "bronze", "vertex", false, "count"),
        Hyperlinked => m("hyperlinked", "Hyperlinked", "Link one hypertree inside another.", "graph", "bronze", "link", false, "none"),
        FullSpectrum => m("full_spectrum", "Sapir–Whorf", "Use all 6 vertex kinds in your workspace.", "graph", "silver", "palette", false, "count"),
        BucketBrigade => m("bucket_brigade", "Bucket Brigade", "Group 5 or more vertices inside a single bucket.", "graph", "bronze", "bucket", false, "count"),
        CircuitNetwork => m("circuit_network", "Circuit Network", "Maintain a pedantic hypertree using at least 3 distinct colors.", "graph", "silver", "palette", false, "none"),
        OneStepComplete => m("one_step_complete", "One Step Complete", "Finish your first subgoal.", "completion", "bronze", "finish", false, "none"),
        CleanDesk => m("clean_desk", "Clean Desk", "Finish every child of a vertex with at least 3 finished children.", "completion", "silver", "check", false, "none"),
        AheadOfSchedule => m("ahead_of_schedule", "Ahead of Schedule", "Finish a deadline vertex before its due time.", "completion", "bronze", "deadline", false, "none"),
        SubtreeSweep => m("subtree_sweep", "Subtree Sweep", "Finish a subtree of 5 or more vertices at once.", "completion", "silver", "finish", false, "count"),
        FirstNote => m("first_note", "Colorless Green Ideas", "Save a non-empty Markdown note on any vertex.", "notes", "bronze", "notes", false, "none"),
        FieldJournal => m("field_journal", "Fieldwork Corpus", "Write notes on 10 different vertices.", "notes", "silver", "notes", false, "count"),
        CoverToCover => m("cover_to_cover", "Cover to Cover", "Reach 100% progress on a reading vertex.", "notes", "silver", "reading", false, "none"),
        ResearchComplete => m("research_complete", "Close Reading", "Reach 100% progress on a reading vertex with at least 1 hour focused on it.", "notes", "silver", "reading", false, "none"),
        WellRead => m("well_read", "Philologist", "Reach 100% progress on 5 different reading vertices.", "notes", "gold", "reading", false, "count"),
        // Factorio, ADHD & formal-methods Easter eggs
        GettingOnTrack => m("getting_on_track", "Getting on Track Like a Pro", "Create a hypertree, add a vertex, write a note, and save focus within 15 minutes.", "secret", "silver", "star", true, "none"),
        LazyBastard => m("lazy_bastard", "Lazy Bastard", "Accumulate 10+ hours of focus with 5 or fewer vertices in the whole workspace.", "secret", "gold", "trophy", true, "none"),
        ForestMustGrow => m("forest_must_grow", "The Forest Must Grow", "Grow a workspace to 100+ vertices across 5+ hypertrees.", "graph", "gold", "tree", false, "none"),
        MainBus => m("main_bus", "Main Bus", "Place 3 or more linked-hypertree vertices inside a single hypertree.", "graph", "silver", "link", false, "count"),
        LogisticsNetwork => m("logistics_network", "Logistics Network", "Have 3 or more buckets in one hypertree, each holding at least 2 vertices.", "graph", "silver", "bucket", false, "count"),
        SpaghettiBase => m("spaghetti_base", "Spaghetti Base", "Have 10+ disconnected non-annotation vertices in one hypertree with pedantic off.", "secret", "bronze", "vertex", true, "count"),
        RefactorSpaghetti => m("refactor_spaghetti", "Refactor the Spaghetti", "Enable pedantic mode on a hypertree with 10+ active non-annotation vertices.", "secret", "silver", "check", true, "none"),
        WatchYourStep => m("watch_your_step", "Watch Your Step", "Save a focus session after 5+ pauses — derailed, got back up, still finished.", "secret", "bronze", "pause", true, "none"),
        ThereIsNoSpoon => m("there_is_no_spoon", "There Is No Spoon", "Finish a deadline vertex at least 7 days before its due time.", "secret", "gold", "deadline", true, "none"),
        NoTimeForChitChat => m("no_time_for_chit_chat", "No Time for Chit-Chat", "Finish 5 or more subgoals in a single calendar day.", "completion", "silver", "finish", false, "count"),
        SteamAllTheWay => m("steam_all_the_way", "Steam All the Way", "Save 10 focus sessions of at least 15 minutes with zero pauses.", "secret", "silver", "flame", true, "count"),
        BetterLateThanNever => m("better_late_than_never", "Better Late Than Never", "Finish a deadline vertex even after it went overdue.", "secret", "bronze", "finish", true, "none"),
        ThanksForTheFish => m("thanks_for_the_fish", "So Long and Thanks for All the Fish", "Name a vertex \"Fish\" and finish it.", "secret", "bronze", "star", true, "none"),
        Squirrel => m("squirrel", "Squirrel!", "Save focus sessions on 4 or more different vertices in a single day.", "secret", "bronze", "vertex", true, "count"),
        BrainDump => m("brain_dump", "Brain Dump", "Create 5 or more thought cards in one hypertree.", "secret", "bronze", "thought", true, "count"),
        YakShaving => m("yak_shaving", "Yak Shaving", "Build a vertex chain of depth 6 or more in a single hypertree.", "secret", "silver", "tree", true, "count"),
        RubberDuck => m("rubber_duck", "Rubber Duck", "Write a single Markdown note of at least 1,000 characters.", "secret", "bronze", "notes", true, "count"),
        StrictFormalist => m("strict_formalist", "Strict Formalist", "Maintain a pedantic hypertree with 10+ active vertices and overlapping multi-color hyperedges.", "secret", "gold", "palette", true, "none"),
        TransitiveClosure => m("transitive_closure", "Transitive Closure", "Build a link chain of 3 hypertrees (A → B → C).", "secret", "silver", "link", true, "none"),
        Qed => m("qed", "Q.E.D.", "Finish a vertex with at least 5 hours of saved focus and non-empty notes.", "secret", "gold", "trophy", true, "none"),
        NightOwl => m("night_owl", "Night Owl", "Focus between 00:00 and 04:00 local time.", "secret", "silver", "history", true, "none"),
        EarlyBird => m("early_bird", "Early Bird", "Start a focus session before 06:30 local time.", "secret", "silver", "history", true, "none"),
        PhotoFinish => m("photo_finish", "Photo Finish", "Finish a deadline vertex with less than 1 hour left before its due time.", "secret", "gold", "deadline", true, "none"),
        GhostWhisperer => m("ghost_whisperer", "Ghost Whisperer", "Enable finished ghosts on a hypertree with 10 or more finished vertices.", "secret", "bronze", "finish", true, "none"),
        ModusPonens => m("modus_ponens", "Modus Ponens", "Finish a vertex with \"Lemma\", \"Theorem\", or \"Proof\" in its title.", "secret", "bronze", "check", true, "none"),
        AxiomOfChoice => m("axiom_of_choice", "Axiom of Choice", "Maintain at least 3 hypertrees with 10 or more vertices each.", "secret", "silver", "tree", true, "count"),
        FixedPoint => m("fixed_point", "Fixed Point", "Save a focus session whose duration matches the vertex's estimate to the exact minute.", "secret", "silver", "star", true, "none"),
        HaltingProblem => m("halting_problem", "Solved the Halting Problem", "Finish a vertex after accumulating at least 10 hours of focus on it.", "secret", "gold", "trophy", true, "none"),
        MidnightOil => m("midnight_oil", "Burning the Midnight Oil", "Save a focus session that crosses local midnight.", "secret", "silver", "flame", true, "none"),
        PowerLunch => m("power_lunch", "Power Lunch", "Save a 25+ minute focus session starting between 12:00 and 14:00.", "secret", "bronze", "play", true, "none"),
        JustFiveMinutes => m("just_five_minutes", "Just Five Minutes", "Save a short focus session between 1 and 5 minutes — starting is the hardest part.", "secret", "bronze", "flame", true, "none"),
        RabbitHole => m("rabbit_hole", "Down the Rabbit Hole", "Write a single Markdown note of at least 5,000 characters.", "secret", "silver", "notes", true, "count"),
        ZeroInbox => m("zero_inbox", "Zero Inbox", "Finish every child vertex in a hypertree with at least 5 finished subgoals.", "secret", "gold", "finish", true, "none"),
        Polymath => m("polymath", "Polymath", "Record saved focus across at least 5 different hypertrees.", "secret", "silver", "tree", true, "count"),
        WeekendScholar => m("weekend_scholar", "Weekend Scholar", "Focus for at least 4 hours on a Saturday or Sunday.", "secret", "silver", "calendar", true, "duration"),
        FortyTwo => m("forty_two", "The Answer to Everything", "Save a 42-minute focus session or finish a vertex named \"42\".", "secret", "bronze", "star", true, "none"),
        // Consecutive high-focus-day combos (forgiving up to 1 rest day off)
        OrangeStreak3 => m("orange_streak_3", "Warming Up (2h × 3d)", "Hit 2.0+ hours of focus on 3 days in a row (1 rest day off forgiven).", "streaks", "bronze", "flame", false, "days"),
        YellowStreak3 => m("yellow_streak_3", "Golden Run (4h × 3d)", "Hit 4.0+ hours of focus on 3 days in a row (1 rest day off forgiven).", "streaks", "silver", "flame", false, "days"),
        GreenStreak3 => m("green_streak_3", "In the Green (5h × 3d)", "Hit 5.0+ hours of focus on 3 days in a row (1 rest day off forgiven).", "streaks", "silver", "flame", false, "days"),
        GreenStreak5 => m("green_streak_5", "Green Workweek (5h × 5d)", "Hit 5.0+ hours of focus on 5 days in a row (1 rest day off forgiven).", "streaks", "gold", "trophy", false, "days"),
        GreenStreak7 => m("green_streak_7", "Emerald Week (5h × 7d)", "Hit 5.0+ hours of focus on 7 days in a row (1 rest day off forgiven).", "secret", "platinum", "trophy", true, "days"),
        CyanStreak3 => m("cyan_streak_3", "Cyan Wave (6h × 3d)", "Hit 6.0+ hours of focus on 3 days in a row (1 rest day off forgiven).", "streaks", "gold", "flame", false, "days"),
        BlueStreak3 => m("blue_streak_3", "Blue Horizon (7.5h × 3d)", "Hit 7.5+ hours of focus on 3 days in a row (1 rest day off forgiven).", "streaks", "platinum", "trophy", false, "days"),
        // Discoverable linguistics secret achievements
        GricesMaxim => m("grices_maxim", "Grice's Maxim of Brevity", "Keep at least 3 thought cards crisp and concise (under 40 characters each).", "secret", "bronze", "thought", true, "count"),
        TowerOfBabel => m("tower_of_babel", "Tower of Babel", "Use non-ASCII script or diacritics across at least 3 different vertices.", "secret", "silver", "tree", true, "count"),
        Schwa => m("schwa", "Unstressed Schwa (ə)", "Use the IPA schwa character \"ə\" in a vertex title or Markdown note.", "secret", "bronze", "notes", true, "none"),
        ChomskyHierarchy => m("chomsky_hierarchy", "Chomsky Hierarchy", "Finish a vertex about Syntax, Semantics, Morphology, Phonology, Pragmatics, or Context-Free Grammar.", "secret", "silver", "check", true, "none"),
        RosettaStone => m("rosetta_stone", "Rosetta Stone", "Attach Markdown notes to at least 3 different reading vertices.", "secret", "silver", "reading", true, "count"),
        MinimalPair => m("minimal_pair", "Minimal Pair", "Create two sibling vertices of the same length (3+ chars) that differ by exactly one letter.", "secret", "silver", "vertex", true, "none"),
        GlottalStop => m("glottal_stop", "Glottal Stop (ʔ)", "Use an IPA phonetic symbol (such as ʔ, ŋ, ʃ, ʒ, θ, ð, ɛ, ɔ, ɪ, ʊ) in a title or note.", "secret", "bronze", "notes", true, "none"),
    }
}

fn series_slug(series: a::MilestoneSeries) -> &'static str {
    match series {
        a::MilestoneSeries::FocusHours => "focus_hours",
        a::MilestoneSeries::FocusSessions => "sessions",
        a::MilestoneSeries::PomodoroPacks => "pomodoros",
        a::MilestoneSeries::ActiveDays => "active_days",
        a::MilestoneSeries::SolidDays => "solid_days",
        a::MilestoneSeries::FinishedGoals => "finished",
        a::MilestoneSeries::MetHabitDays => "habit_days",
        a::MilestoneSeries::YellowCombos => "yellow_combos",
        a::MilestoneSeries::GreenCombos => "green_combos",
        a::MilestoneSeries::GreenWorkweeks => "green_workweeks",
        a::MilestoneSeries::DeepDoubles => "deep_doubles",
        a::MilestoneSeries::DeepWorkweeks => "deep_workweeks",
    }
}

fn parse_series(name: &str) -> Option<a::MilestoneSeries> {
    match name {
        "focus_hours" => Some(a::MilestoneSeries::FocusHours),
        "sessions" => Some(a::MilestoneSeries::FocusSessions),
        "pomodoros" => Some(a::MilestoneSeries::PomodoroPacks),
        "active_days" => Some(a::MilestoneSeries::ActiveDays),
        "solid_days" => Some(a::MilestoneSeries::SolidDays),
        "finished" => Some(a::MilestoneSeries::FinishedGoals),
        "habit_days" => Some(a::MilestoneSeries::MetHabitDays),
        "yellow_combos" => Some(a::MilestoneSeries::YellowCombos),
        "green_combos" => Some(a::MilestoneSeries::GreenCombos),
        "green_workweeks" => Some(a::MilestoneSeries::GreenWorkweeks),
        "deep_doubles" => Some(a::MilestoneSeries::DeepDoubles),
        "deep_workweeks" => Some(a::MilestoneSeries::DeepWorkweeks),
        _ => None,
    }
}

pub fn slug_of(id: a::AchievementId) -> String {
    match id {
        a::AchievementId::Core(c) => core_meta(c).slug.into(),
        a::AchievementId::Endless { series, milestone } => {
            format!("endless:{}:{milestone}", series_slug(series))
        }
    }
}

pub fn parse_slug(slug: &str) -> Option<a::AchievementId> {
    if let Some(rest) = slug.strip_prefix("endless:") {
        let (series_str, num_str) = rest.split_once(':')?;
        let series = parse_series(series_str)?;
        let milestone: u64 = num_str.parse().ok()?;
        let step = series.step();
        if milestone == 0 || !milestone.is_multiple_of(step) {
            return None;
        }
        return Some(a::AchievementId::Endless { series, milestone });
    }
    for &c in a::ALL_CORE {
        if core_meta(c).slug == slug {
            return Some(a::AchievementId::Core(c));
        }
    }
    None
}

fn endless_view(progress: a::AchievementProgress) -> AchievementView {
    let a::AchievementId::Endless { series, milestone } = progress.id else {
        unreachable!()
    };
    let (title, description, category, icon, unit, tier) = match series {
        a::MilestoneSeries::FocusHours => {
            let tier = if milestone >= 250 {
                "platinum"
            } else if milestone >= 50 {
                "gold"
            } else if milestone >= 25 {
                "silver"
            } else {
                "bronze"
            };
            let title = match milestone {
                5 => "Hello, World! (5h)".into(),
                10 => "Bilingual Brain (10h)".into(),
                15 => "No Ambiguity Here (15h)".into(),
                20 => "Tail-Call Optimized (20h)".into(),
                25 => "Never Lost in Translation (25h)".into(),
                30 => "Well-Formed Formula (30h)".into(),
                35 => "Voiced & Unvoiced (35h)".into(),
                40 => "Deep Structure, Deeper Focus (40h)".into(),
                45 => "Stacking Lemmas (45h)".into(),
                50 => "Halfway to Fluency (50h)".into(),
                55 => "Consonant Cluster (55h)".into(),
                60 => "Church–Rosser Flow (60h)".into(),
                65 => "Etymological Roots (65h)".into(),
                70 => "Type-Checked Mind (70h)".into(),
                75 => "Beta-Reduced to Perfection (75h)".into(),
                80 => "Polysynthetic Focus (80h)".into(),
                85 => "Curry–Howard Harmony (85h)".into(),
                90 => "Prosodic Mastery (90h)".into(),
                95 => "Near the Fixed Point (95h)".into(),
                100 => "Fluent in Flow (100h)".into(),
                125 => "Polyglot Scholar (125h)".into(),
                150 => "Zero Sorries Left (150h)".into(),
                200 => "Turing Would Be Proud (200h)".into(),
                250 => "Living Dictionary (250h)".into(),
                300 => "Sound Law Legend (300h)".into(),
                500 => "Keeper of Dead Languages (500h)".into(),
                750 => "Grand Formalist (750h)".into(),
                1000 => "The Factory Must Grow (1000h)".into(),
                h => {
                    const ENDLESS_HOUR_RANKS: &[&str] = &[
                        "Recursive Flow",
                        "Lexical Drift",
                        "Lambda Rhythm",
                        "Diachronic Depth",
                        "Proof Momentum",
                        "Morphological Mastery",
                        "Semantic Reach",
                        "Compiled Wisdom",
                        "Phonemic Precision",
                        "Axiomatic Grit",
                        "Living Dialect",
                        "Formal Elegance",
                        "Corpus Colossus",
                        "Unbroken Thread",
                        "Universal Grammar",
                        "Infinite Tape",
                    ];
                    let step_idx = (h / 5) as usize;
                    let rank = ENDLESS_HOUR_RANKS[step_idx % ENDLESS_HOUR_RANKS.len()];
                    let cycle = step_idx / ENDLESS_HOUR_RANKS.len() + 1;
                    format!("{rank} {cycle} ({h}h)")
                }
            };
            (
                title,
                format!("Accumulate {milestone} total hours of saved focus."),
                "focus",
                "flame",
                "duration",
                tier,
            )
        }
        a::MilestoneSeries::FocusSessions => (
            match milestone {
                10 => "First Conversation (10)".into(),
                20 => "Code-Switching Pro (20)".into(),
                30 => "No Stack Overflow Here (30)".into(),
                50 => "Corpus of One (50)".into(),
                100 => "Mother Tongue of Focus (100)".into(),
                200 => "Infinite Tape (200)".into(),
                m => format!("{m} Focus Sessions"),
            },
            format!("Record {milestone} saved focus sessions."),
            "focus",
            "play",
            "count",
            if milestone >= 200 {
                "platinum"
            } else if milestone >= 100 {
                "gold"
            } else if milestone >= 30 {
                "silver"
            } else {
                "bronze"
            },
        ),
        a::MilestoneSeries::PomodoroPacks => (
            match milestone {
                5 => "Five-Syllable Haiku (5)".into(),
                10 => "Clockwork Linguist (10)".into(),
                25 => "Iambic Pentameter (25)".into(),
                50 => "Overclocked Brain (50)".into(),
                100 => "Metronome of the Gods (100)".into(),
                m => format!("{m} Pomodoros"),
            },
            format!("Complete {milestone} focus sessions of 25 minutes or longer."),
            "focus",
            "play",
            "count",
            if milestone >= 100 {
                "platinum"
            } else if milestone >= 50 {
                "gold"
            } else if milestone >= 15 {
                "silver"
            } else {
                "bronze"
            },
        ),
        a::MilestoneSeries::ActiveDays => (
            match milestone {
                5 => "Daily Dialect (5d)".into(),
                15 => "while (true) focus(); (15d)".into(),
                30 => "Language Evolution (30d)".into(),
                50 => "Oral Tradition (50d)".into(),
                100 => "Carved in Stone (100d)".into(),
                m => format!("{m} Active Days"),
            },
            format!("Record saved focus on {milestone} distinct calendar days."),
            "streaks",
            "calendar",
            "days",
            if milestone >= 100 {
                "platinum"
            } else if milestone >= 50 {
                "gold"
            } else if milestone >= 15 {
                "silver"
            } else {
                "bronze"
            },
        ),
        a::MilestoneSeries::SolidDays => (
            match milestone {
                5 => "Strong Verb Energy (5d)".into(),
                15 => "Proof by Induction (15d)".into(),
                30 => "Unshifted Vowels (30d)".into(),
                50 => "Sound Law Abiding (50d)".into(),
                100 => "Gold-Standard Corpus (100d)".into(),
                m => format!("{m} Solid Days"),
            },
            format!("Focus for at least 1 hour on {milestone} distinct days."),
            "streaks",
            "flame",
            "days",
            if milestone >= 100 {
                "platinum"
            } else if milestone >= 50 {
                "gold"
            } else if milestone >= 15 {
                "silver"
            } else {
                "bronze"
            },
        ),
        a::MilestoneSeries::FinishedGoals => (
            match milestone {
                5 => "Case Closed (5)".into(),
                15 => "Q.E.D., Next Lemma! (15)".into(),
                30 => "Zero Loose Ends (30)".into(),
                50 => "Unabridged Edition (50)".into(),
                100 => "Formally Verified Life (100)".into(),
                m => format!("{m} Goals Finished"),
            },
            format!("Finish {milestone} subgoals across your hyperforest."),
            "completion",
            "finish",
            "count",
            if milestone >= 100 {
                "platinum"
            } else if milestone >= 50 {
                "gold"
            } else if milestone >= 15 {
                "silver"
            } else {
                "bronze"
            },
        ),
        a::MilestoneSeries::MetHabitDays => (
            match milestone {
                10 => "Second Nature (10d)".into(),
                30 => "Deterministic Automaton (30d)".into(),
                50 => "Native Speaker (50d)".into(),
                100 => "Idempotent Human (100d)".into(),
                m => format!("{m} Habit Days Met"),
            },
            format!("Meet habit targets across {milestone} habit-days."),
            "habits",
            "habit",
            "days",
            if milestone >= 200 {
                "platinum"
            } else if milestone >= 100 {
                "gold"
            } else if milestone >= 30 {
                "silver"
            } else {
                "bronze"
            },
        ),
        a::MilestoneSeries::YellowCombos => (
            if progress.unlocked_at.is_some() {
                format!("Sunlit Combo #{milestone} (4h+)")
            } else {
                format!("Sunlit Streak (4h+ × {}d)", progress.target)
            },
            if progress.unlocked_at.is_some() {
                "Earned by reaching or extending a 4.0h+ focus combo (strict daily extension after 3d)."
                    .into()
            } else {
                format!(
                    "Reach {} days in a 4.0h+ focus combo (1 off-day forgiven up to 3d; strict daily extension after).",
                    progress.target
                )
            },
            "streaks",
            "flame",
            "days",
            if milestone >= 15 {
                "platinum"
            } else if milestone >= 7 {
                "gold"
            } else if milestone >= 3 {
                "silver"
            } else {
                "bronze"
            },
        ),
        a::MilestoneSeries::GreenCombos => (
            if progress.unlocked_at.is_some() {
                format!("Emerald Combo #{milestone} (5h+)")
            } else {
                format!("Emerald Streak (5h+ × {}d)", progress.target)
            },
            if progress.unlocked_at.is_some() {
                "Earned by reaching or extending a 5.0h+ focus combo (strict daily extension after 3d)."
                    .into()
            } else {
                format!(
                    "Reach {} days in a 5.0h+ focus combo (1 off-day forgiven up to 3d; strict daily extension after).",
                    progress.target
                )
            },
            "streaks",
            "flame",
            "days",
            if milestone >= 15 {
                "platinum"
            } else if milestone >= 7 {
                "gold"
            } else if milestone >= 3 {
                "silver"
            } else {
                "bronze"
            },
        ),
        a::MilestoneSeries::GreenWorkweeks => (
            format!("Green Workweek #{milestone} (5h+ × 5d)"),
            format!(
                "Complete {milestone} non-overlapping 5h+ × 5-day focus runs (1 rest day off forgiven)."
            ),
            "streaks",
            "trophy",
            "count",
            if milestone >= 10 {
                "platinum"
            } else if milestone >= 5 {
                "gold"
            } else if milestone >= 2 {
                "silver"
            } else {
                "bronze"
            },
        ),
        a::MilestoneSeries::DeepDoubles => (
            if progress.unlocked_at.is_some() {
                format!("Turquoise Combo #{milestone} (7h+)")
            } else {
                format!("Turquoise Streak (7h+ × {}d)", progress.target)
            },
            if progress.unlocked_at.is_some() {
                "Earned by reaching or extending a 7.0h+ focus combo (strict daily extension after 2d)."
                    .into()
            } else {
                format!(
                    "Reach {} days in a 7.0h+ focus combo (1 off-day forgiven up to 2d; strict daily extension after).",
                    progress.target
                )
            },
            "streaks",
            "flame",
            "days",
            if milestone >= 10 {
                "platinum"
            } else if milestone >= 5 {
                "gold"
            } else if milestone >= 2 {
                "silver"
            } else {
                "bronze"
            },
        ),
        a::MilestoneSeries::DeepWorkweeks => (
            format!("Deep Focus Week #{milestone} (7h+ × 5d)"),
            format!(
                "Complete {milestone} non-overlapping 7h+ × 5-day focus runs (1 rest day off forgiven)."
            ),
            "streaks",
            "trophy",
            "count",
            if milestone >= 5 {
                "platinum"
            } else if milestone >= 2 {
                "gold"
            } else {
                "silver"
            },
        ),
    };
    AchievementView {
        id: slug_of(progress.id),
        title,
        description,
        category,
        tier,
        icon,
        hidden: false,
        endless: true,
        unit,
        unlocked_at: progress.unlocked_at,
        current: progress.current,
        target: progress.target,
    }
}

fn daily_view(progress: a::DailyProgress) -> DailyWinView {
    use a::DailyMilestone::*;
    let (id, title, description, unit) = match progress.id {
        FirstSparkToday => (
            "daily:first_spark",
            "First Spark",
            "Save your first focus session today.",
            "none",
        ),
        QuarterHourToday => (
            "daily:quarter_hour",
            "15m Today",
            "Focus for 15 minutes today.",
            "duration",
        ),
        HalfHourToday => (
            "daily:half_hour",
            "30m Today",
            "Focus for 30 minutes today.",
            "duration",
        ),
        FirstHourToday => (
            "daily:first_hour",
            "1h Today",
            "Focus for 1 hour today.",
            "duration",
        ),
        TwoHoursToday => (
            "daily:two_hours",
            "2h Today",
            "Focus for 2 hours today.",
            "duration",
        ),
        ThreeHoursToday => (
            "daily:three_hours",
            "3h Today",
            "Focus for 3 hours today.",
            "duration",
        ),
        FourHoursToday => (
            "daily:four_hours",
            "4h Today",
            "Focus for 4 hours today.",
            "duration",
        ),
        FiveHoursToday => (
            "daily:five_hours",
            "5h Today",
            "Focus for 5 hours today.",
            "duration",
        ),
        SixHoursToday => (
            "daily:six_hours",
            "6h Today",
            "Focus for 6 hours today.",
            "duration",
        ),
        SevenHoursToday => (
            "daily:seven_hours",
            "7h Today",
            "Focus for 7 hours today.",
            "duration",
        ),
        DoubleTapToday => (
            "daily:double_tap",
            "Double Tap",
            "Save 2 focus sessions today.",
            "count",
        ),
        HabitCheckToday => (
            "daily:habit_check",
            "Habit Check",
            "Complete at least 1 habit today.",
            "none",
        ),
    };
    DailyWinView {
        id,
        title,
        description,
        unit,
        completed: progress.completed,
        applicable: progress.applicable,
        current: progress.current,
        target: progress.target,
    }
}

fn build_input(
    document: &Document,
    state: &d::State,
    ctx: &CalendarContext,
) -> Result<a::AchievementInput, String> {
    let snapshot = state.snapshot();
    let local_sessions = ctx
        .sessions
        .iter()
        .map(|s| a::LocalSessionFact {
            session_index: s.session_index,
            local_day: s.local_day,
            iso_week: s.iso_week,
            weekday: s.weekday,
            start_minute: s.start_minute,
            end_minute: s.end_minute,
            touches_night: s.touches_night,
            duration_ms: s.duration_ms,
            ended_at: s.ended_at,
        })
        .collect();

    // Build habit facts via `hyperforest_domain::habit::evaluate_periods`
    let mut habit_facts = Vec::new();
    for (idx, node) in snapshot.nodes.iter().enumerate() {
        let Some(habit) = node.habit.as_ref() else {
            continue;
        };
        let doc_id = &document.nodes[idx].id;
        let h_ctx = ctx.habits.iter().find(|h| h.node_id == *doc_id);
        let total_logs = match habit.measure {
            None => habit.completions.len() as u64,
            Some(_) => habit.entries.len() as u64,
        };
        let mut met_periods = 0_u64;
        let mut best_period_streak = 0_u64;
        let mut best_daily_streak = 0_u64;
        let mut best_rolling_5_of_7 = 0_u64;
        let mut has_double_target = false;
        let mut has_before_six_am = false;
        let mut met_today = false;
        let mut met_days = Vec::new();

        if let Some(measure) = habit.measure {
            if measure.value_kind == d::HabitValueKind::TimeOfDay
                && measure.bound == d::HabitBound::AtMost
                && habit
                    .entries
                    .iter()
                    .any(|e| e.value <= measure.target && e.value <= 6 * 60)
            {
                has_before_six_am = true;
            }
        }

        if let Some(hc) = h_ctx {
            if habit.interval == d::HabitInterval::Custom {
                if hc.day_boundaries.len() >= 2 {
                    if let Ok(day_statuses) = d::habit::evaluate_periods(habit, &hc.day_boundaries)
                    {
                        let scheduled: Vec<_> = day_statuses
                            .iter()
                            .enumerate()
                            .filter(|(offset, _)| {
                                let day_idx = hc.first_day_index + *offset as i32;
                                let weekday = (day_idx + 3).rem_euclid(7) as u8;
                                (habit.weekdays & (1 << weekday)) != 0
                            })
                            .map(|(_, st)| *st)
                            .collect();
                        let summary = d::habit::summarize_streaks(&scheduled);
                        met_periods = summary.met_count;
                        best_period_streak = summary.best;
                        if let Some(measure) = habit.measure {
                            if measure.value_kind == d::HabitValueKind::Number
                                && measure.bound == d::HabitBound::AtLeast
                            {
                                if let Some(double_target) = measure.target.checked_mul(2) {
                                    if measure.aggregate == d::HabitAggregate::Sum {
                                        has_double_target = scheduled.iter().any(|s| {
                                            s.state == d::habit::CompletionState::Met
                                                && s.total_value >= double_target
                                        });
                                    } else {
                                        has_double_target =
                                            habit.entries.iter().any(|e| e.value >= double_target);
                                    }
                                }
                            }
                        }
                    }
                }
            } else if hc.period_boundaries.len() >= 2 {
                if let Ok(statuses) = d::habit::evaluate_periods(habit, &hc.period_boundaries) {
                    let summary = d::habit::summarize_streaks(&statuses);
                    met_periods = summary.met_count;
                    best_period_streak = summary.best;
                    if let Some(measure) = habit.measure {
                        if measure.value_kind == d::HabitValueKind::Number
                            && measure.bound == d::HabitBound::AtLeast
                        {
                            if let Some(double_target) = measure.target.checked_mul(2) {
                                if measure.aggregate == d::HabitAggregate::Sum {
                                    has_double_target = statuses.iter().any(|s| {
                                        s.state == d::habit::CompletionState::Met
                                            && s.total_value >= double_target
                                    });
                                } else {
                                    has_double_target =
                                        habit.entries.iter().any(|e| e.value >= double_target);
                                }
                            }
                        }
                    }
                }
            }
            if hc.day_boundaries.len() >= 2 {
                if let Ok(day_statuses) = d::habit::evaluate_periods(habit, &hc.day_boundaries) {
                    if habit.interval == d::HabitInterval::Day {
                        let summary = d::habit::summarize_streaks(&day_statuses);
                        best_daily_streak = summary.best;
                    }
                    for (offset, st) in day_statuses.iter().enumerate() {
                        if st.state == d::habit::CompletionState::Met {
                            met_days.push(hc.first_day_index + offset as i32);
                        }
                    }
                    if habit.interval == d::HabitInterval::Day {
                        // Best rolling 7-day window of met days
                        for i in 0..met_days.len() {
                            let mut count = 0_u64;
                            let mut back = i;
                            loop {
                                if met_days[i] - met_days[back] < 7 {
                                    count += 1;
                                } else {
                                    break;
                                }
                                if back == 0 {
                                    break;
                                }
                                back -= 1;
                            }
                            if count > best_rolling_5_of_7 {
                                best_rolling_5_of_7 = count;
                            }
                        }
                    }
                }
            }
            if hc.today_end > hc.today_start {
                if let Ok(today_status) =
                    d::habit::evaluate_period(habit, hc.today_start, hc.today_end)
                {
                    met_today = today_status.state == d::habit::CompletionState::Met;
                }
            }
        }

        habit_facts.push(a::HabitFact {
            active: node.finished_at.is_none(),
            is_valued: habit.measure.is_some(),
            is_at_most: habit
                .measure
                .is_some_and(|m| m.bound == d::HabitBound::AtMost),
            total_logs,
            met_periods,
            best_period_streak,
            best_daily_streak,
            best_rolling_5_of_7,
            has_double_target,
            has_before_six_am,
            met_today,
            met_days,
        });
    }

    let metadata = extract_metadata(document, snapshot, ctx);

    Ok(a::AchievementInput {
        today_local_day: ctx.today_local_day,
        local_sessions,
        habit_facts,
        metadata,
    })
}

fn extract_metadata(
    document: &Document,
    snapshot: &d::Snapshot,
    ctx: &CalendarContext,
) -> a::MetadataFacts {
    let mut meta = a::MetadataFacts::default();
    let mut vertex_focus: Vec<(&str, u64)> = Vec::new();
    for session in &document.sessions {
        if let Some(entry) = vertex_focus
            .iter_mut()
            .find(|(id, _)| *id == session.node_id.as_str())
        {
            entry.1 = entry.1.saturating_add(session.duration_ms);
        } else {
            vertex_focus.push((session.node_id.as_str(), session.duration_ms));
        }
    }
    let focus_of = |id: &str| {
        vertex_focus
            .iter()
            .find(|(k, _)| *k == id)
            .map_or(0, |(_, ms)| *ms)
    };

    for node in &document.nodes {
        let trimmed = node.notes.trim();
        if node.title.contains('ə') || node.notes.contains('ə') {
            meta.has_schwa = true;
        }
        if node
            .title
            .chars()
            .chain(node.notes.chars())
            .any(|c| "ʔŋʃʒθðɲɾʁɬɐɪʊɔɛ".contains(c))
        {
            meta.has_ipa_symbol = true;
        }
        if !node.title.is_ascii() {
            meta.unicode_vertices += 1;
        }
        if let Vertex::Thought { text } = &node.vertex {
            let body = text.as_deref().unwrap_or(&node.title).trim();
            let len = body.chars().count();
            if len > 0 && len <= 40 {
                meta.concise_thoughts += 1;
            }
        }
        if !trimmed.is_empty() {
            meta.non_empty_notes += 1;
            let chars = node.notes.chars().count() as u64;
            if chars > meta.max_note_chars {
                meta.max_note_chars = chars;
            }
            if matches!(node.vertex, Vertex::Reading { .. }) {
                meta.readings_with_notes += 1;
            }
        }
        let bit = match &node.vertex {
            Vertex::Vanilla => 0,
            Vertex::Deadline { .. } => 1,
            Vertex::Bucket => 2,
            Vertex::Thought { .. } => 3,
            Vertex::Reading { .. } => 4,
            Vertex::Habit { .. } => 5,
        };
        meta.vertex_kinds_mask |= 1 << bit;

        if let Vertex::Reading {
            progress_percent,
            pages_read,
            total_pages,
            ..
        } = &node.vertex
        {
            let done = *progress_percent >= 100.0
                || total_pages.is_some_and(|total| total > 0 && *pages_read >= total);
            if done {
                meta.completed_readings += 1;
                if focus_of(&node.id) >= a::HOUR_MS {
                    meta.completed_readings_with_hour += 1;
                }
            }
        }

        if let Some(finished_at) = node.finished_at {
            let trimmed_title = node.title.trim();
            if trimmed_title.eq_ignore_ascii_case("fish") {
                meta.has_finished_fish = true;
            }
            if trimmed_title == "42" {
                meta.has_finished_forty_two = true;
            }
            let lower_title = trimmed_title.to_ascii_lowercase();
            if lower_title.contains("lemma")
                || lower_title.contains("theorem")
                || lower_title.contains("proof")
            {
                meta.has_modus_ponens = true;
            }
            if lower_title.contains("syntax")
                || lower_title.contains("semantics")
                || lower_title.contains("morphology")
                || lower_title.contains("phonology")
                || lower_title.contains("pragmatics")
                || lower_title.contains("context-free")
            {
                meta.has_chomsky_hierarchy = true;
            }
            if !trimmed.is_empty() && focus_of(&node.id) >= 5 * a::HOUR_MS {
                meta.has_qed_vertex = true;
            }
            if let Vertex::Deadline { deadline_at } = node.vertex {
                if finished_at <= deadline_at {
                    meta.finished_deadline_on_time = true;
                    let remaining = deadline_at - finished_at;
                    if remaining < a::HOUR_MS {
                        meta.finished_deadline_photo_finish = true;
                    }
                    if remaining >= 7 * 24 * a::HOUR_MS {
                        meta.finished_deadline_seven_days_early = true;
                    }
                } else {
                    meta.finished_deadline_overdue = true;
                }
            }
        }

        if matches!(node.vertex, Vertex::Bucket) {
            let members = document
                .nodes
                .iter()
                .filter(|other| other.bucket_id.as_deref() == Some(node.id.as_str()))
                .count() as u64;
            if members > meta.max_bucket_members {
                meta.max_bucket_members = members;
            }
        }
    }

    // Minimal Pair: two sibling vertices in the same hypertree with same char length >= 3
    // differing by exactly one character (case-insensitive).
    'minimal: for i in 0..document.nodes.len() {
        let a = &document.nodes[i];
        let a_chars: Vec<char> = a.title.trim().to_lowercase().chars().collect();
        if a_chars.len() < 3 {
            continue;
        }
        for b in &document.nodes[(i + 1)..] {
            if a.tree_id != b.tree_id || a.parent_id != b.parent_id {
                continue;
            }
            let b_chars: Vec<char> = b.title.trim().to_lowercase().chars().collect();
            if a_chars.len() != b_chars.len() {
                continue;
            }
            let diffs = a_chars
                .iter()
                .zip(b_chars.iter())
                .filter(|(x, y)| x != y)
                .count();
            if diffs == 1 {
                meta.has_minimal_pair = true;
                break 'minimal;
            }
        }
    }

    for tree in &document.trees {
        let thoughts = document
            .nodes
            .iter()
            .filter(|n| n.tree_id == tree.id && matches!(n.vertex, Vertex::Thought { .. }))
            .count() as u64;
        if thoughts > meta.max_thoughts_in_tree {
            meta.max_thoughts_in_tree = thoughts;
        }
        let buckets_two_plus = document
            .nodes
            .iter()
            .filter(|n| n.tree_id == tree.id && matches!(n.vertex, Vertex::Bucket))
            .filter(|bucket| {
                document
                    .nodes
                    .iter()
                    .filter(|other| other.bucket_id.as_deref() == Some(bucket.id.as_str()))
                    .count()
                    >= 2
            })
            .count() as u64;
        if buckets_two_plus > meta.max_buckets_with_two_plus_in_tree {
            meta.max_buckets_with_two_plus_in_tree = buckets_two_plus;
        }
        if tree.show_finished {
            let finished_in_tree = document
                .nodes
                .iter()
                .filter(|n| n.tree_id == tree.id && n.finished_at.is_some())
                .count();
            if finished_in_tree >= 10 {
                meta.has_ghost_whisperer = true;
            }
        }
    }

    for fd in &ctx.finished_days {
        if fd.count > meta.max_finished_in_one_day {
            meta.max_finished_in_one_day = fd.count;
        }
    }

    // Getting on Track Like a Pro: within 15 minutes of first tree creation,
    // has >= 2 nodes (tree + vertex), a non-empty note, and a saved session ending within 15m.
    if let Some(first_created) = snapshot.trees.iter().map(|t| t.created_at).min() {
        let cutoff = first_created.saturating_add(15 * a::MINUTE_MS);
        let has_early_session = snapshot
            .sessions
            .iter()
            .any(|s| s.ended_at >= first_created && s.ended_at <= cutoff);
        if has_early_session && document.nodes.len() >= 2 && meta.non_empty_notes >= 1 {
            meta.has_getting_on_track = true;
        }
    }

    meta
}

fn unlocked_records(document: &Document) -> Vec<a::UnlockedRecord> {
    document
        .achievements
        .as_deref()
        .unwrap_or_default()
        .iter()
        .filter_map(|item| {
            parse_slug(&item.id).map(|id| a::UnlockedRecord {
                id,
                unlocked_at: item.unlocked_at,
            })
        })
        .collect()
}

pub fn evaluate_view(
    document: &Document,
    state: &d::State,
    ctx: &CalendarContext,
) -> Result<EvaluationView, String> {
    let input = build_input(document, state, ctx)?;
    let existing = unlocked_records(document);
    let result = a::evaluate(state.snapshot(), &input, &existing)
        .map_err(|_| "Achievement evaluation failed due to numeric overflow.".to_string())?;
    let core = result
        .core
        .into_iter()
        .map(|p| {
            let a::AchievementId::Core(c) = p.id else {
                unreachable!()
            };
            let meta = core_meta(c);
            AchievementView {
                id: meta.slug.into(),
                title: meta.title.into(),
                description: meta.description.into(),
                category: meta.category,
                tier: meta.tier,
                icon: meta.icon,
                hidden: meta.hidden,
                endless: false,
                unit: meta.unit,
                unlocked_at: p.unlocked_at,
                current: p.current,
                target: p.target,
            }
        })
        .collect();
    let endless = result.endless.into_iter().map(endless_view).collect();
    let daily = result.daily.into_iter().map(daily_view).collect();
    Ok(EvaluationView {
        core,
        endless,
        daily,
    })
}

pub fn sync_document(
    mut document: Document,
    state: &d::State,
    ctx: &CalendarContext,
    now: u64,
    backfill: bool,
) -> Result<Document, String> {
    safe_number(now)?;
    let input = build_input(&document, state, ctx)?;
    let existing = unlocked_records(&document);
    // Preserve any unknown future slugs verbatim while merging known unlocks.
    let unknown: Vec<UnlockedAchievement> = document
        .achievements
        .as_deref()
        .unwrap_or_default()
        .iter()
        .filter(|item| parse_slug(&item.id).is_none())
        .cloned()
        .collect();
    let synced = a::sync(state.snapshot(), &input, &existing, now, backfill)
        .map_err(|_| "Could not synchronize achievements.".to_string())?;
    let mut merged: Vec<UnlockedAchievement> = synced
        .unlocked
        .into_iter()
        .map(|r| UnlockedAchievement {
            id: slug_of(r.id),
            unlocked_at: r.unlocked_at,
        })
        .collect();
    merged.extend(unknown);
    document.achievements = Some(merged);
    Ok(document)
}
