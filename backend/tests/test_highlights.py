from io import BytesIO
from pypdf import PdfWriter


def pdf_upload(client, headers):
    writer = PdfWriter()
    writer.add_blank_page(width=612, height=792)
    data = BytesIO(); writer.write(data)
    response = client.post('/api/documents', headers=headers, files={'file': ('lesson.pdf', data.getvalue(), 'application/pdf')})
    assert response.status_code == 201
    return response.json()['id']


def test_highlights_persist_with_private_document(client, auth_headers):
    document = pdf_upload(client, auth_headers)
    payload = {'page': 1, 'text': 'Selected text', 'rects': [{'x': .1, 'y': .2, 'width': .3, 'height': .02}]}
    created = client.post(f'/api/documents/{document}/highlights', headers=auth_headers, json=payload)
    assert created.status_code == 201
    highlight = created.json()
    assert highlight['rects'] == payload['rects']
    assert client.get(f'/api/documents/{document}/highlights', headers=auth_headers).json()[0]['id'] == highlight['id']
    other = client.post('/api/auth/signup', json={'name': 'Other', 'email': 'highlight-other@example.com', 'password': 'another-pass'}).json()
    headers = {'Authorization': f"Bearer {other['token']}"}
    assert client.get(f'/api/documents/{document}/highlights', headers=headers).status_code == 404
    assert client.post(f'/api/documents/{document}/highlights', headers=headers, json=payload).status_code == 404
    assert client.delete(f"/api/documents/{document}/highlights/{highlight['id']}", headers=headers).status_code == 404
    another_pdf = pdf_upload(client, auth_headers)
    assert client.delete(f"/api/documents/{another_pdf}/highlights/{highlight['id']}", headers=auth_headers).status_code == 404
    assert client.delete(f"/api/documents/{document}/highlights/{highlight['id']}", headers=auth_headers).status_code == 204
    assert client.get(f'/api/documents/{document}/highlights', headers=auth_headers).json() == []


def test_highlight_validation_and_document_delete(client, auth_headers):
    document = pdf_upload(client, auth_headers)
    body = {'page': 1, 'text': 'Selected text', 'rects': [{'x': .1, 'y': .2, 'width': .3, 'height': .02}]}
    for patch in [{'page': 2}, {'rects': []}, {'text': ''}, {'rects': [{'x': .9, 'y': 0, 'width': .5, 'height': .1}]}]:
        assert client.post(f'/api/documents/{document}/highlights', headers=auth_headers, json={**body, **patch}).status_code == 422
    text = client.post('/api/documents', headers=auth_headers, files={'file': ('text.txt', 'Text file', 'text/plain')}).json()['id']
    assert client.post(f'/api/documents/{text}/highlights', headers=auth_headers, json=body).status_code == 422
    highlight = client.post(f'/api/documents/{document}/highlights', headers=auth_headers, json=body).json()
    assert client.delete(f'/api/documents/{document}', headers=auth_headers).status_code == 204
    from app.database import SessionLocal
    from app.models import DocumentHighlight
    with SessionLocal() as db:
        assert db.get(DocumentHighlight, highlight['id']) is None
