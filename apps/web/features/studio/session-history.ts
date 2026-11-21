import type { ResearchSessionSummary } from "@q-basair/shared";

/** One row of the study's sessions list. */
export type HistoryItem = {
  id: string;
  title: string;
  /** Messages in the thread. */
  count: number;
  /** Open in this tab (a live session) or only saved (opened on demand). */
  open: boolean;
};

/**
 * The study's sessions list: the sessions open in this tab that hold a
 * conversation, newest first, then the ones saved to the account (or, for a
 * guest, in this browser) that are not open, most recently updated first.
 *
 * The open sessions live in the tab (sessionStorage), which signing out
 * empties: without the saved ones, the list was empty after signing in again,
 * though every answered session was kept on the account.
 */
export function sessionHistory(
  open: readonly { id: string; title: string; messages: readonly unknown[] }[],
  saved: readonly ResearchSessionSummary[],
): HistoryItem[] {
  const live = [...open]
    .reverse()
    .filter((session) => session.messages.length > 0)
    .map((session) => ({ id: session.id, title: session.title, count: session.messages.length, open: true }));
  const openIds = new Set(open.map((session) => session.id));
  const kept = [...saved]
    .filter((session) => !openIds.has(session.id) && session.message_count > 0)
    .sort((a, b) => b.updated_at - a.updated_at)
    .map((session) => ({ id: session.id, title: session.title, count: session.message_count, open: false }));
  return [...live, ...kept];
}
