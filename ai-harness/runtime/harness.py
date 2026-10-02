"""Fresh-context generation loop with bounded attempts, validation gates and traces."""
import math
import re
import time
import uuid
from .assets import ROOT, read_json, schema, instructions
from .contracts import validate, validate_email
from .profile import prepare_profile
from .knowledge import retrieve
from .model import ollama

VERSION = 'sentri-harness-1'
SCORING = read_json(ROOT / 'scoring.json')
SCORING['behaviorTotal'] = sum(SCORING['behaviorWeights'].values())
SCORING['knowledgeTotal'] = sum(SCORING['knowledgeWeights'].values())


def phishing_score(proposal):
    parts = []
    for field, weights, share in [('behavior', 'behaviorWeights', 'behaviorShare'), ('indicators', 'knowledgeWeights', 'knowledgeShare')]:
        catalog = SCORING[weights]
        values = proposal[field]
        if set(values) != set(catalog) or any(isinstance(v, bool) or v not in (0, .25, .5, .75, 1) for v in values.values()):
            raise ValueError('Invalid scenario intensities')
        parts.append(SCORING[share] * sum(values[tag] * weight for tag, weight in catalog.items()) / sum(catalog.values()))
    return sum(parts)


def score_band(score):
    if isinstance(score, bool) or not math.isfinite(score) or not 0 <= score <= 1: raise ValueError('PS outside 0–1')
    for boundary, label in [(.2, 'Very likely legitimate'), (.4, 'Likely legitimate'), (.6, 'Ambiguous / investigate'), (.8, 'Likely phishing'), (1, 'Highly convincing phishing')]:
        if score <= boundary: return label


def objective_for(user):
    def priority(tag):
        skill = next((s for s in user['skills'] if s['tag'] == tag and s['attempts'] > 0), None)
        return 100 - (skill['ability'] if skill else 50) - (15 if tag in user['recentObjectives'] else 0)
    return min(SCORING['knowledgeWeights'], key=lambda tag: (-priority(tag), tag))


