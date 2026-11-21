"use client";

import "@/features/reading/reading.css";
import "./studio.css";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { ResearchAgentResponse, SearchVerse } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { Sheet, usePhoneSheets } from "@/components/sheet";
import { haptic } from "@/lib/haptics";
import { drawEvidenceThread } from "@/lib/draw-evidence-thread";
import { MiniRibbon } from "@/components/ribbon";
import { useWebDesign } from "@/lib/use-web-design";

import { citedSurahCounts } from "./cited-surahs";
import { awayFromLatest } from "./thread-follow";
import "./studio.web.css";
import { useNumerals } from "@/lib/preferences-context";
import { renderHighlightedVerseText } from "@/lib/quran-ui";
import { STUDIO_ASK_EVENT, drainStudioAsk, drainStudioOpenSession, type StudioAsk } from "@/lib/studio-prefill";
import { useMushaf } from "@/features/reading/mushaf-context";
import { useStickyState } from "@/lib/use-sticky-state";
import { useDialog } from "@/lib/use-dialog";
import { useShellMode } from "@/features/shell/mode-context";
import { useTopBarSlots } from "@/features/shell/top-bar-slots";
import { useWorkspace } from "@/features/shell/workspace-context";

import { ExportModal } from "@/features/export/export-modal";
import { documentFromSession } from "@/features/documents/convert";
import { createDocumentUrl } from "@/features/documents/open-document";

import { AiPicker } from "./ai-picker";
import { ChatMarkdown } from "./chat-markdown-view";
import { textDirection } from "./chat-markdown";
import { CopyButton } from "./copy-button";
import { answerAsText } from "./message-text";
import { hasMoreAyahs, loadMoreAyahsPool, MORE_AYAHS_STEP } from "./more-ayahs";
import { RiskConsent, useStudyRisksAccepted } from "./risk-consent";
import { sessionHistory, type HistoryItem } from "./session-history";
import { StudioNotices } from "./studio-notices";
import { TafssirDisclaimer } from "./tafssir-disclaimer";
import { useStudioSessions } from "./use-studio-sessions";

import { t, tn } from "@/lib/i18n";
import { API_BASE_URL } from "@/lib/config";

const searchApi = createQBasairApiClient({ baseUrl: API_BASE_URL });

const TAFSSIR_SECTIONS: { key: keyof NonNullable<ResearchAgentResponse["tafssir"]>; label: string }[] = [
  { key: "summary", get label() {
    return t("الخلاصة");
  } },
  { key: "linguistic_analysis", get label() {
    return t("التحليل اللغوي");
  } },
  { key: "ayah_connections", get label() {
    return t("ربط الآيات");
  } },
  { key: "corpus_insight", get label() {
    return t("الرؤية المستفادة");
  } },
  { key: "limits_and_cautions", get label() {
    return t("حدود القراءة");
  } },
];

/**
 * Studio panel — the research workspace. Strict mode = gold (Qurʾān-only
 * evidence); Tafssir mode = copper (experimental). Evidence cards jump
 * the Mushaf via the shared useMushaf hook.
 */
