"""Verse audio durations — computed once on the server, shared by every user.

The recitation bar shows the whole surah's length, which needs each verse's
duration. Those never change for a reciter's file, so instead of every player
reading hundreds of audio headers, the server reads them once (the first
16 KB of each MP3 — see audio_duration), stores them in the shared cache
database (``data/cache.db``, a runtime artifact like ``app_data.db`` but never
user data), and serves them to everyone. The route marks a complete surah as
immutable, so browsers and any CDN keep it too.

A request never waits on the network: it returns what is stored and, when the
surah is incomplete, starts ONE background job for it (concurrent requests for
the same surah share that job); the client asks again a moment later.
"""

from __future__ import annotations

import logging
import sqlite3
import threading
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Callable
from urllib.parse import urlparse

from src.app.core import config
from src.app.services import reciter_service
from src.app.services.audio_duration import id3v2_size, mp3_duration

logger = logging.getLogger("qbasair.recitation_cache")

# Ayah count of each surah, Ḥafṣ ʿan ʿĀṣim — the numbering the per-verse audio follows.
SURAH_AYAHS = [
    7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
    112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85,
    54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13,
    14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42,
    29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11,
    11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
]

# Only the audio hosts of the reciter catalogue are ever fetched (never a URL
# derived from request input).
ALLOWED_AUDIO_HOSTS = {"everyayah.com"}

HEAD_BYTES = 16384
FETCH_TIMEOUT_SECONDS = 12
WORKERS = 6

# (url, byte range start, byte range end) -> (bytes, total file size)
Fetcher = Callable[[str, int, int], tuple[bytes, int]]

_inflight: set[tuple[str, int]] = set()
_inflight_lock = threading.Lock()


def _connect() -> sqlite3.Connection:
    path = Path(config.get_cache_db_path())
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path, timeout=10)
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS recitation_durations (
            reciter_id TEXT NOT NULL,
            surah INTEGER NOT NULL,
            ayah INTEGER NOT NULL,
            seconds REAL NOT NULL,
            measured_at INTEGER NOT NULL,
            PRIMARY KEY (reciter_id, surah, ayah)
        )
        """
    )
    return connection


def ayah_count(surah: int) -> int:
    return SURAH_AYAHS[surah - 1] if 1 <= surah <= 114 else 0


def _reciter(reciter_id: str) -> dict | None:
    return next((item for item in reciter_service.list_reciters() if item["id"] == reciter_id), None)


def audio_url(reciter: dict, surah: int, ayah: int) -> str:
    return f"{reciter['audio_base']}/{surah:03d}{ayah:03d}.mp3"


def _allowed(url: str) -> bool:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    return parsed.scheme == "https" and (host in ALLOWED_AUDIO_HOSTS or any(host.endswith("." + h) for h in ALLOWED_AUDIO_HOSTS))


def http_range_fetch(url: str, start: int, end: int) -> tuple[bytes, int]:
    """Bytes ``start..end`` of ``url`` and the file's total size."""
    request = urllib.request.Request(url, headers={"Range": f"bytes={start}-{end}", "User-Agent": "Q-Basair durations"})
    with urllib.request.urlopen(request, timeout=FETCH_TIMEOUT_SECONDS) as response:
        data = response.read(end - start + 1)
        content_range = response.headers.get("Content-Range", "")
        if "/" in content_range:
            total = int(content_range.rsplit("/", 1)[1])
        else:  # Range ignored: the whole file came back.
            total = int(response.headers.get("Content-Length") or len(data))
    return data, total


def measure(url: str, fetch: Fetcher = http_range_fetch) -> float | None:
    """One verse's duration from the start of its file."""
    if not _allowed(url):
        raise ValueError(f"audio host not allowed: {url}")
    head, total = fetch(url, 0, HEAD_BYTES - 1)
    tag = id3v2_size(head)
    if tag and tag + 4 > len(head):
        # A large ID3 tag (cover art): read from where the audio starts.
        head, total = fetch(url, tag, tag + HEAD_BYTES - 1)
        return mp3_duration(head, total, audio_start=tag)
    return mp3_duration(head, total)


def stored_durations(reciter_id: str, surah: int) -> list[float | None]:
    """The stored durations of every verse of the surah (None = not measured yet)."""
    count = ayah_count(surah)
    out: list[float | None] = [None] * count
    with _connect() as connection:
        for ayah, seconds in connection.execute(
            "SELECT ayah, seconds FROM recitation_durations WHERE reciter_id = ? AND surah = ?", (reciter_id, surah)
        ):
            if 1 <= ayah <= count:
                out[ayah - 1] = seconds
    return out


def _fill(reciter: dict, surah: int, missing: list[int], fetch: Fetcher) -> None:
    started = time.time()

    def one(ayah: int) -> tuple[int, float | None]:
        try:
            return ayah, measure(audio_url(reciter, surah, ayah), fetch)
        except Exception:  # a verse that can't be read stays unknown; the client estimates it
            return ayah, None

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        results = [row for row in pool.map(one, missing) if row[1] and row[1] > 0]
    now = int(time.time())
    with _connect() as connection:
        connection.executemany(
            "INSERT OR REPLACE INTO recitation_durations (reciter_id, surah, ayah, seconds, measured_at) VALUES (?, ?, ?, ?, ?)",
            [(reciter["id"], surah, ayah, round(seconds, 3), now) for ayah, seconds in results],
        )
    logger.info(
        "durations %s:%s — %d/%d measured in %.1fs", reciter["id"], surah, len(results), len(missing), time.time() - started
    )


def surah_durations(
    reciter_id: str,
    surah: int,
    *,
    fetch: Fetcher = http_range_fetch,
    background: bool = True,
) -> tuple[list[float | None], bool] | None:
    """(durations, complete) for a reciter's surah, or None for an unknown reciter.

    Missing verses are measured by one job per (reciter, surah): in a
    background thread by default, inline when ``background`` is False (tests).
    """
    reciter = _reciter(reciter_id)
    if reciter is None or ayah_count(surah) == 0:
        return None
    durations = stored_durations(reciter_id, surah)
    missing = [index + 1 for index, value in enumerate(durations) if value is None]
    if not missing:
        return durations, True

    key = (reciter_id, surah)
    with _inflight_lock:
        if key in _inflight:
            return durations, False
        _inflight.add(key)

    def job() -> None:
        try:
            _fill(reciter, surah, missing, fetch)
        finally:
            with _inflight_lock:
                _inflight.discard(key)

    if background:
        threading.Thread(target=job, name=f"durations-{reciter_id}-{surah}", daemon=True).start()
        return durations, False
    job()
    durations = stored_durations(reciter_id, surah)
    return durations, all(value is not None for value in durations)
