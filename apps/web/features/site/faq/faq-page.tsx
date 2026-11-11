"use client";

import "../site.css";
import "./faq.css";

import { useEffect, useMemo, useRef, useState } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";

import { GirihPattern } from "@/components/girih";
import { Icon } from "@/components/icon";
import { emailProblemOf, emailSyntaxProblem, EMAIL_PROBLEM_TEXT, type EmailProblem } from "@/features/feedback/feedback-card";
import { useAuthSession } from "@/lib/auth-session-context";
import { API_BASE_URL, AUTH_ENABLED } from "@/lib/config";
import { useI18n } from "@/lib/i18n/provider";

import { t } from "@/lib/i18n";

import { SiteBar, SiteFoot } from "../site-chrome";
import { matchesAll } from "../site-search";
import { faqGroups, type FaqEntry } from "./faq-content";
import { ANSWERED, rankFaq } from "./faq-match";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

/**
 * /faq — the questions people ask, answered (docs/public-site.md → "The FAQ").
 * At the top, «اسأل سؤالك»: what you type is matched against the answers
 * already written (in your language); an answered question points to its
 * answer instead of being sent, and only a new one reaches the team (the
 * feedback centre, kind «help»).
 */
export function FaqPage() {
  const { locale } = useI18n();
  const groups = useMemo(() => faqGroups(), [locale]); // eslint-disable-line react-hooks/exhaustive-deps
  const entries = useMemo(() => groups.flatMap((group) => group.entries), [groups]);
  const [open, setOpen] = useState<string | null>(null);
  const [glow, setGlow] = useState<string | null>(null);

  /** Open an answer, bring it into view and let it glow for a moment. */
  const show = (id: string) => {
    setOpen(id);
    setGlow(id);
    window.history.replaceState(window.history.state, "", `#${id}`);
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" }));
    window.setTimeout(() => setGlow((current) => (current === id ? null : current)), 2400);
  };

  // A link to an answer (/faq#delete) opens it.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id && entries.some((entry) => entry.id === id)) show(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="qb-site qb-faq">
      <SiteBar current="/faq" />

      <header className="qb-faq-hero">
        <GirihPattern className="pattern" />
        <p className="eyebrow">{t("الأسئلة الشائعة")}</p>
        <h1>{t("سؤالك، وجوابه")}</h1>
        <p className="lead">{t("اكتب سؤالك: إن كان له جواب هنا يظهر لك فوراً، وإلا يصل إلى الفريق.")}</p>
        <Ask entries={entries} onShow={show} />
      </header>

      <main className="qb-faq-main">
        {groups.map((group) => (
          <section key={group.id} className="qb-faq-group" aria-labelledby={`faq-${group.id}`}>
            <h2 id={`faq-${group.id}`}>{group.title}</h2>
            {group.entries.map((entry) => (
              <Answer key={entry.id} entry={entry} open={open === entry.id} glow={glow === entry.id} onToggle={() => setOpen(open === entry.id ? null : entry.id)} />
            ))}
          </section>
        ))}
        <p className="qb-faq-more">
          {t("تجد كل ميزة خطوةً خطوة في")} <a href="/guide">{t("الدليل")}</a>.
        </p>
      </main>

      <SiteFoot />
    </div>
  );
}

