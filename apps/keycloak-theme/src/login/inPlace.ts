import type { KcContext } from "./KcContext";

/**
 * The account page's tabs (AccountChoice) switch without a page load: the
 * other tab's page is fetched in the background — Keycloak still renders it,
 * so its form carries Keycloak's fresh action address — and only its context
 * is read and drawn here (main.tsx). Anything unexpected (an error, a page from
 * elsewhere, no context) falls back to an ordinary page load.
 */

type Show = (kcContext: KcContext) => void;
let show: Show | undefined;

/** main.tsx: how to draw a page's context in place. */
export function registerInPlace(draw: Show): () => void {
  show = draw;
  return () => {
    if (show === draw) show = undefined;
  };
}

/**
 * Keycloak's page for `url`, read as its context: the page's own inline script
 * (Keycloakify's, from this same server) builds `window.kcContext`; it runs here
 * against a stand-in `window`, so nothing on this page changes.
 */
export async function readPage(url: string): Promise<KcContext | undefined> {
  const response = await fetch(url, { credentials: "same-origin", headers: { Accept: "text/html" } });
  if (!response.ok || new URL(response.url).origin !== window.location.origin) return undefined;
  const page = new DOMParser().parseFromString(await response.text(), "text/html");
  const script = [...page.querySelectorAll("script:not([src])")]
    .map((element) => element.textContent ?? "")
    .find((text) => text.includes("window.kcContext"));
  if (!script) return undefined;
  const standIn: { kcContext?: KcContext; location: { href: string } } = { location: { href: response.url } };
  new Function("window", script)(standIn);
  return standIn.kcContext;
}

/** Draws `url`'s page in place (and records it in the history); false when it cannot. */
export async function openInPlace(url: string, record = true): Promise<boolean> {
  const draw = show;
  if (!draw) return false;
  try {
    const kcContext = await readPage(url);
    if (!kcContext) return false;
    if (record) window.history.pushState({ qbKc: true }, "", url);
    draw(kcContext);
    return true;
  } catch {
    return false;
  }
}
