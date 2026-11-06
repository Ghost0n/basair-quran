"use client";

import "@/features/reading/reading.css";
import "./studio.css";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import type { ResearchAgentResponse, TafssirDepth } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { drawEvidenceThread } from "@/lib/draw-evidence-thread";
import { MiniRibbon } from "@/components/ribbon";
import { useWebDesign } from "@/lib/use-web-design";
import { useIsMobile } from "@/lib/use-is-mobile";

import { citedSurahCounts } from "./cited-surahs";
import "./studio.web.css";
import { useNumerals } from "@/lib/preferences-context";
import { renderHighlightedVerseText } from "@/lib/quran-ui";
import { STUDIO_ASK_EVENT, drainStudioAsk, drainStudioOpenSession, type StudioAsk } from "@/lib/studio-prefill";
import { useMushaf } from "@/features/reading/mushaf-context";
import { useDialog } from "@/lib/use-dialog";
import { saveClientResearchSettings } from "@/features/research/lib/research-client-settings";
import { useShellMode } from "@/features/shell/mode-context";
import { useTopBarSlots } from "@/features/shell/top-bar-slots";
import { useWorkspace } from "@/features/shell/workspace-context";

import { ExportModal } from "@/features/export/export-modal";
import { documentFromSession } from "@/features/documents/convert";
import { createDocumentUrl } from "@/features/documents/open-document";

import { StudioAuthModal } from "./studio-auth-modal";
import { TafssirDisclaimer } from "./tafssir-disclaimer";
import { useStudioSessions, type StudioMode } from "./use-studio-sessions";

import { t, tn } from "@/lib/i18n";

