import json
import shutil
from pathlib import Path

import pytest

from app.geo.loader import GeoError, load_store
from tests.conftest import FIXTURES


@pytest.fixture
def geo(tmp_path: Path) -> Path:
    d = tmp_path / "geo"
    shutil.copytree(FIXTURES, d)
    return d


def edit(path: Path, fn) -> None:  # type: ignore[no-untyped-def]
    data = json.loads(path.read_text())
    fn(data)
    path.write_text(json.dumps(data))


def test_valid_fixture_loads(geo: Path) -> None:
    s = load_store(geo, allow_synthetic=True)
    assert s.states.pcodes == {"T1", "T2"} and len(s.counties.pcodes) == 4
    assert len(s.states.etag) == 32


def test_etag_is_stable_across_loads(geo: Path) -> None:
    assert (
        load_store(geo, allow_synthetic=True).states.etag
        == load_store(geo, allow_synthetic=True).states.etag
    )


def test_synthetic_refused_in_production(geo: Path) -> None:
    with pytest.raises(GeoError, match="synthetic"):
        load_store(geo, allow_synthetic=False)


def test_duplicate_pcode_rejected(geo: Path) -> None:
    edit(geo / "states.geojson", lambda d: d["features"][1]["properties"].update(pcode="T1"))
    with pytest.raises(GeoError, match="duplicate"):
        load_store(geo, allow_synthetic=True)


def test_coordinates_outside_south_sudan_rejected(geo: Path) -> None:
    def move(d):  # type: ignore[no-untyped-def]
        d["features"][0]["geometry"]["coordinates"][0][0] = [500000, 400000]

    edit(geo / "states.geojson", move)
    with pytest.raises(GeoError, match="outside South Sudan"):
        load_store(geo, allow_synthetic=True)


def test_unclosed_ring_rejected(geo: Path) -> None:
    edit(
        geo / "states.geojson",
        lambda d: d["features"][0]["geometry"]["coordinates"][0].__setitem__(-1, [29.9, 6.9]),
    )
    with pytest.raises(GeoError, match="not closed"):
        load_store(geo, allow_synthetic=True)


def test_orphan_county_rejected(geo: Path) -> None:
    edit(geo / "counties.geojson", lambda d: d["features"][0]["properties"].update(parent="NOPE"))
    with pytest.raises(GeoError, match="unknown states"):
        load_store(geo, allow_synthetic=True)


def test_county_without_parent_rejected(geo: Path) -> None:
    edit(geo / "counties.geojson", lambda d: d["features"][0]["properties"].pop("parent"))
    with pytest.raises(GeoError, match="no parent"):
        load_store(geo, allow_synthetic=True)


def test_missing_meta_rejected(geo: Path) -> None:
    (geo / "meta.json").unlink()
    with pytest.raises(GeoError, match="meta.json"):
        load_store(geo, allow_synthetic=True)


def test_shipped_dev_fixture_is_valid() -> None:
    s = load_store(Path(__file__).parents[1] / "data" / "geo", allow_synthetic=True)
    assert len(s.states.pcodes) == 10 and len(s.counties.pcodes) == 79


def _first_ring(doc_body: bytes) -> list[list[float]]:
    return json.loads(doc_body)["features"][0]["geometry"]["coordinates"][0]


def test_winding_is_normalised_to_rfc7946(geo: Path) -> None:
    def clockwise(d):  # type: ignore[no-untyped-def]
        for f in d["features"]:
            f["geometry"]["coordinates"][0].reverse()

    edit(geo / "states.geojson", clockwise)
    ring = _first_ring(load_store(geo, allow_synthetic=True).states.body)
    area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:], strict=False)) / 2
    assert area > 0  # counter-clockwise exterior


def test_either_winding_serves_identical_bytes(geo: Path) -> None:
    before = load_store(geo, allow_synthetic=True).states
    edit(
        geo / "states.geojson",
        lambda d: [f["geometry"]["coordinates"][0].reverse() for f in d["features"]],
    )
    after = load_store(geo, allow_synthetic=True).states
    assert before.etag == after.etag


def test_files_saved_with_a_utf8_bom_still_load(geo: Path) -> None:
    """Windows editors and PowerShell often prepend a BOM."""
    for name in ("states.geojson", "counties.geojson", "meta.json"):
        p = geo / name
        p.write_bytes(b"\xef\xbb\xbf" + p.read_bytes())
    assert len(load_store(geo, allow_synthetic=True).counties.pcodes) == 4
