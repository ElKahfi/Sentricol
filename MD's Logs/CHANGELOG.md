# Changelog

## 2026-10-02

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
