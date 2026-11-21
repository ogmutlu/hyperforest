import type { CSSProperties } from "react";
export type IconName =
  | "play"
  | "pause"
  | "plus"
  | "close"
  | "notes"
  | "settings"
  | "history"
  | "undo"
  | "palette"
  | "link"
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
  | "bucket"
  | "reading"
  | "habit"
  | "external"
  | "check"
  | "finish"
  | "sidebar"
  | "trophy"
  | "lock"
  | "star"
  | "flame"
  | "volume"
  | "volumeOff";
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
    undo: "m9 4-6 6 6 6M3 10h11a6 6 0 0 1 6 6v4",
    palette:
      "M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 1-4c-2-1-1-3 1-3h2c5 0 4-11-6-11ZM7 9h.01M10 6h.01M15 6h.01M18 9h.01",
    link: "m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 2 1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0",
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
    sidebar: "M3 3h18v18H3ZM9 3v18M5 7h2m-2 4h2m-2 4h2",
    finish: "M5 22V3m0 1c5-4 9 4 15 0v11c-6 4-10-4-15 0",
    check: "m5 12 4 4L19 6",
    vertex: "M20 12a8 8 0 1 0-16 0 8 8 0 1 0 16 0",
    deadline:
      "M20 13a8 8 0 1 0-16 0 8 8 0 1 0 16 0M12 9v5l3 2M9 2h6m-3 0v3m6 2 2-2",
    bucket: "M3 7h18l-2 14H5ZM6 7V5a6 6 0 0 1 12 0v2M3 11h18",
    thought:
      "M21 11c0 5-4 8-10 8l-5 3 1-4C4 17 2 14 2 11c0-5 4-8 10-8s9 3 9 8ZM7 11h.01M12 11h.01M17 11h.01",
    reading:
      "M12 5C9 3 5 3 2 4v15c3-1 7-1 10 1m0-15c3-2 7-2 10-1v15c-3-1-7-1-10 1Zm-7 3h4m-4 4h4m6-4h4m-4 4h4",
    habit:
      "M20 7a9 9 0 0 0-15-2L2 8m0-5v5h5M4 17a9 9 0 0 0 15 2l3-3m0 5v-5h-5m-8-4 2 2 4-4",
    external: "M14 3h7v7m0-7L10 14M10 4H4v16h16v-6",
    trophy:
      "M8 21h8m-4-4v4M7 4h10v5a5 5 0 0 1-10 0ZM7 6H4v2a3 3 0 0 0 3 3m10-5h3v2a3 3 0 0 1-3 3",
    lock: "M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5Z",
    star: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9Z",
    flame:
      "M12 22c4.4 0 7-3.1 7-7 0-3.2-2-6.1-4.5-8.5-.3 1.8-1.3 2.8-2.5 3.3.3-3.2-.8-6-3-7.8 0 2.5-1.3 4.3-2.5 5.8C5.4 9.2 5 11.1 5 15c0 3.9 2.6 7 7 7Z",
    volume:
      "M11 5 6 9H2v6h4l5 4ZM15.5 8.5a5 5 0 0 1 0 7M19 5a9.5 9.5 0 0 1 0 14",
    volumeOff: "M11 5 6 9H2v6h4l5 4ZM22 9l-6 6m0-6 6 6",
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
