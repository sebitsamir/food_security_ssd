"""Build real (non-synthetic) states/counties.geojson from geoBoundaries SSD ADM1+ADM2.

Keeps the app's original 79-county roster and DEV* pcodes from make_dev_fixture.STATES,
matched onto OCHA-aligned real geometries (same lineage as the CSRF 10-states map).
Akoka is missing from current geoBoundaries ADM2; it is carved from Melut so the count stays 79.
"""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from pathlib import Path

from shapely.geometry import box, shape
from shapely.ops import unary_union
from shapely.validation import make_valid

from scripts.make_dev_fixture import STATES

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data" / "ocha"
OUT = ROOT / "backend" / "data" / "geo"

# geoBoundaries / OCHA name -> our fixture name
ALIASES = {
    "kajo-keji": "Kajo-Keji",
    "kajo keji": "Kajo-Keji",
    "lafon": "Lopa/Lafon",
    "lopa/lafon": "Lopa/Lafon",
    "canal/pigi": "Pigi/Canal",
    "pigi/canal": "Pigi/Canal",
    "raga": "Raja",
    "raja": "Raja",
    "luakpiny/nasir": "Nasir",
    "nasir": "Nasir",
}


def _norm(name: str) -> str:
    s = name.strip().lower().replace("_", " ").replace("-", " ")
    s = re.sub(r"\s+", " ", s)
    key = s.replace(" ", "-") if "kajo" in s else s
    # Prefer slash forms preserved for alias lookup
    raw = name.strip().lower().replace("_", "/")
    for candidate in (raw, s, key, s.replace(" ", "-")):
        if candidate in ALIASES:
            return ALIASES[candidate].lower()
    return s


def _load(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))  # type: ignore[no-any-return]


def _clean(geom: object) -> object:
    from shapely.geometry.base import BaseGeometry  # noqa: PLC0415

    g = make_valid(geom)  # type: ignore[arg-type]
    if g.geom_type == "GeometryCollection":
        polys = [p for p in g.geoms if p.geom_type in ("Polygon", "MultiPolygon")]
        g = unary_union(polys)
    return g.simplify(0.006, preserve_topology=True)  # type: ignore[return-value]


def _feature(props: dict[str, object], geom: object) -> dict[str, object]:
    return {
        "type": "Feature",
        "properties": props,
        "geometry": json.loads(json.dumps(_clean(geom).__geo_interface__)),  # type: ignore[union-attr]
    }


def _carve_akoka(melut: object) -> tuple[object, object]:
    """Split the southern ~28% of Melut into Akoka (historical neighbour)."""
    minx, miny, maxx, maxy = melut.bounds  # type: ignore[union-attr]
    cut_y = miny + (maxy - miny) * 0.28
    akoka = melut.intersection(box(minx - 0.01, miny - 0.01, maxx + 0.01, cut_y))  # type: ignore[union-attr]
    rest = melut.difference(akoka)  # type: ignore[union-attr]
    if akoka.is_empty or rest.is_empty or akoka.area < 1e-4:  # type: ignore[union-attr]
        raise SystemExit("Failed to carve Akoka from Melut")
    return rest, akoka



def main() -> None:
    adm1 = _load(SRC / "geoBoundaries-SSD-ADM1.geojson")
    adm2 = _load(SRC / "geoBoundaries-SSD-ADM2.geojson")

    adm1_by: dict[str, object] = {
        _norm(f["properties"]["shapeName"]): f for f in adm1["features"]  # type: ignore[index]
    }
    adm2_by: dict[str, object] = {}
    for f in adm2["features"]:  # type: ignore[union-attr]
        adm2_by[_norm(f["properties"]["shapeName"])] = shape(f["geometry"])  # type: ignore[index]

    states_fc: list[dict[str, object]] = []
    counties_fc: list[dict[str, object]] = []
    missing: list[str] = []

    for state_pcode, state_name, _site, county_names in STATES:
        key = _norm(state_name)
        if key not in adm1_by:
            raise SystemExit(f"ADM1 missing state: {state_name}")
        state_geom = shape(adm1_by[key]["geometry"])  # type: ignore[index]
        states_fc.append(_feature({"pcode": state_pcode, "name": state_name}, state_geom))

        for i, cname in enumerate(county_names, start=1):
            cpcode = f"{state_pcode}{i:02d}"
            ckey = _norm(cname)
            if cname == "Akoka":
                continue  # carved after Melut is known
            if ckey not in adm2_by:
                missing.append(f"{state_name}/{cname}")
                continue
            counties_fc.append(
                _feature({"pcode": cpcode, "name": cname, "parent": state_pcode}, adm2_by[ckey])
            )

    if missing:
        raise SystemExit(f"ADM2 missing counties: {missing}")

    # Carve Akoka from Melut; rewrite Melut geom and insert Akoka with its fixture pcode.
    melut_idx = next(i for i, f in enumerate(counties_fc) if f["properties"]["name"] == "Melut")  # type: ignore[index]
    melut_feat = counties_fc[melut_idx]
    melut_geom = shape(melut_feat["geometry"])  # type: ignore[index]
    melut_rest, akoka_geom = _carve_akoka(melut_geom)
    counties_fc[melut_idx] = _feature(melut_feat["properties"], melut_rest)  # type: ignore[arg-type]

    akoka_pcode = next(
        f"{sp}{i:02d}"
        for sp, sn, _, cs in STATES
        if sn == "Upper Nile"
        for i, c in enumerate(cs, start=1)
        if c == "Akoka"
    )
    counties_fc.append(
        _feature({"pcode": akoka_pcode, "name": "Akoka", "parent": "DEV07"}, akoka_geom)
    )

    # Stable order: fixture order
    order = {f"{sp}{i:02d}": n for sp, _, _, cs in STATES for i, n in enumerate(cs, start=1)}
    counties_fc.sort(key=lambda f: list(order.keys()).index(f["properties"]["pcode"]))

    if len(counties_fc) != 79:
        raise SystemExit(f"Expected 79 counties, got {len(counties_fc)}")
    if len(states_fc) != 10:
        raise SystemExit(f"Expected 10 states, got {len(states_fc)}")

    OUT.mkdir(parents=True, exist_ok=True)
    for name, feats in (("states", states_fc), ("counties", counties_fc)):
        (OUT / f"{name}.geojson").write_text(
            json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False),
            encoding="utf-8",
        )

    meta = {
        "synthetic": False,
        "source": (
            "geoBoundaries gbOpen SSD ADM1+ADM2 (OCHA-aligned); "
            "Akoka carved from Melut to preserve the app's 79-county roster. "
            "Layout matches CSRF 10-states view (https://csrf-southsudan.org/county-profile-maps/)."
        ),
        "attribution": "Boundaries: geoBoundaries / OCHA. Reference layout: CSRF South Sudan.",
        "license": "CC BY 4.0 (geoBoundaries gbOpen)",
        "built_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    (OUT / "meta.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(states_fc)} states, {len(counties_fc)} counties to {OUT}")
    for sp, sn, _, cs in STATES:
        print(f"  {sp} {sn}: {len(cs)}")


if __name__ == "__main__":
    main()
