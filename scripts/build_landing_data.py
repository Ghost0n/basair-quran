"""Write apps/web/features/site/landing-data.json — the real figures and Quran
text the public landing page shows (docs/public-site.md).

The landing page is static, so its data is extracted once from data/quran.db
(Ḥafṣ, mushaf 2) instead of being typed by hand: the Quran in numbers, the
spread of the root ب ص ر (the root of «بصائر») over the 114 surahs, and the
exact verses its phone mockups display. Re-run after a database rebuild;
``--check`` fails when the committed file no longer matches the database.

    python scripts/build_landing_data.py [--check]
"""

from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.app.core import config  # noqa: E402
from src.app.services import quran_service  # noqa: E402
from src.app.services.reciter_service import RECITERS  # noqa: E402

OUT = ROOT / "apps" / "web" / "features" / "site" / "landing-data.json"
MUSHAF = 2  # Ḥafṣ
NAME_ROOT = "بصر"
# The verses with «بصائر» (the app's name), and Al-Fātiḥa for the reader mockup.
BASAIR_VERSES = [(6, 104), (7, 203), (17, 102), (28, 43), (45, 20)]
# The verses the study mockup cites (on insight, «بصيرة»).
STUDY_VERSES = [(12, 108), (75, 14)]


def build() -> dict:
    connection = sqlite3.connect(config.get_db_path())
    connection.row_factory = sqlite3.Row
    cursor = connection.cursor()
    one = lambda sql, *args: cursor.execute(sql, args).fetchone()[0]  # noqa: E731

    names = {row["id"]: row["name_arabic"] for row in cursor.execute("SELECT id, name_arabic FROM surahs ORDER BY id")}
    distribution = quran_service.build_root_distribution(cursor, NAME_ROOT, MUSHAF)
    counts = {item["surah_id"]: item["count"] for item in distribution["surahs"]}

    def verse(surah: int, ayah: int) -> dict:
        text = one("SELECT text_uthmani FROM ayahs WHERE mushaf_id = ? AND surah_id = ? AND number_in_surah = ?", MUSHAF, surah, ayah)
        return {"surah": surah, "ayah": ayah, "surah_name": names[surah], "text": text}

    data = {
        "_source": "scripts/build_landing_data.py (data/quran.db, mushaf 2) — do not edit by hand",
        "stats": {
            "surahs": len(names),
            "ayahs": one("SELECT COUNT(*) FROM ayahs WHERE mushaf_id = ?", MUSHAF),
            "words": one("SELECT COUNT(*) FROM ayah_words WHERE mushaf_id = ?", MUSHAF),
            "roots": one("SELECT COUNT(*) FROM roots"),
            "pages": one("SELECT MAX(page) FROM ayahs WHERE mushaf_id = ?", MUSHAF),
            "reciters": len(RECITERS),
        },
        "root": {
            "root": distribution["root"],
            "total": distribution["total"],
            "surah_count": distribution["surah_count"],
            "counts": [counts.get(surah, 0) for surah in sorted(names)],
        },
        "surah_names": [names[surah] for surah in sorted(names)],
        "fatiha": [verse(1, ayah)["text"] for ayah in range(1, 8)],
        "basair": [verse(surah, ayah) for surah, ayah in BASAIR_VERSES],
        "study": [verse(surah, ayah) for surah, ayah in STUDY_VERSES],
    }
    connection.close()
    return data


def main() -> int:
    text = json.dumps(build(), ensure_ascii=False, indent=1) + "\n"
    if "--check" in sys.argv:
        if not OUT.exists() or OUT.read_text(encoding="utf-8") != text:
            print(f"{OUT.relative_to(ROOT)} is out of date — run: python scripts/build_landing_data.py", file=sys.stderr)
            return 1
        print("landing data up to date")
        return 0
    OUT.write_text(text, encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
