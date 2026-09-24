"use client";

import { useMemo, useState } from "react";

import type { SurahListItem } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { useNumerals } from "@/lib/preferences-context";
import { parseNavCommand, surahMatches, toAsciiDigits, TOTAL_PAGES } from "@/lib/quran-nav";
import { useDialog } from "@/lib/use-dialog";

type Tab = "surah" | "juz" | "page";

const TABS: { value: Tab; label: string }[] = [
  { value: "surah", label: "السور" },
  { value: "juz", label: "الأجزاء" },
  { value: "page", label: "صفحة" },
];

export type NavigateTarget =
  | { type: "surah"; surah: number; ayah?: number }
  | { type: "juz"; juz: number }
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
  onNavigate,
  onClose,
}: {
  surahs: SurahListItem[];
  currentSurahId?: number;
  currentPage?: number;
  currentJuz?: number | null;
  onNavigate: (target: NavigateTarget) => void;
  onClose: () => void;
}) {
  const formatNumber = useNumerals();
  const panelRef = useDialog<HTMLDivElement>(onClose);
  const [canHover] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches,
  );
  const [tab, setTab] = useState<Tab>("surah");
  const [query, setQuery] = useState("");
  const [pageDraft, setPageDraft] = useState(currentPage ? String(currentPage) : "");

  const command = parseNavCommand(query);
  const filtered = useMemo(() => surahs.filter((surah) => surahMatches(query, surah)), [surahs, query]);

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
      const name = surahs.find((s) => s.id === command.surah)?.name ?? `سورة ${formatNumber(command.surah)}`;
      return `${name} · الآية ${formatNumber(command.ayah)}`;
    }
    if (command.type === "surah") {
      return surahs.find((s) => s.id === command.surah)?.name ?? `سورة ${formatNumber(command.surah)}`;
    }
    if (command.type === "juz") return `الجزء ${formatNumber(command.juz)}`;
    return `الصفحة ${formatNumber(command.page)}`;
  }

  const pageNumber = Number(toAsciiDigits(pageDraft));
  const pageValid = Number.isInteger(pageNumber) && pageNumber >= 1 && pageNumber <= TOTAL_PAGES;

  return (
    <div className="qb-rsheet qb-nav-sheet" role="dialog" aria-modal="true" aria-label="انتقل في المصحف">
      <div className="backdrop" onClick={onClose} aria-hidden />
      <div className="panel" ref={panelRef} tabIndex={-1}>
        <div className="grip" aria-hidden />
        <div className="head">
          <h2>انتقل</h2>
          <button type="button" className="close" onClick={onClose} aria-label="إغلاق">
            <Icon name="close" size={18} />
          </button>
        </div>

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
            placeholder="اسم السورة أو رقمها · ٢:٢٥٥ · صفحة ٥٠"
            // Type-to-filter on desktop; on touch screens don't pop the keyboard
            // over the list — the user may just scroll and tap.
            autoFocus={canHover}
            aria-label="ابحث عن سورة أو اكتب مرجعاً"
            enterKeyHint="go"
          />
        </div>

        {command ? (
          <button type="button" className="command" onClick={runCommand}>
            <Icon name="arrowLeft" size={16} />
            <span>انتقل إلى {commandLabel()}</span>
          </button>
        ) : null}

        <div className="tabs" role="tablist" aria-label="طريقة التنقل">
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

        <div className="body">
          {tab === "surah" ? (
            filtered.length ? (
              <ul className="surahs">
                {filtered.map((surah) => (
                  <li key={surah.id}>
                    <button
                      type="button"
                      className={surah.id === currentSurahId ? "current" : ""}
                      aria-current={surah.id === currentSurahId ? "true" : undefined}
                      onClick={() => go({ type: "surah", surah: surah.id })}
                    >
                      <span className="num">{formatNumber(surah.id)}</span>
                      <span className="name">{surah.name}</span>
                      <span className="meta">
                        {surah.type === "medinan" ? "مدنيّة" : surah.type === "meccan" ? "مكّيّة" : ""}
                        {surah.ayah_count ? `، ${formatNumber(surah.ayah_count)} آية` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty">لا توجد سورة بهذا الاسم.</div>
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
                  aria-label={`الجزء ${formatNumber(juz)}`}
                  onClick={() => go({ type: "juz", juz })}
                >
                  {formatNumber(juz)}
                </button>
              ))}
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
              <label htmlFor="qbNavPage">رقم الصفحة (١–{formatNumber(TOTAL_PAGES)})</label>
              <div className="row">
                <input
                  id="qbNavPage"
                  inputMode="numeric"
                  value={pageDraft}
                  onChange={(event) => setPageDraft(event.target.value)}
                  aria-invalid={pageDraft !== "" && !pageValid}
                />
                <button type="submit" disabled={!pageValid}>
                  انتقال
                </button>
              </div>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}
