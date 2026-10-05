"use client";

import { useEffect, useState } from "react";

import { BrandMark } from "@/components/brand-mark";
import { chooseLanguage, BUILT_IN_LANGUAGES } from "@/lib/app-mode/language";
import type { LanguageEntry } from "@/lib/app-mode/packs";
import { appRuntime } from "@/lib/app-mode/runtime";
import { t } from "@/lib/i18n";
import { LOCALES } from "@/lib/i18n/locales";
import { useI18n } from "@/lib/i18n/provider";

import "./app-mode.css";

const BRAND = "بصائر"; // i18n-ignore — the name, drawn in Arabic in every language

type Choice = { code: string; native: string; dir: string; available: boolean };

/**
 * First launch: English is the first page's language and nothing else is
 * assumed (Arabic is not a default). One choice installs the interface
 * language and its translation of meanings.
 */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const { setLocale } = useI18n();
  const [languages, setLanguages] = useState<LanguageEntry[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    appRuntime()
      .then(({ packs }) => packs.catalogue(true))
      .then((manifest) => {
        if (!cancelled) setLanguages(manifest?.languages ?? []);
      })
      .catch(() => {
        if (!cancelled) setLanguages([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const offered = new Map((languages ?? []).map((entry) => [entry.code, entry]));
  const choices: Choice[] = LOCALES.map((locale) => ({
    code: locale.code,
    native: offered.get(locale.code)?.native ?? locale.native,
    dir: locale.dir,
    available: offered.has(locale.code) || BUILT_IN_LANGUAGES.has(locale.code),
  }));
  // Languages the catalogue offers (a translation) without an interface dictionary yet.
  for (const entry of languages ?? []) {
    if (!choices.some((choice) => choice.code === entry.code)) {
      choices.push({ code: entry.code, native: entry.native ?? entry.code, dir: entry.dir ?? "ltr", available: true });
    }
  }

  const choose = async (choice: Choice) => {
    setBusy(choice.code);
    setError(false);
    setPercent(0);
    try {
      await chooseLanguage(choice.code, ({ received, total }) => setPercent(total ? Math.round((received / total) * 100) : 0));
      onDone();
      await setLocale(LOCALES.some((locale) => locale.code === choice.code) ? choice.code : "en");
    } catch {
      setError(true);
      setBusy(null);
    }
  };

  return (
    <div className="qb-onboarding" dir="ltr" lang="en">
      <div className="qb-onboarding-card">
        <div className="qb-onboarding-mark" aria-hidden>
          <BrandMark size={72} themed />
          <span>{BRAND}</span>
        </div>
        <h1>{t("مرحبًا بك في بصائر")}</h1>
        <p className="lead">{t("اختر لغتك. تُنزَّل الواجهة وترجمة معاني القرآن بهذه اللغة، ويمكنك تغييرها لاحقًا من الإعدادات.")}</p>
        {languages === null ? (
          <div className="qb-onboarding-status" role="status">
            …
          </div>
        ) : (
          <ul className="qb-onboarding-languages" role="list">
            {choices.map((choice) => (
              <li key={choice.code}>
                <button
                  type="button"
                  dir={choice.dir}
                  lang={choice.code}
                  disabled={Boolean(busy) || !choice.available}
                  aria-busy={busy === choice.code}
                  title={choice.available ? undefined : t("تحتاج هذه اللغة إلى اتصال لتنزيلها.")}
                  onClick={() => void choose(choice)}
                >
                  {choice.native}
                </button>
              </li>
            ))}
          </ul>
        )}
        {busy ? (
          <div className="qb-onboarding-status" role="status">
            {t("جارٍ تنزيل حزمة اللغة… {0}", { 0: `${percent}%` })}
            <div className="qb-onboarding-bar" aria-hidden>
              <span style={{ width: `${percent}%` }} />
            </div>
          </div>
        ) : null}
        {error ? (
          <p className="qb-onboarding-error" role="alert">
            {t("تعذّر التنزيل. تحقّق من الاتصال ثم أعد المحاولة.")}
          </p>
        ) : null}
        {languages !== null && languages.length === 0 ? (
          <p className="hint">{t("دون اتصال: الإنجليزية والعربية متاحتان الآن، وتُنزَّل اللغات الأخرى عند الاتصال.")}</p>
        ) : null}
      </div>
    </div>
  );
}
