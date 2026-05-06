"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";
import type {
  MushafItem,
  ResearchAgentAyah,
  ResearchAgentMessage,
  ResearchAgentResponse,
  ResearchAgentSettingsResponse,
  ResearchRelatedTerm,
  ResearchSearchItem,
  TafssirDepth,
} from "@q-basair/shared";

import { API_BASE_URL } from "@/lib/config";
import { renderHighlightedVerseText } from "@/lib/quran-ui";
import {
  buildResearchHeaders,
  clearClientResearchSettings,
  DEFAULT_RESEARCH_SETTINGS,
  getChatModels,
  getEmbeddingModels,
  loadClientResearchSettings,
  saveClientResearchSettings,
  type ClientResearchSettings,
} from "@/features/research/lib/research-client-settings";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });
const TAFSSIR_DISCLAIMER =
  "هذا الوضع تجريبي وقد ينتج عنه أخطاء أو فهم غير دقيق. يُستخدم لأغراض الاختبار والاستكشاف فقط.";

type ResearchResponseMode = "strict" | "tafssir";
type TafssirSectionKey = keyof NonNullable<ResearchAgentResponse["tafssir"]>;
type ProgressStep = {
  title: string;
  detail: string;
};

const TAFSSIR_DEPTH_OPTIONS: { value: TafssirDepth; label: string; hint: string }[] = [
  { value: "fast", label: "سريع", hint: "قراءة موجزة" },
  { value: "balanced", label: "متوازن", hint: "تفصيل واضح" },
  { value: "deep", label: "عميق", hint: "تحليل أوسع" },
];

const TAFSSIR_SECTION_LABELS: { key: TafssirSectionKey; label: string }[] = [
  { key: "summary", label: "الخلاصة" },
  { key: "linguistic_analysis", label: "التحليل اللغوي" },
  { key: "ayah_connections", label: "ربط الآيات" },
  { key: "corpus_insight", label: "الرؤية المستفادة" },
  { key: "limits_and_cautions", label: "حدود القراءة" },
];

const STRICT_PROGRESS_STEPS: ProgressStep[] = [
  { title: "فهم السؤال", detail: "استخراج المقصود المباشر والسياق الأقرب من صياغتك." },
  { title: "جمع المرشحات", detail: "توسيع الألفاظ والجذور والعبارات القرآنية المحتملة دون حسم مبكر." },
  { title: "ترتيب المرشحات", detail: "اختيار أقوى المصطلحات ثم تنفيذ البحث على الآيات المرتبطة بها." },
  { title: "تنقية النتائج", detail: "مراجعة الآيات المسترجعة واستبعاد غير المتسق قبل صياغة الجواب." },
];

const TAFSSIR_PROGRESS_STEPS: ProgressStep[] = [
  ...STRICT_PROGRESS_STEPS.slice(0, 3),
  { title: "قراءة تفسيرية", detail: "ربط الآيات المختارة بالرؤية البحثية التجريبية قبل كتابة الخلاصة." },
];

function getTafssirProgressSteps(depth: TafssirDepth): ProgressStep[] {
  if (depth === "balanced") {
    return TAFSSIR_PROGRESS_STEPS;
  }

  return [
    ...STRICT_PROGRESS_STEPS.slice(0, 3),
    {
      title: "قراءة تفسيرية",
      detail:
        depth === "deep"
          ? "القراءة العميقة تستعمل مقاطع أكثر من corpus البحث، لذلك قد تستغرق وقتًا أطول قبل صياغة الخلاصة."
          : "صياغة قراءة تفسيرية موجزة مع الحد الأدنى من التوسع اللغوي.",
    },
  ];
}

function getAssistantMessage(response: ResearchAgentResponse) {
  if (response.status === "needs_clarification") {
    return response.clarifying_question ?? "ما الزاوية التي تريد التركيز عليها في السؤال؟";
  }
  if (response.mode === "tafssir" && response.tafssir?.summary) {
    return response.tafssir.summary;
  }
  return response.answer ?? "لم تصلني صياغة جواب من الخدمة.";
}

