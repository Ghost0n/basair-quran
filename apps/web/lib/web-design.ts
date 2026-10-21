import { APP_MODE } from "./app-mode/config";
import { PHONE_QUERY } from "./phone-query";

/**
 * The web design (Q-Basair-55, docs/design-system.md) applies to the desktop
 * web only: not in the native app build, not on a phone. Phones and the app
 * keep the liquid-glass design until their redesign is agreed.
 */
export function isWebDesign(appMode: boolean, phone: boolean): boolean {
  return !appMode && !phone;
}

/**
 * Sets `<html class="qb-web">` before first paint (no flash of the other
 * design) and keeps it in step when the window crosses the phone query.
 * Every rule of the web design is scoped under `.qb-web`.
 */
export const WEB_DESIGN_INIT_SCRIPT = `(function(){try{var d=document.documentElement;if(${JSON.stringify(
  APP_MODE,
)}){d.classList.remove('qb-web');return;}var q=window.matchMedia(${JSON.stringify(
  PHONE_QUERY,
)});var s=function(){d.classList.toggle('qb-web',!q.matches);};s();q.addEventListener('change',s);}catch(e){}})();`;
