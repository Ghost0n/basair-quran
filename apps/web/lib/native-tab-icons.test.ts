import { describe, expect, it } from "vitest";

import { nativeTabsPayload, type GlyphRender } from "./native-tab-icons";

const TABS = [
  { id: "home", title: "Home", symbol: "house", glyph: { kind: "brand" as const } },
  { id: "notebook", title: "Notebook", symbol: "note.text", glyph: { kind: "icon" as const, d: "M4 4h16v16H4z" } },
  { id: "plain", title: "Plain", symbol: "circle" },
];

describe("nativeTabsPayload", () => {
  it("sends the app's own icons: line icons tinted by the bar, the logo in its gold", () => {
    const calls: Parameters<GlyphRender>[] = [];
    const render: GlyphRender = (...args) => {
      calls.push(args);
      return `data:image/png;base64,${calls.length}`;
    };
    const payload = nativeTabsPayload(TABS, "#a4812a", render);
    expect(payload[0]).toMatchObject({ id: "home", symbol: "house", original: true, image: expect.any(String) });
    expect(payload[1]).toMatchObject({ id: "notebook", original: false, image: expect.any(String), selectedImage: expect.any(String) });
    expect(payload[1].image).not.toBe(payload[1].selectedImage);
    expect(payload[2]).toEqual({ id: "plain", title: "Plain", symbol: "circle" });
    // The logo is drawn in the gold the bar is tinted with.
    expect(calls.find(([glyph]) => glyph.kind === "brand")?.[1].color).toBe("#a4812a");
    // Nothing of the glyph itself crosses to the native side.
    expect(payload.every((tab) => !("glyph" in tab))).toBe(true);
  });

  it("falls back to the system symbol when the icon cannot be drawn", () => {
    const payload = nativeTabsPayload(TABS, "#a4812a", () => null);
    expect(payload.map((tab) => "image" in tab)).toEqual([false, false, false]);
    expect(payload.map((tab) => tab.symbol)).toEqual(["house", "note.text", "circle"]);
  });
});
