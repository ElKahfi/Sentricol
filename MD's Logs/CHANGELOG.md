# Changelog

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
