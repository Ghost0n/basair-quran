import type { DevicePlatform } from "./platform";

/** Android (native SQLite + filesystem): see Phase 4 in docs/offline-app.md. */
export async function createCapacitorPlatform(): Promise<DevicePlatform> {
  throw new Error("native platform not available in this build");
}
