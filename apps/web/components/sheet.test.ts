import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SheetFrame } from "./sheet";

describe("SheetFrame", () => {
  it("draws the bottom sheet the reader's sheets use, named for assistive tech", () => {
    const html = renderToStaticMarkup(
      createElement(SheetFrame, { label: "العرض", onClose: () => {}, panelRef: null }, createElement("p", null, "x")),
    );
    expect(html).toMatch(/^<div class="qb-rsheet qb-sheet" role="dialog" aria-modal="true" aria-label="العرض">/);
    expect(html).toContain('<div class="backdrop" aria-hidden="true"></div><div class="panel" tabindex="-1"><div class="grip" aria-hidden="true"></div>');
    expect(html).toContain("<h2>العرض</h2>");
    expect(html).toContain('<div class="body"><p>x</p></div>');
  });

  it("marks a tall sheet", () => {
    const html = renderToStaticMarkup(
      createElement(SheetFrame, { label: "x", onClose: () => {}, panelRef: null, size: "tall", className: "is-menu" }),
    );
    expect(html).toContain('class="qb-rsheet qb-sheet is-tall is-menu"');
  });
});
