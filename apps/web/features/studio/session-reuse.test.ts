import { describe, expect, it } from "vitest";

import { dropExtraBlanks, placeNewSession, putSession } from "./session-reuse";
import type { StudioSession } from "./use-studio-sessions";

function session(id: string, asked = false, extra: Partial<StudioSession> = {}): StudioSession {
  return {
    id: `studio-${id}`,
    title: id,
    messages: asked ? [{ role: "user", content: "?" }] : [],
    mode: "strict",
    focus: null,
    ...extra,
  };
}

describe("placeNewSession", () => {
  it("adds the new session when every open one holds a question", () => {
    const fresh = session("new");
    const result = placeNewSession([session("a", true), session("b", true)], fresh, "studio-a");
    expect(result.sessions.map((s) => s.id)).toEqual(["studio-a", "studio-b", "studio-new"]);
    expect(result.session.id).toBe("studio-new");
  });

  it("reuses a blank session instead of adding another", () => {
    const fresh = session("new");
    const result = placeNewSession([session("a", true), session("blank")], fresh, "studio-a");
    expect(result.sessions.map((s) => s.id)).toEqual(["studio-a", "studio-blank"]);
    expect(result.session.id).toBe("studio-blank");
  });

  it("gives the reused blank session the new session's settings", () => {
    const fresh = session("new", false, { focus: { surah: 1, ayah: 1 }, focusLabel: "Al-Fatiha 1" });
    const result = placeNewSession([session("blank", false, { mode: "strict" })], fresh, "studio-blank");
    expect(result.session).toMatchObject({ id: "studio-blank", focus: { surah: 1, ayah: 1 }, focusLabel: "Al-Fatiha 1" });
    expect(result.sessions).toHaveLength(1);
  });

  it("prefers the open blank session when there are several", () => {
    const result = placeNewSession([session("b1"), session("a", true), session("b2")], session("new"), "studio-b2");
    expect(result.session.id).toBe("studio-b2");
  });
});

describe("dropExtraBlanks", () => {
  it("keeps one blank session, the open one, among restored tabs", () => {
    const kept = dropExtraBlanks([session("b1"), session("a", true), session("b2")], "studio-b2");
    expect(kept.map((s) => s.id)).toEqual(["studio-a", "studio-b2"]);
  });

  it("keeps the first blank one when the open tab holds a question", () => {
    const kept = dropExtraBlanks([session("a", true), session("b1"), session("b2")], "studio-a");
    expect(kept.map((s) => s.id)).toEqual(["studio-a", "studio-b1"]);
  });
});

describe("a reopened saved session", () => {
  it("is never taken for a blank one, even when none of its messages came back", () => {
    const saved: StudioSession = { ...session("x"), id: "5f2c-saved" };
    const result = placeNewSession([saved], session("new"), "5f2c-saved");
    expect(result.sessions.map((s) => s.id)).toEqual(["5f2c-saved", "studio-new"]);
  });
});

describe("putSession", () => {
  it("replaces the tab with the same id, in place", () => {
    const fresh = session("b", false, { focusLabel: "Al-Baqarah 255" });
    const tabs = putSession([session("a", true), session("b")], fresh);
    expect(tabs.map((s) => s.id)).toEqual(["studio-a", "studio-b"]);
    expect(tabs[1].focusLabel).toBe("Al-Baqarah 255");
  });

  it("adds it when the tabs changed meanwhile (a restore landed), keeping them", () => {
    const tabs = putSession([session("r1", true), session("r2", true)], session("b"));
    expect(tabs.map((s) => s.id)).toEqual(["studio-r1", "studio-r2", "studio-b"]);
  });
});

describe("dropExtraBlanks, edge cases", () => {
  it("keeps exactly one session when every restored tab is blank", () => {
    expect(dropExtraBlanks([session("b1"), session("b2"), session("b3")], "studio-b3").map((s) => s.id)).toEqual(["studio-b3"]);
  });

  it("keeps the first blank one when the remembered tab is gone", () => {
    expect(dropExtraBlanks([session("a", true), session("b1"), session("b2")], "studio-gone").map((s) => s.id)).toEqual([
      "studio-a",
      "studio-b1",
    ]);
  });
});
