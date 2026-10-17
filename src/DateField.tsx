import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { localDay, parseDay } from "./calendar";
import { Icon } from "./icons";

/** Shared calendar presentation. Date selection never performs time accounting.
 * Keep the panel inside the containing modal (outside it would be inert), but
 * position it against the viewport so the history's scroll area cannot clip it.
 */
export function DateField({
  label,
  value,
  onChange,
  min,
  max,
  required = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min: string;
  max: string;
  required?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const focusDay = useRef(false);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(min);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const today = localDay(Date.now());
  const valid = (day: string): boolean =>
    !!parseDay(day) && day >= min && day <= max;
  const clamp = (day: string): string =>
    day < min ? min : day > max ? max : day;
  const limitsValid = !!parseDay(min) && !!parseDay(max) && min <= max;
  const date = parseDay(cursor) ?? parseDay(min) ?? new Date();
  const year = date.getFullYear();
  const month = date.getMonth();
  const monthName = date.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const first = new Date(year, month, 1, 12);
  const offset = (first.getDay() + 6) % 7;
  const count = new Date(year, month + 1, 0, 12).getDate();
  const close = (restoreFocus: boolean): void => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  };
  const choose = (day: string): void => {
    onChange(day);
    close(true);
  };
  const moveMonth = (offset: number): void => {
    const next = new Date(year, month + offset, 1, 12);
    next.setDate(
      Math.min(
        date.getDate(),
        new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate(),
      ),
    );
    setCursor(clamp(localDay(next.getTime())));
  };
  useEffect(() => {
    input.current?.setCustomValidity(
      !value || valid(value)
        ? ""
        : `Enter a valid date between ${min} and ${max} (YYYY-MM-DD).`,
    );
  }, [value, min, max]);
  useLayoutEffect(() => {
    if (!open || !panel.current || !trigger.current) return;
    const anchor = trigger.current.getBoundingClientRect();
    const size = panel.current.getBoundingClientRect();
    setPosition({
      left: Math.max(
        8,
        Math.min(anchor.right - size.width, window.innerWidth - size.width - 8),
      ),
      top: Math.max(
        8,
        anchor.bottom + size.height + 8 <= window.innerHeight
          ? anchor.bottom + 6
          : anchor.top - size.height - 6,
      ),
    });
    if (focusDay.current) {
      panel.current
        .querySelector<HTMLButtonElement>(`[data-day="${cursor}"]`)
        ?.focus({ preventScroll: true });
      focusDay.current = false;
    }
  }, [open, cursor]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent): void => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        close(false);
    };
    const escape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close(true);
      }
    };
    const dismiss = (): void => close(false);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape, true);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [open]);
  return (
    <div
      className="date-field"
      ref={root}
      onBlur={(event) => {
        if (
          open &&
          event.relatedTarget instanceof Node &&
          !root.current?.contains(event.relatedTarget)
        )
          close(false);
      }}
    >
      <label htmlFor={id}>{label}</label>
      <div className="date-field-entry">
        <input
          ref={input}
          id={id}
          type="text"
          value={value}
          placeholder="YYYY-MM-DD"
          pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}"
          required={required}
          disabled={disabled}
          aria-invalid={value && !valid(value) ? true : undefined}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.altKey && event.key === "ArrowDown" && limitsValid) {
              event.preventDefault();
              setCursor(valid(value) ? value : clamp(today));
              focusDay.current = true;
              setOpen(true);
            }
          }}
        />
        <button
          ref={trigger}
          type="button"
          className="icon-button"
          aria-label={`Choose ${label.toLowerCase()}`}
          title={`Choose ${label.toLowerCase()}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? `${id}-calendar` : undefined}
          disabled={disabled || !limitsValid}
          onClick={() => {
            if (open) close(false);
            else {
              setCursor(valid(value) ? value : clamp(today));
              focusDay.current = true;
              setOpen(true);
            }
          }}
        >
          <Icon name="calendar" size={17} />
        </button>
      </div>
      {open && (
        <div
          ref={panel}
          id={`${id}-calendar`}
          className="date-calendar"
          role="dialog"
          aria-label={`${label} calendar`}
          style={{ position: "fixed", ...position }}
        >
          <div className="date-calendar-heading">
            <button
              type="button"
              className="icon-button"
              aria-label="Previous month"
              disabled={cursor.slice(0, 7) <= min.slice(0, 7)}
              onClick={() => moveMonth(-1)}
            >
              ‹
            </button>
            <span aria-live="polite">{monthName}</span>
            <button
              type="button"
              className="icon-button"
              aria-label="Next month"
              disabled={cursor.slice(0, 7) >= max.slice(0, 7)}
              onClick={() => moveMonth(1)}
            >
              ›
            </button>
          </div>
          <div className="date-calendar-month">
            <label>
              Month
              <select
                aria-label="Calendar month"
                value={month}
                onChange={(event) =>
                  moveMonth(Number(event.target.value) - month)
                }
              >
                {Array.from({ length: 12 }, (_, index) => (
                  <option
                    key={index}
                    value={index}
                    disabled={
                      `${year}-${String(index + 1).padStart(2, "0")}` <
                        min.slice(0, 7) ||
                      `${year}-${String(index + 1).padStart(2, "0")}` >
                        max.slice(0, 7)
                    }
                  >
                    {new Date(2024, index, 1).toLocaleDateString(undefined, {
                      month: "long",
                    })}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Year
              <select
                aria-label="Calendar year"
                value={year}
                onChange={(event) =>
                  moveMonth((Number(event.target.value) - year) * 12)
                }
              >
                {Array.from(
                  {
                    length:
                      Number(max.slice(0, 4)) - Number(min.slice(0, 4)) + 1,
                  },
                  (_, index) => Number(min.slice(0, 4)) + index,
                ).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div
            className="date-calendar-grid"
            role="grid"
            aria-label={monthName}
            onKeyDown={(event) => {
              const delta = {
                ArrowLeft: -1,
                ArrowRight: 1,
                ArrowUp: -7,
                ArrowDown: 7,
                Home: -((date.getDay() + 6) % 7),
                End: 6 - ((date.getDay() + 6) % 7),
              }[event.key];
              if (delta !== undefined) {
                event.preventDefault();
                const next = new Date(date);
                next.setDate(next.getDate() + delta);
                focusDay.current = true;
                setCursor(clamp(localDay(next.getTime())));
              }
              if (event.key === "PageUp" || event.key === "PageDown") {
                event.preventDefault();
                focusDay.current = true;
                moveMonth(
                  (event.key === "PageUp" ? -1 : 1) * (event.shiftKey ? 12 : 1),
                );
              }
            }}
          >
            <div role="row" className="date-calendar-week">
              {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((day) => (
                <span role="columnheader" key={day}>
                  {day}
                </span>
              ))}
            </div>
            {Array.from(
              { length: Math.ceil((offset + count) / 7) },
              (_, row) => (
                <div role="row" key={row}>
                  {Array.from({ length: 7 }, (_, column) => {
                    const day = row * 7 + column - offset + 1;
                    if (day < 1 || day > count)
                      return <span role="gridcell" key={column} />;
                    const key = localDay(
                      new Date(year, month, day, 12).getTime(),
                    );
                    return (
                      <button
                        type="button"
                        role="gridcell"
                        key={column}
                        data-day={key}
                        aria-label={key}
                        aria-selected={key === value}
                        aria-current={key === today ? "date" : undefined}
                        tabIndex={key === cursor ? 0 : -1}
                        disabled={!valid(key)}
                        onFocus={() => setCursor(key)}
                        onClick={() => choose(key)}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              ),
            )}
          </div>
          <div className="date-calendar-footer">
            <button
              className="quiet-button"
              type="button"
              disabled={!valid(today)}
              onClick={() => choose(today)}
            >
              Today
            </button>
            {!required && (
              <button
                className="quiet-button"
                type="button"
                onClick={() => choose("")}
              >
                Clear date
              </button>
            )}
            <button
              className="quiet-button"
              type="button"
              onClick={() => close(true)}
            >
              Close calendar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
