import { afterEach, describe, expect, test, vi } from "vitest";

/**
 * Capacitor's registerPlugin returns a Proxy that answers every property with
 * a native method — `then` included. A Promise resolved *with* that proxy
 * calls `proxy.then(resolve, reject)`, a native method no plugin has, so it
 * never settles: on the phone every Keychain read hung (the sign-in page stuck
 * on "checking the session", the reciters on "loading").
 */
function capacitorLikePlugin(methods: Record<string, (options: unknown) => Promise<unknown>>) {
  return new Proxy(
    {},
    {
      get(_, prop) {
        const name = String(prop);
        if (name in methods) return methods[name];
        // What Capacitor does for a method the native side lacks: the call's own
        // promise rejects, and the caller's callbacks are never called.
        return () => Promise.reject(new Error(`"QbAuth.${name}()" is not implemented on ios`));
      },
    },
  );
}

const keychain = new Map<string, string>();

vi.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: () => "ios" },
  CapacitorHttp: {},
  registerPlugin: () =>
    capacitorLikePlugin({
      secureGet: async (options) => ({ value: keychain.get((options as { key: string }).key) ?? null }),
      secureSet: async (options) => {
        const { key, value } = options as { key: string; value: string };
        keychain.set(key, value);
      },
      secureRemove: async (options) => {
        keychain.delete((options as { key: string }).key);
      },
    }),
}));

const withinOneSecond = <T>(pending: Promise<T>) =>
  Promise.race([pending, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("hung")), 1000))]);

describe("the device's secure store (QbAuth plugin)", () => {
  afterEach(() => keychain.clear());

  test("reads the Keychain without hanging on the plugin proxy", async () => {
    const { appTokens } = await import("./keycloak");
    await expect(withinOneSecond(appTokens().signedIn())).resolves.toBe(false);
  });

  test("a stored token set is read back", async () => {
    keychain.set(
      "qb.auth.oidc",
      JSON.stringify({
        endpoints: { issuer: "https://auth.example/realms/q", authorization_endpoint: "a", token_endpoint: "t" },
        accessToken: "access",
        refreshToken: "refresh",
        idToken: null,
        expiresAt: Date.now() + 3_600_000,
      }),
    );
    vi.resetModules();
    const { appTokens } = await import("./keycloak");
    await expect(withinOneSecond(appTokens().accessToken())).resolves.toBe("access");
  });
});
