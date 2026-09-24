/**
 * Icon catalogue — Lucide-style stroke icons on a 24px viewBox.
 * Stroke 1.75 by default, inherits currentColor.
 * Add icons here rather than inlining SVG in components.
 */

export const ICON_PATHS = {
  search: "M11 4a7 7 0 1 1 0 14a7 7 0 0 1 0-14zm6.32 12.9L21 20.58",
  book: "M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2V5zM18 3v16M6 19h12",
  sparkles: "M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8",
  bookmark: "M6 3h12v18l-6-4-6 4V3z",
  select: "M9 5h6M9 19h6M12 5v14M4 8V6a2 2 0 0 1 2-2M20 8V6a2 2 0 0 0-2-2M4 16v2a2 2 0 0 0 2 2M20 16v2a2 2 0 0 1-2 2",
  bookmarkFilled: "M6 3h12v18l-6-4-6 4V3z",
  notebook: "M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V4zm0 0v14M9 8h6M9 12h6M9 16h4",
  history: "M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2",
  copy: "M8 8h11v12H8zM4 4h11v3M4 4v11h3",
  share: "M4 12v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6M16 6l-4-4-4 4M12 2v14",
  download: "M4 17v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3M7 11l5 5 5-5M12 4v12",
  expand: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  shrink: "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5",
  textSize: "M3 19l5-13 5 13M5 14h6M14 19l3.5-8 3.5 8M15.2 16.5h4.6",
  chevLeft: "M15 6l-6 6 6 6",
  chevRight: "M9 6l6 6-6 6",
  chevDown: "M6 9l6 6 6-6",
  chevUp: "M6 15l6-6 6 6",
  close: "M6 6l12 12M18 6l-12 12",
  settings:
    "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  send: "M4 12l16-8-7 16-2-7-7-1z",
  alert: "M12 3l10 18H2zM12 9v5M12 18v.5",
  sun: "M12 4v3M12 17v3M5 12H2M22 12h-3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1M12 8a4 4 0 1 1 0 8a4 4 0 0 1 0-8z",
  moon: "M20 14a8 8 0 1 1-8-10a6 6 0 0 0 8 10z",
  layers: "M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 18l9 5 9-5",
  filter: "M3 5h18l-7 9v6l-4-2v-4z",
  sliders: "M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4",
  plus: "M12 5v14M5 12h14",
  zap: "M13 3l-9 11h7l-1 7 9-11h-7l1-7z",
  feather: "M16 4l4 4-12 12H4v-4zM10 14l8-8",
  scale: "M12 4v16M4 8l8-4 8 4M4 8l3 7h4l3-7M16 8l3 7h-3",
  play: "M6 4l14 8-14 8z",
  pause: "M6 4h4v16H6zM14 4h4v16h-4z",
  volume: "M4 9v6h4l5 4V5L8 9H4z",
  user: "M12 4a4 4 0 1 1 0 8a4 4 0 0 1 0-8zM4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1",
  trash: "M4 6h16M9 6V4h6v2M6 6l1 14h10l1-14",
  pin: "M8 4h8l-1 6 4 4H5l4-4-1-6z M12 14v6",
  pinFilled: "M8 4h8l-1 6 4 4H5l4-4-1-6z M12 14v6",
  link: "M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  menu: "M4 6h16M4 12h16M4 18h16",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  arrowLeft: "M19 12H5M11 6l-6 6 6 6",
  arrowDownLeft: "M17 7L7 17M7 17h7M7 17v-7",
  graph: "M3 3v18h18M7 14l3-3 4 4 6-6",
  globe: "M12 3a9 9 0 1 1 0 18a9 9 0 0 1 0-18zM3 12h18M12 3a13 13 0 0 1 0 18M12 3a13 13 0 0 0 0 18",
  tree: "M12 4v16M12 4l6 4M12 4l-6 4M12 12l4 3M12 12l-4 3",
  highlight: "M9 14l-3 6h6M14 4l6 6-9 9-6-6z",
  ear: "M9 6a4 4 0 1 1 6 5l-2 2v3a3 3 0 0 1-6 0",
  edit: "M4 20h4l11-11-4-4L4 16zM14 5l4 4",
  check: "M5 13l5 5L20 7",
  flag: "M5 4v17M5 5h12l-2 4 2 4H5",
  cards: "M3 5h12v12H3zM7 9h12v12H7",
  page: "M6 3h9l4 4v14H6zM14 3v5h5",
  mosque: "M4 21V11l8-7 8 7v10M9 21v-6h6v6M12 4v3",
  compass: "M12 3a9 9 0 1 1 0 18a9 9 0 0 1 0-18zM15 9l-2 6-4 2 2-6z",
  command: "M9 6h-3a3 3 0 1 0 3 3v0v6v0a3 3 0 1 0-3 3h3 M15 6h3a3 3 0 1 1-3 3v0v6v0a3 3 0 1 1 3 3h-3 M9 6h6v12H9z",
  // Strict evidence (gold) — shield with check. Tafssir (copper) — flask.
  shieldCheck:
    "M20 13c0 5-3.5 7.5-7.7 9a.6.6 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.2 1.2 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1ZM9 12l2 2 4-4",
  flask: "M10 2v7.5L4.7 19a2 2 0 0 0 1.8 3h11a2 2 0 0 0 1.8-3L14 9.5V2M8.5 2h7",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  monitor: "M3 4h18v12H3zM8 20h8M12 16v4",
  smartphone: "M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2",
  skipBack: "M19 20L9 12l10-8v16zM5 19V5",
  skipForward: "M5 4l10 8-10 8V4zM19 5v14",
  repeat: "M17 2l4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3",
} as const;

export type IconName = keyof typeof ICON_PATHS;

type IconProps = {
  name: IconName;
  size?: number;
  stroke?: number;
  className?: string;
  title?: string;
};

export function Icon({ name, size = 18, stroke = 1.75, className = "", title }: IconProps) {
  const d = ICON_PATHS[name];
  return (
    <span className={`qb-icon ${className}`.trim()} style={{ width: size, height: size, display: "inline-flex" }}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        width={size}
        height={size}
        role={title ? "img" : undefined}
        aria-label={title}
        aria-hidden={title ? undefined : true}
      >
        {title ? <title>{title}</title> : null}
        <path d={d} />
      </svg>
    </span>
  );
}
