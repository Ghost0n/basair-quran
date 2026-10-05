import { describe, expect, it } from "vitest";

import { createQBasairApiClient } from "@q-basair/api-client";

/** A fetch stub answering after a tick, counting the calls it receives. */
function slowFetch(payload: unknown) {
  const calls: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${String(input)}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
    return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe("in-flight GET sharing", () => {
  it("answers concurrent identical GETs with one request, across client instances", async () => {
    const { calls, fetchImpl } = slowFetch([{ id: 1, name: "الفاتحة" }]);
    const reader = createQBasairApiClient({ baseUrl: "http://api.test/api", fetchImpl });
    const recitation = createQBasairApiClient({ baseUrl: "http://api.test/api", fetchImpl });
    const [a, b] = await Promise.all([reader.getSurahs(2), recitation.getSurahs(2)]);
    expect(calls).toHaveLength(1);
    expect(a).toEqual(b);
    // Each caller owns its copy.
    expect(a).not.toBe(b);
  });

  it("keeps nothing once the request has settled", async () => {
    const { calls, fetchImpl } = slowFetch([]);
    const client = createQBasairApiClient({ baseUrl: "http://api.test/api", fetchImpl });
    await client.getSurahs(2);
    await client.getSurahs(2);
    expect(calls).toHaveLength(2);
  });

  it("never merges writes or different URLs", async () => {
    const { calls, fetchImpl } = slowFetch({});
    const client = createQBasairApiClient({ baseUrl: "http://api.test/api", fetchImpl });
    await Promise.all([client.getSurahs(1), client.getSurahs(2)]);
    expect(calls).toHaveLength(2);
    calls.length = 0;
    await Promise.all([client.updatePreferences({ font_size: 30 }), client.updatePreferences({ font_size: 30 })]);
    expect(calls).toHaveLength(2);
  });
});

describe("global fetch resolution", () => {
  it("uses the fetch installed after the client was created (the app's device router)", async () => {
    const original = globalThis.fetch;
    const client = createQBasairApiClient({ baseUrl: "http://api.test/api" });
    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    try {
      await client.getSurahs(1);
      expect(calls).toHaveLength(1);
    } finally {
      globalThis.fetch = original;
    }
  });
});