function Answer({ entry, open, glow, onToggle }: { entry: FaqEntry; open: boolean; glow: boolean; onToggle: () => void }) {
  return (
    <article id={entry.id} className={`qb-faq-item${open ? " is-open" : ""}${glow ? " is-glow" : ""}`}>
      <h3>
        <button type="button" aria-expanded={open} aria-controls={`${entry.id}-answer`} onClick={onToggle}>
          <span>{entry.question}</span>
          <Icon name="chevDown" size={18} />
        </button>
      </h3>
      <div id={`${entry.id}-answer`} className="answer" role="region" aria-label={entry.question}>
        <div>
          <p>{entry.answer}</p>
          {entry.guide ? (
            <a className="to-guide" href={`/guide#${entry.guide}`}>
              {t("اقرأ الخطوات في الدليل")}
              <Icon name="chevLeft" size={15} />
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}

type AskState = "idle" | "answered" | "compose" | "sending" | "sent" | "failed";

/** «اسأل سؤالك»: suggestions while typing; asking an answered question points to its answer. */
function Ask({ entries, onShow }: { entries: FaqEntry[]; onShow: (id: string) => void }) {
  const { user } = useAuthSession();
  const { locale } = useI18n();
  const signedIn = !AUTH_ENABLED || Boolean(user);
  const [question, setQuestion] = useState("");
  const [state, setState] = useState<AskState>("idle");
  const [best, setBest] = useState<FaqEntry | null>(null);
  const [email, setEmail] = useState("");
  const [emailProblem, setEmailProblem] = useState<EmailProblem | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);

  const byId = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries]);
  const ranked = useMemo(() => (question.trim().length >= 3 ? rankFaq(question, entries) : []), [question, entries]);
  // While typing: the closest answers (and any entry that contains every word typed).
  const suggestions = useMemo(() => {
    const ids = ranked.filter((match) => match.score >= 0.34).map((match) => match.id);
    for (const entry of entries) if (question.trim().length >= 3 && matchesAll(question, `${entry.question} ${entry.keywords}`) && !ids.includes(entry.id)) ids.push(entry.id);
    return ids.slice(0, 3).map((id) => byId.get(id)!);
  }, [ranked, entries, question, byId]);

  const ask = () => {
    if (!question.trim()) return;
    const top = ranked[0];
    if (top && top.score >= ANSWERED) {
      setBest(byId.get(top.id) ?? null);
      setState("answered");
      return;
    }
    setState("compose");
    if (!signedIn) requestAnimationFrame(() => emailRef.current?.focus());
  };

  const send = async () => {
    if (!signedIn) {
      const problem = emailSyntaxProblem(email);
      setEmailProblem(problem);
      if (problem) return;
    }
    setState("sending");
    try {
      await api.sendFeedback({ kind: "help", message: question.trim(), email: signedIn ? null : email.trim(), url: "/faq", language: locale });
      setState("sent");
    } catch (error) {
      const problem = emailProblemOf(error);
      setEmailProblem(problem);
      setState(problem ? "compose" : "failed");
    }
  };

  if (state === "sent") {
    return (
      <div className="qb-faq-ask is-sent" role="status">
        <Icon name="check" size={22} />
        <p>{signedIn ? t("وصل سؤالك إلى الفريق، وتجد الرد في الإعدادات ← الدعم والملاحظات.") : t("وصل سؤالك إلى الفريق، ويصلك الرد على بريدك.")}</p>
        <button type="button" className="qb-site-ghost" onClick={() => { setQuestion(""); setState("idle"); }}>
          {t("سؤال آخر")}
        </button>
      </div>
    );
  }

  return (
    <form
      className="qb-faq-ask"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (state === "compose" || state === "failed") void send();
        else ask();
      }}
    >
      <label htmlFor="faq-question" className="qb-sr-only">
        {t("اكتب سؤالك")}
      </label>
      <div className="field">
        <Icon name="search" size={18} />
        <input
          id="faq-question"
          type="text"
          value={question}
          maxLength={1000}
          autoComplete="off"
          placeholder={t("مثلاً: كيف أكرّر آية للحفظ؟")}
          onChange={(event) => {
            setQuestion(event.target.value);
            if (state !== "sending") setState("idle");
          }}
        />
        <button type="submit" className="qb-site-cta sm" disabled={!question.trim() || state === "sending"}>
          {state === "compose" || state === "failed" ? t("أرسل") : t("اسأل")}
        </button>
      </div>

      {state === "idle" && suggestions.length ? (
        <div className="suggest" aria-live="polite">
          <p>{t("قد يكون جوابك هنا:")}</p>
          <ul>
            {suggestions.map((entry) => (
              <li key={entry.id}>
                <button type="button" onClick={() => onShow(entry.id)}>
                  {entry.question}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {state === "answered" && best ? (
        <div className="answered" role="status">
          <p className="title">{t("لسؤالك جواب:")}</p>
          <button type="button" className="hit" onClick={() => onShow(best.id)}>
            <strong>{best.question}</strong>
            <span>{best.answer}</span>
          </button>
          <button type="button" className="other" onClick={() => setState("compose")}>
            {t("سؤالي مختلف: أرسله إلى الفريق")}
          </button>
        </div>
      ) : null}

      {state === "compose" || state === "sending" || state === "failed" ? (
        <div className="compose">
          <p>{t("لم نجد لسؤالك جواباً هنا. أرسله، ويرد عليك شخص من الفريق.")}</p>
          {signedIn ? null : (
            <>
              <input
                ref={emailRef}
                type="email"
                value={email}
                autoComplete="email"
                placeholder={t("بريدك الإلكتروني (ليصلك الرد)")}
                aria-label={t("بريدك الإلكتروني (ليصلك الرد)")}
                aria-invalid={emailProblem ? true : undefined}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setEmailProblem(null);
                }}
              />
              {emailProblem ? <p className="error">{EMAIL_PROBLEM_TEXT[emailProblem]}</p> : null}
            </>
          )}
          {state === "failed" ? <p className="error">{t("تعذّر الإرسال. حاول مرة أخرى.")}</p> : null}
        </div>
      ) : null}
    </form>
  );
}
