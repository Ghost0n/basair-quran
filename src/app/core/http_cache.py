"""HTTP caching policy for the read-only Quran endpoints.

Everything listed here is a pure function of the generated `quran.db` (Quran
text, pages, glyph layouts, morphology, catalogs, search): it only changes when
the database is rebuilt, so browsers and the edge may cache it. Anything that
depends on who is asking (notebook, preferences, sessions, followed roots, auth,
research) is deliberately absent and stays uncached.
"""

from __future__ import annotations

# Rebuilds are rare and deploy-driven; an hour of freshness plus a day of
# stale-while-revalidate keeps page turns instant without pinning stale data.
QURAN_DATA = "public, max-age=3600, stale-while-revalidate=86400"
# Search results are deterministic too, but shorter-lived in case ranking or
# normalization changes ship without a DB rebuild.
SEARCH_DATA = "public, max-age=600, stale-while-revalidate=3600"

_POLICIES: dict[str, str] = {
    "/api/quran-page": QURAN_DATA,
    "/api/mushaf-page-layout": QURAN_DATA,
    "/api/ayah-reader": QURAN_DATA,
    "/api/ayah-reader-more": QURAN_DATA,
    "/api/morphology": QURAN_DATA,
    "/api/surahs": QURAN_DATA,
    "/api/mushafs": QURAN_DATA,
    "/api/reciters": QURAN_DATA,
    "/api/root-distribution": QURAN_DATA,
    "/api/search": SEARCH_DATA,
    "/api/search-v2": SEARCH_DATA,
    "/api/search-result-page": SEARCH_DATA,
    "/api/suggest": SEARCH_DATA,
}


def cache_control_for(method: str, path: str, status_code: int) -> str | None:
    """The Cache-Control value to add to a response, or None to leave it alone."""
    if method != "GET" or status_code != 200:
        return None
    return _POLICIES.get(path.rstrip("/") or "/")
