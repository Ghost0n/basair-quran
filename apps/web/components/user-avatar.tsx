"use client";

import { useId, type CSSProperties, type ReactNode } from "react";

import { type AvatarLook, type AvatarPattern, type AvatarTone, avatarInitial, avatarLook, isArabicLetter } from "@/lib/avatar";

/**
 * The illuminator's colours: each a ground (light to deep), the pattern's line,
 * and the letter. Lines stay faint; the letter carries the contrast.
 */
const TONES: Record<AvatarTone, { from: string; to: string; line: string; letter: string }> = {
  gold: { from: "#ecca5c", to: "#8f6c10", line: "rgba(40, 26, 4, 0.34)", letter: "#1c1306" },
  lapis: { from: "#4567a8", to: "#1c2b55", line: "rgba(236, 214, 150, 0.36)", letter: "#f4e6bd" },
  malachite: { from: "#3f8a70", to: "#163f34", line: "rgba(236, 226, 190, 0.32)", letter: "#f2ead0" },
  cinnabar: { from: "#c46a4c", to: "#6b281a", line: "rgba(255, 232, 205, 0.32)", letter: "#fdeedd" },
  ink: { from: "#54432f", to: "#1f1710", line: "rgba(226, 190, 96, 0.4)", letter: "#e9c869" },
  vellum: { from: "#f4ead0", to: "#cfb98a", line: "rgba(92, 66, 22, 0.28)", letter: "#4a3410" },
};

const SQRT3 = Math.sqrt(3);

// Arabic letters differ in height: tall ones (ا ل ك ط) rise above the line,
// others (ع ح م ي ن…) fall below it. Each is sized and lifted to sit in the middle.
const TALL = /[اأإآلكطظ]/;
const DESCENDING = /[عغحجخميىرزونقسشصضة]/;

function letterSetting(letter: string, arabic: boolean): { scale: number; lift: number } {
  if (!arabic) return { scale: 0.44, lift: 0 };
  if (TALL.test(letter)) return { scale: 0.5, lift: -0.02 };
  if (DESCENDING.test(letter)) return { scale: 0.56, lift: 0.09 };
  return { scale: 0.56, lift: 0.04 };
}

/** One pattern's drawing, in a 100×100 disc, as a repeating tile or whole. */
function patternArt(pattern: AvatarPattern, id: string, line: string, size: number): ReactNode {
  // About a pixel on screen at any size (the drawing is 100 units wide).
  const stroke = { fill: "none", stroke: line, strokeWidth: Math.max(1.3, 95 / size) };
  // Small medallions get fewer, larger tiles: the pattern reads as a pattern.
  const scale = size < 44 ? 1.5 : 1;
  switch (pattern) {
    case "khatam": {
      // The eight-pointed star of two squares, linked edge to edge.
      const d = "M7 7H17V17H7Z M12 4.93L19.07 12L12 19.07L4.93 12Z M0 12H4.93 M19.07 12H24 M12 0V4.93 M12 19.07V24";
      return tile(id, 24, 24, scale, <path d={d} {...stroke} />);
    }
    case "triangles": {
      const w = 22;
      const h = w * SQRT3;
      const d = [
        `M0 0H${w} M0 ${h / 2}H${w} M0 ${h}H${w}`,
        `M0 0L${w} ${h} M${-w} 0L0 ${h} M${w} 0L${2 * w} ${h}`,
        `M${w} 0L0 ${h} M0 0L${-w} ${h} M${2 * w} 0L${w} ${h}`,
      ].join(" ");
      return tile(id, w, h, scale, <path d={d} {...stroke} />);
    }
    case "lattice":
      return tile(id, 20, 20, scale, <path d="M0 10L10 0L20 10L10 20Z" {...stroke} />);
    case "circles":
      return tile(
        id,
        22,
        22,
        scale,
        <g {...stroke}>
          {[
            [0, 0],
            [22, 0],
            [0, 22],
            [22, 22],
            [11, 11],
          ].map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={11} />
          ))}
        </g>,
      );
    case "shamsa": {
      // A sun of sixteen rays between two rings.
      const rays = Array.from({ length: 16 }, (_, index) => {
        const angle = (index / 16) * Math.PI * 2;
        const [inner, outer] = index % 2 ? [30, 44] : [24, 50];
        return `M${50 + Math.cos(angle) * inner} ${50 + Math.sin(angle) * inner}L${50 + Math.cos(angle) * outer} ${50 + Math.sin(angle) * outer}`;
      }).join(" ");
      return (
        <g {...stroke}>
          <circle cx={50} cy={50} r={24} />
          <circle cx={50} cy={50} r={44} />
          <path d={rays} />
        </g>
      );
    }
    case "plain":
      return null;
  }
}

