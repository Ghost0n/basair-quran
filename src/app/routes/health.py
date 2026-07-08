import time

from fastapi import APIRouter, Response

from src.app.core import config
from src.app.models.api import HealthResponse, ReadyResponse
from src.app.services import quran_service

router = APIRouter(prefix="/api", tags=["system"])


@router.get("/health", response_model=HealthResponse)
def health_check() -> HealthResponse:
    """Pure liveness — used by the container healthcheck; never touches the DB
    so it stays green during first-boot DB rebuild."""
    return HealthResponse(status="ok", timestamp=time.time())


@router.get("/ready", response_model=ReadyResponse)
def readiness_check(response: Response) -> ReadyResponse:
    """Readiness for the deploy gate: the Quran DB answers `SELECT 1` and the
    running commit is reported. Returns 503 when the DB is not reachable."""
    db_ok = True
    try:
        quran_service.get_db().execute("SELECT 1").fetchone()
    except Exception:  # noqa: BLE001 — any DB failure means not-ready
        db_ok = False
    if not db_ok:
        response.status_code = 503
    return ReadyResponse(
        status="ready" if db_ok else "unavailable",
        db=db_ok,
        commit=config.get_commit_sha(),
        timestamp=time.time(),
    )
