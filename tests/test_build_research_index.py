import json
import sqlite3
import zipfile

import scripts.build_research_index as build_research_index
from conftest import create_test_db


def test_build_research_index_ingests_sources_and_quran_terms(tmp_path):
    sources_dir = tmp_path / "research_sources"
    sources_dir.mkdir()
    (sources_dir / "lecture.md").write_text("Mercy and shared roots in the Quranic language.", encoding="utf-8")
    quran_db_path = tmp_path / "quran.db"
    research_db_path = tmp_path / "research_agent.db"
    create_test_db(quran_db_path)

    status = build_research_index.build_research_index(
        sources_dir=sources_dir,
        research_db_path=research_db_path,
        quran_db_path=quran_db_path,
        with_embeddings=False,
    )

    assert status == 0
    connection = sqlite3.connect(research_db_path)
    try:
        assert connection.execute("SELECT COUNT(*) FROM source_documents").fetchone()[0] == 1
        assert connection.execute("SELECT COUNT(*) FROM source_chunks").fetchone()[0] == 1
        assert connection.execute("SELECT COUNT(*) FROM quran_terms WHERE term_type = 'root'").fetchone()[0] == 2
        rows = connection.execute(
            """
            SELECT source_chunks.rowid
            FROM source_chunks_fts
            JOIN source_chunks ON source_chunks.id = source_chunks_fts.rowid
            WHERE source_chunks_fts MATCH 'mercy*'
            """
        ).fetchall()
        assert rows
    finally:
        connection.close()


def test_chunk_text_uses_overlap_for_long_sources():
    text = " ".join(f"word{i}" for i in range(900))
    chunks = build_research_index.chunk_text(text, chunk_words=100, overlap=10)

    assert len(chunks) > 1
    assert "word90" in chunks[0]
    assert "word90" in chunks[1]


def test_build_research_index_uses_manifest_and_cleans_transcripts(tmp_path):
    sources_dir = tmp_path / "research_sources"
    transcript_dir = sources_dir / "transcripted_youtube_playlists" / "mafahim"
    transcript_dir.mkdir(parents=True)
    (transcript_dir / "episode.txt").write_text(
        "[موسيقى]\n&gt;&gt; mercy belongs to Allah\nrelated terms and roots\n",
        encoding="utf-8",
    )
    books_dir = sources_dir / "books"
    books_dir.mkdir()
    (books_dir / "ignore.txt").write_text("This should stay out of the index.", encoding="utf-8")
    (sources_dir / "_manifest.json").write_text(
        json.dumps(
            {
                "rules": [
                    {
                        "prefix": "transcripted_youtube_playlists/mafahim",
                        "metadata": {"author": "د. يوسف أبو عواد"},
                    }
                ],
                "documents": {
                    "books/ignore.txt": {
                        "exclude": True,
                        "metadata": {"notes": "Too noisy for the main corpus."},
                    }
                },
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    quran_db_path = tmp_path / "quran.db"
    research_db_path = tmp_path / "research_agent.db"
    create_test_db(quran_db_path)

    status = build_research_index.build_research_index(
        sources_dir=sources_dir,
        research_db_path=research_db_path,
        quran_db_path=quran_db_path,
        with_embeddings=False,
    )

    assert status == 0
    connection = sqlite3.connect(research_db_path)
    try:
        document = connection.execute(
            "SELECT source_path, source_type, metadata_json FROM source_documents"
        ).fetchone()
        assert document[0] == "transcripted_youtube_playlists/mafahim/episode.txt"
        assert document[1] == "transcript"
        metadata = json.loads(document[2])
        assert metadata["author"] == "د. يوسف أبو عواد"
        assert metadata["collection"] == "mafahim"

        chunk = connection.execute("SELECT content FROM source_chunks").fetchone()[0]
        assert "[موسيقى]" not in chunk
        assert "&gt;&gt;" not in chunk
        assert "mercy belongs to Allah" in chunk
        assert connection.execute("SELECT COUNT(*) FROM source_documents").fetchone()[0] == 1
    finally:
        connection.close()


def test_build_research_index_reads_epub_books_and_cleans_headers(tmp_path):
    sources_dir = tmp_path / "research_sources"
    books_dir = sources_dir / "books"
    books_dir.mkdir(parents=True)
    epub_path = books_dir / "sample.epub"

    with zipfile.ZipFile(epub_path, "w") as archive:
        archive.writestr(
            "OEBPS/info.xhtml",
            """
            <html><body>
            <div>بطاقة الكتاب</div>
            <div>هذا وصف ميتاداتا يجب تجاهله</div>
            </body></html>
            """,
        )
        archive.writestr(
            "OEBPS/text/page_1.xhtml",
            """
            <html><body>
            <div>مقدمة المؤلف</div>
            <div>هذا تمهيد يجب حذفه قبل الإدخال</div>
            <div>كتاب الهمزة</div>
            <div>جسر الجيم والشين والراء أصل واحد (١)</div>
            </body></html>
            """,
        )
        archive.writestr(
            "OEBPS/text/page_2.xhtml",
            """
            <html><body>
            <div>الجزء: الأول - الصفحة: 21</div>
            <div>جشع الجيم والشين والعين أصل واحد</div>
            </body></html>
            """,
        )

    (sources_dir / "_manifest.json").write_text(
        json.dumps(
            {
                "rules": [{"prefix": "books", "source_type": "book"}],
                "documents": {"books/sample.epub": {"cleaner": "book_epub"}},
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    quran_db_path = tmp_path / "quran.db"
    research_db_path = tmp_path / "research_agent.db"
    create_test_db(quran_db_path)

    status = build_research_index.build_research_index(
        sources_dir=sources_dir,
        research_db_path=research_db_path,
        quran_db_path=quran_db_path,
        with_embeddings=False,
    )

    assert status == 0
    connection = sqlite3.connect(research_db_path)
    try:
        document = connection.execute("SELECT source_type FROM source_documents").fetchone()
        assert document[0] == "book"
        chunk = connection.execute("SELECT content FROM source_chunks").fetchone()[0]
        assert "بطاقة الكتاب" not in chunk
        assert "هذا وصف ميتاداتا" not in chunk
        assert "مقدمة المؤلف" not in chunk
        assert "هذا تمهيد يجب حذفه" not in chunk
        assert "كتاب معجم مقاييس اللغة" not in chunk
        assert "الجزء: الأول - الصفحة: 21" not in chunk
        assert "(١)" not in chunk
        assert "كتاب الهمزة" in chunk
        assert "جسر الجيم والشين والراء أصل واحد" in chunk
        assert "جشع الجيم والشين والعين أصل واحد" in chunk
    finally:
        connection.close()
