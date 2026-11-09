"""Prepared recitations: the sources, the preparation script and the routes
(docs/recitation-audio.md). No network: sources answer from fixtures, audio
files are synthesized with ffmpeg."""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

from src.app.core import config
from src.app.services import recitation_service
from src.app.services import recitation_sources as sources

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import build_recitations as build  # noqa: E402

HAS_FFMPEG = bool(shutil.which("ffmpeg") and shutil.which("ffprobe"))
AUDIO = {"bitrate_kbps": 64, "channels": 1, "sample_rate": 44100}


def tone(path: Path, seconds: float) -> None:
    subprocess.run(
        ["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}",
         "-c:a", "libmp3lame", "-b:a", "128k", str(path)],
        check=True,
    )


def qdc_payload(surah: int, ends: list[int], url="https://download.quranicaudio.com/qdc/x/murattal/1.mp3"):
    starts = [0, *ends[:-1]]
    return {
        "audio_files": [
            {
                "audio_url": url,
                "verse_timings": [
                    {"verse_key": f"{surah}:{n}", "timestamp_from": s, "timestamp_to": e, "segments": [[1, s, e]]}
                    for n, (s, e) in enumerate(zip(starts, ends), start=1)
                ],
            }
        ]
    }


def fake_get(routes: dict[str, object]):
    def get(url: str) -> bytes:
        for prefix, payload in routes.items():
            if url.startswith(prefix):
                return json.dumps(payload).encode()
        raise sources.SourceError(f"404 {url}")

    return get


# --- sources --------------------------------------------------------------


def test_only_source_hosts_are_fetched():
    assert sources.allowed("https://cdn.mp3quran.net/audio/x/r1/001.mp3")
    assert sources.allowed("https://download.quranicaudio.com/qdc/x/1.mp3")
    assert not sources.allowed("http://everyayah.com/data/x/001001.mp3")
    assert not sources.allowed("https://evil.example/mp3quran.net/001.mp3")
    assert not sources.allowed("https://mp3quran.net.evil.example/001.mp3")
    with pytest.raises(sources.SourceError):
        sources.http_get("https://example.com/x")
    with pytest.raises(sources.SourceError):
        sources.everyayah_surah("../etc", 1)


def test_qdc_surah_reads_verse_and_word_timings():
    get = fake_get({sources.QDC_API: qdc_payload(112, [3000, 6000, 9000, 12500])})
    found = sources.qdc_surah(7, 112, get)
    assert found.kind == "qdc" and found.audio_urls == ["https://download.quranicaudio.com/qdc/x/murattal/1.mp3"]
    assert found.verses == [(1, 0, 3000), (2, 3000, 6000), (3, 6000, 9000), (4, 9000, 12500)]
    assert found.words[0] == (1, 1, 0, 3000)


def test_incomplete_or_disordered_timings_are_refused():
    with pytest.raises(sources.SourceError):
        sources.qdc_surah(7, 112, fake_get({sources.QDC_API: qdc_payload(112, [3000, 6000, 9000])}))
    with pytest.raises(sources.SourceError):
        sources.check_verses([(1, 0, 10), (2, 5, 4), (3, 6, 9), (4, 9, 12)], 112)
    payload = qdc_payload(112, [3000, 6000, 9000, 12500], url="https://elsewhere.example/1.mp3")
    with pytest.raises(sources.SourceError):
        sources.qdc_surah(7, 112, fake_get({sources.QDC_API: payload}))


def test_mp3quran_reads_and_surah():
    get = fake_get(
        {
            f"{sources.MP3QURAN_API}/ayat_timing/reads": [
                {"id": 30, "name": "سعد الغامدي", "rewaya": "حفص عن عاصم", "folder_url": "https://cdn.mp3quran.net/audio/saad-ghamdi/r1/"},
                {"id": 70, "name": "قارئ", "rewaya": "ورش  عن نافع", "folder_url": "https://cdn.mp3quran.net/audio/someone/r2/"},
            ],
            f"{sources.MP3QURAN_API}/reciters?language=eng": {
                "reciters": [{"name": "Saad Al-Ghamdi", "moshaf": [{"server": "https://cdn.mp3quran.net/audio/saad-ghamdi/r1/", "name": "Rewayat Hafs - Murattal", "surah_list": "1,112"}]}]
            },
            f"{sources.MP3QURAN_API}/reciters?language=ar": {
                "reciters": [{"name": "سعد الغامدي", "moshaf": [{"server": "https://cdn.mp3quran.net/audio/saad-ghamdi/r1/"}]}]
            },
            f"{sources.MP3QURAN_API}/ayat_timing?surah=112&read=30": [
                {"ayah": 0, "start_time": 0, "end_time": 900},
                *({"ayah": n, "start_time": n * 1000, "end_time": n * 1000 + 1000} for n in range(1, 5)),
            ],
        }
    )
    reads = sources.mp3quran_reads(get)
    assert reads[0] == {
        "read": 30,
        "folder_url": "https://cdn.mp3quran.net/audio/saad-ghamdi/r1/",
        "name": "سعد الغامدي",
        "name_english": "Saad Al-Ghamdi",
        "riwayah": "hafs",
        "style": "murattal",
        "surahs": [1, 112],
    }
    assert reads[1]["riwayah"] == "warsh"
    found = sources.resolve({"mp3quran": 30}, 112, get, {r["read"]: r for r in reads})
    assert found.audio_urls == ["https://cdn.mp3quran.net/audio/saad-ghamdi/r1/112.mp3"]
    assert found.verses[0] == (1, 1000, 2000)  # the basmala (ayah 0) is not a verse
    with pytest.raises(sources.SourceError):
        sources.resolve({"mp3quran": 30}, 2, get, {r["read"]: r for r in reads})  # not in its list


