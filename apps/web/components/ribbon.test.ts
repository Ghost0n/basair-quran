import { readFileSync } from "node:fs";
import path from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MiniRibbon, Ribbon, ribbonHeights } from "./ribbon";

const counts114 = (fill: (i: number) => number) => Array.from({ length: 114 }, (_, i) => fill(i));

describe("ribbonHeights", () => {
  it("scales by the square root of the share of the peak, with a floor for empty surahs", () => {
    const h = ribbonHeights([0, 4, 16]);
    expect(h[0]).toBeCloseTo(0.05);
    expect(h[1]).toBeCloseTo(0.12 + 0.88 * 0.5);
    expect(h[2]).toBeCloseTo(1);
  });

  it("draws a flat ribbon for yes/no data", () => {
    expect(ribbonHeights([0, 3], { flat: true })).toEqual([0.32, 1]);
  });

  it("never divides by zero", () => {
    expect(ribbonHeights([0, 0])).toEqual([0.05, 0.05]);
  });
});

describe("<Ribbon>", () => {
  it("keeps surah order independent of dir", () => {
    const html = renderToStaticMarkup(
      createElement("div", { dir: "ltr" }, createElement(Ribbon, { counts: counts114((i) => i % 3), label: "x" })),
    );
    expect(html.match(/data-i="(\d+)"/)?.[1]).toBe("0");
    expect(html).toContain("qb-ribbon");
    const css = readFileSync(path.join(__dirname, "ribbon.web.css"), "utf8");
    expect(css).toMatch(/\.qb-ribbon\s*\{[^}]*direction:\s*rtl/);
  });

  it("formats readout with the numerals helper", () => {
    const html = renderToStaticMarkup(
      createElement(Ribbon, { counts: counts114(() => 1), label: "x", here: 44, readout: (i: number) => `n${i}` }),
    );
    expect(html).toContain("n44");
    expect(html).toMatch(/data-i="44"[^>]*class="[^"]*\bhere\b|class="[^"]*\bhere\b[^"]*"[^>]*data-i="44"/);
  });

  it("has 114 bars and an accessible label", () => {
    const html = renderToStaticMarkup(createElement(Ribbon, { counts: counts114(() => 0), label: "انتشار الجذر" }));
    expect(html.match(/data-i="/g)?.length).toBe(114);
    expect(html).toContain('aria-label="انتشار الجذر"');
  });
});

describe("<MiniRibbon>", () => {
  it("draws one mark per surah", () => {
    const html = renderToStaticMarkup(createElement(MiniRibbon, { counts: counts114((i) => (i < 2 ? 3 : 0)) }));
    expect(html.match(/<i /g)?.length).toBe(114);
  });
});
