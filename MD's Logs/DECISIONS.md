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
remain separate deployment steps. Docker files are prepared but not yet built
or tested on EC2; no infrastructure was changed.

## 2026-10-02 — Correct model family to Qwen 3.0

The user corrected Qwen 3.5 to Qwen 3.0. Use runtime SENTRI_MODEL configuration
with the exact installed Ollama tag; family name alone does not identify size
or quantization. Leave the template value empty instead of guessing a tag.

## 2026-10-02 — Separate current topology from the historical Dispatch review

Use root ARCHITECTURE.md for the current system deployment topology and readiness.
Keep the older Dispatch review explicitly dated and historical rather than
presenting its CLI-only AI and identity findings as newly verified behavior.
Update architecture, changelog, and decisions together for future topology changes.
