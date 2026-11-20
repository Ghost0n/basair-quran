/**
 * A question to the study keeps going when the reader leaves the study page:
 * the request belongs to this module, not to the panel (which unmounts). Its
 * outcome goes to the open panel when there is one, and otherwise into the
 * open sessions kept for the tab (sessionStorage), where the panel finds it
 * on return — with the answer, or without the unanswered question and with
 * the error waiting to be shown.
 */

export type RunnerMessage = { role: "user" | "assistant"; content: string; response?: unknown };

export type ResearchOutcome =
  | { sessionId: string; ok: true; messages: RunnerMessage[] }
  | { sessionId: string; ok: false; messages: RunnerMessage[]; title: string; error: string };

type Listener = (outcome: ResearchOutcome) => void;

const running = new Set<string>();
const runningListeners = new Set<() => void>();
const outcomeListeners = new Set<Listener>();
let pendingError: string | null = null;
let runningSnapshot: ReadonlySet<string> = new Set();

function notifyRunning() {
  runningSnapshot = new Set(running);
  for (const listener of runningListeners) listener();
}

/** The sessions waiting for an answer (for `useSyncExternalStore`). */
export function researchingSessions(): ReadonlySet<string> {
  return runningSnapshot;
}

export function subscribeResearching(listener: () => void): () => void {
  runningListeners.add(listener);
  return () => runningListeners.delete(listener);
}

/** The open panel takes the outcomes while it is mounted. */
export function onResearchOutcome(listener: Listener): () => void {
  outcomeListeners.add(listener);
  return () => outcomeListeners.delete(listener);
}

/** An error from a question answered while the panel was closed, shown once. */
export function takePendingResearchError(): string | null {
  const error = pendingError;
  pendingError = null;
  return error;
}

/**
 * Runs one question for a session. `writeAway` stores the outcome when no
 * panel is open (the tab's open sessions).
 */
export async function runResearch(
  sessionId: string,
  work: () => Promise<ResearchOutcome>,
  writeAway: (outcome: ResearchOutcome) => void,
): Promise<ResearchOutcome> {
  running.add(sessionId);
  notifyRunning();
  let outcome: ResearchOutcome;
  try {
    outcome = await work();
  } finally {
    running.delete(sessionId);
  }
  if (outcomeListeners.size) {
    for (const listener of outcomeListeners) listener(outcome);
  } else {
    writeAway(outcome);
    if (!outcome.ok) pendingError = outcome.error;
  }
  notifyRunning();
  return outcome;
}

export function resetResearchRunnerForTests(): void {
  running.clear();
  runningListeners.clear();
  outcomeListeners.clear();
  pendingError = null;
  runningSnapshot = new Set();
}
