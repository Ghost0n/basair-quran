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
 * Run a navigation inside a view transition (when the browser has them and
 * motion is welcome); `html[data-nav]` names the motion for the CSS
 * (app/motion.css), so entering the reader can split the tab bar into the
 * back button and the reader's dock.
 */
export function transition(navigate: () => void, motion: NavMotion = "fade"): void {
  const doc = typeof document === "undefined" ? null : (document as ViewTransitionDocument);
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!doc || typeof doc.startViewTransition !== "function" || reduce) {
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
