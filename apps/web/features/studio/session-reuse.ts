import type { StudioSession } from "./use-studio-sessions";

/** Sessions made in this browser (createSession); a reopened saved one keeps its stored id. */
export const NEW_SESSION_PREFIX = "studio-";

/**
 * A session made here with no question yet. A reopened saved session is
 * never blank, even if none of its messages came back: reusing it would
 * write an unrelated thread over the stored one.
 */
function isBlank(session: StudioSession): boolean {
  return session.id.startsWith(NEW_SESSION_PREFIX) && session.messages.length === 0;
}

/**
 * Where a new study session goes. A blank session already open is never
 * doubled: it takes the new session's settings (mode, depth, focus) under its
 * own id and place, and becomes the one shown; the open one is preferred when
 * several are blank. Otherwise the new session is added at the end.
 */
export function placeNewSession(
  sessions: StudioSession[],
  fresh: StudioSession,
  activeId: string,
): { sessions: StudioSession[]; session: StudioSession } {
  const blank = sessions.find((session) => session.id === activeId && isBlank(session)) ?? sessions.find(isBlank);
  if (!blank) return { sessions: [...sessions, fresh], session: fresh };
  const session: StudioSession = { ...fresh, id: blank.id };
  return { sessions: sessions.map((current) => (current.id === blank.id ? session : current)), session };
}

/**
 * Puts a placed session into the tabs as they are now: in place of the tab
 * with its id, or at the end when the tabs changed since it was placed (a
 * restore that landed meanwhile), so no open tab is ever dropped.
 */
export function putSession(sessions: StudioSession[], session: StudioSession): StudioSession[] {
  if (!sessions.some((current) => current.id === session.id)) return [...sessions, session];
  return sessions.map((current) => (current.id === session.id ? session : current));
}

/** Restored tabs keep a single blank session: the open one if it is blank, else the first. */
export function dropExtraBlanks(sessions: StudioSession[], activeId: string): StudioSession[] {
  const keep = sessions.find((session) => session.id === activeId && isBlank(session)) ?? sessions.find(isBlank);
  return sessions.filter((session) => !isBlank(session) || session === keep);
}
