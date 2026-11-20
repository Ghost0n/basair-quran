import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  onResearchOutcome,
  researchingSessions,
  resetResearchRunnerForTests,
  runResearch,
  takePendingResearchError,
  type ResearchOutcome,
} from "./research-runner";

beforeEach(() => resetResearchRunnerForTests());

function deferred() {
  let resolve!: (outcome: ResearchOutcome) => void;
  const promise = new Promise<ResearchOutcome>((done) => (resolve = done));
  return { promise, resolve };
}

describe("a study question outlives the study page", () => {
  it("hands the answer to the open panel", async () => {
    const seen: ResearchOutcome[] = [];
    const stop = onResearchOutcome((outcome) => seen.push(outcome));
    const writeAway = vi.fn();
    const answer = { sessionId: "s1", ok: true as const, messages: [{ role: "user" as const, content: "q" }] };

    await runResearch("s1", async () => answer, writeAway);

    expect(seen).toEqual([answer]);
    expect(writeAway).not.toHaveBeenCalled();
    stop();
  });

  it("keeps running with the panel closed, and stores the answer for its return", async () => {
    const stop = onResearchOutcome(() => {});
    const pending = deferred();
    const writeAway = vi.fn();
    const run = runResearch("s1", () => pending.promise, writeAway);
    expect(researchingSessions().has("s1")).toBe(true);

    stop(); // the reader leaves the study page
    pending.resolve({ sessionId: "s1", ok: true, messages: [] });
    await run;

    expect(writeAway).toHaveBeenCalledWith({ sessionId: "s1", ok: true, messages: [] });
    expect(researchingSessions().size).toBe(0);
    expect(takePendingResearchError()).toBeNull();
  });

  it("keeps a failure's message for the panel's return, once", async () => {
    await runResearch(
      "s1",
      async () => ({ sessionId: "s1", ok: false, messages: [], title: "t", error: "تعذّر" }),
      () => {},
    );
    expect(takePendingResearchError()).toBe("تعذّر");
    expect(takePendingResearchError()).toBeNull();
  });
});
