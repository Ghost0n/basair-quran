# Moderation benchmark

Chooses the model behind the moderation agent (`docs/community-moderation-design.md`,
«Model choice: benchmark first») and re-checks it whenever the guidelines or the model change.

## The test set

`benchmarks/moderation/dataset.jsonl` — 200 items: 80 posts and 120 comments, in
Arabic (105), English, French, Indonesian, Turkish, Urdu and Russian.

| Label | Items | Meaning |
|---|---|---|
| `clean` | 100 | Nothing to flag: reflections, word and root studies, questions, rulings quoted with their scholar, thanks, respectful disagreement. |
| `violation` | 64 (36 high, 28 medium) | A breach of one or more guidelines; `high` must never be let through. |
| `borderline` | 36 | Reasonable moderators could disagree (a free lesson advertised, a blunt but on-topic reply, a contested hadith with its source but no grade…). |

Every guideline rule appears (`misattribution`, `ruling_as_fact`, `unlabelled_ai`,
`disrespect`, `sectarian_attack`, `integrity`, `spam_promo`, `personal_data`,
`off_topic`, `harassment`). Each item carries a one-line `note` explaining its label.

**Status: draft.** The items were drafted with an assistant and spot-checked; before
the benchmark decides anything, a person from the team should read every label
(especially the borderline ones and the non-Arabic items) and correct it in place.
The format is in the script's `validate_item` (and `tests/test_benchmark_moderation.py`).

## Running it

```bash
python scripts/benchmark_moderation.py --check                       # validate the set
python scripts/benchmark_moderation.py --models gpt-oss:20b,gemma4:31b-cloud
python scripts/benchmark_moderation.py --models gpt-oss:20b --kind comment --limit 40   # a quick run
python scripts/benchmark_moderation.py --models <m> --price-in 0.15 --price-out 0.6      # $ per million tokens
```

It uses the configured provider (`QBASAIR_LLM_PROVIDER`, `QBASAIR_OLLAMA_BASE_URL`,
`OLLAMA_API_KEY`) and runs the **real** agent — `audit_agent_service.check_post /
check_comment`, the same prompt, parsing, quote guard and confidence bar
(`QBASAIR_MODERATION_MIN_CONFIDENCE`) as the moderation batches. Results go to
`build/moderation-benchmark/`: one JSON per model with every verdict, and
`report.md` comparing the models.

## What it measures

| Metric | Meaning | Wanted |
|---|---|---|
| High recall | High violations not let through (`unsure` or `declined`) | ≥ 90 % (the target) |
| All violations | The same over every violation | high |
| False declines | Clean items declined — authors wrongly refused | low |
| Clean → person | Clean items sent to a moderator (`unsure`) — their workload | low |
| Borderline → person | Borderline items a person sees | informative |
| Errors | Provider down or invalid output (they fail closed to `unsure`) | 0 |
| p50 / p95 | Seconds per check | — |
| Cost / 1k | Estimated from ≈ 4 characters a token and `--price-in/out` | — |

Per rule and per language tables show where a model is weak (e.g. sectarian polemics in
Urdu, or off-topic comments in Turkish).

## Candidates

From the design: decision models (Jev, Clef-flash), `gpt-oss-safeguard:20b` on Ollama
(takes our written policy), and one cheap general model as a baseline. A model that
misses the target on high violations is out, whatever its cost; among the rest, the
fewest clean items sent to people at an acceptable cost wins.
