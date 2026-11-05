"""Small, additive schema upgrades for existing single-server installations."""
from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def upgrade_subject_folders(engine: Engine) -> None:
    # Run after create_all so the referenced subject_folders table exists.
    if "folder_id" not in {column["name"] for column in inspect(engine).get_columns("documents")}:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE documents ADD COLUMN folder_id INTEGER REFERENCES subject_folders(id) ON DELETE SET NULL"))
            connection.execute(text("CREATE INDEX ix_documents_folder_id ON documents (folder_id)"))

    if "parent_id" not in {column["name"] for column in inspect(engine).get_columns("subject_folders")}:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE subject_folders ADD COLUMN parent_id INTEGER REFERENCES subject_folders(id) ON DELETE SET NULL"))
            connection.execute(text("CREATE INDEX ix_subject_folders_parent_id ON subject_folders (parent_id)"))


def upgrade_ai_notes(engine: Engine) -> None:
    if "source_message_id" not in {column["name"] for column in inspect(engine).get_columns("notes")}:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE notes ADD COLUMN source_message_id INTEGER REFERENCES chat_messages(id) ON DELETE SET NULL"))
            connection.execute(text("CREATE UNIQUE INDEX ix_notes_source_message_id ON notes (source_message_id)"))


def upgrade_tutor_sessions(engine: Engine) -> None:
    if "source_message_id" not in {column["name"] for column in inspect(engine).get_columns("study_sessions")}:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE study_sessions ADD COLUMN source_message_id INTEGER REFERENCES chat_messages(id) ON DELETE SET NULL"))
            connection.execute(text("CREATE UNIQUE INDEX ix_sessions_source_message_id ON study_sessions (source_message_id)"))
