"""
Build the generated research-agent index.

The source corpus is used for term discovery only. The final research-agent
answer remains grounded in Quran search results from data/quran.db.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
import html
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import sys
import time
from typing import Any, Iterable
import zipfile

from src.app.core import config
from src.app.services import quran_service, research_agent_service

SUPPORTED_EXTENSIONS = {".txt", ".md", ".json", ".srt", ".vtt", ".pdf", ".epub"}
CHUNK_WORDS = 420
CHUNK_OVERLAP = 60
SOURCE_MANIFEST_NAME = "_manifest.json"


@dataclass
class SourceIngestionConfig:
    source_type: str
    title: str
    cleaner: str | None
    exclude: bool
    metadata: dict[str, Any]


def read_text_file(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def flatten_json_strings(value: Any) -> Iterable[str]:
    if isinstance(value, str):
        stripped = value.strip()
        if stripped:
            yield stripped
        return
    if isinstance(value, list):
        for item in value:
            yield from flatten_json_strings(item)
        return
    if isinstance(value, dict):
        for item in value.values():
            yield from flatten_json_strings(item)


def read_json_file(path: Path) -> str:
    data = json.loads(read_text_file(path))
    return "\n".join(flatten_json_strings(data))


def strip_subtitle_markup(text: str) -> str:
    lines = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.upper() == "WEBVTT":
            continue
        if stripped.isdigit():
            continue
        if "-->" in stripped:
            continue
        stripped = re.sub(r"<[^>]+>", "", stripped).strip()
        if stripped:
            lines.append(stripped)
    return "\n".join(lines)


def read_pdf_file(path: Path) -> str:
    try:
        from pypdf import PdfReader  # type: ignore
    except ImportError:
        print(f"Skipping PDF without pypdf installed: {path}")
        return ""

    reader = PdfReader(str(path))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def strip_html_markup(text: str) -> str:
    text = re.sub(r"<script\b[^>]*>.*?</script>", " ", text, flags=re.I | re.S)
    text = re.sub(r"<style\b[^>]*>.*?</style>", " ", text, flags=re.I | re.S)
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def read_epub_file(path: Path) -> str:
    try:
        archive = zipfile.ZipFile(path)
    except zipfile.BadZipFile:
        return ""

    with archive:
        text_names = sorted(
            name
            for name in archive.namelist()
            if name.lower().endswith((".xhtml", ".html", ".htm"))
        )
        chunks: list[str] = []
        for name in text_names:
            basename = Path(name).name.lower()
            if basename.startswith(("cover", "toc", "nav")) or basename in {"info.xhtml", "info.html", "info.htm"}:
                continue
            raw = archive.read(name).decode("utf-8", errors="replace")
            stripped = strip_html_markup(raw)
            if len(stripped) < 40:
                continue
            chunks.append(stripped)
    return "\n".join(chunks)


def read_source_file(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in {".txt", ".md"}:
        return read_text_file(path)
    if suffix == ".json":
        return read_json_file(path)
    if suffix in {".srt", ".vtt"}:
        return strip_subtitle_markup(read_text_file(path))
    if suffix == ".pdf":
        return read_pdf_file(path)
    if suffix == ".epub":
        return read_epub_file(path)
    return ""


def load_source_manifest(sources_dir: Path) -> dict[str, Any]:
    manifest_path = sources_dir / SOURCE_MANIFEST_NAME
    if not manifest_path.exists():
        return {}
    try:
        return json.loads(read_text_file(manifest_path))
    except json.JSONDecodeError:
        print(f"Skipping invalid source manifest: {manifest_path}")
        return {}


def is_hidden_source_path(path: Path, sources_dir: Path) -> bool:
    relative = path.relative_to(sources_dir)
    return any(part.startswith(".") or part.startswith("_") for part in relative.parts)


def iter_source_files(sources_dir: Path) -> Iterable[Path]:
    if not sources_dir.exists():
        return []
    return sorted(
        path
        for path in sources_dir.rglob("*")
        if path.is_file()
        and path.suffix.lower() in SUPPORTED_EXTENSIONS
        and not is_hidden_source_path(path, sources_dir)
    )


def infer_source_type(relative_path: Path, path: Path) -> str:
    parts = relative_path.parts
    if parts and parts[0] == "transcripted_youtube_playlists":
        return "transcript"
    if parts and parts[0] == "books":
        return "book"
    return path.suffix.lower().lstrip(".")


def infer_cleaner(source_type: str, path: Path) -> str | None:
    if source_type == "transcript":
        return "transcript"
    if source_type == "book" and path.suffix.lower() == ".epub":
        return "book_epub"
    if path.suffix.lower() in {".srt", ".vtt"}:
        return "subtitle"
    return None


def clean_transcript_text(text: str) -> str:
    lines = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        stripped = stripped.replace("&gt;&gt;", " ").replace(">>", " ")
        stripped = re.sub(r"\[[^\]\n]{1,40}\]", " ", stripped)
        stripped = re.sub(r"\s+", " ", stripped).strip(" -|")
        if stripped:
            lines.append(stripped)
    return "\n".join(lines)


def clean_book_epub_text(text: str) -> str:
    lines = []
    for line in text.splitlines():
        stripped = re.sub(r"\s+", " ", line).strip()
        if not stripped:
            continue
        stripped = re.sub(r"^كتاب معجم مقاييس اللغة\b", "", stripped).strip(" -:،")
        stripped = re.sub(r"الجزء\s*:\s*.*?الصفحة\s*:\s*[0-9٠-٩]+\s*", " ", stripped).strip()
        stripped = re.sub(r"\(\d+\)", " ", stripped)
        stripped = re.sub(r"\s+", " ", stripped).strip()
        if len(stripped) < 3:
            continue
        lines.append(stripped)

    start_markers = ("كتاب الهمزة", "باب الهمزة")
    start_index = 0
    for index, line in enumerate(lines):
        marker = next((marker for marker in start_markers if marker in line), None)
        if marker:
            start_index = index
            if not line.startswith(marker):
                lines[index] = line[line.index(marker) :].strip()
            break

    cleaned = "\n".join(lines[start_index:])
    cleaned = re.sub(r"^(كتاب\s+\S+)\s+\1\b", r"\1", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def clean_source_text(text: str, cleaner: str | None) -> str:
    if not cleaner:
        return text
    if cleaner == "subtitle":
        return strip_subtitle_markup(text)
    if cleaner == "transcript":
        return clean_transcript_text(text)
    if cleaner == "book_epub":
        return clean_book_epub_text(text)
    return text


def merge_source_metadata(base: dict[str, Any], extra: dict[str, Any] | None) -> dict[str, Any]:
    if not extra:
        return dict(base)
    merged = dict(base)
    for key, value in extra.items():
        if key == "notes" and merged.get(key):
            merged[key] = f"{merged[key]}\n{value}"
        else:
            merged[key] = value
    return merged


def resolve_source_ingestion_config(path: Path, sources_dir: Path, manifest: dict[str, Any]) -> SourceIngestionConfig:
    relative_path = path.relative_to(sources_dir)
    relative_str = relative_path.as_posix()
    source_type = infer_source_type(relative_path, path)
    title = path.stem.replace("_", " ").replace("-", " ").strip() or path.name
    metadata: dict[str, Any] = {
        "relative_dir": relative_path.parent.as_posix() if relative_path.parent != Path(".") else "",
        "collection": relative_path.parent.name if relative_path.parent != Path(".") else "",
        "source_family": source_type,
    }
    cleaner = infer_cleaner(source_type, path)
    exclude = False

    for rule in manifest.get("rules", []):
        prefix = str(rule.get("prefix") or "").strip().strip("/")
        if prefix and relative_str.startswith(prefix):
            source_type = str(rule.get("source_type") or source_type)
            title = str(rule.get("title") or title)
            cleaner = rule.get("cleaner", cleaner)
            exclude = bool(rule.get("exclude", exclude))
            metadata = merge_source_metadata(metadata, rule.get("metadata"))

    document_override = manifest.get("documents", {}).get(relative_str)
    if isinstance(document_override, dict):
        source_type = str(document_override.get("source_type") or source_type)
        title = str(document_override.get("title") or title)
        cleaner = document_override.get("cleaner", cleaner)
        exclude = bool(document_override.get("exclude", exclude))
        metadata = merge_source_metadata(metadata, document_override.get("metadata"))

    if path.name.endswith("_djvu.txt"):
        metadata = merge_source_metadata(metadata, {"quality": "ocr_noisy"})

    return SourceIngestionConfig(
        source_type=source_type,
        title=title,
        cleaner=cleaner,
        exclude=exclude,
        metadata=metadata,
    )


def chunk_text(text: str, chunk_words: int = CHUNK_WORDS, overlap: int = CHUNK_OVERLAP) -> list[str]:
    normalized = re.sub(r"\s+", " ", text).strip()
    if not normalized:
        return []

    words = normalized.split()
    if len(words) <= chunk_words:
        return [normalized]

    chunks = []
    step = max(1, chunk_words - overlap)
    for start in range(0, len(words), step):
        chunk = " ".join(words[start : start + chunk_words]).strip()
        if chunk:
            chunks.append(chunk)
        if start + chunk_words >= len(words):
            break
    return chunks


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def create_schema(cursor: sqlite3.Cursor) -> None:
    cursor.executescript(
        """
        DROP TABLE IF EXISTS chunk_embeddings;
        DROP TABLE IF EXISTS source_chunks_fts;
        DROP TABLE IF EXISTS source_chunks;
        DROP TABLE IF EXISTS source_documents;
        DROP TABLE IF EXISTS quran_terms_fts;
        DROP TABLE IF EXISTS quran_terms;

        CREATE TABLE source_documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_path TEXT NOT NULL,
            title TEXT NOT NULL,
            source_type TEXT NOT NULL,
            content_hash TEXT NOT NULL,
            indexed_at REAL NOT NULL,
            metadata_json TEXT NOT NULL DEFAULT '{}'
        );

        CREATE TABLE source_chunks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER NOT NULL,
            chunk_index INTEGER NOT NULL,
            content TEXT NOT NULL,
            content_simple TEXT NOT NULL,
            token_count INTEGER NOT NULL,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            FOREIGN KEY(document_id) REFERENCES source_documents(id)
        );

        CREATE VIRTUAL TABLE source_chunks_fts USING fts5(
            content,
            content_simple,
            title,
            source_path
        );

        CREATE TABLE chunk_embeddings (
            chunk_id INTEGER NOT NULL,
            provider TEXT NOT NULL,
            model TEXT NOT NULL,
            dimensions INTEGER NOT NULL,
            embedding_json TEXT NOT NULL,
            PRIMARY KEY (chunk_id, provider, model),
            FOREIGN KEY(chunk_id) REFERENCES source_chunks(id)
        );

        CREATE TABLE quran_terms (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mushaf_id INTEGER NOT NULL,
            term_type TEXT NOT NULL,
            text TEXT NOT NULL,
            normalized TEXT NOT NULL,
            root_id INTEGER,
            frequency INTEGER NOT NULL DEFAULT 0,
            metadata_json TEXT NOT NULL DEFAULT '{}'
        );

        CREATE VIRTUAL TABLE quran_terms_fts USING fts5(
            term_type,
            text,
            normalized
        );

        CREATE INDEX idx_source_chunks_document ON source_chunks(document_id);
        CREATE INDEX idx_quran_terms_mushaf_type ON quran_terms(mushaf_id, term_type);
        """
    )


def insert_source_documents(cursor: sqlite3.Cursor, sources_dir: Path, with_embeddings: bool) -> tuple[int, int]:
    provider = research_agent_service.OllamaResearchLlmProvider() if with_embeddings else None
    manifest = load_source_manifest(sources_dir)
    document_count = 0
    chunk_count = 0

    for path in iter_source_files(sources_dir):
        ingestion = resolve_source_ingestion_config(path, sources_dir, manifest)
        if ingestion.exclude:
            continue

        relative_source_path = path.relative_to(sources_dir).as_posix()
        text = clean_source_text(read_source_file(path), ingestion.cleaner)
        chunks = chunk_text(text)
        if not chunks:
            continue

        cursor.execute(
            """
            INSERT INTO source_documents (
                source_path, title, source_type, content_hash, indexed_at, metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                relative_source_path,
                ingestion.title,
                ingestion.source_type,
                content_hash(text),
                time.time(),
                json.dumps(
                    {
                        "absolute_path": str(path),
                        "cleaner": ingestion.cleaner,
                        **ingestion.metadata,
                    },
                    ensure_ascii=False,
                ),
            ),
        )
        document_id = cursor.lastrowid
        document_count += 1

        for index, chunk in enumerate(chunks):
            content_simple = quran_service.normalize_query_search(chunk)
            cursor.execute(
                """
                INSERT INTO source_chunks (
                    document_id, chunk_index, content, content_simple, token_count, metadata_json
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (document_id, index, chunk, content_simple, len(chunk.split()), "{}"),
            )
            chunk_id = cursor.lastrowid
            cursor.execute(
                """
                INSERT INTO source_chunks_fts (
                    rowid, content, content_simple, title, source_path
                ) VALUES (?, ?, ?, ?, ?)
                """,
                (chunk_id, chunk, content_simple, ingestion.title, relative_source_path),
            )
            chunk_count += 1

            if provider is not None:
                embedding = provider.embed_text(chunk)
                cursor.execute(
                    """
                    INSERT INTO chunk_embeddings (
                        chunk_id, provider, model, dimensions, embedding_json
                    ) VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        chunk_id,
                        "ollama",
                        provider.embed_model,
                        len(embedding),
                        json.dumps(embedding),
                    ),
                )

    return document_count, chunk_count


