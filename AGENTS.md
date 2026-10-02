# Project instructions

- Active workspace: `/Users/elkahfi/Desktop/Sentricol/SENTRI-fresh`. Make all
  future SENTRI implementation and deployment changes here unless the user
  explicitly selects another copy. The sibling `SENTRI` folder is a legacy backup.
- Keep relevant folder documentation, root README and the ARCHITECTURE.md, CHANGELOG.md, and DECISIONS.md files in `MD's Logs/`
  current when changing behavior, deployment setup, or architecture.
- Deployment context: EC2 g5.xlarge, Neon PostgreSQL, Ollama with Qwen 3.0.
  Confirmed model tag: `huihui_ai/qwen3-abliterated:latest`; do not infer size/quantization.
- The Docker setup is a private pilot. Preserve Protocol's loopback access policy
  unless intentionally implementing and testing a public deployment change.
- Never commit secrets or copy legacy generated artifacts into this workspace.
