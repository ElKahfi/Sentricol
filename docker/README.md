# SENTRI Docker starter (single EC2 host, Neon database)

This packages Deployment, Dispatch, Protocol, and their local Python/Harness files.
Ollama is a separate service with persistent model storage. PostgreSQL stays on Neon.
The Harness is bundled beside the apps because Protocol launches it as a subprocess
and Dispatch imports its scoring file; it is not a separate HTTP service.

## Active workspace and model

Always work in `/Users/elkahfi/Desktop/Sentricol/SENTRI-fresh`. The sibling
`SENTRI` copy is a legacy backup. The confirmed model family is **Qwen 3.0**,
not Qwen 3.5; use `ollama list` to identify the exact installed size/tag.

## Scope

This is a private pilot setup, not a completed public production deployment.
All app ports bind only to the host loopback interface; Ollama has no published port.
Protocol keeps its existing localhost-origin restrictions and in-memory sessions.
Do not remove those restrictions merely to publish it. Public Protocol needs an
explicit HTTPS origin policy and an access/session design. Restarts disconnect Gmail.
Deployment runs database authentication, never demo mode. Existing Neon schema and
accounts must already be provisioned. Starting containers does not migrate or seed Neon.

## 1. Prepare the host

On your EC2 g5.xlarge, install Docker Engine with the Compose plugin, the NVIDIA
GPU driver, and NVIDIA Container Toolkit configured for Docker. Verify:

```sh
docker version
docker compose version
nvidia-smi
```

References:
- https://docs.docker.com/engine/install/ubuntu/ (if the host uses Ubuntu)
- https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html
- https://docs.docker.com/compose/how-tos/gpu-support/

Run the commands below from the repository root. If Ollama already runs directly
on EC2, first record its exact model tag with `ollama list`. This Compose setup uses
a separate model volume; it does not automatically reuse host model files. Avoid
running both model servers on the GPU at once. Stop the existing server only after
checking whether another application relies on it. Existing app listeners on ports
3000, 3002, or 3003 must also be stopped or relocated before starting this stack.

## 2. Configure privately

```sh
cp .env.example .env
chmod 600 .env
openssl rand -hex 32
openssl rand -hex 32
```

Edit `.env` on the host. Supply the Neon connection string (retain its SSL settings),
two distinct generated session secrets, and the exact `SENTRI_MODEL` tag from
`ollama list`. “Qwen 3.0” alone does not identify the size or quantization. Check
that the selected model fits the instance; containerization does not reduce its
memory requirement. Google credentials may remain blank until Gmail is tested.
Use the same intended Neon database/branch for both apps. Never paste secrets into
chat or bake them into an image. App `.env.local` files are excluded from builds;
the root `.env` provides runtime configuration through Compose.

## 3. Build and start on the GPU host

```sh
docker compose -f compose.yaml -f compose.gpu.yaml config --quiet
docker compose -f compose.yaml -f compose.gpu.yaml build
docker compose -f compose.yaml -f compose.gpu.yaml up -d ollama
docker compose exec ollama sh -c 'ollama pull "$SENTRI_MODEL"'
docker compose -f compose.yaml -f compose.gpu.yaml up -d
```

Use both files on subsequent GPU-host `up` commands. CPU-only smoke tests can use
`docker compose up -d --build` without the GPU overlay, but Qwen may run slowly.
The model pull requires network access, disk space, and time; it is deliberately
explicit. The Ollama health check tests its server, not model availability.
Pin `OLLAMA_IMAGE` to a tested version/digest once the pilot has been validated.

## 4. Access privately

From your laptop (substitute your own SSH key, host username, and EC2 address):

```sh
ssh -i /path/to/key.pem -N \
  -L 3000:127.0.0.1:3000 \
  -L 3002:127.0.0.1:3002 \
  -L 3003:127.0.0.1:3003 user@EC2_ADDRESS
```

Stop local development servers occupying those laptop ports first. Open:

- Dispatch: http://localhost:3000
- Deployment: http://localhost:3002
- Protocol: http://127.0.0.1:3003

For Google OAuth, register exactly
`http://127.0.0.1:3003/api/gmail/callback` on your Google web client and use its
configured test users. The browser callback travels through the tunnel.
Deployment sets Secure cookies in production: localhost browser treatment varies;
if admin sign-in cannot retain its cookie, use a trusted local HTTPS proxy or finish
the domain/HTTPS deployment before testing admin login. Do not disable Secure cookies.
These loopback URLs are for private validation, not public learner access.

## 5. Verify and operate

```sh
docker compose ps
docker compose exec ollama ollama list
docker compose exec ollama ollama ps
docker compose exec protocol python3 /app/ai-harness/protocol.py status
docker compose exec dispatch python3 /app/ai-harness/harness.py config
```

Then test sign-in, an existing course, chat, and Gmail connection/analysis through
the browsers. `ollama ps` shows loaded models after inference. Page health checks
only prove that the web servers answer; they do not validate Neon login, OAuth,
or live model inference. Inspect service logs privately if a check fails.

```sh
docker compose logs --tail=100 deployment dispatch protocol ollama
docker compose down
```

`down` preserves model storage. Do not use `down -v` unless you intend to delete
model volumes. EC2 disk deletion can still delete Docker volumes; choose EBS
retention/backups deliberately. Neon data is independent of these containers.
Custom trusted-sender files are excluded from images; if needed, mount a private
read-only file at `/app/protocol/config/trusted-senders.local.json` through a local
Compose override. No approvals are bundled automatically.

## Before public access

Choose Deployment and Dispatch domains and put a TLS reverse proxy in front of
those services. Set `DEPLOYMENT_ORIGIN` to its exact HTTPS origin. Keep Ollama
private. Protocol remains tunnel-only until its localhost-only access policy is
explicitly adapted and tested. Restrict EC2 SSH access to your administrative IP.
Use a Neon branch for deployment validation if production data should not be touched.
