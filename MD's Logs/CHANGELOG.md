# Changelog

## 2026-10-03 — Combine upstream features with EC2/security work

- Integrated feature changes through `6060978` into the existing Fresh workspace.
- Added company dashboard, account verification, risk reporting and encrypted retry queue.
- Added AI course evidence, per-user pools, review and local progression controls.
- Preserved origin checks, mailbox allowlist, secure cookies, OAuth state/PKCE,
  EC2/Coolify files and harness benchmarks; made local demo login opt-in.
- Wired service connection settings and persistent outbox storage into Compose.
- Added integration regression tests and documented migration/runtime prerequisites.
- No live migrations, deployment, secrets edits, commits or pushes performed.

## 2026-10-03 — Protocol public HTTPS adaptation

- Added an exact HTTPS origin policy with preserved loopback development support.
- Required an explicit Google mailbox allowlist for public login/session use;
  kept OAuth state, PKCE, secure cookies, and server-memory token isolation.
- Restricted public model status to authenticated sessions; bounded pending-flow
  exhaustion returns 429. Rejected-account tokens are revoked best-effort.
- Added required Coolify runtime variables and documented DNS/Google callback
  setup. Live public rollout is pending; no token persistence was introduced.

## 2026-10-03 — Authentication diagnostics and proxy cookies

- Reproduced public registration origin rejection and Dispatch's misleading login error.
- Distinguished request errors, enforced Secure production Dispatch cookies, and
  added Deployment origin configuration validation and registration error scrolling.
- Extended read-only schema checks and made the additive migration runner work
  with container environment variables. No production migration/data changes.
- Added regression tests: 14 Deployment and 7 focused Dispatch tests pass;
  both TypeScript checks pass. Documented exact origin corrections and rollout.

## 2026-10-03 — Coolify operations and stable addressing

- Recorded the connected GitHub source, selected main branch and Compose path,
  and user-confirmed Elastic IP association/DuckDNS update and token rotation.
- Added `docker/COOLIFY.md` covering first deployment, origins, persistent model
  storage, cutover, rollback, stop/start recovery, and GitHub automatic updates.
- Clarified that a stopped EC2 cannot serve its domain, startup reuses existing
  images, and automatic deployments require configured webhooks and Auto Deploy.
- Distinguished confirmed setup from pending deployment/inference/recovery tests.
- Removed stale current-state merge-conflict claims and clarified that Protocol
  has no host port in the Coolify stack, so its old tunnel needs additional setup.
- Documentation only; no live deployment or automatic deployment setting changed.

## 2026-10-02 — Initial preparation

- Established `SENTRI-fresh` as the active workspace for all future work.
- Transferred the Docker starter from the legacy copy: shared app Dockerfile,
  Compose services, NVIDIA GPU overlay, build exclusions, environment template,
  and EC2 operating guide. No secrets or generated benchmark artifacts copied.
- Kept PostgreSQL on Neon and Protocol behind its existing loopback policy.
- Corrected deployment documentation to Qwen 3.0; exact installed tag remains
  to be supplied. No model download or source default change was performed.
- Updated Deployment, Dispatch, Protocol, and Harness setup documentation.
- Validation: source manifests and relevant integration files match the legacy
  baseline; Compose YAML parses and dependency lockfiles match manifests.
  Docker builds, EC2 GPU inference, Neon, and OAuth end-to-end checks are pending.

- Added the current root architecture document and updated Dispatch architecture
  with the Docker/Neon/Qwen 3.0 topology; labeled its older review as historical.

## 2026-10-02 — EC2 deployment progress

- User completed Docker installation on Ubuntu 26.04.1; hello-world passed and
  Compose reports v5.5.1. NVIDIA toolkit test container detects the A10G GPU.
- All three application images built successfully on EC2. Deployment, Dispatch,
  Protocol, and Ollama report healthy container status.
- Confirmed `huihui_ai/qwen3-abliterated:latest`; downloaded it into Docker's model
  volume. Harness model status returns ready; live inference is still unverified.
- Documented how browsers receive pages/assets and API responses through the
  SSH tunnel while app servers and model processing run on EC2 and data stays on Neon.
- Browser workflows, Neon operations, Gmail OAuth/analysis, and model GPU inference
  remain pending. No public domain/HTTPS deployment has been verified.
- Updated documents in their current `MD's Logs` location and repaired related
  architecture links. Preserved the existing unfinished merge and Protocol README
  conflict; incoming local changes are not assumed to match running EC2 images.

## 2026-10-02 — Dispatch request origin behind Docker

The browser reported `Invalid request origin` before chat reached Python/Qwen.
Dispatch now uses one shared origin validator across its proxy, chat, login body,
and logout checks. Set `DISPATCH_ORIGIN` to the exact browser origin; Compose
supplies `http://localhost:3000` for the SSH pilot. Direct development without
that setting retains the request URL origin fallback. Missing or foreign origins
are rejected; forwarded headers do not establish trust. Authentication remains
required. Rebuild/recreate Dispatch with the updated Compose file to apply this
fix; local changes alone do not update the EC2 image. Live chat retesting is pending.
## 2026-10-03 — Coolify deployment definition

- Added `compose.coolify.yaml` as a single-file Coolify stack with NVIDIA GPU
  access for Ollama.
- Removed host port publishing from the managed stack so Coolify's HTTPS proxy
  can route to Deployment and Dispatch over the internal Docker network.
- Reused the existing `sentri_ollama-data` external volume and kept Protocol and
  Ollama without public routes.
- Documented required public origins, secrets, and the manual-to-Coolify cutover.

## 2026-10-03 — Generation concurrency benchmark

- Added warm-up plus 1/2/4 concurrent generation rounds, a 15-minute budget,
  timing/throughput/retry reports, failure stop rules, and EC2 instructions.
- Added offline scheduler tests for overlap, deadlines, and worker failure.
- Live EC2 benchmarking has not been run.
## 2026-10-03 — Dispatch save repair and Protocol diagnostics

- Confirmed Neon error 42703: missing `user_skill_profiles.confidence_score`; applied additive repair to locally configured shared database without resetting user history.
- Added repeatable schema repair script, temporary-table migration regression, and read-only EXPLAIN coverage of the real answer handler's SQL. All database checks pass, including company monitoring isolation tests.
- Protocol trims Google credentials and rejects incomplete client IDs with an actionable pre-OAuth response. Google-side invalid_client still requires correct runtime credentials.
- Verified existing pending admin integration, preserved uncommitted work and documented branch/redeployment steps. No source push or Coolify deployment performed.
- Validation: Deployment 21 unit tests; Dispatch 46 unit tests; Protocol 30 unit tests; three database checks pass; all three TypeScript checks pass.
