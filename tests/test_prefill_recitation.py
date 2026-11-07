"""The recitation cache pre-fill job: option parsing, resuming, coverage."""

import importlib.util
from pathlib import Path

import pytest

from src.app.core import config

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("prefill", ROOT / "scripts" / "prefill_recitation_cache.py")
prefill = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prefill)


def test_surah_ranges():
    assert prefill.parse_surahs(None) == list(range(1, 115))
    assert prefill.parse_surahs("1-3,36, 114") == [1, 2, 3, 36, 114]
    with pytest.raises(SystemExit):
        prefill.parse_surahs("0-2")


def test_status_needs_no_network_and_unknown_reciters_are_refused(tmp_path, capsys):
    original = config.get_cache_db_path()
    config.set_cache_db_path(str(tmp_path / "cache.db"))
    try:
        assert prefill.main(["--status", "--reciters", "alafasy", "--surahs", "108"]) == 0
        assert "coverage: 0/3" in capsys.readouterr().out
        with pytest.raises(SystemExit):
            prefill.main(["--status", "--reciters", "nobody"])
    finally:
        config.set_cache_db_path(original)
