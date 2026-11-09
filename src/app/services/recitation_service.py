"""The prepared recitations (scripts/build_recitations.py), as the API serves them.

``data/recitations/`` holds one MP3 and one timing file per reciter and surah
plus ``catalog.json``. This module reads them (never the network): the
reciters with their prepared surahs, a surah's verse timings and the path of
its audio. nginx serves the audio itself in production; the API's own audio
route (with byte ranges) is for development and anything not behind nginx.
"""

from __future__ import annotations

import json
import re
import threading
from pathlib import Path

from src.app.core import config
from src.app.services import reciter_service

AUDIO_ROUTE = "/api/recitations/audio"
_ID = re.compile(r"[a-z0-9][a-z0-9-]{0,63}")

_lock = threading.Lock()
_catalog_cache: tuple[float, dict] | None = None


def _root() -> Path:
    return Path(config.get_recitations_path())


def catalog() -> dict:
    """catalog.json (re-read when it changes); empty when nothing is prepared."""
    global _catalog_cache
    path = _root() / "catalog.json"
    try:
        mtime = path.stat().st_mtime
    except OSError:
        return {"reciters": []}
    with _lock:
        if _catalog_cache and _catalog_cache[0] == mtime:
            return _catalog_cache[1]
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {"reciters": []}
        _catalog_cache = (mtime, data)
        return data


def prepared_reciters() -> dict[str, dict]:
    return {entry["id"]: entry for entry in catalog().get("reciters", []) if _ID.fullmatch(str(entry.get("id", "")))}


def reciter_catalogue() -> list[dict]:
    """Every reciter: the built-in ones (verse by verse, with their prepared
    surahs when there are any), then those heard only from prepared surahs."""
    prepared = prepared_reciters()
    out = []
    for reciter in reciter_service.list_reciters():
        entry = prepared.pop(reciter["id"], None)
        out.append({**reciter, "surahs": entry["surahs"] if entry else [], "attribution": entry.get("attribution", []) if entry else []})
    for entry in prepared.values():
        out.append(
            {
                "id": entry["id"],
                "name": entry["name"],
                "name_english": entry["name_english"],
                "riwayah": entry["riwayah"],
                "style": entry["style"],
                "audio_base": "",
                "surahs": entry["surahs"],
                "attribution": entry.get("attribution", []),
            }
        )
    return out


def audio_path(reciter_id: str, surah: int) -> Path | None:
    if not _ID.fullmatch(reciter_id) or not 1 <= surah <= 114:
        return None
    path = _root() / reciter_id / f"{surah:03d}.mp3"
    return path if path.is_file() else None


def audio_url(reciter_id: str, surah: int, version: str) -> str:
    return f"{AUDIO_ROUTE}/{reciter_id}/{surah:03d}.mp3?v={version}"


def surah_timing(reciter_id: str, surah: int) -> dict | None:
    """``{reciter_id, surah, audio_url, duration_ms, bytes, attribution, verses}``
    of a prepared surah, or None."""
    if audio_path(reciter_id, surah) is None:
        return None
    try:
        record = json.loads((_root() / reciter_id / f"{surah:03d}.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return {
        "reciter_id": reciter_id,
        "surah": surah,
        "audio_url": audio_url(reciter_id, surah, str(record.get("version", ""))),
        "duration_ms": int(record["duration_ms"]),
        "bytes": int(record.get("bytes", 0)),
        "attribution": str(record.get("attribution", "")),
        "verses": [{"ayah": int(a), "start_ms": int(s), "end_ms": int(e)} for a, s, e in record["verses"]],
    }


def reset_cache() -> None:
    global _catalog_cache
    with _lock:
        _catalog_cache = None