def test_reciter_entries_discover_other_reads():
    cfg = {"reciters": [{"id": "ghamdi", "sources": [{"mp3quran": 30}]}], "discover_mp3quran": True}
    reads = [
        {"read": 30, "folder_url": "https://cdn.mp3quran.net/audio/saad-ghamdi/r1/", "name": "", "name_english": "", "riwayah": "hafs", "style": "murattal", "surahs": []},
        {"read": 70, "folder_url": "https://cdn.mp3quran.net/audio/someone/r2/", "name": "قارئ", "name_english": "Someone", "riwayah": "warsh", "style": "murattal", "surahs": []},
    ]
    entries = build.reciter_entries(cfg, reads)
    assert [entry["id"] for entry in entries] == ["ghamdi", "someone-r2"]
    assert entries[0]["name_english"] == "Saad Al-Ghamdi"  # from the built-in catalogue
    assert entries[1]["riwayah"] == "warsh" and entries[1]["sources"] == [{"mp3quran": 70}]


def test_the_configured_sources_file_is_valid():
    cfg = build.load_config()
    ids = [item["id"] for item in cfg["reciters"]]
    assert len(ids) == len(set(ids))
    for item in cfg["reciters"]:
        assert item["sources"] and all(len(source) == 1 and next(iter(source)) in ("qdc", "mp3quran", "everyayah") for source in item["sources"])


# --- preparation ----------------------------------------------------------


@pytest.mark.skipif(not HAS_FFMPEG, reason="ffmpeg is needed")
def test_prepare_from_a_whole_surah_recording(tmp_path):
    get = fake_get({sources.QDC_API: qdc_payload(112, [1000, 2000, 3000, 4000])})
    fetched = []

    def fetch(url, target):
        fetched.append(url)
        tone(target, 4.0)

    entry = {"id": "tester", "name": "x", "name_english": "x", "riwayah": "hafs", "style": "murattal", "sources": [{"qdc": 7}]}
    record = build.prepare_surah(entry, 112, tmp_path, AUDIO, {}, get, fetch)
    assert record["source"] == "qdc:7" and record["verses"][0] == [1, 0, 1000]
    assert abs(record["duration_ms"] - 4000) < 120
    assert record["words"][0] == [1, 1, 0, 1000]
    assert (tmp_path / "tester" / "112.mp3").stat().st_size == record["bytes"]
    # Done surahs are kept: a second run fetches nothing.
    assert build.prepare_surah(entry, 112, tmp_path, AUDIO, {}, get, fetch) == record
    assert len(fetched) == 1


@pytest.mark.skipif(not HAS_FFMPEG, reason="ffmpeg is needed")
def test_prepare_falls_back_to_joined_verses(tmp_path):
    # qdc's timings run far past its file: not the same recording, so the
    # verse files are joined instead.
    get = fake_get({sources.QDC_API: qdc_payload(112, [10000, 20000, 30000, 60000])})
    lengths = iter([4.0, 1.0, 1.5, 2.0, 2.5])

    def fetch(url, target):
        tone(target, next(lengths))

    entry = {"id": "joined", "name": "x", "name_english": "x", "riwayah": "hafs", "style": "murattal",
             "sources": [{"qdc": 7}, {"everyayah": "Some_Reciter_64kbps"}]}
    record = build.prepare_surah(entry, 112, tmp_path, AUDIO, {}, get, fetch)
    assert record["source"] == "everyayah:Some_Reciter_64kbps"
    starts = [start for _, start, _ in record["verses"]]
    assert [round(s / 100) for s in starts] == [0, 10, 25, 45]  # 1 s, 1.5 s, 2 s, 2.5 s verses
    assert abs(record["duration_ms"] - 7000) < 200

    catalog = build.write_catalog(tmp_path, [entry])
    assert catalog["reciters"][0]["surahs"] == [112]
    assert catalog["reciters"][0]["attribution"] == ["everyayah.com"]


