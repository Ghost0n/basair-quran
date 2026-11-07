/**
 * The translation function. Message ids are the Arabic source strings
 * (gettext style), so untranslated text falls back to Arabic naturally and
 * module-level constants can be translated where they are displayed:
 * `t(mode.label)`.
 *
 * Placeholders: `{0}`, `{1}`… or `{name}`, filled from `vars`.
 *
 * Counted nouns go through `tn(id, count, vars)`: the dictionary value is then
 * an object keyed by CLDR plural category (`one`, `few`, `many`, `other`…),
 * chosen with `Intl.PluralRules` for the locale. Arabic source forms live in
 * `plurals-ar.ts` («آية واحدة، آيتان، ٣ آيات، ١١ آية»).
 *
 * `t` is a plain function (usable in helpers, not just components): it reads
 * the active dictionary, which `I18nProvider` installs before remounting the
 * app, so every render after a language change sees the new language.
 */
import { AR_PLURALS } from "./plurals-ar";

export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
export type Message = string | PluralForms;
export type Dictionary = Record<string, Message>;
export type Vars = Record<string, string | number>;

let active: { locale: string; messages: Dictionary; fallback: Dictionary | null; fallbackLocale: string } = {
  locale: "ar",
  messages: {},
  fallback: null,
  fallbackLocale: "en",
};

export function setActiveDictionary(locale: string, messages: Dictionary, fallback: Dictionary | null = null, fallbackLocale = "en"): void {
  active = { locale, messages, fallback, fallbackLocale };
}

export function activeLocale(): string {
  return active.locale;
}

export function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

const rules = new Map<string, Intl.PluralRules>();

export function pluralCategory(locale: string, count: number): Intl.LDMLPluralRule {
  let rule = rules.get(locale);
  if (!rule) {
    rule = new Intl.PluralRules(locale);
    rules.set(locale, rule);
  }
  return rule.select(count);
}

function pick(message: Message, locale: string, count: number): string {
  if (typeof message === "string") return message;
  return message[pluralCategory(locale, count)] || message.other;
}

function lookup(source: string): { message: Message; locale: string } {
  const own = active.messages[source];
  if (own) return { message: own, locale: active.locale };
  const fallback = active.fallback?.[source];
  if (fallback) return { message: fallback, locale: active.fallbackLocale };
  return { message: AR_PLURALS[source] ?? source, locale: "ar" };
}

export function t(source: string, vars?: Vars): string {
  const { message } = lookup(source);
  return interpolate(typeof message === "string" ? message : message.other, vars);
}

/** A counted phrase: `tn("{0} آية", n, { 0: formatNumber(n) })`. */
export function tn(source: string, count: number, vars?: Vars): string {
  const { message, locale } = lookup(source);
  return interpolate(pick(message, locale, count), vars);
}
