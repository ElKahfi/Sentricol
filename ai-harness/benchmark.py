#!/usr/bin/env python3
"""Short, database-free concurrency benchmark of the production generation harness."""
import argparse
import json
import math
import multiprocessing as mp
import os
from pathlib import Path
import statistics
import time
import urllib.request
from datetime import datetime, timezone

from runtime.harness import Harness
from runtime.model import ollama

ROOT = Path(__file__).resolve().parent


def generate_job(connection, job, timeout):
    started = time.monotonic()
    calls = 0
    def measured_model(*args, **kwargs):
        nonlocal calls
        calls += 1
        return ollama(*args, **kwargs)
    harness = Harness(model=measured_model, timeout=timeout)
    result = {'job': job, 'status': 'failed'}
    try:
        profile = json.loads((ROOT / 'examples/internal-user-context.json').read_text())
        # Same fixture mix at every level; separate harness instance per request.
        profile['userCode'] = f'benchmark-{job}'
        profile['department'], profile['position'] = [
            ('Finance', 'Financial Analyst'), ('Operations', 'Coordinator'),
            ('Human Resources', 'Specialist')][job % 3]
        harness.generate(profile, with_task=True)
        result['status'] = 'passed'
    except Exception as error:
        # Error messages can contain model content; persist only the exception class.
        result['error_type'] = type(error).__name__
    finally:
        result.update(seconds=time.monotonic() - started, model_calls=calls,
                      retries=max(0, calls - 1),
                      validation_failures=sum(e['gate'] == 'failed' for e in harness.events))
        connection.send(result)
        connection.close()


def run_round(concurrency, jobs, deadline, timeout, worker=generate_job):
    """Keep a bounded pool busy; enforce wall deadlines even on stalled network reads."""
    context = mp.get_context('spawn')
    started = time.monotonic()
    active, results = [], []
    launched = 0
    try:
        while active or (launched < jobs and time.monotonic() < deadline):
            while len(active) < concurrency and launched < jobs and time.monotonic() < deadline:
                receiver, sender = context.Pipe(duplex=False)
                process = context.Process(target=worker, args=(sender, launched, timeout))
                process.start()
                sender.close()
                active.append((process, receiver, launched, time.monotonic()))
                launched += 1
            for item in active[:]:
                process, receiver, job, job_start = item
                now = time.monotonic()
                result = None
                if receiver.poll():
                    try:
                        result = receiver.recv()
                    except EOFError:
                        result = {'job': job, 'status': 'worker_failed'}
                elif now >= deadline or now - job_start >= timeout:
                    result = {'job': job, 'status': 'budget_cancelled' if now >= deadline else 'timeout'}
                elif not process.is_alive():
                    result = {'job': job, 'status': 'worker_failed'}
                if result is not None:
                    result['wall_seconds'] = now - job_start
                    results.append(result)
                    if process.is_alive():
                        process.terminate()
                    process.join(timeout=1)
                    if process.is_alive():
                        process.kill()
                        process.join()
                    receiver.close()
                    active.remove(item)
            if active:
                time.sleep(.02)
    finally:
        for process, receiver, _, _ in active:
            if process.is_alive():
                process.terminate()
            process.join(timeout=1)
            if process.is_alive():
                process.kill()
                process.join()
            receiver.close()
    elapsed = time.monotonic() - started
    successful = [r['wall_seconds'] for r in results if r['status'] == 'passed']
    return {'concurrency': concurrency, 'planned': jobs, 'launched': launched,
            'completed': len(results), 'passed': len(successful),
            'failed_or_cancelled': len(results) - len(successful),
            'first_attempt_passes': sum(r['status'] == 'passed' and r.get('model_calls') == 1 for r in results),
            'observed_retries': sum(r.get('retries', 0) for r in results),
            'retry_metrics_incomplete': any('retries' not in r for r in results),
            'elapsed_seconds': elapsed, 'valid_tasks_per_minute': len(successful) * 60 / elapsed,
            'median_success_seconds': statistics.median(successful) if successful else None,
            'slowest_success_seconds': max(successful) if successful else None,
            'results': sorted(results, key=lambda r: r['job'])}


