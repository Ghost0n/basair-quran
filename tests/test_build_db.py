import json
import sqlite3

import scripts.build_db as build_db


def write_json(path, payload):
    path.write_text(json.dumps(payload), encoding="utf-8")


def test_build_db_fails_before_mutating_existing_database(tmp_path, monkeypatch, capsys):
    data_dir = tmp_path / "data"
    mushaf_dir = data_dir / "mushafs"
    mushaf_dir.mkdir(parents=True)

    root_dict_path = data_dir / "word_root_dictionary.json"
    write_json(root_dict_path, {"shared": ["shared-root-a"]})
    morphology_path = data_dir / "quran-morphology.txt"
    morphology_path.write_text("1:1:1:1\tshared\tN\tLEM:shared\n", encoding="utf-8")

    existing_mushaf = mushaf_dir / "existing.json"
    write_json(
        existing_mushaf,
        [
            {
                "id": 1,
                "name": "Fixture Surah",
                "transliteration": "Fixture Surah",
                "type": "meccan",
                "verses": [
                    {
                        "id": 1,
                        "text": "shared",
                        "text_imlaei": "shared",
                        "page": 1,
                        "juz": 1,
                        "line_start": 1,
                        "line_end": 1,
                    }
                ],
            }
        ],
    )

    db_path = data_dir / "quran.db"
    connection = sqlite3.connect(db_path)
    connection.execute("CREATE TABLE sentinel (value TEXT)")
    connection.execute("INSERT INTO sentinel VALUES ('keep-me')")
    connection.commit()
    connection.close()

    monkeypatch.setattr(build_db, "DATA_DIR", str(data_dir))
    monkeypatch.setattr(build_db, "DB_PATH", str(db_path))
    monkeypatch.setattr(build_db, "ROOT_DICT_JSON", str(root_dict_path))
    monkeypatch.setattr(
        build_db,
        "MUSHAFS",
        [
            {"id": 1, "name": "Existing", "file": "mushafs/existing.json", "description": "Existing file"},
            {"id": 2, "name": "Missing", "file": "mushafs/missing.json", "description": "Missing file"},
        ],
    )

    exit_code = build_db.build_db()
    output = capsys.readouterr().out

    assert exit_code == 1
    assert "Input validation failed" in output
    assert "missing.json" in output
    assert "Database Built Successfully!" not in output

    connection = sqlite3.connect(db_path)
    try:
        assert connection.execute("SELECT value FROM sentinel").fetchone()[0] == "keep-me"
    finally:
        connection.close()


# --- Narration spellings in search (yā' barī, seated hamza) ------------------

NARRATION_WORDS = [
    # (as written in a narration, as Ḥafṣ writes it)
    ("فِے", "فِي"),
    ("رَبِّے", "رَبِّي"),
    ("اَ۬لذِے", "ٱلَّذِي"),
    ("يَسْتَهْزِۓ", "يَسۡتَهۡزِئُ"),
    ("شَےْءٖ", "شَيۡءٖ"),
]


def test_search_normalization_folds_narration_letters_like_hafs():
    from src.app.services import quran_service

    for narration, hafs in NARRATION_WORDS:
        expected = build_db.normalize_text_search(hafs)
        # The build and the server normalize alike, for every narration.
        assert build_db.normalize_text_search(narration) == expected
        assert quran_service.normalize_text_search(narration) == expected
    assert "ے" not in build_db.normalize_text_search("فِے وَإِنِّے")
    # Diacritized queries compare the same way (رَبِّي finds رَبِّے).
    assert quran_service.standardize_uthmani("رَبِّے") == quran_service.standardize_uthmani("رَبِّي")
    # Ḥafṣ text is untouched.
    assert build_db.fold_narration_letters("قَآئِمٌ فِي") == "قَآئِمٌ فِي"


