"use client";

import "./companions.css";

import { useEffect, useRef, useState } from "react";

import "@/features/themes/themes.css";
import { useRouter, useSearchParams } from "next/navigation";

import type { NotebookItem, ThemeColor, ThemeSummary } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { SwipeRow } from "@/components/swipe-row";
import { useNumerals } from "@/lib/preferences-context";
import { queueStudioOpenSession } from "@/lib/studio-prefill";
import { boardUrl } from "@/features/board/last-board";
import { createThemeBoard, useThemeBoards, type BoardListing } from "@/features/board/theme-boards";
import { useStickyState } from "@/lib/use-sticky-state";
import { useMushaf } from "@/features/reading/mushaf-context";
import { useShellMode } from "@/features/shell/mode-context";
import { markReplace } from "@/features/shell/navigation";
import { useWorkspace } from "@/features/shell/workspace-context";
import { THEME_PALETTE } from "@/features/themes/palette";
import { deleteTheme, updateTheme, useThemes } from "@/features/themes/themes-store";
import { createDocumentUrl } from "@/features/documents/open-document";

import { relativeAge, useCompanions } from "./use-companions";

import { t as tt, tn } from "@/lib/i18n";

type LibraryTab = "verses" | "boards" | "documents" | "sessions" | "roots";
const LIBRARY_TABS: readonly LibraryTab[] = ["verses", "boards", "documents", "sessions", "roots"];

