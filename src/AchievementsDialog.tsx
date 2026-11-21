import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons";
import type { IconName } from "./icons";
import type {
  AchievementCategory,
  AchievementEvaluation,
  AchievementUnit,
  AchievementView,
} from "./model";
import type { AchievementPrefs } from "./achievementPrefs";
import { shortTime } from "./presentation";

const CATEGORIES: { key: "all" | AchievementCategory; label: string }[] = [
  { key: "all", label: "All categories" },
  { key: "focus", label: "Focus" },
  { key: "streaks", label: "Consistency" },
  { key: "habits", label: "Habits" },
  { key: "graph", label: "Graph craft" },
  { key: "completion", label: "Completion" },
  { key: "notes", label: "Readings & notes" },
  { key: "secret", label: "Secret" },
];

function iconNameOf(name: string): IconName {
  const valid = new Set<string>([
    "play",
    "pause",
    "plus",
    "close",
    "notes",
    "settings",
    "history",
    "undo",
    "palette",
    "link",
    "calendar",
    "pencil",
    "arrow",
    "download",
    "upload",
    "fit",
    "trash",
    "tree",
    "vertex",
    "deadline",
    "thought",
    "bucket",
    "reading",
    "habit",
    "external",
    "check",
    "finish",
    "sidebar",
    "trophy",
    "lock",
    "star",
    "flame",
    "volume",
    "volumeOff",
  ]);
  return (valid.has(name) ? name : "trophy") as IconName;
}

export function formatAchievementProgress(
  current: number,
  target: number,
  unit: AchievementUnit,
): string {
  const clamped = Math.min(current, target);
  if (unit === "duration") {
    return `${shortTime(clamped)} / ${shortTime(target)}`;
  }
  if (unit === "days") {
    return `${clamped} / ${target} days`;
  }
  return `${clamped} / ${target}`;
}

function progressRatio(item: AchievementView): number {
  if (item.unlockedAt !== null) return 1;
  if (item.target <= 0) return 0;
  return Math.min(0.999, item.current / item.target);
}

