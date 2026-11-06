import type { StudioSession } from "./use-studio-sessions";

/** A session with no question yet. */
function isBlank(session: StudioSession): boolean {
  return session.messages.length === 0;
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

/** Restored tabs keep a single blank session: the open one if it is blank, else the first. */
export function dropExtraBlanks(sessions: StudioSession[], activeId: string): StudioSession[] {
  const keep = sessions.find((session) => session.id === activeId && isBlank(session)) ?? sessions.find(isBlank);
  return sessions.filter((session) => !isBlank(session) || session === keep);
}
