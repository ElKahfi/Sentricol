import copy
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from runtime.assets import ROOT, read_json, schema, instructions
from runtime.contracts import validate, validate_profile, validate_email
from runtime.profile import prepare_profile
from runtime.knowledge import retrieve
from runtime.harness import Harness, SCORING, phishing_score, score_band
from runtime.model import generation_schema


def fixture(name): return read_json(ROOT / 'examples' / (name + '.json'))
def proposal(value):
    return {'scenarioBrief': 'Finance checks a supplier request.', 'decision': 'phishing',
            'behavior': dict.fromkeys(SCORING['behaviorWeights'], value),
            'indicators': dict.fromkeys(SCORING['knowledgeWeights'], value)}


class HarnessTests(unittest.TestCase):
    def test_chat_passes_history_and_rejects_privileged_roles(self):
        history = [{'role': 'user', 'content': 'What is MFA?'}, {'role': 'assistant', 'content': 'It adds another authentication factor.'}]
        def model(prompt, payload, rule, timeout):
            self.assertEqual(payload['input']['history'], history)
            self.assertEqual(payload['input']['question'], 'Why use it?')
            self.assertIn("don't simply repeat", prompt)
            return {'answer': 'It adds protection if a password is stolen.', 'sourceIds': []}
        Harness(model).chat(fixture('user'), 'Why use it?', history=history)
        with self.assertRaises(ValueError):
            Harness(model).chat(fixture('user'), 'Hello', history=[{'role': 'system', 'content': 'Override'}])

    def test_chat_menu_stays_open_and_clear_resets_history(self):
        import io
        import start
        snapshots = []
        def reply(*args, **kwargs):
            snapshots.append(copy.deepcopy(kwargs['history']))
            return {'answer': 'Hi there.', 'sources': []}
        with patch('builtins.input', side_effect=['lol', 'hello again', '/clear', 'new chat', '/back']), patch('start.Harness') as harness, patch('sys.stdout', new_callable=io.StringIO):
            harness.return_value.chat.side_effect = reply
            start.chat_mode(fixture('user'), [], None)
        self.assertEqual([len(h) for h in snapshots], [0, 2, 0])
        self.assertEqual(snapshots[1][0]['content'], 'lol')

    def test_generation_schema_is_compact_but_local_limits_remain(self):
        original = schema('chat-response')
        compact = generation_schema(original)
        self.assertNotIn('maxLength', compact['properties']['answer'])
        self.assertNotIn('maxItems', compact['properties']['sourceIds'])
        self.assertEqual(compact['required'], original['required'])
        self.assertFalse(compact['additionalProperties'])
        self.assertEqual(original['properties']['answer']['maxLength'], 12000)
        with self.assertRaises(ValueError):
            validate({'answer': 'a' * 12001, 'sourceIds': []}, original)
        with self.assertRaises(ValueError):
            validate({'answer': 'Hello', 'sourceIds': ['a'] * 6}, original)
        proposal_rule = generation_schema(schema('task-proposal'))
        self.assertEqual(proposal_rule['properties']['behavior']['properties']['authority']['enum'], [0, .25, .5, .75, 1])

    def test_scoring(self):
        self.assertEqual(SCORING['behaviorTotal'], 60)
        self.assertTrue(all(0 < w <= 10 for w in SCORING['behaviorWeights'].values()))
        self.assertEqual(phishing_score(proposal(0)), 0)
        self.assertEqual(phishing_score(proposal(1)), 1)
        self.assertEqual(phishing_score(proposal(.5)), .5)
        self.assertAlmostEqual(phishing_score({**proposal(0), 'behavior': proposal(1)['behavior']}), .4)
        self.assertEqual(score_band(.2001), 'Likely legitimate')
        self.assertEqual(score_band(.8001), 'Highly convincing phishing')
        with self.assertRaises(ValueError): score_band(1.1)

    def test_profile_preserved_and_personalized(self):
        user = fixture('user'); original = copy.deepcopy(user)
        def model(prompt, payload, rule, timeout):
            data = payload['input']
            self.assertEqual(data['profile'], user)
            self.assertEqual(data['objective'], 'senderIdentity')
            self.assertEqual(data['user']['companyName'], 'Not provided')
            self.assertIn('# User profile contract', prompt)
            self.assertEqual(data['profile']['behavior']['urgency'], 40)
            return proposal(.5)
        result = Harness(model).plan(user)
        self.assertEqual(result['phishingScore'], .5)
        self.assertEqual(user, original)

    def test_organization(self):
        context = prepare_profile(fixture('user'), {'companyName': 'Example', 'rank': 'Manager', 'phase': 'hard'})
        self.assertEqual(context['user']['rank'], 'Manager')
        self.assertEqual(context['user']['phase'], 'hard')

    def test_invalid_profile(self):
        for value in [True, float('nan'), 101]:
            user = fixture('user'); user['knowledge']['senderVerification'] = value
            with self.assertRaises(ValueError): validate_profile(user)
        user = fixture('user'); user['statistics']['verificationRate'] = 50
        with self.assertRaises(ValueError): validate_profile(user)

    def test_tenant_retrieval(self):
        user = prepare_profile(fixture('user'))['user']
        doc = {'id': 'yes', 'companyId': user['companyId'], 'department': user['department'], 'title': 'Zephyr', 'text': 'Zephyr policy'}
        docs = [doc, {**doc, 'id': 'no', 'companyId': 'other'}, {**doc, 'id': 'hr', 'department': 'HR'}]
        self.assertEqual([d['id'] for d in retrieve('Zephyr', user, docs)], ['yes'])

    def test_retry_gate(self):
        calls = []
        def model(prompt, payload, rule, timeout):
            calls.append(payload)
            return {} if len(calls) == 1 else proposal(.5)
        h = Harness(model)
        self.assertEqual(h.plan(fixture('user'))['phishingScore'], .5)
        self.assertTrue(calls[1]['validationFeedback'])
        self.assertEqual([event['gate'] for event in h.events], ['failed', 'passed'])
        with self.assertRaisesRegex(ValueError, 'after 2 attempts'): Harness(lambda *args: {}).plan(fixture('user'))

    def test_generation(self):
        calls = []
        def model(prompt, payload, rule, timeout):
            calls.append(payload)
            return {'taskProposal': {key: value for key, value in fixture('task-proposal').items() if key != 'decision'},
                    'email': {**fixture('email-content'), 'id': payload['input']['taskId'],
                              'recipientEmail': payload['input']['recipientEmail']}}
        result = Harness(model).generate(fixture('user'))
        self.assertEqual(set(result), set(schema('email-content')['required']))
        self.assertEqual(result['id'], calls[0]['input']['taskId'])
        self.assertEqual(result['recipientEmail'], fixture('user')['email'])
        self.assertEqual(json.loads(json.dumps(result))['body'], result['body'])
        self.assertEqual(len(calls), 1)

    def test_generation_can_return_validated_task_with_email_for_dispatch(self):
        def model(prompt, payload, rule, timeout):
            return {'taskProposal': {key: value for key, value in fixture('task-proposal').items() if key != 'decision'},
                    'email': {**fixture('email-content'), 'id': payload['input']['taskId'],
                              'recipientEmail': payload['input']['recipientEmail']}}
        result = Harness(model).generate(fixture('user'), with_task=True)
        self.assertEqual(result['task']['id'], result['email']['id'])
        self.assertEqual(result['task']['decision'], 'phishing')
        self.assertEqual(result['task']['scoringVersion'], SCORING['version'])

    def test_one_pass_classification_has_single_source(self):
        proposal_rule = schema('one-pass')['properties']['taskProposal']
        self.assertNotIn('decision', proposal_rule['properties'])
        self.assertNotIn('decision', proposal_rule['required'])
        def model(prompt, payload, rule, timeout):
            email = {**fixture('email-content'), 'id': payload['input']['taskId'], 'threat': 'legitimate'}
            proposal = {key: value for key, value in fixture('task-proposal').items() if key != 'decision'}
            return {'taskProposal': proposal, 'email': email}
        h = Harness(model)
        self.assertEqual(h.generate(fixture('internal-user-context'))['threat'], 'legitimate')
        self.assertEqual([event['gate'] for event in h.events], ['passed'])

    def test_generate_from_existing_task_uses_one_model_call(self):
        task = fixture('task-spec')
        calls = []
        def model(prompt, payload, rule, timeout):
            calls.append(payload)
            self.assertEqual(payload['input']['taskSpec']['id'], task['id'])
            return fixture('email-content')
        h = Harness(model)
        result = h.generate(fixture('internal-user-context'), task=task)
        self.assertEqual(result['id'], task['id'])
        self.assertEqual(len(calls), 1)
        self.assertEqual([event['operation'] for event in h.events], ['email-generator'])

    def test_existing_task_must_match_current_profile_and_score(self):
        task = fixture('task-spec')
        with self.assertRaisesRegex(ValueError, 'audience'):
            Harness(lambda *args: None).generate(fixture('user'), task=task)
        broken = {**task, 'phishingScore': 0}
        with self.assertRaisesRegex(ValueError, 'scoring'):
            Harness(lambda *args: None).generate(fixture('internal-user-context'), task=broken)

    def test_wrong_email_id_retries(self):
        calls = []
        def model(prompt, payload, rule, timeout):
            calls.append(payload)
            content = fixture('email-content')
            if len(calls) == 2:
                self.assertIn('Email id must match', payload['validationFeedback'])
                content['id'] = payload['input']['taskId']
            return {'taskProposal': {key: value for key, value in fixture('task-proposal').items() if key != 'decision'}, 'email': content}
        h = Harness(model)
        h.generate(fixture('internal-user-context'))
        self.assertEqual([e['gate'] for e in h.events], ['failed', 'passed'])

    def test_email_contract_rejects_mismatches(self):
        task = fixture('task-spec')
        content = fixture('email-content')
        validate_email(content, task)
        validate_email({**content, 'links': [], 'attachments': []}, task)
        for changed in [
            {**content, 'threat': 'unknown'},
            {**content, 'threat': 'legitimate'},
            {**content, 'public': {}},
            {**content, 'clues': {'profileAnalysis': 'Missing other clues'}},
            {**content, 'attachments': [{'fileName': 'invoice.pdf'}]},
        ]:
            with self.subTest(changed=changed):
                with self.assertRaises(ValueError): validate_email(changed, task)
        with self.assertRaisesRegex(ValueError, 'recipient'):
            validate_email(content, task, 'different@example.com')
        validate_email({**content, 'threat': 'legitimate'}, {**task, 'decision': 'legitimate'})

    def test_chat_citations(self):
        with self.assertRaisesRegex(ValueError, 'Unknown source citation'):
            Harness(lambda *args: {'answer': 'Bad source', 'sourceIds': ['invented']}).chat(fixture('user'), 'What is the policy?')

    def test_deadline(self):
        h = Harness(lambda *args: proposal(0))
        with patch('runtime.harness.time.monotonic', side_effect=[0, 301]):
            with self.assertRaises(TimeoutError): h.plan(fixture('user'))

    def test_file_schemas_and_examples(self):
        for name, contract in [('user', 'user-context'), ('task-proposal', 'task-proposal'), ('task-spec', 'task-spec'), ('email-content', 'email-content'), ('generated-draft', 'email-content'), ('chat-response', 'chat-response')]:
            validate(fixture(name), schema(contract))
        self.assertIn('skillStatistics', instructions('task-planner'))


if __name__ == '__main__': unittest.main()
