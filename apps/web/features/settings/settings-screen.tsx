"use client";

import "./settings.css";
import "./settings.web.css";

import { SettingsWeb } from "./settings-web";
/**
 * Settings — the CANONICAL home for every preference, ordered from what a
 * reader changes most to what they set once: display (theme first — on phones
 * this screen is the theme's home), the muṣḥaf, translations, offline
 * downloads, then the account (sign-out last). What only shows its effect in
 * a screen of its own stays there: the reading mode and text size in the
 * reader's «العرض», the study's mode and depth in the study page. (The UI is Arabic-only in v1;
 * `ui_language` stays in the API for the future i18n work.) Quick
 * Settings (the ⚙ top-bar popover) is a shortcut to the handful of these a
 * reader changes mid-session; both write the same account preferences, so they
 * stay in lockstep. Theme delegates to its workspace home; the rest (including
 * the mushaf edition) persist via PreferencesProvider.updateAccount.
 */
export function SettingsScreen() {
  // One settings page at every width (settings-web.tsx): the sections' index
  // beside the page on a desktop or a tablet, a row of chips above it on a phone.
  return <SettingsWeb />;
}
