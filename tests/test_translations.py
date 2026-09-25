"""Quran translations of meanings — build pipeline (trusted sources) and read API."""

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import build_translations as bt  # noqa: E402

from src.app.core import config  # noqa: E402
from src.app.services import translation_service  # noqa: E402

API = "https://quranenc.com/api/v1"


def _all_refs():
    return [(sura, ayah) for sura in range(1, 115) for ayah in range(1, bt.SURAH_AYAHS[sura - 1] + 1)]


class FakeNet:
    """Serves a QuranEnc catalogue + sura files and Tanzil txt-2 files."""

    def __init__(self, catalogue, quranenc=None, tanzil=None, broken=()):
        self.catalogue = catalogue
        self.quranenc = quranenc or {}
        self.tanzil = tanzil or {}
        self.broken = set(broken)
        self.calls = []

    def __call__(self, url):
        self.calls.append(url)
        if url == f"{API}/translations/list":
            if "catalogue" in self.broken:
                raise bt.TranslationError("offline")
            return json.dumps({"translations": self.catalogue}).encode()
        if url.startswith(f"{API}/translation/sura/"):
            key, sura = url.rsplit("/", 2)[-2:]
            text = self.quranenc[key]
            rows = [
                {"id": str(i), "sura": sura, "aya": str(ayah), "arabic_text": "…", "translation": text(int(sura), ayah),
                 "footnotes": "fn" if (int(sura), ayah) == (1, 1) else ""}
                for i, ayah in enumerate(range(1, bt.SURAH_AYAHS[int(sura) - 1] + 1))
                if not (key in self.broken and (int(sura), ayah) == (114, 6))
            ]
            return json.dumps({"result": rows}).encode()
        trans_id = url.split("transID=")[1].split("&")[0]
        if trans_id not in self.tanzil:
            raise bt.TranslationError("404")
        lines = [f"{s}|{a}|{self.tanzil[trans_id](s, a)}" for s, a in _all_refs()]
        return ("\n".join(lines) + "\n\n# Tanzil licence footer\n").encode()


CATALOGUE = [
    {"key": "english_saheeh", "language_iso_code": "en", "direction": "ltr", "version": "1.1.3", "title": "Saheeh International"},
    {"key": "english_rwwad", "language_iso_code": "en", "direction": "ltr", "version": "1.0.2", "title": "Rowwad Translation Center"},
    {"key": "urdu_junagarhi", "language_iso_code": "ur", "direction": "rtl", "version": "1.0.0", "title": "محمد جوناگڑھی"},
    {"key": "french_montada", "language_iso_code": "fr", "direction": "ltr", "version": "1.0.4", "title": "Montada Islamic Foundation"},
]


def _net(**kwargs):
    return FakeNet(
        CATALOGUE,
        quranenc={
            "english_saheeh": lambda s, a: f"EN {s}:{a}",
            "english_rwwad": lambda s, a: f"RW {s}:{a}",
            "urdu_junagarhi": lambda s, a: f"اردو {s}:{a}",
            "french_montada": lambda s, a: f"FR {s}:{a}",
        },
        tanzil={
            "nl.siregar": lambda s, a: f"NL {s}:{a}",
            "en.transliteration": lambda s, a: f"Bismi {s}:{a}",
            "fr.hamidullah": lambda s, a: f"HAM {s}:{a}",
        },
        **kwargs,
    )


def test_build_prefers_quranenc_and_fills_gaps_from_tanzil(tmp_path):
    net = _net()
    output = tmp_path / "translations.db"
    installed = bt.build(fetch=net, output=output, languages=["en", "ur", "fr", "nl", "xx"], log=lambda _: None)
    keys = [t.key for t in installed]
    # Preferred QuranEnc key per language; Tanzil only where QuranEnc has nothing (nl) + transliteration.
    assert keys == ["quranenc:english_saheeh", "quranenc:urdu_junagarhi", "quranenc:french_montada", "tanzil:nl.siregar", "tanzil:en.transliteration"]
    assert not any("fr.hamidullah" in url for url in net.calls)

    config.set_translations_db_path(str(output))
    translation_service.reset_connection()
    catalogue = {item["key"]: item for item in translation_service.catalogue()}
    assert catalogue["quranenc:urdu_junagarhi"]["direction"] == "rtl"
    assert catalogue["quranenc:english_saheeh"]["source"] == "quranenc"
    assert catalogue["quranenc:english_saheeh"]["ayah_count"] == 6236
    assert "attribution" in catalogue["quranenc:english_saheeh"]["terms"]
    assert catalogue["tanzil:en.transliteration"]["kind"] == "transliteration"
    assert "Non-commercial" in catalogue["tanzil:nl.siregar"]["terms"]


def test_per_language_takes_the_next_translations(tmp_path):
    installed = bt.build(fetch=_net(), output=tmp_path / "t.db", languages=["en"], per_language=2,
                         with_transliteration=False, log=lambda _: None)
    assert [t.key for t in installed] == ["quranenc:english_saheeh", "quranenc:english_rwwad"]


