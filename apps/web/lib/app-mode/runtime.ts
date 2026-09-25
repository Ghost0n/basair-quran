/**
 * The device side of the app build, opened once: the databases, the engine
 * that answers /api (packages/offline-engine), the user's local data and the
 * pack manager.
 */
import { OfflineApi, type StateStorage } from "@q-basair/offline-engine";

import { PackManager } from "./packs";
import type { DeviceDatabase, DevicePlatform } from "./platform";

export type AppRuntime = {
  platform: DevicePlatform;
  quranDb: DeviceDatabase;
  translationsDb: DeviceDatabase;
  api: OfflineApi;
  packs: PackManager;
};

const USER_DATA_KEY = "qb.userdata";

declare global {
  interface Window {
    Capacitor?: { isNativePlatform?: () => boolean };
  }
}

async function createPlatform(): Promise<DevicePlatform> {
  if (window.Capacitor?.isNativePlatform?.()) {
    const { createCapacitorPlatform } = await import("./platform-capacitor");
    return createCapacitorPlatform();
  }
  const { createWebPlatform } = await import("./platform-web");
  return createWebPlatform();
}

let runtime: Promise<AppRuntime> | null = null;

export function appRuntime(): Promise<AppRuntime> {
  if (!runtime) {
    runtime = (async () => {
      const platform = await createPlatform();
      const [quranDb, translationsDb] = await Promise.all([platform.openQuran(), platform.openTranslations()]);
      const userData: StateStorage = {
        read: () => platform.kv.get(USER_DATA_KEY),
        write: (text) => platform.kv.set(USER_DATA_KEY, text),
      };
      const api = new OfflineApi({ quran: quranDb, translations: translationsDb, userData });
      return { platform, quranDb, translationsDb, api, packs: new PackManager(platform, quranDb, translationsDb, api) };
    })();
    runtime.catch(() => {
      runtime = null; // let a later call retry (e.g. after a storage error)
    });
  }
  return runtime;
}
