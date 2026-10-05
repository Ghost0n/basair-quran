import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hide = vi.fn(async () => undefined);
let lifted = false;
const searchV2 = vi.fn(async () => ({}));
let durations: () => Promise<unknown>;
const getReciterDurations = vi.fn((..._args: unknown[]) => durations());
let runtime: Promise<unknown>;
let readerPage: Promise<unknown>;

vi.mock("@capacitor/splash-screen", () => ({ SplashScreen: { hide } }));
vi.mock("./runtime", () => ({ appRuntime: () => runtime }));
vi.mock("@/features/reading/mushaf-context", () => ({ lastReadPage: () => 42, warmQuranPage: () => readerPage }));
vi.mock("@/features/reading/use-mushaf-layout", () => ({ warmMushafPage: () => readerPage }));
vi.mock("@q-basair/api-client", () => ({
  createQBasairApiClient: () => ({ getNotebook: async () => [], getSessions: async () => [], searchV2, getReciterDurations }),
}));

const never = () => new Promise<never>(() => undefined);

const after = (ms: number) => vi.advanceTimersByTimeAsync(ms);

async function boot(onboarded: boolean) {
  vi.resetModules();
  const { bootApp } = await import("./boot");
  lifted = false;
  void bootApp({ onboarded }).then(() => {
    lifted = true;
  });
}

describe("app start-up", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    searchV2.mockClear();
    getReciterDurations.mockClear();
    durations = async () => ({ durations: [], complete: false });
    vi.stubGlobal("window", globalThis);
    runtime = Promise.resolve({});
    readerPage = Promise.resolve();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("lifts the splash once the first screen is ready, then warms search", async () => {
    await boot(true);
    await after(10);
    expect(lifted).toBe(true);
    await after(2000);
    expect(searchV2).toHaveBeenCalledWith("رحم", "root", 2, 10);
    await vi.waitFor(() => expect(hide).toHaveBeenCalledWith({ fadeOutDuration: 300 }));
  });

  it("does not wait more than ~3s on slow warm-ups", async () => {
    readerPage = never();
    await boot(true);
    await after(2900);
    expect(lifted).toBe(false);
    await after(200);
    expect(lifted).toBe(true);
  });

  it("waits longer for the databases, but never past the safety cap", async () => {
    runtime = never();
    await boot(true);
    await after(5000);
    expect(lifted).toBe(false);
    await after(3100);
    expect(lifted).toBe(true);
  });

  it("shows onboarding at once on a first launch, while the databases copy", async () => {
    runtime = never();
    await boot(false);
    await after(10);
    expect(lifted).toBe(true);
  });

  it("asks for the opening page's verse durations without waiting on them", async () => {
    readerPage = Promise.resolve({ found: true, surahs: [{ id: 2, name: "" }, { id: 3, name: "" }], ayahs: [] });
    durations = never;
    await boot(true);
    await after(10);
    expect(getReciterDurations).toHaveBeenCalledWith("alafasy", 2);
    expect(getReciterDurations).toHaveBeenCalledWith("alafasy", 3);
    expect(lifted).toBe(true);
  });
});
