function getDefaultApiBaseUrl() {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "127.0.0.1" || host === "localhost") {
      return "http://127.0.0.1:8001/api";
    }
  }
  return "/api";
}

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || getDefaultApiBaseUrl();
export const AUTH_ENABLED = process.env.NEXT_PUBLIC_AUTH_ENABLED === "1";
