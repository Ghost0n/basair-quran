"""Fetch the QPC V1 Madani per-page WOFF2 fonts for the authentic mushaf reader.

The authentic reader (Hafs-only) renders each word as a per-page QCF glyph code.
Those glyphs are drawn by the King Fahd Complex (KFGQPC) **QPC V1** page fonts,
distributed unmodified as WOFF2 by `nuqayah/qpc-fonts` (`mushaf-woff2/`). V2 ships
only as TTF, and the KFGQPC "no-modify" license forbids converting it ourselves, so
V1 is the version we render (see docs/authentic-mushaf-reader.md).

The fonts are large binaries and are **not committed** (see .gitignore); this script
fetches them at deploy time into `apps/web/public/fonts/qpc-hafs-v1/`, named to match
the API contract the frontend expects:

  QCF_P001.woff2 .. QCF_P604.woff2  ->  p1.woff2 .. p604.woff2   (per-page glyph fonts)
  QCF_BSML.woff2                    ->  bsml.woff2               (basmala/ligature font)

License: KFGQPC "Freeware, Non-Commercial" — use/copy/distribute free; no sell, no
modify/subset, no reverse-engineer. We serve the WOFF2 unmodified.

Usage:
    python scripts/fetch_mushaf_fonts.py            # fetch missing fonts
    python scripts/fetch_mushaf_fonts.py --force     # re-download everything
    QBASAIR_QCF_FONTS_REF=<sha> python scripts/fetch_mushaf_fonts.py
"""

from __future__ import annotations

import argparse
import os
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

# Pinned commit for reproducible deploys; override with QBASAIR_QCF_FONTS_REF.
DEFAULT_REF = "8a4f39d563ea69c994416a1692827e38156c548d"
PAGE_COUNT = 604
MIN_BYTES = 1024  # a real page WOFF2 is tens of KB; smaller means a bad/HTML response

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DEST = REPO_ROOT / "apps" / "web" / "public" / "fonts" / "qpc-hafs-v1"


def _source_base(ref: str) -> str:
    return f"https://raw.githubusercontent.com/nuqayah/qpc-fonts/{ref}/mushaf-woff2"


def _targets() -> list[tuple[str, str]]:
    """(remote filename, local filename) pairs."""
    pairs = [("QCF_BSML.woff2", "bsml.woff2")]
    pairs += [(f"QCF_P{n:03d}.woff2", f"p{n}.woff2") for n in range(1, PAGE_COUNT + 1)]
    return pairs


def _download_one(base: str, remote: str, dest: Path, attempts: int = 3) -> int:
    url = f"{base}/{remote}"
    last_err: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "q-basair-fetch/1"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read()
            if len(data) < MIN_BYTES:
                raise ValueError(f"suspiciously small response ({len(data)} bytes)")
            tmp = dest.with_suffix(dest.suffix + ".part")
            tmp.write_bytes(data)
            tmp.replace(dest)
            return len(data)
        except (urllib.error.URLError, ValueError, TimeoutError) as exc:  # noqa: PERF203
            last_err = exc
    raise RuntimeError(f"failed to fetch {url}: {last_err}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch QPC V1 Madani WOFF2 fonts.")
    parser.add_argument("--force", action="store_true", help="re-download even if present")
    parser.add_argument("--dest", default=str(os.environ.get("QBASAIR_QCF_FONTS_DEST", DEFAULT_DEST)))
    parser.add_argument("--ref", default=os.environ.get("QBASAIR_QCF_FONTS_REF", DEFAULT_REF))
    parser.add_argument("--workers", type=int, default=16)
    args = parser.parse_args()

    dest_dir = Path(args.dest)
    dest_dir.mkdir(parents=True, exist_ok=True)
    base = _source_base(args.ref)

    pending: list[tuple[str, Path]] = []
    skipped = 0
    for remote, local in _targets():
        out = dest_dir / local
        if not args.force and out.exists() and out.stat().st_size >= MIN_BYTES:
            skipped += 1
            continue
        pending.append((remote, out))

    print(f"QPC V1 fonts -> {dest_dir}")
    print(f"  ref: {args.ref}")
    print(f"  present: {skipped}, to fetch: {len(pending)}")
    if not pending:
        print("  nothing to do.")
        return 0

    total_bytes = 0
    failures: list[str] = []
    done = 0
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(_download_one, base, remote, out): remote for remote, out in pending}
        for fut in as_completed(futures):
            remote = futures[fut]
            try:
                total_bytes += fut.result()
                done += 1
                if done % 60 == 0 or done == len(pending):
                    print(f"  fetched {done}/{len(pending)}")
            except Exception as exc:  # noqa: BLE001
                failures.append(f"{remote}: {exc}")

    if failures:
        print(f"\nFAILED ({len(failures)}):", file=sys.stderr)
        for line in failures[:20]:
            print(f"  {line}", file=sys.stderr)
        return 1

    print(f"  done: {done} files, {total_bytes / 1024 / 1024:.1f} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
