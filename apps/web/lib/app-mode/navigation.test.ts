import { afterEach, describe, expect, test, vi } from "vitest";

import { inAppPath } from "./navigation";

const ios = { protocol: "capacitor:", host: "localhost", href: "capacitor://localhost/" };
const android = { protocol: "https:", host: "localhost", href: "https://localhost/" };

describe("which links open with client navigation in the app", () => {
  test("the app's own pages (a full load of them would land on Home)", () => {
    expect(inAppPath("/login", ios)).toBe("/login");
    expect(inAppPath("/login?tab=signup&next=%2Fresearch", android)).toBe("/login?tab=signup&next=%2Fresearch");
    expect(inAppPath("capacitor://localhost/welcome?next=%2F#top", ios)).toBe("/welcome?next=%2F#top");
    expect(inAppPath("guide", { ...ios, href: "capacitor://localhost/" })).toBe("/guide");
  });

  test("left alone: Home, the API, files, other origins, new tabs and downloads", () => {
    expect(inAppPath("/", ios)).toBeNull();
    expect(inAppPath("/?x=1", ios)).toBeNull();
    expect(inAppPath("/api/offline/manifest.json", ios)).toBeNull();
    expect(inAppPath("/api/auth/oidc/login", android)).toBeNull();
    expect(inAppPath("/fonts/ui/amiri.woff2", ios)).toBeNull();
    expect(inAppPath("/login.html", ios)).toBeNull();
    expect(inAppPath("https://basairquran.com/login", ios)).toBeNull();
    expect(inAppPath("https://localhost/login", ios)).toBeNull(); // Android's origin seen from iOS
    expect(inAppPath("mailto:contact@basair.example", ios)).toBeNull();
    expect(inAppPath("/login", ios, { target: "_blank" })).toBeNull();
    expect(inAppPath("/login", ios, { target: "_self" })).toBe("/login");
    expect(inAppPath("/guide", ios, { download: true })).toBeNull();
  });
});

describe("navigateTo", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_APP_MODE;
  });

  async function load(appMode: boolean) {
    vi.resetModules();
    if (appMode) process.env.NEXT_PUBLIC_APP_MODE = "1";
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { ...ios, assign } });
    return { ...(await import("./navigation")), assign };
  }

  test("in the app, a page goes through the router and Home reloads", async () => {
    const { navigateTo, setAppNavigator, assign } = await load(true);
    const push = vi.fn();
    setAppNavigator(push);
    navigateTo("/welcome?next=%2F");
    expect(push).toHaveBeenCalledWith("/welcome?next=%2F");
    navigateTo("/");
    expect(assign).toHaveBeenCalledWith("/");
    expect(push).toHaveBeenCalledOnce();
  });

  test("on the web (or before the app's router is registered) it is a page load", async () => {
    const web = await load(false);
    web.setAppNavigator(vi.fn());
    web.navigateTo("/welcome");
    expect(web.assign).toHaveBeenCalledWith("/welcome");
    const early = await load(true);
    early.navigateTo("/login");
    expect(early.assign).toHaveBeenCalledWith("/login");
  });
});