def test_a_surah_no_source_has_is_skipped(tmp_path):
    entry = {"id": "nobody", "sources": [{"qdc": 7}]}
    assert build.prepare_surah(entry, 1, tmp_path, AUDIO, {}, fake_get({}), lambda *_: None) is None


# --- routes ---------------------------------------------------------------


@pytest.fixture()
def prepared(tmp_path):
    original = config.get_recitations_path()
    config.set_recitations_path(str(tmp_path))
    recitation_service.reset_cache()
    folder = tmp_path / "someone-r2"
    folder.mkdir()
    (folder / "112.mp3").write_bytes(bytes(range(256)) * 4)  # 1024 bytes
    (folder / "112.json").write_text(
        json.dumps({"duration_ms": 4000, "bytes": 1024, "version": "abc123", "attribution": "mp3quran.net",
                    "verses": [[1, 0, 1000], [2, 1000, 2000], [3, 2000, 3000], [4, 3000, 4000]]}),
        encoding="utf-8",
    )
    alafasy = tmp_path / "alafasy"
    alafasy.mkdir()
    (alafasy / "001.mp3").write_bytes(b"x")
    (alafasy / "001.json").write_text(json.dumps({"duration_ms": 1, "version": "v", "verses": [[1, 0, 1]]}), encoding="utf-8")
    (tmp_path / "catalog.json").write_text(
        json.dumps({"reciters": [
            {"id": "alafasy", "name": "x", "name_english": "x", "riwayah": "hafs", "style": "murattal", "surahs": [1], "attribution": ["Quran.com (quranicaudio.com)"]},
            {"id": "someone-r2", "name": "قارئ", "name_english": "Someone", "riwayah": "warsh", "style": "murattal", "surahs": [112], "attribution": ["mp3quran.net"]},
        ]}),
        encoding="utf-8",
    )
    try:
        yield tmp_path
    finally:
        config.set_recitations_path(original)
        recitation_service.reset_cache()


def test_reciters_list_the_prepared_ones(api_client, prepared):
    reciters = {item["id"]: item for item in api_client.get("/api/reciters").json()}
    assert reciters["alafasy"]["surahs"] == [1] and reciters["alafasy"]["audio_base"].startswith("https://everyayah.com/")
    assert reciters["husary"]["surahs"] == []
    assert reciters["someone-r2"] == {
        "id": "someone-r2", "name": "قارئ", "name_english": "Someone", "riwayah": "warsh", "style": "murattal",
        "audio_base": "", "surahs": [112], "attribution": ["mp3quran.net"],
    }


def test_surah_timings_route(api_client, prepared):
    response = api_client.get("/api/recitations/someone-r2/112")
    assert response.status_code == 200
    body = response.json()
    assert body["audio_url"] == "/api/recitations/audio/someone-r2/112.mp3?v=abc123"
    assert body["verses"][1] == {"ayah": 2, "start_ms": 1000, "end_ms": 2000}
    assert "max-age" in response.headers["cache-control"]
    assert api_client.get("/api/recitations/someone-r2/1").status_code == 404
    assert api_client.get("/api/recitations/Bad..id/112").status_code == 404
    assert api_client.get("/api/recitations/someone-r2/115").status_code == 422


def test_audio_route_serves_byte_ranges(api_client, prepared):
    full = api_client.get("/api/recitations/audio/someone-r2/112.mp3")
    assert full.status_code == 200 and len(full.content) == 1024
    assert full.headers["accept-ranges"] == "bytes" and "immutable" in full.headers["cache-control"]
    assert full.headers["cross-origin-resource-policy"] == "cross-origin"
    part = api_client.get("/api/recitations/audio/someone-r2/112.mp3", headers={"Range": "bytes=10-19"})
    assert part.status_code == 206 and part.content == bytes(range(10, 20))
    assert part.headers["content-range"] == "bytes 10-19/1024"
    tail = api_client.get("/api/recitations/audio/someone-r2/112.mp3", headers={"Range": "bytes=-4"})
    assert tail.status_code == 206 and tail.content == bytes(range(252, 256))
    assert api_client.get("/api/recitations/audio/someone-r2/112.mp3", headers={"Range": "bytes=5000-"}).status_code == 416
    assert api_client.get("/api/recitations/audio/someone-r2/113.mp3").status_code == 404
    assert api_client.get("/api/recitations/audio/someone-r2/..%2Fx.mp3").status_code in (404, 422)
