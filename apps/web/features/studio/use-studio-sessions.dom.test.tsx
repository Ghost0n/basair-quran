// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
});
