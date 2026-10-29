import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { localDateTime } from "./calendar";
import { desktopEnabled } from "./desktop";
import type { HabitInterval, VertexSettings } from "./model";
import { Icon } from "./icons";

export function VertexFields({
  value,
  onChange,
  disabled = false,
}: {
  value: VertexSettings;
  onChange: (value: VertexSettings) => void;
  disabled?: boolean;
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
    case "habit":
      return (
        <div className="habit-frequency-fields">
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
                onChange({ ...value, frequency: Number(event.target.value) })
              }
            />
          </label>
          <label>
            Frequency
            <select
              aria-label="Frequency"
              disabled={disabled}
              value={value.interval}
              onChange={(event) =>
                onChange({
                  ...value,
                  interval: event.target.value as HabitInterval,
                })
              }
            >
              <option value="day">Per day</option>
              <option value="week">Per week</option>
              <option value="month">Per month</option>
            </select>
          </label>
        </div>
      );
    default:
      return null;
  }
}
