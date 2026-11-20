/**
 * «الدخول بحساب OpenRouter» (Settings → «الذكاء الاصطناعي»): OpenRouter's
 * sign-in (OAuth with PKCE). The reader signs in on openrouter.ai and comes
 * back to /connect/openrouter with a code; our server exchanges it, with the
 * verifier kept here, for the reader's own key (POST /api/ai/openrouter/key),
 * which stays on this device. No key is ever typed.
 *
 * On the web it happens in a small window over Settings, which stays where it
 * is: the window hands the code back to the page that opened it and closes
 * (or, when the browser cut that link, exchanges it itself — the key reaches
 * Settings through the shared storage). Popups blocked, or the standalone
 * app: the page itself goes to OpenRouter and comes back.
 */
import { createQBasairApiClient } from "@q-basair/api-client";

import { APP_MODE } from "@/lib/app-mode/config";
import { API_BASE_URL } from "@/lib/config";

import { chooseProvider, setProviderKey } from "./ai-connection";

// Kept in local storage: the sign-in window and the page share it.
const VERIFIER_KEY = "qb.openrouter.verifier";
export const OPENROUTER_AUTH_URL = "https://openrouter.ai/auth";
export const OPENROUTER_RETURN_PATH = "/connect/openrouter";
/** The sign-in window's name: the return page knows it is in one by it. */
export const OPENROUTER_WINDOW = "qb-openrouter-signin";
/** What the sign-in window posts to the page that opened it. */
export const OPENROUTER_CODE_MESSAGE = "qb:openrouter-code";

function base64url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A fresh PKCE verifier (64 URL-safe characters) and its S256 challenge. */
export async function pkcePair(): Promise<{ verifier: string; challenge: string }> {
  const random = new Uint8Array(48);
  crypto.getRandomValues(random);
  const verifier = base64url(random);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

/** The address of OpenRouter's sign-in page, coming back to `returnUrl`. */
export function signInUrl(returnUrl: string, challenge: string): string {
  const params = new URLSearchParams({ callback_url: returnUrl, code_challenge: challenge, code_challenge_method: "S256" });
  return `${OPENROUTER_AUTH_URL}?${params.toString()}`;
}

function openWindow(): Window | null {
  const width = 520;
  const height = 720;
  const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2);
  const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2);
  try {
    return window.open(
      "about:blank",
      OPENROUTER_WINDOW,
      `popup=yes,width=${width},height=${height},left=${Math.round(left)},top=${Math.round(top)}`,
    );
  } catch {
    return null;
  }
}

let listening = false;

function listenForCode(): void {
  if (listening) return;
  listening = true;
  window.addEventListener("message", (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return;
    const data = event.data as { type?: string; code?: string } | null;
    if (data?.type !== OPENROUTER_CODE_MESSAGE || !data.code) return;
    void finishOpenRouterSignIn(data.code).catch(() => {});
  });
}

/**
 * Called from the click itself: the window opens before anything is awaited,
 * or the browser would block it.
 */
export async function startOpenRouterSignIn(): Promise<void> {
  const popup = APP_MODE ? null : openWindow();
  const { verifier, challenge } = await pkcePair();
  window.localStorage.setItem(VERIFIER_KEY, verifier);
  const url = signInUrl(`${window.location.origin}${OPENROUTER_RETURN_PATH}`, challenge);
  if (popup && !popup.closed) {
    listenForCode();
    popup.location.href = url;
    popup.focus();
    return;
  }
  window.location.assign(url);
}

/** Back from OpenRouter: the code for the key; OpenRouter becomes the study's provider. */
export async function finishOpenRouterSignIn(code: string): Promise<boolean> {
  const verifier = window.localStorage.getItem(VERIFIER_KEY);
  if (!verifier) return false;
  // Taken once: the window and the page never both exchange the same code.
  window.localStorage.removeItem(VERIFIER_KEY);
  const api = createQBasairApiClient({ baseUrl: API_BASE_URL });
  const { key } = await api.exchangeOpenRouterKey(code, verifier);
  setProviderKey("openrouter", key);
  chooseProvider("openrouter");
  return true;
}

/** In the sign-in window: hand the code to the page that opened it. False when there is none. */
export function handCodeToOpener(code: string): boolean {
  if (window.name !== OPENROUTER_WINDOW) return false;
  try {
    const opener = window.opener as Window | null;
    if (!opener || opener.location.origin !== window.location.origin) return false;
    opener.postMessage({ type: OPENROUTER_CODE_MESSAGE, code }, window.location.origin);
    return true;
  } catch {
    return false;
  }
}

/** Is this page the sign-in window (whatever became of its opener)? */
export function inOpenRouterWindow(): boolean {
  return typeof window !== "undefined" && window.name === OPENROUTER_WINDOW;
}
