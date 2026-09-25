"use client";

import { SelectMenu } from "@/components/select-menu";
import { LOCALES, localeInfo, t } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/provider";
import { usePreferences } from "@/lib/preferences-context";

/**
 * The interface language picker (native names). Choosing a language switches
 * this device, saves it on the account (so it follows the reader to other
 * devices) and adopts that language's usual digits.
 */
export function LanguageSelect({ className = "" }: { className?: string }) {
  const { locale, setLocale } = useI18n();
  const { updateAccount } = usePreferences();
  return (
    <SelectMenu
      className={className}
      ariaLabel={t("لغة الواجهة")}
      value={locale}
      options={LOCALES.map((item) => ({ value: item.code, label: item.reviewed ? item.native : `${item.native} · β` }))}
      onChange={(code) => {
        void updateAccount({ ui_language: code, numerals: localeInfo(code).numerals }).catch(() => {});
        void setLocale(code);
      }}
    />
  );
}
