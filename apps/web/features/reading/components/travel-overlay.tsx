"use client";

import { useEffect, useState } from "react";

import { useNumerals } from "@/lib/preferences-context";
import { useReducedMotion, useSequencer } from "@/features/shell/lib/run-sequence";

const STEPS = 14; // the design's ~14-step page-counter scrub
const SCRUB_MS = 650;

/**
 * TravelOverlay — the long-jump flourish. When a load lands far from where the
 * reader was (see mushaf-context `travel`), a soft gold wash blooms over the
 * page and a mono page-counter scrubs from the old page toward the new one —
 * "you traveled across the muṣḥaf" made legible — then fades to reveal the
 * settled page (whose target ayah blooms via the existing qbBloom). Mounted keyed
 * by the jump id, so each far jump is a fresh, self-clearing overlay.
 *
 * Reduced motion (JS-driven, so decided here not via CSS): no digit scrub — the
 * wash fades in on the destination page number and out again. Opacity only; the
 * gold veil stays because opacity choreography is preserved by design.
 */
export function TravelOverlay({
  from,
  to,
  onDone,
}: {
  from: number;
  to: number;
  onDone: () => void;
}) {
  const formatNumber = useNumerals();
  const reduced = useReducedMotion();
  const { run } = useSequencer();
  const [display, setDisplay] = useState(from);
  const [phase, setPhase] = useState<"in" | "out">("in");

  useEffect(() => {
    if (reduced) {
      setDisplay(to);
      run("travel", [
        [0, () => setPhase("in")],
        [420, () => setPhase("out")],
        [260, onDone],
      ]);
      return;
    }

    const per = Math.round(SCRUB_MS / STEPS);
    const steps: [number, () => void][] = [];
    for (let i = 1; i <= STEPS; i += 1) {
      const value = i === STEPS ? to : Math.round(from + ((to - from) * i) / STEPS);
      // Small lead-in before the count starts so the wash reads first.
      steps.push([i === 1 ? 200 : per, () => setDisplay(value)]);
    }
    steps.push([180, () => setPhase("out")]);
    steps.push([260, onDone]);
    run("travel", steps);
  }, [from, to, reduced, run, onDone]);

  return (
    <div className={`qb-travel ${phase}`} aria-hidden>
      <div className="qb-travel-counter" dir="rtl">
        <span className="k">الصفحة</span>
        <span className="n" dir="ltr">
          {formatNumber(display)}
        </span>
      </div>
    </div>
  );
}
