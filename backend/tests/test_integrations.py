from datetime import date, datetime, timedelta, timezone


def test_agent_keys(client, auth_headers):
    created = client.post('/api/integrations/keys', headers=auth_headers,
                          json={'name': 'Telegram', 'scopes': ['schedule', 'documents']})
    assert created.status_code == 201
    key = created.json()
    agent = {'Authorization': f"Bearer {key['token']}"}
    result = client.post('/api/schedule', headers=agent, json={
        'title': 'Telegram biology', 'date': str(date.today()), 'start_minutes': 1080, 'duration_minutes': 45
    })
    assert result.status_code == 201
    assert client.get('/api/schedule', headers=auth_headers,
                      params={'start': str(date.today()), 'end': str(date.today())}).json()[0]['title'] == 'Telegram biology'
    document = client.post('/api/documents', headers=agent,
                           files={'file': ('syllabus.txt', 'Chapter 1: Biology of cells', 'text/plain')})
    assert document.status_code == 201
    assert client.get(f"/api/documents/{document.json()['id']}", headers=agent).json()['status'] == 'ready'
    assert client.get('/api/notes', headers=agent).status_code == 403
    assert client.post('/api/integrations/keys', headers=agent, json={'name': 'escalate'}).status_code == 403
    listing = client.get('/api/integrations/keys', headers=auth_headers).json()
    assert 'token' not in listing[0] and 'token_hash' not in listing[0]
    from app.database import SessionLocal
    from app.models import AgentKey
    with SessionLocal() as db:
        assert db.get(AgentKey, key['id']).token_hash != key['token']
    assert client.delete(f"/api/integrations/keys/{key['id']}", headers=auth_headers).status_code == 204
    assert client.get('/api/documents', headers=agent).status_code == 401


def test_agent_expiry_and_isolation(client, auth_headers):
    key = client.post('/api/integrations/keys', headers=auth_headers, json={'name': 'Telegram'}).json()
    other = client.post('/api/auth/signup', json={
        'name': 'Other', 'email': 'agent-other@example.com', 'password': 'another-pass'
    }).json()
    other_headers = {'Authorization': f"Bearer {other['token']}"}
    assert client.get('/api/integrations/keys', headers=other_headers).json() == []
    assert client.delete(f"/api/integrations/keys/{key['id']}", headers=other_headers).status_code == 404
    private = client.post('/api/documents', headers=other_headers,
                          files={'file': ('other.txt', 'Other private notes', 'text/plain')}).json()
    agent = {'Authorization': f"Bearer {key['token']}"}
    assert client.get(f"/api/documents/{private['id']}", headers=agent).status_code == 404
    from app.database import SessionLocal
    from app.models import AgentKey
    with SessionLocal() as db:
        db.get(AgentKey, key['id']).expires_at = datetime.now(timezone.utc) - timedelta(days=1)
        db.commit()
    assert client.get('/api/documents', headers=agent).status_code == 401
    assert client.get('/api/documents', headers={'Authorization': 'Bearer studyos_invalid'}).status_code == 401


def test_agent_helper_uses_real_api(client, auth_headers, monkeypatch, tmp_path, capsys):
    import importlib.util
    import json
    from pathlib import Path
    from urllib.parse import urlsplit
    script = Path(__file__).resolve().parents[2] / 'integrations/hermes/studyos/scripts/studyos.py'
    spec = importlib.util.spec_from_file_location('studyos_helper', script)
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    key = client.post('/api/integrations/keys', headers=auth_headers, json={'name': 'Helper'}).json()
    monkeypatch.setenv('STUDYOS_URL', 'http://testserver')
    monkeypatch.setenv('STUDYOS_API_KEY', key['token'])

    class Reply:
        def __init__(self, response):
            self.response = response
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def read(self):
            return self.response.content

    class Opener:
        def open(self, request, timeout):
            response = client.request(request.method, urlsplit(request.full_url).path + ('?' + urlsplit(request.full_url).query if urlsplit(request.full_url).query else ''),
                                      headers=dict(request.header_items()), content=request.data)
            assert response.is_success, response.text
            return Reply(response)
    monkeypatch.setattr(helper, 'build_opener', lambda *args: Opener())
    file = tmp_path / 'syllabus.md'
    file.write_text('# Biology\nCells and photosynthesis')
    result = helper.request('POST', '/documents', upload=str(file))
    assert result['name'] == 'syllabus.md'
    assert helper.request('GET', f"/documents/{result['id']}")['status'] == 'ready'
    result = helper.request('POST', '/schedule', {'title': 'Read syllabus', 'date': str(date.today()),
                                                'start_minutes': 1080, 'duration_minutes': 45})
    assert result['title'] == 'Read syllabus'

    import sys
    def run(*arguments):
        monkeypatch.setattr(sys, 'argv', ['studyos.py', *arguments])
        capsys.readouterr()
        helper.main()
        return json.loads(capsys.readouterr().out)
    folder = run('create-folder', 'Biology')
    assert run('folders')[0]['id'] == folder['id']
    uploaded = run('upload', str(file), '--folder-id', str(folder['id']))
    assert uploaded['folder_id'] == folder['id']
    assert run('files', '--folder-id', str(folder['id']))[0]['id'] == uploaded['id']
    assert run('rename-folder', str(folder['id']), 'Life Sciences')['name'] == 'Life Sciences'
    assert run('move-file', str(uploaded['id']), '--unfiled')['folder_id'] is None
    run('move-file', str(uploaded['id']), '--folder-id', str(folder['id']))
    assert run('delete-folder', str(folder['id']))['ok']
    assert run('document', str(uploaded['id']))['folder_id'] is None
