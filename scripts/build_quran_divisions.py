"""Build apps/web/lib/quran-divisions.generated.ts — where each juz, hizb and
quarter-hizb (rubʿ) starts in the Ḥafṣ (Madani) mushaf.

Sources:
  * juz — the repository's own Ḥafṣ source, data/quran-narrations/hafs.json
    (King Fahd Complex text, the mushaf the reader shows): where its `jozz`
    column changes. (quran.com / Tanzil differ at two juz — 4 and 11 start one
    verse later there — the printed Madani mushaf starts them at 3:92 and 9:94.)
  * hizb and quarter-hizb (rubʿ) — the quran.com API v4 (Quran Foundation, the
    Tarteel/QUL data family of the mushaf layout): each verse's `hizb_number`
    and `rub_el_hizb_number`, read juz by juz; a division starts at its first
    verse.

The quarters are checked against the King Fahd text before writing: every ۞
(U+06DE, the printed rubʿ al-ḥizb sign) must open a quarter, and every quarter
without one must open a surah (the mushaf prints no sign before a basmala) or
the Quran itself; each hizb must be four quarters. Any mismatch aborts, so the
generated table is never silently wrong.

Usage:
    python scripts/build_quran_divisions.py            # fetch, verify, write
    python scripts/build_quran_divisions.py --check    # verify the committed table only

The output is small and committed (it is data the web client ships with); the
recitation range picker (juz / hizb) and any division navigation read it.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HAFS = ROOT / "data" / "quran-narrations" / "hafs.json"
OUTPUT = ROOT / "apps" / "web" / "lib" / "quran-divisions.generated.ts"
API = "https://api.quran.com/api/v4/verses/by_juz/{juz}?per_page=50&page={page}&fields=juz_number,hizb_number,rub_el_hizb_number"
RUB_SIGN = "۞"

Key = tuple[int, int]


def fetch_json(url: str, attempts: int = 4) -> dict:
    for attempt in range(attempts):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "Q-Basair divisions build"})
            with urllib.request.urlopen(request, timeout=60) as response:
                return json.load(response)
        except OSError:
            if attempt == attempts - 1:
                raise
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError("unreachable")


def fetch_divisions() -> dict[str, list[Key]]:
    """First verse of every juz / hizb / rubʿ, from the quran.com API."""
    starts: dict[str, dict[int, Key]] = {"juz": {}, "hizb": {}, "rub": {}}
    total = 0
    for juz in range(1, 31):
        page = 1
        while page:
            data = fetch_json(API.format(juz=juz, page=page))
            for verse in data["verses"]:
                surah, ayah = (int(part) for part in verse["verse_key"].split(":"))
                key = (surah, ayah)
                for name, field in (("juz", "juz_number"), ("hizb", "hizb_number"), ("rub", "rub_el_hizb_number")):
                    number = int(verse[field])
                    if number not in starts[name] or key < starts[name][number]:
                        starts[name][number] = key
                total += 1
            page = data["pagination"].get("next_page") or 0
        print(f"juz {juz}: ok", file=sys.stderr)
    if total != 6236:
        raise SystemExit(f"expected 6236 verses, got {total}")
    out: dict[str, list[Key]] = {}
    for name, count in (("juz", 30), ("hizb", 60), ("rub", 240)):
        numbers = sorted(starts[name])
        if numbers != list(range(1, count + 1)):
            raise SystemExit(f"{name}: expected 1..{count}, got {len(numbers)} numbers")
        out[name] = [starts[name][n] for n in numbers]
    return out


def juz_starts_from_source() -> list[Key]:
    """Juz starts of the King Fahd Madani mushaf (hafs.json's jozz column)."""
    ayahs = json.loads(HAFS.read_text(encoding="utf-8"))
    order = [(int(a["sura_no"]), int(a["aya_no"])) for a in ayahs]
    return [order[0]] + [order[i] for i in range(1, len(ayahs)) if ayahs[i]["jozz"] != ayahs[i - 1]["jozz"]]


def verify(divisions: dict[str, list[Key]]) -> None:
    """Cross-check against the committed King Fahd Ḥafṣ source; raise on any mismatch."""
    ayahs = json.loads(HAFS.read_text(encoding="utf-8"))
    order = [(int(a["sura_no"]), int(a["aya_no"])) for a in ayahs]
    if len(order) != 6236:
        raise SystemExit("hafs.json: expected 6236 ayahs")

    # Juz: where the source's jozz column changes.
    if juz_starts_from_source() != divisions["juz"]:
        raise SystemExit("juz starts disagree with hafs.json")

    # A hizb is four quarters.
    if divisions["hizb"] != divisions["rub"][::4]:
        raise SystemExit("hizb starts are not every fourth quarter start")

    # Quarters: every printed ۞ opens one; the unmarked ones open a surah (or the Quran).
    marked = {order[i] for i, a in enumerate(ayahs) if RUB_SIGN in a["aya_text"]}
    rub = set(divisions["rub"])
    if not marked <= rub:
        raise SystemExit(f"{len(marked - rub)} ۞ signs fall outside the quarter starts: {sorted(marked - rub)[:5]}")
    unmarked = rub - marked
    odd = sorted(key for key in unmarked if key[1] != 1)
    if odd:
        raise SystemExit(f"quarters with no ۞ that do not open a surah: {odd[:5]}")
    # Order sanity: strictly increasing through the mushaf.
    index = {key: i for i, key in enumerate(order)}
    for name, starts in divisions.items():
        positions = [index[key] for key in starts]
        if positions != sorted(positions) or len(set(positions)) != len(positions):
            raise SystemExit(f"{name}: starts out of order")


def render(divisions: dict[str, list[Key]]) -> str:
    def rows(keys: list[Key]) -> str:
        items = [f"[{s}, {a}]" for s, a in keys]
        lines = [", ".join(items[i : i + 10]) for i in range(0, len(items), 10)]
        return "\n".join(f"  {line}," for line in lines)

    return f"""// Generated by scripts/build_quran_divisions.py — do not edit by hand.
// Sources: juz — data/quran-narrations/hafs.json (King Fahd Madani mushaf);
// hizb / quarters — quran.com API v4, verified against that text's ۞ signs.
// Ḥafṣ ʿan ʿĀṣim, Madani mushaf numbering: [surah, ayah] of each division's first verse.

export type VerseKey = readonly [surah: number, ayah: number];

/** First verse of each juz (1–30). */
export const JUZ_STARTS: readonly VerseKey[] = [
{rows(divisions["juz"])}
];

/** First verse of each hizb (1–60). */
export const HIZB_STARTS: readonly VerseKey[] = [
{rows(divisions["hizb"])}
];

/** First verse of each quarter-hizb, rubʿ al-ḥizb (1–240). */
export const RUB_STARTS: readonly VerseKey[] = [
{rows(divisions["rub"])}
];
"""


def parse_committed() -> dict[str, list[Key]]:
    text = OUTPUT.read_text(encoding="utf-8")
    out: dict[str, list[Key]] = {}
    for name, const in (("juz", "JUZ_STARTS"), ("hizb", "HIZB_STARTS"), ("rub", "RUB_STARTS")):
        block = re.search(rf"{const}: readonly VerseKey\[\] = \[(.*?)\];", text, re.S)
        if not block:
            raise SystemExit(f"{const} not found in {OUTPUT}")
        out[name] = [(int(s), int(a)) for s, a in re.findall(r"\[(\d+), (\d+)\]", block.group(1))]
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true", help="verify the committed table against hafs.json")
    args = parser.parse_args(argv)
    if args.check:
        verify(parse_committed())
        print("quran divisions: ok")
        return 0
    divisions = fetch_divisions()
    api_juz = divisions["juz"]
    divisions["juz"] = juz_starts_from_source()
    differ = [(n + 1, a, b) for n, (a, b) in enumerate(zip(api_juz, divisions["juz"])) if a != b]
    for number, api, source in differ:
        print(f"note: juz {number} starts at {source[0]}:{source[1]} in the King Fahd mushaf (quran.com: {api[0]}:{api[1]})", file=sys.stderr)
    verify(divisions)
    OUTPUT.write_text(render(divisions), encoding="utf-8", newline="\n")
    print(f"wrote {OUTPUT.relative_to(ROOT)} (30 juz, 60 hizb, 240 quarters)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
