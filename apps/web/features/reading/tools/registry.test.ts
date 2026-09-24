import { describe, expect, it } from "vitest";

import { DEFAULT_READER_TOOL, READER_TOOLS, isReaderToolId, readerTool, toolForKey } from "./registry";

describe("reader tool registry", () => {
  it("has unique ids and shortcut keys", () => {
    expect(new Set(READER_TOOLS.map((tool) => tool.id)).size).toBe(READER_TOOLS.length);
    expect(new Set(READER_TOOLS.map((tool) => tool.key)).size).toBe(READER_TOOLS.length);
  });

  it("keeps grammar insights as the default tool", () => {
    expect(DEFAULT_READER_TOOL).toBe("grammar");
    expect(READER_TOOLS[0].id).toBe("grammar");
  });

  it("resolves keys and validates ids", () => {
    expect(toolForKey("3")).toBe("select");
    expect(toolForKey("9")).toBeNull();
    expect(isReaderToolId("tafssir")).toBe(true);
    expect(isReaderToolId("eraser")).toBe(false);
    expect(readerTool("highlight").label).toBe("تظليل");
  });
});
