"""Google OAuth and Gmail calls. JSON stdin/stdout; never persists mail or tokens."""
import base64
import json
import os
import re
import sys
from html.parser import HTMLParser
from sender_agent import assess_sender, approved_senders

SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'


class VisibleHTML(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.text = []
        self.hidden = 0
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'): self.hidden += 1
        if not self.hidden:
            if tag in ('p', 'div', 'br', 'li', 'tr'): self.text.append('\n')
            if tag == 'a': self.links.append(dict(attrs).get('href', ''))

    def handle_endtag(self, tag):
        if tag in ('script', 'style'): self.hidden = max(0, self.hidden - 1)
        if tag == 'a' and self.links and not self.hidden:
            link = self.links.pop()
            if link: self.text.append(' (' + link + ')')

    def handle_data(self, data):
        if not self.hidden: self.text.append(data)


def decode_text(data, charset='utf-8'):
    raw = base64.urlsafe_b64decode(data + '=' * (-len(data) % 4))
    try: return raw.decode(charset, errors='replace')
    except LookupError: return raw.decode('utf-8', errors='replace')


def header_map(payload):
    return {h.get('name', '').lower(): h.get('value', '') for h in payload.get('headers', [])}


def parse_message(message, load_text=None):
    payload = message.get('payload', {})
    headers = header_map(payload)
    attachments, notes = [], []

    def content(part, depth=0):
        if depth > 20:
            notes.append('Some nested content could not be included.')
            return ''
        if part.get('filename'):
            attachments.append(part['filename'][:300])
            return ''
        mime = part.get('mimeType', '')
        parts = part.get('parts', [])
        if parts:
            if mime == 'multipart/alternative':
                preferred = next((p for p in parts if p.get('mimeType') == 'text/html'), None)
                if preferred is None: preferred = next((p for p in parts if p.get('mimeType') == 'text/plain'), parts[0])
                # HTML extraction preserves displayed links and their destinations.
                return content(preferred, depth + 1)
            return '\n'.join(content(p, depth + 1) for p in parts)
        if mime not in ('text/plain', 'text/html'): return ''
        body = part.get('body', {})
        if body.get('size', 0) > 500000:
            notes.append('A text part was too large to include.')
            return ''
        data = body.get('data', '')
        if not data and body.get('attachmentId') and load_text:
            data = load_text(body['attachmentId']).get('data', '')
        charset = re.search(r'charset=["\']?([^;"\'\s]+)', header_map(part).get('content-type', ''), re.I)
        text = decode_text(data, charset.group(1) if charset else 'utf-8')
        if mime == 'text/html':
            parser = VisibleHTML()
            parser.feed(text)
            text = ''.join(parser.text)
        return text

    body = content(payload).strip()
    if len(body) > 20000: notes.append('Only the first 20,000 characters are included in the analysis.')
    if attachments: notes.append('Attachment contents are not analyzed.')
    if not body: notes.append('No readable text body was available.')
    return {
        'id': message['id'], 'sender': headers.get('from', '')[:320],
        'replyTo': headers.get('reply-to', '')[:320], 'subject': headers.get('subject', '')[:500],
        'date': headers.get('date', '')[:100], 'receivedAt': int(message.get('internalDate', 0)), 'body': body[:20000],
        'attachments': attachments[:30], 'notes': list(dict.fromkeys(notes)),
    }


def service(token):
    import httplib2
    import google_auth_httplib2
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build
    http = google_auth_httplib2.AuthorizedHttp(Credentials(token=token), http=httplib2.Http(timeout=15))
    return build('gmail', 'v1', http=http, cache_discovery=False)


def flow(payload):
    from google_auth_oauthlib.flow import Flow
    client_id, secret = os.environ.get('GOOGLE_CLIENT_ID'), os.environ.get('GOOGLE_CLIENT_SECRET')
    if not client_id or not secret: raise ValueError('configuration')
    return Flow.from_client_config({'web': {'client_id': client_id, 'client_secret': secret,
        'auth_uri': 'https://accounts.google.com/o/oauth2/auth', 'token_uri': 'https://oauth2.googleapis.com/token'}},
        scopes=[SCOPE], redirect_uri=payload['redirectUri'], code_verifier=payload['verifier'])


def execute(command, payload):
    if command == 'authorize':
        url, _ = flow(payload).authorization_url(state=payload['state'], access_type='online', prompt='select_account')
        return {'url': url}
    if command == 'exchange':
        oauth = flow(payload)
        oauth.fetch_token(code=payload['code'], timeout=15)
        token = oauth.oauth2session.token
        scopes = token.get('scope', [])
        if isinstance(scopes, str): scopes = scopes.split()
        if SCOPE not in scopes: raise ValueError('scope')
        account = service(token['access_token']).users().getProfile(userId='me').execute()
        return {'token': token['access_token'], 'expiresIn': min(int(token['expires_in']), 3600), 'email': account['emailAddress']}
    if command == 'revoke':
        import requests
        response = requests.post('https://oauth2.googleapis.com/revoke', data={'token': payload['token']}, timeout=10)
        return {'revoked': response.status_code in (200, 400)}
    gmail = service(payload['token'])
    if command == 'list':
        page = gmail.users().messages().list(userId='me', labelIds=['INBOX'], maxResults=20).execute()
        entries, errors = {}, []
        def receive(request_id, response, error):
            if error: errors.append(error); return
            h = header_map(response.get('payload', {}))
            entries[request_id] = {'id': response['id'], 'sender': h.get('from', '')[:320], 'subject': h.get('subject', '')[:500], 'date': h.get('date', '')[:100], 'receivedAt': int(response.get('internalDate', 0))}
        batch = gmail.new_batch_http_request(callback=receive)
        for item in page.get('messages', []):
            batch.add(gmail.users().messages().get(userId='me', id=item['id'], format='metadata', metadataHeaders=['From', 'Subject', 'Date']), request_id=item['id'])
        if page.get('messages'): batch.execute()
        if errors: raise errors[0]
        return {'messages': sorted(entries.values(), key=lambda item: item['receivedAt'], reverse=True)[:20], 'nextPageToken': ''}
    if command == 'get':
        message_id = payload['messageId']
        if not isinstance(message_id, str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,128}', message_id): raise ValueError('message')
        message = gmail.users().messages().get(userId='me', id=message_id, format='full').execute()
        result = parse_message(message, lambda attachment_id: gmail.users().messages().attachments().get(userId='me', messageId=message_id, id=attachment_id).execute())
        result['senderCheck'] = assess_sender(message, approved_senders(payload.get('mailbox', '')))
        return result
    raise ValueError('command')


def main():
    try:
        payload = json.loads(sys.stdin.buffer.read(100001))
        result = execute(sys.argv[1], payload)
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except ImportError:
        error = {'error': 'Install the Protocol Python requirements first.', 'status': 503}
    except Exception as exc:
        status = getattr(getattr(exc, 'resp', None), 'status', 0)
        messages = {401: 'Gmail access expired. Sign in again.', 403: 'Google denied access. Check Gmail API permissions and project setup.', 404: 'This email is no longer available.', 429: 'Gmail is busy. Try again shortly.'}
        error = {'error': messages.get(status, 'Gmail could not complete the request. Check your Google setup or reconnect.'), 'status': status if status in messages else 502}
    print(json.dumps(error))
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
