import { describe, expect, test, vi } from "vitest";

import {
  APP_CLIENT_ID,
  APP_REDIRECT_URI,
  AppTokens,
  OidcError,
  TOKENS_KEY,
  authorizationRequest,
  codeFromCallback,
  discover,
  issuerFromAccountUrl,
  pkceChallenge,
  tokenSetFrom,
  type HttpAnswer,
  type HttpTransport,
  type OidcEndpoints,
  type TokenSet,
} from "./oidc";

const ISSUER = "https://auth.basair.example/realms/qbasair";
const ENDPOINTS: OidcEndpoints = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/protocol/openid-connect/auth`,
  token_endpoint: `${ISSUER}/protocol/openid-connect/token`,
  end_session_endpoint: `${ISSUER}/protocol/openid-connect/logout`,
  revocation_endpoint: `${ISSUER}/protocol/openid-connect/revoke`,
};

type Post = { url: string; fields: Record<string, string> };

function memoryStore() {
  const map = new Map<string, string>();
  return {
    map,
    get: async (key: string) => map.get(key) ?? null,
    set: async (key: string, value: string) => void map.set(key, value),
    remove: async (key: string) => void map.delete(key),
  };
}

function fakeHttp(answer: (post: Post) => HttpAnswer | Promise<HttpAnswer>) {
  const posts: Post[] = [];
  const http: HttpTransport = {
    getJson: async () => ({ status: 200, body: ENDPOINTS }),
    postForm: async (url, fields) => {
      const post = { url, fields };
      posts.push(post);
      return answer(post);
    },
  };
  return { http, posts };
}

function stored(overrides: Partial<TokenSet> = {}): TokenSet {
  return { endpoints: ENDPOINTS, accessToken: "access-1", refreshToken: "refresh-1", idToken: "id-1", expiresAt: 1_000_000, ...overrides };
}

describe("PKCE and the authorization request", () => {
  test("S256 matches RFC 7636's example", async () => {
    expect(await pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  test("the request names the app's public client, its redirect, PKCE and a fresh state", async () => {
    const { url, pending } = await authorizationRequest(ENDPOINTS, { locale: "fr" });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(ENDPOINTS.authorization_endpoint);
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      client_id: APP_CLIENT_ID,
      response_type: "code",
      redirect_uri: APP_REDIRECT_URI,
      scope: "openid email profile offline_access",
      state: pending.state,
      code_challenge: await pkceChallenge(pending.verifier),
      code_challenge_method: "S256",
      ui_locales: "fr",
    });
    expect(pending.verifier.length).toBeGreaterThanOrEqual(43);
    const again = await authorizationRequest(ENDPOINTS);
    expect(again.pending.state).not.toBe(pending.state);
    expect(again.pending.verifier).not.toBe(pending.verifier);
  });

  test("sign-up opens Keycloak's registration (prompt=create)", async () => {
    const { url } = await authorizationRequest(ENDPOINTS, { signup: true });
    expect(new URL(url).searchParams.get("prompt")).toBe("create");
  });
});

describe("the callback", () => {
  const pending = { state: "s-1", verifier: "v" };

  test("gives the code when the state matches", () => {
    expect(codeFromCallback(`${APP_REDIRECT_URI}?state=s-1&session_state=x&code=c-1`, pending)).toBe("c-1");
  });

  test("refuses a foreign state, another URL, or no code", () => {
    expect(() => codeFromCallback(`${APP_REDIRECT_URI}?state=other&code=c-1`, pending)).toThrowError(/state mismatch/);
    expect(() => codeFromCallback(`https://evil.example/?state=s-1&code=c-1`, pending)).toThrowError(OidcError);
    expect(() => codeFromCallback(`${APP_REDIRECT_URI}?state=s-1`, pending)).toThrowError(/no code/);
  });

  test("Keycloak's cancel reads as cancelled, its other errors as failed", () => {
    const cancel = (() => {
      try {
        codeFromCallback(`${APP_REDIRECT_URI}?state=s-1&error=access_denied`, pending);
      } catch (error) {
        return error as OidcError;
      }
    })();
    expect(cancel?.code).toBe("cancelled");
    expect(() => codeFromCallback(`${APP_REDIRECT_URI}?state=s-1&error=temporarily_unavailable`, pending)).toThrowError(/temporarily_unavailable/);
  });
});

