"use client";

import "./companions.css";

import { Icon } from "@/components/icon";
import { useNumerals } from "@/lib/preferences-context";
import { useMushaf } from "@/features/reading/mushaf-context";
import { useShellMode } from "@/features/shell/mode-context";
import { useWorkspace } from "@/features/shell/workspace-context";

import { relativeAge, useCompanions } from "./use-companions";

/**
 * Notebook drawer — the scholar's-desk companion. Pinned verses, recent
 * research sessions, and followed roots, pinned beside the rail.
 */
export function NotebookDrawer() {
  const companions = useCompanions();
  const mushaf = useMushaf();
  const { state } = useWorkspace();
  const { setMode } = useShellMode();
  const formatNumber = useNumerals();

  return (
    <aside className="qb-notebook" aria-label="الدفتر">
      <div className="head">
        <div>
          <div className="kicker">الدفتر · NOTEBOOK</div>
          <h4>دفتر العمل</h4>
          <div className="meta">
            {formatNumber(companions.notebook.length)} آية · {formatNumber(companions.sessions.length)} جلسة ·{" "}
            {formatNumber(companions.roots.length)} جذر
          </div>
        </div>
        <button type="button" className="close" aria-label="إغلاق" onClick={() => setMode("reading")}>
          <Icon name="close" size={16} />
        </button>
      </div>

      <div className="body">
        {companions.error ? <div className="qb-aux-state">{companions.error}</div> : null}

        <section className="qb-nb-section">
          <div className="label">
            آيات مُثبَّتة <span className="count">{formatNumber(companions.notebook.length)}</span>
          </div>
          {companions.notebook.length === 0 ? (
            <div className="qb-aux-state" style={{ padding: "12px 4px", fontSize: 12 }}>
              ثبّت آيات من لوحة المطابقة لتظهر هنا.
            </div>
          ) : (
            companions.notebook.map((item) => (
              <button
                key={item.id}
                type="button"
                className="qb-nb-item"
                onClick={() => {
                  void mushaf.loadByAyah(item.mushaf_id || state.selectedMushaf, item.ayah_id, []);
                  setMode("reading");
                }}
              >
                <div className="top">
                  <span className="surah">{item.surah ?? "آية"}</span>
                  <span className="ref">{item.ayah != null ? formatNumber(item.ayah) : ""}</span>
                  <span className="age">{relativeAge(item.created_at)}</span>
                  <span
                    className="del"
                    role="button"
                    aria-label="حذف"
                    onClick={(event) => {
                      event.stopPropagation();
                      void companions.deleteNotebookItem(item.id);
                    }}
                  >
                    <Icon name="trash" size={12} />
                  </span>
                </div>
                {item.text ? <div className="preview">{item.text}</div> : null}
                {item.collection ? (
                  <div className="tag">
                    <Icon name="bookmark" size={10} /> {item.collection}
                  </div>
                ) : null}
              </button>
            ))
          )}
        </section>

        <section className="qb-nb-section">
          <div className="label">
            جلسات البحث <span className="count">{formatNumber(companions.sessions.length)}</span>
          </div>
          {companions.sessions.length === 0 ? (
            <div className="qb-aux-state" style={{ padding: "12px 4px", fontSize: 12 }}>
              لا توجد جلسات محفوظة بعد.
            </div>
          ) : (
            companions.sessions.slice(0, 6).map((session) => (
              <button
                key={session.id}
                type="button"
                className="qb-nb-item"
                onClick={() => setMode("history")}
              >
                <div className="top">
                  <Icon name="sparkles" size={11} />
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {session.title}
                  </span>
                  <span className="age">{relativeAge(session.updated_at)}</span>
                </div>
                <div className="tag">
                  {formatNumber(session.message_count)} رسالة ·{" "}
                  {session.mode === "tafssir" ? "قراءة تفسيرية" : "القرآن وحدَه"}
                </div>
              </button>
            ))
          )}
        </section>

        <section className="qb-nb-section">
          <div className="label">
            جذور مُتابَعة <span className="count">{formatNumber(companions.roots.length)}</span>
          </div>
          {companions.roots.length === 0 ? (
            <div className="qb-aux-state" style={{ padding: "12px 4px", fontSize: 12 }}>
              تابِع جذراً من لوحة المطابقة.
            </div>
          ) : (
            companions.roots.map((root) => (
              <button key={root.id} type="button" className="qb-nb-item" onClick={() => setMode("roots")}>
                <div className="top">
                  <span className="surah">{root.root_text}</span>
                  {root.occurrences != null ? (
                    <span className="ref">{formatNumber(root.occurrences)} موضع</span>
                  ) : null}
                </div>
              </button>
            ))
          )}
        </section>
      </div>
    </aside>
  );
}
