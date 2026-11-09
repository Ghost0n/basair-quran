"""Where a reciter's surah recordings come from, and their verse timings.

The player recites a whole surah from ONE audio file and follows the verses
with their timings (docs/recitation-audio.md). Those files are prepared once,
by scripts/build_recitations.py, from the first source in this order that
has the surah:

* ``qdc`` — Quran.com's chapter recordings (download.quranicaudio.com) and
  their verse timings, with word timings too (api.qurancdn.com);
* ``mp3quran`` — mp3quran.net's surah recordings (cdn.mp3quran.net) and the
  verse timings of its timed reads (every riwāyah it publishes);
* ``everyayah`` — everyayah.com's verse files, joined into one file by us;
  the timings are the joined files' own lengths.

Each adapter returns a :class:`SurahSource`. Nothing here writes files; the
fetching is a callable so tests run without the network. Only the hosts of
these sources are ever fetched (never a URL taken from a request).
"""

from __future__ import annotations

import json
import re
import urllib.request
from dataclasses import dataclass, field
from typing import Callable
from urllib.parse import urlparse

from src.app.services.recitation_cache_service import ayah_count

QDC_API = "https://api.qurancdn.com/api/qdc/audio/reciters"
MP3QURAN_API = "https://www.mp3quran.net/api/v3"
EVERYAYAH_DATA = "https://everyayah.com/data"

ALLOWED_HOSTS = (
    "api.qurancdn.com",
    "download.quranicaudio.com",
    "mp3quran.net",  # www., cdn. and the serverN. hosts
    "everyayah.com",
)

ATTRIBUTION = {
    "qdc": "Quran.com (quranicaudio.com)",
    "mp3quran": "mp3quran.net",
    "everyayah": "everyayah.com",
}

# mp3quran's riwāyah names → the keys ReciterItem.riwayah / MushafItem.riwayah use.
RIWAYAH_BY_REWAYA = {
    "حفص عن عاصم": "hafs",
    "المصحف المجود": "hafs",
    "شعبة عن عاصم": "shuba",
    "ورش عن نافع": "warsh",
    "قالون عن نافع": "qaloun",
    "الدوري عن أبي عمرو": "douri",
    "السوسي عن أبي عمرو": "sousi",
    "البزي عن ابن كثير": "bazzi",
    "قنبل عن ابن كثير": "qunbul",
    "الدوري عن الكسائي": "douri-kisai",
    "خلف عن حمزة": "khalaf",
    "هشام عن ابن عامر": "hisham",
    "ابن ذكوان عن ابن عامر": "ibn-dhakwan",
}

HttpGet = Callable[[str], bytes]


class SourceError(Exception):
    """A source that doesn't have this surah, or answers something unusable."""


def allowed(url: str) -> bool:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    return parsed.scheme == "https" and any(host == h or host.endswith("." + h) for h in ALLOWED_HOSTS)


