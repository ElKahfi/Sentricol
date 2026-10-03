# Short generation concurrency test

This invokes the real `Harness.generate(..., with_task=True)` with a fresh Python
process for each job, matching Dispatch's process isolation. It uses three fictional
Easy-phase internal contexts, evenly repeated at each default level. It makes real
Ollama requests and performs the production validation/retry loop. It does not use
Dispatch HTTP, authentication, Neon, catalog fallback, or create assignments.

## Run

From the repository root in an environment that can reach Ollama:

```sh
python3 -B ai-harness/benchmark.py
```

Defaults: one excluded warm-up, then 3 jobs at concurrency 1, 6 at concurrency 2,
and 12 at concurrency 4. A pool is continually refilled as jobs finish. The generation
budget is 900 seconds including warm-up; each job has a 300-second wall limit and
up to two model attempts. Metadata probes and worker cleanup add a few seconds.
Any failed/cancelled job stops escalation after the current round. A failed warm-up
stops the test. Increasing latency alone does not automatically stop escalation.

```sh
python3 -B ai-harness/benchmark.py --budget-seconds 1200
# Optional later run, after reviewing the concurrency-4 results:
python3 -B ai-harness/benchmark.py --levels 1,2,4,8 --budget-seconds 1200
```

No packages are required beyond Python 3.10+. `OLLAMA_HOST` and `SENTRI_MODEL` use
normal harness configuration. Reports go to ignored `ai-harness/scratchpad/benchmarks/`.
Use `--output-dir` to choose another location. Exit 0 means all requested rounds
finished successfully; exit 1 means warm-up failure, generation failure, budget
exhaustion, or interruption. Partial completed rounds remain in the JSON report.
Ctrl+C terminates active local workers; the interrupted round is not retained.
Closing a client does not guarantee Ollama immediately stops work already queued.
Allow pending work to drain before repeating a test.

## EC2 / Docker / Coolify

The deployed image must contain this new script. After deploying the updated image,
run inside Dispatch's container, which already has the correct model environment
and private Ollama network access. Do not expose Ollama publicly for this test.

In Coolify, open the **Dispatch container terminal** and run:

```sh
python3 -B /app/ai-harness/benchmark.py --output-dir /tmp/sentri-benchmark
```

For the manual Compose stack, from its repository root on EC2:

```sh
sudo docker compose exec -T dispatch python3 -B /app/ai-harness/benchmark.py --output-dir /tmp/sentri-benchmark
```

Before running, record the deployed Git revision and effective Ollama parallelism,
queue, and context settings from the deployment configuration. The report captures
Ollama version, available model digests/details, and model residency before and after
warm-up when the API permits it; it cannot discover every server environment setting.
Avoid unrelated inference during the baseline, or explicitly record that traffic.

In a separate EC2 terminal, capture GPU metrics during the run:

```sh
nvidia-smi --query-gpu=timestamp,utilization.gpu,memory.used,memory.total --format=csv -l 2 > /tmp/sentri-benchmark-gpu.csv
```

Use `sudo docker stats` in another terminal for container CPU/memory. Stop the GPU
capture with Ctrl+C after the benchmark. Resource sampling is separate from the
benchmark report. Copy reports out before replacing the container, for example:

```sh
sudo docker ps --format '{{.ID}} {{.Names}}'
# Substitute the actual Dispatch container ID:
sudo docker cp CONTAINER_ID:/tmp/sentri-benchmark ./sentri-benchmark-results
```

## Reading results

Compare valid tasks/minute, median and slowest successful job wall time, first-attempt
passes, observed retries, and failed/cancelled counts. Per-job records distinguish
validation/network failure, worker timeout/crash, and overall budget cancellation.
Retry metrics are marked incomplete when a worker is killed before reporting.
Throughput includes the entire measured round, including failed jobs and shutdown.
Successful latency includes Python startup; model-call time alone is not isolated.

No generated content, prompts, profiles, or raw error messages are stored. Exception
classes identify failure categories without leaking model responses. The default
samples are exploratory: do not interpret them as reliable p95 or long-term capacity.
A passing task satisfies programmatic gates, not a human quality review. Select a
candidate concurrency only after comparing its timings with your acceptable user
wait time; then verify it separately through the authenticated application.

## Offline checks

```sh
python3 -B -m unittest discover -s ai-harness/tests -v
```

The benchmark tests use synthetic workers to check actual overlap, pool bounds,
wall-time cancellation, crash handling, and metrics. They make no model requests.
