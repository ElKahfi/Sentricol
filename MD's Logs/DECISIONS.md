# Technical decisions

## 2026-10-03 — Use Fresh as the integration base

The branches share `52a2350` but diverge: Fresh has seven unique commits and
new-pull has five. New-pull is newer by date and feature coverage; Fresh retains
the deployment setup and security fixes. Integrate the feature delta into Fresh
using the common ancestor, preserving both security layers. The user explicitly
selected Fresh as the destination; new-pull remains unchanged.

The development demo login now requires `DISPATCH_LOCAL_ADMIN_TOOLS=true` and
development mode. Regular production training stays enabled; do not enable the
four-stage course globally until production review is implemented. Keep service
secrets empty in templates and require operator configuration for Gmail access.
Use a persistent, private Protocol outbox volume with one server process.

## 2026-10-03 — Publish Protocol through HTTPS with selected accounts

The user requested public Protocol access. This supersedes the earlier decision
to keep Protocol loopback-only. Use exact configured HTTPS origin/Host checks
behind Coolify and require PROTOCOL_ALLOWED_EMAILS against Google's mailbox
identity. Keep one process with memory-only, short-lived Gmail sessions; users
reconnect after restart. Do not persist refresh tokens or share mailbox sessions.
Ollama remains private. DNS/Google setup and live OAuth verification are pending.

## 2026-10-03 — Fail closed with actionable authentication errors

Keep exact configured browser-origin checks behind Coolify; do not trust arbitrary
forwarded headers or guess a scheme for malformed configuration. Distinguish
request parsing/origin rejection from credential failure. Set Secure production
cookies independently of the internal HTTP proxy hop. Check schema read-only
before proposing migrations and preserve the admin/player account separation.
See [authentication evidence and rollout](../docker/AUTH-TROUBLESHOOTING.md).

## 2026-10-03 — Stable addressing and deployment lifecycle

The user associated an Elastic IP with EC2 and updated DuckDNS. Keep this
address associated across stop/start cycles. Reserve `sentricol.duckdns.org`
for the Coolify dashboard and use separate names for the public applications;
those application names are not yet confirmed.

Stopping EC2 intentionally makes all hosted services unavailable. Resume the
existing successful deployment through Docker's restart policy after boot;
rebuild only when publishing changes or repairing deployment. Persistent model
data stays in the external volume and PostgreSQL stays in Neon.

Use `ElKahfi/Sentricol:main` as Coolify's deployment source. Automatic updates
remain conditional on Auto Deploy and verified webhook delivery. After pushes
missed while EC2 was stopped, manually deploy and verify the latest commit.
Do not equate connected GitHub access with a tested deployment pipeline.

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

## 2026-10-02 — Dispatch request origin behind Docker

The browser reported `Invalid request origin` before chat reached Python/Qwen.
Dispatch now uses one shared origin validator across its proxy, chat, login body,
and logout checks. Set `DISPATCH_ORIGIN` to the exact browser origin; Compose
supplies `http://localhost:3000` for the SSH pilot. Direct development without
that setting retains the request URL origin fallback. Missing or foreign origins
are rejected; forwarded headers do not establish trust. Authentication remains
required. Rebuild/recreate Dispatch with the updated Compose file to apply this
fix; local changes alone do not update the EC2 image. Live chat retesting is pending.
## 2026-10-03 — Manage the EC2 stack with Coolify

Use one repository-backed Coolify Compose resource for Deployment, Dispatch,
Protocol, Ollama, and the harness files included in the application images.
Expose only Deployment and Dispatch through separate HTTPS domains. Keep
Protocol private because its Gmail OAuth flow is intentionally bound to
`127.0.0.1`, and keep Ollama private because only SENTRI services need its API.
Reuse the external `sentri_ollama-data` volume to avoid downloading the Qwen 3.0
model again. Stop the manually managed stack immediately before the first
Coolify deployment to give Coolify sole control of the GPU workload.

## 2026-10-03 — Use a short direct-harness capacity probe

Use standard-library process workers and fictional internal profiles to measure
validated generation without database writes or catalog fallbacks. Keep endurance
and authenticated HTTP testing outside this time-limited first benchmark. Small
samples report median/slowest timing, not p95 or proven sustained capacity.
## 2026-10-03 — Repair schema without reseeding

Use a narrow additive migration for the absent confidence column rather than rerunning the seed or dropping training tables. Preserve the single answer transaction: partial success would misreport saved progress. Validate SQL against PostgreSQL through read-only EXPLAIN and temporary-table tests instead of modifying real accounts for tests.

Keep the already integrated employee dashboard in SENTRI-fresh; do not overwrite it with an entire sibling checkout. Publication requires a reviewed commit on the actual Coolify branch. Reject malformed Google client configuration early, but do not bypass OAuth or company-account protections to work around Google's invalid_client error.
