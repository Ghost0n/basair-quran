"""Benchmark the moderation agent on a labelled test set (docs/moderation-benchmark.md).

Runs ``audit_agent_service.check_post / check_comment`` — the exact prompt,
parsing and guards the moderation batches use — on every item of
``benchmarks/moderation/dataset.jsonl``, once per model, and scores the
verdicts against the labels:

- **recall on high violations**: high-severity violations not let through
  (``unsure`` or ``declined``; target ≥ 0.90);
- **recall on all violations**, and per rule;
- **false declines**: clean items declined (an author wrongly refused);
- **moderator load**: clean items sent to a person (``unsure``);
- **borderline**: how often borderline items reach a person (not scored as right or wrong);
- **errors** (provider down, invalid output — they fail closed to ``unsure``),
  **latency** (p50 / p95) and an **estimated cost per 1,000 items** from
  ``--price-in`` / ``--price-out`` (per million tokens, ≈ 4 characters a token).

The model is the configured provider's (``QBASAIR_LLM_PROVIDER``,
``QBASAIR_OLLAMA_BASE_URL``, ``OLLAMA_API_KEY``); ``--models`` runs several by
setting ``QBASAIR_LLM_CHAT_MODEL`` for each. Results go to ``--out``
(``build/moderation-benchmark/`` by default): one JSON per model with every
verdict, and ``report.md`` comparing them.

    python scripts/benchmark_moderation.py --models gpt-oss:20b,gemma4:31b-cloud --limit 40
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.app.core import config  # noqa: E402
from src.app.services import audit_agent_service  # noqa: E402

DATASET = ROOT / "benchmarks" / "moderation" / "dataset.jsonl"
OUT = ROOT / "build" / "moderation-benchmark"
LABELS = ("clean", "violation", "borderline")
TARGET_HIGH_RECALL = 0.9


def load_dataset(path: Path) -> list[dict]:
    items = []
    seen = set()
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        item = json.loads(line)
        problems = validate_item(item)
        if problems:
            raise ValueError(f"{path.name}:{number} ({item.get('id')}): {'; '.join(problems)}")
        if item["id"] in seen:
            raise ValueError(f"{path.name}:{number}: duplicate id {item['id']}")
        seen.add(item["id"])
        items.append(item)
    return items


def validate_item(item: dict) -> list[str]:
    problems = []
    if item.get("kind") not in ("post", "comment"):
        problems.append("kind must be post or comment")
    if item.get("label") not in LABELS:
        problems.append("label must be clean, violation or borderline")
    rules = item.get("rules")
    if not isinstance(rules, list) or any(rule not in audit_agent_service.RULES for rule in rules):
        problems.append("rules must be guideline rule ids")
    elif item.get("label") == "clean" and (rules or item.get("severity")):
        problems.append("a clean item has no rules and no severity")
    elif item.get("label") != "clean" and (not rules or item.get("severity") not in ("medium", "high")):
        problems.append("a violation or borderline item names its rules and a severity")
    if item.get("kind") == "post":
        sections = (item.get("document") or {}).get("sections")
        if not sections or any(not section.get("id") or not section.get("body") for section in sections):
            problems.append("a post has sections with an id and a body")
    elif item.get("kind") == "comment" and (not item.get("comment") or not isinstance(item.get("post"), dict)):
        problems.append("a comment has its text and its post")
    if not item.get("language"):
        problems.append("language is required")
    return problems


def run_item(item: dict) -> dict:
    """One agent check, timed; the agent itself never raises (it fails closed)."""
    started = time.perf_counter()
    if item["kind"] == "post":
        result = audit_agent_service.check_post(item["document"], item["language"])
        sent = json.dumps(audit_agent_service.build_post_input(item["document"]), ensure_ascii=False)
    else:
        result = audit_agent_service.check_comment(item["comment"], item["post"], item["language"])
        sent = json.dumps(audit_agent_service.build_comment_input(item["comment"], item["post"]), ensure_ascii=False)
    elapsed = time.perf_counter() - started
    answer = json.dumps({"verdict": result["verdict"], "issues": result["issues"]}, ensure_ascii=False)
    return {
        "id": item["id"],
        "kind": item["kind"],
        "language": item["language"],
        "label": item["label"],
        "severity": item.get("severity"),
        "rules": item["rules"],
        "verdict": result["verdict"],
        "confidence": result.get("confidence"),
        "found_rules": sorted({issue["rule"] for issue in result.get("issues") or []}),
        "error": result.get("fallback_reason"),
        "seconds": round(elapsed, 3),
        # ≈ 4 characters a token (prompt + item in, answer out).
        "tokens_in": (len(sent) + 2500) // 4,
        "tokens_out": len(answer) // 4,
    }


def ratio(part: int, whole: int) -> float | None:
    return round(part / whole, 3) if whole else None


def score(results: list[dict], price_in: float = 0.0, price_out: float = 0.0) -> dict:
    """Metrics for one model's results (see the module docstring)."""
    flagged = lambda row: row["verdict"] != "valid"  # noqa: E731 — caught: a person or a decline
    by_label = defaultdict(list)
    for row in results:
        by_label[row["label"]].append(row)
    high = [row for row in by_label["violation"] if row["severity"] == "high"]
    clean = by_label["clean"]
    per_rule = {}
    for rule in audit_agent_service.RULES:
        cases = [row for row in by_label["violation"] if rule in row["rules"]]
        if cases:
            per_rule[rule] = {"items": len(cases), "recall": ratio(sum(flagged(row) for row in cases), len(cases))}
    per_language = {}
    for language in sorted({row["language"] for row in results}):
        rows = [row for row in results if row["language"] == language]
        violations = [row for row in rows if row["label"] == "violation"]
        cleans = [row for row in rows if row["label"] == "clean"]
        per_language[language] = {
            "items": len(rows),
            "violation_recall": ratio(sum(flagged(row) for row in violations), len(violations)),
            "clean_passed": ratio(sum(row["verdict"] == "valid" for row in cleans), len(cleans)),
        }
    seconds = sorted(row["seconds"] for row in results) or [0.0]
    tokens_in = sum(row["tokens_in"] for row in results)
    tokens_out = sum(row["tokens_out"] for row in results)
    cost = (tokens_in * price_in + tokens_out * price_out) / 1_000_000
    return {
        "items": len(results),
        "labels": {label: len(by_label[label]) for label in LABELS},
        "recall_high": ratio(sum(flagged(row) for row in high), len(high)),
        "recall_violations": ratio(sum(flagged(row) for row in by_label["violation"]), len(by_label["violation"])),
        "declined_high": ratio(sum(row["verdict"] == "declined" for row in high), len(high)),
        "false_declines": ratio(sum(row["verdict"] == "declined" for row in clean), len(clean)),
        "clean_to_person": ratio(sum(row["verdict"] == "unsure" for row in clean), len(clean)),
        "clean_passed": ratio(sum(row["verdict"] == "valid" for row in clean), len(clean)),
        "borderline_to_person": ratio(sum(flagged(row) for row in by_label["borderline"]), len(by_label["borderline"])),
        "rule_match": ratio(
            sum(bool(set(row["rules"]) & set(row["found_rules"])) for row in by_label["violation"] if flagged(row)),
            sum(flagged(row) for row in by_label["violation"]),
        ),
        "errors": sum(bool(row["error"]) for row in results),
        "error_kinds": dict(Counter(row["error"] for row in results if row["error"])),
        "seconds_p50": round(statistics.median(seconds), 2),
        "seconds_p95": round(seconds[min(len(seconds) - 1, int(len(seconds) * 0.95))], 2),
        "cost_per_1000": round(cost / len(results) * 1000, 4) if results else None,
        "per_rule": per_rule,
        "per_language": per_language,
        "meets_target": (ratio(sum(flagged(row) for row in high), len(high)) or 0) >= TARGET_HIGH_RECALL,
    }


