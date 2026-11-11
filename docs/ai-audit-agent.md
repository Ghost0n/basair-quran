# AI audit agent — design (for community publishing)

**Status:** superseded by `docs/community-moderation-design.md` (Q-Basair-58). The agent now runs
in batches, not at publish time, answers `valid | unsure | declined` with a confidence, writes its
reasons in the author's language and also checks comments. The inputs, the rules and the guards
below still describe it; the routing, the output contract and the storage changed (see that
document). The deterministic step is still `GET /api/documents/{id}/audit`.

## 1. Where it sits

```text
author clicks «نشر»
  → 1. deterministic audit (blocking)        research_document_service.audit_document
       fail → author sees the failing checks, nothing is queued
  → 2. AI audit agent (advisory)             this document
       pass    → published (unlisted/public as chosen)
       review  → moderator queue, author sees "قيد المراجعة" + the reasons
       reject  → moderator queue with a reject recommendation (never auto-deleted)
  → 3. human moderator (final)               accept / request changes / reject
```

The agent never publishes, hides or deletes on its own; its verdict only routes the document.

## 2. Inputs

Only the document itself and the guidelines. No corpus chunks, no user history:

```json
{
  "guidelines_version": "2026-09",
  "document": {
    "title": "…", "summary": "…",
    "provenance": {"mode": "strict|tafssir|null", "ai_sections": ["a1"], "created_from": "studio"},
    "sections": [
      {"id": "s1", "kind": "note|text|question|ai_answer|ayahs", "title": "…", "body": "…",
       "ayahs": [{"ref": "2:255", "text": "<verified mushaf text>"}]}
    ],
    "references": [{"kind": "book", "label": "…", "locator": "…"}]
  },
  "deterministic_audit": {"publishable": true, "checks": ["…"]}
}
```

Quotes are already verified against the mushaf by step 1, so the agent reasons about how they are
used rather than about their wording.

## 3. What it checks

Rules map one-to-one onto `docs/community-guidelines.md`:

| Rule id | Guideline | Examples of a finding |
|---|---|---|
| `misattribution` | §1 | A claim presented as the ayah's text; an ayah used against its evident context |
| `ruling_as_fact` | §3 | «يجب/يحرم…» stated as the research's conclusion without a cited source |
| `unlabelled_ai` | §4 | A section reads as generated but is not in `ai_sections` (a heuristic, so it only raises `review`) |
| `disrespect` | §5 | Insults, mockery, judging a person's faith or intentions, insulting prophets or any religion or group |
| `sectarian_attack` | §5 | An attack on a group, school of thought or belief rather than a fair argument (the id is kept for stored reviews) |
| `integrity` | §2, §6 | An unverified text presented as established; a link to a scientific theory presented as certain; cherry-picked occurrences; plagiarism |
| `spam_promo` | §8 | Links, promotion, follower solicitation |
| `personal_data` | §8 | Someone else's contact details or private information |

## 4. Output contract (strict JSON)

```json
{
  "verdict": "pass | review | reject",
  "issues": [
    {"section_id": "s2", "rule": "ruling_as_fact", "severity": "low|medium|high",
     "quote": "<≤ 200 chars from the section>", "explanation_ar": "…", "suggestion_ar": "…"}
  ]
}
```

- `pass` has no `high` or `medium` issues. Any `high` issue means `reject`; any `medium` issue means
  `review`.
- The model can only cite `section_id`s from the input. A `quote` must be a substring of that
  section; an issue whose quote isn't is dropped (hallucination guard).
- Parsing failures, timeouts or an unavailable provider give `review`, never `pass`. The pipeline
  fails closed to a human.

## 5. Prompt (system, abridged)

> You audit a Quran research post before it is shown to a community. Apply ONLY the listed
> guidelines. Quote the exact passage for each issue and explain in Arabic, respectfully, what to
> change. Do not judge the scholarly correctness of legitimate differences of opinion; flag only
> guideline violations. Do not rewrite the post. Return strict JSON matching the schema.

The system prompt is followed by the guidelines text for `guidelines_version` and the input JSON.
Temperature is 0 and the output is capped at 1,500 tokens.

## 6. Storage and audit trail

The `post_reviews` table holds:

```text
(id, post_id, document_version, stage[deterministic|ai|human], verdict, issues_json, model,
 guidelines_version, reviewer_id, note, created_at)
```

- Every publication is bound to a `document_version`. An edit after publication re-enters the
  pipeline.
- Authors see the reasons (issues' `explanation_ar` and `suggestion_ar`) but not the model's raw
  output.

## 7. Evaluation before launch

- A labelled set of about 200 posts (clean, borderline, violating per rule), with target recall of at
  least 0.9 on `high` issues.
- Clean posts wrongly routed to `review` are tracked. Moderator load is the cost we accept for fail-closed.
- Guidelines changes bump `guidelines_version` and re-run the set.
