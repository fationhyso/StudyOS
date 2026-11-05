import os
import tempfile

TEST_DATA = tempfile.mkdtemp(prefix="studyos-tests-")
os.environ["DATA_DIR"] = TEST_DATA
os.environ["OPENAI_API_KEY"] = ""
os.environ["DEEPSEEK_API_KEY"] = ""
os.environ["AI_PROVIDER"] = "openai"

import pytest
from fastapi.testclient import TestClient

from app.database import Base, engine
from app.main import app


@pytest.fixture()
def client():
    from app.rate_limit import _attempts
    _attempts.clear()
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def auth_headers(client):
    response = client.post(
        "/api/auth/signup",
        json={"name": "Ada Lovelace", "email": "ada@example.com", "password": "correct-horse"},
    )
    assert response.status_code == 201
    return {"Authorization": f"Bearer {response.json()['token']}"}
