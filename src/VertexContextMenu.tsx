import { useEffect, useLayoutEffect, useRef } from "react";
import type { IconName } from "./icons";
import { Icon } from "./icons";

export interface VertexMenuItem {
  label: string;
  icon: IconName;
  action: string;
  disabled?: boolean;
}
export function VertexContextMenu({
  title,
  x,
  y,
  items,
  choose,
  close,
}: {
  title: string;
  x: number;
  y: number;
  items: VertexMenuItem[];
  choose: (action: string) => void;
  close: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const previousFocus = useRef(document.activeElement);
  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const bounds = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8))}px`;
    menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [x, y]);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target))
        close();
    };
    const scroll = () => close();
    document.addEventListener("pointerdown", dismiss, true);
    window.addEventListener("resize", scroll);
    document.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      window.removeEventListener("resize", scroll);
      document.removeEventListener("scroll", scroll, true);
    };
  }, [close]);
  return (
    <div
      ref={ref}
      role="menu"
      aria-label={`Actions for ${title}`}
      className="vertex-context-menu"
      style={{ left: x, top: y }}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        const buttons = [
          ...(ref.current?.querySelectorAll<HTMLButtonElement>(
            "button:not(:disabled)",
          ) ?? []),
        ];
        const index = buttons.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        if (event.key === "Escape" || event.key === "Tab") {
          event.preventDefault();
          event.stopPropagation();
          close();
          if (
            previousFocus.current instanceof HTMLElement ||
            previousFocus.current instanceof SVGElement
          )
            previousFocus.current.focus();
          return;
        }
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? buttons.length - 1
                : (index +
                    (event.key === "ArrowUp" ? -1 : 1) +
                    buttons.length) %
                  buttons.length;
          buttons[next]?.focus();
        }
      }}
    >
      <div className="vertex-context-title">{title}</div>
      {items.map((item) => (
        <button
          key={item.action}
          role="menuitem"
          disabled={item.disabled}
          onClick={() => choose(item.action)}
        >
          <Icon name={item.icon} size={16} />
          {item.label}
        </button>
      ))}
    </div>
  );
}
