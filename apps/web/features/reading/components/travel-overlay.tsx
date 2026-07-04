"use client";

import { useEffect, useState } from "react";

import { useNumerals } from "@/lib/preferences-context";
import { useSequencer } from "@/features/shell/lib/run-sequence";

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
 * gold veil stays because opacity choreography is preserved by design. The
 * preference is read ONCE at mount (matchMedia inside the effect, not the
 * reactive hook) so a mid-flight OS toggle can't cancel and restart this
 * single-shot flourish — and so the effect runs exactly once per jump.
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
  const { run } = useSequencer();
  const [display, setDisplay] = useState(from);
  const [phase, setPhase] = useState<"in" | "out">("in");

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setDisplay(to);
      run("travel", [
        [0, () => setPhase("in")],
        [460, () => setPhase("out")],
        [260, onDone],
      ]);
      return;
    }

    // 14 uniform steps ≈ 650ms of counting; the CSS wash fades in alongside.
    const per = Math.round(SCRUB_MS / STEPS);
    const steps: [number, () => void][] = [];
    for (let i = 1; i <= STEPS; i += 1) {
      const value = i === STEPS ? to : Math.round(from + ((to - from) * i) / STEPS);
      steps.push([per, () => setDisplay(value)]);
    }
    steps.push([180, () => setPhase("out")]);
    steps.push([260, onDone]);
    run("travel", steps);
  }, [from, to, run, onDone]);

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
