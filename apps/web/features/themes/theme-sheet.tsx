"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { ThemeColor } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { useNumerals } from "@/lib/preferences-context";
import { useDialog } from "@/lib/use-dialog";
import type { SavableAyah, SavedAyat } from "@/features/reading/use-saved-ayat";

import { THEME_PALETTE, nextThemeColor } from "./palette";
import { createTheme, useThemes } from "./themes-store";

/**
 * «حفظ وتظليل» — the reader's save action. Opening it saves the ayah (so one tap
 * still means "saved"); the researcher then highlights it with one or more
 * themes (مواضيع), creating one inline if needed. Grouping by subject happens
 * as a side effect of reading, instead of a passive bookmark list.
 */
export function ThemeSheet({
  ayah,
  saved,
  onClose,
}: {
  ayah: SavableAyah;
  saved: SavedAyat;
  onClose: () => void;
}) {
  const panelRef = useDialog<HTMLDivElement>(onClose);
  const formatNumber = useNumerals();
  const { themes, loaded } = useThemes();
  const [name, setName] = useState("");
  const [color, setColor] = useState<ThemeColor | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The initial save, awaited before the first theme change so it can't race.
  const savingRef = useRef<Promise<unknown> | null>(null);

  const isSaved = saved.isSaved(ayah.ayah_id);
  const selected = saved.themeIdsOf(ayah.ayah_id);
  const suggested = color ?? nextThemeColor(themes.map((theme) => theme.color));

  useEffect(() => {
    if (!saved.isSaved(ayah.ayah_id)) savingRef.current = saved.save(ayah);
    // Only on open: later removals from this sheet must not re-save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function applyThemes(next: number[]) {
    setError(null);
    if (savingRef.current) await savingRef.current;
    await saved.setThemes(ayah, next);
  }

  function toggleTheme(themeId: number) {
    const next = selected.includes(themeId) ? selected.filter((id) => id !== themeId) : [...selected, themeId];
    void applyThemes(next);
  }

  async function addTheme() {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createTheme({ name: trimmed, color: suggested });
      setName("");
      setColor(null);
      await applyThemes([...saved.themeIdsOf(ayah.ayah_id), created.id]);
    } catch {
      setError("تعذّر إنشاء الموضوع. حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }

  async function removeFromLibrary() {
    if (savingRef.current) await savingRef.current;
    await saved.remove(ayah.ayah_id);
    onClose();
  }

  // Portaled to <body>: inside the reading stage the sheet would share its
  // stacking context and sit under the mobile tab bar.
  return createPortal(
    <div className="qb-rsheet qb-theme-sheet" role="dialog" aria-modal="true" aria-label="حفظ وتظليل">
      <div className="backdrop" onClick={onClose} aria-hidden />
      <div className="panel" ref={panelRef} tabIndex={-1}>
        <div className="grip" aria-hidden />
        <div className="head">
          <div>
            <h2>حفظ وتظليل</h2>
            <div className="ref">
              {isSaved ? <Icon name="bookmarkFilled" size={12} /> : null} سورة {ayah.surah}، الآية{" "}
              {formatNumber(ayah.ayah)}
            </div>
          </div>
          <button type="button" className="close" onClick={onClose} aria-label="إغلاق">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="body">
          <p className="verse" dir="rtl">
            {ayah.text.length > 160 ? `${ayah.text.slice(0, 160)}…` : ayah.text}
          </p>

          <section>
            <div className="label">المواضيع</div>
            {loaded && themes.length === 0 ? (
              <p className="hint">
                ظلِّل الآية بموضوع لتجتمع الآيات المتقاربة معاً في الدفتر، ثم افتح لوحة الموضوع لربطها.
              </p>
            ) : null}
            <div className="themes" role="group" aria-label="المواضيع">
              {themes.map((theme) => {
                const on = selected.includes(theme.id);
                return (
                  <button
                    key={theme.id}
                    type="button"
                    className={`qb-theme-chip${on ? " on" : ""}`}
                    data-hl={theme.color}
                    aria-pressed={on}
                    onClick={() => toggleTheme(theme.id)}
                  >
                    <span className="dot" aria-hidden />
                    <span className="name">{theme.name}</span>
                    {on ? <Icon name="check" size={14} /> : null}
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <div className="label">موضوع جديد</div>
            <form
              className="new"
              onSubmit={(event) => {
                event.preventDefault();
                void addTheme();
              }}
            >
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="مثلاً: الصبر، آيات الخلق…"
                maxLength={60}
                aria-label="اسم الموضوع"
              />
              <button type="submit" className="add" disabled={!name.trim() || busy}>
                إضافة
              </button>
            </form>
            <div className="swatches" role="radiogroup" aria-label="لون الموضوع">
              {THEME_PALETTE.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  role="radio"
                  aria-checked={suggested === entry.key}
                  aria-label={entry.label}
                  title={entry.label}
                  className={`swatch${suggested === entry.key ? " on" : ""}`}
                  data-hl={entry.key}
                  onClick={() => setColor(entry.key)}
                />
              ))}
            </div>
            {error ? <p className="error" role="alert">{error}</p> : null}
          </section>
        </div>

        <div className="foot">
          {isSaved ? (
            <button type="button" className="remove" onClick={() => void removeFromLibrary()}>
              <Icon name="trash" size={14} /> إزالة من الدفتر
            </button>
          ) : (
            <span />
          )}
          <button type="button" className="done" onClick={onClose}>
            تمّ
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
