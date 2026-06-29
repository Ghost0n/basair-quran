"use client";

import "./companions.css";

import type { NotebookItem } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { useNumerals } from "@/lib/preferences-context";
import { useMushaf } from "@/features/reading/mushaf-context";
import { useShellMode } from "@/features/shell/mode-context";
import { useWorkspace } from "@/features/shell/workspace-context";

import { useCompanions } from "./use-companions";

const UNFILED = "غير مُصنَّفة";

/**
 * Bookmarks — saved verses grouped by collection. The collection is a
 * free-text label on each notebook item (Phase 5 keeps it lightweight;
 * a dedicated collections table can come later).
 */
export function BookmarksScreen() {
  const companions = useCompanions();
  const mushaf = useMushaf();
  const { state } = useWorkspace();
  const { setMode } = useShellMode();
  const formatNumber = useNumerals();

  const groups = new Map<string, NotebookItem[]>();
  for (const item of companions.notebook) {
    const key = item.collection?.trim() || UNFILED;
    const bucket = groups.get(key) ?? [];
    bucket.push(item);
    groups.set(key, bucket);
  }

  function openVerse(item: NotebookItem) {
    void mushaf.loadByAyah(item.mushaf_id || state.selectedMushaf, item.ayah_id, []);
    setMode("reading");
  }

  return (
    <div className="qb-aux">
      <div className="qb-aux-h">
        <div>
          <div className="kicker">المحفوظات · BOOKMARKS</div>
          <h2>مجموعات الآيات</h2>
          <div className="sub">{formatNumber(companions.notebook.length)} آية محفوظة</div>
        </div>
      </div>

      {companions.loading ? (
        <div className="qb-aux-state">جارٍ التحميل…</div>
      ) : companions.notebook.length === 0 ? (
        <div className="qb-aux-state">لا توجد آيات محفوظة بعد. ثبّت آيات من لوحة المطابقة.</div>
      ) : (
        <div className="qb-aux-grid">
          {[...groups.entries()].map(([name, items]) => (
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
    </div>
  );
}
