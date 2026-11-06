"use client";

import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { SavedPageEntry, SurahListItem } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { Ribbon, SURAH_NAMES } from "@/components/ribbon";
import { useWebDesign } from "@/lib/use-web-design";
import { SwipeRow } from "@/components/swipe-row";
import { canHover } from "@/lib/can-hover";
import { relativeAge } from "@/features/companions/use-companions";
import { useNumerals, usePreferences } from "@/lib/preferences-context";
import { parseNavCommand, surahMatches, toAsciiDigits, TOTAL_PAGES } from "@/lib/quran-nav";
import { divisionRange, DIVISION_COUNT } from "@/lib/quran-ranges";
import { useDialog } from "@/lib/use-dialog";
import type { TopBarSlots } from "@/features/shell/top-bar-slots";

import { useSavedPages } from "../use-saved-pages";
import { surahLengths, surahsOfKind, type SurahKind } from "../surah-filter";

import "./navigate-sheet.web.css";

import { t, tn } from "@/lib/i18n";

export type NavigateTab = "saved" | "surah" | "juz" | "hizb" | "page";
type Tab = NavigateTab;

const TABS: { value: Tab; label: string }[] = [
  { value: "saved", get label() {
    return t("المحفوظة");
  } },
  { value: "surah", get label() {
    return t("السور");
  } },
  { value: "juz", get label() {
    return t("الأجزاء");
  } },
  { value: "hizb", get label() {
    return t("الأحزاب");
  } },
  { value: "page", get label() {
    return t("صفحة");
  } },
];

export type NavigateTarget =
  | { type: "surah"; surah: number; ayah?: number }
  | { type: "juz"; juz: number }
  | { type: "hizb"; hizb: number }
  | { type: "page"; page: number };

/**
 * «انتقل» — the reader's single navigation surface (replaces the header's
 * آية/سورة/جزء pills + selects and the footer's editable page field).
 *
 * One field understands everything: a surah name or number filters the list,
 * «2:255» jumps to an ayah, «صفحة 50» / «جزء 30» jump directly. Tabs offer the
 * browsable lists. Bottom sheet on phones, centred panel on larger screens.
 */
