/** Steam-style Web Audio API synthesized achievement & daily-win chimes. */
import type { AchievementTier } from "./model";

export type ChimeKind = AchievementTier | "daily" | "summary";

let audioContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  if (!audioContext) {
    try {
      audioContext = new Ctor();
    } catch {
      return null;
    }
  }
  if (audioContext.state === "suspended") {
    void audioContext.resume().catch(() => {});
  }
  return audioContext;
}

interface ToneSpec {
  freq: number;
  delay: number;
  dur: number;
  gain: number;
  type?: OscillatorType;
  detune?: number;
}

/**
 * Steam-inspired warm glassy synth chime:
 * - Standard unlock (bronze/silver/summary): soft percussive warm chord rise
 *   (D5 -> A5 bloom with fifth/octave harmonic shimmer, matching the classic
 *   Steam achievement "ba-ding" feel).
 * - Rare unlock (gold/platinum): Steam rare-achievement sparkle with airy
 *   high major-ninth shimmer tail.
 * - Daily win: lighter, snappier version of the Steam chime.
 */
const CHIMES: Record<ChimeKind, ToneSpec[]> = {
  daily: [
    { freq: 587.33, delay: 0.0, dur: 0.16, gain: 0.09, type: "triangle" },
    { freq: 880.0, delay: 0.075, dur: 0.42, gain: 0.11, type: "sine" },
    {
      freq: 880.0,
      delay: 0.075,
      dur: 0.36,
      gain: 0.045,
      type: "triangle",
      detune: 5,
    },
    { freq: 1760.0, delay: 0.085, dur: 0.28, gain: 0.025, type: "sine" },
  ],
  summary: [
    { freq: 587.33, delay: 0.0, dur: 0.22, gain: 0.09, type: "triangle" },
    { freq: 739.99, delay: 0.07, dur: 0.28, gain: 0.08, type: "sine" },
    { freq: 880.0, delay: 0.14, dur: 0.55, gain: 0.11, type: "sine" },
    {
      freq: 1174.66,
      delay: 0.15,
      dur: 0.45,
      gain: 0.045,
      type: "sine",
      detune: 4,
    },
  ],
  bronze: [
    // Classic Steam achievement two-note glassy bloom (D5 -> A5 + D6 overtone)
    { freq: 293.66, delay: 0.0, dur: 0.18, gain: 0.05, type: "sine" },
    { freq: 587.33, delay: 0.0, dur: 0.22, gain: 0.11, type: "triangle" },
    { freq: 1174.66, delay: 0.0, dur: 0.12, gain: 0.03, type: "sine" },
    { freq: 880.0, delay: 0.095, dur: 0.62, gain: 0.13, type: "sine" },
    {
      freq: 880.0,
      delay: 0.095,
      dur: 0.56,
      gain: 0.06,
      type: "triangle",
      detune: 5,
    },
    { freq: 1318.51, delay: 0.105, dur: 0.48, gain: 0.035, type: "sine" },
    { freq: 1760.0, delay: 0.105, dur: 0.36, gain: 0.025, type: "sine" },
  ],
  silver: [
    { freq: 293.66, delay: 0.0, dur: 0.2, gain: 0.055, type: "sine" },
    { freq: 587.33, delay: 0.0, dur: 0.24, gain: 0.11, type: "triangle" },
    { freq: 739.99, delay: 0.08, dur: 0.32, gain: 0.09, type: "sine" },
    { freq: 880.0, delay: 0.145, dur: 0.68, gain: 0.135, type: "sine" },
    {
      freq: 880.0,
      delay: 0.145,
      dur: 0.6,
      gain: 0.06,
      type: "triangle",
      detune: 6,
    },
    { freq: 1174.66, delay: 0.155, dur: 0.55, gain: 0.055, type: "sine" },
    { freq: 1760.0, delay: 0.165, dur: 0.42, gain: 0.03, type: "sine" },
  ],
  gold: [
    // Steam rare achievement sparkle: warm chord swell + crystalline high shimmer
    { freq: 293.66, delay: 0.0, dur: 0.28, gain: 0.06, type: "sine" },
    { freq: 587.33, delay: 0.0, dur: 0.28, gain: 0.11, type: "triangle" },
    { freq: 880.0, delay: 0.09, dur: 0.68, gain: 0.13, type: "sine" },
    {
      freq: 880.0,
      delay: 0.09,
      dur: 0.62,
      gain: 0.06,
      type: "triangle",
      detune: 6,
    },
    { freq: 1108.73, delay: 0.175, dur: 0.65, gain: 0.08, type: "sine" },
    { freq: 1318.51, delay: 0.24, dur: 0.72, gain: 0.085, type: "sine" },
    {
      freq: 1760.0,
      delay: 0.31,
      dur: 0.85,
      gain: 0.065,
      type: "sine",
      detune: -4,
    },
    {
      freq: 2349.32,
      delay: 0.34,
      dur: 0.65,
      gain: 0.028,
      type: "sine",
      detune: 5,
    },
  ],
  platinum: [
    // Full Steam rare-achievement fanfare with bright octave + ninth sparkle
    { freq: 293.66, delay: 0.0, dur: 0.35, gain: 0.065, type: "sine" },
    { freq: 587.33, delay: 0.0, dur: 0.32, gain: 0.115, type: "triangle" },
    { freq: 880.0, delay: 0.085, dur: 0.75, gain: 0.135, type: "sine" },
    {
      freq: 880.0,
      delay: 0.085,
      dur: 0.7,
      gain: 0.065,
      type: "triangle",
      detune: 7,
    },
    { freq: 1108.73, delay: 0.165, dur: 0.75, gain: 0.085, type: "sine" },
    { freq: 1318.51, delay: 0.23, dur: 0.82, gain: 0.095, type: "sine" },
    { freq: 1760.0, delay: 0.3, dur: 0.95, gain: 0.08, type: "sine" },
    {
      freq: 2217.46,
      delay: 0.36,
      dur: 0.8,
      gain: 0.04,
      type: "sine",
      detune: 5,
    },
    {
      freq: 2637.02,
      delay: 0.41,
      dur: 0.75,
      gain: 0.032,
      type: "sine",
      detune: -5,
    },
  ],
};

export function playAchievementChime(kind: ChimeKind, comboIndex = 0): void {
  const ctx = getContext();
  if (!ctx) return;
  try {
    const start = ctx.currentTime + 0.01;
    // Slight ascending pitch climb for back-to-back combo unlocks (+1 semitone per step, max +4).
    const pitchScale = Math.pow(2, Math.min(Math.max(0, comboIndex), 4) / 12);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(
      kind === "gold" || kind === "platinum" ? 5600 : 4400,
      start,
    );
    filter.Q.setValueAtTime(0.7, start);
    filter.connect(ctx.destination);

    for (const note of CHIMES[kind]) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = note.type ?? "sine";
      osc.frequency.setValueAtTime(note.freq * pitchScale, start + note.delay);
      if (note.detune) {
        osc.detune.setValueAtTime(note.detune, start + note.delay);
      }
      env.gain.setValueAtTime(0.0001, start + note.delay);
      env.gain.exponentialRampToValueAtTime(
        note.gain,
        start + note.delay + 0.012,
      );
      env.gain.exponentialRampToValueAtTime(
        0.0001,
        start + note.delay + note.dur,
      );
      osc.connect(env);
      env.connect(filter);
      osc.start(start + note.delay);
      osc.stop(start + note.delay + note.dur + 0.03);
    }
  } catch {
    /* Audio playback may be blocked in headless or restricted contexts. */
  }
}
