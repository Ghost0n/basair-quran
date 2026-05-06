import time
from typing import Literal

from fastapi import APIRouter, HTTPException, Query

from src.app.core import config
from src.app.models.api import (
    BatchSuggestRequest,
    LegacySearchResponse,
    PaginatedSearchResponse,
    SearchResultPageResponse,
    SuggestionItem,
)
from src.app.services import quran_service

router = APIRouter(prefix="/api", tags=["search"])


@router.get("/suggest", response_model=list[SuggestionItem])
def suggest(
    q: str = Query(..., min_length=1, max_length=config.MAX_QUERY_LENGTH),
    mushaf: int = Query(1, description="Mushaf ID (1=Qalon, 2=Hafs)"),
    mode: Literal["root", "exact"] = Query("root", description="Search mode: 'root' or 'exact'"),
    with_chakl: bool = Query(False, description="Return vocalized suggestions when true"),
) -> list[SuggestionItem]:
    start = time.time()
    cursor = quran_service.get_db().cursor()
    q_simple = quran_service.normalize_text_search(q)
    is_latin_query = quran_service.contains_latin_text(q)

    suggestions = []
    if is_latin_query and mode != "exact":
        suggestions.extend(quran_service.build_root_suggestions_by_latin(cursor, q, mushaf, 5))
        suggestions.extend(quran_service.build_word_suggestions_by_latin(cursor, q, mushaf, 10, with_chakl))
    elif is_latin_query:
        suggestions.extend(quran_service.build_word_suggestions_by_latin(cursor, q, mushaf, 10, with_chakl))
    elif mode == "exact" and len(quran_service.tokenize_exact_query(q)) > 1:
        suggestions.extend(quran_service.build_phrase_suggestions(cursor, q, mushaf, 10, with_chakl))
    elif mode != "exact":
        suggestions.extend(quran_service.build_root_suggestions(cursor, f"{q_simple}%", 5))
        existing_root_texts = {item["text"] for item in suggestions if item["type"] == "root"}
        for item in quran_service.build_root_suggestions_by_surface_query(cursor, q_simple, mushaf, 5):
            if item["text"] in existing_root_texts:
                continue
            suggestions.append(item)
            existing_root_texts.add(item["text"])
        suggestions.extend(quran_service.build_word_suggestions(cursor, q_simple, mushaf, 10, with_chakl))
    else:
        suggestions.extend(quran_service.build_word_suggestions(cursor, q_simple, mushaf, 10, with_chakl))

    quran_service.logger.info(
        "GET /api/suggest?q=%s...&mode=%s - %.1fms - %s results",
        q[:10],
        mode,
        (time.time() - start) * 1000,
        len(suggestions),
    )
    return suggestions


@router.post("/suggest-batch", response_model=list[SuggestionItem])
def suggest_batch(req: BatchSuggestRequest) -> list[SuggestionItem]:
    start = time.time()
    cursor = quran_service.get_db().cursor()
    combined_results = {}
    queries = req.queries[:5]
    if any(len(query) > config.MAX_QUERY_LENGTH for query in queries):
        raise HTTPException(status_code=422, detail=f"Suggestion queries must be at most {config.MAX_QUERY_LENGTH} characters.")

    for query in queries:
        q_simple = quran_service.normalize_text_search(query)
        is_latin_query = quran_service.contains_latin_text(query)
        if not q_simple:
            continue

        if is_latin_query and req.mode != "exact":
            for item in quran_service.build_root_suggestions_by_latin(cursor, query, req.mushaf, 2):
                combined_results.setdefault(f"root:{item['text']}", item)
            for item in quran_service.build_word_suggestions_by_latin(cursor, query, req.mushaf, 5, req.with_chakl):
                combined_results.setdefault(f"word:{item['text']}", item)
            continue

        if is_latin_query:
            for item in quran_service.build_word_suggestions_by_latin(cursor, query, req.mushaf, 5, req.with_chakl):
                combined_results.setdefault(f"word:{item['text']}", item)
            continue

        if req.mode == "exact" and len(quran_service.tokenize_exact_query(query)) > 1:
            for item in quran_service.build_phrase_suggestions(cursor, query, req.mushaf, 5, req.with_chakl):
                combined_results.setdefault(f"phrase:{item['text']}", item)
            continue

        if req.mode != "exact":
            for item in quran_service.build_root_suggestions(cursor, f"{q_simple}%", 2):
                combined_results.setdefault(f"root:{item['text']}", item)
            for item in quran_service.build_root_suggestions_by_surface_query(cursor, q_simple, req.mushaf, 2):
                combined_results.setdefault(f"root:{item['text']}", item)

        for item in quran_service.build_word_suggestions(cursor, q_simple, req.mushaf, 5, req.with_chakl):
            combined_results.setdefault(f"word:{item['text']}", item)

    results = list(combined_results.values())
    quran_service.logger.info(
        "POST /api/suggest-batch (%s queries) - %.1fms - %s results",
        len(queries),
        (time.time() - start) * 1000,
        len(results),
    )
    return results


