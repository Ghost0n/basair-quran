"""The on-device engine shapes its answers with a spec generated from the API
models; it must be regenerated whenever src/app/models/api.py changes."""
from scripts import generate_offline_models


def test_the_engine_model_spec_is_up_to_date():
    assert generate_offline_models.main(["--check"]) == 0, "run: python scripts/generate_offline_models.py"


def test_the_spec_covers_every_offline_route_model():
    spec = generate_offline_models.build_spec()
    for name in generate_offline_models.ROOT_MODELS:
        assert name in spec
    # Nested models follow their parents (e.g. a search verse inside a result).
    assert "SearchVerse" in spec and "MushafLayoutGlyph" in spec
