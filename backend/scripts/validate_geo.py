"""Validates the boundary files exactly as the API will at startup, with synthetic data forbidden.

Run in CI and after every boundary rebuild:  python -m scripts.validate_geo
"""

import sys

from app.core.config import get_settings
from app.geo.loader import GeoError, load_store

if __name__ == "__main__":
    settings = get_settings()
    try:
        store = load_store(settings.geo_dir, allow_synthetic=False)
    except GeoError as exc:
        sys.exit(f"INVALID: {exc}")
    print(
        f"OK: {len(store.states.pcodes)} states, {len(store.counties.pcodes)} counties "
        f"({store.meta.source})"
    )