def insert_term(
    cursor: sqlite3.Cursor,
    seen: set[tuple[int, str, str]],
    mushaf_id: int,
    term_type: str,
    text: str,
    normalized: str | None,
    frequency: int,
    root_id: int | None = None,
) -> int:
    text = (text or "").strip()
    normalized = (normalized or quran_service.normalize_query_search(text)).strip()
    if not text or not normalized:
        return 0
    key = (mushaf_id, term_type, normalized)
    if key in seen:
        return 0
    seen.add(key)
    cursor.execute(
        """
        INSERT INTO quran_terms (
            mushaf_id, term_type, text, normalized, root_id, frequency
        ) VALUES (?, ?, ?, ?, ?, ?)
        """,
        (mushaf_id, term_type, text, normalized, root_id, frequency),
    )
    term_id = cursor.lastrowid
    cursor.execute(
        """
        INSERT INTO quran_terms_fts (
            rowid, term_type, text, normalized
        ) VALUES (?, ?, ?, ?)
        """,
        (term_id, term_type, text, normalized),
    )
    return 1


def insert_quran_term_catalog(cursor: sqlite3.Cursor, quran_db_path: Path) -> int:
    source = sqlite3.connect(quran_db_path)
    source.row_factory = sqlite3.Row
    source_cursor = source.cursor()
    seen: set[tuple[int, str, str]] = set()
    count = 0

    source_cursor.execute("SELECT id FROM mushafs ORDER BY id")
    mushaf_ids = [row["id"] for row in source_cursor.fetchall()]
    for mushaf_id in mushaf_ids:
        source_cursor.execute(
            """
            SELECT r.id, r.root_text, r.root_simple, COUNT(DISTINCT wo.ayah_id) AS frequency
            FROM roots r
            JOIN word_occurrences wo ON wo.root_id = r.id
            JOIN ayahs a ON a.id = wo.ayah_id
            WHERE a.mushaf_id = ?
            GROUP BY r.id, r.root_text, r.root_simple
            """,
            (mushaf_id,),
        )
        for row in source_cursor.fetchall():
            count += insert_term(
                cursor,
                seen,
                mushaf_id,
                "root",
                row["root_text"],
                row["root_simple"],
                row["frequency"],
                row["id"],
            )

        source_cursor.execute(
            """
            SELECT word_text, word_simple, COUNT(*) AS frequency
            FROM word_occurrences wo
            JOIN ayahs a ON a.id = wo.ayah_id
            WHERE a.mushaf_id = ?
            GROUP BY word_simple
            """,
            (mushaf_id,),
        )
        for row in source_cursor.fetchall():
            count += insert_term(
                cursor,
                seen,
                mushaf_id,
                "word",
                row["word_text"],
                row["word_simple"],
                row["frequency"],
            )

        source_cursor.execute(
            """
            SELECT
                msv.search_text,
                msv.search_simple,
                COUNT(*) AS frequency
            FROM morphology_search_variants msv
            JOIN word_occurrences wo ON wo.word_simple = msv.surface_simple
            JOIN ayahs a ON a.id = wo.ayah_id
            WHERE a.mushaf_id = ? AND msv.scope = 'word'
            GROUP BY msv.search_simple
            """,
            (mushaf_id,),
        )
        for row in source_cursor.fetchall():
            count += insert_term(
                cursor,
                seen,
                mushaf_id,
                "word",
                row["search_text"],
                row["search_simple"],
                row["frequency"],
            )

        source_cursor.execute(
            """
            SELECT
                aw1.word_text || ' ' || aw2.word_text AS phrase_text,
                aw1.word_simple || ' ' || aw2.word_simple AS phrase_simple,
                COUNT(*) AS frequency
            FROM ayah_words aw1
            JOIN ayah_words aw2
              ON aw2.ayah_id = aw1.ayah_id
             AND aw2.word_position = aw1.word_position + 1
            WHERE aw1.mushaf_id = ?
            GROUP BY phrase_simple
            """,
            (mushaf_id,),
        )
        for row in source_cursor.fetchall():
            count += insert_term(
                cursor,
                seen,
                mushaf_id,
                "phrase",
                row["phrase_text"],
                row["phrase_simple"],
                row["frequency"],
            )

    source.close()
    return count


