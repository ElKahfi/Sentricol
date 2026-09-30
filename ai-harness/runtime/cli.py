import argparse
import json
from pathlib import Path
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from .assets import ROOT, read_json, schema
from .harness import Harness, SCORING
from .profile import prepare_profile


def main():
    parser = argparse.ArgumentParser(description='SENTRI Python harness: personalized email generation and knowledge-backed chat.')
    parser.add_argument('command', choices=['config', 'schemas', 'preflight', 'gate', 'plan', 'generate', 'chat'])
    parser.add_argument('--profile', type=Path)
    parser.add_argument('--context', type=Path)
    parser.add_argument('--knowledge', type=Path)
    parser.add_argument('--question')
    parser.add_argument('--task', type=Path, help='Existing planned task JSON for generate; skips the planner model call')
    parser.add_argument('--attempts', type=int, default=2, help='Maximum fresh generation attempts per stage, 1–5')
    parser.add_argument('--timeout', type=float, default=300, help='Total generation time budget in seconds')
    parser.add_argument('--log-dir', type=Path, help='Optional metadata-only run logs; excludes profiles, prompts and responses')
    args = parser.parse_args()
    if args.task and args.command != 'generate': parser.error('--task is only valid with generate')
    harness = None
    outcome = 'failed'
    try:
        if args.command == 'config':
            result = SCORING
        elif args.command == 'schemas':
            result = {p.stem: read_json(p) for p in sorted((ROOT / 'schemas').glob('*.json'))}
        elif args.command == 'gate':
            return subprocess.call([sys.executable, '-B', '-m', 'unittest', 'discover', '-s', str(ROOT / 'tests'), '-v'], cwd=ROOT)
        else:
            if not args.profile: parser.error('--profile is required')
            profile = read_json(args.profile)
            context = read_json(args.context) if args.context else None
            docs = read_json(args.knowledge) if args.knowledge else None
            if args.command == 'preflight':
                result = prepare_profile(profile, context)
                from .knowledge import retrieve
                retrieve('policy', result['user'], docs)
                result = {'valid': True, 'contextNotes': result['contextNotes']}
            else:
                harness = Harness(attempts=args.attempts, timeout=args.timeout)
                if args.command == 'chat':
                    result = harness.chat(profile, args.question, docs, context)
                elif args.command == 'generate':
                    result = harness.generate(profile, docs, context, task=read_json(args.task) if args.task else None)
                else:
                    result = harness.plan(profile, docs, context)
        print(json.dumps(result, indent=2, ensure_ascii=False, allow_nan=False))
        outcome = 'passed'
        return 0
    except (ValueError, RuntimeError, OSError, TimeoutError) as error:
        print(str(error), file=sys.stderr)
        return 1
    finally:
        if args.log_dir and harness:
            args.log_dir.mkdir(parents=True, exist_ok=True)
            log = {'time': datetime.now(timezone.utc).isoformat(), 'command': args.command, 'outcome': outcome, 'events': harness.events}
            (args.log_dir / (str(uuid.uuid4()) + '.json')).write_text(json.dumps(log, indent=2), encoding='utf-8')
