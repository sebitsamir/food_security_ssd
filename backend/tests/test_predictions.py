from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.db.models import Prediction
from tests.conftest import make_ml_app

BASE = {
    "county_pcode": "DEV0301", "start_year": 2025, "start_month": 4, "population": 300_000,
    "previous_ipc_phase": 3, "phase3plus_pct": 55, "cereal_production_t": 12_000,
    "cereal_gap_t": -20_000,
}  # fmt: skip


def post(c: TestClient, **over: object):  # type: ignore[no-untyped-def]
    return c.post("/api/v1/predictions", json={**BASE, **over})


def test_prediction_shape(ml_client: TestClient) -> None:
    r = post(ml_client)
    assert r.status_code == 200, r.text
    body = r.json()
    assert 0 <= body["risk_probability"] <= 1 and 0 <= body["sensitivity_probability"] <= 1
    assert body["model_spread"] == pytest.approx(
        abs(body["risk_probability"] - body["sensitivity_probability"]), abs=1e-9
    )
    assert body["risk_band"] in {"lower", "moderate", "elevated", "high"}
    assert body["county"] == {"pcode": "DEV0301", "name": "Akobo", "state_pcode": "DEV03",
                              "state_name": "Jonglei"}  # fmt: skip
    assert len(body["prediction_id"]) == 36


def test_more_severe_inputs_raise_the_probability(ml_client: TestClient) -> None:
    low = post(ml_client, phase3plus_pct=10, previous_ipc_phase=1).json()["risk_probability"]
    high = post(ml_client, phase3plus_pct=90, previous_ipc_phase=5).json()["risk_probability"]
    assert high > low + 0.2


def test_prediction_is_deterministic(ml_client: TestClient) -> None:
    a, b = post(ml_client).json(), post(ml_client).json()
    assert a["risk_probability"] == b["risk_probability"]


@pytest.mark.parametrize("over", [
    {"previous_ipc_phase": 6}, {"previous_ipc_phase": 0}, {"start_month": 13},
    {"phase3plus_pct": 101}, {"phase3plus_pct": -1}, {"population": 0},
    {"cereal_production_t": -5}, {"county_pcode": "bad code!"}, {"start_year": 1800},
    {"population": "lots"},
])  # fmt: skip
def test_invalid_inputs_are_422(ml_client: TestClient, over: dict[str, object]) -> None:
    r = post(ml_client, **over)
    assert r.status_code == 422
    assert r.headers["content-type"].startswith("application/problem+json")
    assert r.json()["errors"]


def test_negative_cereal_gap_is_valid(ml_client: TestClient) -> None:
    assert post(ml_client, cereal_gap_t=-500_000).status_code == 200


def test_unknown_county_is_404(ml_client: TestClient) -> None:
    assert post(ml_client, county_pcode="NOPE").status_code == 404


def test_state_pcode_is_not_a_county(ml_client: TestClient) -> None:
    assert post(ml_client, county_pcode="DEV03").status_code == 404


def test_warnings_for_out_of_range_inputs(ml_client: TestClient) -> None:
    codes = {w["code"] for w in post(ml_client, population=900, start_year=1995,
                                      phase3plus_pct=10, previous_ipc_phase=5).json()["warnings"]}  # fmt: skip
    assert {"OUT_OF_RANGE_POPULATION", "OUT_OF_RANGE_YEAR", "DISTRIBUTION_SHIFT"} <= codes


def test_no_warnings_for_typical_input(ml_client: TestClient) -> None:
    codes = {w["code"] for w in post(ml_client).json()["warnings"]}
    assert not codes - {"MODEL_SENSITIVITY"}


def test_prediction_is_audited(ml_client: TestClient) -> None:
    pid = post(ml_client).json()["prediction_id"]
    with ml_client.app.state.session_factory() as s:  # type: ignore[attr-defined]
        row = s.get(Prediction, pid)
        assert row is not None and row.county_pcode == "DEV0301" and "55" in row.inputs
        assert s.scalar(select(func.count()).select_from(Prediction)) == 1


def test_audit_can_be_disabled(models_dir: Path) -> None:
    from fastapi.testclient import TestClient as TC

    with TC(make_ml_app(models_dir, persist_predictions=False)) as c:
        assert post(c).status_code == 200
        with c.app.state.session_factory() as s:  # type: ignore[attr-defined]
            assert s.scalar(select(func.count()).select_from(Prediction)) == 0


def test_rate_limit_returns_429_with_retry_after(models_dir: Path) -> None:
    with TestClient(make_ml_app(models_dir, prediction_rate_limit=3)) as c:
        assert [post(c).status_code for _ in range(3)] == [200, 200, 200]
        r = post(c)
        assert r.status_code == 429
        assert int(r.headers["retry-after"]) >= 1
        assert r.json()["title"] == "Too many requests"


def test_503_when_no_model_is_loaded(client: TestClient) -> None:
    r = client.post("/api/v1/predictions", json=BASE)
    assert r.status_code == 503 and r.json()["title"] == "No model loaded"
