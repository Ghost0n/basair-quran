"""Prepared recitations: a surah's verse timings and its audio (docs/recitation-audio.md)."""

from __future__ import annotations

import os
import re

from fastapi import APIRouter, HTTPException, Path, Request, Response
from fastapi.responses import StreamingResponse

from src.app.models.api import SurahRecitation
from src.app.services import recitation_service

router = APIRouter(prefix="/api/recitations", tags=["recitations"])

_RANGE = re.compile(r"bytes=(\d*)-(\d*)$")
_CHUNK = 1 << 16
_AUDIO_HEADERS = {
    # The URL carries the file's version (?v=), so the file never changes.
    "Cache-Control": "public, max-age=31536000, immutable",
    "Accept-Ranges": "bytes",
    # The standalone app streams from another origin.
    "Access-Control-Allow-Origin": "*",
    "Cross-Origin-Resource-Policy": "cross-origin",
}


@router.get("/{reciter_id}/{surah}", response_model=SurahRecitation)
def get_surah_recitation(
    response: Response,
    reciter_id: str = Path(..., min_length=1, max_length=64),
    surah: int = Path(..., ge=1, le=114),
) -> SurahRecitation:
    """The surah as one recording and each verse's place in it (404 when it
    isn't prepared: the player then recites it verse by verse)."""
    timing = recitation_service.surah_timing(reciter_id, surah)
    if timing is None:
        raise HTTPException(status_code=404, detail="Not prepared")
    # A re-prepared surah gets a new audio_url (its version): a day is enough.
    response.headers["Cache-Control"] = "public, max-age=86400"
    return SurahRecitation(**timing)


def _file_chunks(path: str, start: int, length: int):
    with open(path, "rb") as handle:
        handle.seek(start)
        remaining = length
        while remaining > 0:
            data = handle.read(min(_CHUNK, remaining))
            if not data:
                break
            remaining -= len(data)
            yield data


@router.get("/audio/{reciter_id}/{name}")
def get_surah_audio(
    request: Request,
    reciter_id: str = Path(..., min_length=1, max_length=64),
    name: str = Path(..., pattern=r"^\d{3}\.mp3$"),
):
    """The prepared surah's MP3, with byte ranges (players seek with them).
    nginx serves these files itself in production; this route serves them
    everywhere else (development, a server without nginx)."""
    path = recitation_service.audio_path(reciter_id, int(name[:3]))
    if path is None:
        raise HTTPException(status_code=404, detail="Not prepared")
    size = os.path.getsize(path)
    headers = dict(_AUDIO_HEADERS)
    match = _RANGE.match(request.headers.get("range", "").strip())
    if not match or (not match.group(1) and not match.group(2)):
        headers["Content-Length"] = str(size)
        return StreamingResponse(_file_chunks(str(path), 0, size), media_type="audio/mpeg", headers=headers)
    first, last = match.group(1), match.group(2)
    if first:
        start = int(first)
        end = min(int(last), size - 1) if last else size - 1
    else:  # the last N bytes
        start = max(0, size - int(last))
        end = size - 1
    if start >= size or start > end:
        return Response(status_code=416, headers={"Content-Range": f"bytes */{size}"})
    headers["Content-Range"] = f"bytes {start}-{end}/{size}"
    headers["Content-Length"] = str(end - start + 1)
    return StreamingResponse(
        _file_chunks(str(path), start, end - start + 1), status_code=206, media_type="audio/mpeg", headers=headers
    )
