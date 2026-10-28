
import csv
from pathlib import Path

from fastapi.testclient import TestClient

from app.services.competition import MODEL_VERSION


CSV_COLUMNS = [
    "ID",
    "state",
    "county",
    "start_year",
    "start_month",
    "risk_probability",
    "sensitivity_probability",
    "model_spread",
]


def write_predictions_csv(models_dir: Path) -> Path:
    """Create a representative competition prediction artifact."""
    output_dir = models_dir / MODEL_VERSION
    output_dir.mkdir(parents=True, exist_ok=True)
    csv_path = output_dir / "official_test_predictions.csv"

    periods = [
        (2025, 9),
        (2025, 12),
        (2026, 4),
    ]

    with csv_path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=CSV_COLUMNS)
        writer.writeheader()

        row_number = 0
        for year, month in periods:
            for county_number in range(78):
                row_number += 1
                writer.writerow(
                    {
                        "ID": f"TEST_{row_number:03d}",
                        "state": "Central Equatoria",
                        "county": f"County {county_number + 1}",
                        "start_year": year,
                        "start_month": month,
                        "risk_probability": 0.80,
                        "sensitivity_probability": 0.82,
                        "model_spread": 0.02,
                    }
                )

    return csv_path


def test_competition_predictions_returns_all_periods(
    client: TestClient,
) -> None:
    settings = client.app.state.settings
    write_predictions_csv(Path(settings.models_dir))

    response = client.get("/api/v1/competition/predictions")

    assert response.status_code == 200
    data = response.json()

    assert data["total"] == 234
    assert data["periods"] == ["2026-04", "2025-12", "2025-09"]
    assert data["historical_only"] is True
    assert len(data["items"]) == 234


def test_competition_predictions_filters_by_period(
    client: TestClient,
) -> None:
    settings = client.app.state.settings
    write_predictions_csv(Path(settings.models_dir))

    response = client.get(
        "/api/v1/competition/predictions",
        params={"period": "2026-04"},
    )

    assert response.status_code == 200
    data = response.json()

    assert data["total"] == 78
    assert data["periods"] == ["2026-04"]
    assert all(item["period"] == "2026-04" for item in data["items"])


def test_competition_predictions_returns_404_for_missing_period(
    client: TestClient,
) -> None:
    settings = client.app.state.settings
    write_predictions_csv(Path(settings.models_dir))

    response = client.get(
        "/api/v1/competition/predictions",
        params={"period": "2026-01"},
    )

    assert response.status_code == 404


def test_competition_predictions_returns_503_without_csv(
    client: TestClient,
) -> None:
    response = client.get("/api/v1/competition/predictions")

    assert response.status_code == 503
