// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";

import { forgetAccountOnThisDevice } from "./forget-account";

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("forgetAccountOnThisDevice", () => {
  it("removes what the account left in this browser and keeps the device's own choices", () => {
    const local = {
      "qb.prefs.cache": "{}",
      "qb.recents": "[]",
      "qb.reading.progress": "{}",
      "qb.ai.connection": '{"provider":"openrouter","keys":{"openrouter":"sk-x"}}',
      "qb.ai.connection.owner": '{"owner":7,"pending":false}',
      "qb.lastBoard": "1",
      "qb.lastNotebook": "saved",
      "qb.locale": "en",
      theme: "light",
    };
    const session = {
      "qbasair.studio.sessions": "{}",
      "qb.studio.ask": "{}",
      "qb.studio.open-session": "x",
      "qbasair.research.ollama": "{}",
    };
    for (const [key, value] of Object.entries(local)) window.localStorage.setItem(key, value);
    for (const [key, value] of Object.entries(session)) window.sessionStorage.setItem(key, value);

    forgetAccountOnThisDevice();

    // The provider keys are the account's (kept there, found again at sign-in): they leave too.
    expect(Object.keys({ ...window.localStorage }).sort()).toEqual(["qb.locale", "theme"]);
    expect(window.sessionStorage.length).toBe(0);
  });
});