def build_research_index(
    sources_dir: Path,
    research_db_path: Path,
    quran_db_path: Path,
    with_embeddings: bool,
) -> int:
    research_db_path.parent.mkdir(parents=True, exist_ok=True)
    sources_dir.mkdir(parents=True, exist_ok=True)

    connection = sqlite3.connect(research_db_path)
    try:
        cursor = connection.cursor()
        connection.execute("BEGIN")
        create_schema(cursor)
        document_count, chunk_count = insert_source_documents(cursor, sources_dir, with_embeddings)
        term_count = insert_quran_term_catalog(cursor, quran_db_path)
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()

    print(f"Indexed {document_count} source documents into {chunk_count} chunks.")
    print(f"Indexed {term_count} Quran term candidates.")
    print(f"Research index written to: {research_db_path}")
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build the Q-Basair research-agent index.")
    parser.add_argument("--sources-dir", default=config.get_research_sources_path())
    parser.add_argument("--research-db", default=config.get_research_index_path())
    parser.add_argument("--quran-db", default=config.get_db_path())
    parser.add_argument("--with-embeddings", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        return build_research_index(
            sources_dir=Path(args.sources_dir),
            research_db_path=Path(args.research_db),
            quran_db_path=Path(args.quran_db),
            with_embeddings=args.with_embeddings,
        )
    except Exception as exc:
        print(f"Research index build failed: {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
