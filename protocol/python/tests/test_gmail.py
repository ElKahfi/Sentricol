import base64
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock
from urllib.parse import urlparse, parse_qs
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import gmail

def part(mime, text, **extra):
    return {'mimeType': mime, 'body': {'data': base64.urlsafe_b64encode(text.encode()).decode()}, **extra}

class GmailTests(unittest.TestCase):
    def test_html_preserves_link_destination_without_loading_resources(self):
        message = {'id': '123', 'payload': {'mimeType': 'multipart/alternative', 'parts': [part('text/plain', 'plain'), part('text/html', '<style>hide</style><script>bad()</script><p>Hello <a href="https://evil.example">Payroll</a><img src="https://tracker.example"></p>')]}}
        result = gmail.parse_message(message)
        self.assertIn('Payroll (https://evil.example)', result['body'])
        for hidden in ('hide', 'bad()', 'tracker', 'plain'): self.assertNotIn(hidden, result['body'])
    def test_attachments_are_not_read_and_long_text_is_marked(self):
        message = {'id': '123', 'payload': {'parts': [part('text/plain', 'a' * 21000), part('text/plain', 'secret attachment', filename='file.txt')]}}
        result = gmail.parse_message(message)
        self.assertEqual(len(result['body']), 20000)
        self.assertEqual(result['attachments'], ['file.txt'])
        self.assertEqual(len(result['notes']), 2)
        self.assertNotIn('secret', result['body'])
    def test_inline_text_can_be_loaded_from_gmail_body_endpoint(self):
        result = gmail.parse_message({'id': '123', 'payload': {'mimeType': 'text/plain', 'body': {'attachmentId': 'inline'}}}, lambda value: part('text/plain', 'hello')['body'])
        self.assertEqual(result['body'], 'hello')
    def test_inbox_listing_is_limited_to_twenty_and_sorted_by_received_time(self):
        api = MagicMock()
        messages = api.users.return_value.messages.return_value
        messages.list.return_value.execute.return_value = {'messages': [{'id': 'older'}, {'id': 'newer'}], 'nextPageToken': 'ignored'}
        def batch(callback):
            result = MagicMock()
            def execute():
                callback('older', {'id': 'older', 'internalDate': '10', 'payload': {}}, None)
                callback('newer', {'id': 'newer', 'internalDate': '20', 'payload': {}}, None)
            result.execute.side_effect = execute
            return result
        api.new_batch_http_request.side_effect = batch
        with patch('gmail.service', return_value=api):
            result = gmail.execute('list', {'token': 'test', 'pageToken': 'cannot-expand-window'})
        messages.list.assert_called_once_with(userId='me', labelIds=['INBOX'], maxResults=20)
        self.assertEqual([item['id'] for item in result['messages']], ['newer', 'older'])
        self.assertEqual(result['nextPageToken'], '')

    def test_authorization_uses_readonly_online_access_and_pkce(self):
        with patch.dict(os.environ, {'GOOGLE_CLIENT_ID': 'fake.apps.googleusercontent.com', 'GOOGLE_CLIENT_SECRET': 'fake'}):
            result = gmail.execute('authorize', {'state': 'state', 'verifier': 'a' * 43, 'redirectUri': 'http://127.0.0.1:3003/api/gmail/callback'})
        query = parse_qs(urlparse(result['url']).query)
        self.assertEqual(query['scope'], [gmail.SCOPE])
        self.assertEqual(query['state'], ['state'])
        self.assertEqual(query['access_type'], ['online'])
        self.assertEqual(query['code_challenge_method'], ['S256'])
        self.assertNotEqual(query['code_challenge'][0], 'a' * 43)
        self.assertNotIn('fake', result['url'].split('client_id=')[0])

if __name__ == '__main__': unittest.main()