export function AchievementsDialog({
  evaluation,
  prefs,
  onChangePrefs,
  focusAchievementId,
  close,
}: {
  evaluation: AchievementEvaluation;
  prefs: AchievementPrefs;
  onChangePrefs: (next: AchievementPrefs) => void;
  focusAchievementId?: string | undefined;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [statusFilter, setStatusFilter] = useState<
    "all" | "unlocked" | "locked" | "endless"
  >("all");
  const [category, setCategory] = useState<"all" | AchievementCategory>("all");
  const [sort, setSort] = useState<"default" | "recent" | "closest">("default");

  useLayoutEffect(() => {
    const previousFocus = document.activeElement;
    ref.current?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    if (!focusAchievementId) return;
    const card = ref.current?.querySelector<HTMLElement>(
      `[data-achievement-id="${CSS.escape(focusAchievementId)}"]`,
    );
    card?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusAchievementId]);

  const coreUnlocked = useMemo(
    () => evaluation.core.filter((item) => item.unlockedAt !== null).length,
    [evaluation.core],
  );
  const coreTotal = evaluation.core.length;
  const corePercent = coreTotal
    ? Math.round((coreUnlocked / coreTotal) * 100)
    : 0;
  const endlessUnlocked = useMemo(
    () => evaluation.endless.filter((item) => item.unlockedAt !== null).length,
    [evaluation.endless],
  );

  const dailyApplicable = useMemo(
    () => evaluation.daily.filter((item) => item.applicable),
    [evaluation.daily],
  );
  const dailyCompleted = dailyApplicable.filter(
    (item) => item.completed,
  ).length;

  const almostThere = useMemo(() => {
    const candidates = [...evaluation.core, ...evaluation.endless].filter(
      (item) =>
        item.unlockedAt === null &&
        !item.hidden &&
        item.target > 1 &&
        item.current > 0,
    );
    const byProgress = (a: AchievementView, b: AchievementView) =>
      progressRatio(b) - progressRatio(a) ||
      Number(b.endless) - Number(a.endless);

    const isLiveCombo = (item: AchievementView) =>
      item.id.startsWith("endless:yellow_combos:") ||
      item.id.startsWith("endless:green_combos:") ||
      item.id.startsWith("endless:deep_doubles:") ||
      item.id === "orange_streak_3" ||
      item.id === "yellow_streak_3" ||
      item.id === "green_streak_3" ||
      item.id === "green_streak_5" ||
      item.id === "cyan_streak_3" ||
      item.id === "blue_streak_3" ||
      item.id === "three_in_a_row" ||
      item.id === "full_week" ||
      item.id === "unbroken_fortnight" ||
      item.id === "monthly_rhythm";

    // Always surface live time-sensitive combos (e.g. Sunlit Streak, Green Light, Twin Peaks)
    // ahead of non-expiring cumulative counters like Active Days / Solid Days.
    const liveCombos = candidates
      .filter(isLiveCombo)
      .sort(
        (a, b) =>
          Number(b.endless) - Number(a.endless) ||
          progressRatio(b) - progressRatio(a),
      )
      .slice(0, 3);
    const picked = [...liveCombos];
    const rest = candidates
      .filter((item) => !picked.some((p) => p.id === item.id))
      .sort(byProgress);
    for (const item of rest) {
      if (picked.length >= 6) break;
      picked.push(item);
    }
    if (picked.length >= 3) return picked;
    // Pad with next unlocked endless / visible starter goals so the strip stays helpful
    const fallback = [...evaluation.endless, ...evaluation.core].filter(
      (item) =>
        item.unlockedAt === null &&
        !item.hidden &&
        !picked.some((c) => c.id === item.id),
    );
    return [...picked, ...fallback].slice(0, 3);
  }, [evaluation.core, evaluation.endless]);

  const hasUnlockedSecret = useMemo(
    () =>
      evaluation.core.some(
        (item) => item.category === "secret" && item.unlockedAt !== null,
      ),
    [evaluation.core],
  );
  const hiddenRemaining = useMemo(
    () =>
      evaluation.core.filter((item) => item.hidden && item.unlockedAt === null)
        .length,
    [evaluation.core],
  );
  const visibleCategories = useMemo(
    () => CATEGORIES.filter((cat) => cat.key !== "secret" || hasUnlockedSecret),
    [hasUnlockedSecret],
  );

  const displayed = useMemo(() => {
    let list =
      statusFilter === "endless"
        ? [...evaluation.endless]
        : [...evaluation.core, ...evaluation.endless];
    // Locked hidden achievements stay completely invisible until unlocked.
    list = list.filter((item) => !item.hidden || item.unlockedAt !== null);
    if (statusFilter === "unlocked")
      list = list.filter((item) => item.unlockedAt !== null);
    if (statusFilter === "locked")
      list = list.filter((item) => item.unlockedAt === null);
    if (category !== "all")
      list = list.filter((item) => item.category === category);
    if (sort === "recent") {
      list.sort(
        (a, b) =>
          (b.unlockedAt ?? -1) - (a.unlockedAt ?? -1) ||
          progressRatio(b) - progressRatio(a),
      );
    } else if (sort === "closest") {
      list.sort((a, b) => {
        const aLocked = a.unlockedAt === null ? 0 : 1;
        const bLocked = b.unlockedAt === null ? 0 : 1;
        if (aLocked !== bLocked) return aLocked - bLocked;
        return progressRatio(b) - progressRatio(a);
      });
    }
    return list;
  }, [evaluation.core, evaluation.endless, statusFilter, category, sort]);

  return (
    <dialog
      ref={ref}
      className="achievements-screen"
      aria-label="Achievements"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className="achievements-shell">
        <header className="achievements-header">
          <div className="achievements-title-block">
            <span className="eyebrow">TROPHY HALL</span>
            <div className="achievements-title-row">
              <h1>
                <Icon name="trophy" size={28} /> Achievements
              </h1>
              {coreTotal > 0 && coreUnlocked === coreTotal && (
                <span className="perfect-forest-ribbon">
                  <Icon name="star" size={14} /> Perfect Forest · 100%
                </span>
              )}
            </div>
            <div className="achievements-summary-bar">
              <div className="achievements-meter">
                <progress
                  max={Math.max(1, coreTotal)}
                  value={coreUnlocked}
                  aria-label="Core achievement completion"
                />
                <span>
                  <strong>
                    {coreUnlocked} / {coreTotal}
                  </strong>{" "}
                  core ({corePercent}%) · <strong>{endlessUnlocked}</strong>{" "}
                  endless milestones earned
                </span>
              </div>
            </div>
          </div>
          <div className="achievements-header-controls">
            <button
              type="button"
              className="quiet-button"
              role="switch"
              aria-checked={prefs.popups}
              onClick={() => onChangePrefs({ ...prefs, popups: !prefs.popups })}
            >
              Popups: {prefs.popups ? "On" : "Off"}
            </button>
            <button
              type="button"
              className="quiet-button"
              role="switch"
              aria-checked={prefs.sound}
              onClick={() => onChangePrefs({ ...prefs, sound: !prefs.sound })}
            >
              <Icon name={prefs.sound ? "volume" : "volumeOff"} size={15} />
              Sound: {prefs.sound ? "On" : "Off"}
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={close}
              aria-label="Close achievements"
            >
              Back to forest <Icon name="close" size={16} />
            </button>
          </div>
        </header>

        <div className="achievements-scroll">
          <section
            className="achievements-daily-strip"
            aria-label="Today's wins"
          >
            <div className="achievements-strip-heading">
              <div>
                <span className="eyebrow">RESETS EVERY LOCAL DAY</span>
                <h2>
                  Today’s Wins ({dailyCompleted} / {dailyApplicable.length})
                </h2>
              </div>
            </div>
            <div className="daily-wins-grid">
              {dailyApplicable.map((win) => (
                <div
                  key={win.id}
                  className={`daily-win-pill${win.completed ? " completed" : ""}`}
                >
                  <span className="daily-win-check" aria-hidden="true">
                    <Icon name={win.completed ? "check" : "flame"} size={14} />
                  </span>
                  <div className="daily-win-text">
                    <strong>{win.title}</strong>
                    <small>
                      {win.completed
                        ? "Completed today"
                        : win.unit === "none"
                          ? win.description
                          : formatAchievementProgress(
                              win.current,
                              win.target,
                              win.unit,
                            )}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {almostThere.length > 0 && (
            <section
              className="achievements-almost-strip"
              aria-label="Almost there"
            >
              <div className="achievements-strip-heading">
                <div>
                  <span className="eyebrow">NEXT UP</span>
                  <h2>Almost There</h2>
                </div>
              </div>
              <div className="achievements-grid almost-grid">
                {almostThere.map((item) => (
                  <AchievementCard
                    key={`almost-${item.id}`}
                    item={item}
                    highlighted={item.id === focusAchievementId}
                  />
                ))}
              </div>
            </section>
          )}

          <section
            className="achievements-catalog"
            aria-label="All achievements"
          >
            <div className="achievements-toolbar">
              <div
                className="achievements-filter-group"
                role="group"
                aria-label="Filter by status"
              >
                {(
                  [
                    ["all", "All"],
                    ["unlocked", "Unlocked"],
                    ["locked", "Locked"],
                    ["endless", "Endless"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={`quiet-button filter-pill${statusFilter === key ? " active" : ""}`}
                    aria-pressed={statusFilter === key}
                    onClick={() => setStatusFilter(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div
                className="achievements-filter-group"
                role="group"
                aria-label="Filter by category"
              >
                {visibleCategories.map((cat) => (
                  <button
                    key={cat.key}
                    type="button"
                    className={`quiet-button filter-pill${category === cat.key ? " active" : ""}`}
                    aria-pressed={category === cat.key}
                    onClick={() => setCategory(cat.key)}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
              <label className="achievements-sort">
                Sort
                <select
                  aria-label="Sort achievements"
                  value={sort}
                  onChange={(event) =>
                    setSort(
                      event.target.value as "default" | "recent" | "closest",
                    )
                  }
                >
                  <option value="default">Default</option>
                  <option value="recent">Recently unlocked</option>
                  <option value="closest">Closest to unlocking</option>
                </select>
              </label>
            </div>

            {displayed.length ? (
              <div className="achievements-grid">
                {displayed.map((item) => (
                  <AchievementCard
                    key={item.id}
                    item={item}
                    highlighted={item.id === focusAchievementId}
                  />
                ))}
              </div>
            ) : (
              <p className="achievements-empty">
                No achievements match this filter yet.
              </p>
            )}
            {hiddenRemaining > 0 &&
              (statusFilter === "all" || statusFilter === "locked") &&
              category === "all" && (
                <div
                  className="achievements-hidden-footer"
                  data-testid="achievements-hidden-footer"
                >
                  <Icon name="lock" size={16} />
                  <div>
                    <strong>
                      +{hiddenRemaining} secret{" "}
                      {hiddenRemaining === 1 ? "achievement" : "achievements"}{" "}
                      remaining
                    </strong>
                    <span>
                      Details for each secret achievement will be revealed once
                      unlocked.
                    </span>
                  </div>
                </div>
              )}
          </section>
        </div>
      </div>
    </dialog>
  );
}

function AchievementCard({
  item,
  highlighted,
}: {
  item: AchievementView;
  highlighted: boolean;
}) {
  const unlocked = item.unlockedAt !== null;
  const showBar = !unlocked && item.unit !== "none" && item.target > 1;
  return (
    <article
      className={`achievement-card tier-${item.tier}${unlocked ? " unlocked" : " locked"}${item.endless ? " endless" : ""}${highlighted ? " highlighted" : ""}`}
      data-achievement-id={item.id}
    >
      <div className="achievement-card-icon" aria-hidden="true">
        <Icon name={iconNameOf(item.icon)} size={22} />
      </div>
      <div className="achievement-card-body">
        <div className="achievement-card-top">
          <h3>{item.title}</h3>
          <span className={`tier-pill tier-${item.tier}`}>
            {item.endless ? "Endless" : item.tier}
          </span>
        </div>
        <p>{item.description}</p>
        {unlocked && item.unlockedAt !== null && (
          <time
            className="achievement-unlocked-date"
            dateTime={new Date(item.unlockedAt).toISOString()}
          >
            Unlocked {new Date(item.unlockedAt).toLocaleDateString()}
          </time>
        )}
        {showBar && (
          <div className="achievement-card-progress">
            <progress
              max={item.target}
              value={Math.min(item.current, item.target)}
            />
            <small>
              {formatAchievementProgress(item.current, item.target, item.unit)}
            </small>
          </div>
        )}
      </div>
    </article>
  );
}