/** The library tab named in the URL (`&tab=`), else «الآيات». */
export function libraryTab(value: string | null): LibraryTab {
  return LIBRARY_TABS.includes(value as LibraryTab) ? (value as LibraryTab) : "verses";
}
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

  const [tab, setTabState] = useState<LibraryTab>(initialTab);
  // «اللوحات» can open on one theme (from its card or the save sheet).
  const params = useSearchParams();
  const [focusTheme, setFocusTheme] = useState<number | null>(Number(params.get("focus")) || null);
  // The tab lives in the URL too, so «الدفتر» reopens on it (see mode-context).
  function setTab(next: LibraryTab, focus: number | null = null) {
    setTabState(next);
    setFocusTheme(focus);
    const sp = new URLSearchParams(window.location.search);
    sp.set("mode", "notebook");
    sp.set("tab", next);
    if (focus) sp.set("focus", String(focus));
    else sp.delete("focus");
    // A tab change replaces the screen in the back stack (back leaves the notebook).
    markReplace();
    router.replace(`/?${sp.toString()}`, { scroll: false });
  }

  function openRootInsights(rootText: string) {
    setMode("heatmap", { params: { root: rootText, tab: null, focus: null } });
  }
  const [verseView, setVerseView] = useStickyState<VerseView>("qb.notebook.verseView", "recent", ["recent", "themes"]);
  const [sessionFilter, setSessionFilter] = useStickyState<SessionFilter>("qb.notebook.sessionFilter", "all", ["all", "strict", "tafssir"]);

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
  const themeBoards = useThemeBoards();
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
    { value: "boards", label: tt("اللوحات"), count: themeBoards.boards?.length ?? 0 },
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
            {[
              tn("{0} آية", companions.notebook.length, { 0: formatNumber(companions.notebook.length) }),
              tn("{0} بحث", companions.documents.length, { 0: formatNumber(companions.documents.length) }),
              tn("{0} جلسة", companions.sessions.length, { 0: formatNumber(companions.sessions.length) }),
              tn("{0} جذر", companions.roots.length, { 0: formatNumber(companions.roots.length) }),
            ].join(tt("، "))}
          </div>
        </div>
      </div>

      <div className="qb-lib-tabs qb-fit-track" data-autofit="2" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={tab === t.value}
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
                  <SwipeRow key={item.id} onDelete={() => void companions.deleteNotebookItem(item.id)}>
                  <div className="qb-aux-row">
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
                    <button type="button" className="row-action delete" aria-label={tt("حذف")} onClick={() => void companions.deleteNotebookItem(item.id)}>
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                  </SwipeRow>
                ))}
              </div>
            ) : (
              <div className="qb-aux-grid">
                {themeGroups.map(({ theme, items }) => (
                  <ThemeCard
                    key={theme.id}
                    theme={theme}
                    count={items.length}
                    boards={themeBoards.boards ? themeBoards.boards.filter((board) => board.theme.id === theme.id) : null}
                    onOpenBoards={() => setTab("boards", theme.id)}
                  >
                    {items.map((item) => (
                      <MiniVerse key={item.id} item={item} onOpen={openVerse} />
                    ))}
                  </ThemeCard>
                ))}
                {untagged.length > 0 ? (
                  <div className="qb-collection-card">
                    <div className="head">
                      <span className="name">{tt(UNTAGGED)}</span>
                      <span className="count">{tn("{0} آية", untagged.length, { 0: formatNumber(untagged.length) })}</span>
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

      {/* ---- Boards (several per theme, made on purpose) ---- */}
      {tab === "boards" ? <BoardsTab themes={themes} boards={themeBoards} focusTheme={focusTheme} /> : null}

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
                <SwipeRow key={document.id} onDelete={() => void companions.deleteDocument(document.id)}>
                <div className="qb-aux-row">
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
                      {tn("{0} قسم", document.section_count, { 0: formatNumber(document.section_count) })}
                      {tt("، ")}
                      {tn("{0} آية", document.ayah_count, { 0: formatNumber(document.ayah_count) })}
                      {tt("، ")}
                      {relativeAge(document.updated_at, formatNumber)}
                      {document.created_from === "studio" ? tt("، من الدراسة") : document.created_from === "board" ? tt("، من لوحة") : ""}
                    </div>
                  </button>
                  <button
                    type="button"
                    className="row-action delete"
                    aria-label={tt("حذف البحث")}
                    onClick={() => void companions.deleteDocument(document.id)}
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </div>
                </SwipeRow>
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
                <SwipeRow key={session.id} onDelete={() => void companions.deleteSession(session.id)}>
                <div className="qb-aux-row">
                  <span className={`icon-tile${session.mode === "tafssir" ? " copper" : ""}`}>
                    <Icon name={session.mode === "tafssir" ? "feather" : "scale"} size={18} />
                  </span>
                  <button
                    type="button"
                    className="grow qb-row-open"
                    onClick={() => {
                      queueStudioOpenSession(session.id);
                      setMode("studio");
                    }}
                  >
                    <div className="title">{session.title}</div>
                    <div className="meta">
                      {tn("{0} رسالة", session.message_count, { 0: formatNumber(session.message_count) })}
                      {tt("، ")}
                      {relativeAge(session.updated_at, formatNumber)} ·{" "}
                      {session.mode === "tafssir" ? tt("قراءة تفسيرية") : tt("القرآن وحدَه")}
                    </div>
                  </button>
                  <button type="button" className="row-action delete" aria-label={tt("حذف الجلسة")} onClick={() => void companions.deleteSession(session.id)}>
                    <Icon name="trash" size={15} />
                  </button>
                </div>
                </SwipeRow>
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
              // The whole row opens the root's insights (its spread over the
              // mushaf); the row is role=button so the unfollow stays a real button.
              <SwipeRow key={root.id} label={tt("إلغاء المتابعة")} onDelete={() => void companions.unfollowRoot(root.id)}>
              <div
                className="qb-aux-row is-link"
                role="button"
                tabIndex={0}
                aria-label={tt("خريطة انتشار الجذر") + tt("، ") + root.root_text}
                onClick={() => openRootInsights(root.root_text)}
                onKeyDown={(event) => {
                  if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    openRootInsights(root.root_text);
                  }
                }}
              >
                <span className="icon-tile"><Icon name="tree" size={18} /></span>
                <div className="grow">
                  <div className="root-disp">{root.root_text}</div>
                  <div className="meta">
                    {root.occurrences != null ? tn("{0} موضع", root.occurrences, { 0: formatNumber(root.occurrences) }) + tt("، ") : ""}
                    {relativeAge(root.created_at, formatNumber)}
                  </div>
                </div>
                <button
                  type="button"
                  className="row-action delete"
                  aria-label={tt("إلغاء المتابعة")}
                  onClick={(event) => {
                    event.stopPropagation();
                    void companions.unfollowRoot(root.id);
                  }}
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>
              </SwipeRow>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}

/**
 * «اللوحات» — the boards, grouped by theme in the same cards as «حسب الموضوع».
 * A new board is made on purpose: «لوحة جديدة» asks for its name first.
 */
function BoardsTab({
  themes,
  boards,
  focusTheme,
}: {
  themes: ThemeSummary[];
  boards: ReturnType<typeof useThemeBoards>;
  focusTheme: number | null;
}) {
  if (boards.boards === null) return <div className="qb-aux-state is-loading">{tt("جارٍ التحميل…")}</div>;
  if (themes.length === 0) {
    return <div className="qb-aux-state">{tt("لا مواضيع بعد. ظلِّل آيات بموضوع من القراءة، ثم أنشئ لها لوحة.")}</div>;
  }
  const byTheme = new Map<number, BoardListing[]>();
  for (const board of boards.boards) byTheme.set(board.theme.id, [...(byTheme.get(board.theme.id) ?? []), board]);
  // The focused theme first, then themes with boards (most recently edited), then the rest.
  const latest = (themeId: number) => Math.max(0, ...(byTheme.get(themeId) ?? []).map((board) => board.updated_at || 1));
  const ordered = [...themes].sort((a, b) => Number(b.id === focusTheme) - Number(a.id === focusTheme) || latest(b.id) - latest(a.id));
  return (
    <div className="qb-aux-grid">
      {ordered.map((theme) => (
        <ThemeBoardsCard key={theme.id} theme={theme} boards={byTheme.get(theme.id) ?? []} actions={boards} focused={theme.id === focusTheme} />
      ))}
    </div>
  );
}

function ThemeBoardsCard({
  theme,
  boards,
  actions,
  focused,
}: {
  theme: ThemeSummary;
  boards: BoardListing[];
  actions: ReturnType<typeof useThemeBoards>;
  focused: boolean;
}) {
  const router = useRouter();
  const formatNumber = useNumerals();
  const cardRef = useRef<HTMLDivElement | null>(null);
  // Opened from a theme with no board: the naming step is already showing.
  const [creating, setCreating] = useState(focused && boards.length === 0);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    if (focused) cardRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [focused]);

  const suggested = boards.length ? `${theme.name} ${formatNumber(boards.length + 1)}` : theme.name;

  async function create() {
    setBusy(true);
    try {
      router.push(boardUrl(theme.id, await createThemeBoard(theme, newName.trim() || suggested)));
    } catch {
      setBusy(false);
    }
  }

  return (
    <div ref={cardRef} className={`qb-collection-card qb-theme-card qb-boards-card${focused ? " focused" : ""}`} data-hl={theme.color}>
      <div className="head">
        <span className="name">
          <span className="dot" aria-hidden />
          {theme.name}
        </span>
        <span className="count">{tt("اللوحات: {0}", { 0: formatNumber(boards.length) })}</span>
      </div>
      <div className="body">
        {boards.length === 0 && !creating ? <p className="empty">{tt("لا لوحات لهذا الموضوع بعد.")}</p> : null}
        {boards.map((board) => {
          const key = board.id;
          return (
            <div key={key} className="qb-board-item">
              {renaming === key ? (
                <form
                  className="rename"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void actions.renameBoard(theme.id, board.id, name);
                    setRenaming(null);
                  }}
                >
                  <input value={name} onChange={(event) => setName(event.target.value.slice(0, 80))} aria-label={tt("اسم اللوحة")} autoFocus />
                  <button type="submit" className="row-action" aria-label={tt("حفظ الاسم")}>
                    <Icon name="check" size={15} />
                  </button>
                </form>
              ) : (
                <button type="button" className="open" onClick={() => router.push(boardUrl(theme.id, board.id))}>
                  <Icon name="graph" size={15} />
                  <span className="text">
                    <span className="title">{board.name}</span>
                    <span className="meta">
                      {tn("{0} آية", board.ayahs, { 0: formatNumber(board.ayahs) })}
                      {board.updated_at ? `${tt("، ")}${relativeAge(board.updated_at, formatNumber)}` : ""}
                    </span>
                  </span>
                </button>
              )}
              {confirming === key ? (
                <span className="confirm">
                  <button
                    type="button"
                    className="danger"
                    onClick={() => {
                      void actions.removeBoard(theme.id, board.id);
                      setConfirming(null);
                    }}
                  >
                    {tt("حذف")}
                  </button>
                  <button type="button" onClick={() => setConfirming(null)}>
                    {tt("إلغاء")}
                  </button>
                </span>
              ) : renaming === key ? null : (
                <>
                  <button
                    type="button"
                    className="row-action"
                    aria-label={tt("تعديل «{0}»", { 0: board.name })}
                    onClick={() => {
                      setName(board.name);
                      setRenaming(key);
                    }}
                  >
                    <Icon name="edit" size={14} />
                  </button>
                  <button type="button" className="row-action" aria-label={tt("حذف اللوحة")} onClick={() => setConfirming(key)}>
                    <Icon name="trash" size={14} />
                  </button>
                </>
              )}
            </div>
          );
        })}
        {creating ? (
          <form
            className="qb-board-create"
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value.slice(0, 80))}
              placeholder={suggested}
              aria-label={tt("اسم اللوحة")}
              autoFocus
            />
            <button type="submit" className="primary" disabled={busy}>
              {tt("إنشاء")}
            </button>
            <button type="button" onClick={() => setCreating(false)} disabled={busy}>
              {tt("إلغاء")}
            </button>
          </form>
        ) : (
          <button type="button" className="qb-board-new" onClick={() => setCreating(true)}>
            <Icon name="plus" size={13} /> {tt("لوحة جديدة")}
          </button>
        )}
      </div>
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
function ThemeCard({
  theme,
  count,
  boards,
  onOpenBoards,
  children,
}: {
  theme: ThemeSummary;
  count: number;
  /** This theme's boards (null while loading). */
  boards: BoardListing[] | null;
  /** Show this theme's boards (and the way to make one) in «اللوحات». */
  onOpenBoards: () => void;
  children: React.ReactNode;
}) {
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
        <span className="count">{tn("{0} آية", count, { 0: formatNumber(count) })}</span>
        {!editing ? (
          // Access, not creation: one board opens directly; otherwise the
          // theme's boards (where a new one is made on purpose, with a name).
          <button
            type="button"
            className="qb-board-open"
            aria-label={tt("لوحات «{0}»", { 0: theme.name })}
            title={tt("لوحات الموضوع: رتّب الآيات واربط بينها وأضف ملاحظات")}
            onClick={() => (boards?.length === 1 ? router.push(boardUrl(theme.id, boards[0].id)) : onOpenBoards())}
          >
            <Icon name="graph" size={14} /> {tt("اللوحات")}
            {boards?.length ? <span className="n">{formatNumber(boards.length)}</span> : null}
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
