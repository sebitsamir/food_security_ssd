"""Syncs the geographies table from the same GeoJSON the map uses.

Run after every boundary rebuild:  python -m scripts.load_geographies
Idempotent. Never deletes rows (forecasts may reference them); it reports orphans instead.
"""

import json
import sys

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.db.models import Geography
from app.db.session import make_engine


def sync(session: Session, settings: Settings) -> dict[str, int]:
    counts = {"inserted": 0, "updated": 0, "unchanged": 0}
    existing = {g.pcode: g for g in session.scalars(select(Geography))}
    for file, db_level in (("states.geojson", "state"), ("counties.geojson", "county")):
        data = json.loads((settings.geo_dir / file).read_text(encoding="utf-8"))
        for f in data["features"]:
            p = f["properties"]
            want = {"name": p["name"], "level": db_level, "parent_pcode": p.get("parent")}
            row = existing.get(p["pcode"])
            if row is None:
                session.add(Geography(pcode=p["pcode"], **want))
                counts["inserted"] += 1
            elif (row.name, row.level, row.parent_pcode) != tuple(want.values()):
                row.name, row.level = want["name"], want["level"]
                row.parent_pcode = want["parent_pcode"]
                counts["updated"] += 1
            else:
                counts["unchanged"] += 1
        session.flush()  # states first, so county FKs resolve
    session.commit()
    return counts


if __name__ == "__main__":
    settings = get_settings()
    from sqlalchemy.orm import sessionmaker

    with sessionmaker(make_engine(settings.database_url))() as s:
        print(sync(s, settings))
    sys.exit(0)
