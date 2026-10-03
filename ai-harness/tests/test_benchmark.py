import sys
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from benchmark import run_round


def successful_worker(connection, job, timeout):
    start = time.monotonic()
    time.sleep(.15)
    connection.send({'job': job, 'status': 'passed', 'started': start,
                     'ended': time.monotonic(), 'model_calls': 2, 'retries': 1})
    connection.close()


def stalled_worker(connection, job, timeout):
    time.sleep(30)


def crashed_worker(connection, job, timeout):
    connection.close()


class BenchmarkTests(unittest.TestCase):
    def test_concurrency_is_bounded_and_results_counted(self):
        result = run_round(2, 6, time.monotonic() + 10, 5, successful_worker)
        self.assertEqual(result['passed'], 6)
        self.assertEqual(result['launched'], 6)
        events = sorted([(r['started'], 1) for r in result['results']] +
                        [(r['ended'], -1) for r in result['results']])
        running = peak = 0
        for _, delta in events:
            running += delta
            peak = max(peak, running)
        self.assertEqual(peak, 2)
        self.assertGreater(result['valid_tasks_per_minute'], 0)
        self.assertEqual(sum(r['retries'] for r in result['results']), 6)

    def test_budget_cancels_workers_and_does_not_launch_more(self):
        start = time.monotonic()
        result = run_round(2, 6, start + .4, 10, stalled_worker)
        self.assertLess(time.monotonic() - start, 3)
        self.assertEqual(result['launched'], 2)
        self.assertTrue(all(r['status'] == 'budget_cancelled' for r in result['results']))
        self.assertIsNone(result['median_success_seconds'])

    def test_timeout_and_crash_are_not_successes(self):
        result = run_round(1, 1, time.monotonic() + 5, .3, stalled_worker)
        self.assertEqual(result['results'][0]['status'], 'timeout')
        result = run_round(1, 1, time.monotonic() + 5, 3, crashed_worker)
        self.assertEqual(result['results'][0]['status'], 'worker_failed')

    def test_expired_budget_starts_no_jobs(self):
        result = run_round(2, 6, time.monotonic() - 1, 1, successful_worker)
        self.assertEqual(result['launched'], 0)


if __name__ == '__main__':
    unittest.main()
