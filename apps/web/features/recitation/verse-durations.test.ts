import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getReciterDurations } = vi.hoisted(() => ({ getReciterDurations: vi.fn() }));
vi.mock("@q-basair/api-client", () => ({ createQBasairApiClient: () => ({ getReciterDurations }) }));

import {
  knownDurations,
  mergeDurations,
  rememberDurations,
  resetVerseDurations,
  warmVerseDurations,
} from "./verse-durations";

// Al-Fatiha has 7 verses.
const FATIHA = [6.1, 5.2, 4.3, 3.4, 5.5, 4.6, 9.7];

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    items,
  };
}

describe("verse durations", () => {
  let storage: ReturnType<typeof memoryStorage>;

  beforeEach(() => {
    storage = memoryStorage();
    vi.stubGlobal("window", { localStorage: storage });
    resetVerseDurations();
    getReciterDurations.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("starts unknown, one slot per verse", () => {
    const list = knownDurations("alafasy", 1);
    expect(list).toHaveLength(7);
    expect(list.every(Number.isNaN)).toBe(true);
  });

  it("warms a surah from the server once, and the player starts from it", async () => {
    getReciterDurations.mockResolvedValue({ durations: FATIHA, complete: true });
    await Promise.all([warmVerseDurations("alafasy", 1), warmVerseDurations("alafasy", 1)]);
    expect(getReciterDurations).toHaveBeenCalledTimes(1);
    expect(knownDurations("alafasy", 1)).toEqual(FATIHA);
    await warmVerseDurations("alafasy", 1);
    expect(getReciterDurations).toHaveBeenCalledTimes(1);
  });

  it("keeps partial answers in memory only", async () => {
    getReciterDurations.mockResolvedValue({ durations: [6.1, null, 4.3], complete: false });
    await warmVerseDurations("alafasy", 1);
    const list = knownDurations("alafasy", 1);
    expect(list.slice(0, 3)).toEqual([6.1, Number.NaN, 4.3]);
    expect(storage.items.size).toBe(0);
  });

  it("keeps complete surahs on the device for the next launch", () => {
    mergeDurations("alafasy", 1, FATIHA);
    resetVerseDurations();
    expect(knownDurations("alafasy", 1)).toEqual(FATIHA);
  });

  it("remembers a surah the player measured itself", () => {
    rememberDurations("husary", 1, [...FATIHA.slice(0, 6), Number.NaN]);
    expect(storage.items.size).toBe(0);
    rememberDurations("husary", 1, FATIHA);
    resetVerseDurations();
    expect(knownDurations("husary", 1)).toEqual(FATIHA);
  });

  it("is quiet when the server can't be reached", async () => {
    getReciterDurations.mockRejectedValue(new Error("offline"));
    await expect(warmVerseDurations("alafasy", 1)).resolves.toBeUndefined();
    expect(knownDurations("alafasy", 1).every(Number.isNaN)).toBe(true);
  });

  it("works without device storage", () => {
    vi.stubGlobal("window", {});
    mergeDurations("alafasy", 1, FATIHA);
    expect(knownDurations("alafasy", 1)).toEqual(FATIHA);
  });
});
