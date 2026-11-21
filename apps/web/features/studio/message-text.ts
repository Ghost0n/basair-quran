import type { ResearchAgentResponse } from "@q-basair/shared";

/**
 * An answer as copied from the chat: its text, then each ayah it rests on,
 * quoted with its reference — the same evidence the thread shows, nothing
 * added.
 */
export function answerAsText(
  response: ResearchAgentResponse | undefined,
  fallback: string,
  reference: (ayah: ResearchAgentResponse["ayahs"][number]) => string,
): string {
  const parts: string[] = [];
  const legacy = response?.tafssir
    ? Object.values(response.tafssir).filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  const body = legacy.length ? legacy.join("\n\n") : (response?.answer ?? fallback);
  if (body.trim()) parts.push(body.trim());
  const ayahs = response?.ayahs ?? [];
  if (ayahs.length) parts.push(ayahs.map((ayah) => `﴿${ayah.text.trim()}﴾ [${reference(ayah)}]`).join("\n"));
  return parts.join("\n\n");
}
