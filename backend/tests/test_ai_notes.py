import json
from sqlalchemy import create_engine, inspect, text
from app.migrations import upgrade_ai_notes


def study_material(client, headers):
    return client.post('/api/documents', headers=headers, files={
        'file': ('physics.md', '# Energy\nMass and energy are related by E = mc squared.', 'text/markdown')
    }).json()['id']


def test_tutor_creates_markdown_note_and_export(client, auth_headers, monkeypatch):
    document = study_material(client, auth_headers)
    async def generated(messages, json_mode=False):
        assert json_mode
        assert 'physics.md' in messages[-1]['content']
        return json.dumps({'title': 'Energy revision', 'content': '## Energy\n\nMass-energy equivalence is $E=mc^2$. [1]\n\n$$\nE=mc^2\n$$'})
    monkeypatch.setattr('app.services.study_notes.call_ai', generated)
    response = client.post('/api/ai/chat', headers=auth_headers, json={
        'message': 'Create energy notes', 'document_ids': [document], 'create_note': True
    })
    assert response.status_code == 200
    result = response.json()
    note = result['note']
    assert note['title'] == 'Energy revision'
    assert '$E=mc^2$' in note['content']
    assert f'/files/{document}' in note['content']
    assert client.get('/api/notes', headers=auth_headers).json()[0]['id'] == note['id']
    messages = client.get(f"/api/ai/conversations/{result['conversation_id']}/messages", headers=auth_headers).json()
    assert messages[-1]['note_id'] == note['id']
    assert messages[-1]['id'] == result['message_id']
    saved_again = client.post(f"/api/ai/messages/{result['message_id']}/note", headers=auth_headers)
    assert saved_again.json()['id'] == note['id']
    assert len(client.get('/api/notes', headers=auth_headers).json()) == 1
    exported = client.get(f"/api/notes/{note['id']}/file", headers=auth_headers)
    assert exported.status_code == 200
    assert exported.text == note['content']
    assert 'text/markdown' in exported.headers['content-type']
    assert '.md' in exported.headers['content-disposition']
    assert client.delete(f"/api/ai/conversations/{result['conversation_id']}", headers=auth_headers).status_code == 204
    assert client.get('/api/notes', headers=auth_headers).json()[0]['id'] == note['id']


def test_save_existing_answer_and_note_privacy(client, auth_headers):
    document = study_material(client, auth_headers)
    answer = client.post('/api/ai/chat', headers=auth_headers, json={'message': 'Explain energy', 'document_ids': [document]}).json()
    assert answer['note'] is None
    note = client.post(f"/api/ai/messages/{answer['message_id']}/note", headers=auth_headers).json()
    assert note['content'] and 'Sources' in note['content']
    user_message = client.get(f"/api/ai/conversations/{answer['conversation_id']}/messages", headers=auth_headers).json()[0]['id']
    assert client.post(f'/api/ai/messages/{user_message}/note', headers=auth_headers).status_code == 404
    other = client.post('/api/auth/signup', json={'name': 'Other', 'email': 'ai-notes-other@example.com', 'password': 'another-pass'}).json()
    headers = {'Authorization': f"Bearer {other['token']}"}
    assert client.post(f"/api/ai/messages/{answer['message_id']}/note", headers=headers).status_code == 404
    assert client.get(f"/api/notes/{note['id']}/file", headers=headers).status_code == 404
    assert client.get(f"/api/notes/{note['id']}/file").status_code == 401


def test_ai_note_requires_notes_permission(client, auth_headers):
    document = study_material(client, auth_headers)
    def agent(scopes):
        result = client.post('/api/integrations/keys', headers=auth_headers, json={'name': 'Note agent', 'scopes': scopes}).json()
        return {'Authorization': f"Bearer {result['token']}"}
    ai_only = agent(['ai'])
    body = {'message': 'Write energy notes', 'document_ids': [document], 'create_note': True}
    assert client.post('/api/ai/chat', headers=ai_only, json=body).status_code == 403
    response = client.post('/api/ai/chat', headers=agent(['ai', 'notes']), json=body)
    assert response.status_code == 200
    result = response.json()
    assert result['note'] is not None and result['mode'] == 'offline'
    assert 'Offline note' in result['note']['content']
    assert client.post(f"/api/ai/messages/{result['message_id']}/note", headers=ai_only).status_code == 403


def test_no_empty_ai_notes_when_no_material_or_provider(client, auth_headers):
    result = client.post('/api/ai/chat', headers=auth_headers, json={'message': 'Create notes', 'create_note': True})
    assert result.status_code == 409
    assert client.get('/api/notes', headers=auth_headers).json() == []


def test_ai_note_malformed_output_uses_cited_fallback(client, auth_headers, monkeypatch):
    study_material(client, auth_headers)
    async def invalid(*args, **kwargs):
        return '{"title": "Incomplete"}'
    monkeypatch.setattr('app.services.study_notes.call_ai', invalid)
    result = client.post('/api/ai/chat', headers=auth_headers, json={'message': 'Energy notes', 'create_note': True}).json()
    assert result['mode'] == 'offline'
    assert '[1]' in result['note']['content']


def test_existing_notes_upgrade_is_additive(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'legacy-notes.db'}")
    with engine.begin() as connection:
        connection.execute(text('CREATE TABLE chat_messages (id INTEGER PRIMARY KEY)'))
        connection.execute(text('CREATE TABLE notes (id INTEGER PRIMARY KEY, content TEXT)'))
        connection.execute(text("INSERT INTO notes (id, content) VALUES (1, '# Existing note')"))
    upgrade_ai_notes(engine)
    upgrade_ai_notes(engine)
    assert 'source_message_id' in {column['name'] for column in inspect(engine).get_columns('notes')}
    with engine.connect() as connection:
        assert connection.execute(text('SELECT content, source_message_id FROM notes')).one() == ('# Existing note', None)
    engine.dispose()
