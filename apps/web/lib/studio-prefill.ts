/**
 * Studio prefill — a tiny hand-off queue so the command bar and the Home "ask"
 * bar can open the Studio with a question already typed and submitted.
 *
 * The producer stashes the question (sessionStorage survives the route change)
 * and pings a window event. The Studio drains it on mount (the usual case: it
 * wasn't mounted yet) or on the event (if it happens to already be open).
 */
const KEY = "qb.studio.ask";
export const STUDIO_ASK_EVENT = "qb:studio-ask";

export function queueStudioAsk(question: string): void {
  const trimmed = question.trim();
  if (!trimmed) return;
  try {
    window.sessionStorage.setItem(KEY, trimmed);
  } catch {
    /* private mode — the mount drain just won't find it; harmless */
  }
  window.dispatchEvent(new CustomEvent(STUDIO_ASK_EVENT));
}

export function drainStudioAsk(): string | null {
  try {
    const value = window.sessionStorage.getItem(KEY);
    if (value) window.sessionStorage.removeItem(KEY);
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}

// Same relay pattern for "open this saved session as a tab" (Home / history).
const OPEN_KEY = "qb.studio.open-session";

export function queueStudioOpenSession(sessionId: string): void {
  if (!sessionId) return;
  try {
    window.sessionStorage.setItem(OPEN_KEY, sessionId);
  } catch {
    /* private mode — the mount drain just won't find it; harmless */
  }
  window.dispatchEvent(new CustomEvent(STUDIO_ASK_EVENT));
}

export function drainStudioOpenSession(): string | null {
  try {
    const value = window.sessionStorage.getItem(OPEN_KEY);
    if (value) window.sessionStorage.removeItem(OPEN_KEY);
    return value || null;
  } catch {
    return null;
  }
}

const QUESTION_WORDS = new Set([
  "هل",
  "ما",
  "ماذا",
  "لماذا",
  "لم",
  "كيف",
  "متى",
  "أين",
  "اين",
  "من",
  "كم",
  "أي",
  "أيّ",
  "علام",
  "بم",
  "فيم",
  "لماذا",
]);

/**
 * A conservative heuristic: treat the input as a research question (route it to
 * the Studio) rather than a search when it ends with a question mark or opens
 * with an Arabic interrogative. A long phrase (≥6 words) counts ONLY when it
 * also carries an interrogative cue — a plain long ayah/phrase search must still
 * go to search, not the Studio. Kept strict so short searches stay searches.
 */
export function looksLikeQuestion(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/[؟?]\s*$/.test(t)) return true;
  const words = t.split(/\s+/);
  const hasInterrogative = words.some((word) => QUESTION_WORDS.has(word.replace(/[^؀-ۿ]/g, "")));
  // Softened: the 6-word rule now requires an interrogative (was word-count only,
  // which misrouted long non-question searches into the Studio).
  if (words.length >= 6 && hasInterrogative) return true;
  const first = words[0].replace(/[^؀-ۿ]/g, "");
  if (words.length >= 3 && QUESTION_WORDS.has(first)) return true;
  return false;
}
