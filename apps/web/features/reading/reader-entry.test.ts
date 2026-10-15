import { beforeEach, describe, expect, it } from "vitest";

import { noteReaderLoad, requestReaderResume, resetReaderEntryForTests, settleReaderLoads, takeReaderEntry } from "./reader-entry";

describe("reader entry", () => {
  beforeEach(() => resetReaderEntryForTests());

  it("opens fresh (Al-Fatiha) when nothing named a place", () => {
    expect(takeReaderEntry()).toBe("fresh");
    expect(takeReaderEntry()).toBe("fresh");
  });

  it("keeps a page loaded on the way in (saved page, search result…)", () => {
    noteReaderLoad();
    expect(takeReaderEntry()).toBe("explicit");
    // Entering again without a new load: fresh again.
    expect(takeReaderEntry()).toBe("fresh");
  });

  it("resumes when Home asked for it, once", () => {
    requestReaderResume();
    noteReaderLoad();
    expect(takeReaderEntry()).toBe("resume");
    expect(takeReaderEntry()).toBe("fresh");
  });

  it("does not count the reader's own page turns as a way in", () => {
    takeReaderEntry();
    noteReaderLoad();
    noteReaderLoad();
    settleReaderLoads();
    expect(takeReaderEntry()).toBe("fresh");
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
