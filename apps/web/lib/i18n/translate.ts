/**
 * The translation function. Message ids are the Arabic source strings
 * (gettext style), so untranslated text falls back to Arabic naturally and
 * module-level constants can be translated where they are displayed:
 * `t(mode.label)`.
 *
 * Placeholders: `{0}`, `{1}`… or `{name}`, filled from `vars`.
 *
 * `t` is a plain function (usable in helpers, not just components): it reads
 * the active dictionary, which `I18nProvider` installs before remounting the
 * app, so every render after a language change sees the new language.
 */
export type Dictionary = Record<string, string>;
export type Vars = Record<string, string | number>;

let active: { locale: string; messages: Dictionary; fallback: Dictionary | null } = {
  locale: "ar",
  messages: {},
  fallback: null,
};

export function setActiveDictionary(locale: string, messages: Dictionary, fallback: Dictionary | null = null): void {
  active = { locale, messages, fallback };
}

export function activeLocale(): string {
  return active.locale;
}

export function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

export function t(source: string, vars?: Vars): string {
  const translated = active.messages[source] || active.fallback?.[source] || source;
  return interpolate(translated, vars);
}
