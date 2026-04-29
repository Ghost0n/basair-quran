from src.app.factory import app
from src.app.services import quran_service
from src.app.core import config

close_db_connection = quran_service.close_db_connection
reset_morphology_search_index = quran_service.reset_morphology_search_index
parse_page_span = quran_service.parse_page_span
page_value_contains = quran_service.page_value_contains
standardize_uthmani = quran_service.standardize_uthmani
uthmani_matches_query = quran_service.uthmani_matches_query
has_query_diacritics = quran_service.has_query_diacritics
plain_arabic_display_text = quran_service.plain_arabic_display_text


def get_db_path() -> str:
    return config.get_db_path()


def set_db_path(path: str) -> None:
    close_db_connection()
    config.set_db_path(path)


def get_morphology_path() -> str:
    return config.get_morphology_path()


def set_morphology_path(path: str) -> None:
    reset_morphology_search_index()
    config.set_morphology_path(path)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8001)
