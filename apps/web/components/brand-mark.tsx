import type { CSSProperties } from "react";

import { BRAND_GLYPH_PATH } from "./brand-glyph.generated";

import { t } from "@/lib/i18n";

type ThemeOpt = { light?: boolean };

type BrandMarkProps = ThemeOpt & {
  size?: number;
  withWordmark?: boolean;
  /**
   * Follow the active theme via CSS variables instead of the JS `light` prop.
   * Use this in themed surfaces (e.g. the shell rail) so the seal renders
   * identical SSR/client markup — the `light` prop is client-state-derived and
   * caused a hydration mismatch (dark on the server, light on the client).
   */
  themed?: boolean;
};

// The logo on a 100-unit square — the same numbers as apps/mobile/scripts/make_icons.py.
const SQUARE_R = 41;
const squarePoints = (turn: number) =>
  Array.from({ length: 4 }, (_, k) => {
    const angle = ((turn + 45 + 90 * k) * Math.PI) / 180;
    return `${(50 + SQUARE_R * Math.cos(angle)).toFixed(2)},${(50 + SQUARE_R * Math.sin(angle)).toFixed(2)}`;
  }).join(" ");
const SQUARES = [squarePoints(0), squarePoints(45)];
/** The logo's geometry on its 100-unit square (lib/native-tab-icons.ts draws it too). */
export const BRAND_GEOMETRY = { ring: { r: 46, width: 3.2 }, squares: SQUARES, squareWidth: 3.4, nuqta: { cx: 50, cy: 67, r: 4 } } as const;

/**
 * BrandMark — the logo: the hizb star ۞ (two squares in a ring) whose centre
 * dot becomes the dot of a ب (a dotless ب drawn from Amiri Quran, over it).
 * The same drawing as the app icon and the favicon (make_icons.py). Scales
 * from 16px (favicon) to the onboarding hero.
 */
export function BrandMark({ size = 44, withWordmark = false, light = false, themed = false }: BrandMarkProps) {
  // In `themed` mode colors come from theme-aware CSS variables (resolved at
  // paint time from the body theme class), so the markup is theme-independent.
  const goldStroke = themed ? "var(--brand-mark-stroke)" : light ? "#a4812a" : "#d4af37";
  const goldFill = themed ? "var(--brand-mark-fill)" : light ? "#8a6a0c" : "#e9cf73";
  const markFilter = themed ? "var(--brand-mark-filter)" : light ? "none" : "drop-shadow(0 4px 14px rgba(212,175,55,0.18))";
  // Thin strokes vanish at small sizes: a little heavier below 28px.
  const weight = size < 28 ? 1.3 : 1;

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: withWordmark ? 12 : 0 }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
        style={{ flexShrink: 0, overflow: "visible", filter: markFilter }}
      >
        {/* Colors are applied via `style` (CSS) so `var()` resolves — SVG
            presentation attributes do not support CSS custom properties. */}
        <circle cx="50" cy="50" r="46" style={{ stroke: goldStroke }} strokeWidth={3.2 * weight} />
        {SQUARES.map((points) => (
          <polygon key={points} points={points} style={{ stroke: goldStroke }} strokeWidth={3.4 * weight} strokeLinejoin="miter" />
        ))}
        <path d={BRAND_GLYPH_PATH} style={{ fill: goldFill }} />
        <circle cx="50" cy="67" r="4" style={{ fill: goldFill }} />
      </svg>
      {withWordmark ? <Wordmark size={size} light={light} /> : null}
    </span>
  );
}

type BrandMarkRichProps = ThemeOpt & {
  size?: number;
  withWordmark?: boolean;
};

/**
 * BrandMarkRich — the full identity logo. An open mushaf beneath a
 * "baṣīrah" insight-lens with rays + the ب nuqṭa. Use at sizes >= 80px
 * (onboarding hero, auth screens, splash).
 */
