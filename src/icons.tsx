import type { CSSProperties } from "react";
export type IconName =
  | "play"
  | "pause"
  | "plus"
  | "close"
  | "notes"
  | "settings"
  | "history"
  | "calendar"
  | "pencil"
  | "arrow"
  | "download"
  | "upload"
  | "fit"
  | "trash"
  | "tree"
  | "vertex"
  | "deadline"
  | "thought"
  | "reading"
  | "habit"
  | "external"
  | "check";
export function Icon({
  name,
  size = 18,
  style,
}: {
  name: IconName;
  size?: number;
  style?: CSSProperties;
}) {
  const paths: Record<IconName, string> = {
    play: "M8 5 19 12 8 19Z",
    pause: "M8 5v14M16 5v14",
    plus: "M12 5v14M5 12h14",
    close: "m6 6 12 12M18 6 6 18",
    notes: "M6 3h9l4 4v14H6ZM14 3v5h5M9 12h7M9 16h5",
    history: "M3 11a9 9 0 1 1 2.6 6.4M3 4v7h7M12 7v5l3 2",
    calendar: "M4 5h16v16H4ZM8 3v4m8-4v4M4 10h16M8 14h2m4 0h2m-8 3h2",
    settings:
      "M21.78 9.92L21.78 14.08L19.42 14.41L18.95 15.54L20.39 17.45L17.45 20.39L15.54 18.95L14.41 19.42L14.08 21.78L9.92 21.78L9.59 19.42L8.46 18.95L6.55 20.39L3.61 17.45L5.05 15.54L4.58 14.41L2.22 14.08L2.22 9.92L4.58 9.59L5.05 8.46L3.61 6.55L6.55 3.61L8.46 5.05L9.59 4.58L9.92 2.22L14.08 2.22L14.41 4.58L15.54 5.05L17.45 3.61L20.39 6.55L18.95 8.46L19.42 9.59ZM15.5 12a3.5 3.5 0 1 0-7 0 3.5 3.5 0 1 0 7 0",
    pencil: "m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14Z",
    arrow: "M5 12h14m-6-6 6 6-6 6",
    download: "M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5",
    upload: "M12 16V4m-5 5 5-5 5 5M5 16v5h14v-5",
    fit: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5",
    trash: "M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7",
    tree: "M12 5 5 18m7-13 7 13M9 5a3 3 0 1 0 6 0 3 3 0 1 0-6 0M2 19a3 3 0 1 0 6 0 3 3 0 1 0-6 0m14 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0",
    check: "m5 12 4 4L19 6",
    vertex: "M20 12a8 8 0 1 0-16 0 8 8 0 1 0 16 0M12 8v8m-4-4h8",
    deadline:
      "M20 13a8 8 0 1 0-16 0 8 8 0 1 0 16 0M12 9v5l3 2M9 2h6m-3 0v3m6 2 2-2",
    thought:
      "M21 11c0 5-4 8-10 8l-5 3 1-4C4 17 2 14 2 11c0-5 4-8 10-8s9 3 9 8ZM7 11h.01M12 11h.01M17 11h.01",
    reading:
      "M12 5C9 3 5 3 2 4v15c3-1 7-1 10 1m0-15c3-2 7-2 10-1v15c-3-1-7-1-10 1Zm-7 3h4m-4 4h4m6-4h4m-4 4h4",
    habit:
      "M20 7a9 9 0 0 0-15-2L2 8m0-5v5h5M4 17a9 9 0 0 0 15 2l3-3m0 5v-5h-5m-8-4 2 2 4-4",
    external: "M14 3h7v7m0-7L10 14M10 4H4v16h16v-6",
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={name === "play" ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
