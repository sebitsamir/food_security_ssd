"""Canonical feature contract shared by training and inference."""

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

PHASE_NAMES = {
    1: "Minimal",
    2: "Stressed",
    3: "Crisis",
    4: "Emergency",
    5: "Catastrophe",
}


def build_frame(rows: Iterable[Mapping[str, Any]]) -> pd.DataFrame:
    """Build the exact DataFrame contract expected by the production pipeline.

    The API/database stores IPC phases as integers 1–5, while the official
    competition data stores phase names. Convert integers back to the original
    names so categorical encodings learned during training remain valid.
    """
    data = []
    for row in rows:
        phase = int(row["phase"])
        if phase not in PHASE_NAMES:
            raise ValueError(f"Unsupported IPC phase: {phase}")
        data.append(
            {
                "state": str(row["state"]),
                "county": str(row["county"]),
                "prior_period_ipc_phase": PHASE_NAMES[phase],
                "population": float(row["population"]),
                "start_year": float(row["year"]),
                "start_month": float(row["month"]),
                "prior_period_phase3plus_pct": float(row["pct"]),
                "prior_year_cereal_production_tonnes": float(row["production"]),
                "prior_year_cereal_gap_tonnes": float(row["gap"]),
                "prior_ipc_severity": float(phase),
            }
        )
    return pd.DataFrame(data, columns=FEATURES)