export function BrandMarkRich({ size = 120, withWordmark = false, light = false }: BrandMarkRichProps) {
  const gold = "#d4af37";
  const goldBright = "#e9cf73";
  const inkBg = light ? "#fbf8ef" : "#1a160d";
  const stageBg = light
    ? "radial-gradient(circle at 30% 25%, #fbf8ef, #efe7cf 72%)"
    : "radial-gradient(circle at 30% 25%, #3a3221, #1a160d 72%)";
  const goldEdge = light ? "rgba(164,129,41,0.45)" : "rgba(212,175,55,0.45)";

  const stageStyle: CSSProperties = {
    width: size,
    height: size,
    borderRadius: Math.round(size * 0.175),
    background: stageBg,
    border: `1px solid ${goldEdge}`,
    boxShadow: light
      ? "0 12px 28px rgba(120,90,30,0.16), inset 0 1px 0 rgba(255,255,255,0.6)"
      : "inset 0 1px 0 rgba(255,255,255,0.06), 0 16px 36px rgba(0,0,0,0.42), 0 0 0 1px rgba(212,175,55,0.10)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
    flexShrink: 0,
  };

  const weaveStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    backgroundImage:
      `repeating-linear-gradient(45deg, ${light ? "rgba(164,129,41,0.08)" : "rgba(212,175,55,0.06)"} 0 1px, transparent 1px 14px),` +
      `repeating-linear-gradient(-45deg, ${light ? "rgba(164,129,41,0.07)" : "rgba(212,175,55,0.05)"} 0 1px, transparent 1px 14px)`,
    WebkitMaskImage: "radial-gradient(circle at center, black 30%, transparent 75%)",
    maskImage: "radial-gradient(circle at center, black 30%, transparent 75%)",
  };

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: withWordmark ? 18 : 0 }}>
      <span style={stageStyle}>
        <span aria-hidden style={weaveStyle} />
        <svg
          width={Math.round(size * 0.72)}
          height={Math.round(size * 0.72)}
          viewBox="0 0 120 120"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
          style={{ position: "relative", zIndex: 1 }}
        >
          <rect x="6" y="6" width="108" height="108" rx="20" stroke={gold} strokeWidth="0.5" strokeDasharray="1 4" opacity="0.35" fill="none" />
          <g>
            <line x1="60" y1="38" x2="60" y2="92" stroke="#7a5d18" strokeWidth="0.7" opacity="0.6" />
            <path d="M60 40 Q72 36 90 40 L90 90 Q72 86 60 90 Z" fill={light ? "rgba(212,175,55,0.06)" : "rgba(255,248,220,0.04)"} stroke={gold} strokeWidth="1.2" strokeLinejoin="round" />
            <path d="M60 40 Q48 36 30 40 L30 90 Q48 86 60 90 Z" fill={light ? "rgba(212,175,55,0.06)" : "rgba(255,248,220,0.04)"} stroke={gold} strokeWidth="1.2" strokeLinejoin="round" />
            <g stroke={gold} strokeWidth="0.9" strokeLinecap="round" opacity="0.55">
              <line x1="35" y1="50" x2="55" y2="50" />
              <line x1="38" y1="58" x2="55" y2="58" />
              <line x1="35" y1="66" x2="55" y2="66" />
              <line x1="65" y1="50" x2="85" y2="50" />
              <line x1="65" y1="58" x2="82" y2="58" />
              <line x1="65" y1="66" x2="85" y2="66" />
            </g>
            <circle cx="40" cy="74" r="2" fill="none" stroke={gold} strokeWidth="0.7" />
            <circle cx="80" cy="74" r="2" fill="none" stroke={gold} strokeWidth="0.7" />
          </g>
          <g transform="translate(60,38)">
            <path d="M-18 0 Q0 -14 18 0 Q0 14 -18 0 Z" fill={inkBg} stroke={goldBright} strokeWidth="1.4" strokeLinejoin="round" />
            <circle cx="0" cy="0" r="3.8" fill={goldBright} />
            <circle cx="0" cy="-0.8" r="1.2" fill={inkBg} />
            <g stroke={goldBright} strokeWidth="1" strokeLinecap="round" opacity="0.85">
              <line x1="-26" y1="-8" x2="-22" y2="-6" />
              <line x1="0" y1="-18" x2="0" y2="-14" />
              <line x1="26" y1="-8" x2="22" y2="-6" />
              <line x1="-22" y1="-14" x2="-19" y2="-11" />
              <line x1="22" y1="-14" x2="19" y2="-11" />
            </g>
          </g>
          <circle cx="60" cy="98" r="2.2" fill={gold} />
        </svg>
      </span>
      {withWordmark ? <Wordmark size={size * 0.42} light={light} extended /> : null}
    </span>
  );
}

type WordmarkProps = ThemeOpt & {
  size?: number;
  extended?: boolean;
};

