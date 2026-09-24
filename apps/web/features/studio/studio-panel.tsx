"use client";

import "./studio.css";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";

import type { ResearchAgentResponse, TafssirDepth } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { drawEvidenceThread } from "@/lib/draw-evidence-thread";
import { useNumerals } from "@/lib/preferences-context";
import { renderHighlightedVerseText } from "@/lib/quran-ui";
import { STUDIO_ASK_EVENT, drainStudioAsk, drainStudioOpenSession, type StudioAsk } from "@/lib/studio-prefill";
import { useMushaf } from "@/features/reading/mushaf-context";
import { saveClientResearchSettings } from "@/features/research/lib/research-client-settings";
import { useShellMode } from "@/features/shell/mode-context";
import { useWorkspace } from "@/features/shell/workspace-context";

import { ExportModal } from "@/features/export/export-modal";
import { documentFromSession } from "@/features/documents/convert";
import { createDocumentUrl } from "@/features/documents/open-document";

import { StudioAuthModal } from "./studio-auth-modal";
import { TafssirDisclaimer } from "./tafssir-disclaimer";
import { useStudioSessions, type StudioMode } from "./use-studio-sessions";

const DEPTH_OPTIONS: { value: TafssirDepth; label: string }[] = [
  { value: "fast", label: "سريع" },
  { value: "balanced", label: "متوازن" },
  { value: "deep", label: "عميق" },
];

