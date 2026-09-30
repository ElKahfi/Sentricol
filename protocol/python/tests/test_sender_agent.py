import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sender_agent import assess_sender, approved_senders

AUTH = 'mx.google.com; dkim=pass header.i=@partner.example; spf=pass smtp.mailfrom=sender@partner.example; dmarc=pass header.from=partner.example'
def message(sender='Partner <sender@partner.example>', auth=AUTH, extra=None):
    headers = [{'name': 'From', 'value': sender}]
    if auth is not None: headers.append({'name': 'Authentication-Results', 'value': auth})
    headers.extend(extra or [])
    return {'payload': {'headers': headers}, 'labelIds': ['INBOX']}
class SenderAgentTests(unittest.TestCase):
    def decide(self, mail, approved=None):
        return assess_sender(mail, {'sender@partner.example'} if approved is None else approved)['status']
    def test_approved_authenticated_address_skips(self):
        self.assertEqual(self.decide(message()), 'trusted')
    def test_unknown_and_lookalikes_scan_even_if_authenticated(self):
        for sender in ['sender@partner.example.evil.test', 'sender@partn3r.example', 'sender@partner.example <attacker@evil.test>']:
            self.assertEqual(self.decide(message(sender=sender)), 'scan-required')
        self.assertEqual(self.decide(message(), set()), 'scan-required')
    def test_missing_failed_unaligned_and_foreign_results_scan(self):
        for auth in [None, AUTH.replace('dmarc=pass', 'dmarc=fail'), AUTH.replace('mx.google.com', 'evil.test'), AUTH.replace('header.from=partner.example','header.from=evil.test'), AUTH.replace('dkim=pass','dkim=fail').replace('spf=pass','spf=fail'), 'mx.google.com; dmarc=fail (dmarc=pass header.from=partner.example); dkim=pass header.i=@partner.example']:
            self.assertEqual(self.decide(message(auth=auth)), 'scan-required')
    def test_duplicates_conflicting_reply_and_spam_scan(self):
        for extra in [[{'name':'Authentication-Results','value':AUTH}], [{'name':'From','value':'other@partner.example'}], [{'name':'Reply-To','value':'other@evil.test'}]]:
            self.assertEqual(self.decide(message(extra=extra)), 'scan-required')
        spam = message(); spam['labelIds'].append('SPAM')
        self.assertEqual(self.decide(spam), 'scan-required')
    def test_body_text_cannot_supply_authentication(self):
        mail = message(auth=None)
        mail['payload']['body'] = {'data': AUTH}
        self.assertEqual(self.decide(mail), 'scan-required')
    def test_approvals_are_isolated_by_mailbox_and_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'approved.json'
            path.write_text(json.dumps({'accounts': {'one@example.test': ['sender@partner.example','*.example','Partner <sender@partner.example>']}}))
            with patch.dict(os.environ, {'PROTOCOL_TRUSTED_SENDERS_PATH': str(path)}):
                self.assertEqual(approved_senders('one@example.test'), {'sender@partner.example'})
                self.assertEqual(approved_senders('two@example.test'), set())
                path.write_text('invalid')
                self.assertEqual(approved_senders('one@example.test'), set())
if __name__ == '__main__': unittest.main()
