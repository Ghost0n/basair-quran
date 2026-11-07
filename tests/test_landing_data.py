"""The landing page's figures and Quran text match data/quran.db (scripts/build_landing_data.py)."""

import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("build_landing_data", ROOT / "scripts" / "build_landing_data.py")
landing = importlib.util.module_from_spec(spec)
spec.loader.exec_module(landing)


@pytest.fixture(scope="module")
def built():
    if not (ROOT / "data" / "quran.db").exists():
        pytest.skip("data/quran.db not built")
    return landing.build()


def test_committed_file_matches_the_database(built):
    committed = json.loads(landing.OUT.read_text(encoding="utf-8"))
    assert committed == built, "run: PYTHONPATH=. python scripts/build_landing_data.py"


def test_known_figures(built):
    assert built["stats"]["surahs"] == 114
    assert built["stats"]["ayahs"] == 6236
    assert built["stats"]["pages"] == 604
    assert len(built["root"]["counts"]) == 114
    assert sum(built["root"]["counts"]) == built["root"]["total"]
    assert sum(1 for count in built["root"]["counts"] if count) == built["root"]["surah_count"]
    # Every «بصائر» verse quoted on the page contains the word.
    for verse in built["basair"]:
        assert "بَص" in verse["text"]
