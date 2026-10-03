# SENTRI Python AI harness

Run with Python 3.10 or newer. Only Python's standard library is required; no npm,
Node.js, pip packages or TypeScript compiler is needed for the harness.

For the simplest start, open `start.py` in your editor and press Run, or run
`python3 start.py` from this folder. Its menu offers chat, task planning and email
generation using the bundled example user and fictional company policy. Choose
“Change input files” to use your own JSON. Ollama must be running. Each operation
is an independent model request. Chat keeps the latest 12 messages in memory and
sends them with each request. Use `/back` to return to the menu or `/clear` to reset
the conversation. Leaving chat clears its history; nothing is saved to disk.

Choosing **3** normally makes one model call that plans the scenario and writes the
email together. The runtime then checks the plan, computes its score and returns
only the email JSON. If you previously chose **2**, option **3** uses that planned
task in one email-only call. Changing input files clears the planned task. You can
also save a planned task JSON and supply it to the CLI:

```sh
python3 ai-harness/harness.py generate --profile ai-harness/examples/internal-user-context.json --task ai-harness/examples/task-spec.json
```

The supplied task must match the profile, phase and current scoring configuration.
The large local model can still take time for the remaining call; model size and
hardware affect that time. Set `SENTRI_MODEL` to a faster installed Ollama model
if you want a further speed tradeoff.

```text
ai-harness/
├── start.py            interactive launcher; no arguments needed
├── harness.py          Python entry point
├── scoring.json        shared weights and scoring version
├── instructions/       SENTRI identity, planner, email generator, chatbot
├── knowledge/          user/task guides, personalization, PS and tag meanings
│   └── company-policies/  company-scoped knowledge documents
├── schemas/            machine validation contracts
├── examples/           actual user JSON and matching worked examples
├── runtime/            Python asset loaders, model client, gates and orchestration
└── tests/              offline Python tests
```

## Shared location and configuration

The harness lives at the repository root, beside Deployment, Dispatch, and Protocol.
Protocol uses `protocol.py` to analyze pasted emails through the same model client
and validation loop. Dispatch imports the shared scoring configuration and calls
`dispatch/py/harness_bridge.py` for its authenticated chatbot and regular email
tasks. The bridge constructs a compact learner context from Dispatch's database;
the browser cannot supply a company identity or skill profile. With phase
progression disabled, email tasks use the Easy phase. Valid Easy and Normal
emails are saved as playable cases; Hard and Master emails are stored as
`pending_review` and cannot be assigned until reviewed. An internal reviewer can
inspect them from the `dispatch/` directory with `pnpm review:ai list`
and `pnpm review:ai show <case_id>`, then use `approve <case_id>` or `reject <case_id>`.
This CLI is an operator-only prototype; it is not yet a company-admin review UI.
Set the server-only `SENTRI_AI_PHASE` to `normal`, `hard`, or `master` to exercise
those stages while the phase course remains disabled. If generation fails,
Dispatch falls back to the existing approved case catalog. Password and data-classification tasks still
come from that catalog. The chat UI displays validated replies in chunks; the
model request itself is not token-streamed.

Model settings are read from `ai-harness/.env.local`. Copy `.env.example` there for
a new installation. App or shell `OLLAMA_HOST` / `SENTRI_MODEL` values take precedence.
Only those two settings are loaded; database and account secrets are not imported.

## Run from the repository root

```sh
python3 ai-harness/harness.py config
python3 ai-harness/harness.py preflight --profile ai-harness/examples/user.json
python3 ai-harness/harness.py plan --profile ai-harness/examples/user.json --context ai-harness/examples/organization-context.json
python3 ai-harness/harness.py generate --profile ai-harness/examples/user.json --context ai-harness/examples/organization-context.json --knowledge ai-harness/examples/profile-knowledge.json
python3 ai-harness/harness.py chat --profile ai-harness/examples/user.json --context ai-harness/examples/organization-context.json --knowledge ai-harness/examples/profile-knowledge.json --question "How should Finance verify changed supplier payment details?"
python3 ai-harness/harness.py gate
```

The entry point also works by absolute path from any directory; input file paths are
relative to your current directory. `SENTRI_HARNESS_ROOT` optionally selects a different
knowledge package. Required missing files fail explicitly.

Ollama must be running for plan, generate and chat. The default model is
`huihui_ai/qwen3-abliterated:latest`. Set `SENTRI_MODEL` or `OLLAMA_HOST` in the shell
to override them. `config`, `schemas`,
`preflight` and `gate` work without a model. JSON results go to stdout; errors to stderr.

## LoopGate blueprint

