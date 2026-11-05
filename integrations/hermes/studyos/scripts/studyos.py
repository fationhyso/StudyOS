#!/usr/bin/env python3
"""StudyOS agent client. Python standard library only; credentials come from environment."""
import argparse
import json
import mimetypes
import os
from pathlib import Path
import sys
import uuid
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def request(method, path, payload=None, upload=None):
    base = os.environ.get('STUDYOS_URL', '').rstrip('/')
    token = os.environ.get('STUDYOS_API_KEY', '')
    if not base or not token:
        raise ValueError('Set STUDYOS_URL and STUDYOS_API_KEY in the agent environment')
    if urlsplit(base).scheme not in {'http', 'https'} or urlsplit(base).username or urlsplit(base).password:
        raise ValueError('STUDYOS_URL must be an HTTP(S) server URL without credentials')
    headers = {'Authorization': f'Bearer {token}'}
    data = None
    if upload:
        file = Path(upload).expanduser()
        if file.stat().st_size > 25 * 1024 * 1024:
            raise ValueError('Client upload limit is 25 MB')
        boundary = uuid.uuid4().hex
        filename = file.name.replace('"', '_').replace('\r', '_').replace('\n', '_')
        mime = mimetypes.guess_type(file.name)[0] or 'application/octet-stream'
        data = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\nContent-Type: {mime}\r\n\r\n'.encode()
                + file.read_bytes() + f'\r\n--{boundary}--\r\n'.encode())
        headers['Content-Type'] = f'multipart/form-data; boundary={boundary}'
    elif payload is not None:
        data = json.dumps(payload).encode()
        headers['Content-Type'] = 'application/json'
    with build_opener(NoRedirect).open(Request(base + '/api' + path, data=data, headers=headers, method=method), timeout=100) as response:
        body = response.read()
        return json.loads(body) if body else {'ok': True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    p = commands.add_parser('schedule')
    p.add_argument('--title', required=True)
    p.add_argument('--date', required=True, help='YYYY-MM-DD in the user timezone')
    p.add_argument('--time', required=True, help='HH:MM in the user timezone')
    p.add_argument('--minutes', type=int, default=45)
    p.add_argument('--notes', default='')
    p = commands.add_parser('sessions')
    p.add_argument('--start', required=True)
    p.add_argument('--end', required=True)
    p = commands.add_parser('upload')
    p.add_argument('path')
    p.add_argument('--folder-id', type=int)
    p = commands.add_parser('files')
    p.add_argument('--folder-id', type=int)
    p.add_argument('--unfiled', action='store_true')
    commands.add_parser('folders')
    p = commands.add_parser('create-folder')
    p.add_argument('name')
    p.add_argument('--parent-id', type=int)
    p = commands.add_parser('move-folder')
    p.add_argument('id', type=int)
    destination = p.add_mutually_exclusive_group(required=True)
    destination.add_argument('--parent-id', type=int)
    destination.add_argument('--root', action='store_true')
    p = commands.add_parser('rename-folder')
    p.add_argument('id', type=int)
    p.add_argument('name')
    p = commands.add_parser('delete-folder')
    p.add_argument('id', type=int)
    p = commands.add_parser('move-file')
    p.add_argument('id', type=int)
    destination = p.add_mutually_exclusive_group(required=True)
    destination.add_argument('--folder-id', type=int)
    destination.add_argument('--unfiled', action='store_true')
    p = commands.add_parser('document')
    p.add_argument('id', type=int)
    p = commands.add_parser('complete')
    p.add_argument('id', type=int)
    for name in ['generate', 'ask', 'create-note']:
        p = commands.add_parser(name)
        p.add_argument('--json-file', required=True, help='JSON request body file')
    args = parser.parse_args()
    if args.command == 'schedule':
        from datetime import date, time
        date.fromisoformat(args.date)
        at = time.fromisoformat(args.time)
        result = request('POST', '/schedule', {'title': args.title, 'date': args.date,
            'start_minutes': at.hour * 60 + at.minute, 'duration_minutes': args.minutes, 'notes': args.notes})
    elif args.command == 'sessions':
        result = request('GET', '/schedule?' + urlencode({'start': args.start, 'end': args.end}))
    elif args.command == 'upload':
        path = '/documents' + ('?' + urlencode({'folder_id': args.folder_id}) if args.folder_id else '')
        result = request('POST', path, upload=args.path)
    elif args.command == 'files':
        query = {'folder_id': args.folder_id} if args.folder_id else {'unfiled': 'true'} if args.unfiled else {}
        result = request('GET', '/documents' + ('?' + urlencode(query) if query else ''))
    elif args.command == 'folders':
        result = request('GET', '/folders')
    elif args.command == 'create-folder':
        result = request('POST', '/folders', {'name': args.name, 'parent_id': args.parent_id})
    elif args.command == 'move-folder':
        result = request('PATCH', f'/folders/{args.id}', {'parent_id': args.parent_id})
    elif args.command == 'rename-folder':
        result = request('PATCH', f'/folders/{args.id}', {'name': args.name})
    elif args.command == 'delete-folder':
        result = request('DELETE', f'/folders/{args.id}')
    elif args.command == 'move-file':
        result = request('PATCH', f'/documents/{args.id}', {'folder_id': args.folder_id})
    elif args.command == 'document':
        result = request('GET', f'/documents/{args.id}')
    elif args.command == 'complete':
        result = request('PATCH', f'/schedule/{args.id}', {'completed': True})
    else:
        payload = json.loads(Path(args.json_file).read_text())
        if args.command == 'create-note':
            payload['create_note'] = True
        result = request('POST', '/schedule/generate' if args.command == 'generate' else '/ai/chat', payload)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    try:
        main()
    except HTTPError as error:
        try:
            detail = json.loads(error.read()).get('detail', 'Request failed')
        except (ValueError, AttributeError):
            detail = 'Request failed'
        print(json.dumps({'error': detail, 'status': error.code}), file=sys.stderr)
        sys.exit(1)
    except (ValueError, OSError, URLError) as error:
        print(json.dumps({'error': str(error)}), file=sys.stderr)
        sys.exit(1)
