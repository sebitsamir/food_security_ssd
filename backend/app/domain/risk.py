"""Risk bands. The single server-side definition; the UI mirrors it for colours."""

from typing import Literal

BandKey = Literal["lower", "moderate", "elevated", "high"]
_EDGES: tuple[tuple[BandKey, float], ...] = (
    ("lower", 0.2),
    ("moderate", 0.5),
    ("elevated", 0.8),
    ("high", 1.0000001),
)


def band_for(probability: float) -> BandKey:
    if not 0.0 <= probability <= 1.0:
        raise ValueError(f"probability out of range: {probability}")
    for key, upper in _EDGES:
        if probability < upper:
            return key
    return "high"
