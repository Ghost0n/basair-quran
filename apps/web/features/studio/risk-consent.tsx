"use client";

import { useSyncExternalStore } from "react";

import { Icon } from "@/components/icon";
import { t } from "@/lib/i18n";

/**
 * The study's answers are written by an AI model from the ayahs the search
 * finds: they can be wrong, partial or miss the question. Before the first
 * question on a device, the reader accepts that, once (kept on this device,
 * like the language and the theme: signing out keeps it).
 */
export const RISKS_ACCEPTED_KEY = "qb.studio.risksAccepted";

const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return window.localStorage.getItem(RISKS_ACCEPTED_KEY) === "1";
  } catch {
    return false;
  }
}

let accepted: boolean | null = null;

function snapshot(): boolean {
  accepted ??= read();
  return accepted;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function acceptStudyRisks(): void {
  accepted = true;
  try {
    window.localStorage.setItem(RISKS_ACCEPTED_KEY, "1");
  } catch {
    /* storage unavailable: accepted until the next load */
  }
  for (const listener of listeners) listener();
}

/** Whether the reader accepted the study's risks (false on the server's render). */
export function useStudyRisksAccepted(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

export function resetStudyRisksForTests(): void {
  accepted = null;
  listeners.clear();
}

/**
 * The card in the middle of the empty study until the risks are accepted, in
 * place of the thread; nothing after.
 */
export function RiskConsent() {
  const isAccepted = useStudyRisksAccepted();
  if (isAccepted) return null;
  return (
    <section className="qb-risk-card" role="region" aria-labelledby="qb-risk-title">
      <span className="seal" aria-hidden="true">
        <Icon name="shieldCheck" size={26} />
      </span>
      <h2 id="qb-risk-title">{t("قبل أن تسأل")}</h2>
      <p>
        {t(
          "يصوغ الأجوبةَ نموذجُ ذكاء اصطناعي من الآيات التي يجدها البحث، وقد يخطئ أو ينقص أو يفهم السؤال على غير وجهه. ليست فتوى ولا تفسيراً: ارجع دائماً إلى الآيات نفسها.",
        )}
      </p>
      <button type="button" className="ok" onClick={acceptStudyRisks}>
        {t("فهمت، أتابع")}
      </button>
    </section>
  );
}
