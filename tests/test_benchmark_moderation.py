"""The moderation benchmark — dataset validation and scoring (docs/moderation-benchmark.md)."""

import json

import pytest

from scripts import benchmark_moderation as bench
from src.app.services import research_agent_service


class Scripted(research_agent_service.ResearchLlmProvider):
    """Declines what contains «سب», is unsure about «ربما», passes the rest."""

    def complete_json(self, system, user, *, stage):
        if "سب" in user:
            return json.dumps({"verdict": "declined", "confidence": 0.9, "issues": [
                {"target": "comment" if stage == "moderation_comment" else "s1", "rule": "disrespect",
                 "severity": "high", "quote": "", "explanation": "x"}]})
        if "ربما" in user:
            return json.dumps({"verdict": "unsure", "confidence": 0.8, "issues": []})
        return json.dumps({"verdict": "valid", "confidence": 0.95, "issues": []})


def post(item_id, body, label="clean", rules=(), severity=None):
    return {"id": item_id, "kind": "post", "language": "ar", "label": label, "rules": list(rules), "severity": severity,
            "document": {"title": "t", "summary": "s", "sections": [{"id": "s1", "kind": "note", "body": body}]}}


def comment(item_id, text, label="clean", rules=(), severity=None, language="fr"):
    return {"id": item_id, "kind": "comment", "language": language, "label": label, "rules": list(rules),
            "severity": severity, "post": {"title": "t", "summary": "s"}, "comment": text}


@pytest.fixture
def scripted():
    research_agent_service.set_llm_provider_for_tests(Scripted())
    yield
    research_agent_service.set_llm_provider_for_tests(None)


def test_scores_recall_false_declines_and_moderator_load(scripted):
    items = [
        post("p1", "تأمل هادئ"),
        post("p2", "سب وشتم", "violation", ["disrespect"], "high"),
        post("p3", "ربما", "clean"),  # a clean item sent to a person
        comment("c1", "سب", "violation", ["harassment"], "high"),
        comment("c2", "merci", "violation", ["off_topic"], "medium"),  # missed
        comment("c3", "ربما", "borderline", ["off_topic"], "medium"),
        comment("c4", "سب", "clean"),  # a false decline
    ]
    results = [bench.run_item(item) for item in items]
    scores = bench.score(results, price_in=1.0, price_out=2.0)
    assert scores["recall_high"] == 1.0 and scores["meets_target"] is True
    assert scores["recall_violations"] == round(2 / 3, 3)
    assert scores["false_declines"] == round(1 / 3, 3)
    assert scores["clean_to_person"] == round(1 / 3, 3)
    assert scores["borderline_to_person"] == 1.0
    assert scores["per_rule"]["off_topic"] == {"items": 1, "recall": 0.0}
    assert scores["per_language"]["fr"]["items"] == 4
    assert scores["errors"] == 0 and scores["cost_per_1000"] > 0
    report = bench.report({"scripted": scores})
    assert "| scripted ✓ | 100% |" in report and "| off_topic | 1 | 0% |" in report


def test_provider_errors_fail_closed_and_are_counted():
    research_agent_service.set_llm_provider_for_tests(None)
    research_agent_service.set_llm_provider_for_tests(Scripted())

    class Down(research_agent_service.ResearchLlmProvider):
        def complete_json(self, system, user, *, stage):
            raise research_agent_service.ResearchProviderUnavailable("down")

    research_agent_service.set_llm_provider_for_tests(Down())
    try:
        row = bench.run_item(post("p1", "تأمل", "violation", ["integrity"], "high"))
    finally:
        research_agent_service.set_llm_provider_for_tests(None)
    assert row["verdict"] == "unsure" and row["error"] == "provider_unavailable"
    assert bench.score([row])["errors"] == 1


def test_dataset_validation(tmp_path):
    good = tmp_path / "good.jsonl"
    good.write_text("\n".join(json.dumps(item, ensure_ascii=False) for item in [post("a", "x"), comment("b", "y")]), encoding="utf-8")
    assert [item["id"] for item in bench.load_dataset(good)] == ["a", "b"]
    for broken in (
        {**post("c", "x"), "label": "maybe"},
        {**post("c", "x"), "rules": ["disrespect"]},  # clean with a rule
        post("c", "x", "violation", [], "high"),  # violation without a rule
        post("c", "x", "violation", ["not_a_rule"], "high"),
        {**comment("c", "y"), "post": None},
    ):
        bad = tmp_path / "bad.jsonl"
        bad.write_text(json.dumps(broken, ensure_ascii=False), encoding="utf-8")
        with pytest.raises(ValueError):
            bench.load_dataset(bad)

