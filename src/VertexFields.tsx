import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { localDateTime } from "./calendar";
import { desktopEnabled } from "./desktop";
import type {
  HabitAggregate,
  HabitBound,
  HabitInterval,
  VertexSettings,
} from "./model";
import { formatHabitTime, parseHabitTime, WEEKDAYS } from "./vertices";
import { Icon } from "./icons";

export function VertexFields({
  value,
  onChange,
  disabled = false,
  lockHabitMode = false,
}: {
  value: VertexSettings;
  onChange: (value: VertexSettings) => void;
  disabled?: boolean;
  lockHabitMode?: boolean;
}) {
  const [error, setError] = useState("");
  switch (value.kind) {
    case "thought":
      return (
        <label>
          Thought text
          <textarea
            autoFocus
            aria-label="Thought text"
            rows={12}
            required
            maxLength={20000}
            disabled={disabled}
            value={value.text ?? ""}
            onChange={(event) =>
              onChange({ ...value, text: event.target.value })
            }
          />
        </label>
      );
    case "deadline":
      return (
        <label>
          Deadline
          <input
            type="datetime-local"
            aria-label="Deadline"
            required
            disabled={disabled}
            value={
              Number.isFinite(value.deadlineAt)
                ? localDateTime(value.deadlineAt)
                : ""
            }
            onChange={(event) =>
              onChange({
                ...value,
                deadlineAt: new Date(event.target.value).getTime(),
              })
            }
          />
        </label>
      );
    case "reading":
      return (
        <div className="reading-attachment-field">
          <label>
            File path or website
            <input
              aria-label="File path or website"
              disabled={disabled}
              value={value.resource}
              maxLength={8192}
              placeholder="/home/you/paper.pdf or https://…"
              onChange={(event) =>
                onChange({ ...value, resource: event.target.value })
              }
            />
          </label>
          {desktopEnabled && (
            <button
              type="button"
              className="quiet-button"
              disabled={disabled}
              onClick={() => {
                void open({
                  multiple: false,
                  directory: false,
                  title: "Attach a reading file",
                })
                  .then((path) => {
                    if (path) onChange({ ...value, resource: path });
                    setError("");
                  })
                  .catch((reason: unknown) => setError(String(reason)));
              }}
            >
              <Icon name="reading" size={16} /> Choose file
            </button>
          )}
          {error && (
            <p role="alert" className="inline-error">
              {error}
            </p>
          )}
        </div>
      );
    case "habit": {
      const mode: "repetitions" | "number" | "timeOfDay" = value.measure
        ? value.measure.valueKind
        : "repetitions";
      const measure = value.measure;
      const aggregate: HabitAggregate =
        measure?.valueKind === "timeOfDay"
          ? "perEntry"
          : (measure?.aggregate ?? "sum");
      const showFrequency =
        mode === "repetitions" ||
        mode === "timeOfDay" ||
        aggregate === "perEntry";
      return (
        <div className="habit-config-fields">
          <label>
            Tracking mode
            <select
              aria-label="Tracking mode"
              disabled={disabled || lockHabitMode}
              value={mode}
              onChange={(event) => {
                const nextMode = event.target.value as
                  "repetitions" | "number" | "timeOfDay";
                if (nextMode === "repetitions") {
                  const { measure: _old, ...rest } = value;
                  void _old;
                  onChange(rest);
                } else if (nextMode === "number") {
                  onChange({
                    ...value,
                    frequency: 1,
                    measure: {
                      valueKind: "number",
                      bound: "atLeast",
                      target: 10,
                      aggregate: "sum",
                    },
                  });
                } else {
                  onChange({
                    ...value,
                    frequency: 1,
                    measure: {
                      valueKind: "timeOfDay",
                      bound: "atMost",
                      target: 7 * 60 + 30,
                      aggregate: "perEntry",
                    },
                  });
                }
              }}
            >
              <option value="repetitions">Repetitions</option>
              <option value="number">Numeric value (e.g. pages, min)</option>
              <option value="timeOfDay">Time of day (e.g. wake-up time)</option>
            </select>
          </label>
          {measure && (
            <div className="habit-measure-fields">
              <label>
                Goal
                <select
                  aria-label="Habit goal direction"
                  disabled={disabled}
                  value={measure.bound}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      measure: {
                        ...measure,
                        bound: event.target.value as HabitBound,
                      },
                    })
                  }
                >
                  <option value="atLeast">
                    {mode === "timeOfDay"
                      ? "No earlier than (≥)"
                      : "At least (≥)"}
                  </option>
                  <option value="atMost">
                    {mode === "timeOfDay" ? "No later than (≤)" : "At most (≤)"}
                  </option>
                </select>
              </label>
              {mode === "number" ? (
                <>
                  <label>
                    Target value
                    <input
                      type="number"
                      aria-label="Target value"
                      min={measure.bound === "atLeast" ? 0.001 : 0}
                      max={1000000000}
                      step="any"
                      required
                      disabled={disabled}
                      value={
                        Number.isFinite(measure.target) ? measure.target : ""
                      }
                      onChange={(event) =>
                        onChange({
                          ...value,
                          measure: {
                            ...measure,
                            target: Number(event.target.value),
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    Unit (optional)
                    <input
                      type="text"
                      aria-label="Habit unit"
                      maxLength={24}
                      placeholder="pages, km, min…"
                      disabled={disabled}
                      value={measure.unit ?? ""}
                      onChange={(event) => {
                        const unit = event.target.value;
                        const nextMeasure = { ...measure };
                        if (unit) nextMeasure.unit = unit;
                        else delete nextMeasure.unit;
                        onChange({ ...value, measure: nextMeasure });
                      }}
                    />
                  </label>
                  <label>
                    Evaluation
                    <select
                      aria-label="Habit evaluation"
                      disabled={disabled}
                      value={aggregate}
                      onChange={(event) => {
                        const nextAgg = event.target.value as HabitAggregate;
                        onChange({
                          ...value,
                          frequency: nextAgg === "sum" ? 1 : value.frequency,
                          measure: { ...measure, aggregate: nextAgg },
                        });
                      }}
                    >
                      <option value="sum">Total per period</option>
                      <option value="perEntry">Each entry meets target</option>
                    </select>
                  </label>
                </>
              ) : (
                <label>
                  Target time
                  <input
                    type="time"
                    aria-label="Target time"
                    required
                    disabled={disabled}
                    value={formatHabitTime(measure.target)}
                    onChange={(event) => {
                      const mins = parseHabitTime(event.target.value);
                      if (mins !== null) {
                        onChange({
                          ...value,
                          measure: { ...measure, target: mins },
                        });
                      }
                    }}
                  />
                </label>
              )}
            </div>
          )}
          <div className="habit-frequency-fields">
            {showFrequency && (
              <label>
                Repetitions
                <input
                  type="number"
                  aria-label="Repetitions"
                  min={1}
                  max={1000}
                  step={1}
                  required
                  disabled={disabled}
                  value={value.frequency || ""}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      frequency: Number(event.target.value),
                    })
                  }
                />
              </label>
            )}
            <label>
              Frequency
              <select
                aria-label="Frequency"
                disabled={disabled}
                value={value.interval}
                onChange={(event) => {
                  const nextInterval = event.target.value as HabitInterval;
                  const next = { ...value, interval: nextInterval };
                  if (nextInterval === "custom") {
                    next.weekdays = value.weekdays?.length
                      ? value.weekdays
                      : ["tue", "fri"];
                  } else {
                    delete next.weekdays;
                  }
                  onChange(next);
                }}
              >
                <option value="day">Per day</option>
                <option value="week">Per week</option>
                <option value="month">Per month</option>
                <option value="custom">Specific days</option>
              </select>
            </label>
          </div>
          {value.interval === "custom" && (
            <div className="habit-weekdays-field">
              <span className="habit-weekdays-label">Days of week</span>
              <div
                className="habit-weekdays-picker"
                role="group"
                aria-label="Days of week"
              >
                {WEEKDAYS.map((day) => {
                  const selected = (value.weekdays ?? []).includes(day.id);
                  return (
                    <button
                      key={day.id}
                      type="button"
                      className={`habit-weekday-btn${selected ? " selected" : ""}`}
                      aria-label={day.label}
                      aria-pressed={selected}
                      disabled={disabled}
                      onClick={() => {
                        const current = new Set(value.weekdays ?? []);
                        if (current.has(day.id)) {
                          if (current.size <= 1) return;
                          current.delete(day.id);
                        } else {
                          current.add(day.id);
                        }
                        const ordered = WEEKDAYS.filter((d) =>
                          current.has(d.id),
                        ).map((d) => d.id);
                        onChange({ ...value, weekdays: ordered });
                      }}
                    >
                      {day.short}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      );
    }
    default:
      return null;
  }
}
