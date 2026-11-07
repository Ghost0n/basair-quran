import { describe, expect, it } from "vitest";

import { DEFAULT_READER_TOOL, READER_TOOLS, isReaderToolId, readerTool, toolForKey } from "./registry";

describe("reader tool registry", () => {
  it("has unique ids and shortcut keys", () => {
    expect(new Set(READER_TOOLS.map((tool) => tool.id)).size).toBe(READER_TOOLS.length);
    expect(new Set(READER_TOOLS.map((tool) => tool.key)).size).toBe(READER_TOOLS.length);
  });

  it("defaults to reading, with no tool on", () => {
    expect(DEFAULT_READER_TOOL).toBe("read");
    expect(READER_TOOLS[0].id).toBe("read");
  });

  it("resolves keys and validates ids; retired tools are no longer valid", () => {
    expect(toolForKey("0")).toBe("read");
    expect(toolForKey("1")).toBe("select");
    expect(toolForKey("2")).toBe("highlight");
    expect(toolForKey("9")).toBeNull();
    expect(isReaderToolId("grammar")).toBe(false);
    expect(isReaderToolId("tafssir")).toBe(false);
    expect(readerTool("highlight").label).toBe("تظليل");
  });
});
