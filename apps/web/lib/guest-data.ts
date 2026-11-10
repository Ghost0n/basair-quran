/**
 * A guest's own data on the web stays in their browser.
 *
 * With accounts on, only a signed-in reader has a record on our server. A
 * guest's notebook, themes and boards, research sessions, followed roots,
 * research documents and preferences are answered in the browser by the same
 * device store the installed app uses (packages/offline-engine, `LocalStore`),
 * kept in IndexedDB — the guest handles their own data. Everything else
 * (the Quran, search, the Studio, the Community, accounts) goes to the server
 * as before. The server refuses the account data routes to a guest
 * (`401`, gate `account`): there is no shared guest record any more.
 *
 * Signing in uploads what the guest made here to the account (the app's own
 * account sync, `syncAccount`), then empties the browser store: from then on
 * the account holds it. The account's preferences stay the account's.
 *
 * Accounts off (a single-user server) and the installed app (its own device
 * router, lib/app-mode/fetch-router.ts) are unchanged.
 */
import type { LocalStore, StateStorage } from "@q-basair/offline-engine";

export type GuestSession = { authenticated: boolean; userId: number | null };

/** The account data routes, by their path after the API prefix. */
const ACCOUNT_DATA = /^\/(notebook|themes|documents|sessions|roots|user\/preferences)(\/|$)/;

type Json = Record<string, unknown>;

