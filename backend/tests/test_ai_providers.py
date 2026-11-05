import json
from datetime import date

import httpx
import pytest
from pydantic import ValidationError

from app.config import Settings, get_settings
from app.services.ai import call_ai


def select_provider(monkeypatch, provider):
    settings = get_settings()
    for field, value in {'ai_provider': provider, 'openai_api_key': 'openai-test-key',
                         'deepseek_api_key': 'deepseek-test-key'}.items():
        monkeypatch.setattr(settings, field, value)
    return settings


def mock_transport(monkeypatch, handler):
    client = httpx.AsyncClient
    monkeypatch.setattr('app.services.ai.httpx.AsyncClient',
                        lambda **kwargs: client(transport=httpx.MockTransport(handler), **kwargs))


@pytest.mark.asyncio
@pytest.mark.parametrize('provider', ['openai', 'deepseek'])
async def test_selected_provider_request(monkeypatch, provider):
    settings = select_provider(monkeypatch, provider)
    def handler(request):
        assert str(request.url) == settings.ai_base_url.rstrip('/') + '/chat/completions'
        assert request.headers['Authorization'] == f'Bearer {settings.ai_api_key}'
        body = json.loads(request.content)
        assert body['model'] == settings.ai_model
        assert body['response_format'] == {'type': 'json_object'}
        if provider == 'deepseek':
            assert body['thinking'] == {'type': 'disabled'}
            assert 'openai-test-key' not in str(request.headers)
        else:
            assert 'thinking' not in body
        return httpx.Response(200, json={'choices': [{'message': {'content': '{"sessions":[]}'}}]})
    mock_transport(monkeypatch, handler)
    assert await call_ai([{'role': 'user', 'content': 'Return JSON'}], json_mode=True) == '{"sessions":[]}'


@pytest.mark.asyncio
@pytest.mark.parametrize('provider', ['offline', 'deepseek'])
async def test_disabled_or_missing_key_never_calls_api(monkeypatch, provider):
    settings = select_provider(monkeypatch, provider)
    if provider == 'deepseek':
        monkeypatch.setattr(settings, 'deepseek_api_key', '')
    def forbidden(request):
        pytest.fail('Should not make an external request or use the other provider key')
    mock_transport(monkeypatch, forbidden)
    assert await call_ai([{'role': 'user', 'content': 'Hello'}]) is None


@pytest.mark.asyncio
@pytest.mark.parametrize('kind', ['auth', 'rate_limit', 'blank', 'malformed', 'timeout'])
async def test_deepseek_failure_falls_back(monkeypatch, kind):
    select_provider(monkeypatch, 'deepseek')
    def handler(request):
        if kind == 'timeout':
            raise httpx.ReadTimeout('Test timeout', request=request)
        if kind in {'auth', 'rate_limit'}:
            return httpx.Response(401 if kind == 'auth' else 429, json={'error': 'Unavailable'})
        return httpx.Response(200, json={'choices': [{'message': {'content': '   '}}]} if kind == 'blank' else [])
    mock_transport(monkeypatch, handler)
    assert await call_ai([{'role': 'user', 'content': 'Hello'}]) is None


def test_deepseek_tutor_and_schedule(client, auth_headers, monkeypatch):
    settings = select_provider(monkeypatch, 'deepseek')
    def handler(request):
        payload = json.loads(request.content)
        if 'response_format' in payload:
            content = json.dumps({'sessions': [{'date': str(date.today()), 'start_time': '18:00',
                'duration_minutes': 25, 'title': 'DeepSeek biology plan', 'topic': 'study', 'document_id': None}]})
        else:
            content = 'Photosynthesis converts light energy into chemical energy. [1]'
        return httpx.Response(200, json={'choices': [{'message': {'content': content}}]})
    mock_transport(monkeypatch, handler)
    document = client.post('/api/documents', headers=auth_headers,
        files={'file': ('biology.txt', 'Photosynthesis converts light energy into chemical energy.', 'text/plain')}).json()
    status = client.get('/api/ai/status', headers=auth_headers).json()
    assert status['provider'] == 'deepseek' and status['configured']
    assert status['mode'] == f'DeepSeek · {settings.deepseek_model}'
    assert 'key' not in json.dumps(status).lower()
    answer = client.post('/api/ai/chat', headers=auth_headers,
        json={'message': 'Explain photosynthesis', 'document_ids': [document['id']]}).json()
    assert answer['mode'] == settings.deepseek_model
    assert answer['sources'][0]['document_id'] == document['id']
    assert '[1]' in answer['answer']
    schedule = client.post('/api/schedule/generate', headers=auth_headers,
        json={'start_date': str(date.today()), 'end_date': str(date.today())})
    assert schedule.status_code == 201
    assert schedule.json()[0]['title'] == 'DeepSeek biology plan'


def test_unknown_provider_rejected():
    with pytest.raises(ValidationError):
        Settings(ai_provider='typo', _env_file=None)
