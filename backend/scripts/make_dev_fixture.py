"""Generates SYNTHETIC placeholder boundaries so the app runs end to end in development.

These shapes are NOT real. The API refuses to start with them when ENV=production.
Replace them with real data using scripts/build_geo.sh at the repo root.
"""

import json
import random
from pathlib import Path

from shapely.geometry import MultiPoint, Point, Polygon, mapping
from shapely.ops import voronoi_diagram

OUT = Path(__file__).resolve().parents[1] / "data" / "geo"

OUTLINE = [
    (24.2, 8.7),
    (24.6, 9.6),
    (26.0, 9.6),
    (27.0, 9.7),
    (28.0, 9.5),
    (29.0, 9.6),
    (30.0, 9.8),
    (31.1, 9.9),
    (32.0, 10.5),
    (32.5, 11.6),
    (33.2, 12.2),
    (33.6, 11.4),
    (34.0, 10.7),
    (34.3, 10.2),
    (34.1, 9.5),
    (34.0, 8.4),
    (33.9, 7.8),
    (34.5, 6.8),
    (35.3, 5.5),
    (35.9, 4.6),
    (34.4, 4.6),
    (34.0, 4.2),
    (33.0, 3.8),
    (32.2, 3.6),
    (31.5, 3.7),
    (30.9, 3.6),
    (30.0, 4.2),
    (29.5, 4.5),
    (28.4, 4.3),
    (27.4, 5.0),
    (26.2, 6.1),
    (25.2, 7.6),
    (24.4, 8.2),
]

# (pcode, name, site lon/lat, counties)
STATES = [
    (
        "DEV01",
        "Central Equatoria",
        (31.0, 4.8),
        ["Juba", "Kajo-Keji", "Lainya", "Morobo", "Terekeka", "Yei"],
    ),
    (
        "DEV02",
        "Eastern Equatoria",
        (33.4, 4.7),
        [
            "Budi",
            "Ikotos",
            "Kapoeta East",
            "Kapoeta North",
            "Kapoeta South",
            "Lopa/Lafon",
            "Magwi",
            "Torit",
        ],
    ),
    (
        "DEV03",
        "Jonglei",
        (32.0, 7.1),
        [
            "Akobo",
            "Ayod",
            "Bor South",
            "Duk",
            "Fangak",
            "Nyirol",
            "Pigi/Canal",
            "Twic East",
            "Uror",
            "Pibor",
            "Pochalla",
        ],
    ),
    (
        "DEV04",
        "Lakes",
        (29.9, 6.7),
        [
            "Awerial",
            "Cueibet",
            "Rumbek Centre",
            "Rumbek East",
            "Rumbek North",
            "Wulu",
            "Yirol East",
            "Yirol West",
        ],
    ),
    (
        "DEV05",
        "Northern Bahr el Ghazal",
        (27.4, 9.0),
        ["Aweil Centre", "Aweil East", "Aweil North", "Aweil South", "Aweil West"],
    ),
    (
        "DEV06",
        "Unity",
        (29.9, 9.1),
        [
            "Abiemnhom",
            "Guit",
            "Koch",
            "Leer",
            "Mayendit",
            "Mayom",
            "Panyijiar",
            "Pariang",
            "Rubkona",
        ],
    ),
    (
        "DEV07",
        "Upper Nile",
        (32.8, 9.6),
        [
            "Akoka",
            "Baliet",
            "Fashoda",
            "Longochuk",
            "Maban",
            "Maiwut",
            "Malakal",
            "Manyo",
            "Melut",
            "Nasir",
            "Panyikang",
            "Renk",
            "Ulang",
        ],
    ),
    (
        "DEV08",
        "Warrap",
        (28.7, 8.0),
        ["Gogrial East", "Gogrial West", "Tonj East", "Tonj North", "Tonj South", "Twic"],
    ),
    ("DEV09", "Western Bahr el Ghazal", (25.6, 8.0), ["Jur River", "Raja", "Wau"]),
    (
        "DEV10",
        "Western Equatoria",
        (28.0, 4.9),
        [
            "Ezo",
            "Ibba",
            "Maridi",
            "Mundri East",
            "Mundri West",
            "Mvolo",
            "Nagero",
            "Nzara",
            "Tambura",
            "Yambio",
        ],
    ),
]


def cells(boundary: Polygon, sites: list[tuple[float, float]]) -> list[Polygon]:
    diagram = voronoi_diagram(MultiPoint(sites), envelope=boundary.buffer(5))
    out = []
    for site in sites:
        cell = next(c for c in diagram.geoms if c.contains(Point(site)))
        piece = cell.intersection(boundary)
        out.append(
            piece if piece.geom_type == "Polygon" else max(piece.geoms, key=lambda g: g.area)
        )
    return out


def feature(props: dict[str, str], poly: Polygon) -> dict[str, object]:
    geom = json.loads(json.dumps(mapping(poly.simplify(0.002))))
    geom["coordinates"] = [
        [[round(x, 3), round(y, 3)] for x, y in ring] for ring in geom["coordinates"]
    ]
    return {"type": "Feature", "properties": props, "geometry": geom}


def main() -> None:
    rnd = random.Random(7)
    country = Polygon(OUTLINE)
    state_cells = cells(country, [s[2] for s in STATES])
    states, counties = [], []
    for (code, name, _, names), cell in zip(STATES, state_cells, strict=True):
        states.append(feature({"pcode": code, "name": name}, cell))
        minx, miny, maxx, maxy = cell.bounds
        sites: list[tuple[float, float]] = []
        while len(sites) < len(names):
            p = (rnd.uniform(minx, maxx), rnd.uniform(miny, maxy))
            if cell.buffer(-0.05).contains(Point(p)):
                sites.append(p)
        for i, (cname, ccell) in enumerate(zip(names, cells(cell, sites), strict=True), start=1):
            counties.append(
                feature({"pcode": f"{code}{i:02d}", "name": cname, "parent": code}, ccell)
            )

    OUT.mkdir(parents=True, exist_ok=True)
    for name, feats in (("states", states), ("counties", counties)):
        (OUT / f"{name}.geojson").write_text(
            json.dumps({"type": "FeatureCollection", "features": feats}, separators=(",", ":")),
            encoding="utf-8",
        )
    (OUT / "meta.json").write_text(
        json.dumps(
            {
                "synthetic": True,
                "source": "Generated by scripts/make_dev_fixture.py",
                "attribution": "Placeholder boundaries for development. Not real geography.",
                "license": "n/a",
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"{len(states)} states, {len(counties)} counties written to {OUT}")


if __name__ == "__main__":
    main()
