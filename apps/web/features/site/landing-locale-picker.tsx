"use client";

import { SelectMenu } from "@/components/select-menu";
import { LanguageSelect } from "@/features/settings/language-select";
import { t } from "@/lib/i18n";
import { formatNumber, type NumeralScript } from "@/lib/numerals";
import { usePreferences } from "@/lib/preferences-context";

const SCRIPTS: NumeralScript[] = ["arabic-indic", "latin", "persian"];

/**
 * The landing page's language and digits, so a visitor can switch before
 * entering the app (docs/i18n.md). The same controls as Settings: the
 * language through `LanguageSelect` (this device, then the account or the
 * guest's preferences), the digits through `updateAccount`. Each digits option
 * is shown in its own digits (٠١٢ · 012 · ۰۱۲), so the menu reads the same in
 * every language. Needs a `PreferencesProvider` above it (`SiteLanding`).
 */
export function LandingLocalePicker() {
  const { preferences, updateAccount } = usePreferences();
  return (
    <div className="qb-site-locale">
      <LanguageSelect className="qb-site-locale-menu" />
      <SelectMenu
        className="qb-site-locale-menu is-digits"
        ariaLabel={t("الأرقام")}
        value={preferences.numerals}
        options={SCRIPTS.map((script) => ({ value: script, label: formatNumber("012", script) }))}
        onChange={(numerals) => void updateAccount({ numerals: numerals as NumeralScript }).catch(() => {})}
      />
    </div>
  );
}
