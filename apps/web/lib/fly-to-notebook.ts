/**
 * Pin-to-notebook flourish: a ghost copy of the pinned card flies to the
 * notebook icon in the rail, which then pulses. Imperative on purpose — it's a
 * fire-and-forget overlay (like confetti), not React-managed state.
 *
 * Reduced motion: no ghost flight (the icon still pulses so the action is
 * confirmed) — matching the design's "transforms collapse, feedback remains".
 */
export function flyToNotebook(fromEl: HTMLElement | null, label?: string): void {
  if (typeof window === "undefined" || !fromEl) return;

  const target = document.querySelector<HTMLElement>("[data-rail-notebook]");
  if (target) {
    target.classList.remove("qb-notebook-pulse");
    // Force a reflow so the animation restarts on rapid re-pins.
    void target.offsetWidth;
    target.classList.add("qb-notebook-pulse");
    window.setTimeout(() => target.classList.remove("qb-notebook-pulse"), 560);
  }

  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !target) return;

  const from = fromEl.getBoundingClientRect();
  const to = target.getBoundingClientRect();

  const ghost = document.createElement("div");
  ghost.className = "qb-pin-ghost";
  ghost.textContent = label ? label.slice(0, 60) : "";
  ghost.style.left = `${from.left}px`;
  ghost.style.top = `${from.top}px`;
  ghost.style.setProperty("--fly-x", `${to.left + to.width / 2 - from.left}px`);
  ghost.style.setProperty("--fly-y", `${to.top + to.height / 2 - from.top}px`);
  document.body.appendChild(ghost);
  window.setTimeout(() => ghost.remove(), 700);
}
