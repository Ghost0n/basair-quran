import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readUxPrototype, setUxPrototype, UX_KEY } from "./ux-prototype";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

describe("phone prototype switch", () => {
  let storage: ReturnType<typeof memoryStorage>;
  let dataset: Record<string, string>;

  beforeEach(() => {
    storage = memoryStorage();
    dataset = {};
    vi.stubGlobal("window", { localStorage: storage });
    vi.stubGlobal("document", { documentElement: { dataset } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("is off until chosen", () => {
    expect(readUxPrototype()).toBe(false);
    expect(dataset.ux).toBeUndefined();
  });

  it("turns on and off for this device, and marks <html> for the CSS", () => {
    setUxPrototype(true);
    expect(storage.getItem(UX_KEY)).toBe("m2");
    expect(readUxPrototype()).toBe(true);
    expect(dataset.ux).toBe("m2");

    setUxPrototype(false);
    expect(storage.getItem(UX_KEY)).toBeNull();
    expect(readUxPrototype()).toBe(false);
    expect(dataset.ux).toBeUndefined();
  });

  it("ignores unknown stored values", () => {
    storage.setItem(UX_KEY, "m1");
    expect(readUxPrototype()).toBe(false);
  });
});
