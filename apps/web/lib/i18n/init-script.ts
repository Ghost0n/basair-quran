import { LOCALE_CODES } from "./locales";

export const LOCALE_STORAGE_KEY = "qb.locale";

// The web opens in the visitor's browser language when they haven't chosen
// one (`matchLocale`, lib/i18n/locales.ts); the standalone app asks at onboarding instead.
const DETECT = process.env.NEXT_PUBLIC_APP_MODE === "1" ? "" : `if(!l){var n=navigator.languages||[navigator.language],c=${JSON.stringify(
  LOCALE_CODES,
)};for(var i=0;i<n.length&&!l;i++){var b=String(n[i]||'').toLowerCase().split(/[-_]/)[0];if(b==='in')b='id';if(c.indexOf(b)>=0)l=b;}}`;

/** Runs before first paint (inline in <head>): lang/dir from the saved choice (or, on the web,
 *  the browser's language), and hide until the dictionary loads. */
export const LOCALE_INIT_SCRIPT = `(function(){try{var l=localStorage.getItem('${LOCALE_STORAGE_KEY}');${DETECT}if(l&&l!=='ar'){var d=document.documentElement;d.lang=l;d.dir=${JSON.stringify(
  ["ar", "fa", "ur"],
)}.indexOf(l)>=0?'rtl':'ltr';d.dataset.i18nPending='1';setTimeout(function(){delete d.dataset.i18nPending;},2500);}}catch(e){}})();`;
