"use client";

import "./companions.css";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { NotebookItem } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { useNumerals } from "@/lib/preferences-context";
import { useMushaf } from "@/features/reading/mushaf-context";
import { useShellMode } from "@/features/shell/mode-context";
import { useWorkspace } from "@/features/shell/workspace-context";

import { relativeAge, useCompanions } from "./use-companions";

type LibraryTab = "verses" | "sessions" | "roots";
type VerseView = "recent" | "collections";
type SessionFilter = "all" | "strict" | "tafssir";

const UNFILED = "غير مُصنَّفة";
const SESSION_FILTERS: { value: SessionFilter; label: string }[] = [
  { value: "all", label: "الكل" },
  { value: "strict", label: "القرآن وحدَه" },
  { value: "tafssir", label: "تفسيرية" },
];

/**
 * Library (الدفتر) — the single home for everything a user keeps: saved verses
 * (recent or grouped into collections), research sessions, and followed roots.
 * Consolidates what used to be four separate rail surfaces (Notebook, Bookmarks,
 * History, Roots) that were all views of the same three data sources.
 */
export function LibraryScreen({ initialTab = "verses" }: { initialTab?: LibraryTab }) {
  const companions = useCompanions();
  const mushaf = useMushaf();
  const { state } = useWorkspace();
  const { setMode } = useShellMode();
  const formatNumber = useNumerals();
  const router = useRouter();

  const [tab, setTab] = useState<LibraryTab>(initialTab);
  const [verseView, setVerseView] = useState<VerseView>("recent");
  const [sessionFilter, setSessionFilter] = useState<SessionFilter>("all");

  function openVerse(item: NotebookItem) {
    // A verse saved under another riwāyah opens in the current edition by its
    // surah:ayah reference (ayah ids are per-mushaf).
    const sameMushaf = !item.mushaf_id || item.mushaf_id === state.selectedMushaf;
    if (!sameMushaf && item.surah_id && item.ayah) {
      void mushaf.loadBySurah(state.selectedMushaf, item.surah_id, item.ayah);
    } else {
      void mushaf.loadByAyah(item.mushaf_id || state.selectedMushaf, item.ayah_id, []);
    }
    setMode("reading");
  }

  const collections = new Map<string, NotebookItem[]>();
  for (const item of companions.notebook) {
    const key = item.collection?.trim() || UNFILED;
    collections.set(key, [...(collections.get(key) ?? []), item]);
  }
  const visibleSessions = companions.sessions.filter(
    (s) => sessionFilter === "all" || s.mode === sessionFilter,
  );

  const TABS: { value: LibraryTab; label: string; count: number }[] = [
    { value: "verses", label: "الآيات", count: companions.notebook.length },
    { value: "sessions", label: "الجلسات", count: companions.sessions.length },
    { value: "roots", label: "الجذور", count: companions.roots.length },
  ];

  return (
    <div className="qb-aux">
      <div className="qb-aux-h">
        <div>
          <div className="kicker">الدفتر</div>
          <h2>الدفتر</h2>
          <div className="sub">
            {formatNumber(companions.notebook.length)} آية · {formatNumber(companions.sessions.length)} جلسة ·{" "}
            {formatNumber(companions.roots.length)} جذر
          </div>
        </div>
      </div>

      <div className="qb-lib-tabs">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            className={`qb-lib-tab${tab === t.value ? " active" : ""}`}
            onClick={() => setTab(t.value)}
          >
            {t.label} <span className="n">{formatNumber(t.count)}</span>
          </button>
        ))}
      </div>

      {companions.error ? <div className="qb-aux-state">{companions.error}</div> : null}
      {companions.loading ? <div className="qb-aux-state is-loading">جارٍ التحميل…</div> : null}

      {/* ---- Verses ---- */}
      {tab === "verses" && !companions.loading ? (
        companions.notebook.length === 0 ? (
          <div className="qb-aux-state">لا توجد آيات محفوظة بعد. احفظ آية من القراءة أو من نتائج البحث.</div>
        ) : (
          <>
            <div className="qb-form-tabs" style={{ display: "flex", gap: 6, marginBottom: 16 }}>
              <button type="button" className={`qb-pill${verseView === "recent" ? " active" : ""}`} onClick={() => setVerseView("recent")}>
                الأحدث
              </button>
              <button type="button" className={`qb-pill${verseView === "collections" ? " active" : ""}`} onClick={() => setVerseView("collections")}>
                حسب المجموعة
              </button>
            </div>

            {verseView === "recent" ? (
              <div className="qb-aux-list">
                {companions.notebook.map((item) => (
                  <div key={item.id} className="qb-aux-row">
                    <span className="icon-tile"><Icon name="book" size={16} /></span>
                    <button type="button" className="grow qb-row-open" onClick={() => openVerse(item)}>
                      <div className="title">
                        {item.surah ?? "آية"} {item.ayah != null ? formatNumber(item.ayah) : ""}
                      </div>
                      <div className="meta">
                        {item.text ? `${item.text.slice(0, 64)}` : ""}
                        {item.collection ? ` · ${item.collection}` : ""} · {relativeAge(item.created_at)}
                      </div>
                    </button>
                    <button type="button" className="row-action" aria-label="حذف" onClick={() => void companions.deleteNotebookItem(item.id)}>
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="qb-aux-grid">
                {[...collections.entries()].map(([name, items]) => (
                  <div key={name} className="qb-collection-card">
                    <div className="head">
                      <span className="name">{name}</span>
                      <span className="count">{formatNumber(items.length)} آية</span>
                    </div>
                    <div className="body">
                      {items.map((item) => (
                        <button key={item.id} type="button" className="qb-mini-verse" onClick={() => openVerse(item)}>
                          <div className="ref">
                            <Icon name="book" size={10} /> {item.surah ?? ""}{" "}
                            {item.ayah != null ? formatNumber(item.ayah) : ""}
                          </div>
                          {item.text ? <div className="text">{item.text}</div> : null}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )
      ) : null}

      {/* ---- Sessions ---- */}
      {tab === "sessions" && !companions.loading ? (
        <>
          <div className="qb-form-tabs" style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            {SESSION_FILTERS.map((option) => (
              <button key={option.value} type="button" className={`qb-pill${sessionFilter === option.value ? " active" : ""}`} onClick={() => setSessionFilter(option.value)}>
                {option.label}
              </button>
            ))}
          </div>
          {visibleSessions.length === 0 ? (
            <div className="qb-aux-state">لا توجد جلسات محفوظة في هذا التصنيف.</div>
          ) : (
            <div className="qb-aux-list">
              {visibleSessions.map((session) => (
                <div key={session.id} className="qb-aux-row">
                  <span className={`icon-tile${session.mode === "tafssir" ? " copper" : ""}`}>
                    <Icon name={session.mode === "tafssir" ? "feather" : "scale"} size={18} />
                  </span>
                  <div className="grow">
                    <div className="title">{session.title}</div>
                    <div className="meta">
                      {formatNumber(session.message_count)} رسالة · {relativeAge(session.updated_at)} ·{" "}
                      {session.mode === "tafssir" ? "قراءة تفسيرية" : "القرآن وحدَه"}
                    </div>
                  </div>
                  <button type="button" className="row-action" aria-label="حذف الجلسة" onClick={() => void companions.deleteSession(session.id)}>
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      ) : null}

      {/* ---- Roots ---- */}
      {tab === "roots" && !companions.loading ? (
        companions.roots.length === 0 ? (
          <div className="qb-aux-state">لا توجد جذور مُتابَعة بعد. تابِع جذراً من لوحة المطابقة.</div>
        ) : (
          <div className="qb-aux-list">
            {companions.roots.map((root) => (
              <div key={root.id} className="qb-aux-row">
                <span className="icon-tile"><Icon name="tree" size={18} /></span>
                <div className="grow">
                  <div className="root-disp">{root.root_text}</div>
                  <div className="meta">
                    {root.occurrences != null ? `${formatNumber(root.occurrences)} موضع · ` : ""}
                    {relativeAge(root.created_at)}
                  </div>
                </div>
                <button type="button" className="row-action" aria-label="خريطة انتشار الجذر" title="خريطة الانتشار" onClick={() => router.push(`/?mode=heatmap&root=${encodeURIComponent(root.root_text)}`)}>
                  <Icon name="graph" size={15} />
                </button>
                <button type="button" className="row-action" aria-label="إلغاء المتابعة" onClick={() => void companions.unfollowRoot(root.id)}>
                  <Icon name="trash" size={15} />
                </button>
              </div>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}