def http_get(url: str, timeout: float = 30) -> bytes:
    if not allowed(url):
        raise SourceError(f"host not allowed: {url}")
    request = urllib.request.Request(url, headers={"User-Agent": "Q-Basair recitations"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def _json(get: HttpGet, url: str):
    if not allowed(url):
        raise SourceError(f"host not allowed: {url}")
    try:
        return json.loads(get(url))
    except SourceError:
        raise
    except Exception as error:  # network, HTTP error, not JSON
        raise SourceError(f"{url}: {error}") from error


@dataclass
class SurahSource:
    """One surah of one reciter, as a source publishes it."""

    kind: str
    surah: int
    # One URL (a whole-surah recording) or one per verse (to be joined).
    audio_urls: list[str]
    # (ayah, start_ms, end_ms) for a whole-surah recording; None when the
    # verses are joined (their timings come from the joined files).
    verses: list[tuple[int, int, int]] | None
    # (ayah, word, start_ms, end_ms) when the source times words (qdc).
    words: list[tuple[int, int, int, int]] = field(default_factory=list)

    @property
    def attribution(self) -> str:
        return ATTRIBUTION[self.kind]


def check_verses(verses: list[tuple[int, int, int]], surah: int) -> None:
    """Every verse of the surah, once, in order, each with a start before its end."""
    count = ayah_count(surah)
    if [ayah for ayah, _, _ in verses] != list(range(1, count + 1)):
        raise SourceError(f"surah {surah}: expected verses 1..{count}, got {len(verses)}")
    previous = -1
    for ayah, start, end in verses:
        if start < 0 or end <= start or start < previous:
            raise SourceError(f"surah {surah}: verse {ayah} timing {start}..{end} out of order")
        previous = start


# --- qdc ------------------------------------------------------------------


def qdc_surah(recitation_id: int, surah: int, get: HttpGet = http_get) -> SurahSource:
    payload = _json(get, f"{QDC_API}/{int(recitation_id)}/audio_files?chapter={int(surah)}&segments=true")
    files = payload.get("audio_files") or []
    if not files or not files[0].get("audio_url"):
        raise SourceError(f"qdc {recitation_id}: no file for surah {surah}")
    entry = files[0]
    verses: list[tuple[int, int, int]] = []
    words: list[tuple[int, int, int, int]] = []
    for timing in entry.get("verse_timings") or []:
        chapter, _, ayah = str(timing.get("verse_key", "")).partition(":")
        if not ayah.isdigit() or int(chapter or 0) != surah:
            continue
        verses.append((int(ayah), int(timing["timestamp_from"]), int(timing["timestamp_to"])))
        for segment in timing.get("segments") or []:
            if isinstance(segment, list) and len(segment) == 3:
                words.append((int(ayah), int(segment[0]), int(segment[1]), int(segment[2])))
    verses.sort()
    check_verses(verses, surah)
    url = entry["audio_url"]
    if not allowed(url):
        raise SourceError(f"qdc {recitation_id}: audio host not allowed: {url}")
    return SurahSource("qdc", surah, [url], verses, words)


# --- mp3quran -------------------------------------------------------------


def mp3quran_reads(get: HttpGet = http_get) -> list[dict]:
    """mp3quran's timed reads, with each read's names (Arabic, English), style
    and riwāyah: ``[{read, folder_url, name, name_english, riwayah, style, surahs}]``."""
    reads = _json(get, f"{MP3QURAN_API}/ayat_timing/reads")
    by_folder: dict[str, dict] = {}
    for language, key in (("ar", "name"), ("eng", "name_english")):
        payload = _json(get, f"{MP3QURAN_API}/reciters?language={language}")
        for reciter in payload.get("reciters") or []:
            for moshaf in reciter.get("moshaf") or []:
                folder = str(moshaf.get("server", "")).rstrip("/") + "/"
                entry = by_folder.setdefault(folder, {})
                entry[key] = str(reciter.get("name", "")).strip()
                if language == "eng":
                    entry["style"] = "mujawwad" if "mujawwad" in str(moshaf.get("name", "")).lower() else "murattal"
                    entry["surahs"] = [int(n) for n in str(moshaf.get("surah_list", "")).split(",") if n.strip().isdigit()]
    out = []
    for read in reads:
        folder = str(read.get("folder_url", "")).rstrip("/") + "/"
        if not allowed(folder):
            continue
        rewaya = re.sub(r"\s+", " ", str(read.get("rewaya", ""))).strip()
        known = by_folder.get(folder, {})
        style = "mujawwad" if rewaya == "المصحف المجود" else known.get("style", "murattal")
        out.append(
            {
                "read": int(read["id"]),
                "folder_url": folder,
                "name": known.get("name") or str(read.get("name", "")).strip(),
                "name_english": known.get("name_english") or "",
                "riwayah": RIWAYAH_BY_REWAYA.get(rewaya, "other"),
                "style": style,
                "surahs": known.get("surahs") or list(range(1, 115)),
            }
        )
    return out


def mp3quran_surah(read: int, folder_url: str, surah: int, get: HttpGet = http_get) -> SurahSource:
    timings = _json(get, f"{MP3QURAN_API}/ayat_timing?surah={int(surah)}&read={int(read)}")
    if not isinstance(timings, list):
        raise SourceError(f"mp3quran {read}: no timings for surah {surah}")
    verses = sorted(
        (int(row["ayah"]), int(row["start_time"]), int(row["end_time"]))
        for row in timings
        if int(row.get("ayah", 0)) >= 1
    )
    check_verses(verses, surah)
    url = f"{folder_url.rstrip('/')}/{surah:03d}.mp3"
    if not allowed(url):
        raise SourceError(f"mp3quran {read}: audio host not allowed: {url}")
    return SurahSource("mp3quran", surah, [url], verses)


# --- everyayah ------------------------------------------------------------


def everyayah_surah(folder: str, surah: int) -> SurahSource:
    if not re.fullmatch(r"[A-Za-z0-9_.\-]+", folder):
        raise SourceError(f"everyayah folder not valid: {folder}")
    urls = [f"{EVERYAYAH_DATA}/{folder}/{surah:03d}{ayah:03d}.mp3" for ayah in range(1, ayah_count(surah) + 1)]
    return SurahSource("everyayah", surah, urls, None)


def resolve(source: dict, surah: int, get: HttpGet = http_get, reads: dict[int, dict] | None = None) -> SurahSource:
    """The surah from one configured source (``{"qdc": 7}``, ``{"mp3quran": 123}``
    or ``{"everyayah": "Alafasy_128kbps"}``)."""
    if "qdc" in source:
        return qdc_surah(int(source["qdc"]), surah, get)
    if "mp3quran" in source:
        read = int(source["mp3quran"])
        info = (reads or {}).get(read)
        if not info:
            raise SourceError(f"mp3quran {read}: not a timed read")
        if surah not in info["surahs"]:
            raise SourceError(f"mp3quran {read}: no surah {surah}")
        return mp3quran_surah(read, info["folder_url"], surah, get)
    if "everyayah" in source:
        return everyayah_surah(str(source["everyayah"]), surah)
    raise SourceError(f"unknown source: {source}")
