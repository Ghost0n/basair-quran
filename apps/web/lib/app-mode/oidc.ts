/**
 * Sign-in in the standalone app (docs/keycloak.md → "App"): the OpenID Connect
 * code flow with PKCE against the realm's public client `qbasair-app`, and the
 * tokens it gives — kept in the device's secure store, refreshed before they
 * expire, sent to the API as `Authorization: Bearer`.
 *
 * Pure: the device's pieces (the browser sheet, native HTTP, the Keychain /
 * Keystore) come in from keycloak.ts, so this file is tested as is
 * (oidc.test.ts).
 */

export const APP_CLIENT_ID = "qbasair-app";
export const APP_REDIRECT_URI = "qbasair://auth/callback";
/**
 * `offline_access`: an offline token, so the app stays signed in for as long as
 * it is used (the realm's offline session: 30 days idle), not only the 30-day
 * maximum of a browser session. Signing out revokes it.
 */
export const APP_SCOPE = "openid email profile offline_access";
/** Refresh this long before the access token (5 minutes) expires. */
export const REFRESH_MARGIN_MS = 30_000;

/** Where the tokens live in the secure store. */
export const TOKENS_KEY = "qb.auth.oidc";

export type OidcEndpoints = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint?: string;
  revocation_endpoint?: string;
};

export type TokenSet = {
  endpoints: OidcEndpoints;
  accessToken: string;
  refreshToken: string | null;
  idToken: string | null;
  /** Epoch milliseconds. */
  expiresAt: number;
};

export type HttpAnswer = { status: number; body: unknown };

/** Native HTTP on the device (no CORS: Keycloak's origins stay as they are). */
export interface HttpTransport {
  getJson(url: string): Promise<HttpAnswer>;
  postForm(url: string, fields: Record<string, string>): Promise<HttpAnswer>;
}

export interface SecretStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export type OidcErrorCode =
  /** The reader closed the sheet or pressed Keycloak's cancel. */
  | "cancelled"
  /** Keycloak could not be reached (no network, a 5xx): try again later, nothing is lost. */
  | "unreachable"
  /** Keycloak refused (bad state, a used code, a revoked token…). */
  | "failed";

export class OidcError extends Error {
  constructor(
    readonly code: OidcErrorCode,
    message: string = code,
  ) {
    super(message);
    this.name = "OidcError";
  }
}

export function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomToken(size = 32): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(size)));
}

/** RFC 7636 S256: base64url(SHA-256(verifier)). */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

/** The realm's issuer from the server's session answer (`account_url` is `<issuer>/account`). */
export function issuerFromAccountUrl(accountUrl: string | null | undefined): string | null {
  if (!accountUrl) return null;
  const trimmed = accountUrl.replace(/\/+$/, "");
  return trimmed.endsWith("/account") ? trimmed.slice(0, -"/account".length) : null;
}

/** The realm's endpoints (its discovery document), checked to belong to `issuer`. */
export async function discover(http: HttpTransport, issuer: string): Promise<OidcEndpoints> {
  const answer = await reach(() => http.getJson(`${issuer.replace(/\/+$/, "")}/.well-known/openid-configuration`));
  const body = answer.body as Partial<OidcEndpoints> | null;
  if (answer.status !== 200 || !body?.authorization_endpoint || !body.token_endpoint) throw new OidcError("unreachable", "no discovery document");
  if (body.issuer !== issuer.replace(/\/+$/, "")) throw new OidcError("failed", "issuer mismatch");
  return {
    issuer: body.issuer,
    authorization_endpoint: body.authorization_endpoint,
    token_endpoint: body.token_endpoint,
    end_session_endpoint: body.end_session_endpoint,
    revocation_endpoint: body.revocation_endpoint,
  };
}

export type PendingAuthorization = { state: string; verifier: string };

/** Keycloak's page for this sign-in (`signup`: its registration tab), and what the callback must match. */
export async function authorizationRequest(
  endpoints: OidcEndpoints,
  options: { signup?: boolean; locale?: string } = {},
): Promise<{ url: string; pending: PendingAuthorization }> {
  const pending = { state: randomToken(16), verifier: randomToken(32) };
  const params = new URLSearchParams({
    client_id: APP_CLIENT_ID,
    response_type: "code",
    redirect_uri: APP_REDIRECT_URI,
    scope: APP_SCOPE,
    state: pending.state,
    code_challenge: await pkceChallenge(pending.verifier),
    code_challenge_method: "S256",
  });
  if (options.signup) params.set("prompt", "create");
  if (options.locale) params.set("ui_locales", options.locale);
  return { url: `${endpoints.authorization_endpoint}?${params.toString()}`, pending };
}