def metadata():
    host = os.environ.get('OLLAMA_HOST', 'http://127.0.0.1:11434').rstrip('/')
    if '://' not in host:
        host = 'http://' + host
    result = {'model': os.environ.get('SENTRI_MODEL', 'huihui_ai/qwen3-abliterated:latest')}
    for endpoint in ('version', 'tags', 'ps'):
        try:
            with urllib.request.urlopen(host + '/api/' + endpoint, timeout=2) as response:
                result[endpoint] = json.load(response)
        except Exception as error:
            result[endpoint] = {'unavailable': type(error).__name__}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--levels', default='1,2,4', help='Optional: 1,2,4,8')
    parser.add_argument('--jobs-per-slot', type=int, default=3)
    parser.add_argument('--budget-seconds', type=float, default=900)
    parser.add_argument('--timeout', type=float, default=300, help='Per-job wall limit, including process startup')
    parser.add_argument('--output-dir', type=Path, default=ROOT / 'scratchpad/benchmarks')
    args = parser.parse_args()
    try:
        levels = [int(x) for x in args.levels.split(',')]
        if not levels or levels != sorted(set(levels)) or min(levels) < 1 or max(levels) > 32:
            raise ValueError()
        if args.jobs_per_slot < 1 or not math.isfinite(args.budget_seconds) or args.budget_seconds <= 0:
            raise ValueError()
        if not math.isfinite(args.timeout) or not 0 < args.timeout <= 1800:
            raise ValueError()
    except ValueError:
        parser.error('Use increasing unique levels 1–32, positive budget/jobs, and timeout 0–1800 seconds.')
    args.output_dir.mkdir(parents=True, exist_ok=True)
    output = args.output_dir / (datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '.json')
    report = {'started_utc': datetime.now(timezone.utc).isoformat(), 'settings': {
        'levels': levels, 'jobs_per_slot': args.jobs_per_slot,
        'budget_seconds': args.budget_seconds, 'timeout_seconds': args.timeout,
        'attempts': 2}, 'environment': metadata(), 'rounds': [], 'stop_reason': None}
    def save():
        temporary = output.with_suffix('.tmp')
        temporary.write_text(json.dumps(report, indent=2) + '\n')
        temporary.replace(output)
    deadline = time.monotonic() + args.budget_seconds
    print(f'Report: {output}', flush=True)
    try:
        print('Warm-up: one generation (excluded from measured rounds)', flush=True)
        report['warmup'] = run_round(1, 1, deadline, args.timeout)
        report['environment_after_warmup'] = metadata()
        save()
        if report['warmup']['passed'] != 1:
            report['stop_reason'] = 'warmup_failed'
        else:
            for level in levels:
                if time.monotonic() >= deadline:
                    report['stop_reason'] = 'budget_exhausted'
                    break
                print(f'Running {level} simultaneous requests, {level * args.jobs_per_slot} total', flush=True)
                summary = run_round(level, level * args.jobs_per_slot, deadline, args.timeout)
                report['rounds'].append(summary)
                print(f"  {summary['passed']}/{summary['planned']} valid; "
                      f"{summary['valid_tasks_per_minute']:.2f} valid tasks/min; "
                      f"median={summary['median_success_seconds']}, slowest={summary['slowest_success_seconds']} seconds", flush=True)
                save()
                if summary['passed'] != summary['planned']:
                    report['stop_reason'] = 'budget_exhausted' if time.monotonic() >= deadline else 'generation_failure'
                    break
            else:
                report['stop_reason'] = 'completed'
    except KeyboardInterrupt:
        report['stop_reason'] = 'interrupted'
    finally:
        report['finished_utc'] = datetime.now(timezone.utc).isoformat()
        save()
    print(f"Stopped: {report['stop_reason']}. Results: {output}", flush=True)
    return 0 if report['stop_reason'] == 'completed' else 1


if __name__ == '__main__':
    raise SystemExit(main())
