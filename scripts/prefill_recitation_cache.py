"""Pre-fill the shared recitation cache: every verse duration of every reciter.

The recitation bar shows a whole surah's length from verse durations that the
server measures once and shares (src/app/services/recitation_cache_service.py,
stored in data/cache.db). On demand, the first reader of a surah sees an
estimated length ("~") for a few seconds while it is measured. This job measures
everything ahead of time, so no reader ever does.

Resumable and polite: verses already stored are skipped, the audio host sees a
few concurrent range requests (16 KB each) at a time, and an interrupted run
picks up where it stopped. A full run is ~6,236 verses per reciter.

Usage:
    python scripts/prefill_recitation_cache.py                     # every reciter, every surah
    python scripts/prefill_recitation_cache.py --reciters alafasy,husary
    python scripts/prefill_recitation_cache.py --surahs 1-10,36,67-114
    python scripts/prefill_recitation_cache.py --status            # coverage only, no network

Production: the deploy runs it in the background when the commit message
carries [prefill-recitation], or when data/cache.db is missing
(deploy/server/deploy.sh, docs/deployment.md).
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.app.services import recitation_cache_service as cache  # noqa: E402
from src.app.services import reciter_service  # noqa: E402


def parse_surahs(spec: str | None) -> list[int]:
    if not spec:
        return list(range(1, 115))
    out: set[int] = set()
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            low, high = (int(x) for x in part.split("-", 1))
            out.update(range(low, high + 1))
        else:
            out.add(int(part))
    bad = sorted(n for n in out if not 1 <= n <= 114)
    if bad:
        raise SystemExit(f"surahs out of range: {bad}")
    return sorted(out)


def coverage(reciter_ids: list[str], surahs: list[int]) -> tuple[int, int]:
    known = total = 0
    for reciter_id in reciter_ids:
        for surah in surahs:
            durations = cache.stored_durations(reciter_id, surah)
            total += len(durations)
            known += sum(value is not None for value in durations)
    return known, total


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--reciters", help="Comma-separated reciter ids (default: the whole catalogue)")
    parser.add_argument("--surahs", help="Surahs, e.g. 1-10,36 (default: all 114)")
    parser.add_argument("--status", action="store_true", help="Report coverage only (no network)")
    parser.add_argument("--pause", type=float, default=0.5, help="Seconds between surahs (default 0.5)")
    args = parser.parse_args(argv)

    catalogue = [item["id"] for item in reciter_service.list_reciters()]
    reciter_ids = [r.strip() for r in args.reciters.split(",")] if args.reciters else catalogue
    unknown = [r for r in reciter_ids if r not in catalogue]
    if unknown:
        raise SystemExit(f"unknown reciters: {unknown} (catalogue: {', '.join(catalogue)})")
    surahs = parse_surahs(args.surahs)

    known, total = coverage(reciter_ids, surahs)
    print(f"coverage: {known}/{total} verses ({100 * known / max(total, 1):.1f}%)", flush=True)
    if args.status:
        return 0

    started = time.time()
    for reciter_id in reciter_ids:
        for surah in surahs:
            before = sum(v is not None for v in cache.stored_durations(reciter_id, surah))
            if before == cache.ayah_count(surah):
                continue
            result = cache.surah_durations(reciter_id, surah, background=False)
            if result is None:
                continue
            durations, complete = result
            after = sum(v is not None for v in durations)
            print(
                f"{reciter_id} {surah:3d}: {after}/{len(durations)}" + ("" if complete else "  (some verses unreadable — retried next run)"),
                flush=True,
            )
            time.sleep(args.pause)

    known, total = coverage(reciter_ids, surahs)
    print(f"done in {time.time() - started:.0f}s — coverage: {known}/{total} verses", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
