"use client";

import "./companions.css";

import { useState } from "react";

import "@/features/themes/themes.css";
import { useRouter } from "next/navigation";

import type { NotebookItem, ThemeColor, ThemeSummary } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { useNumerals } from "@/lib/preferences-context";
import { useMushaf } from "@/features/reading/mushaf-context";
import { useShellMode } from "@/features/shell/mode-context";
import { useWorkspace } from "@/features/shell/workspace-context";
import { THEME_PALETTE } from "@/features/themes/palette";
import { deleteTheme, updateTheme, useThemes } from "@/features/themes/themes-store";
import { createDocumentUrl } from "@/features/documents/open-document";

import { relativeAge, useCompanions } from "./use-companions";

import { t as tt } from "@/lib/i18n";

type LibraryTab = "verses" | "documents" | "sessions" | "roots";
type VerseView = "recent" | "themes";
type SessionFilter = "all" | "strict" | "tafssir";

const UNTAGGED = "بلا موضوع";
const SESSION_FILTERS: { value: SessionFilter; label: string }[] = [
  { value: "all", get label() {
    return tt("الكل");
  } },
  { value: "strict", get label() {
    return tt("القرآن وحدَه");
  } },
  { value: "tafssir", get label() {
    return tt("تفسيرية");
  } },
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

  const { themes, byId: themeById } = useThemes();
  // Themes in creation order, each with its saved ayahs (an ayah can sit in
  // several); ayahs without a (live) theme gather under «بلا موضوع».
  const themeGroups = themes.map((theme) => ({
    theme,
    items: companions.notebook.filter((item) => item.theme_ids?.includes(theme.id)),
  }));
  const untagged = companions.notebook.filter(
    (item) => !(item.theme_ids ?? []).some((themeId) => themeById(themeId) != null),
  );
  const visibleSessions = companions.sessions.filter(
    (s) => sessionFilter === "all" || s.mode === sessionFilter,
  );

  const TABS: { value: LibraryTab; label: string; count: number }[] = [
    { value: "verses", label: tt("الآيات"), count: companions.notebook.length },
    { value: "documents", label: tt("الأبحاث"), count: companions.documents.length },
    { value: "sessions", label: tt("الجلسات"), count: companions.sessions.length },
    { value: "roots", label: tt("الجذور"), count: companions.roots.length },
  ];

  return (
    <div className="qb-aux">
      <div className="qb-aux-h">
        <div>
          <div className="kicker">{tt("الدفتر")}</div>
          <h2>{tt("الدفتر")}</h2>
          <div className="sub">
            {formatNumber(companions.notebook.length)} {tt("آية،")} {formatNumber(companions.documents.length)} {tt("بحث،")}{" "}
            {formatNumber(companions.sessions.length)} {tt("جلسة،")}{" "}
            {formatNumber(companions.roots.length)} {tt("جذر")}
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
      {companions.loading ? <div className="qb-aux-state is-loading">{tt("جارٍ التحميل…")}</div> : null}

      {/* ---- Verses ---- */}
      {tab === "verses" && !companions.loading ? (
        companions.notebook.length === 0 ? (
          <div className="qb-aux-state">{tt("لا توجد آيات محفوظة بعد. احفظ آية من القراءة أو من نتائج البحث.")}</div>
        ) : (
          <>
            <div className="qb-form-tabs" style={{ display: "flex", gap: 6, marginBottom: 16 }}>
              <button type="button" className={`qb-pill${verseView === "recent" ? " active" : ""}`} onClick={() => setVerseView("recent")}>
                {tt("الأحدث")}
              </button>
              <button type="button" className={`qb-pill${verseView === "themes" ? " active" : ""}`} onClick={() => setVerseView("themes")}>
                {tt("حسب الموضوع")}
              </button>
            </div>

            {verseView === "recent" ? (
              <div className="qb-aux-list">
                {companions.notebook.map((item) => (
                  <div key={item.id} className="qb-aux-row">
                    <span className="icon-tile"><Icon name="book" size={16} /></span>
                    <button type="button" className="grow qb-row-open" onClick={() => openVerse(item)}>
                      <div className="title">
                        {item.surah ?? tt("آية")} {item.ayah != null ? formatNumber(item.ayah) : ""}
                      </div>
                      <div className="meta">
                        <ThemeDots themeIds={item.theme_ids ?? []} themeById={themeById} />
                        {item.text ? <span className="qb-quran-snip">{item.text.slice(0, 64)}</span> : null}
                        {item.text ? tt("، ") : ""}
                        {relativeAge(item.created_at, formatNumber)}
                      </div>
                    </button>
                    <button type="button" className="row-action" aria-label={tt("حذف")} onClick={() => void companions.deleteNotebookItem(item.id)}>
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="qb-aux-grid">
                {themeGroups.map(({ theme, items }) => (
                  <ThemeCard key={theme.id} theme={theme} count={items.length}>
                    {items.map((item) => (
                      <MiniVerse key={item.id} item={item} onOpen={openVerse} />
                    ))}
                  </ThemeCard>
                ))}
                {untagged.length > 0 ? (
                  <div className="qb-collection-card">
                    <div className="head">
                      <span className="name">{tt(UNTAGGED)}</span>
                      <span className="count">{formatNumber(untagged.length)} {tt("آية")}</span>
                    </div>
                    <div className="body">
                      {untagged.map((item) => (
                        <MiniVerse key={item.id} item={item} onOpen={openVerse} />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </>
        )
      ) : null}

      {/* ---- Research documents ---- */}
      {tab === "documents" && !companions.loading ? (
        <>
          <div className="qb-form-tabs" style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            <button
              type="button"
              className="qb-pill active"
              onClick={async () => {
                try {
                  router.push(
                    await createDocumentUrl({
                      title: tt("بحث جديد"),
                      summary: null,
                      tags: [],
                      theme_ids: [],
                      sections: [{ id: "s1", kind: "text", title: null, body: "", ayahs: [] }],
                      references: [],
                      provenance: { mode: null, ai_sections: [], created_from: "manual" },
                    }),
                  );
                } catch {
                  /* stays on the list */
                }
              }}
            >
              <Icon name="plus" size={13} /> {tt("بحث جديد")}
            </button>
          </div>
          {companions.documents.length === 0 ? (
            <div className="qb-aux-state">
              {tt("لا أبحاث بعد. حوِّل جلسة من الدراسة، أو صدِّر لوحة موضوع، أو ابدأ بحثاً جديداً.")}
            </div>
          ) : (
            <div className="qb-aux-list">
              {companions.documents.map((document) => (
                <div key={document.id} className="qb-aux-row">
                  <span className={`icon-tile${document.mode === "tafssir" ? " copper" : ""}`}>
                    <Icon name="page" size={17} />
                  </span>
                  <button
                    type="button"
                    className="grow qb-row-open"
                    onClick={() => router.push(`/?mode=document&id=${encodeURIComponent(document.id)}`)}
                  >
                    <div className="title">{document.title}</div>
                    <div className="meta">
                      {formatNumber(document.section_count)} {tt("أقسام،")} {formatNumber(document.ayah_count)} {tt("آية،")}{" "}
                      {relativeAge(document.updated_at)}
                      {document.created_from === "studio" ? tt("، من الدراسة") : document.created_from === "board" ? tt("، من لوحة") : ""}
                    </div>
                  </button>
                  <button
                    type="button"
                    className="row-action"
                    aria-label={tt("حذف البحث")}
                    onClick={() => void companions.deleteDocument(document.id)}
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
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
            <div className="qb-aux-state">{tt("لا توجد جلسات محفوظة في هذا التصنيف.")}</div>
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
                      {formatNumber(session.message_count)} {tt("رسالة،")} {relativeAge(session.updated_at)} ·{" "}
                      {session.mode === "tafssir" ? tt("قراءة تفسيرية") : tt("القرآن وحدَه")}
                    </div>
                  </div>
                  <button type="button" className="row-action" aria-label={tt("حذف الجلسة")} onClick={() => void companions.deleteSession(session.id)}>
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
          <div className="qb-aux-state">{tt("لا توجد جذور مُتابَعة بعد. تابِع جذراً من لوحة المطابقة.")}</div>
        ) : (
          <div className="qb-aux-list">
            {companions.roots.map((root) => (
              <div key={root.id} className="qb-aux-row">
                <span className="icon-tile"><Icon name="tree" size={18} /></span>
                <div className="grow">
                  <div className="root-disp">{root.root_text}</div>
                  <div className="meta">
                    {root.occurrences != null ? tt("{0} موضع، ", { 0: formatNumber(root.occurrences) }) : ""}
                    {relativeAge(root.created_at)}
                  </div>
                </div>
                <button type="button" className="row-action" aria-label={tt("خريطة انتشار الجذر")} title={tt("خريطة الانتشار")} onClick={() => router.push(`/?mode=heatmap&root=${encodeURIComponent(root.root_text)}`)}>
                  <Icon name="graph" size={15} />
                </button>
                <button type="button" className="row-action" aria-label={tt("إلغاء المتابعة")} onClick={() => void companions.unfollowRoot(root.id)}>
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

function ThemeDots({
  themeIds,
  themeById,
}: {
  themeIds: number[];
  themeById: (themeId: number) => ThemeSummary | null;
}) {
  const live = themeIds.map(themeById).filter((theme): theme is ThemeSummary => theme != null);
  if (live.length === 0) return null;
  return (
    <span className="qb-theme-dots" aria-label={tt("المواضيع: {0}", { 0: live.map((theme) => theme.name).join(tt("، ")) })}>
      {live.map((theme) => (
        <span key={theme.id} className="dot" data-hl={theme.color} title={theme.name} />
      ))}
    </span>
  );
}

/** Past this length the two-line clamp hides part of the ayah, so offer «المزيد». */
const MINI_VERSE_CLAMP_CHARS = 90;

function MiniVerse({ item, onOpen }: { item: NotebookItem; onOpen: (item: NotebookItem) => void }) {
  const formatNumber = useNumerals();
  const [expanded, setExpanded] = useState(false);
  const long = (item.text?.length ?? 0) > MINI_VERSE_CLAMP_CHARS;
  return (
    <div className={`qb-mini-verse${expanded ? " expanded" : ""}`}>
      <button type="button" className="open" onClick={() => onOpen(item)}>
        <span className="ref">
          <Icon name="book" size={10} /> {item.surah ?? ""} {item.ayah != null ? formatNumber(item.ayah) : ""}
        </span>
        {item.text ? <span className="text">{item.text}</span> : null}
      </button>
      {long ? (
        <button type="button" className="more" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
          {expanded ? tt("أقلّ") : tt("الآية كاملة")}
        </button>
      ) : null}
    </div>
  );
}

/** A theme's card: colour, name, count, and inline rename / recolour / delete. */
function ThemeCard({ theme, count, children }: { theme: ThemeSummary; count: number; children: React.ReactNode }) {
  const formatNumber = useNumerals();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(theme.name);
  const [confirming, setConfirming] = useState(false);

  async function saveEdit(patch: { name?: string; color?: ThemeColor }) {
    try {
      await updateTheme(theme.id, patch);
    } catch {
      /* keep the current values; the card simply doesn't change */
    }
  }

  return (
    <div className="qb-collection-card qb-theme-card" data-hl={theme.color}>
      <div className="head">
        {editing ? (
          <form
            className="rename"
            onSubmit={(event) => {
              event.preventDefault();
              const trimmed = name.trim();
              if (trimmed && trimmed !== theme.name) void saveEdit({ name: trimmed });
              setEditing(false);
            }}
          >
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} aria-label={tt("اسم الموضوع")} autoFocus />
            <button type="submit" className="row-action" aria-label={tt("حفظ الاسم")}>
              <Icon name="check" size={15} />
            </button>
          </form>
        ) : (
          <span className="name">
            <span className="dot" aria-hidden />
            {theme.name}
          </span>
        )}
        <span className="count">{formatNumber(count)} {tt("آية")}</span>
        {!editing ? (
          <button
            type="button"
            className="row-action"
            aria-label={tt("لوحة «{0}»", { 0: theme.name })}
            title={tt("افتح لوحة الموضوع: رتّب الآيات واربط بينها وأضف ملاحظات")}
            onClick={() => router.push(`/?mode=board&theme=${theme.id}`)}
          >
            <Icon name="graph" size={14} />
          </button>
        ) : null}
        {!editing ? (
          <button type="button" className="row-action" aria-label={tt("تعديل «{0}»", { 0: theme.name })} onClick={() => { setName(theme.name); setEditing(true); }}>
            <Icon name="edit" size={14} />
          </button>
        ) : null}
      </div>
      {editing ? (
        <div className="edit">
          <div className="swatches" role="radiogroup" aria-label={tt("لون الموضوع")}>
            {THEME_PALETTE.map((entry) => (
              <button
                key={entry.key}
                type="button"
                role="radio"
                aria-checked={theme.color === entry.key}
                aria-label={entry.label}
                className={`swatch${theme.color === entry.key ? " on" : ""}`}
                data-hl={entry.key}
                onClick={() => void saveEdit({ color: entry.key })}
              />
            ))}
          </div>
          {confirming ? (
            <div className="confirm">
              <span>{tt("حذف الموضوع؟ تبقى آياته محفوظة.")}</span>
              <button type="button" className="danger" onClick={() => void deleteTheme(theme.id).catch(() => {})}>
                {tt("حذف")}
              </button>
              <button type="button" onClick={() => setConfirming(false)}>
                {tt("إلغاء")}
              </button>
            </div>
          ) : (
            <button type="button" className="delete" onClick={() => setConfirming(true)}>
              <Icon name="trash" size={13} /> {tt("حذف الموضوع")}
            </button>
          )}
        </div>
      ) : null}
      <div className="body">
        {count === 0 ? <div className="empty">{tt("لا آيات بعد — ظلِّل آية بهذا الموضوع من القراءة.")}</div> : children}
      </div>
    </div>
  );
}