This runtime adopts LoopGate's file-based instructions, fresh-context iterations,
limited retries, validation gates and inspectable run records. It is a task-content
harness, not an installation of LoopGate's coding-agent runner: it does not run Git
commit hooks or let a coding agent edit the repository.

`load profile → choose objective → generate proposal + email → validate → compute PS → return email`

The standalone **plan** command uses one model request. **Generate** normally combines
planning and email writing in one request. Supplying an existing task uses one email
request. Invalid JSON or failed content/schema gates receive validation feedback on
the next attempt. The default is two attempts per operation, with a 300-second total
budget. Use `--attempts 3 --timeout 600` to change those limits. Network failures
stop the run. A model response is accepted only after its schema and checks pass.

Use `--log-dir ai-harness/scratchpad/runs` for optional metadata-only logs containing
stage, attempt and gate outcome; profiles, prompts and generated content are excluded.
These logs are ignored by Git. `preflight` checks the input profile and knowledge;
`gate` runs the offline Python suite with mocked model responses. A passing gate is
not evidence that live generated content is pedagogically correct.

## Knowledge and personalization

The planner reads `instructions/task-planner.md` plus the user-profile, task-structure,
personalization, phishing-score and tag guides. Chat and email generation load their
own relevant guides. These instructions are always loaded; essential JSON knowledge
does not depend on search results.

The full user JSON retains userId, employeeId, name, email, companyId, department,
position, joinedAt, progression, knowledge, behavior, skillStatistics and statistics.
The adapter preserves that object and builds a compact internal context. Field meanings,
score directions and provisional tag mappings are documented in `knowledge/user-profile.md`.
Company name, rank and phase are supplied separately; absent values are marked unknown
and phase defaults to easy. Progression level is not silently converted into rank.

Core cybersecurity documents and JSON files in `knowledge/company-policies/` are
filtered by company/department before lexical retrieval. This is basic keyword RAG;
no vector database or document ingestion is included. The bundled policy example is
fictional. A future authenticated server must construct the profile and load trusted
company documents; client-supplied company IDs cannot establish authorization.

## Scoring and output

`PS = 0.4 × Σ(bᵢwᵢ)/Σwᵢ + 0.6 × Σ(kᵢvᵢ)/Σvᵢ`, range 0–1.

Behavior weights total 60, with each at most 10. Provisional knowledge weights total
70. Intensities are 0, .25, .5, .75 or 1. Both Python and the existing TypeScript course
read `scoring.json`, so the fixed weights share one source. Update its version and
corresponding schema/examples if changing the contract. The supplied skill scores and
accuracy percentages remain 0–100; they are not PS inputs.

Generated emails return exactly one object: id, senderName, senderEmail,
recipientEmail, subject, body, timestamp, links, attachments, threat and clues.
There is no result envelope. The ID matches the planned task; links and attachments
can be empty arrays. See `examples/email-content.json` for the actual output shape.
The runtime checks the schema, task ID, threat/decision consistency and supplied
recipient email. Threat and clues contain answer/feedback data; the learner UI must
control when these are revealed. Results remain drafts: realism, clue accuracy,
indicator ratings and faithfulness to policy require content review. No automatic
database insertion occurs.

Protocol's local web UI is connected through `protocol.py`, which reads one email
JSON object from stdin and writes a validated assessment to stdout. It uses separate
`email-detector` instructions and `email-analysis` schema, not training phishing scores.
`python3 ai-harness/protocol.py status` checks the configured model. Analysis has a
120-second total budget and up to two validation attempts. Quotes must occur exactly
in the supplied field. Schema/evidence validation does not prove detection accuracy.
This operation does not retrieve company documents, write email files, or log prompts.
The existing `dispatch/py/sentri.py` web-chat script remains independent.

For an existing legacy database, `dispatch/database/migrations/003_phishing_score_unit.sql`
converts stored scores from 0–100 to 0–1 once. It has not been applied here.

## Docker / EC2

Use the [Docker starter guide](../docker/README.md) in the active `SENTRI-fresh`
workspace. The Harness is included beside the apps in their images to preserve
Python subprocess calls and shared scoring-file imports. Ollama runs separately
on the private Compose network at `http://ollama:11434`. Runtime configuration
comes from the root `.env`; app-local environment files are excluded from images.
The deployment targets **Qwen 3.0**. Supply its exact installed Ollama tag as
`SENTRI_MODEL`; this does not silently replace the source-code model defaults.

## Short concurrency benchmark

Run `python3 -B ai-harness/benchmark.py` from the repository root for an excluded
warm-up and concurrency 1/2/4 rounds within a 15-minute generation budget. See
[BENCHMARK.md](BENCHMARK.md) for EC2 commands, metrics, and limitations.
