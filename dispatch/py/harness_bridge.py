#!/usr/bin/env python3
"""Small stdin/stdout adapter between Dispatch and the shared AI harness."""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'ai-harness'))
from runtime.harness import Harness  # noqa: E402


def emit(value):
    print(json.dumps(value, ensure_ascii=False), flush=True)


def main():
    request = json.load(sys.stdin)
    harness = Harness()
    if request['operation'] == 'chat':
        messages = request['messages']
        result = harness.chat(request['profile'], messages[-1]['content'],
                              history=messages[:-1])
        # Validation completes before any answer is shown to the learner.
        answer = result['answer']
        for offset in range(0, len(answer), 24):
            emit({'type': 'token', 'text': answer[offset:offset + 24]})
            time.sleep(0.015)
        emit({'type': 'done'})
    elif request['operation'] == 'generate':
        emit(harness.generate(request['profile'], with_task=True))
    else:
        raise ValueError('Unsupported harness operation')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, RuntimeError, OSError, TimeoutError, KeyError, TypeError) as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
