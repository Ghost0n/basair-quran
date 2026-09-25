/**
 * Interface dictionaries in the app build: English ships with the app (it is
 * the onboarding language and every dictionary's fallback); every other
 * language is a downloaded pack (Arabic, the source language, needs none).
 */
import { interfaceKey } from "./packs";
import { appRuntime } from "./runtime";

export async function installedDictionary(code: string): Promise<Record<string, unknown>> {
  const { platform } = await appRuntime();
  const text = await platform.kv.get(interfaceKey(code));
  if (!text) throw new Error(`interface pack ${code} is not installed`);
  return JSON.parse(text) as Record<string, unknown>;
}
