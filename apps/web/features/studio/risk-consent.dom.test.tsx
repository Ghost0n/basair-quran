// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { forgetAccountOnThisDevice } from "@/lib/forget-account";

import { RISKS_ACCEPTED_KEY, RiskConsent, resetStudyRisksForTests, useStudyRisksAccepted } from "./risk-consent";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;

function SendGate() {
  return <button disabled={!useStudyRisksAccepted()}>send</button>;
}

beforeEach(() => {
  window.localStorage.clear();
  resetStudyRisksForTests();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("the study's risks banner", () => {
  it("holds the question back until the risks are accepted, once per device", async () => {
    await act(async () => {
      root.render(
        <>
          <RiskConsent />
          <SendGate />
        </>,
      );
    });
    const banner = host.querySelector(".qb-studio-notice.is-risk");
    expect(banner).not.toBeNull();
    expect(host.querySelector<HTMLButtonElement>("button:not(.ok)")?.disabled).toBe(true);

    await act(async () => {
      host.querySelector<HTMLButtonElement>(".qb-studio-notice .ok")?.click();
    });
    expect(host.querySelector(".qb-studio-notice")).toBeNull();
    expect(host.querySelector<HTMLButtonElement>("button")?.disabled).toBe(false);
    expect(window.localStorage.getItem(RISKS_ACCEPTED_KEY)).toBe("1");

    // A device choice: signing out keeps it, and a new load reads it back.
    forgetAccountOnThisDevice();
    resetStudyRisksForTests();
    await act(async () => {
      root.render(<RiskConsent />);
    });
    expect(host.querySelector(".qb-studio-notice")).toBeNull();
  });
});
