"use client";

import { useMemo } from "react";

/**
 * An eight-fold geometric rosette (two interlaced squares per ring, rings
 * alternately turned by 22.5°, joined by sixteen rays), drawn line by line in
 * gold when it first shows. Pure SVG: every path has pathLength 1, and the
 * CSS animates its dash from 1 to 0 (site/landing.css, `.qb-girih`).
 */
export function GirihPattern({ className = "" }: { className?: string }) {
  const paths = useMemo(() => {
    const out: { d: string; ring: number }[] = [];
    const point = (radius: number, angle: number) => {
      const a = (angle * Math.PI) / 180;
      return `${(radius * Math.cos(a)).toFixed(2)} ${(radius * Math.sin(a)).toFixed(2)}`;
    };
    const square = (radius: number, turn: number) =>
      `M${[0, 90, 180, 270].map((angle) => point(radius, angle + turn)).join("L")}Z`;
    const radii = [64, 112, 172, 244, 328, 424];
    radii.forEach((radius, ring) => {
      const turn = ring % 2 ? 22.5 : 0;
      out.push({ d: square(radius, turn), ring });
      out.push({ d: square(radius, turn + 45), ring });
      // The ring's circle, a little inside the star's points.
      const r = radius * 0.78;
      out.push({ d: `M${r} 0A${r} ${r} 0 1 1 ${-r} 0A${r} ${r} 0 1 1 ${r} 0`, ring });
    });
    for (let ray = 0; ray < 16; ray += 1) {
      out.push({ d: `M${point(64, ray * 22.5)}L${point(470, ray * 22.5)}`, ring: radii.length });
    }
    return out;
  }, []);

  return (
    <svg className={`qb-girih ${className}`.trim()} viewBox="-480 -480 960 960" aria-hidden="true" focusable="false">
      {paths.map((path, index) => (
        <path key={index} d={path.d} pathLength={1} style={{ ["--ring" as string]: path.ring }} />
      ))}
    </svg>
  );
}
