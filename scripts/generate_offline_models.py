"""Generate the response-model spec the on-device engine shapes its answers with.

Also emits the static reciter catalogue, which the engine serves as is.

The server's JSON is whatever its Pydantic response models make of a route's
return value: unknown keys dropped, defaults filled in, ``None`` fields removed
on routes declared with ``response_model_exclude_none``. The TypeScript engine
(``packages/offline-engine``) must answer with the same JSON, so rather than
copying ~30 models by hand it reads this generated spec of
``src/app/models/api.py``. ``tests/test_offline_models.py`` fails when the
file is out of date.

Usage:
    python scripts/generate_offline_models.py [--check]
"""
from __future__ import annotations

import argparse
import json
import sys
import types
import typing
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "packages" / "offline-engine" / "src" / "models.generated.ts"

# The models behind the routes the engine answers (their nested models follow).
ROOT_MODELS = [
    "MushafItem", "SurahListItem", "ReciterItem", "SuggestionItem",
    "LegacySearchResponse", "PaginatedSearchResponse", "SearchResultPageResponse", "RootDistributionResponse",
    "AyahReaderResponse", "AyahReaderMoreResponse", "QuranPageResponse", "MushafPageLayoutResponse",
    "TextCountResponse", "MorphologyResponse", "TranslationInfo", "TranslationAyahsResponse",
    # The user's own data, kept on the device (notebook, themes, sessions, roots, documents, preferences).
    "NotebookItem", "NotebookItemCreate", "NotebookItemThemes", "ThemeSummary", "ThemeDetail", "ThemeCreate",
    "ThemeUpdate", "ThemeBoardSave", "ResearchSessionSummary", "ResearchSessionDetail", "ResearchSessionSave",
    "ResearchDocumentSave", "ResearchDocument", "ResearchDocumentSummary", "DocumentAudit", "FollowedRoot",
    "FollowedRootCreate", "DeleteResult", "UserPreferences", "UserPreferencesUpdate",
]

# Constants the local user-data store enforces exactly like the server.
CONSTANTS = [
    "THEME_COLORS", "MAX_THEMES_PER_USER", "MAX_THEMES_PER_ITEM", "MAX_THEME_BOARD_BYTES", "MAX_SESSION_MESSAGES_BYTES",
    "MAX_DOCUMENT_BYTES", "MAX_DOCUMENTS_PER_USER", "RESEARCH_DOCUMENT_VERSION", "MUSHAF_EDITION_IDS",
    "DEFAULT_MUSHAF_EDITION",
]

SCALARS = {int: "int", float: "float", str: "str", bool: "bool"}


def _constraints(metadata) -> dict:
    """min/max length and ge/le bounds from a field's (or Annotated type's) metadata."""
    out: dict = {}
    for item in metadata or []:
        for attr, key in (("min_length", "min_length"), ("max_length", "max_length"), ("ge", "ge"), ("le", "le")):
            value = getattr(item, attr, None)
            if value is not None:
                out[key] = value
    return out


def _type(annotation, models: dict, pending: list) -> dict:
    from pydantic import BaseModel

    origin = typing.get_origin(annotation)
    args = typing.get_args(annotation)
    if origin is typing.Annotated:
        return {**_type(args[0], models, pending), **_constraints(args[1:])}
    if annotation is typing.Any:
        return {"kind": "any"}
    if annotation is dict or origin in (dict, typing.Dict):
        return {"kind": "dict"}
    if origin in (typing.Union, types.UnionType):
        members = [a for a in args if a is not type(None)]
        inner = _type(members[0], models, pending) if len(members) == 1 else {"kind": "union", "of": [_type(m, models, pending) for m in members]}
        return {"kind": "optional", "of": inner} if len(members) < len(args) else inner
    if origin in (list, typing.List):
        return {"kind": "list", "of": _type(args[0], models, pending)}
    if origin is typing.Literal:
        return {"kind": "literal", "values": list(args)}
    if isinstance(annotation, type) and issubclass(annotation, BaseModel):
        if annotation.__name__ not in models and annotation.__name__ not in pending:
            pending.append(annotation.__name__)
        return {"kind": "model", "name": annotation.__name__}
    if annotation in SCALARS:
        return {"kind": SCALARS[annotation]}
    raise TypeError(f"unsupported annotation {annotation!r}")


def reciters() -> list[dict]:
    sys.path.insert(0, str(ROOT))
    try:
        from src.app.services import reciter_service
    finally:
        sys.path.pop(0)
    return reciter_service.list_reciters()


def build_spec() -> dict:
    sys.path.insert(0, str(ROOT))
    try:
        from pydantic_core import PydanticUndefined

        from src.app.models import api
    finally:
        sys.path.pop(0)

    models: dict = {}
    pending = list(ROOT_MODELS)
    while pending:
        name = pending.pop(0)
        model = getattr(api, name)
        fields = []
        for field_name, info in model.model_fields.items():
            field = {"name": field_name, "type": {**_type(info.annotation, models, pending), **_constraints(info.metadata)}}
            if info.default_factory is not None:
                default = info.default_factory()
                field["default"] = default.model_dump(mode="json") if hasattr(default, "model_dump") else default
            elif info.default is not PydanticUndefined:
                field["default"] = info.default
            fields.append(field)
        models[name] = fields
    return dict(sorted(models.items()))


def constants() -> dict:
    sys.path.insert(0, str(ROOT))
    try:
        from src.app.models import api
        from src.app.services import app_data_service
    finally:
        sys.path.pop(0)
    values = {name: getattr(api, name) for name in CONSTANTS}
    values["DEFAULT_PREFERENCES"] = app_data_service.DEFAULT_PREFERENCES
    values["DEFAULT_USER_ID"] = app_data_service.DEFAULT_USER_ID
    return {name: list(value) if isinstance(value, tuple) else value for name, value in values.items()}


def render(spec: dict, reciter_list: list[dict], constant_values: dict | None = None) -> str:
    dump = lambda value: json.dumps(value, ensure_ascii=False)  # noqa: E731
    body = "{\n" + ",\n".join(
        f"  {dump(name)}: [\n" + ",\n".join(f"    {dump(field)}" for field in fields) + "\n  ]"
        for name, fields in spec.items()
    ) + "\n}"
    return (
        "// Generated by scripts/generate_offline_models.py from src/app/models/api.py — do not edit.\n"
        "// Regenerate with: python scripts/generate_offline_models.py\n"
        'import type { ModelSpec } from "./shape";\n\n'
        f"export const MODELS: Record<string, ModelSpec> = {body};\n\n"
        "// src/app/services/reciter_service.py (audio streams from each reciter's public audio_base).\n"
        "export const RECITERS = [\n" + "".join(f"  {dump(r)},\n" for r in reciter_list) + "];\n\n"
        "// src/app/models/api.py and src/app/services/app_data_service.py constants.\n"
        + "".join(f"export const {name} = {dump(value)};\n" for name, value in (constant_values or {}).items())
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true", help="fail if the generated file is out of date")
    args = parser.parse_args(argv)
    content = render(build_spec(), reciters(), constants())
    if args.check:
        current = OUTPUT.read_text(encoding="utf-8") if OUTPUT.exists() else ""
        if current != content:
            print(f"{OUTPUT.relative_to(ROOT)} is out of date — run python scripts/generate_offline_models.py")
            return 1
        return 0
    OUTPUT.write_text(content, encoding="utf-8")
    print(f"wrote {OUTPUT.relative_to(ROOT)} ({len(content)} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