@router.get("/search", response_model=LegacySearchResponse, response_model_exclude_none=True)
def search(
    q: str = Query(..., max_length=config.MAX_QUERY_LENGTH, description="Arabic word to search"),
    mode: Literal["root", "exact"] = Query("root", description="Search mode: 'root' or 'exact'"),
    mushaf: int = Query(1, description="Mushaf ID"),
) -> LegacySearchResponse:
    start = time.time()
    cursor = quran_service.get_db().cursor()
    q_simple = quran_service.build_exact_query_simple(q) if mode == "exact" else quran_service.normalize_query_search(q)

    if mode == "exact":
        results, did_you_mean = quran_service.build_legacy_exact_results(cursor, q, q_simple, mushaf)
        if not results:
            quran_service.logger.info(
                "GET /api/search?q=%s...&mode=exact - %.1fms - no results",
                q[:10],
                (time.time() - start) * 1000,
            )
            return LegacySearchResponse(found=False, message="No results found.", results=[], did_you_mean=did_you_mean)

        quran_service.logger.info(
            "GET /api/search?q=%s...&mode=exact - %.1fms - %s verses",
            q[:10],
            (time.time() - start) * 1000,
            results[0]["total_verses"],
        )
        return LegacySearchResponse(found=True, results=results)

    results = quran_service.build_legacy_root_results(cursor, q_simple, mushaf)
    if not results:
        quran_service.logger.info(
            "GET /api/search?q=%s...&mode=root - %.1fms - no results",
            q[:10],
            (time.time() - start) * 1000,
        )
        return LegacySearchResponse(found=False, message="No results found.", results=[])

    total_verses = sum(result["total_verses"] for result in results)
    quran_service.logger.info(
        "GET /api/search?q=%s...&mode=root - %.1fms - %s verses",
        q[:10],
        (time.time() - start) * 1000,
        total_verses,
    )
    return LegacySearchResponse(found=True, results=results)


@router.get("/search-v2", response_model=PaginatedSearchResponse, response_model_exclude_none=True)
def search_v2(
    q: str = Query(..., max_length=config.MAX_QUERY_LENGTH, description="Arabic word to search"),
    mode: Literal["root", "exact"] = Query("root", description="Search mode: 'root' or 'exact'"),
    mushaf: int = Query(1, description="Mushaf ID"),
    page_size: int = Query(config.DEFAULT_PAGE_SIZE, ge=1, le=config.MAX_PAGE_SIZE),
) -> PaginatedSearchResponse:
    start = time.time()
    cursor = quran_service.get_db().cursor()
    q_simple = quran_service.build_exact_query_simple(q) if mode == "exact" else quran_service.normalize_query_search(q)
    results, did_you_mean = quran_service.build_paginated_search_results(cursor, q, q_simple, mode, mushaf, page_size)

    if not results:
        quran_service.logger.info(
            "GET /api/search-v2?q=%s...&mode=%s - %.1fms - no results",
            q[:10],
            mode,
            (time.time() - start) * 1000,
        )
        return PaginatedSearchResponse(
            found=False,
            message="No results found.",
            page_size=page_size,
            results=[],
            did_you_mean=did_you_mean,
        )

    total_verses = sum(result["total_verses"] for result in results)
    quran_service.logger.info(
        "GET /api/search-v2?q=%s...&mode=%s - %.1fms - %s verses",
        q[:10],
        mode,
        (time.time() - start) * 1000,
        total_verses,
    )
    return PaginatedSearchResponse(found=True, page_size=page_size, results=results)


@router.get("/search-result-page", response_model=SearchResultPageResponse, response_model_exclude_none=True)
def search_result_page(
    q: str = Query(..., max_length=config.MAX_QUERY_LENGTH, description="Arabic word to search"),
    mode: Literal["root", "exact"] = Query("root", description="Search mode: 'root' or 'exact'"),
    mushaf: int = Query(1, description="Mushaf ID"),
    result_key: str = Query(..., min_length=1),
    page: int = Query(1, ge=1),
    page_size: int = Query(config.DEFAULT_PAGE_SIZE, ge=1, le=config.MAX_PAGE_SIZE),
) -> SearchResultPageResponse:
    start = time.time()
    cursor = quran_service.get_db().cursor()
    q_simple = quran_service.build_exact_query_simple(q) if mode == "exact" else quran_service.normalize_query_search(q)
    result = quran_service.build_single_result_page(cursor, q, q_simple, mode, mushaf, result_key, page, page_size)

    if result is None:
        quran_service.logger.info(
            "GET /api/search-result-page?q=%s...&mode=%s&key=%s - not found",
            q[:10],
            mode,
            result_key,
        )
        raise HTTPException(status_code=404, detail="Result page not found.")

    quran_service.logger.info(
        "GET /api/search-result-page?q=%s...&mode=%s&key=%s&page=%s - %.1fms",
        q[:10],
        mode,
        result_key,
        result["page"],
        (time.time() - start) * 1000,
    )
    return SearchResultPageResponse(found=True, result=result)