export function Wordmark({ size = 24, light = false, extended = false }: WordmarkProps) {
  return (
    <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.1, minWidth: 0 }}>
      <span
        style={{
          fontFamily: "var(--font-arabic-display)",
          fontSize: size,
          color: light ? "#8a6a0c" : "#d4af37",
          letterSpacing: "-0.005em",
          whiteSpace: "nowrap",
        }}
      >
        {t("بصائر")} <span style={{ color: light ? "#a6810c" : "#e9cf73" }}>{t("القرآن")}</span>
      </span>
      {extended ? (
        <>
          <span
            style={{
              fontFamily: "var(--font-arabic-ui)",
              fontSize: Math.max(11, size * 0.4),
              color: "var(--fg-2)",
              marginTop: 6,
              lineHeight: 1.5,
              maxWidth: 320,
            }}
          >
            {t("مساحة عمل للبحث القرآني العميق")}
          </span>
          <span
            style={{
              fontFamily: "var(--font-arabic-ui)",
              fontSize: Math.max(9, size * 0.3),
              color: "var(--fg-3)",
              letterSpacing: "0.18em",
              marginTop: 6,
              textTransform: "uppercase",
            }}
          >
            BASAIR · INSIGHTS OF THE QUR&apos;AN
          </span>
        </>
      ) : size >= 18 ? (
        <span
          style={{
            fontFamily: "var(--font-arabic-ui)",
            fontSize: Math.max(9, size * 0.34),
            color: "var(--fg-3)",
            letterSpacing: "0.10em",
            marginTop: 2,
            textTransform: "uppercase",
          }}
        >
          BASAIR
        </span>
      ) : null}
    </span>
  );
}

export type AvatarMotif = "ba" | "noon" | "meem" | "hamza" | "alif" | "ya" | "star8" | "rosette";

type AvatarSpec =
  | { kind: "letter"; glyph: string; label: string }
  | { kind: "star8"; label: string }
  | { kind: "rosette"; label: string };

export const AVATAR_MOTIFS: Record<AvatarMotif, AvatarSpec> = {
  ba: { kind: "letter", glyph: "ب", get label() {
    return t("باء");
  } },
  noon: { kind: "letter", glyph: "ن", get label() {
    return t("نون");
  } },
  meem: { kind: "letter", glyph: "م", get label() {
    return t("ميم");
  } },
  hamza: { kind: "letter", glyph: "ء", get label() {
    return t("همزة");
  } },
  alif: { kind: "letter", glyph: "ا", get label() {
    return t("ألف");
  } },
  ya: { kind: "letter", glyph: "ي", get label() {
    return t("ياء");
  } },
  star8: { kind: "star8", get label() {
    return t("نجمة ثُمانيّة");
  } },
  rosette: { kind: "rosette", get label() {
    return t("وردة");
  } },
};

type UserAvatarProps = ThemeOpt & {
  motif?: AvatarMotif;
  size?: number;
  ring?: boolean;
};

export function UserAvatar({ motif = "ba", size = 36, ring = true, light = false }: UserAvatarProps) {
  const m = AVATAR_MOTIFS[motif] ?? AVATAR_MOTIFS.ba;
  const grad = light
    ? "linear-gradient(135deg, #f6e8b2, #d4af37)"
    : "linear-gradient(135deg, #eac54a, #8a6a0c)";
  const inkOnGold = "#1a1207";

  const tileStyle: CSSProperties = {
    width: size,
    height: size,
    borderRadius: 999,
    background: grad,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: inkOnGold,
    border: ring ? "2px solid rgba(212,175,55,0.5)" : "none",
    flexShrink: 0,
    boxShadow: light ? "0 4px 12px rgba(120,90,30,0.16)" : "0 4px 14px rgba(212,175,55,0.18)",
  };

  return (
    <span style={tileStyle} aria-label={m.label} role="img">
      {m.kind === "letter" ? (
        <span
          style={{
            fontFamily: "var(--font-arabic-display)",
            fontSize: size * 0.55,
            fontWeight: 600,
            lineHeight: 1,
          }}
        >
          {m.glyph}
        </span>
      ) : m.kind === "star8" ? (
        <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M12 1l3 6 6 -3 -3 6 6 3 -6 3 3 6 -6 -3 -3 6 -3 -6 -6 3 3 -6 -6 -3 6 -3 -3 -6z" fill={inkOnGold} opacity="0.9" />
        </svg>
      ) : (
        <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none" aria-hidden>
          <g stroke={inkOnGold} strokeWidth="1.2" fill="none">
            <circle cx="12" cy="12" r="6" />
            <circle cx="12" cy="12" r="2" fill={inkOnGold} />
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
              const a = (i / 8) * Math.PI * 2;
              return <line key={i} x1={12} y1={12} x2={12 + Math.cos(a) * 9} y2={12 + Math.sin(a) * 9} />;
            })}
          </g>
        </svg>
      )}
    </span>
  );
}
