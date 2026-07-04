/**
 * Evidence thread: when a Studio evidence citation ﴿n﴾ is clicked, a fine gold
 * line draws from the citation to the ayah it lands on in the reader — tying the
 * answer's evidence to its place in the muṣḥaf. Imperative on purpose (like
 * lib/fly-to-notebook.ts): a fire-and-forget SVG overlay, not React state.
 *
 * The target ayah renders asynchronously (the click triggers loadByAyah), so we
 * capture the source rect now and POLL for the reader's freshly-selected ayah,
 * then draw once it's on screen. Drawn on a fixed, viewport-space SVG so it can
 * span the studio panel and the reader regardless of their scroll containers.
 *
 * Guards:
 *  • Co-visibility — the reader and the studio panel only sit side-by-side above
 *    1000px (below that the workspace is single-surface), so there's nothing to
 *    connect; skip. The bloom on the target ayah still fires either way.
 *  • Reduced motion — no thread (transforms/draw collapse); the bloom remains.
 */

const COMPACT_MAX = 1000; // matches COMPACT_WORKSPACE — below this, single surface
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
  if (window.innerWidth <= COMPACT_MAX) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return;

  // Capture the citation's position immediately — the panel doesn't move on jump.
  const src = sourceEl.getBoundingClientRect();
  const x1 = src.left + src.width / 2;
  const y1 = src.top + src.height / 2;

  const startedAt = performance.now();
  const poll = () => {
    // Prefer the freshly-loaded target by id (both readers tag the selected
    // ayah with data-ayah-id), so a stale selection from the outgoing page —
    // which can linger for a frame while the new page loads — is never hit.
    // Fall back to whatever is selected only once the id match times out.
    const byId = document.querySelector<HTMLElement>(
      `.qb-ayah-tok.selected[data-ayah-id="${ayahId}"], .qb-glyph-sel[data-ayah-id="${ayahId}"]`,
    );
    const elapsed = performance.now() - startedAt;
    const target =
      byId ??
      (elapsed > POLL_BUDGET_MS * 0.6
        ? document.querySelector<HTMLElement>(".qb-ayah-tok.selected, .qb-glyph-sel")
        : null);
    if (target) {
      const t = target.getBoundingClientRect();
      const onScreen = t.width > 0 && t.bottom > 0 && t.top < window.innerHeight;
      if (onScreen) {
        drawThread(x1, y1, t.left + t.width / 2, t.top + t.height / 2, ayahId);
        return;
      }
    }
    if (performance.now() - startedAt < POLL_BUDGET_MS) requestAnimationFrame(poll);
  };
  window.setTimeout(() => requestAnimationFrame(poll), START_DELAY_MS);
}

function drawThread(x1: number, y1: number, x2: number, y2: number, ayahId: number): void {
  const NS = "http://www.w3.org/2000/svg";
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
      duration: 520,
      delay: 640,
      easing: "ease-out",
      fill: "forwards",
    });
    fade.onfinish = () => svg.remove();
  };
}