export function StudioPanel() {
  const router = useRouter();
  const studio = useStudioSessions();
  const mushaf = useMushaf();
  const { state } = useWorkspace();
  // Web design: the panel can widen over the Mushaf (features/shell/room.tsx).
  const webDesign = useWebDesign();
  const { mode: shellMode, setMode: setShellMode } = useShellMode();
  const topSlots = useTopBarSlots(shellMode === "studio");
  const formatNumber = useNumerals();

  const [draft, setDraft] = useState("");
  // No question goes out before the reader accepts that answers can be wrong.
  const risksAccepted = useStudyRisksAccepted();
  const [exportOpen, setExportOpen] = useState(false);
  const [converting, setConverting] = useState(false);
  // «حوّل إلى بحث» asks first (a banner under the header): the tap creates a
  // document, so a stray touch shouldn't. A failure says so in the banner.
  const [convertAsk, setConvertAsk] = useState<"closed" | "ask" | "failed">("closed");
  // A phone asks in a bottom sheet instead of a banner under the header.
  const phoneSheets = usePhoneSheets();
  const [sessionsOpen, setSessionsOpen] = useState(false);
  // Web design: the sessions are a pane laid over the thread, like every AI
  // chat; it never splits the page, and folds away once a question is sent.
  const [sideOpen, setSideOpen] = useStickyState<boolean>("qb.studio.sessionsPane", false);

  // «حوّل إلى بحث»: the session becomes an editable research document.
  async function convertToDocument({ confirmFeel = false }: { confirmFeel?: boolean } = {}) {
    if (!active || active.messages.length === 0 || converting) return;
    setConverting(true);
    try {
      const url = await createDocumentUrl(documentFromSession(active));
      // The phone sheet's confirmation answers with a success tap, once it worked.
      if (confirmFeel) haptic("success");
      router.push(url);
      setConvertAsk("closed");
    } catch {
      // The session is untouched; the banner offers another try.
      setConvertAsk("failed");
    } finally {
      setConverting(false);
    }
  }
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  // The composer floats over the thread's end (glass): the stage publishes
  // its height so the last message can scroll clear of it.
  const stageRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);
  // Up the history: an arrow brings the newest message back.
  const [awayFromEnd, setAwayFromEnd] = useState(false);

  const active = studio.active;
  // Study answers from the Quran alone. A session saved when the experimental
  // explanatory reading existed still shows its answers, under its disclaimer.
  const hasLegacyTafssir = Boolean(active?.messages.some((message) => message.response?.mode === "tafssir"));
  const hasMessages = Boolean(active && active.messages.length > 0);
  // The history: the open sessions that hold a conversation, newest first,
  // then the ones saved to the account that are not open (session-history.ts).
  // An empty session is not history; with none, there is no pane to open.
  const history = sessionHistory(studio.sessions, studio.saved);
  const savedOnly = history.filter((item) => !item.open);
  const paneOpen = sideOpen && history.length > 0;

  // A click (or tap) outside the open sessions pane folds it away, as the
  // Escape key does; its own toggle in the top bar keeps toggling it.
  const sideRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!paneOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target || sideRef.current?.contains(target) || target.closest?.(".qb-studio-side-toggle")) return;
      setSideOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [paneOpen, setSideOpen]);

  // A question asked about one session never carries over to another.
  useEffect(() => setConvertAsk("closed"), [active?.id]);

  // Keep the newest message (and the "analyzing…" pending row) in view as the
  // thread grows, on send, and when switching tabs.
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setAwayFromEnd(false);
  }, [active?.id, active?.messages.length, studio.isResearching]);

  useEffect(() => {
    const stage = stageRef.current;
    const composer = composerRef.current;
    if (!stage || !composer || typeof ResizeObserver === "undefined") return;
    const publish = () => stage.style.setProperty("--qb-composer-h", `${composer.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(composer);
    return () => observer.disconnect();
  }, []);

  function jumpToLatest() {
    const el = threadRef.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }

  async function submit() {
    const content = draft.trim();
    if (!content || studio.isResearching || !risksAccepted) return;
    setDraft("");
    setSideOpen(false);
    // Unanswered (the error says why): the question comes back to the field,
    // unless the reader has started typing another.
    const answered = await studio.submit(content, state.selectedMushaf);
    if (!answered) setDraft((current) => current || content);
  }

  // A prefilled ask (from the command bar or the Home "اسأل" bar) opens a FRESH
  // session — it must not inherit an existing thread's mode/context. A queued
  // session-open (Home / history) hydrates that saved thread as a tab. The refs
  // always hold the latest bindings so the deferred drain uses live settings.
  const askRef = useRef<(ask: StudioAsk) => void>(() => {});
  askRef.current = (ask) => {
    // Not accepted yet: the question waits in the field, under the banner.
    if (!risksAccepted) {
      setDraft(ask.question);
      return;
    }
    void studio.askInNewSession(ask.question, state.selectedMushaf, {
      focus: ask.focus,
      focusLabel: ask.focusLabel,
    });
  };
  const openRef = useRef<(id: string) => void>(() => {});
  openRef.current = (id) => void studio.openSavedSession(id);

  useEffect(() => {
    const drain = () => {
      const openId = drainStudioOpenSession();
      if (openId) openRef.current(openId);
      const ask = drainStudioAsk();
      if (ask) askRef.current(ask);
    };
    // Defer past the persisted-sessions restore (a mount effect that re-renders),
    // so we submit into the real active session.
    const timer = window.setTimeout(drain, 0);
    window.addEventListener(STUDIO_ASK_EVENT, drain);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(STUDIO_ASK_EVENT, drain);
    };
  }, []);

  const openAiSettings = () => setShellMode("settings", { params: { section: "ai" } });

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  // Web design, desktop: the open session's name and the panel's actions live
  // in the shell's top bar (top-bar-slots.ts); the sessions are a side column.
  const barTitle = (
    <div className="qb-studio-bar">
      {history.length > 0 ? (
        <button
          type="button"
          className={`qb-studio-side-toggle${paneOpen ? " on" : ""}`}
          aria-pressed={paneOpen}
          aria-label={paneOpen ? t("إخفاء الجلسات") : t("إظهار الجلسات")}
          title={paneOpen ? t("إخفاء الجلسات") : t("إظهار الجلسات")}
          onClick={() => setSideOpen(!paneOpen)}
        >
          <Icon name="sidebar" size={17} />
        </button>
      ) : null}
      <span className="qb-studio-bar-title" title={titleOf(active)}>
        {titleOf(active)}
      </span>
    </div>
  );
  const sessionsSide = (
    <nav
      ref={sideRef}
      className={`qb-studio-side${paneOpen ? " open" : ""}`}
      aria-label={t("الجلسات")}
      inert={!paneOpen}
      onKeyDown={(event) => {
        if (event.key === "Escape") setSideOpen(false);
      }}
    >
      {/* A new session only makes sense once the open one holds a question. */}
      {hasMessages ? (
        <button type="button" className="qb-studio-new" onClick={studio.newSession}>
          <Icon name="plus" size={15} />
          <span>{t("جلسة جديدة")}</span>
        </button>
      ) : null}
      <div className="qb-studio-side-label">{t("الجلسات")}</div>
      <ul className="qb-studio-side-list">
        {history.map((session) => (
          <li key={session.id} className={session.id === studio.activeId ? "active" : ""}>
            <button
              type="button"
              className="open"
              aria-current={session.id === studio.activeId ? "true" : undefined}
              onClick={() => (session.open ? studio.setActiveId(session.id) : void studio.openSavedSession(session.id))}
            >
              <span className="name">{session.title}</span>
              <span className="count">{tn("{0} رسالة", session.count, { 0: formatNumber(session.count) })}</span>
            </button>
            {/* Closing only leaves this tab: a saved session stays on the account. */}
            {session.open ? (
              <button type="button" className="x" aria-label={t("إغلاق الجلسة")} title={t("إغلاق الجلسة")} onClick={() => studio.closeSession(session.id)}>
                <Icon name="close" size={13} />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </nav>
  );
  const sessionTabs = (
    <div className="qb-studio-tabs">
      {studio.sessions.map((session) => (
        <div
          key={session.id}
          className={`qb-studio-tab${session.id === studio.activeId ? " active" : ""}`}
        >
          <Icon name="sparkles" size={12} />
          <button
            type="button"
            className="label"
            style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer" }}
            onClick={() => studio.setActiveId(session.id)}
          >
            {titleOf(session)}
          </button>
          <button
            type="button"
            className="x"
            aria-label={t("إغلاق الجلسة")}
            onClick={() => studio.closeSession(session.id)}
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" className="qb-studio-tab add" onClick={studio.newSession} aria-label={t("جلسة جديدة")}>
        <Icon name="plus" size={12} />
      </button>
    </div>
  );
  const headActions = (
    <>
      {hasMessages ? (
        <button
          type="button"
          className={`close${convertAsk !== "closed" ? " on" : ""}`}
          title={t("حوّل إلى بحث قابل للتحرير والمشاركة")}
          aria-label={t("حوّل إلى بحث")}
          aria-expanded={convertAsk !== "closed"}
          disabled={converting}
          onClick={() => setConvertAsk((value) => (value === "closed" ? "ask" : "closed"))}
        >
          <Icon name="page" size={16} />
        </button>
      ) : null}
      <button
        type="button"
        className="close desk-only"
        title={t("تصدير الجلسة")}
        aria-label={t("تصدير الجلسة")}
        disabled={!active || active.messages.length === 0}
        onClick={() => setExportOpen(true)}
      >
        <Icon name="share" size={16} />
      </button>
      <button
        type="button"
        className="close"
        title={t("الذكاء الاصطناعي")}
        aria-label={t("الذكاء الاصطناعي")}
        // The AI connection lives in Settings now (features/settings/ai-settings.tsx).
        onClick={openAiSettings}
      >
        <Icon name="settings" size={16} />
      </button>
      {/* The web design leaves the panel through the rail, like every page: no close. */}
      {webDesign ? null : (
        <button
          type="button"
          className="close desk-only"
          title={t("إغلاق")}
          aria-label={t("إغلاق لوحة الدراسة")}
          onClick={() => setShellMode("reading")}
        >
          <Icon name="close" size={16} />
        </button>
      )}
    </>
  );

  return (
    <aside className="qb-side-panel qb-side-panel-wide" aria-label={t("لوحة الدراسة")}>
      <div className={`qb-studio${topSlots ? ` is-desk${paneOpen ? " has-side" : ""}` : ""}`}>
        {topSlots ? (
          <>
            {createPortal(barTitle, topSlots.start)}
            {createPortal(headActions, topSlots.end)}
            {history.length > 0 ? sessionsSide : null}
          </>
        ) : (
          <>
            {sessionTabs}
            <div className="qb-side-head qb-studio-head" style={{ borderBottom: "none", padding: "14px 20px 4px" }}>
              <div className="qb-studio-head-main">
                <div className="kicker">{t("جلسة الدراسة")}</div>
                {/* The title opens the open sessions (phones have no tab strip). */}
                <h3 style={{ fontSize: 20 }}>
                  <button
                    type="button"
                    className="qb-studio-title"
                    onClick={() => setSessionsOpen(true)}
                    aria-haspopup="dialog"
                    aria-label={`${titleOf(active)} · ${t("الجلسات")}`}
                  >
                    <span className="txt">{titleOf(active)}</span>
                    <Icon name="chevDown" size={16} />
                  </button>
                </h3>
                <div className="meta">
                  {tn("{0} رسالة", active?.messages.length ?? 0, { 0: formatNumber(active?.messages.length ?? 0) })} ·{" "}
                  {t("القرآن وحدَه")}
                </div>
              </div>
              {headActions}
            </div>
          </>
        )}

        {/* Desk: the thread and the composer beside the sessions; elsewhere the
            wrapper is transparent to the panel's column layout. */}
        <div className="qb-studio-main" style={topSlots ? undefined : { display: "contents" }}>
        {convertAsk !== "closed" && hasMessages && phoneSheets ? (
          <Sheet
            label={convertAsk === "failed" ? t("تعذّر إنشاء البحث. حاول مرة أخرى.") : t("حوّل إلى بحث")}
            onClose={() => setConvertAsk("closed")}
            className="is-confirm"
          >
            {convertAsk === "failed" ? null : (
              <p className="qb-sheet-text">{t("حوّل هذه الجلسة إلى بحث قابل للتحرير؟ تبقى الجلسة كما هي.")}</p>
            )}
            <div className="qb-sheet-actions">
              <button
                type="button"
                className="primary"
                disabled={converting}
                onClick={() => void convertToDocument({ confirmFeel: true })}
              >
                {t("حوّل إلى بحث")}
              </button>
              <button type="button" className="cancel" onClick={() => setConvertAsk("closed")}>
                {t("إلغاء")}
              </button>
            </div>
          </Sheet>
        ) : null}
        {convertAsk !== "closed" && hasMessages && !phoneSheets ? (
          <div className="qb-studio-confirm" role={convertAsk === "failed" ? "alert" : "status"}>
            <p>
              {convertAsk === "failed"
                ? t("تعذّر إنشاء البحث. حاول مرة أخرى.")
                : t("حوّل هذه الجلسة إلى بحث قابل للتحرير؟ تبقى الجلسة كما هي.")}
            </p>
            <div className="actions">
              <button type="button" className="ok" disabled={converting} onClick={() => void convertToDocument()}>
                <Icon name="page" size={13} /> {t("حوّل إلى بحث")}
              </button>
              <button type="button" className="cancel" onClick={() => setConvertAsk("closed")}>
                {t("إلغاء")}
              </button>
            </div>
          </div>
        ) : null}

        {hasLegacyTafssir ? <TafssirDisclaimer /> : null}

        {risksAccepted ? <StudioNotices onOpenAiSettings={openAiSettings} /> : null}

        {/* Desk: the error sits on the question field instead (below). */}
        {studio.error && !topSlots ? <div className="qb-studio-error">{studio.error}</div> : null}

        {active?.focus ? (
          <div className="qb-studio-focus" role="note">
            <Icon name="feather" size={13} />
            <span>
              {t("الآية المقصودة:")} {active.focusLabel ?? `${active.focus.surah}:${active.focus.ayah}`}{t("، تُقرأ مع ما قبلها وما بعدها وسياق السورة.")}
            </span>
          </div>
        ) : null}

        <div className="qb-studio-stage" ref={stageRef}>
        {/* Before the first question: the risks, in the middle of the page, to accept. */}
        {!risksAccepted ? (
          <RiskConsent />
        ) : active && active.messages.length > 0 ? (
          <div
            className="qb-thread"
            ref={threadRef}
            onScroll={(event) => setAwayFromEnd(awayFromLatest(event.currentTarget))}
          >
            {active.messages.map((message, index) =>
              message.role === "user" ? (
                <div key={`${active.id}-${index}`} className="qb-msg user qb-selectable">
                  <div className="lbl">{t("السؤال")}</div>
                  <p dir="auto">{message.content}</p>
                  <div className="qb-msg-tools">
                    <CopyButton label={t("نسخ السؤال")} text={() => message.content} />
                  </div>
                </div>
              ) : (
                <BotMessage
                  key={`${active.id}-${index}`}
                  response={message.response}
                  fallback={message.content}
                  onJump={(ayahId, mushafId, highlights) =>
                    void mushaf.loadByAyah(mushafId || state.selectedMushaf, ayahId, highlights)
                  }
                />
              ),
            )}
            {studio.isResearching ? (
              <div className="qb-studio-pending">
                <Icon name="sparkles" size={14} /> {t("يجري تحليل الآيات…")}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="qb-studio-state">
            <Icon name="sparkles" size={22} />
            <span>
              {t("اطرح سؤالاً حرّاً — يُحوّله الباحث إلى ألفاظ قرآنية، يعرض الآيات الأقرب، ثم يصوغ الجواب منها.")}
            </span>
          </div>
        )}

        {hasMessages && awayFromEnd ? (
          <button type="button" className="qb-thread-latest" onClick={jumpToLatest} aria-label={t("إلى آخر رسالة")} title={t("إلى آخر رسالة")}>
            <Icon name="arrowDown" size={18} />
          </button>
        ) : null}

        <div className="qb-composer" ref={composerRef}>
          {studio.error && topSlots ? (
            <div className="qb-studio-error is-docked" role="alert">
              <Icon name="alert" size={15} />
              <span>{studio.error}</span>
            </div>
          ) : null}
          <div className="input-wrap">
            <textarea
              ref={textareaRef}
              rows={1}
              value={draft}
              placeholder={hasMessages ? t("تابع البحث، أو اطرح سؤالاً جديداً…") : t("اطرح سؤالك…")}
              aria-label={t("سؤالك")}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
            />
            <div className="row">
              <AiPicker onOpenSettings={openAiSettings} />
              {topSlots ? (
                <span className="hint">{t("Enter للإرسال، Shift+Enter لسطر جديد")}</span>
              ) : null}
              <div className="grow" />
              <button
                type="button"
                className="send"
                onClick={submit}
                disabled={studio.isResearching || !draft.trim() || !risksAccepted}
                aria-label={t("اسأل")}
                title={t("اسأل")}
              >
                <Icon name={topSlots ? "arrowUp" : "send"} size={topSlots ? 17 : 11} />
                <span className="lbl">{t("اسأل")}</span>
              </button>
            </div>
          </div>
        </div>
        </div>
        </div>
      </div>

      {exportOpen && active ? <ExportModal session={active} onClose={() => setExportOpen(false)} /> : null}
      {sessionsOpen ? (
        <SessionsSheet
          sessions={studio.sessions}
          saved={savedOnly}
          activeId={studio.activeId}
          onPick={(id) => {
            studio.setActiveId(id);
            setSessionsOpen(false);
          }}
          onOpenSaved={(id) => {
            void studio.openSavedSession(id);
            setSessionsOpen(false);
          }}
          onCloseSession={studio.closeSession}
          onNew={() => {
            studio.newSession();
            setSessionsOpen(false);
          }}
          onClose={() => setSessionsOpen(false)}
        />
      ) : null}
    </aside>
  );
}

/**
 * A session's name. An empty one is «جلسة جديدة» in the language on screen: the
 * name it was given may come from before the dictionary loaded (or another
 * language), and it only gets its own once a question is asked.
 */
function titleOf(session: { title: string; messages: unknown[] } | null | undefined): string {
  return session && session.messages.length > 0 ? session.title : t("جلسة جديدة");
}

/** The sessions, as a bottom sheet: pick an open or saved one, close one, or start one. */
function SessionsSheet({
  sessions,
  saved,
  activeId,
  onPick,
  onOpenSaved,
  onCloseSession,
  onNew,
  onClose,
}: {
  sessions: { id: string; title: string; messages: unknown[] }[];
  saved: HistoryItem[];
  activeId: string;
  onPick: (id: string) => void;
  onOpenSaved: (id: string) => void;
  onCloseSession: (id: string) => void;
  onNew: () => void;
  onClose: () => void;
}) {
  const panelRef = useDialog<HTMLDivElement>(onClose);
  const formatNumber = useNumerals();
  // In <body>: the panel's stacking context would otherwise keep the sheet
  // under the tab bar.
  return createPortal(
    <div className="qb-rsheet qb-studio-sessions" role="dialog" aria-modal="true" aria-labelledby="qb-studio-sessions-title">
      <div className="backdrop" onClick={onClose} aria-hidden />
      <div className="panel" ref={panelRef} tabIndex={-1}>
        <div className="grip" aria-hidden />
        <div className="head">
          <h2 id="qb-studio-sessions-title">{t("الجلسات")}</h2>
          <button type="button" className="close" onClick={onClose} aria-label={t("إغلاق")}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="body menu-list">
          {sessions.map((session) => (
            <div key={session.id} className={`qb-studio-session${session.id === activeId ? " active" : ""}`}>
              <button type="button" className="menu-item" aria-current={session.id === activeId} onClick={() => onPick(session.id)}>
                <span className="ico">
                  <Icon name="sparkles" size={18} />
                </span>
                <span className="txt">
                  {titleOf(session)}
                  <small>{tn("{0} رسالة", session.messages.length, { 0: formatNumber(session.messages.length) })}</small>
                </span>
              </button>
              <button type="button" className="x" aria-label={t("إغلاق الجلسة")} onClick={() => onCloseSession(session.id)}>
                <Icon name="close" size={16} />
              </button>
            </div>
          ))}
          {saved.map((session) => (
            <div key={session.id} className="qb-studio-session">
              <button type="button" className="menu-item" onClick={() => onOpenSaved(session.id)}>
                <span className="ico">
                  <Icon name="sparkles" size={18} />
                </span>
                <span className="txt">
                  {session.title}
                  <small>{tn("{0} رسالة", session.count, { 0: formatNumber(session.count) })}</small>
                </span>
              </button>
            </div>
          ))}
          <button type="button" className="menu-item" onClick={onNew}>
            <span className="ico">
              <Icon name="plus" size={18} />
            </span>
            <span className="txt">{t("جلسة جديدة")}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function BotMessage({
  response,
  fallback,
  onJump,
}: {
  response?: ResearchAgentResponse;
  fallback: string;
  onJump: (ayahId: number, mushafId: number, highlights: number[]) => void;
}) {
  const formatNumber = useNumerals();
  const isTafssir = response?.mode === "tafssir";
  const sections = response?.tafssir
    ? TAFSSIR_SECTIONS.map((section) => ({
        label: section.label,
        content: response.tafssir?.[section.key],
      })).filter((section) => typeof section.content === "string" && section.content.trim().length > 0)
    : [];
  const ayahs = response?.ayahs ?? [];
  // Web design: which surahs the evidence comes from.
  const web = useWebDesign();
  // The answer is Markdown, laid out in its own language's direction (the
  // reader may have it answer in another language than the interface's).
  const body = response?.answer ?? fallback;
  const dir = textDirection(sections.length ? sections.map((section) => section.content).join(" ") : body);

  return (
    // The chat's text selects with the mouse (or a long press), like any
    // conversation: the interface around it does not (shell.web.css).
    <div className={`qb-msg bot qb-selectable${isTafssir ? " tafssir" : ""}`} dir={dir}>
      <div className="lbl">
        <Icon name={isTafssir ? "feather" : "scale"} size={11} />
        {isTafssir ? t("قراءة تفسيرية تجريبية") : t("جواب — مستند على القرآن وحدَه")}
      </div>

      {sections.length > 0 ? (
        sections.map((section) => (
          <div key={section.label} className="section">
            <h5>{section.label}</h5>
            <ChatMarkdown source={section.content as string} />
          </div>
        ))
      ) : (
        <ChatMarkdown source={body} />
      )}

      {ayahs.length > 0 ? (
        <div className="evidence">
          <div className="evidence-label">{t("الدليل القرآني ({0})", { 0: tn("{0} آية", ayahs.length, { 0: formatNumber(ayahs.length) }) })}</div>
          {web ? (
            <div className="ev-spread" title={t("مصادر الدليل في السور")}>
              <MiniRibbon counts={citedSurahCounts(ayahs)} />
              <span>{t("مصادر الدليل في السور")}</span>
            </div>
          ) : null}
          {ayahs.map((ayah, index) => (
            <EvidenceRow key={ayah.ayah_id} ayah={ayah} index={index} onJump={onJump} />
          ))}
          {response ? <MoreAyahs response={response} onJump={onJump} /> : null}
        </div>
      ) : null}

      <div className="qb-msg-tools">
        <CopyButton
          label={t("نسخ الجواب")}
          text={() => answerAsText(response, fallback, (ayah) => `${t("سورة")} ${ayah.surah}: ${formatNumber(ayah.ayah)}`)}
        />
      </div>
    </div>
  );
}

type JumpTo = (ayahId: number, mushafId: number, highlights: number[]) => void;

/** One ayah of the evidence: a tap opens it in the reader. */
function EvidenceRow({ ayah, index, onJump }: { ayah: SearchVerse; index: number; onJump: JumpTo }) {
  const formatNumber = useNumerals();
  return (
    <button
      type="button"
      className="ev-row"
      style={{ "--i": index } as CSSProperties}
      onClick={(event) => {
        // Draw the thread from the citation chip to where the ayah lands
        // in the reader, then perform the jump (which selects + blooms it).
        const chip = event.currentTarget.querySelector<HTMLElement>(".num");
        drawEvidenceThread(chip ?? event.currentTarget, ayah.ayah_id);
        onJump(ayah.ayah_id, ayah.mushaf_id, ayah.highlights ?? []);
      }}
    >
      <span className="num">[{formatNumber(index + 1)}]</span>
      <span className="ev-body">
        <span className="ev-meta">
          {t("سورة")} {ayah.surah}: {formatNumber(ayah.ayah)}
        </span>
        <span className="ev-text" dir="rtl">
          {renderHighlightedVerseText(ayah.text.trim(), ayah.highlights ?? [])}
        </span>
      </span>
    </button>
  );
}

/**
 * «آيات أخرى»: more ayahs from the answer's own Quran searches (run again, no
 * model involved), a few at a time, set apart from the evidence the answer
 * rests on. Not kept with the session.
 */
function MoreAyahs({ response, onJump }: { response: ResearchAgentResponse; onJump: JumpTo }) {
  const formatNumber = useNumerals();
  const [pool, setPool] = useState<SearchVerse[] | null>(null);
  const [shown, setShown] = useState(0);
  const [state, setState] = useState<"idle" | "loading" | "failed">("idle");
  const shownBefore = response.ayahs.length;

  if (!hasMoreAyahs(response.searches ?? [], shownBefore)) return null;

  async function showMore() {
    if (state === "loading") return;
    if (pool) {
      setShown((count) => count + MORE_AYAHS_STEP);
      return;
    }
    setState("loading");
    try {
      const mushaf = response.ayahs[0]?.mushaf_id ?? 1;
      const found = await loadMoreAyahsPool(
        (query, mode, mushafId, pageSize) => searchApi.searchV2(query, mode, mushafId, pageSize),
        response.searches,
        mushaf,
        new Set(response.ayahs.map((ayah) => ayah.ayah_id)),
      );
      setPool(found);
      setShown(MORE_AYAHS_STEP);
      setState("idle");
    } catch {
      setState("failed");
    }
  }

  const extra = pool ? pool.slice(0, shown) : [];
  const exhausted = pool !== null && shown >= pool.length;

  return (
    <>
      {extra.length ? (
        <div className="ev-more-label">{t("آيات أخرى من البحث نفسه، لم يُبنَ عليها الجواب")}</div>
      ) : null}
      {extra.map((ayah, index) => (
        <EvidenceRow key={ayah.ayah_id} ayah={ayah} index={shownBefore + index} onJump={onJump} />
      ))}
      {pool !== null && pool.length === 0 ? <div className="ev-more-label">{t("لا آيات أخرى في هذا البحث.")}</div> : null}
      {exhausted ? null : (
        <button type="button" className="ev-more" onClick={() => void showMore()} disabled={state === "loading"}>
          <Icon name="plus" size={13} />
          <span>
            {state === "loading"
              ? t("جارٍ البحث…")
              : state === "failed"
                ? t("تعذّر جلب آيات أخرى. حاول مرة أخرى.")
                : t("آيات أخرى ({0})", { 0: formatNumber(MORE_AYAHS_STEP) })}
          </span>
        </button>
      )}
    </>
  );
}
