# SENTRI

Integration status (2026-10-03): this workspace combines the EC2/security branch
with upstream company monitoring and AI course features through `6060978`.
See [repository comparison and rollout requirements](docs/REPOSITORY-COMPARISON.md).
Protocol now requires a Deployment account connection as well as the public
mailbox allowlist. Configure `DEPLOYMENT_URL` and `PROTOCOL_DEPLOYMENT_SECRET`
before Gmail sign-in. Local demo controls require explicit opt-in; regular
training remains the production default.

For the public login/registration investigation and rollout instructions, see
[authentication troubleshooting](docker/AUTH-TROUBLESHOOTING.md).

Three independent applications and one shared AI harness:

```text
sentri/
├── deployment/       # Company registration, administration, and employees
├── dispatch/         # Employee cybersecurity training
├── protocol/         # Email phishing analysis
└── ai-harness/       # Shared Python model client, instructions, and validation
```

Run each app from its folder with `pnpm install` and `pnpm dev`:

| App | Local address | Documentation |
| --- | --- | --- |
| Deployment | http://localhost:3002 | [Deployment setup](deployment/README.md) |
| Dispatch | http://localhost:3000 | Employee training; settings in `dispatch/.env.local` |
| Protocol | http://127.0.0.1:3003 | [Protocol setup](protocol/README.md) |

For the planned EC2 Coolify deployment, use `compose.coolify.yaml`. Coolify publishes
Deployment, Dispatch and Protocol through separate HTTPS domains. Protocol now
requires its own configured HTTPS origin and allowed Google email addresses;
see [Protocol public setup](protocol/README.md). Ollama remains private.

Protocol connects a real Gmail account through Google OAuth. Python calls the Gmail API;
selected messages can be analyzed by the shared Qwen harness. Configure a Google OAuth
client before signing in. Protocol uses memory-only sessions and supports explicit HTTPS access;
see the Protocol README for setup, data flow, and deployment limitations.

The [AI harness](ai-harness/README.md) uses Python 3.10+ and the standard library. Its
model settings are in `ai-harness/.env.local`; start with the adjacent `.env.example`.
Protocol calls its dedicated email detector. Dispatch shares its training scoring JSON;
Dispatch's existing web chatbot still uses its independent `py/sentri.py` entry point.

Deployment and Dispatch use their own environment files and session secrets. Database
setup and employee account provisioning are documented in the Deployment README and
[database guide](deployment/AUTH_DATABASE_GUIDE.md). Never commit environment secrets.

## Active workspace and Docker / EC2

`/Users/elkahfi/Desktop/Sentricol/SENTRI-fresh` is the active working copy.
The sibling `SENTRI` folder is a legacy backup; make future changes here.

See [the Docker starter guide](docker/README.md) for the private single-host
EC2 setup: Deployment, Dispatch, Protocol, Harness, and Ollama on a g5.xlarge,
with PostgreSQL hosted on Neon. The selected model family is **Qwen 3.0**;
the confirmed `SENTRI_MODEL` is `huihui_ai/qwen3-abliterated:latest`.
User-provided EC2 output confirms all four containers healthy. Browser, database,
and live AI workflows still need end-to-end testing.

As of 2026-10-03, Coolify's dashboard is configured at
https://sentricol.duckdns.org and its GitHub source is connected to
`ElKahfi/Sentricol`, branch `main`. The user has associated an Elastic IP with
EC2 and updated DuckDNS; the new numeric address is not recorded here.
Successful SENTRI deployment through Coolify and automatic deployments remain
unverified. See the [Coolify operating guide](docker/COOLIFY.md) for setup,
stop/start behavior, GitHub updates, verification, and rollback.

See [System architecture](MD%27s%20Logs/ARCHITECTURE.md), [Changelog](MD%27s%20Logs/CHANGELOG.md), and
[Technical decisions](MD%27s%20Logs/DECISIONS.md) for the current topology and recorded changes.

## AI generation concurrency test

The [short harness benchmark](ai-harness/BENCHMARK.md) measures valid task generation
at concurrency 1, 2, and 4 without database writes, with a 15-minute generation budget.
## Saving, dashboard and Google sign-in recovery (2026-10-03)

See [the recovery runbook](docs/RECOVERY-2026-10-03.md) for the confirmed Neon schema repair, source/branch deployment checks and Google OAuth setup. Active work remains in SENTRI-fresh; the existing admin dashboard integration still needs publishing to Coolify's selected Git branch.
