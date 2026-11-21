import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { desktopEnabled } from "./desktop";
import { Icon } from "./icons";
import type { IconName } from "./icons";
import type { AchievementTier } from "./model";
import { playAchievementChime } from "./achievementSound";
import type { ChimeKind } from "./achievementSound";

export interface ToastNotice {
  key: string;
  achievementId?: string;
  kind: "achievement" | "endless" | "daily" | "summary";
  tier: AchievementTier | "daily";
  icon: IconName;
  eyebrow: string;
  title: string;
  subtitle: string;
  shimmer?: boolean;
}

const CONFETTI_PALETTES: Record<AchievementTier | "daily", readonly string[]> =
  {
    daily: ["#80c9bc", "#a5e8d8", "#dfc491", "#ffffff"],
    bronze: ["#e6a972", "#dfc491", "#80c9bc", "#f6dcb8"],
    silver: ["#cfdce6", "#80c9bc", "#dfc491", "#9ca8dc", "#ffffff"],
    gold: ["#ffd76a", "#dfc491", "#ff9e64", "#80c9bc", "#fff3c4", "#7aa2f7"],
    platinum: [
      "#a8e6ff",
      "#ffd76a",
      "#e0aaff",
      "#80c9bc",
      "#ffffff",
      "#ff9e64",
    ],
  };

function confettiCountFor(notice: ToastNotice): number {
  if (notice.tier === "platinum") return 30;
  if (notice.tier === "gold" || notice.shimmer) return 26;
  if (notice.tier === "silver" || notice.kind === "endless") return 18;
  return 12;
}

interface ConfettiPiece {
  id: number;
  dx: number;
  dy: number;
  rot: number;
  delay: number;
  dur: number;
  color: string;
  round: boolean;
}

function buildConfetti(notice: ToastNotice): ConfettiPiece[] {
  const count = confettiCountFor(notice);
  const palette = CONFETTI_PALETTES[notice.tier];
  const spread =
    notice.tier === "gold" || notice.tier === "platinum" ? 135 : 95;
  const pieces: ConfettiPiece[] = [];
  for (let i = 0; i < count; i++) {
    // Deterministic radial spray skewed upward-left from the bottom-right toast.
    const frac = (i + 0.5) / count;
    const angle = -Math.PI * 1.15 + frac * Math.PI * 1.45;
    const mag = spread * (0.48 + ((i * 37) % 10) / 14);
    const dx = Math.round(Math.cos(angle) * mag);
    const dy = Math.round(Math.sin(angle) * mag - 18);
    const rot = ((i * 113) % 540) - 270;
    const delay = (i % 5) * 28;
    const dur = 680 + ((i * 71) % 340);
    pieces.push({
      id: i,
      dx,
      dy,
      rot,
      delay,
      dur,
      color: palette[i % palette.length]!,
      round: i % 3 === 0,
    });
  }
  return pieces;
}

export function AchievementToast({
  queue,
  paused,
  aboveDock = false,
  soundEnabled,
  onShift,
  onInspect,
}: {
  queue: ToastNotice[];
  paused: boolean;
  aboveDock?: boolean;
  soundEnabled: boolean;
  onShift: () => void;
  onInspect: (achievementId?: string) => void;
}) {
  const current = queue[0];
  const [combo, setCombo] = useState(1);
  const playedKey = useRef<string | null>(null);
  const comboRef = useRef(0);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!current) {
      comboRef.current = 0;
      setCombo(1);
      return;
    }
    if (paused) return;
    if (playedKey.current !== current.key) {
      playedKey.current = current.key;
      comboRef.current += 1;
      const currentCombo = comboRef.current;
      setCombo(currentCombo);
      if (soundEnabled) {
        const chime: ChimeKind =
          current.kind === "daily"
            ? "daily"
            : current.kind === "summary"
              ? "summary"
              : current.tier === "daily"
                ? "daily"
                : current.tier;
        playAchievementChime(chime, currentCombo - 1);
      }
      if (desktopEnabled) {
        void invoke("desktop_notify", {
          title: `${current.eyebrow}: ${current.title}`,
          body: current.subtitle,
        }).catch(() => {});
      }
    }
  }, [current, paused, soundEnabled]);

  useEffect(() => {
    const el = popoverRef.current as
      | (HTMLDivElement & {
          showPopover?: () => void;
          hidePopover?: () => void;
        })
      | null;
    if (!el || typeof el.showPopover !== "function") return;
    if (current && !paused) {
      try {
        el.showPopover();
      } catch {
        /* Already open or unsupported in current environment. */
      }
    } else {
      try {
        el.hidePopover?.();
      } catch {
        /* Already hidden. */
      }
    }
  }, [current, paused]);

  const confetti = useMemo(
    () => (current ? buildConfetti(current) : []),
    [current],
  );

  if (!current || paused) return null;
  const remaining = queue.length - 1;
  const rare = current.tier === "gold" || current.tier === "platinum";

  return (
    <div
      ref={popoverRef}
      popover="manual"
      className={`achievement-toast-host${aboveDock ? " above-dock" : ""}`}
    >
      <div
        key={current.key}
        className={`achievement-toast tier-${current.tier}${current.shimmer || rare ? " shimmer" : ""}${rare ? " rare" : ""}`}
        aria-live="polite"
        data-testid="achievement-toast"
      >
        <div className="achievement-confetti" aria-hidden="true">
          {confetti.map((piece) => (
            <span
              key={piece.id}
              className={`confetti-piece${piece.round ? " round" : ""}`}
              style={
                {
                  "--dx": `${piece.dx}px`,
                  "--dy": `${piece.dy}px`,
                  "--rot": `${piece.rot}deg`,
                  "--delay": `${piece.delay}ms`,
                  "--dur": `${piece.dur}ms`,
                  backgroundColor: piece.color,
                } as CSSProperties
              }
            />
          ))}
        </div>
        <button
          type="button"
          className="achievement-toast-body"
          onClick={() => {
            onInspect(current.achievementId);
            onShift();
          }}
        >
          <span className="achievement-toast-badge" aria-hidden="true">
            <Icon name={current.icon} size={22} />
          </span>
          <span className="achievement-toast-copy">
            <span className="eyebrow achievement-toast-eyebrow">
              <span>{current.eyebrow}</span>
              {combo >= 2 && (
                <span className="achievement-combo-pill">×{combo} COMBO</span>
              )}
              {remaining > 0 && <span>· +{remaining} MORE</span>}
            </span>
            <strong>{current.title}</strong>
            <small>{current.subtitle}</small>
          </span>
        </button>
        <button
          type="button"
          className="icon-button achievement-toast-close"
          aria-label="Dismiss achievement notification"
          onClick={onShift}
        >
          <Icon name="close" size={14} />
        </button>
        <span className="achievement-toast-accent" aria-hidden="true" />
      </div>
    </div>
  );
}