function tile(id: string, width: number, height: number, scale: number, art: ReactNode): ReactNode {
  return (
    <>
      <defs>
        <pattern
          id={`${id}-tile`}
          width={width}
          height={height}
          patternUnits="userSpaceOnUse"
          patternTransform={scale === 1 ? undefined : `scale(${scale})`}
        >
          {art}
        </pattern>
      </defs>
      <rect width={100} height={100} fill={`url(#${id}-tile)`} />
    </>
  );
}

type MedallionProps = {
  letter: string;
  look: AvatarLook;
  size?: number;
  /** A thin gold ring around it (the rail, the account card). */
  ring?: boolean;
  /** What a screen reader says (none: decorative, the name is beside it). */
  label?: string;
};

/** The medallion itself: the letter on its pattern and colour. */
export function AvatarMedallion({ letter, look, size = 36, ring = true, label }: MedallionProps) {
  // Usable in url(#…) whatever React's id looks like («r1», :r1:).
  const id = `qa${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const tone = TONES[look.tone];
  const arabic = isArabicLetter(letter);
  const setting = letterSetting(letter, arabic);
  const box: CSSProperties = {
    position: "relative",
    display: "inline-grid",
    placeItems: "center",
    width: size,
    height: size,
    flexShrink: 0,
    borderRadius: 999,
    boxShadow: ring
      ? `0 0 0 ${size >= 48 ? 2 : 1.5}px rgba(212, 175, 55, 0.55), 0 4px 14px rgba(40, 26, 4, 0.18)`
      : undefined,
  };
  return (
    <span style={box} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <svg width={size} height={size} viewBox="0 0 100 100" style={{ position: "absolute", inset: 0 }} aria-hidden>
        <defs>
          <clipPath id={`${id}-disc`}>
            <circle cx={50} cy={50} r={50} />
          </clipPath>
          <radialGradient id={`${id}-ground`} cx="32%" cy="26%" r="85%">
            <stop offset="0%" stopColor={tone.from} />
            <stop offset="100%" stopColor={tone.to} />
          </radialGradient>
          {/* The pattern clears toward the middle, where the letter sits. */}
          <radialGradient id={`${id}-fade`}>
            <stop offset="34%" stopColor="#000" />
            <stop offset="72%" stopColor="#fff" />
          </radialGradient>
          <mask id={`${id}-mask`}>
            <rect width={100} height={100} fill={`url(#${id}-fade)`} />
          </mask>
        </defs>
        <g clipPath={`url(#${id}-disc)`}>
          <rect width={100} height={100} fill={`url(#${id}-ground)`} />
          <g mask={`url(#${id}-mask)`}>{patternArt(look.pattern, id, tone.line, size)}</g>
        </g>
      </svg>
      <span
        style={{
          position: "relative",
          color: tone.letter,
          // Names are set in the heading face (Amiri); the Quran face is for Quran text only.
          fontFamily: arabic ? "var(--font-arabic-heading)" : "var(--font-arabic-ui)",
          fontSize: size * setting.scale,
          fontWeight: arabic ? 600 : 700,
          lineHeight: 1,
          transform: setting.lift ? `translateY(${-size * setting.lift}px)` : undefined,
        }}
      >
        {letter}
      </span>
    </span>
  );
}

type UserAvatarProps = {
  user: { id: number | string; name?: string | null; email?: string | null; avatar?: string | null };
  size?: number;
  ring?: boolean;
  label?: string;
};

/** A reader's medallion: their initial, and the look they chose or were given (lib/avatar.ts). */
export function UserAvatar({ user, size, ring, label }: UserAvatarProps) {
  return (
    <AvatarMedallion
      letter={avatarInitial(user.name, user.email)}
      look={avatarLook(user.avatar, user.id)}
      size={size}
      ring={ring}
      label={label}
    />
  );
}
