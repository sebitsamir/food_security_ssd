"""Imports the inputs your model needs (one row per county and period) from a CSV.

    python -m scripts.import_observations path/to/observations.csv

Columns: county_pcode, period (YYYY-MM), population, prior_ipc_phase (1-5), phase3plus_pct (0-100),
cereal_production_t, cereal_gap_t. Re-running updates existing rows. Any bad row aborts the whole
import (nothing is written), and the error says which line.
"""

import csv
import sys
from pathlib import Path

from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings
from app.db.models import Geography, Observation
from app.db.session import make_engine

COLUMNS = ["county_pcode", "period", "population", "prior_ipc_phase", "phase3plus_pct",
           "cereal_production_t", "cereal_gap_t"]  # fmt: skip


class Row(BaseModel):
    county_pcode: str = Field(min_length=1, max_length=16)
    period: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    population: int = Field(ge=1, le=50_000_000)
    prior_ipc_phase: int = Field(ge=1, le=5)
    phase3plus_pct: float = Field(ge=0, le=100)
    cereal_production_t: float = Field(ge=0, le=1e9)
    cereal_gap_t: float = Field(ge=-1e9, le=1e9)


class ImportError_(ValueError):
    pass


def import_csv(session: Session, path: Path) -> dict[str, int]:
    with path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        missing = [c for c in COLUMNS if c not in (reader.fieldnames or [])]
        if missing:
            raise ImportError_(f"missing columns: {', '.join(missing)}")
        rows: list[Row] = []
        for line, raw in enumerate(reader, start=2):
            try:
                rows.append(Row.model_validate(raw))
            except ValidationError as exc:
                first = exc.errors()[0]
                raise ImportError_(f"line {line}: {first['loc'][0]}: {first['msg']}") from exc

    known = set(session.scalars(select(Geography.pcode).where(Geography.level == "county")))
    unknown = sorted({r.county_pcode for r in rows} - known)
    if unknown:
        raise ImportError_(f"unknown counties: {', '.join(unknown[:10])}")
    seen: set[tuple[str, str]] = set()
    for r in rows:
        if (r.county_pcode, r.period) in seen:
            raise ImportError_(f"duplicate row for {r.county_pcode} {r.period}")
        seen.add((r.county_pcode, r.period))

    existing = {(o.county_pcode, o.period): o for o in session.scalars(select(Observation))}
    counts = {"inserted": 0, "updated": 0}
    for r in rows:
        values = {"population": r.population, "prior_ipc_phase": r.prior_ipc_phase,
                  "phase3plus_pct": r.phase3plus_pct, "cereal_production_t": r.cereal_production_t,
                  "cereal_gap_t": r.cereal_gap_t}  # fmt: skip
        row = existing.get((r.county_pcode, r.period))
        if row is None:
            session.add(Observation(county_pcode=r.county_pcode, period=r.period, **values))
            counts["inserted"] += 1
        else:
            for k, v in values.items():
                setattr(row, k, v)
            counts["updated"] += 1
    session.commit()
    return counts


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    settings = get_settings()
    try:
        with sessionmaker(make_engine(settings.database_url))() as s:
            print(import_csv(s, Path(sys.argv[1])))
    except ImportError_ as exc:
        sys.exit(f"INVALID: {exc}")
