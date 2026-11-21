import { describe, expect, it, vi } from "vitest";

import { canonicalOriginScript, scriptJson } from "./canonical-origin";

/** Runs the script against a pretend `location`; returns where it moved to, if anywhere. */
function run(siteUrl: string | undefined, pageUrl: string): string | null {
  const script = canonicalOriginScript(siteUrl);
  if (!script) return null;
  const page = new URL(pageUrl);
  const replace = vi.fn();
  const location = { hostname: page.hostname, port: page.port, pathname: page.pathname, search: page.search, hash: page.hash, replace };
  new Function("location", script)(location);
  return replace.mock.calls[0]?.[0] ?? null;
}

describe("one address for the local site", () => {
  it("moves the other loopback name to the configured one, keeping the path", () => {
    expect(run("http://localhost:3000", "http://127.0.0.1:3000/?mode=settings&section=ai#x")).toBe(
      "http://localhost:3000/?mode=settings&section=ai#x",
    );
    expect(run("http://127.0.0.1:3000", "http://localhost:3000/about")).toBe("http://127.0.0.1:3000/about");
  });

  it("stays at the configured address and on another port", () => {
    expect(run("http://localhost:3000", "http://localhost:3000/")).toBeNull();
    expect(run("http://localhost:3000", "http://127.0.0.1:3001/")).toBeNull();
  });

  it("gives a public site no script at all", () => {
    expect(canonicalOriginScript("https://basairquran.com")).toBe("");
    expect(canonicalOriginScript(undefined)).toBe("");
    expect(canonicalOriginScript("not a url")).toBe("");
  });

  it("only scripts a plain local address", () => {
    expect(canonicalOriginScript("ftp://localhost:3000")).toBe("");
    expect(canonicalOriginScript("javascript://localhost:3000")).toBe("");
  });

  it("embeds values that cannot close the script tag or end a line", () => {
    const json = scriptJson({ a: "</script><script>alert(1)</script>", b: "x\u2028y\u2029z" });
    expect(json).not.toMatch(/[<>/\u2028\u2029]/);
    expect(JSON.parse(json)).toEqual({ a: "</script><script>alert(1)</script>", b: "x\u2028y\u2029z" });
    const script = canonicalOriginScript("http://localhost:3000");
    expect(script).toContain("http:\\u002F\\u002Flocalhost:3000");
    expect(script).not.toContain("</");
  });
});
