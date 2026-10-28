from app.ml.features import FEATURES, build_frame


def test_ipc_integer_is_mapped_back_to_official_category_name() -> None:
    frame = build_frame(
        [
            {
                "state": "Jonglei",
                "county": "Akobo",
                "population": 300_000,
                "year": 2025,
                "month": 4,
                "phase": 3,
                "pct": 55,
                "production": 12_000,
                "gap": -20_000,
            }
        ]
    )
    assert list(frame.columns) == FEATURES
    assert frame.loc[0, "prior_period_ipc_phase"] == "Crisis"
    assert frame.loc[0, "prior_ipc_severity"] == 3.0


def test_all_ipc_categories_preserve_training_labels() -> None:
    phases = [
        (1, "Minimal"),
        (2, "Stressed"),
        (3, "Crisis"),
        (4, "Emergency"),
        (5, "Catastrophe"),
    ]
    frame = build_frame(
        [
            {
                "state": "Test State",
                "county": f"County {phase}",
                "population": 100_000,
                "year": 2025,
                "month": 4,
                "phase": phase,
                "pct": 50,
                "production": 1_000,
                "gap": -500,
            }
            for phase, _ in phases
        ]
    )
    assert frame["prior_period_ipc_phase"].tolist() == [name for _, name in phases]
    assert frame["prior_ipc_severity"].tolist() == [float(n) for n, _ in phases]
