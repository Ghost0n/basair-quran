import { createQBasairApiClient } from "@q-basair/api-client";

import { API_BASE_URL } from "@/lib/config";

export const api = createQBasairApiClient({ baseUrl: API_BASE_URL });
