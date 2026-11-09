"""Prepare the recitations the player streams: one MP3 and one timing file per
reciter and surah, plus a catalogue (docs/recitation-audio.md).

Each surah comes from the first source in scripts/recitation_sources.json that
has it (Quran.com, mp3quran.net, or everyayah.com verse files joined), and is
encoded once, the same way for every reciter (constant bitrate, so players
seek exactly; no tags or cover art). Done surahs are kept: a run only
prepares what is missing (resumable), ``--force`` redoes them.

    python scripts/build_recitations.py                       # every reciter, every surah
    python scripts/build_recitations.py --reciters configured           # only those listed in the sources file
    python scripts/build_recitations.py --reciters alafasy,ghamdi --surahs 1,36,112-114
    python scripts/build_recitations.py --list                # the reciters it would prepare
    python scripts/build_recitations.py --catalog-only        # rewrite catalog.json from what is on disk

Output (QBASAIR_RECITATIONS_PATH, default data/recitations/ — a runtime
artifact, never committed; nginx serves the audio):

    <reciter>/<SSS>.mp3     the surah
    <reciter>/<SSS>.json    {duration_ms, verses: [[ayah, start_ms, end_ms]], words?, source, version}
    catalog.json            the reciters, their names, riwāyah, style and prepared surahs

Needs ffmpeg and ffprobe.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Callable

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.app.core import config  # noqa: E402
from src.app.services import reciter_service  # noqa: E402
from src.app.services import recitation_sources as sources  # noqa: E402
from src.app.services.recitation_cache_service import ayah_count  # noqa: E402

logger = logging.getLogger("qbasair.build_recitations")

SOURCES_FILE = Path(__file__).resolve().parent / "recitation_sources.json"
CATALOG = "catalog.json"
# Timings may run a little past a re-encoded file's end; beyond this the file
# and its timings don't belong together.
END_TOLERANCE_MS = 3000

Download = Callable[[str, Path], None]


def download(url: str, target: Path) -> None:
    if not sources.allowed(url):
        raise sources.SourceError(f"host not allowed: {url}")
    request = urllib.request.Request(url, headers={"User-Agent": "Q-Basair recitations"})
    with urllib.request.urlopen(request, timeout=120) as response, open(target, "wb") as handle:
        shutil.copyfileobj(response, handle, length=1 << 20)


def probe_ms(path: Path) -> int:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)],
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()
    return int(round(float(out) * 1000))


def _lame(audio: dict) -> list[str]:
    return [
        "-ac", str(audio["channels"]), "-ar", str(audio["sample_rate"]),
        "-c:a", "libmp3lame", "-b:a", f"{audio['bitrate_kbps']}k", "-id3v2_version", "0",
    ]


def encode(source: Path, target: Path, audio: dict) -> None:
    """The recording as an MP3 at constant bitrate, without tags or cover art."""
    subprocess.run(
        ["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(source), "-vn", "-map", "0:a:0", "-map_metadata", "-1",
         *_lame(audio), str(target)],
        check=True,
        capture_output=True,
    )


def join(inputs: list[Path], target: Path, audio: dict, workdir: Path) -> list[int]:
    """Verse files joined into one MP3; returns each verse's length (ms).

    Every verse is decoded to raw samples first, so its length is exact (an
    MP3's own length counts its encoder padding: ~25-50 ms a verse, seconds
    by the end of a long surah) and the joins carry no padding."""
    rate, channels = int(audio["sample_rate"]), int(audio["channels"])
    raw = workdir / "surah.raw"
    lengths = []
    with open(raw, "wb") as joined:
        for path in inputs:
            pcm = subprocess.run(
                ["ffmpeg", "-nostdin", "-v", "error", "-i", str(path), "-vn", "-ac", str(channels), "-ar", str(rate),
                 "-f", "s16le", "-"],
                check=True,
                capture_output=True,
            ).stdout
            joined.write(pcm)
            lengths.append(round(len(pcm) / (2 * channels * rate) * 1000))
    subprocess.run(
        ["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "s16le", "-ac", str(channels), "-ar", str(rate),
         "-i", str(raw), *_lame(audio), str(target)],
        check=True,
        capture_output=True,
    )
    return lengths


def load_config(path: Path = SOURCES_FILE) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _slug(folder_url: str) -> str:
    parts = [part for part in folder_url.rstrip("/").split("/") if part]
    name, take = (parts[-2], parts[-1]) if len(parts) >= 2 else (parts[-1], "r1")
    slug = re.sub(r"[^a-z0-9-]+", "-", name.lower()).strip("-")
    return slug if take == "r1" else f"{slug}-{take}"


def reciter_entries(cfg: dict, reads: list[dict]) -> list[dict]:
    """The reciters to prepare: the configured ones (names from the built-in
    catalogue when they have none), then — with discover_mp3quran — every
    other timed mp3quran read."""
    builtin = {item["id"]: item for item in reciter_service.list_reciters()}
    entries: list[dict] = []
    used_reads: set[int] = set()
    for item in cfg.get("reciters", []):
        base = builtin.get(item["id"], {})
        entry = {
            "id": item["id"],
            "name": item.get("name") or base.get("name") or item["id"],
            "name_english": item.get("name_english") or base.get("name_english") or item["id"],
            "riwayah": item.get("riwayah") or base.get("riwayah") or "hafs",
            "style": item.get("style") or base.get("style") or "murattal",
            "sources": item["sources"],
        }
        entries.append(entry)
        used_reads.update(int(source["mp3quran"]) for source in item["sources"] if "mp3quran" in source)
    if cfg.get("discover_mp3quran"):
        taken = {entry["id"] for entry in entries}
        for read in reads:
            if read["read"] in used_reads:
                continue
            reciter_id = _slug(read["folder_url"])
            if reciter_id in taken:
                reciter_id = f"{reciter_id}-{read['read']}"
            taken.add(reciter_id)
            entries.append(
                {
                    "id": reciter_id,
                    "name": read["name"],
                    "name_english": read["name_english"] or reciter_id,
                    "riwayah": read["riwayah"],
                    "style": read["style"],
                    "sources": [{"mp3quran": read["read"]}],
                }
            )
    return entries


def _write_atomic(target: Path, data: bytes) -> None:
    tmp = target.with_suffix(target.suffix + ".part")
    tmp.write_bytes(data)
    os.replace(tmp, target)


def prepare_surah(
    entry: dict,
    surah: int,
    out_dir: Path,
    audio: dict,
    reads: dict[int, dict],
    get: sources.HttpGet = sources.http_get,
    fetch: Download = download,
    force: bool = False,
) -> dict | None:
    """Prepare one surah of one reciter from its first source that has it.
    Returns its timing record (None when no source has it)."""
    folder = out_dir / entry["id"]
    folder.mkdir(parents=True, exist_ok=True)
    timing_path = folder / f"{surah:03d}.json"
    audio_path = folder / f"{surah:03d}.mp3"
    if not force and timing_path.exists() and audio_path.exists():
        existing = json.loads(timing_path.read_text(encoding="utf-8"))
        if existing.get("bitrate_kbps") == audio["bitrate_kbps"] and existing.get("channels") == audio["channels"]:
            return existing

    for source in entry["sources"]:
        try:
            found = sources.resolve(source, surah, get, reads)
        except sources.SourceError as error:
            logger.info("%s %s: %s", entry["id"], surah, error)
            continue
        with tempfile.TemporaryDirectory(dir=out_dir, prefix=".work-") as work:
            workdir = Path(work)
            try:
                inputs = []
                for index, url in enumerate(found.audio_urls):
                    target = workdir / f"{index:04d}.mp3"
                    fetch(url, target)
                    inputs.append(target)
                encoded = workdir / "surah.mp3"
                if found.verses is None:
                    # Joined verse files: each verse lasts as long as its samples.
                    verses, at = [], 0
                    for ayah, length in enumerate(join(inputs, encoded, audio, workdir), start=1):
                        verses.append((ayah, at, at + length))
                        at += length
                else:
                    verses = found.verses
                    encode(inputs[0], encoded, audio)
                duration = probe_ms(encoded)
            except (OSError, subprocess.CalledProcessError, ValueError, sources.SourceError) as error:
                logger.warning("%s %s from %s failed: %s", entry["id"], surah, found.kind, error)
                continue
            if verses[-1][2] > duration + END_TOLERANCE_MS:
                logger.warning("%s %s from %s: timings end at %sms, audio at %sms", entry["id"], surah, found.kind, verses[-1][2], duration)
                continue
            data = encoded.read_bytes()
            record = {
                "reciter": entry["id"],
                "surah": surah,
                "source": f"{found.kind}:{next(iter(source.values()))}",
                "attribution": found.attribution,
                "bitrate_kbps": audio["bitrate_kbps"],
                "channels": audio["channels"],
                "duration_ms": duration,
                "bytes": len(data),
                "version": hashlib.sha1(data).hexdigest()[:12],
                "verses": [[ayah, start, min(end, duration)] for ayah, start, end in verses],
            }
            if found.words:
                record["words"] = [list(word) for word in found.words]
            _write_atomic(audio_path, data)
            _write_atomic(timing_path, json.dumps(record, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
            return record
    return None


def write_catalog(out_dir: Path, entries: list[dict]) -> dict:
    """catalog.json: every reciter with at least one prepared surah."""
    reciters = []
    for entry in entries:
        folder = out_dir / entry["id"]
        surahs, size, credits = [], 0, set()
        for timing in sorted(folder.glob("[0-9][0-9][0-9].json")) if folder.is_dir() else []:
            if not (folder / f"{timing.stem}.mp3").exists():
                continue
            record = json.loads(timing.read_text(encoding="utf-8"))
            surahs.append(int(timing.stem))
            size += int(record.get("bytes", 0))
            credits.add(record.get("attribution", ""))
        if not surahs:
            continue
        reciters.append(
            {
                "id": entry["id"],
                "name": entry["name"],
                "name_english": entry["name_english"],
                "riwayah": entry["riwayah"],
                "style": entry["style"],
                "surahs": surahs,
                "bytes": size,
                "attribution": sorted(credit for credit in credits if credit),
            }
        )
    catalog = {"generated_at": int(time.time()), "reciters": reciters}
    _write_atomic(out_dir / CATALOG, json.dumps(catalog, ensure_ascii=False, indent=1).encode("utf-8"))
    return catalog


def _parse_surahs(raw: str | None) -> list[int]:
    if not raw:
        return list(range(1, 115))
    out: set[int] = set()
    for part in raw.split(","):
        start, _, end = part.strip().partition("-")
        first, last = int(start), int(end or start)
        out.update(n for n in range(first, last + 1) if 1 <= n <= 114)
    return sorted(out)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--reciters",
        help="comma-separated reciter ids, 'configured' (those listed in recitation_sources.json) or 'all' (default)",
    )
    parser.add_argument("--surahs", help="e.g. 1,36,112-114 (default: all)")
    parser.add_argument("--out", help="output directory (default: QBASAIR_RECITATIONS_PATH or data/recitations)")
    parser.add_argument("--workers", type=int, default=3)
    parser.add_argument("--force", action="store_true", help="prepare done surahs again")
    parser.add_argument("--list", action="store_true", help="list the reciters and exit")
    parser.add_argument("--catalog-only", action="store_true", help="only rewrite catalog.json")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    cfg = load_config()
    audio = cfg["audio"]
    read_list = sources.mp3quran_reads() if cfg.get("discover_mp3quran") or any(
        "mp3quran" in source for item in cfg["reciters"] for source in item["sources"]
    ) else []
    reads = {read["read"]: read for read in read_list}
    entries = reciter_entries(cfg, read_list)
    configured = {item["id"] for item in cfg["reciters"]}
    if args.reciters == "configured":
        selected = [entry for entry in entries if entry["id"] in configured]
    elif args.reciters and args.reciters != "all":
        wanted = {value.strip() for value in args.reciters.split(",") if value.strip()}
        unknown = wanted - {entry["id"] for entry in entries}
        if unknown:
            parser.error(f"unknown reciters: {', '.join(sorted(unknown))}")
        selected = [entry for entry in entries if entry["id"] in wanted]
    else:
        selected = entries
    if args.list:
        for entry in entries:
            print(f"{entry['id']:32} {entry['riwayah']:8} {entry['style']:9} {entry['name_english']} — {entry['name']}")
        print(f"{len(entries)} reciters")
        return 0

    out_dir = Path(args.out or config.get_recitations_path())
    out_dir.mkdir(parents=True, exist_ok=True)
    if not args.catalog_only:
        if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
            parser.error("ffmpeg and ffprobe are needed")
        surahs = _parse_surahs(args.surahs)
        jobs = [(entry, surah) for entry in selected for surah in surahs]
        done = failed = 0
        started = time.time()

        def run(job):
            entry, surah = job
            return job, prepare_surah(entry, surah, out_dir, audio, reads, force=args.force)

        with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
            for (entry, surah), record in pool.map(run, jobs):
                if record is None:
                    failed += 1
                    logger.warning("%s %s: no source has it", entry["id"], surah)
                else:
                    done += 1
                if (done + failed) % 25 == 0:
                    logger.info("%s/%s surahs (%s missing), %.0fs", done + failed, len(jobs), failed, time.time() - started)
                    write_catalog(out_dir, entries)
        logger.info("prepared %s surahs, %s missing, in %.0fs", done, failed, time.time() - started)
    catalog = write_catalog(out_dir, entries)
    logger.info("catalog: %s reciters", len(catalog["reciters"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
