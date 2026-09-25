"""GET /api/offline/{name}: the standalone app downloads its packs here."""
import pytest
from fastapi.testclient import TestClient

from src import main


@pytest.fixture()
def packs_dir(tmp_path, monkeypatch):
    (tmp_path / "manifest.json").write_text('{"format": 1}', encoding="utf-8")
    (tmp_path / "narration-3.db").write_bytes(b"SQLite format 3\x00pack")
    (tmp_path / "secret.txt").write_text("no", encoding="utf-8")
    monkeypatch.setenv("QBASAIR_OFFLINE_PACKS_PATH", str(tmp_path))
    return tmp_path


def test_serves_the_manifest_uncached_and_packs_cacheable(packs_dir):
    with TestClient(main.app) as client:
        manifest = client.get("/api/offline/manifest.json")
        assert manifest.status_code == 200 and manifest.json() == {"format": 1}
        assert manifest.headers["cache-control"] == "no-cache"
        pack = client.get("/api/offline/narration-3.db")
        assert pack.status_code == 200 and pack.content.startswith(b"SQLite format 3")
        assert "max-age" in pack.headers["cache-control"]


def test_serves_only_pack_files(packs_dir):
    with TestClient(main.app) as client:
        for name in ["secret.txt", "narration-9.db", "..%2Fsecret.txt", "core.db"]:
            assert client.get(f"/api/offline/{name}").status_code == 404
