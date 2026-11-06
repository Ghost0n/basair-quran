import { describe, expect, it } from "vitest";

import { dropExtraBlanks, placeNewSession } from "./session-reuse";
import type { StudioSession } from "./use-studio-sessions";

function session(id: string, asked = false, extra: Partial<StudioSession> = {}): StudioSession {
  return {
    id,
    title: id,
    messages: asked ? [{ role: "user", content: "?" }] : [],
    mode: "strict",
    depth: "balanced",
    focus: null,
    ...extra,
  };
}

describe("placeNewSession", () => {
  it("adds the new session when every open one holds a question", () => {
    const fresh = session("new");
    const result = placeNewSession([session("a", true), session("b", true)], fresh, "a");
    expect(result.sessions.map((s) => s.id)).toEqual(["a", "b", "new"]);
    expect(result.session.id).toBe("new");
  });

  it("reuses a blank session instead of adding another", () => {
    const fresh = session("new");
    const result = placeNewSession([session("a", true), session("blank")], fresh, "a");
    expect(result.sessions.map((s) => s.id)).toEqual(["a", "blank"]);
    expect(result.session.id).toBe("blank");
  });

  it("gives the reused blank session the new session's settings", () => {
    const fresh = session("new", false, { mode: "tafssir", focusLabel: "Al-Fatiha 1" });
    const result = placeNewSession([session("blank", false, { mode: "strict" })], fresh, "blank");
    expect(result.session).toMatchObject({ id: "blank", mode: "tafssir", focusLabel: "Al-Fatiha 1" });
    expect(result.sessions).toHaveLength(1);
  });

  it("prefers the open blank session when there are several", () => {
    const result = placeNewSession([session("b1"), session("a", true), session("b2")], session("new"), "b2");
    expect(result.session.id).toBe("b2");
  });
});

describe("dropExtraBlanks", () => {
  it("keeps one blank session, the open one, among restored tabs", () => {
    const kept = dropExtraBlanks([session("b1"), session("a", true), session("b2")], "b2");
    expect(kept.map((s) => s.id)).toEqual(["a", "b2"]);
  });

  it("keeps the first blank one when the open tab holds a question", () => {
    const kept = dropExtraBlanks([session("a", true), session("b1"), session("b2")], "a");
    expect(kept.map((s) => s.id)).toEqual(["a", "b1"]);
  });
});
