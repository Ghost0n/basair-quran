import { describe, expect, it } from "vitest";

import { buildZip, crc32 } from "./zip";

describe("zip", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("writes stored entries with a central directory that points at them", () => {
    const data = new TextEncoder().encode("hello");
    const zip = buildZip([
      { name: "شريحة-1.png", data },
      { name: "b.txt", data: new Uint8Array([1, 2, 3]) },
    ]);
    const view = new DataView(zip.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    const end = zip.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
    const centralOffset = view.getUint32(end + 16, true);
    expect(view.getUint32(centralOffset, true)).toBe(0x02014b50);
    expect(view.getUint32(centralOffset + 16, true)).toBe(crc32(data));
    const nameLength = view.getUint16(centralOffset + 28, true);
    const name = new TextDecoder().decode(zip.slice(centralOffset + 46, centralOffset + 46 + nameLength));
    expect(name).toBe("شريحة-1.png");
    // The first local header's payload is the file itself.
    const localNameLength = view.getUint16(26, true);
    expect(new TextDecoder().decode(zip.slice(30 + localNameLength, 30 + localNameLength + 5))).toBe("hello");
  });
});
