from fastapi.testclient import TestClient

from app.main import create_app
from tests.conftest import make_settings


def test_health_and_ready(client: TestClient) -> None:
    assert client.get("/healthz").json() == {"status": "ok"}
    ready = client.get("/readyz").json()
    assert ready["status"] == "ready" and ready["counties"] == 4


def test_ready_fails_when_database_is_down() -> None:
    app = create_app(make_settings(database_url="sqlite:////nonexistent-dir/x.db"))
    with TestClient(app) as c:
        r = c.get("/readyz")
    assert r.status_code == 503
    assert r.json()["title"] == "Database unavailable"


def test_security_headers_and_request_id(client: TestClient) -> None:
    r = client.get("/healthz")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert len(r.headers["x-request-id"]) >= 8


def test_request_id_is_echoed_when_safe_and_replaced_when_not(client: TestClient) -> None:
    assert (
        client.get("/healthz", headers={"X-Request-ID": "abc-12345678"}).headers["x-request-id"]
        == "abc-12345678"
    )
    bad = client.get("/healthz", headers={"X-Request-ID": "bad id\r\n"})
    assert bad.headers["x-request-id"] != "bad id"


def test_unknown_route_is_problem_json(client: TestClient) -> None:
    r = client.get("/nope")
    assert r.status_code == 404 and r.headers["content-type"].startswith("application/problem+json")


def test_cors_allows_only_configured_origin(client: TestClient) -> None:
    ok = client.get("/healthz", headers={"Origin": "http://localhost:3000"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:3000"
    bad = client.get("/healthz", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in bad.headers


def test_docs_hidden_in_production(tmp_path) -> None:  # type: ignore[no-untyped-def]
    import shutil

    from tests.conftest import FIXTURES

    d = tmp_path / "geo"
    shutil.copytree(FIXTURES, d)
    (d / "meta.json").write_text('{"synthetic":false,"source":"s","attribution":"a","license":"l"}')
    # Docs flags are set at construction; lifespan (model required in prod) is not needed here.
    app = create_app(make_settings(env="production", geo_dir=d))
    assert app.docs_url is None
    assert app.openapi_url is None


def test_ready_fails_when_schema_is_not_migrated() -> None:
    app = create_app(make_settings())  # reachable, but no tables created
    with TestClient(app) as c:
        r = c.get("/readyz")
    assert r.status_code == 503
    assert "not migrated" in r.json()["title"]
