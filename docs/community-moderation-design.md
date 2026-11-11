# Community moderation — design

Status: **implemented** (Q-Basair-58, 2026-10-21) on the current SQLite stack; see
«Implementation» at the end for what maps where and what waits for the
production platform. Part of `docs/production-platform-plan.md` (product
features). It replaces the publish-time flow of `docs/ai-audit-agent.md`: the
agent no longer runs when «نشر» is pressed but in batches, and trust levels
decide when a person must approve. The deterministic audit (verse text,
references, AI labels, Tafssir disclaimer, size) still runs at once and still
blocks.

The rules applied are `docs/community-guidelines.md` (versioned; each check
records the version it used).

## Actors and roles

| Role | Can |
|---|---|
| **User** | Publish posts (research documents) and comments, like, report, appeal once per decision. |
| **Moderator** | Approve / decline queued posts and comments, hide or restore, ban from posting for 7 or 30 days, review suspicious users and appeals (not their own decisions). |
| **Admin** | Everything a moderator can, plus appoint / remove moderators, permanent bans, guidelines versions, agent settings. |

Roles live in Keycloak (realm roles) and are mirrored in the `app` database.
Nobody moderates their own content. Admins and moderators must use 2FA. Every
action is written to `moderation_actions` with its reason.

## User trust

```text
              first post approved by a moderator
 unverified ─────────────────────────────────────► verified
     ▲                                                │
     └──────────── any agent decline ─────────────────┘
                 (an "unsure" doesn't count)

 3 declines upheld by a moderator  →  suspicious (flag in the panel)
 suspicious  →  moderator/admin may ban from posting (posts + comments)
                7 days · 30 days (moderator) · permanent (admin)
```

- **Unverified** (every new account, and anyone after an agent decline): each
  post needs a moderator's approval after the agent's check; their comments
  wait for the check before they show.
- **Verified**: a post the agent finds valid is published automatically; their
  comments show at once and are checked afterwards.
- **Strikes** count only declines a moderator upheld (an agent mistake never
  counts against the user). The third upheld decline raises **suspicious**.
- **Ban** stops posting and commenting; reading, saving and studying stay
  open. One appeal per ban, reviewed by another moderator.

## Items and their states

**Post** (a published snapshot of a research document):

```text
draft → deterministic audit ── fail ──► blocked (author fixes, nothing queued)
             │ pass
             ▼
          queued (waits for the next batch; author sees «قيد المراجعة»)
             │ agent check
     ┌───────┼──────────────┐
   valid   unsure        declined
     │       │              │
     │       └──► human ◄───┘     (every decline goes to a person)
     │             │
     ├─ verified author ─► published
     └─ unverified author ─► human ─► published · declined (reasons, edit & resubmit)
```

**Comment**:

- Verified author: visible at once; the batch checks it; failing → hidden
  («تعليق مخفي» to others) and queued for a moderator.
- Unverified author: waits for the batch; valid → visible; unsure / declined →
  stays hidden, queued for a moderator.

**Reports**: a report re-checks the item at once (out of batch) and queues it
for a moderator; reports from **3 different users** hide it until a moderator
decides. Reporters choose the guideline section; abusive reporting is itself
moderated.

**Edits**: an edited post is a new version and goes through the checks again;
the previous version stays published until the new one passes.

## The checking worker

- A `worker` container (same image as the API) runs the batches **every 15
  minutes**: queued posts, new comments, unchecked reports.
- One agent call per item (comments may be grouped per post to give context:
  the comment, the post's title and summary, the comment it replies to).
- The author's interface language is passed in; the agent writes its reasons
  **in that language**. Moderators see the same reasons and a translation into
  their own interface language.
- **Fails closed**: a timeout, an invalid answer or an unavailable model gives
  `unsure` (→ a person), never `valid`.
- A global daily budget protects cost; when it is reached, items wait for the
  next window and the panel shows the backlog.

### Agent contract (strict JSON)

```json
{
  "verdict": "valid | unsure | declined",
  "confidence": 0.0,
  "issues": [
    {"target": "section id | comment", "rule": "misattribution | ruling_as_fact | unlabelled_ai | disrespect | sectarian_attack | integrity | spam_promo | personal_data | off_topic | harassment",
     "severity": "low | medium | high",
     "quote": "<exact excerpt>", "explanation": "<author's language>", "suggestion": "<author's language>"}
  ]
}
```

- Rules map one-to-one onto the guidelines. `off_topic` and `harassment` are
  new for comments; add them to `docs/community-guidelines.md`.
- Guards kept from the current agent: quotes must be exact substrings
  (otherwise the issue is dropped); the verdict is never laxer than the
  issues (any `high` → `declined`, any `medium` → at least `unsure`);
  `confidence` under a threshold → `unsure`.
- The agent judges guideline violations only, not legitimate differences of
  scholarly opinion.

## Model choice: benchmark first

Candidates (decision / policy models first, since our guidelines are
specific — rulings vs. reflection, misattribution, attacks on groups or beliefs):

- **Jev** (TypeSafe AI): decision model returning severity + confidence.
- **Clef-flash** (Cloudflare, open weights, Oct 2026): same role.
- **gpt-oss-safeguard 20B** (on Ollama): takes our written policy.
- One cheap general model as a baseline.
- Fixed-taxonomy guards (Llama Guard 4) only as an optional extra filter for
  generic harms; they can't apply our guidelines.

Test set: ~200 posts and ~300 comments labelled by us, in Arabic and the
other interface languages; clean, borderline and each rule violated.
Measure: recall on `high` violations (target ≥ 0.9), clean items wrongly
declined, `unsure` rate (moderator workload), latency, cost per 1,000 items.
The set is rerun whenever the guidelines version or the model changes.

## Supervision panel (admins and moderators)

- **Queue**: items waiting for a person (first posts, unsure, declined,
  reported, appeals), oldest first, with the agent's reasons, the guideline
  section and the author's trust history. Actions: approve, decline (reason
  required, shown to the author in their language), hide, restore.
