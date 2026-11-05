import json
from datetime import date
from sqlalchemy import create_engine, inspect, text
from app.migrations import upgrade_tutor_sessions


def request_session(client, headers, **changes):
    body = {'message': 'Schedule biology tomorrow at 18:00 for 45 minutes', 'create_session': True,
            'reference_date': '2026-11-05', 'timezone': 'Europe/Athens'}
    return client.post('/api/ai/chat', headers=headers, json={**body, **changes})


def test_tutor_creates_real_calendar_session_and_history(client, auth_headers):
    response = request_session(client, auth_headers)
    assert response.status_code == 200
    result = response.json()
    session = result['calendar_session']
    assert session['title'] == 'biology'
    assert session['date'] == '2026-11-06'
    assert session['start_minutes'] == 1080 and session['duration_minutes'] == 45
    assert session['source'] == 'tutor'
    assert result['note'] is None
    calendar = client.get('/api/schedule?start=2026-11-06&end=2026-11-06', headers=auth_headers).json()
    assert calendar[0]['id'] == session['id']
    messages = client.get(f"/api/ai/conversations/{result['conversation_id']}/messages", headers=auth_headers).json()
    assert messages[-1]['calendar_session']['id'] == session['id']
    assert client.delete(f"/api/ai/conversations/{result['conversation_id']}", headers=auth_headers).status_code == 204
    assert client.get('/api/schedule?start=2026-11-06&end=2026-11-06', headers=auth_headers).json()[0]['id'] == session['id']


def test_missing_or_invalid_details_do_not_create_sessions(client, auth_headers):
    for message in ['Schedule biology', 'Biology tomorrow at 6 for 45 minutes',
                    'Biology tomorrow at 23:50 for 45 minutes', 'Biology daily at 18:00 for 45 minutes']:
        result = request_session(client, auth_headers, message=message).json()
        assert result['calendar_session'] is None
        assert 'Created **' not in result['answer']
    assert client.get('/api/schedule?start=2026-11-01&end=2026-12-01', headers=auth_headers).json() == []
    assert request_session(client, auth_headers, create_note=True).status_code == 422


def test_explicit_details_override_text_and_conflicts(client, auth_headers, monkeypatch):
    async def forbidden(*args, **kwargs):
        raise AssertionError('Complete structured details do not need an external API')
    monkeypatch.setattr('app.services.calendar.call_ai', forbidden)
    details = {'date': '2026-12-10', 'start_time': '09:30', 'duration_minutes': 30}
    first = request_session(client, auth_headers, session_details=details).json()
    assert first['calendar_session']['date'] == '2026-12-10'
    assert first['calendar_session']['start_minutes'] == 570
    second = request_session(client, auth_headers, session_details=details).json()
    assert second['calendar_session'] is None and 'overlaps' in second['answer']
    assert len(client.get('/api/schedule?start=2026-12-10&end=2026-12-10', headers=auth_headers).json()) == 1


def test_provider_session_is_validated_and_scoped(client, auth_headers, monkeypatch):
    async def generated(messages, json_mode=False):
        assert json_mode
        assert '2026-11-05' in messages[-1]['content']
        return json.dumps({'session': {'title': 'Algebra review', 'date': '2026-11-07', 'start_time': '16:15',
            'duration_minutes': 50, 'topic': 'review', 'notes': 'Practice recall', 'document_id': None}})
    monkeypatch.setattr('app.services.calendar.call_ai', generated)
    result = request_session(client, auth_headers, message='Review algebra on Saturday afternoon for fifty minutes').json()
    assert result['calendar_session']['title'] == 'Algebra review'
    assert result['calendar_session']['start_minutes'] == 975
    async def invalid(*args, **kwargs):
        return json.dumps({'session': {'title': 'Stolen', 'date': '2026-11-07', 'start_time': '19:00',
                                      'duration_minutes': 30, 'document_id': 9999}})
    monkeypatch.setattr('app.services.calendar.call_ai', invalid)
    assert request_session(client, auth_headers).json()['calendar_session'] is None


def test_session_action_needs_schedule_permission(client, auth_headers):
    def key(scopes):
        token = client.post('/api/integrations/keys', headers=auth_headers, json={'name': 'Calendar', 'scopes': scopes}).json()['token']
        return {'Authorization': f'Bearer {token}'}
    assert request_session(client, key(['ai'])).status_code == 403
    assert request_session(client, key(['schedule'])).status_code == 403
    assert request_session(client, key(['ai', 'schedule'])).json()['calendar_session'] is not None
    other = client.post('/api/auth/signup', json={'name': 'Other', 'email': 'calendar-other@example.com', 'password': 'another-pass'}).json()
    assert client.get('/api/schedule?start=2026-11-06&end=2026-11-06', headers={'Authorization': f"Bearer {other['token']}"}).json() == []


def test_legacy_session_upgrade_preserves_data(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'legacy-calendar.db'}")
    with engine.begin() as connection:
        connection.execute(text('CREATE TABLE chat_messages (id INTEGER PRIMARY KEY)'))
        connection.execute(text('CREATE TABLE study_sessions (id INTEGER PRIMARY KEY, title TEXT)'))
        connection.execute(text("INSERT INTO study_sessions VALUES (1, 'Existing session')"))
    upgrade_tutor_sessions(engine)
    upgrade_tutor_sessions(engine)
    with engine.connect() as connection:
        assert connection.execute(text('SELECT title, source_message_id FROM study_sessions')).one() == ('Existing session', None)
    engine.dispose()