describe("the realm", () => {
  test("the issuer comes from the server's account_url", () => {
    expect(issuerFromAccountUrl(`${ISSUER}/account`)).toBe(ISSUER);
    expect(issuerFromAccountUrl(`${ISSUER}/account/`)).toBe(ISSUER);
    expect(issuerFromAccountUrl("https://elsewhere.example/profile")).toBeNull();
    expect(issuerFromAccountUrl(null)).toBeNull();
  });

  test("discovery is refused when it names another issuer, and unreachable when it cannot be read", async () => {
    const { http } = fakeHttp(() => ({ status: 200, body: {} }));
    expect(await discover(http, ISSUER)).toEqual(ENDPOINTS);
    const foreign: HttpTransport = { ...http, getJson: async () => ({ status: 200, body: { ...ENDPOINTS, issuer: "https://evil.example" } }) };
    await expect(discover(foreign, ISSUER)).rejects.toMatchObject({ code: "failed" });
    const down: HttpTransport = { ...http, getJson: async () => Promise.reject(new Error("offline")) };
    await expect(discover(down, ISSUER)).rejects.toMatchObject({ code: "unreachable" });
  });
});

describe("the account's tokens", () => {
  test("the code exchange sends the verifier and stores the tokens in the secure store", async () => {
    const store = memoryStore();
    const { http, posts } = fakeHttp(() => ({
      status: 200,
      body: { access_token: "a", refresh_token: "r", id_token: "i", expires_in: 300 },
    }));
    const tokens = new AppTokens(store, http, () => 10_000);
    await tokens.exchange(ENDPOINTS, "code-1", { state: "s", verifier: "verifier-1" });
    expect(posts).toEqual([
      {
        url: ENDPOINTS.token_endpoint,
        fields: { grant_type: "authorization_code", client_id: APP_CLIENT_ID, code: "code-1", redirect_uri: APP_REDIRECT_URI, code_verifier: "verifier-1" },
      },
    ]);
    expect(JSON.parse(store.map.get(TOKENS_KEY) ?? "null")).toEqual({
      endpoints: ENDPOINTS,
      accessToken: "a",
      refreshToken: "r",
      idToken: "i",
      expiresAt: 310_000,
    });
    expect(await tokens.accessToken()).toBe("a");
  });

  test("a refused exchange stores nothing", async () => {
    const store = memoryStore();
    const { http } = fakeHttp(() => ({ status: 400, body: { error: "invalid_grant" } }));
    const tokens = new AppTokens(store, http);
    await expect(tokens.exchange(ENDPOINTS, "used", { state: "s", verifier: "v" })).rejects.toMatchObject({ code: "failed" });
    expect(store.map.size).toBe(0);
    expect(await tokens.signedIn()).toBe(false);
  });

  test("a valid access token is used as is", async () => {
    const store = memoryStore();
    store.map.set(TOKENS_KEY, JSON.stringify(stored({ expiresAt: 500_000 })));
    const { http, posts } = fakeHttp(() => ({ status: 500, body: null }));
    expect(await new AppTokens(store, http, () => 100_000).accessToken()).toBe("access-1");
    expect(posts).toEqual([]);
  });

  test("near expiry it refreshes once, even for concurrent callers, and keeps the rotated tokens", async () => {
    const store = memoryStore();
    store.map.set(TOKENS_KEY, JSON.stringify(stored({ expiresAt: 100_000 + 10_000 })));
    let release: (answer: HttpAnswer) => void = () => undefined;
    const { http, posts } = fakeHttp(() => new Promise<HttpAnswer>((resolve) => (release = resolve)));
    const tokens = new AppTokens(store, http, () => 100_000);
    const first = tokens.accessToken();
    const second = tokens.accessToken();
    await vi.waitFor(() => expect(posts).toHaveLength(1));
    release({ status: 200, body: { access_token: "access-2", refresh_token: "refresh-2", expires_in: 300 } });
    expect(await Promise.all([first, second])).toEqual(["access-2", "access-2"]);
    expect(posts[0]).toEqual({
      url: ENDPOINTS.token_endpoint,
      fields: { grant_type: "refresh_token", client_id: APP_CLIENT_ID, refresh_token: "refresh-1" },
    });
    const saved = JSON.parse(store.map.get(TOKENS_KEY) ?? "null") as TokenSet;
    expect(saved).toMatchObject({ accessToken: "access-2", refreshToken: "refresh-2", idToken: "id-1", expiresAt: 400_000 });
  });

  test("a refused refresh signs out (tokens gone, listeners told)", async () => {
    const store = memoryStore();
    store.map.set(TOKENS_KEY, JSON.stringify(stored({ expiresAt: 0 })));
    const { http } = fakeHttp(() => ({ status: 400, body: { error: "invalid_grant" } }));
    const tokens = new AppTokens(store, http, () => 100_000);
    const expired = vi.fn();
    tokens.onExpired(expired);
    expect(await tokens.accessToken()).toBeNull();
    expect(expired).toHaveBeenCalledOnce();
    expect(store.map.has(TOKENS_KEY)).toBe(false);
  });

  test("an unreachable Keycloak keeps the tokens and says so", async () => {
    const store = memoryStore();
    store.map.set(TOKENS_KEY, JSON.stringify(stored({ expiresAt: 0 })));
    const tokens = new AppTokens(store, fakeHttp(() => Promise.reject(new Error("network down"))).http, () => 100_000);
    await expect(tokens.accessToken()).rejects.toMatchObject({ code: "unreachable" });
    const busy = new AppTokens(store, fakeHttp(() => ({ status: 503, body: null })).http, () => 100_000);
    await expect(busy.accessToken()).rejects.toMatchObject({ code: "unreachable" });
    expect(store.map.has(TOKENS_KEY)).toBe(true);
  });

  test("a damaged store reads as signed out", async () => {
    const store = memoryStore();
    store.map.set(TOKENS_KEY, "{not json");
    expect(await new AppTokens(store, fakeHttp(() => ({ status: 200, body: {} })).http).signedIn()).toBe(false);
  });

  test("sign-out forgets the tokens, revokes the offline token and ends Keycloak's session", async () => {
    const store = memoryStore();
    store.map.set(TOKENS_KEY, JSON.stringify(stored()));
    const { http, posts } = fakeHttp(() => ({ status: 200, body: null }));
    const tokens = new AppTokens(store, http);
    await tokens.signOut();
    expect(store.map.has(TOKENS_KEY)).toBe(false);
    expect(await tokens.signedIn()).toBe(false);
    expect(posts).toEqual([
      { url: ENDPOINTS.revocation_endpoint, fields: { client_id: APP_CLIENT_ID, token: "refresh-1", token_type_hint: "refresh_token" } },
      { url: ENDPOINTS.end_session_endpoint, fields: { client_id: APP_CLIENT_ID, id_token_hint: "id-1" } },
    ]);
  });

  test("sign-out offline still signs out here", async () => {
    const store = memoryStore();
    store.map.set(TOKENS_KEY, JSON.stringify(stored()));
    const tokens = new AppTokens(store, fakeHttp(() => Promise.reject(new Error("offline"))).http);
    await tokens.signOut();
    expect(store.map.has(TOKENS_KEY)).toBe(false);
  });

  test("a refresh without new refresh or ID tokens keeps the previous ones", () => {
    const next = tokenSetFrom({ access_token: "a2", expires_in: 60 }, ENDPOINTS, 0, stored());
    expect(next).toMatchObject({ accessToken: "a2", refreshToken: "refresh-1", idToken: "id-1", expiresAt: 60_000 });
    expect(() => tokenSetFrom({}, ENDPOINTS, 0)).toThrowError(/no access token/);
  });
});
