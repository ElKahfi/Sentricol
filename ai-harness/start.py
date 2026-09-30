"""Run this file in your editor, or use: python3 start.py."""
import json
from pathlib import Path

from runtime.assets import ROOT, read_json
from runtime.harness import Harness


def chat_mode(profile, documents, context):
    history = []
    print('\nChat is open. Type /back for the menu or /clear to start fresh.')
    while True:
        question = input('\nYou: ').strip()
        if question.lower() == '/back':
            return
        if question.lower() == '/clear':
            history.clear()
            print('Conversation cleared.')
            continue
        if not question:
            continue
        print('\nSENTRI is working…', flush=True)
        try:
            result = Harness().chat(profile, question, documents, context, history=history)
            print('\nSENTRI: ' + result['answer'])
            for source in result['sources']:
                print(f"Source: {source['title']} ({source['id']})")
            history.extend([{'role': 'user', 'content': question}, {'role': 'assistant', 'content': result['answer']}])
            history = history[-12:]
        except (ValueError, RuntimeError, OSError) as error:
            print(f'\nCould not complete the request: {error}\n')


def main():
    examples = ROOT / 'examples'
    profile_path = examples / 'user.json'
    context_path = examples / 'organization-context.json'
    knowledge_path = examples / 'profile-knowledge.json'
    planned_task = None
    print('SENTRI AI harness\nOllama must be running. Results appear here.')
    print('Starting with the example user and fictional company policy.\n')
    while True:
        print(f'Profile: {profile_path}')
        print('1  Chat\n2  Plan a personalized task\n3  Generate an email draft\n4  Change input files\n0  Exit')
        try:
            choice = input('\nChoose: ').strip().lower()
            if choice in ('0', 'exit', 'quit'):
                return
            if choice == '4':
                new_profile = input('User JSON path: ').strip()
                if not new_profile:
                    continue
                new_context = input('Organization context JSON path (Enter for none): ').strip()
                new_knowledge = input('Knowledge JSON path (Enter for none): ').strip()
                candidate = Path(new_profile).expanduser()
                organization = Path(new_context).expanduser() if new_context else None
                knowledge = Path(new_knowledge).expanduser() if new_knowledge else None
                from runtime.profile import prepare_profile
                from runtime.knowledge import retrieve
                prepared = prepare_profile(read_json(candidate), read_json(organization) if organization else None)
                retrieve('policy', prepared['user'], read_json(knowledge) if knowledge else None)
                profile_path, context_path, knowledge_path = candidate, organization, knowledge
                planned_task = None
                print('Input files updated.\n')
                continue
            if choice not in ('1', '2', '3'):
                print('Choose 1, 2, 3, 4 or 0.\n')
                continue
            profile = read_json(profile_path)
            context = read_json(context_path) if context_path else None
            documents = read_json(knowledge_path) if knowledge_path else None
            if choice == '1':
                chat_mode(profile, documents, context)
            else:
                harness = Harness()
                print('\nSENTRI is working…', flush=True)
                if choice == '2':
                    result = harness.plan(profile, documents, context)
                    planned_task = result
                else:
                    result = harness.generate(profile, documents, context, task=planned_task)
                    planned_task = None
                print(json.dumps(result, indent=2, ensure_ascii=False, allow_nan=False))
            print()
        except (EOFError, KeyboardInterrupt):
            print('\nStopped.')
            return
        except (ValueError, RuntimeError, OSError) as error:
            print(f'\nCould not complete the request: {error}\n')


if __name__ == '__main__':
    main()