const DEPTH_OPTIONS: { value: TafssirDepth; label: string }[] = [
  { value: "fast", get label() {
    return t("سريع");
  } },
  { value: "balanced", get label() {
    return t("متوازن");
  } },
  { value: "deep", get label() {
    return t("عميق");
  } },
];

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
  const compactCanvas = useIsMobile(1000);
  const { mode: shellMode, setMode: setShellMode } = useShellMode();
  const topSlots = useTopBarSlots(shellMode === "studio");
  const formatNumber = useNumerals();

  const [draft, setDraft] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [converting, setConverting] = useState(false);
  // «حوّل إلى بحث» asks first (a banner under the header): the tap creates a
  // document, so a stray touch shouldn't. A failure says so in the banner.
  const [convertAsk, setConvertAsk] = useState<"closed" | "ask" | "failed">("closed");
  const [sessionsOpen, setSessionsOpen] = useState(false);

  // «حوّل إلى بحث»: the session becomes an editable research document.
  async function convertToDocument() {
    if (!active || active.messages.length === 0 || converting) return;
    setConverting(true);
    try {
      router.push(await createDocumentUrl(documentFromSession(active)));
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

  const active = studio.active;
  const isTafssir = active?.mode === "tafssir";
  const hasMessages = Boolean(active && active.messages.length > 0);

  // A question asked about one session never carries over to another.
  useEffect(() => setConvertAsk("closed"), [active?.id]);

  // Keep the newest message (and the "analyzing…" pending row) in view as the
  // thread grows, on send, and when switching tabs.
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [active?.id, active?.messages.length, studio.isResearching]);

  async function submit() {
    const content = draft.trim();
    if (!content || studio.isResearching) return;
    // Auth-gate first so a guest keeps their draft when the modal appears.
    if (!(await studio.ensureAuth())) return;
    setDraft("");
    void studio.submit(content, state.selectedMushaf);
  }

  // A prefilled ask (from the command bar or the Home "اسأل" bar) opens a FRESH
  // session — it must not inherit an existing thread's mode/context. A queued
  // session-open (Home / history) hydrates that saved thread as a tab. The refs
  // always hold the latest bindings so the deferred drain uses live settings.
  const askRef = useRef<(ask: StudioAsk) => void>(() => {});
  askRef.current = (ask) =>
    void studio.askInNewSession(ask.question, state.selectedMushaf, {
      mode: ask.mode,
      focus: ask.focus,
      focusLabel: ask.focusLabel,
    });
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

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  function updateSetting(patch: Partial<typeof studio.clientSettings>) {
    const next = { ...studio.clientSettings, ...patch };
    studio.setClientSettings(next);
    saveClientResearchSettings(next);
  }

  // Web design, desktop: the session tabs and the panel's actions live in the
  // shell's top bar (top-bar-slots.ts); the panel then needs no heading.
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
            {session.title}
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
        title={t("الإعدادات")}
        aria-label={t("إعدادات النموذج")}
        onClick={() => setSettingsOpen((open) => !open)}
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
      <div className="qb-studio">
        {topSlots ? (
          <>
            {createPortal(sessionTabs, topSlots.start)}
            {createPortal(headActions, topSlots.end)}
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
                    aria-label={`${active?.title ?? t("جلسة جديدة")} · ${t("الجلسات")}`}
                  >
                    <span className="txt">{active?.title ?? t("جلسة جديدة")}</span>
                    <Icon name="chevDown" size={16} />
                  </button>
                </h3>
                <div className="meta">
                  {tn("{0} رسالة", active?.messages.length ?? 0, { 0: formatNumber(active?.messages.length ?? 0) })} ·{" "}
                  {isTafssir ? t("قراءة تفسيرية") : t("القرآن وحدَه")}
                </div>
              </div>
              {headActions}
            </div>
          </>
        )}

        {convertAsk !== "closed" && hasMessages ? (
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

        <div className="qb-mode-tabs" role="group" aria-label={t("وضع البحث")}>
          <button
            type="button"
            className={`qb-mode-tab strict${active?.mode === "strict" ? " active" : ""}`}
            aria-pressed={active?.mode === "strict"}
            onClick={() => studio.setMode("strict" as StudioMode)}
          >
            <Icon name="scale" size={12} /> {t("القرآن وحدَه")}
          </button>
          <button
            type="button"
            className={`qb-mode-tab tafssir${active?.mode === "tafssir" ? " active" : ""}`}
            aria-pressed={active?.mode === "tafssir"}
            onClick={() => studio.setMode("tafssir" as StudioMode)}
          >
            <Icon name="feather" size={12} /> {t("قراءة تفسيرية")}
          </button>
        </div>

        {isTafssir ? <TafssirDisclaimer /> : null}

        {settingsOpen ? (
          <div className="qb-studio-settings">
            <label>
              {t("مفتاح الوصول (Ollama / السحابة)")}
              <input
                type="password"
                value={studio.clientSettings.apiKey}
                onChange={(event) => updateSetting({ apiKey: event.target.value })}
                placeholder={t("اتركه فارغاً إذا كان الخادم مُهيّأً")}
              />
            </label>
            <label>
              {t("عنوان الخدمة")}
              <input
                type="text"
                value={studio.clientSettings.baseUrl}
                onChange={(event) => updateSetting({ baseUrl: event.target.value })}
                placeholder="http://localhost:11434"
              />
            </label>
            <label>
              {t("نموذج المحادثة")}
              <input
                type="text"
                value={studio.clientSettings.chatModel}
                onChange={(event) => updateSetting({ chatModel: event.target.value })}
                placeholder={t("مثال: qwen2.5")}
              />
            </label>
          </div>
        ) : null}

        {studio.error ? <div className="qb-studio-error">{studio.error}</div> : null}

        {active?.focus ? (
          <div className="qb-studio-focus" role="note">
            <Icon name="feather" size={13} />
            <span>
              {t("الآية المقصودة:")} {active.focusLabel ?? `${active.focus.surah}:${active.focus.ayah}`}{t("، تُقرأ مع ما قبلها وما بعدها وسياق السورة.")}
            </span>
          </div>
        ) : null}

        {active && active.messages.length > 0 ? (
          <div className="qb-thread" ref={threadRef}>
            {active.messages.map((message, index) =>
              message.role === "user" ? (
                <div key={`${active.id}-${index}`} className="qb-msg user">
                  <div className="lbl">{t("السؤال")}</div>
                  <p>{message.content}</p>
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

        <div className="qb-composer">
          <div className="input-wrap">
            <textarea
              ref={textareaRef}
              rows={2}
              value={draft}
              placeholder={t("تابع البحث، أو اطرح سؤالاً جديداً…")}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
            />
            <div className="row">
              <button
                type="button"
                className={`tool-chip${active?.mode === "strict" ? " active" : ""}`}
                onClick={() => studio.setMode("strict")}
              >
                <Icon name="scale" size={10} /> {t("القرآن وحدَه")}
              </button>
              {/* Phones: the mode switch lives here, by the field (the
                  segmented control above is hidden to give the thread room). */}
              <button
                type="button"
                className={`tool-chip phone-only tafssir${isTafssir ? " active" : ""}`}
                aria-pressed={isTafssir}
                onClick={() => studio.setMode("tafssir")}
              >
                <Icon name="feather" size={10} /> {t("قراءة تفسيرية")}
              </button>
              {isTafssir
                ? DEPTH_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`tool-chip${active?.depth === option.value ? " active" : ""}`}
                      onClick={() => studio.setDepth(option.value)}
                    >
                      <Icon name="layers" size={10} /> {option.label}
                    </button>
                  ))
                : null}
              <div className="grow" />
              <button type="button" className="send" onClick={submit} disabled={studio.isResearching || !draft.trim()}>
                <Icon name="send" size={11} /> {t("اسأل")}
              </button>
            </div>
          </div>
        </div>
      </div>

      {exportOpen && active ? <ExportModal session={active} onClose={() => setExportOpen(false)} /> : null}
      {sessionsOpen ? (
        <SessionsSheet
          sessions={studio.sessions}
          activeId={studio.activeId}
          onPick={(id) => {
            studio.setActiveId(id);
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
      {studio.authRequired ? <StudioAuthModal onClose={studio.dismissAuthRequired} /> : null}
    </aside>
  );
}

/** The open sessions, as a bottom sheet: pick one, close one, or start one. */
function SessionsSheet({
  sessions,
  activeId,
  onPick,
  onCloseSession,
  onNew,
  onClose,
}: {
  sessions: { id: string; title: string; messages: unknown[] }[];
  activeId: string;
  onPick: (id: string) => void;
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
                  {session.title}
                  <small>{tn("{0} رسالة", session.messages.length, { 0: formatNumber(session.messages.length) })}</small>
                </span>
              </button>
              <button type="button" className="x" aria-label={t("إغلاق الجلسة")} onClick={() => onCloseSession(session.id)}>
                <Icon name="close" size={16} />
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

  return (
    <div className={`qb-msg bot${isTafssir ? " tafssir" : ""}`}>
      <div className="lbl">
        <Icon name={isTafssir ? "feather" : "scale"} size={11} />
        {isTafssir ? t("قراءة تفسيرية تجريبية") : t("جواب — مستند على القرآن وحدَه")}
      </div>

      {sections.length > 0 ? (
        sections.map((section) => (
          <div key={section.label} className="section">
            <h5>{section.label}</h5>
            <p>{section.content}</p>
          </div>
        ))
      ) : (
        <p>{response?.answer ?? fallback}</p>
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
            <button
              key={ayah.ayah_id}
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
                <span className="ev-text">{renderHighlightedVerseText(ayah.text.trim(), ayah.highlights ?? [])}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
