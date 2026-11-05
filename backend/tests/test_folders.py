from sqlalchemy import create_engine, inspect, text
from app.migrations import upgrade_subject_folders


def upload(client, headers, folder_id=None):
    return client.post('/api/documents', headers=headers,
                       params={'folder_id': folder_id} if folder_id else {},
                       files={'file': ('biology.md', '# Biology\nPhotosynthesis in cells', 'text/markdown')})


def test_folder_lifecycle_preserves_files(client, auth_headers):
    folder = client.post('/api/folders', headers=auth_headers, json={'name': '  Biology  '})
    assert folder.status_code == 201
    folder_id = folder.json()['id']
    assert folder.json()['name'] == 'Biology'
    document = upload(client, auth_headers, folder_id).json()
    assert document['folder_id'] == folder_id
    assert client.get('/api/documents', headers=auth_headers, params={'folder_id': folder_id}).json()[0]['id'] == document['id']
    assert client.get('/api/documents?unfiled=true', headers=auth_headers).json() == []
    assert client.patch(f'/api/folders/{folder_id}', headers=auth_headers, json={'name': 'Molecular Biology'}).json()['name'] == 'Molecular Biology'
    assert client.delete(f'/api/folders/{folder_id}', headers=auth_headers).status_code == 204
    assert client.get('/api/folders', headers=auth_headers).json() == []
    result = client.get(f"/api/documents/{document['id']}", headers=auth_headers).json()
    assert result['folder_id'] is None and result['status'] == 'ready'
    assert client.get(f"/api/documents/{document['id']}/file", headers=auth_headers).status_code == 200
    assert 'Photosynthesis' in client.get(f"/api/documents/{document['id']}/content", headers=auth_headers).json()['text']
    assert len(client.get('/api/documents?unfiled=true', headers=auth_headers).json()) == 1


def test_folder_move_validation_and_account_isolation(client, auth_headers):
    folder_id = client.post('/api/folders', headers=auth_headers, json={'name': 'Math'}).json()['id']
    document = upload(client, auth_headers).json()
    assert document['folder_id'] is None
    assert client.patch(f"/api/documents/{document['id']}", headers=auth_headers, json={'folder_id': folder_id}).json()['folder_id'] == folder_id
    assert client.patch(f"/api/documents/{document['id']}", headers=auth_headers, json={'folder_id': None}).json()['folder_id'] is None
    assert client.post('/api/folders', headers=auth_headers, json={'name': '   '}).status_code == 422
    assert client.post('/api/folders', headers=auth_headers, json={'name': 'x' * 81}).status_code == 422
    other = client.post('/api/auth/signup', json={'name': 'Other', 'email': 'folder-other@example.com', 'password': 'another-pass'}).json()
    headers = {'Authorization': f"Bearer {other['token']}"}
    assert client.get('/api/folders', headers=headers).json() == []
    for method, body in [('get', None), ('patch', {'name': 'Stolen'}), ('delete', None)]:
        response = client.request(method, f'/api/folders/{folder_id}', headers=headers, json=body)
        # There is no individual GET route, but no folder data is disclosed.
        assert response.status_code in {404, 405}
    assert upload(client, headers, folder_id).status_code == 404
    assert client.get('/api/documents', headers=headers, params={'folder_id': folder_id}).status_code == 404
    other_file = upload(client, headers).json()['id']
    assert client.patch(f'/api/documents/{other_file}', headers=headers, json={'folder_id': folder_id}).status_code == 404
    assert client.patch(f"/api/documents/{document['id']}", headers=headers, json={'folder_id': None}).status_code == 404
    assert client.patch(f"/api/documents/{document['id']}", headers=auth_headers, json={'folder_id': 99999}).status_code == 404


