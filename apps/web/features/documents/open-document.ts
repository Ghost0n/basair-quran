"use client";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { ResearchDocumentSave } from "@q-basair/shared";

import { API_BASE_URL } from "@/lib/config";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

/** Create a research document and return the URL of its editor. */
export async function createDocumentUrl(document: ResearchDocumentSave): Promise<string> {
  const created = await api.createDocument(document);
  return `/?mode=document&id=${encodeURIComponent(created.id)}`;
}
