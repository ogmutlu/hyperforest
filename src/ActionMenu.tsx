import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

/** A disclosure of ordinary buttons, with outside-click and Escape dismissal. */
export function ActionMenu({
  label,
  children,
  above = false,
  trigger,
  descriptionId,
}: {
  label: string;
  children: ReactNode;
  above?: boolean;
  trigger?: ReactNode;
  descriptionId?: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const dismiss = (event: PointerEvent): void => {
      if (
        ref.current?.open &&
        event.target instanceof Node &&
        !ref.current.contains(event.target)
      )
        ref.current?.removeAttribute("open");
    };
    const escape = (event: KeyboardEvent): void => {
      if (!ref.current?.open || event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      ref.current?.removeAttribute("open");
      ref.current?.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape, true);
    };
  }, []);
  return (
    <details
      ref={ref}
      className={`action-menu${above ? " action-menu-above" : ""}`}
    >
      <summary aria-label={label} aria-describedby={descriptionId}>
        {trigger ?? <span aria-hidden="true">⋯</span>}
      </summary>
      <div
        className="action-menu-items"
        onClick={(event) => {
          if (event.target instanceof Element && event.target.closest("button"))
            ref.current?.removeAttribute("open");
        }}
      >
        {children}
      </div>
    </details>
  );
}
