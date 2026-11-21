import { useEffect, useRef, useState } from "react";
import { habitMonthDayBoundaries } from "./calendar";
import { habitPeriods } from "./domainClient";
import { Icon } from "./icons";
import type { State, Vertex } from "./model";
import {
  formatHabitTarget,
  formatHabitTime,
  formatHabitValue,
  isHabitScheduledOn,
} from "./vertices";

function positionCalendar(details: HTMLDetailsElement) {
  const calendar = details.querySelector<HTMLElement>(".habit-calendar");
  if (!calendar) return;
  calendar.style.transform = "";
  const bounds = calendar.getBoundingClientRect();
  const shift = Math.max(
    12 - bounds.left,
    Math.min(0, window.innerWidth - 12 - bounds.right),
  );
  calendar.style.transform = `translateX(${shift}px)`;
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function HabitHistory({
  state,
  nodeId,
  vertex,
  changeHistory,
}: {
  state: State;
  nodeId: string;
  vertex: Extract<Vertex, { kind: "habit" }>;
  changeHistory?: () => void;
}) {
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

  const measure = vertex.measure;
  const counts = new Map<string, number>();
  const dayValues = new Map<string, number[]>();
  if (!measure) {
    for (const at of vertex.completions) {
      const key = dayKey(new Date(at));
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  } else {
    for (const entry of vertex.entries ?? []) {
      const key = dayKey(new Date(entry.at));
      const list = dayValues.get(key) ?? [];
      list.push(entry.value);
      dayValues.set(key, list);
    }
  }

  const boundaries = habitMonthDayBoundaries(
    month.getFullYear(),
    month.getMonth(),
  );
  const statuses = measure ? habitPeriods(state, nodeId, boundaries) : [];
  const offset = (month.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return (
    <details
      className="habit-history"
      ref={ref}
      onToggle={(event) => {
        if (event.currentTarget.open) positionCalendar(event.currentTarget);
      }}
    >
      <summary
        className="icon-button hover-label-button"
        aria-label="Habit history"
        title="History"
        onClick={(event) => {
          event.preventDefault();
          const details = ref.current;
          if (!details) return;
          details.open = !details.open;
          if (details.open) positionCalendar(details);
        }}
      >
        <Icon name="calendar" size={16} />
        <span className="hover-label" aria-hidden="true">
          History
        </span>
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
            const dateText = date.toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            });
            const scheduled = isHabitScheduledOn(vertex, date.getTime());
            if (!measure) {
              const count = counts.get(dayKey(date)) ?? 0;
              const label = `${dateText}: ${count} repetition${count === 1 ? "" : "s"}${!scheduled ? " (rest day)" : ""}`;
              return (
                <span
                  key={index}
                  className={
                    count
                      ? "habit-day completed"
                      : !scheduled
                        ? "habit-day off-day"
                        : "habit-day"
                  }
                  aria-label={label}
                  title={label}
                  tabIndex={0}
                >
                  {index + 1}
                </span>
              );
            }
            const status = statuses[index];
            const values = dayValues.get(dayKey(date)) ?? [];
            const stateClass =
              status?.state === "met"
                ? "habit-day completed"
                : status?.state === "missed"
                  ? "habit-day missed"
                  : !scheduled
                    ? "habit-day off-day"
                    : "habit-day";
            const summary =
              values.length === 0
                ? scheduled
                  ? "not recorded"
                  : "rest day"
                : measure.valueKind === "timeOfDay"
                  ? values.map(formatHabitTime).join(", ")
                  : (measure.aggregate ?? "sum") === "sum"
                    ? formatHabitValue(measure, status?.totalValue ?? 0)
                    : values
                        .map((v) => formatHabitValue(measure, v))
                        .join(", ");
            const label = `${dateText}: ${summary} (target ${formatHabitTarget(measure)})`;
            return (
              <span
                key={index}
                className={stateClass}
                aria-label={label}
                title={label}
                tabIndex={0}
              >
                {index + 1}
              </span>
            );
          })}
        </div>
        <p>
          {measure
            ? `Green days met ${formatHabitTarget(measure)}; amber days missed it.`
            : "Green days have recorded repetitions."}
        </p>
        {changeHistory && (
          <button
            type="button"
            className="quiet-button"
            onClick={() => {
              ref.current?.removeAttribute("open");
              changeHistory();
            }}
          >
            <Icon name="pencil" size={14} />
            Change history
          </button>
        )}
      </section>
    </details>
  );
}
