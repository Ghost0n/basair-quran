/**
 * Fonts for non-Arabic-script text (translations of meanings, and the
 * interface in other languages). Cairo covers Arabic + Latin; other scripts
 * get a Noto face, loaded once, on first use. The faces are self-hosted under
 * /fonts/noto/ (scripts/fetch-script-fonts.mjs, run by the web and app
 * builds, reads the NOTO table below). Nothing is fetched from a third party
 * at run time: if a stylesheet is missing, the text falls back to the
 * device's own fonts (see `fontStackFor`).
 *
 * `fontStackFor(lang)` is the CSS font-family to use for text in `lang`.
 */

type ScriptFont = { family: string; css: string };

const NOTO: Record<string, ScriptFont> = {
  cyrillic: { family: "Noto Sans", css: "Noto+Sans:wght@400;600;700" },
  ur: { family: "Noto Nastaliq Urdu", css: "Noto+Nastaliq+Urdu:wght@400;600" },
  bengali: { family: "Noto Sans Bengali", css: "Noto+Sans+Bengali:wght@400;600" },
  devanagari: { family: "Noto Sans Devanagari", css: "Noto+Sans+Devanagari:wght@400;600" },
  ta: { family: "Noto Sans Tamil", css: "Noto+Sans+Tamil:wght@400;600" },
  ml: { family: "Noto Sans Malayalam", css: "Noto+Sans+Malayalam:wght@400;600" },
  te: { family: "Noto Sans Telugu", css: "Noto+Sans+Telugu:wght@400;600" },
  kn: { family: "Noto Sans Kannada", css: "Noto+Sans+Kannada:wght@400;600" },
  gu: { family: "Noto Sans Gujarati", css: "Noto+Sans+Gujarati:wght@400;600" },
  si: { family: "Noto Sans Sinhala", css: "Noto+Sans+Sinhala:wght@400;600" },
  am: { family: "Noto Sans Ethiopic", css: "Noto+Sans+Ethiopic:wght@400;600" },
  th: { family: "Noto Sans Thai", css: "Noto+Sans+Thai:wght@400;600" },
  zh: { family: "Noto Sans SC", css: "Noto+Sans+SC:wght@400;600" },
  ja: { family: "Noto Sans JP", css: "Noto+Sans+JP:wght@400;600" },
  ko: { family: "Noto Sans KR", css: "Noto+Sans+KR:wght@400;600" },
  he: { family: "Noto Sans Hebrew", css: "Noto+Sans+Hebrew:wght@400;600" },
  dv: { family: "Noto Sans Thaana", css: "Noto+Sans+Thaana:wght@400;600" },
};

const SCRIPT_OF: Record<string, string> = {
  ru: "cyrillic", uk: "cyrillic", bg: "cyrillic", kk: "cyrillic", ky: "cyrillic", tg: "cyrillic", tt: "cyrillic",
  mk: "cyrillic", sr: "cyrillic", be: "cyrillic", mn: "cyrillic",
  ur: "ur",
  bn: "bengali", as: "bengali",
  hi: "devanagari", mr: "devanagari", ne: "devanagari",
  ta: "ta", ml: "ml", te: "te", kn: "kn", gu: "gu", si: "si", am: "am", th: "th", zh: "zh", ja: "ja", ko: "ko",
  he: "he", dv: "dv",
};

const loaded = new Set<string>();

/** Inject the self-hosted stylesheet for `lang`'s script once (no-op for Arabic/Latin). */
export function ensureScriptFont(lang: string): void {
  const script = SCRIPT_OF[lang];
  if (!script || loaded.has(script) || typeof document === "undefined") return;
  loaded.add(script);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `/fonts/noto/${script}.css`;
  link.dataset.scriptFont = script;
  document.head.appendChild(link);
}

/** CSS font-family for text in `lang` (UI face first where it covers the script). */
export function fontStackFor(lang: string): string {
  const script = SCRIPT_OF[lang];
  if (!script) return "var(--font-arabic-ui)";
  return `'${NOTO[script].family}', var(--font-arabic-ui), system-ui, sans-serif`;
}

/** The Noto family for `lang`'s script, or null when Cairo/Amiri already cover it (Arabic, Latin). */
export function scriptFamily(lang: string): string | null {
  const script = SCRIPT_OF[lang];
  return script ? NOTO[script].family : null;
}
