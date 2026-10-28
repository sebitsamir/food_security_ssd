
import csv
from pathlib import Path

from app.core.errors import ProblemError
from app.core.config import Settings
from app.schemas.competition import (
    CompetitionPrediction,
    CompetitionPredictionsResponse,
)

DATASET = "IndabaX South Sudan 2026 competition test predictions"
MODEL_VERSION = "competition-run-2026-10-28"


def list_competition_predictions(
    settings: Settings, period: str | None = None
) -> CompetitionPredictionsResponse:
    path = Path(settings.models_dir) / MODEL_VERSION / "official_test_predictions.csv"

    if not path.is_file():
        raise ProblemError(
            503,
            "Competition results unavailable",
            "The competition prediction CSV is not installed on this API instance.",
        )

    items: list[CompetitionPrediction] = []

    try:
        with path.open(newline="", encoding="utf-8-sig") as file:
            reader = csv.DictReader(file)
            required = {
                "ID",
                "state",
                "county",
                "start_year",
                "start_month",
                "risk_probability",
                "sensitivity_probability",
                "model_spread",
            }
            if not required.issubset(reader.fieldnames or []):
                raise ValueError("Prediction CSV is missing required columns.")

            for row in reader:
                row_period = f"{int(row['start_year']):04d}-{int(row['start_month']):02d}"
                if period is not None and row_period != period:
                    continue

                items.append(
                    CompetitionPrediction(
                        id=row["ID"],
                        state=row["state"],
                        county=row["county"],
                        period=row_period,
                        risk_probability=float(row["risk_probability"]),
                        sensitivity_probability=float(row["sensitivity_probability"]),
                        model_spread=float(row["model_spread"]),
                    )
                )
    except (OSError, ValueError, KeyError) as exc:
        raise ProblemError(
            503,
            "Competition results unavailable",
            "The competition prediction CSV could not be read or validated.",
        ) from exc

    if period is not None and not items:
        raise ProblemError(
            404,
            "Competition period not found",
            f"No competition predictions are available for {period}.",
        )

    periods = sorted({item.period for item in items}, reverse=True)

    return CompetitionPredictionsResponse(
        dataset=DATASET,
        model_version=MODEL_VERSION,
        historical_only=True,
        periods=periods,
        total=len(items),
        items=items,
    )
