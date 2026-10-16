"""One-shot production database bootstrap (migrations + geographies).

Does NOT train or seed synthetic data. After this, place your model and run:

    python -m scripts.activate_model <version>
    python -m scripts.import_observations path/to/observations.csv
    python -m scripts.score_forecasts YYYY-MM

Requires ENV=production and a PostgreSQL DATABASE_URL.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from app.core.config import get_settings


def main() -> None:
    settings = get_settings()
    if not settings.is_production:
        sys.exit("Refusing: set ENV=production before bootstrapping for production.")
    backend = Path(__file__).resolve().parents[1]
    steps = [
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        [sys.executable, "-m", "scripts.load_geographies"],
    ]
    for cmd in steps:
        print("==>", " ".join(cmd), flush=True)
        subprocess.run(cmd, cwd=backend, check=True)
    print(
        "Done. Next:\n"
        "  1. Put model files in MODELS_DIR/<version>/\n"
        "  2. python -m scripts.activate_model <version>\n"
        "  3. python -m scripts.import_observations <observations.csv>\n"
        "  4. python -m scripts.score_forecasts YYYY-MM\n"
        "  5. Restart the API"
    )


if __name__ == "__main__":
    main()
