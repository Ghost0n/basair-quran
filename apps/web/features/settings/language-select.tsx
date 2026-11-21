"use client";

import { useState } from "react";

import { SelectMenu } from "@/components/select-menu";
import { APP_MODE } from "@/lib/app-mode/config";
import { LOCALES, t } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/provider";
import { usePreferences } from "@/lib/preferences-context";

/**
 * The interface language picker (native names). Choosing a language switches
 * this device and saves it on the account (so it follows the reader to other
 * devices). A language brings its own digits (the digits go back to "auto");
 * the digits menu («الأرقام») stays to set others afterwards. In the standalone app
 * it first downloads the language (interface + translation of meanings).
 */
export function LanguageSelect({ className = "" }: { className?: string }) {
  const { locale, setLocale } = useI18n();
  const { account, updateAccount } = usePreferences();
  const [failed, setFailed] = useState(false);
  return (
    <>
      <SelectMenu
        className={className}
        ariaLabel={t("لغة الواجهة")}
        value={locale}
        options={LOCALES.map((item) => ({ value: item.code, label: item.native }))}
        onChange={(code) => {
          if (APP_MODE) {
            setFailed(false);
            void import("@/lib/app-mode/language")
              .then(({ chooseLanguage }) => chooseLanguage(code, undefined, { adoptNumerals: true }))
              .then(() => setLocale(code))
              .catch(() => setFailed(true));
            return;
          }
          void updateAccount({ ui_language: code, ...(account.numerals === "auto" ? {} : { numerals: "auto" as const }) }).catch(() => {});
          void setLocale(code);
        }}
      />
      {failed ? (
        <p className="card-sub" role="alert">
          {t("تعذّر التنزيل. تحقّق من الاتصال ثم أعد المحاولة.")}
        </p>
      ) : null}
    </>
  );
}
