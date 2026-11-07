// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useDialog } from "./use-dialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Dialog({ onClose, children }: { onClose: () => void; children?: ReactNode }) {
  const ref = useDialog<HTMLDivElement>(onClose);
  return (
    <div ref={ref} role="dialog" aria-modal="true" tabIndex={-1}>
      {children}
    </div>
  );
}

let root: Root;
let host: HTMLElement;
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("useDialog with a dialog inside another", () => {
  it("closes only the newest one on Escape", async () => {
    const closeOuter = vi.fn();
    const closeInner = vi.fn();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    // As in the app: the outer sheet is open, then the inner one opens over it.
    await act(async () => root.render(<Dialog onClose={closeOuter} />));
    await act(async () =>
      root.render(
        <Dialog onClose={closeOuter}>
          <Dialog onClose={closeInner} />
        </Dialog>,
      ),
    );
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(closeInner).toHaveBeenCalledTimes(1);
    expect(closeOuter).not.toHaveBeenCalled();
  });
});
