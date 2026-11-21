/**
 * The device's side of the app's Keycloak sign-in (the flow itself is oidc.ts):
 *
 * - **the sign-in sheet** — Keycloak's own page in the system's browser sheet:
 *   ASWebAuthenticationSession on iOS (the app's QbAuth plugin,
 *   apps/mobile/ios/App/App/QbAuthPlugin.swift), a Custom Tab on Android
 *   (@capacitor/browser), whose redirect to `qbasair://auth/callback` comes back
 *   as a deep link (@capacitor/app `appUrlOpen`);
 * - **native HTTP** (CapacitorHttp) for Keycloak's discovery, token, revocation
 *   and end-session endpoints, so the realm needs no web origins for the app;
 * - **the secure store** — the Keychain on iOS, an Android Keystore key on
 *   Android (QbAuth plugin, apps/mobile/android/…/QbAuthPlugin.java), never the
 *   backed-up files of the device store.
 *
 * Imported only by the app build's code; every Capacitor import is dynamic.
 */
import { appRuntime } from "./runtime";
import { APP_REDIRECT_URI, AppTokens, OidcError, authorizationRequest, codeFromCallback, discover, issuerFromAccountUrl, type HttpAnswer, type HttpTransport, type SecretStore } from "./oidc";

/** Optional override of the realm's issuer (else read from the server's session answer). */
const OIDC_ISSUER = (process.env.NEXT_PUBLIC_OIDC_ISSUER ?? "").replace(/\/+$/, "");

type QbAuthPlugin = {
  /** iOS only: ASWebAuthenticationSession; resolves with the callback URL, rejects with code "cancelled". */
  authenticate(options: { url: string; callbackScheme: string }): Promise<{ url: string }>;
  secureGet(options: { key: string }): Promise<{ value: string | null }>;
  secureSet(options: { key: string; value: string }): Promise<void>;
  secureRemove(options: { key: string }): Promise<void>;
};

let pluginRef: Promise<QbAuthPlugin> | null = null;
const qbAuth = () =>
  (pluginRef ??= import("@capacitor/core").then(({ registerPlugin }) => registerPlugin<QbAuthPlugin>("QbAuth")));

async function platformName(): Promise<"ios" | "android" | "web"> {
  const { Capacitor } = await import("@capacitor/core");
  const name = Capacitor.getPlatform();
  return name === "ios" || name === "android" ? name : "web";
}

function parseBody(data: unknown): unknown {
  if (typeof data !== "string") return data;
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

/** CapacitorHttp on the device; the webview's fetch in a desktop preview of the app build. */
const http: HttpTransport = {
  async getJson(url) {
    if ((await platformName()) === "web") return fetchAnswer(fetch(url, { headers: { Accept: "application/json" } }));
    const { CapacitorHttp } = await import("@capacitor/core");
    const response = await CapacitorHttp.get({ url, headers: { Accept: "application/json" } });
    return { status: response.status, body: parseBody(response.data) };
  },
  async postForm(url, fields) {
    if ((await platformName()) === "web") {
      return fetchAnswer(fetch(url, { method: "POST", body: new URLSearchParams(fields), headers: { Accept: "application/json" } }));
    }
    const { CapacitorHttp } = await import("@capacitor/core");
    const response = await CapacitorHttp.post({
      url,
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      data: fields,
    });
    return { status: response.status, body: parseBody(response.data) };
  },
};

async function fetchAnswer(pending: Promise<Response>): Promise<HttpAnswer> {
  const response = await pending;
  return { status: response.status, body: parseBody(await response.text()) };
}

/** The Keychain / Keystore on the device; the device store in a desktop preview. */
const secrets: SecretStore = {
  async get(key) {
    if ((await platformName()) === "web") return (await appRuntime()).platform.kv.get(key);
    return (await (await qbAuth()).secureGet({ key })).value ?? null;
  },
  async set(key, value) {
    if ((await platformName()) === "web") return (await appRuntime()).platform.kv.set(key, value);
    await (await qbAuth()).secureSet({ key, value });
  },
  async remove(key) {
    if ((await platformName()) === "web") return (await appRuntime()).platform.kv.remove(key);
    await (await qbAuth()).secureRemove({ key });
  },
};

let tokens: AppTokens | null = null;

/** The account's tokens on this device (one instance per run). */
export function appTokens(): AppTokens {
  return (tokens ??= new AppTokens(secrets, http));
}

function isCancel(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return code === "cancelled" || /cancel/i.test(message);
}

/** Keycloak's page in the system sheet; resolves with the URL it redirected to. */
async function openAuthSheet(url: string): Promise<string> {
  const platform = await platformName();
  if (platform === "ios") {
    try {
      return (await (await qbAuth()).authenticate({ url, callbackScheme: new URL(APP_REDIRECT_URI).protocol.replace(":", "") })).url;
    } catch (error) {
      throw isCancel(error) ? new OidcError("cancelled") : new OidcError("failed", String(error));
    }
  }
  if (platform !== "android") throw new OidcError("failed", "the sign-in sheet needs the app on a phone");
  const [{ Browser }, { App }] = await Promise.all([import("@capacitor/browser"), import("@capacitor/app")]);
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const handles: { remove: () => Promise<void> }[] = [];
    const finish = (result: () => void) => {
      if (settled) return;
      settled = true;
      handles.forEach((handle) => void handle.remove());
      result();
    };
    void App.addListener("appUrlOpen", ({ url: opened }) => {
      if (!opened.startsWith(APP_REDIRECT_URI)) return;
      finish(() => resolve(opened));
      void Browser.close().catch(() => undefined);
    }).then((handle) => handles.push(handle));
    // The tab closed without the redirect (back button, its ×): cancelled. The
    // deep link arrives before the activity resumes, but leave it a moment.
    void Browser.addListener("browserFinished", () => {
      setTimeout(() => finish(() => reject(new OidcError("cancelled"))), 800);
    }).then((handle) => handles.push(handle));
    Browser.open({ url, presentationStyle: "popover" }).catch((error: unknown) => finish(() => reject(new OidcError("failed", String(error)))));
  });
}

export type KeycloakSignInOptions = {
  /** Open Keycloak's registration tab. */
  signup?: boolean;
  locale?: string;
  /** The server's session answer `account_url` (`<issuer>/account`). */
  accountUrl?: string | null;
};

/** Sign in on Keycloak's page and keep the tokens. Throws OidcError ("cancelled", "unreachable", "failed"). */
export async function keycloakSignIn(options: KeycloakSignInOptions): Promise<void> {
  const issuer = OIDC_ISSUER || issuerFromAccountUrl(options.accountUrl);
  if (!issuer) throw new OidcError("failed", "the server named no sign-in realm");
  const endpoints = await discover(http, issuer);
  const { url, pending } = await authorizationRequest(endpoints, { signup: options.signup, locale: options.locale });
  const code = codeFromCallback(await openAuthSheet(url), pending);
  await appTokens().exchange(endpoints, code, pending);
}
