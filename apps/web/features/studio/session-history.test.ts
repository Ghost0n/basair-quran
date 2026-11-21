import { describe, expect, it } from "vitest";

import type { ResearchSessionSummary } from "@q-basair/shared";

import { sessionHistory } from "./session-history";

const saved = (id: string, updated: number, count = 2): ResearchSessionSummary => ({
  id,
  title: `saved ${id}`,
  mode: "strict",
  message_count: count,
  created_at: updated,
  updated_at: updated,
});

describe("the study's sessions list", () => {
  it("lists the account's saved sessions when none is open (after signing in again)", () => {
    const items = sessionHistory([{ id: "blank", title: "", messages: [] }], [saved("a", 10), saved("b", 30)]);
    expect(items.map((item) => [item.id, item.open])).toEqual([
      ["b", false],
      ["a", false],
    ]);
  });

  it("puts the open sessions first, newest first, and lists a session once", () => {
    const items = sessionHistory(
      [
        { id: "a", title: "A", messages: [1, 2] },
        { id: "c", title: "C", messages: [1, 2, 3, 4] },
      ],
      [saved("a", 50), saved("b", 40)],
    );
    expect(items).toEqual([
      { id: "c", title: "C", count: 4, open: true },
      { id: "a", title: "A", count: 2, open: true },
      { id: "b", title: "saved b", count: 2, open: false },
    ]);
  });

  it("leaves out empty sessions, open or saved", () => {
    expect(sessionHistory([{ id: "x", title: "", messages: [] }], [saved("y", 1, 0)])).toEqual([]);
  });
});
