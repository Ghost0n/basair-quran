"use client";

import { useEffect, useRef, useState, type RefObject, type CSSProperties } from "react";

import { Icon } from "@/components/icon";
import { setShowHighlights, useShowHighlights } from "@/features/themes/ayah-marks";
import { useNumerals, usePreferences } from "@/lib/preferences-context";
import { swallowNextClick, useExclusiveOverlay } from "@/lib/exclusive-overlay";
import { useIsMobile } from "@/lib/use-is-mobile";
import { useWebDesign } from "@/lib/use-web-design";

import { READER_MODES, resolveReaderMode } from "../reader-modes";

import { t } from "@/lib/i18n";

const FONT_MIN = 18;
const FONT_MAX = 48;

/**
 * The size slider. While dragging it only moves `--fs-ayah` (a CSS-only
 * change, once per frame); the preference — which re-renders the app and
 * re-fits the page — is committed when the drag settles.
 */
function FontSizeSlider({ value, disabled, onCommit }: { value: number; disabled?: boolean; onCommit: (size: number) => void }) {
  const [draft, setDraft] = useState(value);
  const frame = useRef(0);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const draftRef = useRef(value);
  draftRef.current = draft;
  const changeRef = useRef<(size: number) => void>(() => {});

  useEffect(() => setDraft(value), [value]);

  // The wheel moves the size one step per notch, over the slider (a native,
  // non-passive listener so the page under it doesn't scroll as well).
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    function onWheel(event: WheelEvent) {
      if (!input || input.disabled || event.ctrlKey || event.deltaY === 0) return;
      event.preventDefault();
      const step = event.deltaY < 0 ? 1 : -1;
      const next = Math.min(FONT_MAX, Math.max(FONT_MIN, draftRef.current + step));
      if (next !== draftRef.current) changeRef.current(next);
    }
    input.addEventListener("wheel", onWheel, { passive: false });
    return () => input.removeEventListener("wheel", onWheel);
  }, []);
  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      if (settle.current) clearTimeout(settle.current);
    },
    [],
  );

  function change(size: number) {
    draftRef.current = size;
    setDraft(size);
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      document.documentElement.style.setProperty("--fs-ayah", `${size / 16}rem`);
    });
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => onCommit(size), 220);
  }

  changeRef.current = change;

  return (
    <input
      ref={inputRef}
      type="range"
      min={FONT_MIN}
      max={FONT_MAX}
      step={1}
      value={draft}
      disabled={disabled}
      aria-label={t("حجم خطّ الآيات")}
      // The filled share of the track (the web design paints it in gold).
      style={{ "--fill": `${((draft - FONT_MIN) / (FONT_MAX - FONT_MIN)) * 100}%` } as CSSProperties}
      onChange={(event) => change(Number(event.target.value))}
    />
  );
}

/**
 * «العرض» — the reader's display controls, as a strip that drops under the
 * reader bar instead of a modal: no backdrop, so the page stays in view (and
 * re-sizes live) while the text size changes. Reading mode, text size and
 * the themes' highlights; theme and numerals live in Settings. Escape, the
 * «العرض» button again, or a press anywhere outside the reader's head closes it.
 */
export function DisplayStrip({ onClose, headRef }: { onClose: () => void; headRef: RefObject<HTMLElement | null> }) {
  const { preferences, updateAccount, updateAccountDebounced } = usePreferences();
  const formatNumber = useNumerals();
  const mode = resolveReaderMode(preferences.reader_layout);
  const showHighlights = useShowHighlights();
  // Phones — and the desktop web design — pin the printed page at one fixed
  // size: the size control shows, inactive, until verse-by-verse mode.
  const web = useWebDesign();
  const phone = useIsMobile();
  const sizeLocked = (phone || web) && mode === "pages";
  useExclusiveOverlay(true, onClose);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    function onPointer(event: PointerEvent) {
      if (headRef.current?.contains(event.target as Node)) return;
      onClose();
      // Touch: the tap only closes the strip; the page under it doesn't react.
      const target = event.target as Element | null;
      if (event.pointerType !== "mouse" && !target?.closest?.(".qb-reader-back")) swallowNextClick();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer, true);
    };
  }, [onClose, headRef]);

  return (
    <div className="qb-display-strip" role="group" aria-label={t("العرض")}>
      <div className="modes" role="group" aria-label={t("طريقة القراءة (Shift+M)")}>
        {READER_MODES.map((item) => (
          <button
            key={item.mode}
            type="button"
            className={mode === item.mode ? "active" : ""}
            aria-pressed={mode === item.mode}
            title={item.hint}
            onClick={() => void updateAccount({ reader_layout: item.layout })}
          >
            <Icon name={item.icon} size={16} />
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      <div className={`size${sizeLocked ? " locked" : ""}`} aria-label={t("حجم الخطّ")} role="group">
        <button
          type="button"
          className="step"
          aria-label={t("تصغير الخطّ")}
          disabled={sizeLocked || preferences.font_size <= FONT_MIN}
          onClick={() => updateAccountDebounced({ font_size: Math.max(FONT_MIN, preferences.font_size - 2) })}
        >
          ا
        </button>
        <FontSizeSlider value={preferences.font_size} disabled={sizeLocked} onCommit={(size) => updateAccountDebounced({ font_size: size })} />
        <button
          type="button"
          className="step big"
          aria-label={t("تكبير الخطّ")}
          disabled={sizeLocked || preferences.font_size >= FONT_MAX}
          onClick={() => updateAccountDebounced({ font_size: Math.min(FONT_MAX, preferences.font_size + 2) })}
        >
          ا
        </button>
        <span className="value" aria-hidden>
          {formatNumber(preferences.font_size)}
        </span>
      </div>

      <button
        type="button"
        className={`toggle${showHighlights ? " active" : ""}`}
        aria-pressed={showHighlights}
        title={t("تظليل المواضيع")}
        onClick={() => setShowHighlights(!showHighlights)}
      >
        <Icon name="highlight" size={16} />
        <span>{t("تظليل المواضيع")}</span>
      </button>
    </div>
  );
}
