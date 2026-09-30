"""Deterministic sender gate. Email text and the model cannot approve senders."""
import json
import os
import re
from email import policy
from email.parser import HeaderParser
from pathlib import Path


def address(value):
    if not isinstance(value, str) or '\r' in value or '\n' in value:
        return None
    try:
        header = HeaderParser(policy=policy.default).parsestr('From: ' + value + '\n\n')['From']
        if header.defects or len(header.addresses) != 1:
            return None
        parsed = header.addresses[0]
        if not parsed.username or not parsed.domain or not parsed.addr_spec.isascii():
            return None
        return parsed.addr_spec.lower()
    except (ValueError, IndexError, AttributeError):
        return None


def approved_senders(mailbox):
    path = Path(os.environ.get('PROTOCOL_TRUSTED_SENDERS_PATH', 'config/trusted-senders.local.json'))
    try:
        accounts = json.loads(path.read_text())['accounts']
        entries = accounts.get(mailbox.lower(), [])
        if not isinstance(entries, list): return set()
        # Exact mailbox addresses only. Domains, wildcards and display names aren't approvals.
        return {entry.lower() for entry in entries if isinstance(entry, str) and address(entry) == entry.lower() and '*' not in entry}
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        return set()


def authentication(headers, sender_domain):
    # Only called for top-level headers retrieved directly through the authenticated
    # Gmail API. Trust Gmail's receiver boundary (RFC 8601), never body text,
    # ARC results, browser-supplied headers, or another receiver's assertions.
    results = [h.get('value', '') for h in headers if h.get('name', '').lower() == 'authentication-results']
    google = [v for v in results if re.match(r'^\s*mx\.google\.com\s*;', v, re.I)]
    if len(google) != 1 or not results or results[0] != google[0]:
        return False
    value = google[0]
    # Remove comments so words such as "dmarc=pass" in a comment cannot pass.
    while re.search(r'\([^()]*\)', value):
        value = re.sub(r'\([^()]*\)', '', value)
    if '(' in value or ')' in value: return False
    methods = {}
    for clause in value.split(';')[1:]:
        match = re.match(r'\s*(spf|dkim|dmarc)\s*=\s*([a-z]+)\b(.*)', clause, re.I | re.S)
        if match:
            name, result, properties = match.groups()
            methods.setdefault(name.lower(), []).append((result.lower(), properties))
    def prop(text, name):
        found = re.findall(r'(?<![\w.])' + re.escape(name) + r'\s*=\s*([^\s;]+)', text, re.I)
        return found[0].strip('"').lower() if len(found) == 1 else ''
    dmarc = methods.get('dmarc', [])
    if len(dmarc) != 1 or dmarc[0][0] != 'pass' or prop(dmarc[0][1], 'header.from') != sender_domain:
        return False
    # Conservative exact domain alignment; unusual forwarding/subdomain cases scan.
    for result, properties in methods.get('dkim', []):
        domain = prop(properties, 'header.d') or prop(properties, 'header.i').rsplit('@', 1)[-1]
        if result == 'pass' and domain == sender_domain:
            return True
    for result, properties in methods.get('spf', []):
        domain = prop(properties, 'smtp.mailfrom').rsplit('@', 1)[-1]
        if result == 'pass' and domain == sender_domain:
            return True
    return False


def assess_sender(message, approved):
    headers = message.get('payload', {}).get('headers', [])
    def values(name): return [h.get('value', '') for h in headers if h.get('name', '').lower() == name]
    senders, replies = values('from'), values('reply-to')
    sender = address(senders[0]) if len(senders) == 1 else None
    def decision(status, reason):
        return {'status': status, 'senderAddress': sender or '', 'reason': reason, 'aiScanned': False}
    if not sender: return decision('scan-required', 'Sender address is missing or ambiguous.')
    if sender not in approved: return decision('scan-required', 'This sender is not on your approved list.')
    if len(replies) > 1 or (replies and address(replies[0]) != sender):
        return decision('scan-required', 'Reply-to does not match the approved sender.')
    if 'SPAM' in message.get('labelIds', []):
        return decision('scan-required', 'Gmail marked this message as spam.')
    if not authentication(headers, sender.rsplit('@', 1)[1]):
        return decision('scan-required', 'Gmail authentication is missing, ambiguous, failed, or not aligned with the sender.')
    return decision('trusted', 'Exact approved address matched; Gmail reports aligned DMARC and SPF or DKIM passing. AI detection was skipped.')
