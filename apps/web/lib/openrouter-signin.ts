/**
 * «الدخول بحساب OpenRouter» (Settings → «الذكاء الاصطناعي»): OpenRouter's
 * sign-in (OAuth with PKCE). The reader signs in on openrouter.ai and comes
 * back to /connect/openrouter with a code; our server exchanges it, with the
 * verifier kept here, for the reader's own key (POST /api/ai/openrouter/key),
 * which stays on this device. No key is ever typed.
 */
import { createQBasairApiClient } from "@q-basair/api-client";

import { API_BASE_URL } from "@/lib/config";

import { chooseProvider, setProviderKey } from "./ai-connection";

const VERIFIER_KEY = "qb.openrouter.verifier";
export const OPENROUTER_AUTH_URL = "https://openrouter.ai/auth";
export const OPENROUTER_RETURN_PATH = "/connect/openrouter";

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

export async function startOpenRouterSignIn(): Promise<void> {
  const { verifier, challenge } = await pkcePair();
  window.sessionStorage.setItem(VERIFIER_KEY, verifier);
  window.location.assign(signInUrl(`${window.location.origin}${OPENROUTER_RETURN_PATH}`, challenge));
}

/** Back from OpenRouter: the code for the key; OpenRouter becomes the study's provider. */
export async function finishOpenRouterSignIn(code: string): Promise<boolean> {
  const verifier = window.sessionStorage.getItem(VERIFIER_KEY);
  if (!verifier) return false;
  const api = createQBasairApiClient({ baseUrl: API_BASE_URL });
  const { key } = await api.exchangeOpenRouterKey(code, verifier);
  window.sessionStorage.removeItem(VERIFIER_KEY);
  setProviderKey("openrouter", key);
  chooseProvider("openrouter");
  return true;
}