export function NavigateSheet({
  surahs,
  currentSurahId,
  currentPage,
  currentJuz,
  currentHizb,
  onNavigate,
  onClose,
  inline = false,
  initialTab,
  topSlots = null,
}: {
  surahs: SurahListItem[];
  currentSurahId?: number;
  currentPage?: number;
  currentJuz?: number | null;
  /** The hizb the reader's page opens in (lib/quran-divisions). */
  currentHizb?: number | null;
  onNavigate: (target: NavigateTarget) => void;
  onClose: () => void;
  /** A page of its own (the reading world's «الفهرس»), not a dialog over the reader. */
  inline?: boolean;
  /** The tab to open on; by default the saved pages when there are some, else the surahs. */
  initialTab?: NavigateTab;
  /** The web top bar's slots, for the Index and Saved pages: the tabs go up there and the heading is dropped. */
  topSlots?: TopBarSlots | null;
}) {
  const formatNumber = useNumerals();
  const panelRef = useDialog<HTMLDivElement>(onClose, { enabled: !inline });
  const [hover] = useState(canHover);
  const { preferences } = usePreferences();
  const { remove: removeSaved } = useSavedPages();
  const savedPages: SavedPageEntry[] = [...(preferences.saved_pages ?? [])].sort((a, b) => (b.saved_at ?? 0) - (a.saved_at ?? 0));
  const [tab, setTab] = useState<Tab>(() => initialTab ?? (savedPages.length ? "saved" : "surah"));
  const [query, setQuery] = useState("");
  const [pageDraft, setPageDraft] = useState(currentPage ? String(currentPage) : "");

  const command = parseNavCommand(query);
  // Web design: the surahs' lengths as a ribbon, filtered by Meccan / Medinan.
  const web = useWebDesign();
  const [kind, setKind] = useState<SurahKind>("all");
  const listRef = useRef<HTMLUListElement>(null);
  const ofKind = useMemo(() => surahsOfKind(surahs, kind), [surahs, kind]);
  const lengths = useMemo(() => surahLengths(surahs), [surahs]);
  const filtered = useMemo(
    () => surahs.filter((surah) => surahMatches(query, surah) && (!web || ofKind.has(surah.id))),
    [surahs, query, web, ofKind],
  );
  function showSurah(index: number | null) {
    if (index == null) return;
    const row = listRef.current?.querySelector<HTMLElement>(`[data-surah="${index + 1}"]`);
    if (!row) return;
    row.scrollIntoView({ block: "center", behavior: "smooth" });
    row.classList.remove("is-flash");
    void row.offsetWidth;
    row.classList.add("is-flash");
  }

  function go(target: NavigateTarget) {
    onNavigate(target);
    onClose();
  }

  function runCommand() {
    if (!command) {
      if (filtered.length === 1) go({ type: "surah", surah: filtered[0].id });
      return;
    }
    if (command.type === "ayah") go({ type: "surah", surah: command.surah, ayah: command.ayah });
    else if (command.type === "surah") go({ type: "surah", surah: command.surah });
    else if (command.type === "juz") go({ type: "juz", juz: command.juz });
    else go({ type: "page", page: command.page });
  }

  function commandLabel(): string | null {
    if (!command) return null;
    if (command.type === "ayah") {
      const name = surahs.find((s) => s.id === command.surah)?.name ?? t("سورة {0}", { 0: formatNumber(command.surah) });
      return t("{0} · الآية {1}", { 0: name, 1: formatNumber(command.ayah) });
    }
    if (command.type === "surah") {
      return surahs.find((s) => s.id === command.surah)?.name ?? t("سورة {0}", { 0: formatNumber(command.surah) });
    }
    if (command.type === "juz") return t("الجزء {0}", { 0: formatNumber(command.juz) });
    return t("الصفحة {0}", { 0: formatNumber(command.page) });
  }

  const pageNumber = Number(toAsciiDigits(pageDraft));
  const pageValid = Number.isInteger(pageNumber) && pageNumber >= 1 && pageNumber <= TOTAL_PAGES;

  const field = (
    <div className="field">
      <Icon name="search" size={16} />
      <input
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setTab("surah");
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            // Closing returns focus to the «انتقل» button; without this the
            // same Enter would activate it and reopen the sheet.
            event.preventDefault();
            runCommand();
          }
        }}
        placeholder={formatNumber(t("اسم السورة أو رقمها · ٢:٢٥٥ · صفحة ٥٠"))}
        // Type-to-filter on desktop; on touch screens don't pop the keyboard
        // over the list — the user may just scroll and tap.
        autoFocus={hover}
        aria-label={t("ابحث عن سورة أو اكتب مرجعاً")}
        enterKeyHint="go"
      />
    </div>
  );

  const tabStrip = (
    <div className="tabs qb-fit-choice" data-autofit="2" suppressHydrationWarning role="tablist" aria-label={t("طريقة التنقل")}>
      {TABS.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={tab === item.value}
          className={tab === item.value ? "active" : ""}
          onClick={() => setTab(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );

  return (
    <div
      className={`qb-rsheet qb-nav-sheet${inline ? " is-inline" : ""}`}
      role={inline ? "region" : "dialog"}
      aria-modal={inline ? undefined : true}
      aria-label={t("انتقل في المصحف")}
    >
      {inline ? null : <div className="backdrop" onClick={onClose} aria-hidden />}
      <div className="panel" ref={panelRef} tabIndex={-1}>
        <div className="grip" aria-hidden />
        {/* As a page under the web top bar (the Index, Saved), the rail names the
            page and its tabs — saved pages, surahs, juz… — go up into the bar
            (shell/top-bar-slots.ts). */}
        {topSlots ? null : (
          <div className="head">
            <h2>{inline ? t("الفهرس") : t("انتقل")}</h2>
            {inline ? null : (
              <button type="button" className="close" onClick={onClose} aria-label={t("إغلاق")}>
                <Icon name="close" size={18} />
              </button>
            )}
          </div>
        )}

        {field}

        {command ? (
          <button type="button" className="command" onClick={runCommand}>
            <Icon name="arrowLeft" size={16} />
            <span>{t("انتقل إلى")} {commandLabel()}</span>
          </button>
        ) : null}

        {topSlots ? createPortal(tabStrip, topSlots.start) : tabStrip}

        <div className="body">
          {/* «المحفوظة»: the pages bookmarked in the reader, latest first. */}
          {tab === "saved" ? (
            savedPages.length ? (
              <ul className="qb-saved-pages">
                {savedPages.map((entry) => (
                  <li key={`${entry.mushaf_id}-${entry.page}`}>
                <SwipeRow onDelete={() => removeSaved(entry)}>
                    <button type="button" onClick={() => go({ type: "page", page: entry.page })}>
                      <span className="ribbon" aria-hidden>
                        <svg viewBox="0 0 16 24" width="12" height="18">
                          <path d="M1 0h14v22l-7-5-7 5z" />
                        </svg>
                      </span>
                      <span className="txt">
                        <b>{entry.surah ?? t("المصحف")}</b>
                        <small>
                          {t("صفحة {0}", { 0: formatNumber(entry.page) })}
                          {entry.saved_at ? ` · ${relativeAge(entry.saved_at, formatNumber)}` : ""}
                        </small>
                      </span>
                      <Icon name="chevLeft" size={16} />
                    </button>
                </SwipeRow>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty">{t("احفظ صفحة من القراءة (علامة الحفظ في شريط القارئ) لتجدها هنا.")}</div>
            )
          ) : null}

          {tab === "surah" && web ? (
            <div className="qb-nav-ribbon">
              <div className="kinds" role="group" aria-label={t("نوع السورة")}>
                {(
                  [
                    ["all", t("الكل"), surahs.length],
                    ["meccan", t("مكّيّة"), surahsOfKind(surahs, "meccan").size],
                    ["medinan", t("مدنيّة"), surahsOfKind(surahs, "medinan").size],
                  ] as const
                ).map(([value, label, count]) => (
                  <button key={value} type="button" aria-pressed={kind === value} onClick={() => setKind(value)}>
                    {label}
                    <span>{formatNumber(count)}</span>
                  </button>
                ))}
              </div>
              <Ribbon
                counts={lengths.map((length, i) => (ofKind.has(i + 1) ? length : 0))}
                label={t("أطوال السور")}
                here={currentSurahId ? currentSurahId - 1 : null}
                height={56}
                readout={(i) => {
                  const surah = surahs.find((item) => item.id === i + 1);
                  return surah ? `${SURAH_NAMES[i]}: ${tn("{0} آية", surah.ayah_count, { 0: formatNumber(surah.ayah_count) })}` : SURAH_NAMES[i];
                }}
                restReadout={tn("{0} آية", 6236, { 0: formatNumber(6236) })}
                onPick={showSurah}
              />
            </div>
          ) : null}

          {tab === "surah" ? (
            filtered.length ? (
              <ul className="surahs" ref={listRef}>
                {filtered.map((surah) => (
                  <li key={surah.id} data-surah={surah.id}>
                    <button
                      type="button"
                      className={surah.id === currentSurahId ? "current" : ""}
                      aria-current={surah.id === currentSurahId ? "true" : undefined}
                      onClick={() => go({ type: "surah", surah: surah.id })}
                    >
                      <span className="num">{formatNumber(surah.id)}</span>
                      <span className="name">{surah.name}</span>
                      <span className="meta">
                        {surah.type === "medinan" ? t("مدنيّة") : surah.type === "meccan" ? t("مكّيّة") : ""}
                        {surah.ayah_count ? t("، ") + tn("{0} آية", surah.ayah_count, { 0: formatNumber(surah.ayah_count) }) : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty">{t("لا توجد سورة بهذا الاسم.")}</div>
            )
          ) : null}

          {tab === "juz" ? (
            <div className="juz-grid">
              {Array.from({ length: 30 }, (_, index) => index + 1).map((juz) => (
                <button
                  key={juz}
                  type="button"
                  className={juz === currentJuz ? "current" : ""}
                  aria-current={juz === currentJuz ? "true" : undefined}
                  aria-label={t("الجزء {0}", { 0: formatNumber(juz) })}
                  onClick={() => go({ type: "juz", juz })}
                >
                  {formatNumber(juz)}
                </button>
              ))}
            </div>
          ) : null}

          {tab === "hizb" ? (
            <div className="juz-grid hizb-grid">
              {Array.from({ length: DIVISION_COUNT.hizb }, (_, index) => index + 1).map((hizb) => {
                const { start } = divisionRange("hizb", hizb);
                const surahName = surahs.find((item) => item.id === start.surah)?.name ?? formatNumber(start.surah);
                return (
                  <button
                    key={hizb}
                    type="button"
                    className={hizb === currentHizb ? "current" : ""}
                    aria-current={hizb === currentHizb ? "true" : undefined}
                    aria-label={t("الحزب {0}", { 0: formatNumber(hizb) })}
                    title={`${surahName} ${formatNumber(start.ayah)}`}
                    onClick={() => go({ type: "hizb", hizb })}
                  >
                    <span className="n">{formatNumber(hizb)}</span>
                    <span className="at">
                      {surahName} {formatNumber(start.ayah)}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {tab === "page" ? (
            <form
              className="page-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (pageValid) go({ type: "page", page: pageNumber });
              }}
            >
              <label htmlFor="qbNavPage">{formatNumber(t("رقم الصفحة (١–"))}{formatNumber(TOTAL_PAGES)})</label>
              <div className="row">
                <input
                  id="qbNavPage"
                  inputMode="numeric"
                  value={pageDraft}
                  onChange={(event) => setPageDraft(event.target.value)}
                  aria-invalid={pageDraft !== "" && !pageValid}
                />
                <button type="submit" disabled={!pageValid}>
                  {t("انتقال")}
                </button>
              </div>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}
