/**
 * Auto-fit: controls adapt to the width their text actually needs.
 *
 * Translated labels vary a lot in length («عرض» / "Anzeige" / "Mwonekano"), so
 * fixed breakpoints can't decide when a bar has room for its labels. An element
 * marked `data-autofit="N"` is measured instead: it starts at `data-fit="0"`
 * (the full layout) and steps up one level at a time while its content
 * overflows, up to level N. CSS decides what each level means — hide an active
 * tool's label, then button labels, then secondary text, or let a tab track
 * scroll. Levels are re-evaluated whenever the element or its container
 * resizes, its text changes, or web fonts finish loading, so switching the
 * interface language re-fits everything.
 *
 * "Overflowing" means: the element's content is wider than its box, or any
 * descendant marked `data-fit-watch` is (e.g. a surah name that would get an
 * ellipsis). Such descendants must clip (`overflow: hidden` / `clip`) so their
 * scroll width can be measured.
 */

const SELECTOR = "[data-autofit]";

export function isOverflowing(element: HTMLElement): boolean {
  if (element.scrollWidth > element.clientWidth + 1) return true;
  for (const watched of element.querySelectorAll<HTMLElement>("[data-fit-watch]")) {
    if (watched.getClientRects().length && watched.scrollWidth > watched.clientWidth + 1) return true;
  }
  return false;
}

/** Lowest level (0…max) at which the element no longer overflows. */
export function fitElement(element: HTMLElement): number {
  const max = Number.parseInt(element.dataset.autofit ?? "0", 10) || 0;
  let level = 0;
  element.dataset.fit = "0";
  while (level < max && isOverflowing(element)) {
    level += 1;
    element.dataset.fit = String(level);
  }
  if (element.scrollWidth > element.clientWidth + 1) revealActive(element);
  return level;
}

const ACTIVE = ':scope > [aria-selected="true"], :scope > [aria-checked="true"], :scope > [aria-pressed="true"], :scope > .active, :scope > .on';

/** A scrolling track keeps its selected item in view (works in both directions). */
function revealActive(element: HTMLElement) {
  const active = element.querySelector<HTMLElement>(ACTIVE);
  if (!active) return;
  const box = element.getBoundingClientRect();
  const item = active.getBoundingClientRect();
  const margin = 24;
  if (item.left < box.left + margin) element.scrollLeft -= box.left + margin - item.left;
  else if (item.right > box.right - margin) element.scrollLeft += item.right - (box.right - margin);
}

/**
 * Watches the document for `[data-autofit]` elements (they come and go with
 * screens and sheets) and keeps each one fitted. Returns a stop function.
 */
export function startAutoFit(root: HTMLElement = document.body): () => void {
  const tracked = new Set<HTMLElement>();
  const pending = new Set<HTMLElement>();
  let frame = 0;

  const flush = () => {
    frame = 0;
    for (const element of pending) if (element.isConnected) fitElement(element);
    pending.clear();
  };
  const schedule = (element: HTMLElement) => {
    pending.add(element);
    if (!frame) frame = requestAnimationFrame(flush);
  };

  const resize = new ResizeObserver((entries) => {
    for (const entry of entries) {
      for (const element of tracked) {
        if (element === entry.target || element.parentElement === entry.target) schedule(element);
      }
    }
  });

  const track = (element: HTMLElement) => {
    if (tracked.has(element)) return;
    tracked.add(element);
    resize.observe(element);
    // A shrink-wrapped track only resizes with its content; watch its container too.
    if (element.parentElement) resize.observe(element.parentElement);
    fitElement(element);
  };
  const untrack = (element: HTMLElement) => {
    if (!tracked.delete(element)) return;
    resize.unobserve(element);
  };

  const scan = (node: ParentNode) => {
    if (node instanceof HTMLElement && node.matches(SELECTOR)) track(node);
    node.querySelectorAll?.<HTMLElement>(SELECTOR).forEach(track);
  };

  const mutations = new MutationObserver((records) => {
    for (const record of records) {
      record.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) scan(node);
      });
      record.removedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        if (node.matches(SELECTOR)) untrack(node);
        node.querySelectorAll<HTMLElement>(SELECTOR).forEach(untrack);
      });
      // Text changed inside a fitted element (page turn, count update, language).
      const target = record.target instanceof HTMLElement ? record.target : record.target.parentElement;
      const owner = target?.closest<HTMLElement>(SELECTOR);
      if (owner && tracked.has(owner)) schedule(owner);
    }
  });

  scan(root);
  mutations.observe(root, { childList: true, subtree: true, characterData: true });
  const refitAll = () => tracked.forEach(schedule);
  void document.fonts?.ready.then(refitAll);
  document.fonts?.addEventListener?.("loadingdone", refitAll);

  return () => {
    mutations.disconnect();
    resize.disconnect();
    document.fonts?.removeEventListener?.("loadingdone", refitAll);
    if (frame) cancelAnimationFrame(frame);
    tracked.clear();
    pending.clear();
  };
}
