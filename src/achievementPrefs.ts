/** Device-local achievement notification & display preferences. */
const POPUPS_KEY = "hyperforest.achievements.popups";
const SOUND_KEY = "hyperforest.achievements.sound";
const DAILY_SEEN_KEY = "hyperforest.achievements.daily-seen";

export interface AchievementPrefs {
  popups: boolean;
  sound: boolean;
}

export function loadAchievementPrefs(): AchievementPrefs {
  try {
    return {
      popups: localStorage.getItem(POPUPS_KEY) !== "false",
      sound: localStorage.getItem(SOUND_KEY) !== "false",
    };
  } catch {
    return { popups: true, sound: true };
  }
}

export function saveAchievementPrefs(prefs: AchievementPrefs): void {
  try {
    localStorage.setItem(POPUPS_KEY, String(prefs.popups));
    localStorage.setItem(SOUND_KEY, String(prefs.sound));
  } catch {
    /* Keep UI usable when localStorage is unavailable. */
  }
}

export function loadSeenDailyWins(dayKey: string): Set<string> {
  try {
    const raw = localStorage.getItem(DAILY_SEEN_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as { day?: unknown; ids?: unknown };
    if (parsed.day !== dayKey || !Array.isArray(parsed.ids)) return new Set();
    return new Set(
      parsed.ids.filter((item): item is string => typeof item === "string"),
    );
  } catch {
    return new Set();
  }
}

export function saveSeenDailyWins(dayKey: string, ids: Set<string>): void {
  try {
    localStorage.setItem(
      DAILY_SEEN_KEY,
      JSON.stringify({ day: dayKey, ids: [...ids] }),
    );
  } catch {
    /* Ignore storage errors. */
  }
}
