# Error surfacing & diagnostic reporting

Two concerns: (1) users must never see raw technical errors; (2) when something
breaks we want a way to get a full diagnostic to an admin. (1) is shipped; (2) is
scaffolded on the client and awaits a server + admin panel.

## Shipped — user-safe error messages

- The api-client throws technical strings for logs, e.g.
  `API request failed: 500 Internal Server Error`. These must not reach users.
- `apps/web/lib/error-report.ts` → `sanitizeErrorMessage(raw)` maps anything that
  looks technical (HTTP status codes, `API request failed`, `Failed to fetch`,
  `NetworkError`, JSON/parse errors, tracebacks…) to one calm Arabic message:
  «تعذّر إتمام الطلب الآن. تحقّق من اتصالك وحاول مرة أخرى.» Already-friendly Arabic
  messages (the reader's own copy) pass through unchanged.
- `components/error-state.tsx` sanitizes every message it renders, so **all**
  error surfaces are safe regardless of what the caller passes.
- Catch sites call `reportError(scope, err, context?)` with the RAW error — it
  logs (dev console) + appends a breadcrumb; the raw text never hits the DOM.

## Scaffolded — "send a report to the admin panel" (future)

Client side is in place; server side is not built yet.

- `error-state.tsx` renders an «أبلِغ عن المشكلة» button when given a `reportScope`
  (the reader passes `reportScope="reader"`).
- It calls `sendDiagnosticReport(scope, { userMessage, detail, context })`, which
  assembles a `DiagnosticReport`:

  ```ts
  {
    scope, user_message, detail,        // sanitized msg + raw technical detail
    url, user_agent, at,                // where/when
    breadcrumbs: Breadcrumb[],          // last ~40 reportError() events
    context?                            // caller-supplied extras
  }
  ```

- Today it **logs the bundle** (`console.warn("[qb:report]", …)`) and returns
  `true` — the report is captured locally so a dev/admin can retrieve it. It only
  POSTs to `/api/reports` when `NEXT_PUBLIC_ERROR_REPORTING=1` (off by default).

### To finish the feature

1. **Backend** `POST /api/reports` (new router): accept `DiagnosticReport`, stamp
   `user_id` (via `attach_optional_session`) + server request id + server-side
   recent log tail, store in a `reports` table (`data/app_data.db`). Rate-limit
   per session/IP; strip anything that could be PII beyond what's needed.
2. **Model + types**: `DiagnosticReport` in `src/app/models/api.py`, mirror in
   `packages/shared`, add `sendReport` to `packages/api-client` (or keep the
   direct `fetch` in `error-report.ts`).
3. **Admin panel**: an admin-only surface (gated by `is_admin`) listing reports
   with the user message, technical detail, breadcrumbs, url/agent, and the
   correlated server log tail.
4. Flip `NEXT_PUBLIC_ERROR_REPORTING=1` in the web build once the endpoint exists.
5. Tests: `sanitizeErrorMessage` mapping; `/api/reports` accept + rate-limit +
   admin-only read.

### Privacy

The bundle is diagnostic, not analytics: message + technical detail + breadcrumbs
+ url + user agent. No ayah content, notebook, or research text. Keep it that way.
