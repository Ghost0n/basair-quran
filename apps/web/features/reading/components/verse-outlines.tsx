"use client";

import { useLayoutEffect, useRef } from "react";

import { blocks, outlinePath, rowsFromRects, separate } from "../verse-outline";

const SVG = "http://www.w3.org/2000/svg";
/** Drawing order: hover under focus under the recited verse. */
const KINDS = ["hover", "focus", "recite"] as const;
type Kind = (typeof KINDS)[number];

type Box = { left: number; right: number; top: number; bottom: number };
type Verse = { kind: Kind; rects: Box[]; bands: Map<number, { top: number; bottom: number }> };

function kindOf(element: Element): Kind {
  if (element.classList.contains("is-recite")) return "recite";
  if (element.classList.contains("is-hover")) return "hover";
  return "focus";
}

/**
 * The lit verses of one page (recited, «تظليل» focus, hover), drawn as one
 * outline each (features/reading/verse-outline.ts) on a layer behind the text.
 *
 * Place it as a child of the page: it reads the verse pieces the page marks
 * with `data-vf` (one per line fragment) and redraws when they change, when
 * the page resizes (a re-fit) and when fonts arrive. The pieces themselves
 * then carry no background of their own (tools.css).
 */
export function VerseOutlines() {
  const ref = useRef<SVGSVGElement>(null);

  useLayoutEffect(() => {
    const svg = ref.current;
    const host = svg?.parentElement;
    if (!svg || !host) return;
    let frame = 0;
    let lastKey = "";

    const draw = () => {
      frame = 0;
      const base = host.getBoundingClientRect();
      const pieces = Array.from(host.querySelectorAll<HTMLElement>("[data-vf]"));
      const verses = new Map<string, Verse>();
      for (const piece of pieces) {
        const kind = kindOf(piece);
        const id = `${kind}:${piece.dataset.vf}`;
        const verse: Verse = verses.get(id) ?? { kind, rects: [], bands: new Map() };
        // The line's own band (glyph pages have one element per printed line).
        const line = piece.closest<HTMLElement>(".qb-glyph-line")?.getBoundingClientRect();
        for (const box of Array.from(piece.getClientRects())) {
          const rect = { left: box.left - base.left, right: box.right - base.left, top: box.top - base.top, bottom: box.bottom - base.top };
          verse.rects.push(rect);
          if (line) verse.bands.set(verse.rects.length - 1, { top: line.top - base.top, bottom: line.bottom - base.top });
        }
        verses.set(id, verse);
      }
      const width = host.clientWidth;
      const drawn = Array.from(verses.values()).map((verse) => ({
        kind: verse.kind,
        rows: rowsFromRects(verse.rects, width, (rect) => verse.bands.get(verse.rects.indexOf(rect)) ?? rect),
      }));
      for (let i = 0; i < drawn.length; i++) for (let j = i + 1; j < drawn.length; j++) separate(drawn[i].rows, drawn[j].rows);
      const paths = drawn.map((verse) => ({
        kind: verse.kind,
        d: blocks(verse.rows).map(outlinePath).join(""),
      }));
      const key = `${width}|${paths.map((item) => `${item.kind}${item.d}`).join("|")}`;
      if (key === lastKey) return;
      lastKey = key;
      svg.replaceChildren();
      for (const kind of KINDS) {
        for (const item of paths) {
          if (item.kind !== kind || !item.d) continue;
          const group = document.createElementNS(SVG, "g");
          group.setAttribute("class", `is-${kind}`);
          const path = document.createElementNS(SVG, "path");
          path.setAttribute("d", item.d);
          group.appendChild(path);
          svg.appendChild(group);
        }
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };

    draw();
    const mutations = new MutationObserver(schedule);
    mutations.observe(host, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-vf", "class", "style"] });
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    resize?.observe(host);
    void document.fonts?.ready.then(schedule);
    document.fonts?.addEventListener?.("loadingdone", schedule);
    return () => {
      cancelAnimationFrame(frame);
      mutations.disconnect();
      resize?.disconnect();
      document.fonts?.removeEventListener?.("loadingdone", schedule);
    };
  }, []);

  return <svg ref={ref} className="qb-verse-outlines" aria-hidden="true" />;
}