class Harness:
    def __init__(self, model=ollama, attempts=2, timeout=300):
        if type(attempts) is not int or not 1 <= attempts <= 5: raise ValueError('Attempts must be 1–5')
        if timeout is not None and (isinstance(timeout, bool) or not isinstance(timeout, (int, float)) or not math.isfinite(timeout) or not 0 < timeout <= 1800): raise ValueError('Timeout must be None or between 0 and 1800 seconds')
        self.model, self.attempts, self.timeout = model, attempts, timeout
        self.events = []
        self.deadline = None

    def start(self):
        self.events = []
        self.deadline = None if self.timeout is None else time.monotonic() + self.timeout

    def checked(self, operation, payload, contract, extra=lambda value: None):
        feedback = ''
        rule = schema(contract)
        prompt = instructions(operation)
        for attempt in range(1, self.attempts + 1):
            remaining = None if self.deadline is None else self.deadline - time.monotonic()
            if remaining is not None and remaining <= 0: raise TimeoutError('Harness time budget exhausted')
            try:
                # Every attempt is a new request; durable inputs replace hidden session state.
                value = self.model(prompt, {'input': payload, 'validationFeedback': feedback}, rule, remaining)
                if self.deadline is not None and time.monotonic() > self.deadline: raise TimeoutError('Harness time budget exhausted')
                validate(value, rule)
                extra(value)
                self.events.append({'operation': operation, 'attempt': attempt, 'gate': 'passed'})
                return value
            except ValueError as error:
                feedback = str(error)
                self.events.append({'operation': operation, 'attempt': attempt, 'gate': 'failed', 'error': feedback})
        raise ValueError(f'Generation failed validation after {self.attempts} attempts: {feedback}')

    def _task_from_proposal(self, proposal, user, objective, task_id):
        ps = math.floor(phishing_score(proposal) * 10000 + .5) / 10000
        result = {**proposal, 'schemaVersion': VERSION, 'id': task_id, 'type': 'email', 'phase': user['phase'],
                  'audience': {key: user[key] for key in ['userCode', 'companyId', 'companyName', 'department', 'position', 'rank']},
                  'objective': objective, 'phishingScore': ps, 'scoreBand': score_band(ps), 'scoringVersion': SCORING['version']}
        validate(result, schema('task-spec'))
        return result

    def _plan(self, prepared, documents):
        user = prepared['user']
        objective = objective_for(user)
        query = re.sub(r'([A-Z])', r' \1', objective) + ' ' + user['department'] + ' ' + user['position']
        sources = retrieve(query, user, documents)
        proposal = self.checked('task-planner', {**prepared, 'objective': objective, 'sources': sources}, 'task-proposal')
        return self._task_from_proposal(proposal, user, objective, str(uuid.uuid4()))

    def plan(self, profile, documents=None, organization=None):
        self.start()
        return self._plan(prepare_profile(profile, organization), documents)

    def generate(self, profile, documents=None, organization=None, task=None, with_task=False):
        self.start()
        prepared = prepare_profile(profile, organization)
        if task is None:
            user = prepared['user']
            objective = objective_for(user)
            task_id = str(uuid.uuid4())
            query = re.sub(r'([A-Z])', r' \1', objective) + ' ' + user['department'] + ' ' + user['position']
            sources = retrieve(query, user, documents)
            recipient_email = prepared['profile']['email'] if prepared['profile'] else None
            def check_combined(value):
                decision = 'legitimate' if value['email']['threat'] == 'legitimate' else 'phishing'
                proposal = {**value['taskProposal'], 'decision': decision}
                planned = self._task_from_proposal(proposal, user, objective, task_id)
                validate_email(value['email'], planned, recipient_email)
            combined = self.checked('one-pass-generator', {
                **prepared, 'objective': objective, 'taskId': task_id,
                'recipientEmail': recipient_email, 'sources': sources
            }, 'one-pass', check_combined)
            if with_task:
                proposal = {**combined['taskProposal'], 'decision': 'legitimate' if combined['email']['threat'] == 'legitimate' else 'phishing'}
                return {'task': self._task_from_proposal(proposal, user, objective, task_id), 'email': combined['email']}
            return combined['email']
        else:
            validate(task, schema('task-spec'))
            user = prepared['user']
            if any(task['audience'][key] != user[key] for key in task['audience']):
                raise ValueError('Planned task audience differs from current user context')
            if task['phase'] != user['phase']:
                raise ValueError('Planned task phase differs from current user context')
            ps = math.floor(phishing_score(task) * 10000 + .5) / 10000
            if task['phishingScore'] != ps or task['scoreBand'] != score_band(ps) or task['scoringVersion'] != SCORING['version']:
                raise ValueError('Planned task scoring differs from current scoring configuration')
        sources = retrieve(task['scenarioBrief'], prepared['user'], documents)
        recipient_email = prepared['profile']['email'] if prepared['profile'] else None
        email = self.checked('email-generator', {
            'taskSpec': task, 'recipientEmail': recipient_email, 'sources': sources
        }, 'email-content', lambda value: validate_email(value, task, recipient_email))
        return {'task': task, 'email': email} if with_task else email

    def chat(self, profile, question, documents=None, organization=None, history=None):
        self.start()
        prepared = prepare_profile(profile, organization)
        if not isinstance(question, str) or not question.strip() or len(question) > 12000: raise ValueError('Invalid question')
        history = [] if history is None else history
        if not isinstance(history, list) or len(history) > 12:
            raise ValueError('Chat history must contain at most 12 messages')
        for message in history:
            if not isinstance(message, dict) or set(message) != {'role', 'content'} or message['role'] not in ('user', 'assistant') or not isinstance(message['content'], str) or not message['content'].strip() or len(message['content']) > 12000:
                raise ValueError('Invalid chat history message')
        user = prepared['user']
        retrieval_query = ' '.join([m['content'] for m in history[-4:] if m['role'] == 'user'] + [question])
        sources = retrieve(retrieval_query, user, documents)
        def citation_gate(reply):
            if any(key not in [s['id'] for s in sources] for key in reply['sourceIds']): raise ValueError('Unknown source citation')
        reply = self.checked('chatbot', {'user': {key: user[key] for key in ['companyName', 'department', 'position', 'rank']},
                             'contextNotes': prepared['contextNotes'], 'history': history, 'question': question, 'sources': sources}, 'chat-response', citation_gate)
        return {**reply, 'sources': [{'id': s['id'], 'title': s['title']} for s in sources if s['id'] in reply['sourceIds']]}
