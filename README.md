# SENTRI

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

Protocol connects a real Gmail account through Google OAuth. Python calls the Gmail API;
selected messages can be analyzed by the shared Qwen harness. Configure a Google OAuth
client before signing in. This is a loopback-only prototype with memory-only sessions;
see the Protocol README for setup, data flow, and deployment limitations.

The [AI harness](ai-harness/README.md) uses Python 3.10+ and the standard library. Its
model settings are in `ai-harness/.env.local`; start with the adjacent `.env.example`.
Protocol calls its dedicated email detector. Dispatch shares its training scoring JSON;
Dispatch's existing web chatbot still uses its independent `py/sentri.py` entry point.

Deployment and Dispatch use their own environment files and session secrets. Database
setup and employee account provisioning are documented in the Deployment README and
[database guide](deployment/AUTH_DATABASE_GUIDE.md). Never commit environment secrets.
