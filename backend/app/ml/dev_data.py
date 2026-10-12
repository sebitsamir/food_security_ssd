"""SYNTHETIC data generator for development. Never used to produce real forecasts.

Shared by the dev training script, the dev seed script and the tests, so they agree.
"""

import math
import random
from collections.abc import Sequence
from dataclasses import dataclass

DEV_VERSION = "1.0.0-dev"
# 12 labelled periods for training/validation, then 2 forecast periods without labels.
TRAIN_PERIODS = [
    "2019-10", "2020-04", "2020-10", "2021-04", "2021-10", "2022-04",
    "2022-10", "2023-04", "2023-10", "2024-04", "2024-10", "2025-04",
]  # fmt: skip
FORECAST_PERIODS = ["2025-10", "2026-04"]
ALL_PERIODS = TRAIN_PERIODS + FORECAST_PERIODS


@dataclass(frozen=True)
class Obs:
    county: str
    state: str
    period: str
    population: int
    phase: int
    pct: float
    production: float
    gap: float
    label: int | None  # None for forecast periods


def latent(phase: int, pct: float, production: float, gap: float, population: int) -> float:
    return (
        -3.268 + 0.05 * pct + 0.55 * phase - 0.00003 * production - 0.000035 * gap
        + 0.0000004 * (population - 420000)
    )  # fmt: skip


def _sigmoid(z: float) -> float:
    return 1 / (1 + math.exp(-z))


def generate(counties: Sequence[tuple[str, str]], seed: int = 11) -> list[Obs]:
    """counties: (county_pcode, state_pcode) pairs."""
    rnd = random.Random(seed)
    state_base: dict[str, float] = {}
    out: list[Obs] = []
    for county, state in sorted(counties):
        state_base.setdefault(state, rnd.uniform(0.15, 0.85))
        base = min(0.95, max(0.05, state_base[state] + rnd.uniform(-0.2, 0.2)))
        pop0 = rnd.uniform(40_000, 560_000)
        for i, period in enumerate(ALL_PERIODS):
            pct = min(98.0, max(2.0, base * 78 + rnd.gauss(0, 9)))
            phase = 1 + (pct > 20) + (pct > 40) + (pct > 60) + (pct > 80)
            production = float(round(rnd.uniform(2_000, 40_000)))
            gap = -float(round(3_000 + rnd.uniform(0, 30_000) + base * 10_000))
            population = round(pop0 * (1 + 0.015 * i))
            label = None
            if period in TRAIN_PERIODS:
                z = latent(phase, pct, production, gap, population) + rnd.gauss(0, 0.6)
                label = int(rnd.random() < _sigmoid(z))
            out.append(Obs(county, state, period, population, phase, round(pct, 1), production,
                           gap, label))  # fmt: skip
    return out


def year_month(period: str) -> tuple[int, int]:
    y, m = period.split("-")
    return int(y), int(m)


def obs_to_row(o: Obs) -> dict[str, object]:
    year, month = year_month(o.period)
    return {"state": o.state, "county": o.county, "population": o.population, "year": year,
            "month": month, "phase": o.phase, "pct": o.pct, "production": o.production,
            "gap": o.gap}  # fmt: skip
