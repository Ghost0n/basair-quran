"""Verse audio durations: the MP3 header parser, the shared server cache, the route."""

import sqlite3

import pytest

from src.app.core import config
from src.app.services import audio_duration, recitation_cache_service as cache

# MPEG-1 Layer III, 128 kbps, 44.1 kHz, stereo, no CRC.
FRAME_128K = bytes([0xFF, 0xFB, 0x90, 0x00])


def id3(size: int) -> bytes:
    syncsafe = bytes([(size >> 21) & 0x7F, (size >> 14) & 0x7F, (size >> 7) & 0x7F, size & 0x7F])
    return b"ID3\x04\x00\x00" + syncsafe + b"\x00" * size


def test_cbr_duration_from_size_and_bitrate():
    head = FRAME_128K + b"\x00" * 400
    # 160,000 audio bytes at 128 kbps = 10 s.
    assert audio_duration.mp3_duration(head, 160_000) == pytest.approx(10.0)


def test_id3_tag_is_skipped():
    tag = id3(1000)
    head = tag + FRAME_128K + b"\x00" * 400
    assert audio_duration.id3v2_size(head) == len(tag)
    assert audio_duration.mp3_duration(head, len(tag) + 160_000) == pytest.approx(10.0)


def test_xing_frame_count_wins_for_vbr():
    frame = bytearray(FRAME_128K + b"\x00" * 200)
    offset = 4 + 32  # side information of a stereo MPEG-1 frame
    frame[offset : offset + 4] = b"Xing"
    frame[offset + 4 : offset + 8] = (1).to_bytes(4, "big")  # frames field present
    frame[offset + 8 : offset + 12] = (1000).to_bytes(4, "big")
    assert audio_duration.mp3_duration(bytes(frame), 999_999) == pytest.approx(1000 * 1152 / 44100)


def test_no_frame_no_duration():
    assert audio_duration.mp3_duration(b"\x00" * 100, 5000) is None


def test_only_catalogue_audio_hosts_are_fetched():
    with pytest.raises(ValueError):
        cache.measure("https://example.com/001001.mp3", lambda *_: (b"", 0))
    with pytest.raises(ValueError):
        cache.measure("http://everyayah.com/data/x/001001.mp3", lambda *_: (b"", 0))


@pytest.fixture()
def cache_db(tmp_path):
    original = config.get_cache_db_path()
    config.set_cache_db_path(str(tmp_path / "cache.db"))
    try:
        yield tmp_path / "cache.db"
    finally:
        config.set_cache_db_path(original)


def test_surah_measured_once_then_served_from_cache(cache_db):
    calls: list[str] = []

    def fetch(url, start, end):
        calls.append(url)
        # 16,000 audio bytes at 128 kbps = 1 s per verse.
        return FRAME_128K + b"\x00" * 100, 16_000

    durations, complete = cache.surah_durations("alafasy", 108, fetch=fetch, background=False)
    assert complete is True
    assert durations == [pytest.approx(1.0)] * 3  # al-Kawthar: 3 verses
    assert len(calls) == 3
    assert calls[0].endswith("/108001.mp3")

    calls.clear()
    again, complete = cache.surah_durations("alafasy", 108, fetch=fetch, background=False)
    assert complete is True and again == durations
    assert calls == []  # served from the shared cache, no network


def test_unreadable_verses_stay_unknown(cache_db):
    def fetch(url, start, end):
        if url.endswith("108002.mp3"):
            raise OSError("unreachable")
        return FRAME_128K + b"\x00" * 100, 16_000

    durations, complete = cache.surah_durations("alafasy", 108, fetch=fetch, background=False)
    assert complete is False
    assert durations[1] is None and durations[0] == pytest.approx(1.0)


def test_unknown_reciter_or_surah(cache_db):
    assert cache.surah_durations("nobody", 1, fetch=lambda *_: (b"", 0), background=False) is None
    assert cache.surah_durations("alafasy", 115, fetch=lambda *_: (b"", 0), background=False) is None


def test_route_serves_a_complete_surah_as_immutable(api_client, cache_db):
    # Pre-filled cache: the route answers without any network access.
    with sqlite3.connect(cache_db) as connection:
        cache._connect().close()
        connection.executemany(
            "INSERT INTO recitation_durations (reciter_id, surah, ayah, seconds, measured_at) VALUES (?, ?, ?, ?, 0)",
            [("alafasy", 108, 1, 4.5), ("alafasy", 108, 2, 3.25), ("alafasy", 108, 3, 6.0)],
        )
    response = api_client.get("/api/reciters/alafasy/durations/108")
    assert response.status_code == 200
    assert response.json() == {"reciter_id": "alafasy", "surah": 108, "durations": [4.5, 3.25, 6.0], "complete": True}
    assert "immutable" in response.headers["cache-control"]


def test_route_validation(api_client, cache_db):
    assert api_client.get("/api/reciters/nobody/durations/1").status_code == 404
    assert api_client.get("/api/reciters/alafasy/durations/115").status_code == 422
    assert api_client.get("/api/reciters/alafasy/durations/0").status_code == 422
