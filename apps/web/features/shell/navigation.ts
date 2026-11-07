/**
 * Screen-to-screen navigation on top of the router: the transition that
 * carries it (View Transitions, directional) and the app's own back stack —
 * the screens visited in this session, mirrored from the URL — so «back»
 * (the reader's arrow, the edge swipe) returns where the reader came from,
 * and never leaves the app.
 */

/** How the next screen arrives: into the reader, out of it, back, or a plain cross-fade. */
export type NavMotion = "reader-in" | "reader-out" | "back" | "fade";

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void | Promise<void>) => { finished: Promise<void> };
};

// ---------- Settling: the new screen is in the DOM ----------

let waiters: (() => void)[] = [];

/** Called once the URL change has rendered (useShellMode's effect). */
export function notifyNavigationSettled(): void {
  const pending = waiters;
  waiters = [];
  for (const resolve of pending) resolve();
}

function settled(timeoutMs = 450): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, timeoutMs);
    waiters.push(() => {
      window.clearTimeout(timer);
      // A task later, the screen's own effects have run. (Not a frame: rendering
      // is paused while a view transition waits for its update.)
      window.setTimeout(resolve, 0);
    });
  });
}

/**
 * How a screen change shows. A phone's pages each fill the screen: the old
 * page cross-fades into the new one in a view transition while the shell
 * (bars, rail, search field) holds still (shell.web.css). A wider web screen
 * keeps the Mushaf mounted beside its pages, so a whole-window fade would
 * blink it: there only the page that appears arrives (its own short entrance,
 * shell.web.css), as it does wherever view transitions are missing. The
 * classic design keeps its whole-window transition. Reduced motion: at once.
 */
export function screenChange(state: { viewTransitions: boolean; reduceMotion: boolean; web: boolean; phone: boolean }): "cross-fade" | "arrive" | "instant" {
  if (state.reduceMotion) return "instant";
  if (!state.viewTransitions) return "arrive";
  if (state.web && !state.phone) return "arrive";
  return "cross-fade";
}

/**
 * Run a navigation inside a view transition when the screen change calls
 * for one (screenChange); `html[data-nav]` names the motion for the CSS
 * (app/motion.css), so entering the reader can split the tab bar into the
 * back button and the reader's dock.
 */
export function transition(navigate: () => void, motion: NavMotion = "fade"): void {
  const doc = typeof document === "undefined" ? null : (document as ViewTransitionDocument);
  const change = doc
    ? screenChange({
        viewTransitions: typeof doc.startViewTransition === "function",
        reduceMotion: Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches),
        web: isWebDesign(),
        phone: Boolean(window.matchMedia?.("(max-width: 768px)").matches),
      })
    : "instant";
  if (!doc || change !== "cross-fade" || typeof doc.startViewTransition !== "function") {
    navigate();
    return;
  }
  const root = doc.documentElement;
  root.dataset.nav = motion;
  try {
    const run = doc.startViewTransition(() => {
      navigate();
      return settled();
    });
    void run.finished.finally(() => {
      if (root.dataset.nav === motion) delete root.dataset.nav;
    });
  } catch {
    delete root.dataset.nav;
    navigate();
  }
}

/** The web design (html.qb-web), now on at every size. */
function isWebDesign(): boolean {
  return typeof document !== "undefined" && document.documentElement.classList.contains("qb-web");
}

/**
 * Move between screens of the shell. Every screen is the same route with a
 * different query, rendered on the client, so the URL changes in place (Next
 * keeps useSearchParams in step with history.pushState) instead of asking the
 * server for a payload it already has. The same in a browser and in the app:
 * the static export serves that one route too.
 */
export function goTo(href: string, replace = false): void {
  if (replace) window.history.replaceState(null, "", href);
  else window.history.pushState(null, "", href);
}

// ---------- The back stack ----------

const stack: string[] = [];
let replacing = false;

/** The next URL change replaces the current screen (setMode's `replace`). */
export function markReplace(): void {
  replacing = true;
}

/** Record the screen now showing (its query string). */
export function recordScreen(search: string): void {
  const top = stack[stack.length - 1];
  if (top === search) {
    replacing = false;
    return;
  }
  if (replacing && stack.length) {
    stack[stack.length - 1] = search;
  } else if (stack.length >= 2 && stack[stack.length - 2] === search) {
    // The browser went back (or the app did): the screen above is gone.
    stack.pop();
  } else {
    stack.push(search);
    if (stack.length > 64) stack.shift();
  }
  replacing = false;
}

/** Is there a screen of this session to go back to? */
export function canGoBackInApp(): boolean {
  return stack.length >= 2;
}

/** The screen below the current one (its query string), if any. */
export function previousScreen(): string | null {
  return stack.length >= 2 ? stack[stack.length - 2] : null;
}

// ---------- Where the reader's back button leads ----------

// Opened from the tab bar (or the rail) the reader is a destination of its
// own: its back button leads Home. Opened from a page (a search result, the
// library…) it leads back to that page.
let readerFromTab = false;

/** Record how the reader is being opened (setMode calls this). */
export function noteReaderOpening(viaTab: boolean): void {
  readerFromTab = viaTab;
}

/** Does the reader's back button lead Home (rather than to another page)? */
export function readerBackLeadsHome(): boolean {
  return readerFromTab || previousScreen() === "";
}

/** Tests only. */
export function resetBackStackForTests(): void {
  stack.length = 0;
  replacing = false;
  readerFromTab = false;
}
