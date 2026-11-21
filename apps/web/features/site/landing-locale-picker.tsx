"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/icon";
import { SelectMenu } from "@/components/select-menu";
import { LanguageSelect } from "@/features/settings/language-select";
import { useThemeMode } from "@/features/workspace/hooks/use-theme-mode";
import { t } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/provider";
import { digitsSetting, formatNumber, resolveNumerals, type NumeralScript } from "@/lib/numerals";
import { usePreferences } from "@/lib/preferences-context";

const SCRIPTS: NumeralScript[] = ["arabic-indic", "latin", "persian"];

/**
 * The landing page's language, digits and theme, so a visitor can switch
 * before entering the app (docs/i18n.md). The same controls as Settings: the
 * language through `LanguageSelect` (this device, then the account or the
 * guest's preferences; a language brings its own digits), the digits through
 * `updateAccount`, the theme through the app's own `useThemeMode` (this
 * device, then the account), so the app opens as chosen. The language's own
 * digits are selected until the reader picks others (`digitsSetting`); each
 * option is shown in its own digits (٠١٢ · 012 · ۰۱۲), so the menu reads the
 * same in every language. Needs a `PreferencesProvider` above it (`SiteLanding`).
 */
export function LandingLocalePicker() {
  const { preferences, updateAccount } = usePreferences();
  const { info } = useI18n();
  const { theme, toggleTheme } = useThemeMode();
  // The page is rendered on the server first (always dark there): the button
  // follows the saved theme once mounted, so the first render matches.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = !mounted || theme === "dark";
  const label = dark ? t("التبديل إلى السِّمة الفاتحة") : t("التبديل إلى السِّمة الداكنة");

  return (
    <div className="qb-site-locale">
      <LanguageSelect className="qb-site-locale-menu" />
      <SelectMenu
        className="qb-site-locale-menu is-digits"
        ariaLabel={t("الأرقام")}
        value={resolveNumerals(preferences.numerals, info.numerals)}
        options={SCRIPTS.map((script) => ({ value: script, label: formatNumber("012", script) }))}
        onChange={(script) => void updateAccount({ numerals: digitsSetting(script as NumeralScript, info.numerals) }).catch(() => {})}
      />
      <button type="button" className="qb-site-theme" onClick={toggleTheme} aria-label={label} title={label}>
        <Icon name={dark ? "sun" : "moon"} size={17} />
      </button>
    </div>
  );
}
