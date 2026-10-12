"""Loads and strictly validates boundary files at startup.

A bad boundary file should stop the deploy, not render a broken map for users.
"""

import hashlib
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

# Loose sanity box around South Sudan (lon_min, lat_min, lon_max, lat_max).
BBOX = (23.0, 3.0, 36.6, 13.0)
Level = Literal["states", "counties"]


class GeoMeta(BaseModel):
    synthetic: bool
    source: str
    attribution: str
    license: str
    built_at: str | None = None


class _Props(BaseModel):
    model_config = ConfigDict(extra="allow")
    pcode: str = Field(min_length=1, max_length=16, pattern=r"^[A-Za-z0-9_-]+$")
    name: str = Field(min_length=1, max_length=120)
    parent: str | None = None


class _Geometry(BaseModel):
    type: Literal["Polygon", "MultiPolygon"]
    coordinates: list[object]


class _Feature(BaseModel):
    type: Literal["Feature"]
    properties: _Props
    geometry: _Geometry


class _Collection(BaseModel):
    model_config = ConfigDict(extra="allow")
    type: Literal["FeatureCollection"]
    features: list[_Feature] = Field(min_length=1)


class GeoError(RuntimeError):
    pass


@dataclass(frozen=True)
class GeoDocument:
    level: Level
    body: bytes
    etag: str
    pcodes: frozenset[str]
    parents: frozenset[str]


@dataclass(frozen=True)
class GeoStore:
    states: GeoDocument
    counties: GeoDocument
    meta: GeoMeta

    def get(self, level: Level) -> GeoDocument:
        return self.states if level == "states" else self.counties


def _check_ring(ring: object, where: str) -> None:
    if not isinstance(ring, list) or len(ring) < 4:
        raise GeoError(f"{where}: ring needs at least 4 positions")
    for pos in ring:
        if (
            not isinstance(pos, list)
            or len(pos) < 2
            or not all(isinstance(v, int | float) and math.isfinite(v) for v in pos[:2])
        ):
            raise GeoError(f"{where}: invalid position {pos!r}")
        lon, lat = pos[0], pos[1]
        if not (BBOX[0] <= lon <= BBOX[2] and BBOX[1] <= lat <= BBOX[3]):
            raise GeoError(
                f"{where}: ({lon}, {lat}) is outside South Sudan. "
                "Wrong projection? Output must be WGS84 lon/lat."
            )
    if ring[0][:2] != ring[-1][:2]:
        raise GeoError(f"{where}: ring is not closed")


def _check_geometry(g: _Geometry, where: str) -> None:
    polys = [g.coordinates] if g.type == "Polygon" else g.coordinates
    if not polys:
        raise GeoError(f"{where}: empty geometry")
    for poly in polys:
        if not isinstance(poly, list) or not poly:
            raise GeoError(f"{where}: polygon has no rings")
        for ring in poly:
            _check_ring(ring, where)


def _signed_area(ring: list[list[float]]) -> float:
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:], strict=False)) / 2


def _rewind_rfc7946(geometry: dict[str, Any]) -> None:
    """RFC 7946: exterior rings counter-clockwise, holes clockwise.

    Source files arrive in either winding. Normalising here gives clients one contract.
    """
    polys = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
    for poly in polys:
        for i, ring in enumerate(poly):
            ccw = _signed_area(ring) > 0
            if ccw != (i == 0):
                ring.reverse()


def load_document(path: Path, level: Level) -> GeoDocument:
    raw = path.read_bytes().removeprefix(b"\xef\xbb\xbf")  # tolerate a UTF-8 BOM
    try:
        doc = _Collection.model_validate_json(raw)
    except ValidationError as exc:
        raise GeoError(f"{path.name}: not a valid FeatureCollection: {exc.errors()[0]}") from exc

    seen: set[str] = set()
    for f in doc.features:
        code = f.properties.pcode
        if code in seen:
            raise GeoError(f"{path.name}: duplicate pcode {code}")
        seen.add(code)
        _check_geometry(f.geometry, f"{path.name}:{code}")
        if level == "counties" and not f.properties.parent:
            raise GeoError(f"{path.name}: county {code} has no parent state")

    # Re-serialise compactly so every instance serves identical bytes (stable ETag).
    data = json.loads(raw)
    for feature in data["features"]:
        _rewind_rfc7946(feature["geometry"])
    body = json.dumps(data, separators=(",", ":"), ensure_ascii=False).encode()
    return GeoDocument(
        level=level,
        body=body,
        etag=hashlib.sha256(body).hexdigest()[:32],
        pcodes=frozenset(seen),
        parents=frozenset(f.properties.parent for f in doc.features if f.properties.parent),
    )


def load_store(geo_dir: Path, *, allow_synthetic: bool) -> GeoStore:
    try:
        meta = GeoMeta.model_validate_json(
            (geo_dir / "meta.json").read_bytes().removeprefix(b"\xef\xbb\xbf")
        )
    except (OSError, ValidationError) as exc:
        raise GeoError(f"meta.json missing or invalid in {geo_dir}: {exc}") from exc
    if meta.synthetic and not allow_synthetic:
        raise GeoError(
            "Refusing to start: boundary data is synthetic placeholder data. "
            "Build real boundaries with scripts/build_geo.sh."
        )

    states = load_document(geo_dir / "states.geojson", "states")
    counties = load_document(geo_dir / "counties.geojson", "counties")
    orphans = counties.parents - states.pcodes
    if orphans:
        raise GeoError(f"counties reference unknown states: {sorted(orphans)}")
    return GeoStore(states=states, counties=counties, meta=meta)
