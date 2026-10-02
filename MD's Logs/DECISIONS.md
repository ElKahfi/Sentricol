# Technical decisions

## 2026-10-02 — Use SENTRI-fresh as the active workspace

The user explicitly selected `/Users/elkahfi/Desktop/Sentricol/SENTRI-fresh`
for this and all future work. The sibling `SENTRI` copy stays a legacy backup.
Transfer only the Docker changes from this task, leaving unrelated work intact.
Record the preference in AGENTS.md in both copies so opening the old workspace
still directs future implementation to the active one.

## 2026-10-02 — Single-host Docker pilot with external Neon

Use Compose for Deployment, Dispatch, Protocol, and Ollama on the existing
g5.xlarge. Include Harness assets beside apps to preserve current subprocess
and scoring-file dependencies. Keep PostgreSQL on Neon. Enable GPU access with
the NVIDIA overlay and keep model files in a persistent Docker volume.

Protocol remains loopback-only and is accessed through an SSH tunnel during
validation. Public HTTPS hosting and a deliberate Protocol access/session design
remain separate deployment steps. At initial preparation the Docker files were unbuilt; subsequent EC2 build and
container startup evidence is recorded in the deployment update below.

## 2026-10-02 — Correct model family to Qwen 3.0

The user corrected Qwen 3.5 to Qwen 3.0. Use runtime SENTRI_MODEL configuration
with the exact installed Ollama tag; family name alone does not identify size
or quantization. Leave the template value empty instead of guessing a tag.

## 2026-10-02 — Separate current topology from the historical Dispatch review

Use `MD's Logs/ARCHITECTURE.md` for the current system deployment topology and readiness.
Keep the older Dispatch review explicitly dated and historical rather than
presenting its CLI-only AI and identity findings as newly verified behavior.
Update architecture, changelog, and decisions together for future topology changes.

## 2026-10-02 — Keep initial EC2 deployment private

Retain loopback-bound app ports and SSH forwarding for private browser testing.
The browser renders delivered web assets and calls APIs; the tunnel transports
HTTP to EC2 and does not execute the application server on the Mac. Neon remains
external. Public domains, TLS proxying, and Protocol access-policy changes require
separate implementation and verification.

The user demonstrated successful image builds, healthy containers, and container
GPU visibility. The confirmed model tag is `huihui_ai/qwen3-abliterated:latest`,
now downloaded in Docker storage. Record model availability separately from actual
inference, database, or OAuth verification. Do not assume unfinished local merge
changes have reached the running deployment.
