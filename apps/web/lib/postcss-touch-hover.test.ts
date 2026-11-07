import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
// postcss comes with Next (the app has no direct dependency on it).
const postcss = require(require.resolve("postcss", { paths: [require.resolve("next")] }));
const touchHover = require("../postcss-touch-hover.cjs");

async function run(css: string): Promise<string> {
  const result = await postcss([touchHover]).process(css, { from: undefined });
  // Whitespace is postcss's business: compare the CSS without it.
  return result.css.replace(/\s+/g, "");
}

describe("postcss-touch-hover", () => {
  it("moves :hover rules into a hover media query", async () => {
    expect(await run(".a:hover { color: red }")).toBe("@media(hover:hover){.a:hover{color:red}}");
  });

  it("keeps the non-hover selectors of a mixed rule where they were", async () => {
    expect(await run(".a:hover, .a.on { color: red }")).toBe(".a.on{color:red}@media(hover:hover){.a:hover{color:red}}");
  });

  it("leaves rules already behind a hover query and plain rules alone", async () => {
    expect(await run("@media (hover: hover) { .a:hover { x: 1 } } .b { y: 2 }")).toBe("@media(hover:hover){.a:hover{x:1}}.b{y:2}");
  });

  it("nests inside an existing media query", async () => {
    expect(await run("@media (max-width: 5px) { .d:hover .e { y: 2 } }")).toBe("@media(max-width:5px){@media(hover:hover){.d:hover.e{y:2}}}");
  });
});
