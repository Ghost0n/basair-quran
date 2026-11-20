// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { updateProfile, patchUser, user } = vi.hoisted(() => ({
  updateProfile: vi.fn(async () => ({})),
  patchUser: vi.fn(),
  user: { id: 7, name: "الحسن", email: "reader@example.test", avatar: null as string | null },
}));

vi.mock("@/lib/config", () => ({ AUTH_ENABLED: true, API_BASE_URL: "" }));
vi.mock("@q-basair/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@q-basair/api-client")>()),
  createQBasairApiClient: () => ({ updateProfile, getDevices: async () => [] }),
}));
vi.mock("@/lib/auth-session-context", () => ({ useAuthSession: () => ({ user, ready: true, patchUser }) }));
vi.mock("@/features/auth/identity-flow", () => ({ clearGuestChoice: vi.fn(), signOutEverywhere: vi.fn() }));

import { automaticAvatar } from "@/lib/avatar";

import { AccountSettings } from "./account-settings";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;

beforeEach(async () => {
  updateProfile.mockClear();
  patchUser.mockClear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<AccountSettings />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("the medallion in Settings", () => {
  it("shows the reader's initial on the look given with the account, and saves a pattern or a colour", async () => {
    expect(host.querySelector(".qb-account-card")?.textContent).toContain("ح");
    await act(async () => host.querySelector<HTMLButtonElement>(".qb-account-change")!.click());

    const [patterns, tones] = [...host.querySelectorAll(".qb-account-look .row")];
    const given = automaticAvatar(7);
    const pressed = (row: Element) => row.querySelector('[aria-pressed="true"]')?.getAttribute("aria-label");
    expect(patterns.querySelectorAll("button")).toHaveLength(6);
    expect(tones.querySelectorAll("button")).toHaveLength(6);
    expect(pressed(patterns)).toBeTruthy();

    // The sixth pattern is «سادة» (plain); the tone stays the one given.
    await act(async () => patterns.querySelectorAll<HTMLButtonElement>("button")[5].click());
    const toneIndex = ["gold", "lapis", "malachite", "cinnabar", "ink", "vellum"].indexOf(given.tone);
    expect(updateProfile).toHaveBeenCalledWith({ avatar: `p5t${toneIndex}` }, { suppressAuthRedirect: true });
    expect(patchUser).toHaveBeenCalledWith({ avatar: `p5t${toneIndex}` });
  });
});
