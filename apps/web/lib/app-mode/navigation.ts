/**
 * Moving between pages in the standalone app.
 *
 * The app is a static export served by Capacitor, whose web server answers
 * every path without a file extension with index.html — Home. So a full page
 * load of `/login`, `/welcome`, `/guide`… (a plain `<a href>`, or
 * `window.location.assign`) restarts the app on Home instead of opening the
 * page. Next's client navigation works: it fetches the page's `.txt` payload
 * files, which have an extension. The app's root (features/app-mode/
 * app-mode-root.tsx) registers its router here and turns same-origin link
 * clicks into client navigations; code that navigates by hand calls
 * `navigateTo`.
 */
import { APP_MODE } from "./config";

let push: ((href: string) => void) | null = null;

/** The app's root registers Next's router (`router.push`). */
export function setAppNavigator(navigator: ((href: string) => void) | null): void {
  push = navigator;
}

type Place = { protocol: string; host: string; href: string };

/**
 * The in-app path a link should open with client navigation, or null to leave
 * the click alone: another origin, a new tab or a download, the API, a file
 * (`/fonts/x.woff2`, anything with an extension), or Home itself — a full load
 * of `/` is index.html, the app's own start.
 */
export function inAppPath(href: string, place: Place, options: { target?: string | null; download?: boolean } = {}): string | null {
  if (options.download || (options.target && options.target !== "_self")) return null;
  let url: URL;
  try {
    url = new URL(href, place.href);
  } catch {
    return null;
  }
  // Compare scheme + host, not `origin`: iOS's capacitor:// origin is the opaque "null".
  if (url.protocol !== place.protocol || url.host !== place.host) return null;
  const path = url.pathname;
  if (path === "/" || path.startsWith("/api/")) return null;
  const last = path.slice(path.lastIndexOf("/") + 1);
  if (last.includes(".")) return null;
  return `${path}${url.search}${url.hash}`;
}

/** Go to a page: client navigation in the app (when the path needs it), a page load otherwise. */
export function navigateTo(href: string): void {
  if (APP_MODE && push && typeof window !== "undefined") {
    const path = inAppPath(href, window.location);
    if (path) {
      push(path);
      return;
    }
  }
  window.location.assign(href);
}
