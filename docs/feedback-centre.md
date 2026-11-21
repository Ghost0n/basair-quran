# Feedback centre

Status: implemented (Q-Basair-58). One place for everything people send the
team, triaged by staff in the supervision panel.

## What people send

| Kind | From | Where |
|---|---|---|
| `contact` | a message to the team | Settings → «الدعم والملاحظات», and the public site's footer («راسلنا») |
| `bug` | a problem they met | Settings → «الدعم والملاحظات» |
| `help` | a request for assistance | Settings → «الدعم والملاحظات» |
| `feature` | an idea | Settings → «الدعم والملاحظات» |
| `error` | the diagnostic bundle of an error screen | «أبلِغ عن المشكلة» (`docs/error-reporting.md`) |

- Guests may write, and leave an email to be answered: it is required for their
  messages (not for a diagnostic report) and checked before it is accepted, with no
  code to confirm (`src/app/services/email_check.py`, against spam):
  1. the syntax, in the form too (`feedback-card.tsx`);
  2. no reserved domain (example.com, `.test`, `.invalid`, `.localhost`…) and no throwaway inbox (mailinator, yopmail…);
  3. the domain takes mail: an MX record, or else an address, and not a null MX (`dnspython`).

  A lookup that can't decide (a slow resolver, no network, or a resolver that
  can't even find gmail.com) lets the address through, so an outage never
  blocks a real sender. The form says why an address was refused.
  Signed-in people are recorded and see what they sent and its status under
  «ما أرسلته» (not their diagnostic reports).
- A `contact` message is also forwarded by email to the team's mailbox,
  `QBASAIR_CONTACT_EMAIL` (default `contact@basairquran.com`), with the sender's address
  as Reply-To, once the request has answered (`mail_service.send_contact_message`). Without
  SMTP (`QBASAIR_SMTP_HOST`) it stays in the feedback centre only; a failed delivery is
  logged, never shown to the sender.
- `POST /api/feedback` is rate-limited per IP (`QBASAIR_RATE_LIMIT_FEEDBACK_MAX`,
  10 per window by default). A message is at most 4,000 characters; a
  diagnostic bundle at most 32 KB.

## Triage (staff)

Community → «الإشراف» → «الملاحظات»: newest first, filtered by status and kind,
with the sender (account or guest, email), the interface language, the page,
the user agent and — for an error report — the technical detail. Staff move
each item `new → in_progress → resolved` (or `closed` when there is nothing to
do) and keep an internal note; the item is assigned to whoever first moved it.
The panel's «الحالة» counts what is still open.

## Privacy

Only what the person typed, plus, for an error report, the sanitized message,
the technical detail, the breadcrumbs, the page (no query string) and the user
agent — never Quran content, notebook or research text. Deleting an account
deletes its feedback.

## Code

`src/app/services/feedback_service.py`, `src/app/routes/feedback.py` (sending),
`src/app/routes/moderation.py` (triage), `apps/web/features/feedback/feedback-card.tsx`,
`apps/web/features/moderation/feedback-section.tsx`, `tests/test_feedback.py`.

## Next

- Answering from the panel (by email through the platform's mail service, or
  in the app for signed-in people).
- Grouping duplicate error reports by scope and detail.
