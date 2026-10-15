import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadUntilReady } from "./retry";

describe("loadUntilReady", () => {
  let win: EventTarget;
  let doc: EventTarget & { visibilityState: string };

  beforeEach(() => {
    vi.useFakeTimers();
    win = Object.assign(new EventTarget(), {
      setTimeout: (fn: () => void, ms: number) => globalThis.setTimeout(fn, ms),
      clearTimeout: (id: number) => globalThis.clearTimeout(id),
    });
    doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
    vi.stubGlobal("window", win);
    vi.stubGlobal("document", doc);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("delivers the first successful load", async () => {
    const onReady = vi.fn();
    loadUntilReady(() => Promise.resolve(["reciter"]), onReady);
    await vi.runAllTimersAsync();
    expect(onReady).toHaveBeenCalledWith(["reciter"]);
  });

  it("retries a failed cold-start load with backoff until it arrives", async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("not ready"))
      .mockRejectedValueOnce(new Error("not ready"))
      .mockResolvedValue("catalogue");
    const onReady = vi.fn();
    loadUntilReady(load, onReady);
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(load).toHaveBeenCalledTimes(2);
    expect(onReady).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(load).toHaveBeenCalledTimes(3);
    expect(onReady).toHaveBeenCalledWith("catalogue");
  });

  it("retries at once when the connection returns", async () => {
    const load = vi.fn<() => Promise<string>>().mockRejectedValueOnce(new Error("offline")).mockResolvedValue("ok");
    const onReady = vi.fn();
    loadUntilReady(load, onReady);
    await vi.advanceTimersByTimeAsync(0);
    win.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);
    expect(onReady).toHaveBeenCalledWith("ok");
  });

  it("stops when cancelled", async () => {
    const load = vi.fn<() => Promise<string>>().mockRejectedValue(new Error("down"));
    const onReady = vi.fn();
    const cancel = loadUntilReady(load, onReady);
    await vi.advanceTimersByTimeAsync(0);
    cancel();
    await vi.advanceTimersByTimeAsync(60000);
    expect(load).toHaveBeenCalledTimes(1);
    expect(onReady).not.toHaveBeenCalled();
  });
});
