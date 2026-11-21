// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The account's saved digits, as the server answers them.
let saved = "latin";
const updates: unknown[] = [];
vi.mock("@q-basair/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@q-basair/api-client")>()),
  createQBasairApiClient: () => ({
    getPreferences: async () => ({ ...DEFAULT_PREFERENCES, numerals: saved }),
    updatePreferences: async (patch: Record<string, unknown>) => {
      updates.push(patch);
      saved = (patch.numerals as string) ?? saved;
      return { ...DEFAULT_PREFERENCES, numerals: saved };
    },
  }),
}));

import { formatNumber, setActiveNumerals } from "./numerals";
import { DEFAULT_PREFERENCES, PreferencesProvider, usePreferences } from "./preferences-context";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;

/** A screen that formats a number without reading the preferences itself. */
function Plain() {
  return <span className="plain">{formatNumber(2)}</span>;
}

let change: (numerals: "arabic-indic" | "latin" | "persian") => Promise<void>;
function Changer() {
  const { updateAccount } = usePreferences();
  change = (numerals) => updateAccount({ numerals });
  return null;
}

async function flush() {
  for (let i = 0; i < 5; i += 1) await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
}

beforeEach(() => {
  saved = "latin";
  updates.length = 0;
  window.localStorage.clear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  setActiveNumerals("arabic-indic");
});

describe("PreferencesProvider digits", () => {
  it("formats every number in the account's digits, even where a screen calls formatNumber alone", async () => {
    await act(async () =>
      root.render(
        <PreferencesProvider>
          <Plain />
          <Changer />
        </PreferencesProvider>,
      ),
    );
    await flush();
    expect(host.querySelector(".plain")!.textContent).toBe("2");

    await act(async () => change("persian"));
    await flush();
    expect(host.querySelector(".plain")!.textContent).toBe("۲");
  });
});
