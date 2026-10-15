from fastapi.testclient import TestClient


def test_county_list_is_ranked_and_complete(ml_client: TestClient) -> None:
    body = ml_client.get("/api/v1/counties").json()
    items = body["items"]
    assert body["period"] == "2026-04" and len(items) == 79
    assert [i["rank"] for i in items] == list(range(1, 80))
    probs = [i["probability"] for i in items]
    assert probs == sorted(probs, reverse=True)
    assert {i["band"] for i in items} <= {"lower", "moderate", "elevated", "high"}
    assert all(i["facts"] for i in items)


def test_period_parameter(ml_client: TestClient) -> None:
    assert ml_client.get("/api/v1/counties?period=2025-10").json()["period"] == "2025-10"
    assert ml_client.get("/api/v1/counties?period=2031-01").status_code == 404
    assert ml_client.get("/api/v1/counties?period=nope").status_code == 422


def test_county_detail(ml_client: TestClient) -> None:
    d = ml_client.get("/api/v1/counties/DEV0301").json()
    assert d["name"] == "Akobo" and d["state_name"] == "Jonglei"
    assert 1 <= d["state_rank"] <= d["state_county_count"] == 11
    periods = [h["period"] for h in d["history"]]
    assert periods == sorted(periods) and len(periods) == 10 and periods[-1] == "2026-04"
    assert d["facts"]["phase3plus_pct"] == d["history"][-1]["phase3plus_pct"]


def test_county_detail_errors(ml_client: TestClient) -> None:
    assert ml_client.get("/api/v1/counties/NOPE").status_code == 404
    assert ml_client.get("/api/v1/counties/bad%20code").status_code == 422


def test_state_aggregate_matches_county_mean(ml_client: TestClient) -> None:
    counties = ml_client.get("/api/v1/counties").json()["items"]
    states = {
        s["pcode"]: s
        for s in ml_client.get("/api/v1/forecasts/states?period=2026-04").json()["items"]
    }
    mine = [c["probability"] for c in counties if c["state_pcode"] == "DEV03"]
    assert states["DEV03"]["probability"] == sum(mine) / len(mine)


def test_model_info(ml_client: TestClient) -> None:
    m = ml_client.get("/api/v1/model").json()
    assert m["version"] == "1.0.0-dev" and m["synthetic"] is True
    assert m["algorithm"] == "LogisticRegression" and m["parameters"]["C"] == 1.0
    assert len(m["folds"]) == 9
    assert m["training_periods"] == 12 and m["training_counties"] == 79
    prod = m["production"]
    assert (
        prod["min"] <= prod["mean"] <= prod["max"] and prod["latest"] == m["folds"][-1]["roc_auc"]
    )


def test_model_503_without_model(client: TestClient) -> None:
    assert client.get("/api/v1/model").status_code == 503


def test_readyz_reports_model(ml_client: TestClient) -> None:
    assert ml_client.get("/readyz").json()["model_loaded"] is True
