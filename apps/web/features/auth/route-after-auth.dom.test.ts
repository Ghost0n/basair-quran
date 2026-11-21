// @vitest-environment happy-dom
import type { AuthSessionResponse } from "@q-basair/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const uploaded = vi.hoisted(() => ({ count: 0 }));
vi.mock("@/lib/guest-data", () => ({ uploadGuestData: async () => void (uploaded.count += 1) }));

import { identityApi, routeAfterAuth } from "./identity-flow";

/**
 * After signing in or up the reader goes where they were headed. A new account
 * no longer stops on a welcome screen (features/onboarding/welcome-flow.tsx):
 * it is marked onboarded and given the guest's data on the way.
 */
describe("routeAfterAuth", () => {
  let assign: ReturnType<typeof vi.fn>;
  let updateProfile: ReturnType<typeof vi.spyOn>;
  let merge: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    uploaded.count = 0;
    assign = vi.fn();
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, assign } });
    updateProfile = vi.spyOn(identityApi, "updateProfile").mockResolvedValue({} as never);
    merge = vi
      .spyOn(identityApi, "mergeGuestData")
      .mockResolvedValue({ notebook_moved: 0, sessions_moved: 0, roots_moved: 0 } as never);
  });

  afterEach(() => vi.restoreAllMocks());

  const session = (onboarded: boolean) =>
    ({ enabled: true, authenticated: true, user: { id: 7, onboarded } }) as unknown as AuthSessionResponse;

  it("takes a new account straight to its destination, onboarded, with the guest data", async () => {
    await routeAfterAuth(session(false), "/?mode=reading");
    expect(updateProfile).toHaveBeenCalledWith({ onboarded: true }, { suppressAuthRedirect: true });
    expect(uploaded.count).toBe(1);
    expect(merge).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("/?mode=reading");
    expect(assign).not.toHaveBeenCalledWith(expect.stringContaining("/welcome"));
  });

  it("goes on even when marking the account fails", async () => {
    updateProfile.mockRejectedValue(new Error("offline"));
    await routeAfterAuth(session(false), "/");
    expect(merge).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("/");
  });

  it("only merges for an account already onboarded", async () => {
    await routeAfterAuth(session(true), "/?mode=studio");
    expect(updateProfile).not.toHaveBeenCalled();
    expect(merge).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("/?mode=studio");
  });
});
