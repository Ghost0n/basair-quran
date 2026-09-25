"use client";

import { useEffect, useMemo, useState } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { TranslationInfo } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { SelectMenu } from "@/components/select-menu";
import { API_BASE_URL } from "@/lib/config";
import { usePreferences } from "@/lib/preferences-context";
import { ensureScriptFont, fontStackFor } from "@/lib/script-fonts";

import { activeLocale, t } from "@/lib/i18n";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

export const MAX_TRANSLATIONS = 3;

const SOURCE_LABEL: Record<TranslationInfo["source"], string> = {
  quranenc: "QuranEnc",
  tanzil: "Tanzil",
};

/** "French — Français" style label, in the interface language plus the language's own name. */
export function languageLabel(code: string, uiLocale = "ar"): string {
  const fallback: Record<string, string> = { ber: "Tamazight — ⵜⴰⵎⴰⵣⵉⵖⵜ" };
  if (fallback[code]) return fallback[code];
  try {
    const local = new Intl.DisplayNames([uiLocale], { type: "language" }).of(code) ?? code;
    const native = new Intl.DisplayNames([code], { type: "language" }).of(code) ?? code;
    return local === native ? local : `${local} — ${native}`;
  } catch {
    return code;
  }
}

/**
 * «ترجمة المعاني» — pick up to three translations of meanings to show under
 * each ayah in the «آية آية» reader. Each translation shows its translator,
 * source (QuranEnc / Tanzil), version and terms: provenance is part of trust.
 */
export function TranslationsSettings() {
  const { preferences, updateAccount } = usePreferences();
  const [catalogue, setCatalogue] = useState<TranslationInfo[] | null>(null);
  const [language, setLanguage] = useState("");
  const chosen = preferences.translations ?? [];

  useEffect(() => {
    api.getTranslations().then(setCatalogue).catch(() => setCatalogue([]));
  }, []);

  const byKey = useMemo(() => new Map((catalogue ?? []).map((item) => [item.key, item])), [catalogue]);
  const languages = useMemo(() => {
    const codes = [...new Set((catalogue ?? []).map((item) => item.language))];
    return codes
      .map((code) => ({ value: code, label: languageLabel(code, activeLocale()) }))
      .sort((a, b) => a.label.localeCompare(b.label, activeLocale()));
  }, [catalogue]);
  const shownLanguage = language || languages[0]?.value || "";
  const options = (catalogue ?? []).filter((item) => item.language === shownLanguage);

  useEffect(() => {
    if (shownLanguage) ensureScriptFont(shownLanguage);
  }, [shownLanguage]);

  function save(next: string[]) {
    void updateAccount({ translations: next.slice(0, MAX_TRANSLATIONS) });
  }

  const readerIsAyah = preferences.reader_layout === "ayah";

  return (
    <section className="qb-setting-card qb-translations-card">
      <h3>{t("ترجمة المعاني")}</h3>
      <p className="card-sub">
        {t("تظهر تحت كل آية في طريقة القراءة «آية آية». الترجمة فهمُ مترجمٍ لمعاني الآيات، وليست قرآناً؛ والنصّ العربي هو الأصل.")}
      </p>

      {catalogue === null ? (
        <div className="qb-skeleton-list" aria-hidden>
          <span />
        </div>
      ) : catalogue.length === 0 ? (
        <p className="empty">{t("لا ترجمات مثبّتة على هذا الخادم بعد.")}</p>
      ) : (
        <>
          <div className="chosen" aria-label={t("الترجمات المختارة")}>
            {chosen.length === 0 ? <span className="none">{t("لم تختر ترجمة بعد.")}</span> : null}
            {chosen.map((key) => {
              const item = byKey.get(key);
              return (
                <span key={key} className="pill" lang={item?.language} title={item?.translator}>
                  <span className="lbl">
                    {item ? `${languageLabel(item.language, activeLocale()).split(" — ")[0]} · ${item.name}` : key}
                  </span>
                  <button type="button" aria-label={t("إزالة الترجمة")} onClick={() => save(chosen.filter((entry) => entry !== key))}>
                    <Icon name="close" size={11} />
                  </button>
                </span>
              );
            })}
          </div>

          <div className="qb-setting-row">
            <label>{t("اللغة")}</label>
            <SelectMenu ariaLabel={t("لغة الترجمة")} value={shownLanguage} options={languages} onChange={setLanguage} />
          </div>

          <ul className="options">
            {options.map((item) => {
              const on = chosen.includes(item.key);
              const full = !on && chosen.length >= MAX_TRANSLATIONS;
              return (
                <li key={item.key} className={on ? "on" : ""}>
                  <div className="meta">
                    <b lang={item.language} dir="auto" style={{ fontFamily: fontStackFor(item.language) }}>
                      {item.name}
                    </b>
                    {item.translator && item.translator !== item.name ? <span dir="auto">{item.translator}</span> : null}
                    <span className="src">
                      <a href={item.source_url} target="_blank" rel="noopener noreferrer">
                        {SOURCE_LABEL[item.source]}
                      </a>
                      {item.version ? ` · ${item.version}` : ""}
                      {item.kind === "transliteration" ? t(" · حروف لاتينية") : ""}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`qb-btn ${on ? "ghost" : "primary"}`}
                    aria-pressed={on}
                    disabled={full}
                    title={full ? t("ثلاث ترجمات على الأكثر") : undefined}
                    onClick={() => save(on ? chosen.filter((key) => key !== item.key) : [...chosen, item.key])}
                  >
                    {on ? t("إزالة") : t("أضِف")}
                  </button>
                </li>
              );
            })}
          </ul>

          {chosen.length && !readerIsAyah ? (
            <button type="button" className="qb-btn ghost block" onClick={() => void updateAccount({ reader_layout: "ayah" })}>
              <Icon name="cards" size={15} /> {t("اقرأ «آية آية» لترى الترجمة")}
            </button>
          ) : null}

          <p className="fine">
            {t("المصادر:")} <a href="https://quranenc.com" target="_blank" rel="noopener noreferrer">{t("موسوعة القرآن الكريم (QuranEnc)")}</a>{" "}
            {t("أولاً، ثم")} <a href="https://tanzil.net/trans/" target="_blank" rel="noopener noreferrer">Tanzil</a> {t("للغات التي لا تغطّيها. تُعرض النصوص كما نشرها أصحابها دون تعديل، مع اسم المترجم والمصدر.")}
          </p>
        </>
      )}
    </section>
  );
}