export type GuestDataOptions = {
  /** The real fetch (requests that are not a guest's own data go there). */
  nativeFetch: typeof fetch;
  /** The API's base URL, absolute (e.g. https://basair.app/api). */
  apiBase: string;
  /** Where the guest's data is kept. */
  storage: StateStorage;
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function readBody(input: RequestInfo | URL, init?: RequestInit): Promise<unknown> {
  const raw = init?.body ?? (input instanceof Request ? await input.clone().text() : undefined);
  if (raw === undefined || raw === null || raw === "" || typeof raw !== "string") return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function createGuestData({ nativeFetch, apiBase, storage }: GuestDataOptions) {
  const base = apiBase.replace(/\/$/, "");
  let session: Promise<GuestSession> | null = null;
  let store: Promise<LocalStore> | null = null;
  let uploading: Promise<number> | null = null;

  const call = (path: string, init: RequestInit = {}) =>
    nativeFetch(`${base}${path}`, { ...init, credentials: "include", headers: { Accept: "application/json", ...(init.headers ?? {}) } });

  function readSession(body: Json | null): GuestSession {
    const user = (body?.user ?? null) as { id?: number } | null;
    const authenticated = Boolean(body?.authenticated) && user?.id != null;
    return { authenticated, userId: authenticated ? Number(user?.id) : null };
  }

  /** Who is here: asked of the server once, then followed through the auth responses. */
  function currentSession(fresh = false): Promise<GuestSession> {
    if (!session || fresh) {
      session = call("/auth/session")
        .then(async (response) => (response.ok ? readSession((await response.json()) as Json) : { authenticated: false, userId: null }))
        .catch(() => ({ authenticated: false, userId: null }));
    }
    return session;
  }

  function guestStore(): Promise<LocalStore> {
    if (!store) {
      store = import("@q-basair/offline-engine").then(
        ({ LocalStore }) =>
          new LocalStore({
            storage,
            // Quoted ayahs in a research document are checked against the
            // server's text (the browser has no Quran database of its own).
            quran: {
              getAyahVerse: async (mushafId: number, surah: number, ayah: number) => {
                const response = await call(`/quran-page?mushaf=${mushafId}&surah=${surah}&ayah=${ayah}`);
                if (!response.ok) return null;
                const page = (await response.json()) as { found?: boolean; ayahs?: Json[] };
                const verse = page.found ? page.ayahs?.find((row) => row.surah_id === surah && row.ayah === ayah) : undefined;
                return verse
                  ? { ayah_id: verse.ayah_id, mushaf_id: mushafId, surah: verse.surah, surah_id: surah, ayah, text: verse.text, highlights: [] }
                  : null;
              },
            } as never,
          }),
      );
    }
    return store;
  }

  /** The API path (`/notebook`, `/auth/login`…) of a request to our API, else null. */
  function apiPath(input: RequestInfo | URL, origin: string): string | null {
    const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(href, origin);
    const root = new URL(`${base}/`, origin);
    if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname)) return null;
    return `/${url.pathname.slice(root.pathname.length)}`;
  }

  /** Follow sign-in and sign-out as they happen in this page. */
  async function observe(path: string, response: Response): Promise<void> {
    if (path === "/auth/logout") {
      session = Promise.resolve({ authenticated: false, userId: null });
      return;
    }
    if ((path === "/auth/login" || path === "/auth/signup" || path === "/auth/session") && response.ok) {
      const body = (await response.clone().json().catch(() => null)) as Json | null;
      session = Promise.resolve(readSession(body));
    }
  }

  async function guestFetch(input: RequestInfo | URL, init: RequestInit | undefined, origin: string): Promise<Response> {
    const path = apiPath(input, origin);
    if (path === null) return nativeFetch(input, init);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const pathname = path.split("?")[0];
    if (ACCOUNT_DATA.test(pathname) && !(await currentSession()).authenticated) {
      const { handleLocal } = await import("@q-basair/offline-engine");
      try {
        const answer = await handleLocal(await guestStore(), method, `/api${pathname}`, await readBody(input, init));
        // A route the browser store doesn't answer (e.g. publishing) needs an account.
        if (answer) return json(answer.status, answer.body);
      } catch (error) {
        console.error("guest data", error);
        return json(500, { detail: "internal error" });
      }
    }
    const response = await nativeFetch(input, init);
    await observe(pathname, response);
    return response;
  }

  /**
   * Signed in: move what the guest made in this browser to the account, then
   * empty the browser store. Returns how many items moved (0 when nothing to
   * move, or not signed in). Safe to call repeatedly; a failure keeps the data
   * here for the next try.
   */
  function upload(): Promise<number> {
    if (uploading) return uploading;
    uploading = (async () => {
      const who = await currentSession(true);
      if (!who.authenticated || who.userId === null) return 0;
      const local = await guestStore();
      const state = await local.snapshot();
      const count = state.notebook.length + state.themes.length + state.sessions.length + state.roots.length + state.documents.length;
      if (!count) {
        if (state.preferences) await local.replace((await import("@q-basair/offline-engine")).emptyState());
        return 0;
      }
      const { emptyState, syncAccount } = await import("@q-basair/offline-engine");
      // The account's preferences stay the account's.
      await local.exclusive(async (current) => {
        current.preferences = null;
      });
      await syncAccount(local, async (method, path, body) => {
        const response = await call(path.replace(/^\/api/, ""), {
          method,
          headers: body === undefined ? {} : { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const text = await response.text();
        return { status: response.status, body: text ? JSON.parse(text) : null };
      }, who.userId);
      await local.replace(emptyState());
      return count;
    })().finally(() => {
      uploading = null;
    });
    return uploading;
  }

  return { fetch: guestFetch, upload, currentSession };
}

// --- The browser's storage ------------------------------------------------------

const DB_NAME = "qbasair-guest";
const KEY = "userdata";

/** One JSON document in IndexedDB (in memory where IndexedDB is unavailable). */
export function browserStorage(): StateStorage {
  let memory: string | null = null;
  let db: Promise<IDBDatabase | null> | null = null;
  const open = () => {
    if (!db) {
      db = new Promise((resolve) => {
        try {
          const request = indexedDB.open(DB_NAME, 1);
          request.onupgradeneeded = () => request.result.createObjectStore("kv");
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      });
    }
    return db;
  };
  const run = <T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest): Promise<T | null> =>
    open().then(
      (database) =>
        new Promise((resolve) => {
          if (!database) return resolve(null);
          const request = action(database.transaction("kv", mode).objectStore("kv"));
          request.onsuccess = () => resolve(request.result as T);
          request.onerror = () => resolve(null);
        }),
    );
  return {
    async read() {
      const stored = await run<string | undefined>("readonly", (store) => store.get(KEY));
      return stored ?? memory;
    },
    async write(text) {
      memory = text;
      await run("readwrite", (store) => store.put(text, KEY));
    },
  };
}

// --- Installed for the web build with accounts on --------------------------------

let instance: ReturnType<typeof createGuestData> | null = null;

/** Answer a guest's own data in the browser (web build, accounts on). */
export function installGuestData(apiBase: string): void {
  if (instance || typeof window === "undefined") return;
  const nativeFetch = window.fetch.bind(window);
  instance = createGuestData({ nativeFetch, apiBase: new URL(apiBase, window.location.href).href, storage: browserStorage() });
  const guest = instance;
  window.fetch = (input, init) => guest.fetch(input, init, window.location.href);
  // A sign-in that came back through a redirect (Keycloak) uploads here.
  void guest.upload().then((moved) => {
    if (moved) window.dispatchEvent(new CustomEvent("qb:data-synced"));
  }).catch(() => undefined);
}

/** After signing in: move the guest's data to the account (no-op elsewhere). */
export function uploadGuestData(): Promise<number> {
  return instance ? instance.upload().catch(() => 0) : Promise.resolve(0);
}