function getStatusLabel(response: ResearchAgentResponse | null) {
  if (!response) {
    return "بحث موجّه بمصطلحات قرآنية";
  }
  if (response.status === "needs_clarification") {
    return "بانتظار توضيح";
  }
  if (response.status === "no_results") {
    return "لا توجد آيات مطابقة";
  }
  return response.ayahs.length === 1 ? "آية واحدة مرتبطة" : `${response.ayahs.length} آيات مرتبطة`;
}

function getEmptyStateCopy(mode: ResearchResponseMode) {
  if (mode === "tafssir") {
    return "اطرح سؤالك وسيربط الباحث بين الآيات وال corpus البحثي ليقترح قراءة تفسيرية تجريبية مرتبطة بسؤالك. هذا الوضع غير معتمد ويُستخدم للاستكشاف فقط.";
  }
  return "اطرح سؤالًا حرًا، وسيحاول الباحث الذكي فهم المقصود ثم تحويله إلى ألفاظ قرآنية وعرض الآيات الأقرب قبل صياغة الجواب منها فقط.";
}

function getPendingMessage(mode: ResearchResponseMode, depth: TafssirDepth) {
  if (mode === "tafssir" && depth === "deep") {
    return "يجري تحليل أعمق للآيات وربطها بالمادة البحثية؛ قد يستغرق هذا النمط وقتًا أطول قليلًا...";
  }
  return mode === "tafssir"
    ? "يجري تحليل الآيات وربطها بالمادة البحثية لإنتاج قراءة تفسيرية تجريبية..."
    : "يجري تحليل المصطلحات القرآنية والآيات المرتبطة...";
}

function getTermTypeLabel(term: ResearchRelatedTerm) {
  if (term.type === "root") {
    return "جذر";
  }
  if (term.type === "phrase") {
    return "عبارة";
  }
  return "كلمة";
}

function getSearchLabel(search: ResearchSearchItem) {
  return search.mode === "root" ? "بحث جذري" : "بحث لفظي";
}

function getProgressState(mode: ResearchResponseMode, depth: TafssirDepth, elapsedMs: number) {
  const steps = mode === "tafssir" ? getTafssirProgressSteps(depth) : STRICT_PROGRESS_STEPS;
  const stageDurationMs = mode === "tafssir" ? (depth === "deep" ? 4200 : 3200) : 2400;
  const rawStage = Math.floor(elapsedMs / stageDurationMs);
  const activeIndex = Math.min(rawStage, steps.length - 1);
  const stageElapsed = elapsedMs - activeIndex * stageDurationMs;
  const intraStageProgress = Math.min(stageElapsed / stageDurationMs, 0.96);

  return {
    steps,
    activeIndex,
    progress: Math.min(((activeIndex + intraStageProgress) / steps.length) * 100, 96),
  };
}

function getTafssirSections(response: ResearchAgentResponse) {
  const tafssir = response.tafssir;
  if (!tafssir) {
    return [];
  }
  return TAFSSIR_SECTION_LABELS.map((section) => ({
    ...section,
    content: tafssir[section.key],
  })).filter((section) => typeof section.content === "string" && section.content.trim().length > 0);
}

function formatDurationNs(value: number) {
  if (!value) {
    return "0 ms";
  }
  return `${Math.max(1, Math.round(value / 1_000_000))} ms`;
}

