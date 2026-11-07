// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { clickDockItem, dockKey, nativeDockPayload, readReaderDock } from "./native-dock";

const icon = (d: string, flip = false) =>
  `<span class="qb-icon${flip ? " dir-flip" : ""}"><svg viewBox="0 0 24 24"><path d="${d}"></path></svg></span>`;

function mountTools(options: { backHome?: boolean; displayOpen?: boolean } = {}) {
  document.body.innerHTML = `
    <div class="qb-reader-head is-dock">
      <div class="qb-reader-bar qb-reader-dock">
        <div class="actions">
          <button class="act labelled surah-btn" aria-label="الفاتحة — انتقل">${icon("M4 6h16")}<span class="lbl">الفاتحة</span></button>
          <span class="qb-tool-lock"><div class="qb-toolbox-compact">
            <button class="act labelled on-tool is-idle" aria-expanded="false" aria-label="الأداة: قراءة">${icon("M5 4h14")}<span class="lbl">قراءة</span></button>
          </div></span>
          <button class="act labelled display-btn${options.displayOpen ? " on" : ""}" aria-expanded="${Boolean(options.displayOpen)}" aria-label="العرض">${icon("M3 18l5-12")}<span class="lbl">العرض</span></button>
          <button class="act labelled play-btn" aria-label="تلاوة الصفحة">${icon("M8 5v14l11-7z")}<span class="lbl">تلاوة</span></button>
        </div>
      </div>
    </div>
    <button class="qb-reader-back${options.backHome ? " is-home" : ""}" aria-label="${options.backHome ? "الرئيسية" : "رجوع"}">${
      options.backHome ? '<span class="qb-brand"><svg></svg></span>' : icon("M5 12h14", true)
    }</button>`;
}

function mountRecite(options: { disabledNext?: boolean; customised?: boolean } = {}) {
  document.body.innerHTML = `
    <div class="qb-reader-head is-dock">
      <div class="qb-reader-bar qb-reader-dock is-reciting">
        <div class="actions recite">
          <span class="flank start"></span>
          <div class="qb-ptransport">
            <button class="nav" aria-label="الآية السابقة">${icon("M9 6l6 6-6 6", true)}</button>
            <button class="play" aria-label="إيقاف">${icon("M7 5v14M17 5v14")}</button>
            <button class="nav" ${options.disabledNext ? "disabled" : ""} aria-label="الآية التالية">${icon("M15 6l-6 6 6 6", true)}</button>
          </div>
          <span class="flank end">
            <button class="round reciter-btn" aria-label="إعدادات التلاوة">${icon("M4 6h16")}${options.customised ? '<span class="dot"></span>' : ""}</button>
          </span>
        </div>
      </div>
    </div>
    <button class="qb-reader-back" aria-label="رجوع">${icon("M5 12h14", true)}</button>`;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("readReaderDock", () => {
  it("is absent when the reader's dock is not on the page", () => {
    expect(readReaderDock(document, "rtl")).toBeNull();
  });

  it("reads the toolbox: each button's label, icon and state, in the page's order", () => {
    mountTools({ backHome: true, displayOpen: true });
    const dock = readReaderDock(document, "rtl")!;
    expect(dock.view).toBe("tools");
    expect(dock.items.map((item) => item.label)).toEqual(["الفاتحة", "قراءة", "العرض", "تلاوة"]);
    expect(dock.items[0].glyph).toEqual({ kind: "icon", d: "M4 6h16" });
    expect(dock.items.map((item) => item.on)).toEqual([false, false, true, false]);
    expect(dock.items.every((item) => !item.prominent)).toBe(true);
  });

  it("gives the round button the logo when it leads Home, an arrow otherwise", () => {
    mountTools({ backHome: true });
    expect(readReaderDock(document, "rtl")!.lead).toMatchObject({ title: "الرئيسية", glyph: { kind: "brand" } });
    mountTools({ backHome: false });
    expect(readReaderDock(document, "rtl")!.lead).toMatchObject({ title: "رجوع", glyph: { kind: "icon", d: "M5 12h14" } });
  });

  it("reads the recitation's controls: play stands out, a disabled one stays disabled, a changed setting shows its dot", () => {
    mountRecite({ disabledNext: true, customised: true });
    const dock = readReaderDock(document, "ltr")!;
    expect(dock.view).toBe("recite");
    expect(dock.items.map((item) => item.title)).toEqual(["الآية السابقة", "إيقاف", "الآية التالية", "إعدادات التلاوة"]);
    expect(dock.items.map((item) => item.prominent)).toEqual([false, true, false, false]);
    expect(dock.items[2].disabled).toBe(true);
    expect(dock.items[3].badge).toBe(true);
  });

  it("mirrors the directional icons where the page mirrors them (left-to-right only)", () => {
    mountRecite();
    expect(readReaderDock(document, "ltr")!.items[0].flip).toBe(true);
    expect(readReaderDock(document, "rtl")!.items[0].flip).toBe(false);
  });
});

describe("clickDockItem", () => {
  it("presses the page's own button for a native tap, the round one included", () => {
    mountTools({ backHome: true });
    const display = document.querySelector<HTMLButtonElement>(".display-btn")!;
    const back = document.querySelector<HTMLButtonElement>(".qb-reader-back")!;
    const onDisplay = vi.fn();
    const onBack = vi.fn();
    display.addEventListener("click", onDisplay);
    back.addEventListener("click", onBack);
    const key = readReaderDock(document, "rtl")!.items[2].key;
    clickDockItem(document, key);
    clickDockItem(document, "lead");
    expect(onDisplay).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe("dockKey and nativeDockPayload", () => {
  it("changes only when what the dock shows changes", () => {
    mountTools();
    const first = dockKey(readReaderDock(document, "rtl")!);
    mountTools();
    expect(dockKey(readReaderDock(document, "rtl")!)).toBe(first);
    mountTools({ displayOpen: true });
    expect(dockKey(readReaderDock(document, "rtl")!)).not.toBe(first);
  });

  it("draws each icon for the plugin (the logo in the gold tint, the rest as templates)", () => {
    mountTools({ backHome: true });
    const render = vi.fn((glyph: { kind: string }) => `data:${glyph.kind}`);
    const payload = nativeDockPayload(readReaderDock(document, "rtl")!, "#d4af37", render);
    expect(payload.lead).toMatchObject({ image: "data:brand", original: true });
    expect(payload.items[0]).toMatchObject({ key: "0", title: "الفاتحة", image: "data:icon" });
    expect(render).toHaveBeenCalledWith({ kind: "brand" }, expect.objectContaining({ color: "#d4af37" }));
  });
});
