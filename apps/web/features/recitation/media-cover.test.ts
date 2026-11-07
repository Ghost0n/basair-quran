import { describe, expect, it } from "vitest";

import { coverArtwork } from "./media-cover";

describe("coverArtwork", () => {
  it("offers the full-square covers, never the rounded app icon", () => {
    const artwork = coverArtwork("https://app.example/reading?x=1");
    expect(artwork).toEqual([
      { src: "https://app.example/cover-512.png", sizes: "512x512", type: "image/png" },
      { src: "https://app.example/cover-1024.png", sizes: "1024x1024", type: "image/png" },
    ]);
    expect(artwork.some((item) => item.src.includes("icon"))).toBe(false);
  });
});
