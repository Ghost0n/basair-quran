export const LOCALE_STORAGE_KEY = "qb.locale";

/** Runs before first paint (inline in <head>): lang/dir from the saved choice, and hide until the dictionary loads. */
export const LOCALE_INIT_SCRIPT = `(function(){try{var l=localStorage.getItem('${LOCALE_STORAGE_KEY}');if(l&&l!=='ar'){var d=document.documentElement;d.lang=l;d.dir=${JSON.stringify(
  ["ar", "fa", "ur"],
)}.indexOf(l)>=0?'rtl':'ltr';d.dataset.i18nPending='1';setTimeout(function(){delete d.dataset.i18nPending;},2500);}}catch(e){}})();`;