- **Suspicious users**: the upheld declines, their items, ban controls.
- **Bans and appeals**.
- **Moderators** (admins only): appoint, remove, see their action log.
- **Feedback center**: shares the panel (classed user requests and error
  reports; see the platform plan).
- **Health**: backlog size, batch durations, agent errors, daily budget.

## Author experience

- While queued: «قيد المراجعة» on their post.
- Declined: the reasons (guideline, quote, explanation, suggestion) in their
  interface language, an «عدّل وأعد الإرسال» button, and «اعتراض» (once).
- Readers see no badge on normal posts; a hidden comment shows «تعليق مخفي».

## Data (in the `app` database)

`user_trust` (level, upheld declines, banned until, ban reason),
`posts` / `comments` (status), `moderation_checks` (item, version, stage
agent / human, verdict, confidence, issues JSON, model, guidelines version,
language), `moderation_queue` (item, reason, assigned to, decided at),
`reports` (item, reporter, rule, note), `moderation_actions` (actor, action,
target, reason), `appeals`.

## Implementation

| Design | Code |
|---|---|
| Roles | `users.is_moderator` (auth DB) beside `is_admin`; `AuthUser.is_staff`. Admins appoint moderators in the panel (`POST /api/moderation/team`). Keycloak realm roles replace this with the platform. |
| Trust, strikes, bans | `user_trust` — `moderation_service.standing / ban / unban`; `ensure_can_post` guards publishing and commenting (`403 {code: "banned"}`). |
| Queued posts, candidates | `posts.status = 'queued'`; a published post's new version waits in `posts.candidate_*` (`community_service.publish_document / publish_reviewed_version`). |
| The worker | `src/app/workers/moderation_worker.py`: the `worker` container (`QBASAIR_MODERATION_WORKER=external`, docker-compose) or a thread of the API (`embedded`, the default for a single local process). Batches every `QBASAIR_MODERATION_INTERVAL_SECONDS`; reported items every 30 s. |
| Agent contract | `audit_agent_service.check_post / check_comment` (guidelines `2026-10`, rules incl. `off_topic` and `harassment` for comments), reasons in the author's interface language (`ui_language`). |
| Daily budget, health | `QBASAIR_MODERATION_DAILY_BUDGET`, `moderation_runs`, `GET /api/moderation/health`. |
| Checks, queue, actions, appeals | `moderation_checks` (earlier `post_reviews` rows are copied in once), `moderation_queue`, `moderation_actions`, `appeals`. |
| Reports | `reports.checked` (the priority re-check), three distinct reporters → `report_hidden`. |
| Panel | `apps/web/features/moderation/` (in Community → «الإشراف»): review, users, feedback, team (admins), health. |
| Author experience | `apps/web/features/community/review-banner.tsx` (state, reasons, «عدّل وأعد الإرسال», «اعتراض»); pending / hidden comments in `post-screen.tsx`. |
| Feedback centre | `docs/feedback-centre.md`. |

Not built yet:

- Moderators reading the agent's reasons **translated into their own
  language** (the panel shows them in the author's language and names it).
- **2FA** for admins and moderators (with Keycloak).
- **Notifications** to authors when a decision is taken (the reasons are on
  their post and in «منشوراتي»).
- **Abusive reporting** as a moderated behaviour (reports are rate-limited;
  nothing counts against a reporter yet).
- The **benchmark run** that chooses the model: the scorer and a drafted labelled
  set exist (`docs/moderation-benchmark.md`); the labels need a person's review,
  then the candidates are run.