/** The code from Keycloak's redirect to `qbasair://auth/callback`, once its state matches. */
export function codeFromCallback(callbackUrl: string, pending: PendingAuthorization): string {
  if (!callbackUrl.startsWith(APP_REDIRECT_URI)) throw new OidcError("failed", "not the app's callback");
  const query = callbackUrl.slice(APP_REDIRECT_URI.length).replace(/^[?#]/, "").split("#")[0];
  const params = new URLSearchParams(query);
  if (params.get("state") !== pending.state) throw new OidcError("failed", "state mismatch");
  const error = params.get("error");
  if (error === "access_denied") throw new OidcError("cancelled");
  if (error) throw new OidcError("failed", error);
  const code = params.get("code");
  if (!code) throw new OidcError("failed", "no code");
  return code;
}

type TokenAnswer = { access_token?: string; refresh_token?: string; id_token?: string; expires_in?: number };

/** A token endpoint answer → what is stored (a refresh that carries no new refresh or ID token keeps the old ones). */
export function tokenSetFrom(body: unknown, endpoints: OidcEndpoints, now: number, previous?: TokenSet | null): TokenSet {
  const answer = (body ?? {}) as TokenAnswer;
  if (!answer.access_token) throw new OidcError("failed", "no access token");
  return {
    endpoints,
    accessToken: answer.access_token,
    refreshToken: answer.refresh_token ?? previous?.refreshToken ?? null,
    idToken: answer.id_token ?? previous?.idToken ?? null,
    expiresAt: now + Math.max(0, (answer.expires_in ?? 60) * 1000),
  };
}

/** A transport failure (no network) → "unreachable"; Keycloak's own 5xx too. */
async function reach(call: () => Promise<HttpAnswer>): Promise<HttpAnswer> {
  let answer: HttpAnswer;
  try {
    answer = await call();
  } catch (error) {
    throw new OidcError("unreachable", error instanceof Error ? error.message : String(error));
  }
  if (answer.status === 0 || answer.status >= 500) throw new OidcError("unreachable", `status ${answer.status}`);
  return answer;
}

function parseTokenSet(raw: string | null): TokenSet | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as TokenSet;
    return value?.accessToken && value.endpoints?.token_endpoint ? value : null;
  } catch {
    return null;
  }
}

/**
 * The account's tokens on this device: loaded once from the secure store,
 * refreshed (once at a time) when the access token is about to expire.
 */
export class AppTokens {
  private cached: TokenSet | null | undefined;
  private refreshing: Promise<string | null> | null = null;
  private readonly expiredListeners = new Set<() => void>();

  constructor(
    private readonly store: SecretStore,
    private readonly http: HttpTransport,
    private readonly now: () => number = Date.now,
  ) {}

  /** Called when Keycloak no longer accepts the refresh token (revoked, expired): the app is signed out. */
  onExpired(listener: () => void): () => void {
    this.expiredListeners.add(listener);
    return () => this.expiredListeners.delete(listener);
  }

  async load(): Promise<TokenSet | null> {
    if (this.cached === undefined) this.cached = parseTokenSet(await this.store.get(TOKENS_KEY).catch(() => null));
    return this.cached;
  }

  async signedIn(): Promise<boolean> {
    return (await this.load()) !== null;
  }

  private async save(tokens: TokenSet | null): Promise<void> {
    this.cached = tokens;
    if (tokens) await this.store.set(TOKENS_KEY, JSON.stringify(tokens));
    else await this.store.remove(TOKENS_KEY);
  }

  /** The callback's code → tokens (stored). */
  async exchange(endpoints: OidcEndpoints, code: string, pending: PendingAuthorization): Promise<TokenSet> {
    const answer = await reach(() =>
      this.http.postForm(endpoints.token_endpoint, {
        grant_type: "authorization_code",
        client_id: APP_CLIENT_ID,
        code,
        redirect_uri: APP_REDIRECT_URI,
        code_verifier: pending.verifier,
      }),
    );
    if (answer.status !== 200) throw new OidcError("failed", `token endpoint ${answer.status}`);
    const tokens = tokenSetFrom(answer.body, endpoints, this.now());
    await this.save(tokens);
    return tokens;
  }

  /**
   * A valid access token, refreshed first when needed; null when signed out
   * (or once Keycloak refuses the refresh token). Throws OidcError
   * "unreachable" when a refresh was needed and Keycloak could not be reached:
   * the tokens stay, the caller treats it as offline.
   */
  async accessToken(): Promise<string | null> {
    const tokens = await this.load();
    if (!tokens) return null;
    if (tokens.expiresAt - REFRESH_MARGIN_MS > this.now()) return tokens.accessToken;
    if (!this.refreshing) {
      this.refreshing = this.refresh(tokens).finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  private async refresh(tokens: TokenSet): Promise<string | null> {
    if (!tokens.refreshToken) {
      await this.expire();
      return null;
    }
    const answer = await reach(() =>
      this.http.postForm(tokens.endpoints.token_endpoint, {
        grant_type: "refresh_token",
        client_id: APP_CLIENT_ID,
        refresh_token: tokens.refreshToken as string,
      }),
    );
    if (answer.status !== 200) {
      // 400 invalid_grant: the session ended in Keycloak (revoked, idle too long, account deleted).
      await this.expire();
      return null;
    }
    const next = tokenSetFrom(answer.body, tokens.endpoints, this.now(), tokens);
    await this.save(next);
    return next.accessToken;
  }

  private async expire(): Promise<void> {
    await this.save(null);
    this.expiredListeners.forEach((listener) => listener());
  }

  /**
   * Sign out: forget the tokens here at once, then — best effort, never
   * blocking the sign-out — revoke the offline token and end Keycloak's
   * session (the end-session endpoint with the ID token as hint, so the next
   * sign-in asks again instead of reusing it).
   */
  async signOut(): Promise<void> {
    const tokens = await this.load();
    await this.save(null);
    if (!tokens) return;
    const { revocation_endpoint: revoke, end_session_endpoint: endSession } = tokens.endpoints;
    if (revoke && tokens.refreshToken) {
      await this.http
        .postForm(revoke, { client_id: APP_CLIENT_ID, token: tokens.refreshToken, token_type_hint: "refresh_token" })
        .catch(() => undefined);
    }
    if (endSession && tokens.idToken) {
      await this.http.postForm(endSession, { client_id: APP_CLIENT_ID, id_token_hint: tokens.idToken }).catch(() => undefined);
    }
  }
}
