/**
 * The platform touches of the responsive design: `<html class="qb-ios">` or
 * `qb-android`, nothing on desktop. In the app, Capacitor says which platform
 * it runs on; in a browser the user agent does. iPadOS reports itself as a
 * Mac, so a "Macintosh" with a touch screen counts as iOS.
 *
 * A plain module (no "use client") so the root layout can inline the script.
 */
export type Platform = "ios" | "android" | null;

export function detectPlatform(input: {
  ua: string;
  maxTouchPoints: number;
  native: string | null;
}): Platform {
  if (input.native === "ios" || input.native === "android") return input.native;
  if (/iPhone|iPad|iPod/.test(input.ua)) return "ios";
  if (/Macintosh/.test(input.ua) && input.maxTouchPoints > 1) return "ios";
  if (/Android/.test(input.ua)) return "android";
  return null;
}

/**
 * Sets the platform class on `<html>` before first paint (same rules as
 * detectPlatform). The web tab bar stays until the iPhone app's native one
 * has really drawn (lib/native-tab-bar.ts): hiding it here, before, left the
 * app with no bar at all when the native one did not show.
 */
export const PLATFORM_INIT_SCRIPT = `(function(){try{var c=window.Capacitor;var n=c&&c.getPlatform?c.getPlatform():null;var u=navigator.userAgent;var p=(n==='ios'||n==='android')?n:/iPhone|iPad|iPod/.test(u)?'ios':(/Macintosh/.test(u)&&navigator.maxTouchPoints>1)?'ios':/Android/.test(u)?'android':null;if(p)document.documentElement.classList.add('qb-'+p);}catch(e){}})();`;
