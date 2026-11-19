// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PostBoardSnapshot } from "@q-basair/shared";

// The app's theme (the «السمة» switch), not the device's, decides the canvas colours.
let appTheme: "dark" | "light" = "dark";
vi.mock("@/features/shell/workspace-context", () => ({
  useWorkspace: () => ({ state: { theme: appTheme } }),
}));

import { BoardView } from "./board-view";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const snapshot: PostBoardSnapshot = {
  theme: { name: "الصبر", color: "gold" },
  board: {
    v: 1,
    nodes: [
      { id: "a1", type: "ayah", x: 0, y: 0, data: { ayah_id: 1 } },
      { id: "n1", type: "note", x: 320, y: 0, data: { text: "ملاحظة" } },
    ],
    edges: [{ id: "e1", source: "a1", target: "n1" }],
  },
  ayahs: { a1: { surah_id: 1, surah: "الفاتحة", ayah: 1, text: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ" } },
};

let root: Root;
let host: HTMLElement;
async function render() {
  host = document.createElement("div");
  host.style.width = "800px";
  host.style.height = "600px";
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<BoardView snapshot={snapshot} />));
}

describe("BoardView (React Flow canvas theme)", () => {
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it.each(["dark", "light"] as const)("forces the app's %s theme on the canvas, whatever the device's", async (theme) => {
    appTheme = theme;
    await render();
    const canvas = host.querySelector(".react-flow");
    expect(canvas).not.toBeNull();
    expect(canvas!.classList.contains(theme)).toBe(true);
    expect(canvas!.classList.contains(theme === "dark" ? "light" : "dark")).toBe(false);
  });
});
