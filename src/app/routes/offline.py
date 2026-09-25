"""The standalone app's downloadable packs (docs/offline-packs.md).

Read-only: serves the files ``scripts/build_offline_packs.py`` wrote (the
manifest, narration / translation databases, interface dictionaries) so the
phone can download them. Only file names of the manifest's form are served.
"""

import re
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from src.app.core import config

router = APIRouter(prefix="/api", tags=["offline"])

_PACK_NAME = re.compile(r"(manifest\.json|core\.db|(narration|translation|interface)-[a-z0-9_.-]+\.(db|json))")


@router.get("/offline/{name}")
def offline_pack(name: str) -> FileResponse:
    if not _PACK_NAME.fullmatch(name) or ".." in name:
        raise HTTPException(status_code=404, detail="Not found.")
    path = Path(config.get_offline_packs_path()) / name
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Not found.")
    # The manifest says what is current; pack files never change under a name
    # without the manifest's version and checksum changing with them.
    cache = "no-cache" if name == "manifest.json" else "public, max-age=86400"
    media = "application/json" if name.endswith(".json") else "application/vnd.sqlite3"
    return FileResponse(path, media_type=media, headers={"Cache-Control": cache})