def test_incomplete_translation_is_skipped_and_others_still_install(tmp_path):
    logs = []
    installed = bt.build(fetch=_net(broken={"english_saheeh"}), output=tmp_path / "t.db", languages=["en"],
                         with_transliteration=False, log=logs.append)
    # The partial one is rejected; the next English translation replaces it.
    assert [t.key for t in installed] == ["quranenc:english_rwwad"]
    assert any("skipped english_saheeh" in line and "1 ayahs missing" in line for line in logs)


def test_unreachable_quranenc_falls_back_to_tanzil(tmp_path):
    installed = bt.build(fetch=_net(broken={"catalogue"}), output=tmp_path / "t.db", languages=["fr"],
                         with_transliteration=False, log=lambda _: None)
    assert [t.key for t in installed] == ["tanzil:fr.hamidullah"]


def test_nothing_installable_leaves_existing_database(tmp_path):
    output = tmp_path / "t.db"
    output.write_bytes(b"previous")
    with pytest.raises(bt.TranslationError):
        bt.build(fetch=_net(broken={"catalogue"}), output=output, languages=["xx"], with_transliteration=False,
                 log=lambda _: None)
    assert output.read_bytes() == b"previous"


def test_tanzil_parser_rejects_malformed_lines():
    assert bt.parse_tanzil("1|1|In the name\n# footer\n") == {(1, 1): ("In the name", None)}
    with pytest.raises(bt.TranslationError):
        bt.parse_tanzil("garbage line")


def test_offline_directory_build(tmp_path):
    offline = tmp_path / "offline"
    (offline / "quranenc" / "english_saheeh").mkdir(parents=True)
    (offline / "quranenc" / "list.json").write_text(json.dumps({"translations": CATALOGUE[:1]}))
    net = _net()
    for sura in range(1, 115):
        (offline / "quranenc" / "english_saheeh" / f"{sura}.json").write_bytes(net(f"{API}/translation/sura/english_saheeh/{sura}"))
    output = tmp_path / "t.db"
    code = bt.main(["--languages", "en", "--no-transliteration", "--offline-dir", str(offline), "--output", str(output)])
    assert code == 0 and output.exists()


@pytest.fixture()
def translations_db(tmp_path):
    output = tmp_path / "translations.db"
    bt.build(fetch=_net(), output=output, languages=["en", "ur"], log=lambda _: None)
    original = config.get_translations_db_path()
    config.set_translations_db_path(str(output))
    translation_service.reset_connection()
    yield output
    config.set_translations_db_path(original)
    translation_service.reset_connection()


def test_api_catalogue_and_ayahs(api_client, translations_db):
    catalogue = api_client.get("/api/translations").json()
    assert {item["key"] for item in catalogue} == {"quranenc:english_saheeh", "quranenc:urdu_junagarhi", "tanzil:en.transliteration"}

    response = api_client.get(
        "/api/translations/ayahs",
        params={"keys": "quranenc:english_saheeh,quranenc:urdu_junagarhi,unknown", "refs": "1:1-3,2:255"},
    )
    assert response.status_code == 200
    body = response.json()
    assert [meta["key"] for meta in body["translations"]] == ["quranenc:english_saheeh", "quranenc:urdu_junagarhi"]
    assert [(a["surah"], a["ayah"]) for a in body["ayahs"]] == [(1, 1), (1, 2), (1, 3), (2, 255)]
    first = body["ayahs"][0]["texts"]
    assert first[0] == {"key": "quranenc:english_saheeh", "text": "EN 1:1", "footnotes": "fn"}
    assert first[1]["text"] == "اردو 1:1"
    assert body["ayahs"][3]["texts"][0]["text"] == "EN 2:255"


def test_api_rejects_bad_refs_and_caps_size(api_client, translations_db):
    assert api_client.get("/api/translations/ayahs", params={"keys": "x", "refs": "2:abc"}).status_code == 422
    assert api_client.get("/api/translations/ayahs", params={"keys": "x", "refs": "115:1"}).status_code == 422
    assert api_client.get("/api/translations/ayahs", params={"keys": "x", "refs": "2:1-286,3:1-200"}).status_code == 422


def test_api_without_database_is_empty(api_client, tmp_path):
    original = config.get_translations_db_path()
    config.set_translations_db_path(str(tmp_path / "missing.db"))
    translation_service.reset_connection()
    try:
        assert api_client.get("/api/translations").json() == []
        body = api_client.get("/api/translations/ayahs", params={"keys": "quranenc:english_saheeh", "refs": "1:1"}).json()
        assert body == {"translations": [], "ayahs": []}
    finally:
        config.set_translations_db_path(original)
        translation_service.reset_connection()


def test_preferences_store_up_to_three_translations(api_client):
    response = api_client.patch("/api/user/preferences", json={"translations": ["quranenc:english_saheeh", "tanzil:en.transliteration"]})
    assert response.status_code == 200
    assert api_client.get("/api/user/preferences").json()["translations"] == ["quranenc:english_saheeh", "tanzil:en.transliteration"]
    assert api_client.patch("/api/user/preferences", json={"translations": ["a", "b", "c", "d"]}).status_code == 422
    assert api_client.patch("/api/user/preferences", json={"translations": []}).json()["translations"] == []
