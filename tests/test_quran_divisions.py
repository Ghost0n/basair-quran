"""The committed juz / hizb / quarter table matches the King Fahd Ḥafṣ source."""

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("build_quran_divisions", ROOT / "scripts" / "build_quran_divisions.py")
divisions = importlib.util.module_from_spec(spec)
spec.loader.exec_module(divisions)


def test_committed_table_is_verified_against_the_mushaf_text():
    table = divisions.parse_committed()
    assert [len(table[name]) for name in ("juz", "hizb", "rub")] == [30, 60, 240]
    divisions.verify(table)  # raises on any mismatch


def test_known_madani_juz_starts():
    table = divisions.parse_committed()
    # The printed Madani mushaf starts juz 4 at «لن تنالوا البر» and juz 11 at «يعتذرون إليكم».
    assert table["juz"][3] == (3, 92)
    assert table["juz"][10] == (9, 94)
    assert table["hizb"][0] == (1, 1)
    assert table["rub"][1] == (2, 26)
