import { beforeEach, describe, expect, it } from "vitest";

import { noteReaderLoad, requestReaderResume, resetReaderEntryForTests, settleReaderLoads, takeReaderEntry } from "./reader-entry";

describe("reader entry", () => {
  beforeEach(() => resetReaderEntryForTests());

  it("opens fresh (Al-Fatiha) after a launch, then keeps its place", () => {
    expect(takeReaderEntry()).toBe("fresh");
    expect(takeReaderEntry()).toBe("keep");
  });

  it("keeps a page loaded on the way in (saved page, search result…)", () => {
    noteReaderLoad();
    expect(takeReaderEntry()).toBe("explicit");
    // Entering again without a new load: where it was.
    expect(takeReaderEntry()).toBe("keep");
  });

  it("resumes when Home asked for it, once", () => {
    requestReaderResume();
    noteReaderLoad();
    expect(takeReaderEntry()).toBe("resume");
    expect(takeReaderEntry()).toBe("keep");
  });

  it("does not count the reader's own page turns as a way in", () => {
    takeReaderEntry();
    noteReaderLoad();
    noteReaderLoad();
    settleReaderLoads();
    expect(takeReaderEntry()).toBe("keep");
  });
});

describe("reader sheet request", () => {
  beforeEach(() => resetReaderEntryForTests());

  it("is taken once", async () => {
    const { requestReaderSheet, takeReaderSheet } = await import("./reader-entry");
    expect(takeReaderSheet()).toBeNull();
    requestReaderSheet("saved");
    expect(takeReaderSheet()).toBe("saved");
    expect(takeReaderSheet()).toBeNull();
  });
});
