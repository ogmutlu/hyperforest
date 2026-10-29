import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function HabitHistory({ completions }: { completions: number[] }) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target))
        ref.current?.removeAttribute("open");
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && ref.current?.open) {
        event.preventDefault();
        event.stopPropagation();
        ref.current.removeAttribute("open");
        ref.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape, true);
    };
  }, []);
  const counts = new Map<string, number>();
  for (const at of completions) {
    const key = dayKey(new Date(at));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const offset = (month.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return (
    <details
      className="habit-history"
      ref={ref}
      onToggle={(event) => {
        if (!event.currentTarget.open) return;
        const calendar =
          event.currentTarget.querySelector<HTMLElement>(".habit-calendar");
        if (!calendar) return;
        calendar.style.transform = "";
        const bounds = calendar.getBoundingClientRect();
        const shift = Math.max(
          12 - bounds.left,
          Math.min(0, window.innerWidth - 12 - bounds.right),
        );
        calendar.style.transform = `translateX(${shift}px)`;
      }}
    >
      <summary className="quiet-button" aria-label="Habit history">
        <Icon name="calendar" size={14} /> History
      </summary>
      <section className="habit-calendar" aria-label="Habit history calendar">
        <div className="habit-calendar-heading">
          <button
            type="button"
            className="icon-button"
            aria-label="Previous habit month"
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
            }
          >
            ‹
          </button>
          <strong aria-live="polite">
            {month.toLocaleDateString(undefined, {
              month: "long",
              year: "numeric",
            })}
          </strong>
          <button
            type="button"
            className="icon-button"
            aria-label="Next habit month"
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
            }
          >
            ›
          </button>
        </div>
        <div className="habit-days">
          {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((day) => (
            <small key={day}>{day}</small>
          ))}
          {Array.from({ length: offset }, (_, index) => (
            <span key={`blank-${index}`} />
          ))}
          {Array.from({ length: days }, (_, index) => {
            const date = new Date(
              month.getFullYear(),
              month.getMonth(),
              index + 1,
            );
            const count = counts.get(dayKey(date)) ?? 0;
            const label = `${date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}: ${count} repetition${count === 1 ? "" : "s"}`;
            return (
              <span
                key={index}
                className={count ? "habit-day completed" : "habit-day"}
                aria-label={label}
                title={label}
                tabIndex={0}
              >
                {index + 1}
              </span>
            );
          })}
        </div>
        <p>Green days have recorded repetitions.</p>
      </section>
    </details>
  );
}
