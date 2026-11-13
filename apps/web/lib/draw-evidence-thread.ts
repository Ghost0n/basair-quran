import { WIDE_MIN } from "./bands";

/**
 * Evidence thread: when a Studio evidence citation ﴿n﴾ is clicked, a fine gold
 * line draws from the citation to the ayah it lands on in the reader — tying the
 * answer's evidence to its place in the muṣḥaf. Imperative on purpose: a
 * fire-and-forget SVG overlay, not React state.
 *
 * The target ayah renders asynchronously (the click triggers loadByAyah), so we
 * POLL for the reader's freshly-selected ayah — matched by data-ayah-id so a
 * stale selection from the outgoing page is never hit — then draw once it's on
 * screen, recapturing BOTH endpoints at that moment (the panel may have scrolled
 * during the wait). Drawn on a fixed, viewport-space SVG so it can span the
 * studio panel and the reader regardless of their scroll containers.
 *
 * Guards:
 *  • Co-visibility — the reader and the studio panel only sit side-by-side above
 *    the wide band (WIDE_MIN; below it the workspace is single-surface), so there's nothing to
 *    connect; skip. The bloom on the target ayah still fires either way.
 *  • Reduced motion — no thread (transforms/draw collapse); the bloom remains.
 */

const POLL_BUDGET_MS = 1500; // give the page load + settle time to render the ayah
const START_DELAY_MS = 420; // let the page arrive (and any travel wash reveal) first

function cssMs(name: string, fallback: number): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return fallback;
  return raw.endsWith("ms") ? n : n * 1000; // tokens are ms, but be tolerant of s
}

function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export function drawEvidenceThread(sourceEl: HTMLElement | null, ayahId: number): void {
  if (typeof window === "undefined" || !sourceEl) return;
  // Co-visibility: nothing to connect on a single-surface layout.
  if (window.innerWidth < WIDE_MIN) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return;

  const onScreen = (r: DOMRect) => r.width > 0 && r.bottom > 0 && r.top < window.innerHeight;
  const startedAt = performance.now();
  const poll = () => {
    // Match the freshly-loaded target strictly by id (both readers tag the
    // selected ayah with data-ayah-id). No unqualified fallback: a stale
    // ".selected" from the outgoing page (lingering while a slow load settles)
    // must never be drawn to — better no thread than a thread to the wrong ayah.
    const target = document.querySelector<HTMLElement>(
      `.qb-ayah-tok.selected[data-ayah-id="${ayahId}"], .qb-glyph-sel[data-ayah-id="${ayahId}"]`,
    );
    if (target) {
      const t = target.getBoundingClientRect();
      // Recapture the source now too — the panel may have scrolled during the
      // wait, so the click-time rect could be stale.
      const s = sourceEl.getBoundingClientRect();
      if (onScreen(t) && onScreen(s)) {
        drawThread(s.left + s.width / 2, s.top + s.height / 2, t.left + t.width / 2, t.top + t.height / 2, ayahId);
        return;
      }
    }
    if (performance.now() - startedAt < POLL_BUDGET_MS) requestAnimationFrame(poll);
  };
  window.setTimeout(() => requestAnimationFrame(poll), START_DELAY_MS);
}

function drawThread(x1: number, y1: number, x2: number, y2: number, ayahId: number): void {
  const NS = "http://www.w3.org/2000/svg";
  // One thread at a time — a rapid second citation click supersedes the first.
  document.querySelectorAll(".qb-evidence-thread").forEach((el) => el.remove());
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "qb-evidence-thread");
  svg.dataset.ayahId = String(ayahId);

  // A gentle bow toward the top so the line arcs rather than cutting straight —
  // deeper for wider spans, capped so it never balloons.
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2 - Math.min(140, Math.abs(x2 - x1) * 0.28 + 24);
  const path = document.createElementNS(NS, "path");
  path.setAttribute("class", "qb-evidence-thread-path");
  path.setAttribute("d", `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`);

  const dot = (cx: number, cy: number, cls: string) => {
    const c = document.createElementNS(NS, "circle");
    c.setAttribute("cx", String(cx));
    c.setAttribute("cy", String(cy));
    c.setAttribute("r", "3.5");
    c.setAttribute("class", cls);
    svg.appendChild(c);
  };

  svg.appendChild(path);
  document.body.appendChild(svg);

  const len = path.getTotalLength();
  const drawMs = cssMs("--motion-dur-thread", 420);
  const ease = cssVar("--motion-ease-travel", "cubic-bezier(0.65,0,0.35,1)");

  path.style.strokeDasharray = String(len);
  path.style.strokeDashoffset = String(len);

  const HOLD_MS = 640;
  const FADE_MS = 520;
  // Guaranteed removal even if a WAAPI callback never fires (tab backgrounded,
  // animation cancelled) — cleared when the normal chain completes.
  const hardStop = window.setTimeout(() => svg.remove(), drawMs + HOLD_MS + FADE_MS + 400);

  const draw = path.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], {
    duration: drawMs,
    easing: ease,
    fill: "forwards",
  });

  draw.onfinish = () => {
    // Seat both ends, hold a beat, then dissolve the whole thread.
    dot(x1, y1, "qb-evidence-thread-dot");
    dot(x2, y2, "qb-evidence-thread-dot target");
    const fade = svg.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: FADE_MS,
      delay: HOLD_MS,
      easing: "ease-out",
      fill: "forwards",
    });
    fade.onfinish = () => {
      window.clearTimeout(hardStop);
      svg.remove();
    };
  };
}