def test_search_finds_a_word_in_every_narration(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    from src import main

    data_dir = tmp_path / "data"
    (data_dir / "mushafs").mkdir(parents=True)
    write_json(data_dir / "word_root_dictionary.json", {})
    (data_dir / "quran-morphology.txt").write_text("1:1:1:1\tرَبِّ\tN\tROOT:ربب|LEM:رَبّ\n", encoding="utf-8")

    def surah(text):
        return [
            {
                "id": 1,
                "name": "Fixture",
                "transliteration": "Fixture",
                "type": "meccan",
                "verses": [{"id": 1, "text": text, "text_imlaei": text, "page": 1, "juz": 1, "line_start": 1, "line_end": 1}],
            }
        ]

    write_json(data_dir / "mushafs" / "hafs.json", surah("قُلۡ رَبِّي فِي ٱلَّذِي"))
    write_json(data_dir / "mushafs" / "warsh.json", surah("قُلْ رَبِّے فِے اَ۬لذِے"))
    db_path = data_dir / "quran.db"
    monkeypatch.setattr(build_db, "DATA_DIR", str(data_dir))
    monkeypatch.setattr(build_db, "DB_PATH", str(db_path))
    monkeypatch.setattr(build_db, "ROOT_DICT_JSON", str(data_dir / "word_root_dictionary.json"))
    monkeypatch.setattr(build_db, "MORPHOLOGY_PATH", str(data_dir / "quran-morphology.txt"))
    monkeypatch.setattr(
        build_db,
        "MUSHAFS",
        [
            {"id": 2, "name": "Hafs", "file": "mushafs/hafs.json", "description": ""},
            {"id": 3, "name": "Warsh", "file": "mushafs/warsh.json", "description": ""},
        ],
    )
    assert build_db.build_db() == 0

    original_db_path = main.get_db_path()
    main.close_db_connection()
    main.set_db_path(str(db_path))
    try:
        with TestClient(main.app) as client:
            for query, position in (("ربي", 2), ("رَبِّي", 2), ("في", 3), ("الذي", 4)):
                for mushaf in (2, 3):
                    response = client.get("/api/search", params={"q": query, "mode": "exact", "mushaf": mushaf})
                    assert response.status_code == 200, (query, mushaf)
                    results = response.json()["results"]
                    assert results and results[0]["total_occurrences"] == 1, (query, mushaf)
                    verse = results[0]["verses"][0]
                    # The highlight lands on the word, as written in that narration.
                    assert verse["highlights"] == [position], (query, mushaf, verse)
    finally:
        main.close_db_connection()
        main.set_db_path(original_db_path)


# --- Roots by word (RootResolver) --------------------------------------------

FIXTURE_MORPHOLOGY = "\n".join(
    [
        # 1:1 «قُلْ مِنْ رَبِّي» — a verb of قول, a particle, a noun of ربب.
        "1:1:1:1\tقُلْ\tV\tIMPV|VF:1|ROOT:قول|LEM:قالَ|2MS",
        "1:1:2:1\tمِنْ\tP\tP|LEM:مِن",
        "1:1:3:1\tرَبِّ\tN\tROOT:ربب|LEM:رَبّ|M|GEN",
        "1:1:3:2\tي\tN\tPRON:1S",
        # 1:2 «قَلَّ يُؤْمِنُونَ» — قلل, then أمن.
        "1:2:1:1\tقَلَّ\tV\tPERF|ROOT:قلل|LEM:قَلَّ|3MS",
        "1:2:2:1\tيُؤْمِنُونَ\tV\tIMPF|VF:4|ROOT:أمن|LEM:ءامَنَ|3MP",
        # 2:1 «قُلْ» once more: قول is the spelling's usual reading (2 to 1).
        "2:1:1:1\tقُلْ\tV\tIMPV|VF:1|ROOT:قول|LEM:قالَ|2MS",
    ]
)
FIXTURE_DICTIONARY = {"قل": ["قول", "قلل"], "من": ["منن"], "سما": ["سمو"]}


def resolve(resolver, surah, ayah, word, text):
    return resolver.resolve(surah, ayah, word, build_db.normalize_for_matching(text))


def test_root_resolver_reads_the_root_at_the_word_position():
    resolver = build_db.RootResolver(FIXTURE_MORPHOLOGY, FIXTURE_DICTIONARY)

    # The same letters, two roots: each word gets its own, never both.
    assert resolve(resolver, 1, 1, 1, "قُلۡ") == ["قول"]
    assert resolve(resolver, 1, 2, 1, "قَلَّ") == ["قلل"]
    # A particle has no root, though «من» is also the spelling of «مَنّ».
    assert resolve(resolver, 1, 1, 2, "مِنۡ") == []
    # Segments are joined into the word: «رَبِّ» + «ي».
    assert resolve(resolver, 1, 1, 3, "رَبِّي") == ["ربب"]
    assert resolver.sources["position"] == 4


def test_root_resolver_finds_words_of_narrations_numbered_or_spelt_differently():
    resolver = build_db.RootResolver(FIXTURE_MORPHOLOGY, FIXTURE_DICTIONARY)

    # Verse numbered one higher and the word moved (a narration's count).
    assert resolve(resolver, 1, 3, 4, "قَلَّ") == ["قلل"]
    # Warsh's spelling without the hamza seat, and its final yā' barī.
    assert resolve(resolver, 1, 2, 2, "يُومِنُونَ") == ["أمن"]
    assert resolve(resolver, 1, 1, 3, "رَبِّے") == ["ربب"]
    assert resolver.sources["nearby"] == 2  # «رَبِّے» lines up once ے is ي


def test_root_resolver_falls_back_to_the_spelling_then_the_dictionary():
    resolver = build_db.RootResolver(FIXTURE_MORPHOLOGY, FIXTURE_DICTIONARY)

    # Far from any verse with the word: the source's usual reading.
    assert resolve(resolver, 9, 1, 1, "قُلۡ") == ["قول"]
    assert resolve(resolver, 9, 1, 2, "مِن") == []
    # A spelling the source never uses: the dictionary.
    assert resolve(resolver, 9, 1, 3, "سَمَا") == ["سمو"]
    assert resolve(resolver, 9, 1, 4, "مجهول") == []
    assert (resolver.sources["spelling"], resolver.sources["dictionary"]) == (2, 2)


def mushaf_words(name, surah, ayah):
    payload = json.loads((build_db_data_dir() / "mushafs" / f"{name}.json").read_text(encoding="utf-8"))
    verse = next(item for item in payload[surah - 1]["verses"] if item["id"] == ayah)
    return build_db.clean_ayah_text(verse["text"]).split(" ")


def build_db_data_dir():
    from pathlib import Path

    return Path(build_db.DATA_DIR)


def test_root_resolver_on_the_committed_sources():
    data_dir = build_db_data_dir()
    resolver = build_db.RootResolver(
        (data_dir / "quran-morphology.txt").read_text(encoding="utf-8"),
        json.loads((data_dir / "word_root_dictionary.json").read_text(encoding="utf-8")),
    )

    def roots(name, surah, ayah):
        return [
            resolve(resolver, surah, ayah, index, word)
            for index, word in enumerate(mushaf_words(name, surah, ayah), start=1)
        ]

    # Al-Ikhlāṣ 112:1 «قُلۡ هُوَ ٱللَّهُ أَحَدٌ»: قول only (not قلل too).
    assert roots("hafs", 112, 1) == [["قول"], [], ["أله"], ["أحد"]]
    # An-Nisāʾ 4:7 «… مِمَّا قَلَّ مِنۡهُ …»: قلل here, and «مِن» has no root.
    nisa = roots("hafs", 4, 7)
    assert nisa[12:15] == [[], ["قلل"], []]
    # Warsh 2:2 is Ḥafṣ 2:3 (Warsh joins 2:1 and 2:2), spelt «يُومِنُونَ».
    assert roots("warsh", 2, 2)[:2] == [[], ["أمن"]]
