from datetime import date, timedelta
import time


def test_signup_login_and_profile(client, auth_headers):
    me = client.get("/api/auth/me", headers=auth_headers)
    assert me.status_code == 200
    assert me.json()["email"] == "ada@example.com"
    assert "password" not in me.json()

    login = client.post("/api/auth/login", json={"email": "ada@example.com", "password": "correct-horse"})
    assert login.status_code == 200
    assert login.json()["token"]
    bad_login = client.post("/api/auth/login", json={"email": "ada@example.com", "password": "wrong-password"})
    assert bad_login.status_code == 401


def test_notes_crud_and_privacy(client, auth_headers):
    created = client.post("/api/notes", headers=auth_headers, json={"title": "Biology", "content": "Cells"})
    assert created.status_code == 201
    note_id = created.json()["id"]
    updated = client.patch(f"/api/notes/{note_id}", headers=auth_headers, json={"is_favorite": True})
    assert updated.json()["is_favorite"] is True
    assert client.get("/api/notes?q=cells", headers=auth_headers).json()[0]["title"] == "Biology"

    other = client.post(
        "/api/auth/signup", json={"name": "Grace", "email": "grace@example.com", "password": "another-pass"}
    ).json()
    other_headers = {"Authorization": f"Bearer {other['token']}"}
    assert client.patch(f"/api/notes/{note_id}", headers=other_headers, json={"title": "Stolen"}).status_code == 404
    assert client.delete(f"/api/notes/{note_id}", headers=auth_headers).status_code == 204


def test_document_index_and_grounded_chat(client, auth_headers):
    content = """# Photosynthesis
Photosynthesis converts light energy into chemical energy in chloroplasts.
Chlorophyll absorbs red and blue light. The Calvin cycle produces sugar.
"""
    upload = client.post(
        "/api/documents",
        headers=auth_headers,
        files={"file": ("biology.md", content, "text/markdown")},
    )
    assert upload.status_code == 201
    document = upload.json()
    for _ in range(30):
        document = client.get(f"/api/documents/{document['id']}", headers=auth_headers).json()
        if document["status"] == "ready":
            break
        assert document["status"] != "error"
        time.sleep(0.05)
    assert document["status"] == "ready"
    assert document["page_count"] == 1

    text = client.get(f"/api/documents/{document['id']}/content", headers=auth_headers)
    assert "chloroplasts" in text.json()["text"]
    chat = client.post(
        "/api/ai/chat",
        headers=auth_headers,
        json={"message": "Where does photosynthesis happen?", "document_ids": [document["id"]]},
    )
    assert chat.status_code == 200
    assert chat.json()["sources"][0]["document_name"] == "biology.md"
    messages = client.get(
        f"/api/ai/conversations/{chat.json()['conversation_id']}/messages", headers=auth_headers
    ).json()
    assert [message["role"] for message in messages] == ["user", "assistant"]


def test_schedule_generation_and_completion(client, auth_headers):
    client.post(
        "/api/documents",
        headers=auth_headers,
        files={"file": ("algebra.txt", "# Linear equations\nSolving equations with one variable.", "text/plain")},
    )
    start = date.today()
    response = client.post(
        "/api/schedule/generate",
        headers=auth_headers,
        json={
            "start_date": str(start),
            "end_date": str(start + timedelta(days=2)),
            "minutes_per_day": 60,
            "session_length": 25,
            "preferred_start": "17:30",
            "selected_days": [0, 1, 2, 3, 4, 5, 6],
        },
    )
    assert response.status_code == 201
    sessions = response.json()
    assert len(sessions) == 6
    assert sessions[0]["start_minutes"] == 1050
    assert {session["topic"] for session in sessions} >= {"study", "review"}

    completed = client.patch(f"/api/schedule/{sessions[0]['id']}", headers=auth_headers, json={"completed": True})
    assert completed.json()["completed_at"] is not None
    dashboard = client.get("/api/dashboard", headers=auth_headers)
    assert dashboard.status_code == 200
    assert dashboard.json()["stats"]["documents"] == 1


def test_upload_validation_and_auth(client, auth_headers):
    assert client.get("/api/documents").status_code == 401
    unsupported = client.post(
        "/api/documents", headers=auth_headers, files={"file": ("script.exe", b"not allowed", "application/octet-stream")}
    )
    assert unsupported.status_code == 415
    empty = client.post("/api/documents", headers=auth_headers, files={"file": ("empty.txt", b"", "text/plain")})
    assert empty.status_code == 400


def test_private_resources_cannot_be_read_by_another_account(client, auth_headers):
    uploaded = client.post('/api/documents', headers=auth_headers,
                           files={'file': ('private.txt', 'Private biology notes about cells.', 'text/plain')}).json()
    chat = client.post('/api/ai/chat', headers=auth_headers,
                       json={'message': 'Explain cells', 'document_ids': [uploaded['id']]}).json()
    other = client.post('/api/auth/signup', json={
        'name': 'Other', 'email': 'other@example.com', 'password': 'another-pass'
    }).json()
    headers = {'Authorization': f"Bearer {other['token']}"}
    for suffix in ['', '/content', '/file']:
        assert client.get(f"/api/documents/{uploaded['id']}{suffix}", headers=headers).status_code == 404
    assert client.get(f"/api/ai/conversations/{chat['conversation_id']}/messages", headers=headers).status_code == 404
    assert client.post('/api/ai/chat', headers=headers,
                       json={'message': 'Explain cells', 'document_ids': [uploaded['id']]}).status_code == 400


def test_malformed_ai_schedule_falls_back(client, auth_headers, monkeypatch):
    async def malformed(*args):
        return [None, 'invalid session']
    monkeypatch.setattr('app.routers.schedule.generate_ai_schedule', malformed)
    response = client.post('/api/schedule/generate', headers=auth_headers, json={
        'start_date': str(date.today()), 'end_date': str(date.today()),
        'minutes_per_day': 60, 'session_length': 25,
    })
    assert response.status_code == 201
    assert len(response.json()) == 2


def test_signup_can_be_disabled(client, monkeypatch):
    from app.config import get_settings
    monkeypatch.setattr(get_settings(), 'allow_signup', False)
    response = client.post('/api/auth/signup', json={
        'name': 'Other', 'email': 'closed@example.com', 'password': 'another-pass'
    })
    assert response.status_code == 403