def test_agent_folder_permissions(client, auth_headers):
    token = client.post('/api/integrations/keys', headers=auth_headers, json={'name': 'Folders', 'scopes': ['documents']}).json()['token']
    agent = {'Authorization': f'Bearer {token}'}
    folder = client.post('/api/folders', headers=agent, json={'name': 'Physics'}).json()
    assert client.get('/api/folders', headers=agent).json()[0]['id'] == folder['id']
    document = upload(client, agent, folder['id']).json()
    assert document['folder_id'] == folder['id']
    assert client.patch(f"/api/folders/{folder['id']}", headers=agent, json={'name': 'Mechanics'}).status_code == 200
    assert client.patch(f"/api/documents/{document['id']}", headers=agent, json={'folder_id': None}).status_code == 200
    assert client.delete(f"/api/folders/{folder['id']}", headers=agent).status_code == 204
    token = client.post('/api/integrations/keys', headers=auth_headers, json={'name': 'No files', 'scopes': ['schedule']}).json()['token']
    denied = {'Authorization': f'Bearer {token}'}
    assert client.get('/api/folders', headers=denied).status_code == 403
    assert client.post('/api/folders', headers=denied, json={'name': 'Denied'}).status_code == 403


def test_existing_database_upgrade_preserves_documents(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'legacy.db'}")
    with engine.begin() as connection:
        connection.execute(text('CREATE TABLE subject_folders (id INTEGER PRIMARY KEY)'))
        connection.execute(text('CREATE TABLE documents (id INTEGER PRIMARY KEY, name TEXT)'))
        connection.execute(text("INSERT INTO documents (id, name) VALUES (1, 'existing.pdf')"))
    upgrade_subject_folders(engine)
    upgrade_subject_folders(engine)
    assert 'folder_id' in {column['name'] for column in inspect(engine).get_columns('documents')}
    assert 'parent_id' in {column['name'] for column in inspect(engine).get_columns('subject_folders')}
    with engine.connect() as connection:
        assert connection.execute(text('SELECT name, folder_id FROM documents')).one() == ('existing.pdf', None)
    engine.dispose()


def test_nested_folders_moves_cycles_and_delete(client, auth_headers):
    def create(name, parent=None):
        response = client.post('/api/folders', headers=auth_headers, json={'name': name, 'parent_id': parent})
        assert response.status_code == 201
        return response.json()['id']
    root = create('Biology')
    child = create('Semester 1', root)
    grandchild = create('Cell Biology', child)
    file = upload(client, auth_headers, grandchild).json()['id']
    root_file = upload(client, auth_headers, root).json()['id']
    for parent in [root, child, grandchild]:
        response = client.patch(f'/api/folders/{root}', headers=auth_headers, json={'parent_id': parent})
        assert response.status_code == 422
    assert client.patch(f'/api/folders/{child}', headers=auth_headers, json={'name': None}).status_code == 422
    assert client.patch(f'/api/folders/{child}', headers=auth_headers, json={'name': 'Semester One'}).json()['parent_id'] == root
    assert client.patch(f'/api/folders/{grandchild}', headers=auth_headers, json={'parent_id': None}).json()['parent_id'] is None
    client.patch(f'/api/folders/{grandchild}', headers=auth_headers, json={'parent_id': child})
    assert client.delete(f'/api/folders/{root}', headers=auth_headers).status_code == 204
    folders = {item['id']: item for item in client.get('/api/folders', headers=auth_headers).json()}
    assert folders[child]['parent_id'] is None
    assert folders[grandchild]['parent_id'] == child
    assert client.get(f'/api/documents/{file}', headers=auth_headers).json()['folder_id'] == grandchild
    assert client.get(f'/api/documents/{root_file}', headers=auth_headers).json()['folder_id'] is None
    assert client.delete(f'/api/folders/{grandchild}', headers=auth_headers).status_code == 204
    assert client.get(f'/api/documents/{file}/file', headers=auth_headers).status_code == 200


def test_nested_parent_ownership(client, auth_headers):
    folder = client.post('/api/folders', headers=auth_headers, json={'name': 'Private'}).json()['id']
    other = client.post('/api/auth/signup', json={'name': 'Other', 'email': 'nested-other@example.com', 'password': 'another-pass'}).json()
    headers = {'Authorization': f"Bearer {other['token']}"}
    child = client.post('/api/folders', headers=headers, json={'name': 'Other'}).json()['id']
    assert client.post('/api/folders', headers=headers, json={'name': 'Nested', 'parent_id': folder}).status_code == 404
    assert client.patch(f'/api/folders/{child}', headers=headers, json={'parent_id': folder}).status_code == 404
    assert client.patch(f'/api/folders/{folder}', headers=headers, json={'parent_id': child}).status_code == 404