def report(runs: dict[str, dict]) -> str:
    """A Markdown comparison of the models' scores."""
    percent = lambda value: "—" if value is None else f"{value * 100:.0f}%"  # noqa: E731
    lines = [
        "# Moderation benchmark",
        "",
        f"Guidelines {audit_agent_service.GUIDELINES_VERSION} · confidence bar {config.get_moderation_min_confidence()}"
        f" · target: recall on high violations ≥ {TARGET_HIGH_RECALL:.0%}",
        "",
        "| Model | High recall | All violations | False declines | Clean → person | Borderline → person | Errors | p50 / p95 s | Cost / 1k |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    for model, scores in runs.items():
        lines.append(
            f"| {model}{' ✓' if scores['meets_target'] else ''} | {percent(scores['recall_high'])} | "
            f"{percent(scores['recall_violations'])} | {percent(scores['false_declines'])} | "
            f"{percent(scores['clean_to_person'])} | {percent(scores['borderline_to_person'])} | {scores['errors']} | "
            f"{scores['seconds_p50']} / {scores['seconds_p95']} | {scores['cost_per_1000']} |"
        )
    for model, scores in runs.items():
        lines += ["", f"## {model}", "", "| Rule | Items | Recall |", "|---|---|---|"]
        lines += [f"| {rule} | {row['items']} | {percent(row['recall'])} |" for rule, row in scores["per_rule"].items()]
        lines += ["", "| Language | Items | Violations caught | Clean passed |", "|---|---|---|---|"]
        lines += [
            f"| {language} | {row['items']} | {percent(row['violation_recall'])} | {percent(row['clean_passed'])} |"
            for language, row in scores["per_language"].items()
        ]
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--dataset", type=Path, default=DATASET)
    parser.add_argument("--models", default="", help="comma-separated chat models (default: the configured one)")
    parser.add_argument("--limit", type=int, default=0, help="only the first N items (a quick run)")
    parser.add_argument("--kind", choices=("post", "comment"), help="only posts or only comments")
    parser.add_argument("--out", type=Path, default=OUT)
    parser.add_argument("--price-in", type=float, default=0.0, help="price per million input tokens")
    parser.add_argument("--price-out", type=float, default=0.0, help="price per million output tokens")
    parser.add_argument("--check", action="store_true", help="only validate the dataset")
    args = parser.parse_args(argv)

    items = load_dataset(args.dataset)
    if args.kind:
        items = [item for item in items if item["kind"] == args.kind]
    if args.limit:
        items = items[: args.limit]
    counts = Counter((item["kind"], item["label"]) for item in items)
    print(f"{len(items)} items: " + ", ".join(f"{kind}/{label} {n}" for (kind, label), n in sorted(counts.items())))
    if args.check:
        return 0

    args.out.mkdir(parents=True, exist_ok=True)
    models = [model.strip() for model in args.models.split(",") if model.strip()] or [config.get_llm_chat_model()]
    runs = {}
    for model in models:
        os.environ["QBASAIR_LLM_CHAT_MODEL"] = model
        results = []
        for index, item in enumerate(items, start=1):
            results.append(run_item(item))
            print(f"\r{model}: {index}/{len(items)}", end="", flush=True)
        print()
        runs[model] = score(results, args.price_in, args.price_out)
        safe = "".join(char if char.isalnum() or char in "-_." else "_" for char in model)
        (args.out / f"{safe}.json").write_text(
            json.dumps({"model": model, "scores": runs[model], "results": results}, ensure_ascii=False, indent=1),
            encoding="utf-8",
        )
    (args.out / "report.md").write_text(report(runs), encoding="utf-8")
    print(report(runs))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
