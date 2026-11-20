// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useStudioSessions } from "./use-studio-sessions";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Studio = ReturnType<typeof useStudioSessions>;
let studio: Studio;
function Probe() {
  studio = useStudioSessions();
  return null;
}

let root: Root;
let host: HTMLElement;
async function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<Probe />));
}

const asked = (id: string) => ({ id, title: id, messages: [{ role: "user", content: "?" }], mode: "strict", depth: "balanced", focus: null });
const blank = (id: string) => ({ id, title: id, messages: [], mode: "strict", depth: "balanced", focus: null });

describe("useStudioSessions (the hook's wiring)", () => {
  beforeEach(() => window.sessionStorage.clear());
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it("opens one new session after a question, and no second blank one on a double tap", async () => {
    window.sessionStorage.setItem("qbasair.studio.sessions", JSON.stringify({ sessions: [asked("studio-a")], activeId: "studio-a" }));
    await mount();
    expect(studio.sessions.map((s) => s.id)).toEqual(["studio-a"]);
    await act(async () => {
      studio.newSession();
      studio.newSession();
    });
    expect(studio.sessions).toHaveLength(2);
    expect(studio.activeId).toBe(studio.sessions[1].id);
  });

  it("restores the tabs with a single blank session and moves to it on «new»", async () => {
    window.sessionStorage.setItem(
      "qbasair.studio.sessions",
      JSON.stringify({ sessions: [blank("studio-b1"), asked("studio-a"), blank("studio-b2")], activeId: "studio-a" }),
    );
    await mount();
    expect(studio.sessions.map((s) => s.id)).toEqual(["studio-b1", "studio-a"]);
    await act(async () => studio.newSession());
    expect(studio.sessions).toHaveLength(2);
    expect(studio.activeId).toBe("studio-b1");
  });

  it("answers every turn from the Quran alone, in a session saved in the former explanatory reading too", async () => {
    const legacyAnswer = { status: "answered", mode: "tafssir", answer: "old", tafssir: { summary: "old" }, related_terms: [], searches: [], ayahs: [] };
    window.sessionStorage.setItem(
      "qbasair.studio.sessions",
      JSON.stringify({
        sessions: [{ ...asked("saved-1"), mode: "tafssir", messages: [{ role: "user", content: "?" }, { role: "assistant", content: "old", response: legacyAnswer }] }],
        activeId: "saved-1",
      }),
    );
    const bodies: Record<string, unknown>[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/research-agent")) {
        bodies.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ status: "answered", mode: "strict", answer: "new", related_terms: [], searches: [], ayahs: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      await mount();
      await act(async () => studio.submit("سؤال جديد", 1));
    } finally {
      vi.unstubAllGlobals();
    }
    expect(bodies).toHaveLength(1);
    expect(bodies[0].response_mode).toBe("strict");
    expect(bodies[0]).not.toHaveProperty("tafssir_depth");
    const messages = studio.sessions[0].messages;
    // The saved explanatory answer stays as it was; the new turn is a Quran-only answer.
    expect(messages[1].response?.mode).toBe("tafssir");
    expect(messages[3].response?.mode).toBe("strict");
  });

  it("takes an unanswered question back out of the thread, so asking it again doesn't show it twice", async () => {
    window.sessionStorage.setItem("qbasair.studio.sessions", JSON.stringify({ sessions: [blank("studio-c")], activeId: "studio-c" }));
    let fail = true;
    const asks: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).includes("/research-agent")) {
          asks.push(JSON.parse(String(init?.body)).messages);
          if (fail) return new Response(JSON.stringify({ detail: "down" }), { status: 503, headers: { "Content-Type": "application/json" } });
          return new Response(JSON.stringify({ status: "answered", mode: "strict", answer: "ok", related_terms: [], searches: [], ayahs: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
      }),
    );
    try {
      await mount();
      let answered: boolean | undefined;
      await act(async () => {
        answered = await studio.submit("ما البصائر؟", 1);
      });
      expect(answered).toBe(false);
      expect(studio.error).toBeTruthy();
      expect(studio.sessions[0].messages).toEqual([]);

      fail = false;
      await act(async () => {
        answered = await studio.submit("ما البصائر؟", 1);
      });
      expect(answered).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(asks[1]).toEqual([{ role: "user", content: "ما البصائر؟" }]);
    expect(studio.sessions[0].messages.map((m) => m.role)).toEqual(["user", "assistant"]);
  });
});
