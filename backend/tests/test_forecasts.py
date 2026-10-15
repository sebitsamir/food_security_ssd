import pytest
from fastapi.testclient import TestClient
from sqlalchemy import update

from app.db.models import ModelVersion


def test_periods_latest_first(client: TestClient) -> None:
    body = client.get("/api/v1/forecasts/periods").json()
    assert body == {"latest": "2026-04", "periods": ["2026-04", "2025-10"]}


def test_county_values_use_active_model_only(client: TestClient) -> None:
    body = client.get("/api/v1/forecasts/counties?period=2026-04").json()
    values = {i["pcode"]: i["probability"] for i in body["items"]}
    assert values == {"T101": 0.2, "T102": 0.6, "T201": 0.8, "T202": 1.0}
    assert body["model_version"] == "1.0.0"


def test_state_value_is_mean_of_counties(client: TestClient) -> None:
    body = client.get("/api/v1/forecasts/states?period=2026-04").json()
    items = {i["pcode"]: i for i in body["items"]}
    assert items["T1"]["probability"] == pytest.approx(0.4)
    assert items["T2"]["probability"] == pytest.approx(0.9)
    assert items["T1"]["county_count"] == 2


def test_missing_period_is_404_problem(client: TestClient) -> None:
    r = client.get("/api/v1/forecasts/states?period=2031-01")
    assert r.status_code == 404
    assert r.headers["content-type"].startswith("application/problem+json")
    assert r.json()["title"] == "Period not found"


@pytest.mark.parametrize("bad", ["2026-13", "26-04", "2026-4", "", "'; DROP TABLE x;--"])
def test_bad_period_is_422(client: TestClient, bad: str) -> None:
    r = client.get("/api/v1/forecasts/counties", params={"period": bad})
    assert r.status_code == 422


def test_period_is_required(client: TestClient) -> None:
    assert client.get("/api/v1/forecasts/counties").status_code == 422


def test_no_active_model_is_503(client: TestClient) -> None:
    with client.app.state.session_factory() as s:  # type: ignore[attr-defined]
        s.execute(update(ModelVersion).values(is_active=False))
        s.commit()
    assert client.get("/api/v1/forecasts/periods").status_code == 503