const TAFSSIR_SECTIONS: { key: keyof NonNullable<ResearchAgentResponse["tafssir"]>; label: string }[] = [
  { key: "summary", label: "الخلاصة" },
  { key: "linguistic_analysis", label: "التحليل اللغوي" },
  { key: "ayah_connections", label: "ربط الآيات" },
  { key: "corpus_insight", label: "الرؤية المستفادة" },
  { key: "limits_and_cautions", label: "حدود القراءة" },
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
  const { setMode: setShellMode } = useShellMode();
  const formatNumber = useNumerals();

  const [draft, setDraft] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [converting, setConverting] = useState(false);

  // «حوّل إلى بحث»: the session becomes an editable research document.
  async function convertToDocument() {
    if (!active || active.messages.length === 0 || converting) return;
    setConverting(true);
    try {
      router.push(await createDocumentUrl(documentFromSession(active)));
    } catch {
      /* the button simply stays; the session is untouched */
    } finally {
      setConverting(false);
    }
  }
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);

  const active = studio.active;
  const isTafssir = active?.mode === "tafssir";

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

  return (
    <aside className="qb-side-panel qb-side-panel-wide" aria-label="لوحة الدراسة">
      <div className="qb-studio">
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
                aria-label="إغلاق الجلسة"
                onClick={() => studio.closeSession(session.id)}
              >
                ×
              </button>
            </div>
          ))}
          <button type="button" className="qb-studio-tab add" onClick={studio.newSession} aria-label="جلسة جديدة">
            <Icon name="plus" size={12} />
          </button>
        </div>

        <div className="qb-side-head" style={{ borderBottom: "none", padding: "14px 20px 4px" }}>
          <div>
            <div className="kicker">جلسة الدراسة</div>
            <h3 style={{ fontSize: 20 }}>{active?.title ?? "جلسة جديدة"}</h3>
            <div className="meta">
              {formatNumber(active?.messages.length ?? 0)} رسالة ·{" "}
              {isTafssir ? "قراءة تفسيرية" : "القرآن وحدَه"}
            </div>
          </div>
          <button
            type="button"
            className="close"
            title="حوّل إلى بحث قابل للتحرير والمشاركة"
            aria-label="حوّل إلى بحث"
            disabled={!active || active.messages.length === 0 || converting}
            onClick={() => void convertToDocument()}
          >
            <Icon name="page" size={16} />
          </button>
          <button
            type="button"
            className="close"
            title="تصدير الجلسة"
            aria-label="تصدير الجلسة"
            disabled={!active || active.messages.length === 0}
            onClick={() => setExportOpen(true)}
          >
            <Icon name="share" size={16} />
          </button>
          <button
            type="button"
            className="close"
            title="الإعدادات"
            aria-label="إعدادات النموذج"
            onClick={() => setSettingsOpen((open) => !open)}
          >
            <Icon name="settings" size={16} />
          </button>
          <button
            type="button"
            className="close"
            title="إغلاق"
            aria-label="إغلاق لوحة الدراسة"
            onClick={() => setShellMode("reading")}
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="qb-mode-tabs" role="group" aria-label="وضع البحث">
          <button
            type="button"
            className={`qb-mode-tab strict${active?.mode === "strict" ? " active" : ""}`}
            aria-pressed={active?.mode === "strict"}
            onClick={() => studio.setMode("strict" as StudioMode)}
          >
            <Icon name="scale" size={12} /> القرآن وحدَه
          </button>
          <button
            type="button"
            className={`qb-mode-tab tafssir${active?.mode === "tafssir" ? " active" : ""}`}
            aria-pressed={active?.mode === "tafssir"}
            onClick={() => studio.setMode("tafssir" as StudioMode)}
          >
            <Icon name="feather" size={12} /> قراءة تفسيرية
          </button>
        </div>

        {isTafssir ? <TafssirDisclaimer /> : null}

        {settingsOpen ? (
          <div className="qb-studio-settings">
            <label>
              مفتاح الوصول (Ollama / السحابة)
              <input
                type="password"
                value={studio.clientSettings.apiKey}
                onChange={(event) => updateSetting({ apiKey: event.target.value })}
                placeholder="اتركه فارغاً إذا كان الخادم مُهيّأً"
              />
            </label>
            <label>
              عنوان الخدمة
              <input
                type="text"
                value={studio.clientSettings.baseUrl}
                onChange={(event) => updateSetting({ baseUrl: event.target.value })}
                placeholder="http://localhost:11434"
              />
            </label>
            <label>
              نموذج المحادثة
              <input
                type="text"
                value={studio.clientSettings.chatModel}
                onChange={(event) => updateSetting({ chatModel: event.target.value })}
                placeholder="مثال: qwen2.5"
              />
            </label>
          </div>
        ) : null}

        {studio.error ? <div className="qb-studio-error">{studio.error}</div> : null}

        {active?.focus ? (
          <div className="qb-studio-focus" role="note">
            <Icon name="feather" size={13} />
            <span>
              الآية المقصودة: {active.focusLabel ?? `${active.focus.surah}:${active.focus.ayah}`}، تُقرأ مع ما قبلها
              وما بعدها وسياق السورة.
            </span>
          </div>
        ) : null}

        {active && active.messages.length > 0 ? (
          <div className="qb-thread" ref={threadRef}>
            {active.messages.map((message, index) =>
              message.role === "user" ? (
                <div key={`${active.id}-${index}`} className="qb-msg user">
                  <div className="lbl">السؤال</div>
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
                <Icon name="sparkles" size={14} /> يجري تحليل الآيات…
              </div>
            ) : null}
          </div>
        ) : (
          <div className="qb-studio-state">
            <Icon name="sparkles" size={22} />
            <span>
              اطرح سؤالاً حرّاً — يُحوّله الباحث إلى ألفاظ قرآنية، يعرض الآيات الأقرب، ثم يصوغ الجواب منها.
            </span>
          </div>
        )}

        <div className="qb-composer">
          <div className="input-wrap">
            <textarea
              ref={textareaRef}
              rows={2}
              value={draft}
              placeholder="تابع البحث، أو اطرح سؤالاً جديداً…"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
            />
            <div className="row">
              <button
                type="button"
                className={`tool-chip${active?.mode === "strict" ? " active" : ""}`}
                onClick={() => studio.setMode("strict")}
              >
                <Icon name="scale" size={10} /> القرآن وحدَه
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
                <Icon name="send" size={11} /> اسأل
              </button>
            </div>
          </div>
        </div>
      </div>

      {exportOpen && active ? <ExportModal session={active} onClose={() => setExportOpen(false)} /> : null}
      {studio.authRequired ? <StudioAuthModal onClose={studio.dismissAuthRequired} /> : null}
    </aside>
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

  return (
    <div className={`qb-msg bot${isTafssir ? " tafssir" : ""}`}>
      <div className="lbl">
        <Icon name={isTafssir ? "feather" : "scale"} size={11} />
        {isTafssir ? "قراءة تفسيرية تجريبية" : "جواب — مستند على القرآن وحدَه"}
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
          <div className="evidence-label">الدليل القرآني ({formatNumber(ayahs.length)} آية)</div>
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
                  سورة {ayah.surah}: {formatNumber(ayah.ayah)}
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
