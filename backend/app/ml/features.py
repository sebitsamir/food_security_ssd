"""The canonical feature contract shared by training and inference.

Changing anything here changes what a trained pipeline expects, so it is versioned with the model
(metadata.json lists FEATURES and the loader refuses a model whose list differs).
"""

from collections.abc import Iterable, Mapping
from typing import Any

import pandas as pd

CATEGORICAL = ["state", "county", "prior_period_ipc_phase"]
NUMERIC = [
    "population",
    "start_year",
    "start_month",
    "prior_period_phase3plus_pct",
    "prior_year_cereal_production_tonnes",
    "prior_year_cereal_gap_tonnes",
    "prior_ipc_severity",
]
FEATURES = CATEGORICAL + NUMERIC

PHASE_NAMES = {1: "Minimal", 2: "Stressed", 3: "Crisis", 4: "Emergency", 5: "Catastrophe"}


def build_frame(rows: Iterable[Mapping[str, Any]]) -> pd.DataFrame:
    """rows: dicts with state, county, population, year, month, phase, pct, production, gap."""
    data = [
        {
            "state": str(r["state"]),
            "county": str(r["county"]),
            "prior_period_ipc_phase": str(int(r["phase"])),
            "population": float(r["population"]),
            "start_year": float(r["year"]),
            "start_month": float(r["month"]),
            "prior_period_phase3plus_pct": float(r["pct"]),
            "prior_year_cereal_production_tonnes": float(r["production"]),
            "prior_year_cereal_gap_tonnes": float(r["gap"]),
            "prior_ipc_severity": float(int(r["phase"])),
        }
        for r in rows
    ]
    return pd.DataFrame(data, columns=FEATURES)
