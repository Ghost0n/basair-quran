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

## Shipped — «أبلِغ عن المشكلة» reaches the team

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

- It logs the bundle (`console.warn("[qb:report]", …)`) and sends it to the
  feedback centre: `POST /api/feedback {kind: "error", message, detail}`
  (`docs/feedback-centre.md`). The person pressed the button, so no opt-in flag
  is needed. Staff read it in the supervision panel (Community → «الإشراف» →
  «الملاحظات», filter «تقرير خطأ»).
- Automatic capture of uncaught errors (`installGlobalErrorHooks`) stays opt-in:
  `NEXT_PUBLIC_ERROR_REPORTING=1`.

### Privacy

The bundle is diagnostic, not analytics: message + technical detail + breadcrumbs
+ url + user agent. No ayah content, notebook, or research text. Keep it that way.
