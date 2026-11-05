"""Small, additive schema upgrades for existing single-server installations."""
from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def upgrade_subject_folders(engine: Engine) -> None:
    # Run after create_all so the referenced subject_folders table exists.
    if "folder_id" not in {column["name"] for column in inspect(engine).get_columns("documents")}:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE documents ADD COLUMN folder_id INTEGER REFERENCES subject_folders(id) ON DELETE SET NULL"))
            connection.execute(text("CREATE INDEX ix_documents_folder_id ON documents (folder_id)"))