export function ResearchPane({
  selectedMushaf,
  onSelectAyah,
  fullPage = false,
  mushafs = [],
  loadingMushafs = false,
  onMushafChange,
}: {
  selectedMushaf: number;
  onSelectAyah: (verse: ResearchAgentAyah, resultKey: string, switchToReader?: boolean) => Promise<void>;
  fullPage?: boolean;
  mushafs?: MushafItem[];
  loadingMushafs?: boolean;
  onMushafChange?: (value: number) => void;
}) {
  const [messages, setMessages] = useState<ResearchAgentMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [latestResponse, setLatestResponse] = useState<ResearchAgentResponse | null>(null);
  const [isResearching, setIsResearching] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [responseMode, setResponseMode] = useState<ResearchResponseMode>("strict");
  const [tafssirDepth, setTafssirDepth] = useState<TafssirDepth>("balanced");
  const [requestStartedAt, setRequestStartedAt] = useState<number | null>(null);
  const [progressTick, setProgressTick] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(fullPage);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [cloudSettings, setCloudSettings] = useState<ClientResearchSettings>(DEFAULT_RESEARCH_SETTINGS);
  const [settingsInfo, setSettingsInfo] = useState<ResearchAgentSettingsResponse | null>(null);

  const canSubmit = draft.trim().length > 0 && !isResearching;
  const resultLabel = useMemo(() => getStatusLabel(latestResponse), [latestResponse]);
  const activeDisclaimer = responseMode === "tafssir" ? latestResponse?.disclaimer ?? TAFSSIR_DISCLAIMER : null;
  const progressState = useMemo(() => {
    const elapsedMs = requestStartedAt ? Math.max(0, Date.now() - requestStartedAt) : 0;
    return getProgressState(responseMode, tafssirDepth, elapsedMs);
  }, [progressTick, requestStartedAt, responseMode, tafssirDepth]);
  const tafssirSections = useMemo(() => (latestResponse ? getTafssirSections(latestResponse) : []), [latestResponse]);
  const chatModels = useMemo(() => getChatModels(settingsInfo?.available_models ?? []), [settingsInfo]);
  const embedModels = useMemo(() => getEmbeddingModels(settingsInfo?.available_models ?? []), [settingsInfo]);

  useEffect(() => {
    setCloudSettings(loadClientResearchSettings());
  }, []);

  useEffect(() => {
    saveClientResearchSettings(cloudSettings);
  }, [cloudSettings]);

  useEffect(() => {
    if (!isResearching) {
      setRequestStartedAt(null);
      setProgressTick(0);
      return;
    }

    setRequestStartedAt(Date.now());
    setProgressTick(0);
    const handle = window.setInterval(() => {
      setProgressTick((value) => value + 1);
    }, 700);
    return () => window.clearInterval(handle);
  }, [isResearching]);

  useEffect(() => {
    if (!cloudSettings.apiKey.trim()) {
      setSettingsInfo(null);
      setSettingsError(null);
      return;
    }

    void refreshSettings();
  }, [cloudSettings.apiKey, cloudSettings.baseUrl]);

  async function refreshSettings() {
    if (!cloudSettings.apiKey.trim()) {
      setSettingsError("أضف مفتاح Ollama API أولًا لعرض النماذج السحابية.");
      setSettingsInfo(null);
      return;
    }

    setSettingsLoading(true);
    setSettingsError(null);
    try {
      const response = await api.getResearchAgentSettings({ headers: buildResearchHeaders(cloudSettings) });
      setSettingsInfo(response);

      setCloudSettings((current) => ({
        ...current,
        baseUrl: response.provider.base_url || current.baseUrl,
        chatModel: current.chatModel || response.provider.chat_model,
        embedModel: current.embedModel || response.provider.embed_model || current.embedModel,
      }));
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : "تعذر تحميل إعدادات Ollama.");
      setSettingsInfo(null);
    } finally {
      setSettingsLoading(false);
    }
  }

  async function submitResearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || isResearching) {
      return;
    }

    if (!cloudSettings.apiKey.trim()) {
      setErrorMessage("أضف مفتاح Ollama API في الإعدادات قبل تشغيل الباحث.");
      setSettingsOpen(true);
      return;
    }

    const nextMessages: ResearchAgentMessage[] = [...messages, { role: "user", content }];
    const normalizedMushaf = Number.isFinite(selectedMushaf) && selectedMushaf > 0 ? Math.trunc(selectedMushaf) : 1;
    setMessages(nextMessages);
    setDraft("");
    setErrorMessage(null);
    setLatestResponse(null);
    setIsResearching(true);

    try {
      const response = await api.researchAgent(
        {
          messages: nextMessages,
          mushaf: normalizedMushaf,
          max_results: 8,
          answer_language: "auto",
          response_mode: responseMode,
          tafssir_depth: responseMode === "tafssir" ? tafssirDepth : undefined,
        },
        { headers: buildResearchHeaders(cloudSettings) },
      );
      setLatestResponse(response);
      setMessages([...nextMessages, { role: "assistant", content: getAssistantMessage(response) }]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "تعذر الاتصال بخدمة الباحث الذكي.");
      setMessages(nextMessages);
    } finally {
      setIsResearching(false);
    }
  }

  function resetResearch() {
    setMessages([]);
    setDraft("");
    setLatestResponse(null);
    setErrorMessage(null);
  }

  function clearToken() {
    clearClientResearchSettings();
    setCloudSettings(DEFAULT_RESEARCH_SETTINGS);
    setSettingsInfo(null);
    setSettingsError(null);
  }

  return (
    <section id="researchPane" className={`research-pane${fullPage ? " research-pane-page" : ""}`} aria-label="الباحث الذكي">
      <div className="pane-header research-header">
        <div className="pane-title pane-title-minimal">
          <span className="pane-label">الباحث الذكي</span>
          <span className="research-status">{resultLabel}</span>
        </div>
        <div className="research-header-actions">
          {fullPage && onMushafChange ? (
            <div className="research-inline-mushaf">
              <label htmlFor="researchMushafSelect">الرواية</label>
              <select
                id="researchMushafSelect"
                value={selectedMushaf}
                onChange={(event) => onMushafChange(Number(event.target.value))}
                disabled={loadingMushafs}
              >
                {loadingMushafs ? <option value={selectedMushaf}>جارٍ التحميل...</option> : null}
                {mushafs.map((mushaf) => (
                  <option key={mushaf.id} value={mushaf.id}>
                    {mushaf.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <button
            className={`research-settings-btn ${settingsOpen ? "active" : ""}`}
            type="button"
            onClick={() => setSettingsOpen((current) => !current)}
          >
            إعدادات Ollama
          </button>

          <div className="research-mode-toggle" aria-label="وضع الجواب">
            <button
              className={`research-mode-btn ${responseMode === "strict" ? "active" : ""}`}
              type="button"
              onClick={() => setResponseMode("strict")}
              disabled={isResearching}
            >
              بحث صارم
            </button>
            <button
              className={`research-mode-btn research-mode-tafssir ${responseMode === "tafssir" ? "active" : ""}`}
              type="button"
              onClick={() => setResponseMode("tafssir")}
              disabled={isResearching}
            >
              Tafssir
            </button>
          </div>

          {responseMode === "tafssir" ? (
            <div className="tafssir-depth-toggle" aria-label="درجة التفصيل">
              {TAFSSIR_DEPTH_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  className={`tafssir-depth-btn ${tafssirDepth === option.value ? "active" : ""}`}
                  type="button"
                  onClick={() => setTafssirDepth(option.value)}
                  disabled={isResearching}
                  title={option.hint}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}

          <button className="research-reset-btn" type="button" onClick={resetResearch} disabled={isResearching && messages.length === 0}>
            مسح المحادثة
          </button>
        </div>
      </div>

      {settingsOpen ? (
        <section className="research-cloud-panel" aria-label="إعدادات Ollama السحابية">
          <div className="research-cloud-grid">
            <label className="research-settings-field">
              <span>Ollama API key</span>
              <input
                type="password"
                value={cloudSettings.apiKey}
                onChange={(event) => setCloudSettings((current) => ({ ...current, apiKey: event.target.value }))}
                placeholder="ضع مفتاحك هنا"
                autoComplete="off"
              />
              <small>يُخزَّن المفتاح في هذه الجلسة داخل المتصفح فقط ولا يُحفَظ على الخادم.</small>
            </label>

            <label className="research-settings-field">
              <span>قاعدة Ollama</span>
              <input
                type="text"
                value={cloudSettings.baseUrl}
                onChange={(event) => setCloudSettings((current) => ({ ...current, baseUrl: event.target.value }))}
                placeholder="https://ollama.com"
                autoComplete="off"
              />
            </label>

            <label className="research-settings-field">
              <span>نموذج المحادثة</span>
              <select
                value={cloudSettings.chatModel}
                onChange={(event) => setCloudSettings((current) => ({ ...current, chatModel: event.target.value }))}
              >
                <option value={cloudSettings.chatModel}>{cloudSettings.chatModel}</option>
                {chatModels
                  .filter((model) => model.name !== cloudSettings.chatModel)
                  .map((model) => (
                    <option key={model.name} value={model.name}>
                      {model.name}
                    </option>
                  ))}
              </select>
            </label>

            <label className="research-settings-field">
              <span>نموذج embeddings</span>
              <select
                value={cloudSettings.embedModel}
                onChange={(event) => setCloudSettings((current) => ({ ...current, embedModel: event.target.value }))}
              >
                <option value={cloudSettings.embedModel}>{cloudSettings.embedModel}</option>
                {embedModels
                  .filter((model) => model.name !== cloudSettings.embedModel)
                  .map((model) => (
                    <option key={model.name} value={model.name}>
                      {model.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>

          <div className="research-cloud-actions">
            <button type="button" className="research-settings-btn active" onClick={() => void refreshSettings()} disabled={settingsLoading}>
              {settingsLoading ? "جارٍ التحديث" : "تحديث النماذج"}
            </button>
            <button type="button" className="research-reset-btn" onClick={clearToken}>
              مسح المفتاح
            </button>
            <a className="research-cloud-link" href="https://ollama.com/settings/keys" target="_blank" rel="noreferrer">
              فتح صفحة مفاتيح Ollama
            </a>
          </div>

          {settingsError ? <div className="research-settings-error">{settingsError}</div> : null}

          <div className="research-cloud-observability">
            <div className="research-cloud-card">
              <strong>الاتصال الحالي</strong>
              <p>{settingsInfo?.provider.base_url ?? cloudSettings.baseUrl}</p>
              <small>{settingsInfo?.provider.authenticated ? "المفتاح حاضر" : "المفتاح غير موجود بعد"}</small>
            </div>

            <div className="research-cloud-card">
              <strong>قيود Ollama</strong>
              <p>{settingsInfo?.limits.summary ?? "تختلف القيود والاستهلاك حسب الخطة، ولا توجد واجهة عامة لإظهار الرصيد المتبقي مباشرة."}</p>
              {(settingsInfo?.limits.notes ?? []).length > 0 ? (
                <small>{settingsInfo?.limits.notes[0]}</small>
              ) : null}
            </div>

            <div className="research-cloud-card">
              <strong>النماذج المتاحة</strong>
              <p>{settingsInfo?.available_models.length ?? 0} نموذجًا</p>
              <small>يمكنك تبديل نموذج المحادثة و embeddings من هذه الصفحة.</small>
            </div>
          </div>
        </section>
      ) : null}

      <div className="research-body">
        {activeDisclaimer ? <div className="research-disclaimer">{activeDisclaimer}</div> : null}

        <div className="research-thread" aria-live="polite">
          {messages.length === 0 ? (
            <div className="research-empty">{getEmptyStateCopy(responseMode)}</div>
          ) : (
            messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`research-message ${message.role}`}>
                <span>{message.role === "user" ? "أنت" : "الباحث"}</span>
                <p>{message.content}</p>
              </div>
            ))
          )}
          {isResearching ? <div className="research-message assistant pending">{getPendingMessage(responseMode, tafssirDepth)}</div> : null}
        </div>

        {isResearching ? (
          <div className="research-progress" aria-live="polite">
            <div className="research-progress-bar" aria-hidden="true">
              <span style={{ width: `${progressState.progress}%` }} />
            </div>
            <div className="research-progress-steps">
              {progressState.steps.map((step, index) => (
                <div
                  key={`${step.title}-${index}`}
                  className={`research-progress-step ${
                    index < progressState.activeIndex ? "done" : index === progressState.activeIndex ? "active" : ""
                  }`}
                >
                  <strong>{step.title}</strong>
                  <small>{step.detail}</small>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {errorMessage ? <div className="research-error">{errorMessage}</div> : null}

        {latestResponse ? (
          <div className="research-evidence">
            {latestResponse.usage ? (
              <div className="research-usage-panel">
                <div className="research-usage-chip">
                  <strong>الاستدعاءات</strong>
                  <span>{latestResponse.usage.request_count}</span>
                </div>
                <div className="research-usage-chip">
                  <strong>Prompt tokens</strong>
                  <span>{latestResponse.usage.prompt_eval_count}</span>
                </div>
                <div className="research-usage-chip">
                  <strong>Output tokens</strong>
                  <span>{latestResponse.usage.eval_count}</span>
                </div>
                <div className="research-usage-chip">
                  <strong>الزمن الكلي</strong>
                  <span>{formatDurationNs(latestResponse.usage.total_duration_ns)}</span>
                </div>
              </div>
            ) : null}

            {tafssirSections.length > 0 ? (
              <article className="tafssir-answer-panel" aria-label="الجواب التفسيري المنظم">
                <div className="tafssir-answer-heading">
                  <span>قراءة تفسيرية منظمة</span>
                  <small>{TAFSSIR_DEPTH_OPTIONS.find((option) => option.value === tafssirDepth)?.hint}</small>
                </div>
                {tafssirSections.map((section) => (
                  <section key={section.key} className="tafssir-answer-section">
                    <h4>{section.label}</h4>
                    <p>{String(section.content)}</p>
                  </section>
                ))}
              </article>
            ) : null}

            {latestResponse.related_terms.length > 0 ? (
              <div className="research-chip-row" aria-label="الألفاظ المرتبطة">
                {latestResponse.related_terms.map((term, index) => (
                  <span key={`${term.type}-${term.text}-${index}`} className="research-term-chip">
                    {term.text}
                    <small>{getTermTypeLabel(term)}</small>
                  </span>
                ))}
              </div>
            ) : null}

            {latestResponse.searches.length > 0 ? (
              <div className="research-search-list">
                {latestResponse.searches.map((search, index) => (
                  <span key={`${search.mode}-${search.query}-${index}`}>
                    {getSearchLabel(search)}: {search.query} ({search.result_count})
                  </span>
                ))}
              </div>
            ) : null}

            {latestResponse.ayahs.length > 0 ? (
              <div className="research-ayahs">
                {latestResponse.ayahs.map((ayah) => (
                  <button
                    key={`${ayah.ayah_id}-${ayah.matched_terms.join(",")}`}
                    type="button"
                    className="research-ayah-card"
                    onClick={() => void onSelectAyah(ayah, `research:${ayah.ayah_id}`, true)}
                  >
                    <span className="verse-meta">{`سورة ${ayah.surah} - آية ${ayah.ayah}`}</span>
                    <span className="verse-text">{renderHighlightedVerseText(ayah.text, ayah.highlights)}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <form className="research-composer" onSubmit={submitResearch}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={
            responseMode === "tafssir"
              ? "اكتب سؤالك هنا، وسيحاول الوضع التجريبي جمع الآيات مع الرؤية المستفادة من corpus البحثي"
              : "اكتب سؤالك الحر هنا: معنى، مقصد، علاقة بين ألفاظ، أو موضوع تريد ربطه بآيات من القرآن"
          }
          rows={fullPage ? 5 : 3}
        />
        <button type="submit" disabled={!canSubmit}>
          {isResearching ? "جارٍ الإرسال" : "أرسل السؤال"}
        </button>
      </form>
    </section>
  );
}
