from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine

from app.core.config import get_settings
from app.db import models  # noqa: F401  (registers tables)
from app.db.base import Base

config = context.config
if config.config_file_name:
    fileConfig(config.config_file_name)

url = config.get_main_option("sqlalchemy.url") or get_settings().database_url
target_metadata = Base.metadata


def run_migrations_online() -> None:
    engine = create_engine(url)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata,
                          compare_type=True, render_as_batch=url.startswith("sqlite"))
        with context.begin_transaction():
            context.run_migrations()


run_migrations_online()
