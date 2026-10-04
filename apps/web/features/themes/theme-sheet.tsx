"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

import { useRouter } from "next/navigation";

import type { ThemeColor, ThemeSummary } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { useNumerals } from "@/lib/preferences-context";
import { useDialog } from "@/lib/use-dialog";
import { cleanAyahText, type SavableAyah, type SavedAyat } from "@/features/reading/use-saved-ayat";

import { THEME_PALETTE, nextThemeColor } from "./palette";
import { createTheme, useThemes } from "./themes-store";

import { t } from "@/lib/i18n";

/**
 * «حفظ وتظليل» — the app's one save action (see save-ayah-context.tsx). The
 * researcher picks one or more themes (مواضيع), creating one inline if needed,
 * and «تمّ» commits: the ayah is saved to the notebook (with those themes), or
 * an already-saved ayah gets its new themes. Until then nothing is written —
 * closing the sheet (✕, backdrop, Escape) leaves the notebook as it was.
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
  const router = useRouter();
  const formatNumber = useNumerals();
  const { themes, loaded } = useThemes();
  const [name, setName] = useState("");
  const [color, setColor] = useState<ThemeColor | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSaved = saved.isSaved(ayah.ayah_id);
  // The themes as they will be saved on «تمّ» (starts from what is stored).
  const [selected, setSelected] = useState<number[]>(() => saved.themeIdsOf(ayah.ayah_id));
  const suggested = color ?? nextThemeColor(themes.map((theme) => theme.color));

  function toggleTheme(themeId: number) {
    setError(null);
    setSelected((current) => (current.includes(themeId) ? current.filter((id) => id !== themeId) : [...current, themeId]));
  }

  /** «تمّ»: write the draft — save the ayah (with its themes) or update its themes. */
  async function commit(): Promise<boolean> {
    const stored = saved.themeIdsOf(ayah.ayah_id);
    const unchanged = isSaved && stored.length === selected.length && stored.every((id) => selected.includes(id));
    if (unchanged) return true;
    setBusy(true);
    setError(null);
    try {
      await saved.setThemes(ayah, selected);
      return true;
    } catch {
      setError(t("تعذّر الحفظ"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function done() {
    if (await commit()) onClose();
  }

  async function addTheme() {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      // The theme itself is created now (it appears in the list); the ayah
      // joins it on «تمّ».
      const created = await createTheme({ name: trimmed, color: suggested });
      setName("");
      setColor(null);
      setSelected((current) => [...current, created.id]);
    } catch {
      setError(t("تعذّر إنشاء الموضوع. حاول مرة أخرى."));
    } finally {
      setBusy(false);
    }
  }

  // «لوحات …»: that theme's boards in the notebook — open one, or make one on
  // purpose there (never created by accident from here). Going there commits
  // the draft first, like «تمّ».
  async function openThemeBoards(theme: ThemeSummary) {
    if (!(await commit())) return;
    onClose();
    router.push(`/?mode=notebook&tab=boards&focus=${theme.id}`);
  }

  async function removeFromLibrary() {
    await saved.remove(ayah.ayah_id);
    onClose();
  }

  // Portaled to <body>: inside the reading stage the sheet would share its
  // stacking context and sit under the mobile tab bar.
  return createPortal(
    <div className="qb-rsheet qb-theme-sheet" role="dialog" aria-modal="true" aria-label={t("حفظ وتظليل")}>
      <div className="backdrop" onClick={onClose} aria-hidden />
      <div className="panel" ref={panelRef} tabIndex={-1}>
        <div className="grip" aria-hidden />
        <div className="head">
          <div>
            <h2>{t("حفظ وتظليل")}</h2>
            <div className="ref">
              {isSaved ? <Icon name="bookmarkFilled" size={12} /> : null} {t("سورة")} {ayah.surah}{t("، الآية")}{" "}
              {formatNumber(ayah.ayah)}
            </div>
          </div>
          <button type="button" className="close" onClick={onClose} aria-label={t("إغلاق")}>
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="body">
          <p className="verse" dir="rtl">
            {(() => {
              const text = cleanAyahText(ayah.text);
              return text.length > 160 ? `${text.slice(0, 160)}…` : text;
            })()}
          </p>

          <section>
            <div className="label">{t("المواضيع")}</div>
            {loaded && themes.length === 0 ? (
              <p className="hint">
                {t("ظلِّل الآية بموضوع لتجتمع الآيات المتقاربة معاً في الدفتر، ثم أنشئ لها لوحة لربطها.")}
              </p>
            ) : null}
            <div className="themes" role="group" aria-label={t("المواضيع")}>
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
            {/* A board is made on purpose, not assumed: offer one per theme
                this ayah belongs to. */}
            {selected.length ? (
              <div className="boards">
                {themes
                  .filter((theme) => selected.includes(theme.id))
                  .map((theme) => (
                    <button key={theme.id} type="button" className="board" data-hl={theme.color} disabled={busy} onClick={() => void openThemeBoards(theme)}>
                      <Icon name="graph" size={13} /> {t("لوحات «{0}»", { 0: theme.name })}
                    </button>
                  ))}
              </div>
            ) : null}
          </section>

          <section>
            <div className="label">{t("موضوع جديد")}</div>
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
                placeholder={t("مثلاً: الصبر، آيات الخلق…")}
                maxLength={60}
                aria-label={t("اسم الموضوع")}
              />
              <button type="submit" className="add" disabled={!name.trim() || busy}>
                {t("إضافة")}
              </button>
            </form>
            <div className="swatches" role="radiogroup" aria-label={t("لون الموضوع")}>
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
              <Icon name="trash" size={14} /> {t("إزالة من الدفتر")}
            </button>
          ) : (
            <span />
          )}
          <button type="button" className="done" onClick={() => void done()} disabled={busy}>
            {t("تمّ")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
