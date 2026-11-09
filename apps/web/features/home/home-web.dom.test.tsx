// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { WebHome } from "./home-web";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noop = () => undefined;
const verse = (key: number) => ({ text: "وقل رب زدني علما", surah: "طه", ayah: 114, key, onRead: noop, onListen: noop });

async function visit(key: number) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(<WebHome greeting={null} verse={verse(key)} reading={null} lists={[]} formatNumber={String} />),
  );
  const seen = {
    drawn: host.querySelector(".qbw-hero-girih")?.classList.contains("is-drawn") ?? false,
    words: host.querySelector(".qbw-verse")?.classList.contains("qb-word-in") ?? false,
  };
  return { seen, root, host };
}

describe("WebHome's hero", () => {
  it("draws itself on the first visit only, so coming back to Home is not a new space", async () => {
    const first = await visit(0);
    expect(first.seen).toEqual({ drawn: true, words: true });
    await act(async () => first.root.unmount());
    first.host.remove();

    const again = await visit(3);
    expect(again.seen).toEqual({ drawn: false, words: false });

    // While Home stays open, the next verse still writes itself in.
    await act(async () =>
      again.root.render(<WebHome greeting={null} verse={verse(4)} reading={null} lists={[]} formatNumber={String} />),
    );
    expect(again.host.querySelector(".qbw-verse")?.classList.contains("qb-word-in")).toBe(true);
    await act(async () => again.root.unmount());
    again.host.remove();
  });
});
