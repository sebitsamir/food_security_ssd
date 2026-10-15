from fastapi.testclient import TestClient


def test_states_geojson(client: TestClient) -> None:
    r = client.get("/api/v1/geo/states")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/geo+json")
    assert len(r.json()["features"]) == 2
    assert "max-age" in r.headers["cache-control"]


def test_etag_gives_304(client: TestClient) -> None:
    etag = client.get("/api/v1/geo/counties").headers["etag"]
    again = client.get("/api/v1/geo/counties", headers={"If-None-Match": etag})
    assert again.status_code == 304
    assert again.content == b""
    assert again.headers["etag"] == etag


def test_weak_and_listed_etags_match(client: TestClient) -> None:
    etag = client.get("/api/v1/geo/states").headers["etag"]
    r = client.get("/api/v1/geo/states", headers={"If-None-Match": f'"nope", W/{etag}'})
    assert r.status_code == 304


def test_stale_etag_returns_body(client: TestClient) -> None:
    r = client.get("/api/v1/geo/states", headers={"If-None-Match": '"old"'})
    assert r.status_code == 200 and r.content


def test_unknown_level_is_422_problem(client: TestClient) -> None:
    r = client.get("/api/v1/geo/regions")
    assert r.status_code == 422
    assert r.headers["content-type"].startswith("application/problem+json")


def test_meta(client: TestClient) -> None:
    body = client.get("/api/v1/geo/meta").json()
    assert body["synthetic"] is True and body["attribution"]
