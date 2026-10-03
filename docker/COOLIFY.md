# Coolify deployment and operations

Protocol update: the user requested public HTTPS access. Follow
[Protocol's public setup](../protocol/README.md) and set PROTOCOL_BASE_URL and
PROTOCOL_ALLOWED_EMAILS before redeploying the updated Compose file. Protocol
may now receive its own HTTPS domain on container port 3000. The instructions
below to leave Protocol private describe the previous rollout; Ollama stays private.

Updated: 2026-10-03. Active workspace: `SENTRI-fresh`.

## Confirmed status and pending checks

- EC2 g5.xlarge hosts Docker, Coolify, and the NVIDIA A10G workload. Neon hosts PostgreSQL.
- The manual Compose deployment previously built successfully and reported four
  healthy containers. Qwen tag: `huihui_ai/qwen3-abliterated:latest`.
- Coolify dashboard: https://sentricol.duckdns.org. HTTPS and a redirect to its
  login page were demonstrated before the Elastic IP change.
- GitHub App source is Connected. Repository: `ElKahfi/Sentricol`; branch: `main`.
  Commit `3e27a0d` added the Coolify definition and was pushed to that branch.
- The latest application screenshot selects Compose, base directory `/`, and
  `/compose.coolify.yaml`, and still asks to Load Compose.
- The user confirmed associating an Elastic IP and updating DuckDNS. Its numeric
  address was not provided. The user also confirmed rotating the DuckDNS token;
  no token or credentials belong in documentation.
- Still pending: loaded Compose validation, required variables, application DNS
  and domains, successful Coolify deployment, login/chat/GPU checks, reboot
  recovery, and an automatic deployment test. Do not treat these as completed.

## Finish the first deployment

1. Click Load Compose. Confirm `deployment`, `dispatch`, `protocol`, and `ollama`.
2. Create two available DuckDNS names pointing to the associated Elastic IP.
   `sentri-app.duckdns.org` and `sentri-admin.duckdns.org` are examples, not
   confirmed registrations. Keep `sentricol.duckdns.org` for Coolify itself.
3. Populate Coolify Environment Variables using the table below. The EC2 root
   `.env` and application `.env.local` files are not automatically imported.
4. Assign domains only to Dispatch and Deployment. In the per-service domain
   fields use `https://YOUR-APP.duckdns.org:3000` and
   `https://YOUR-ADMIN.duckdns.org:3000`. The suffix is the internal container
   port; visitors use HTTPS without that suffix. Leave Protocol and Ollama blank.
5. Confirm the external volume `sentri_ollama-data` exists on EC2 with
   `sudo docker volume inspect sentri_ollama-data`. Verify the generated Compose
   preserves that volume name and the NVIDIA reservation. Keep Raw Compose off.
6. Allow public TCP 80/443 in the instance security group. Restrict SSH to the
   administrator's IP. App/model ports need no public inbound rules.
7. Immediately before deploying, stop the old manual stack on EC2:

   ```sh
   cd ~/SENTRI-fresh
   sudo docker compose -f compose.yaml -f compose.gpu.yaml down
   ```

   Do not add `-v`: it removes model storage. Avoid two Ollama instances using
   the same GPU/model volume concurrently. This cutover causes downtime while
   the first Coolify deployment builds and starts.
8. Click Deploy and inspect Deployment Logs, then each service's Runtime Logs.
9. Open both application URLs and test authentication, Neon data operations,
   and a chat reply. In the Ollama terminal run `ollama list`, then `ollama ps`
   after inference. Check `nvidia-smi` on EC2 for GPU use. Health checks alone
   do not prove database access or model inference.

| Variable | Runtime value |
| --- | --- |
| `DATABASE_URL` | Complete Neon URL including TLS parameters |
| `DEPLOYMENT_SESSION_SECRET` | Existing independent admin session secret |
| `DISPATCH_SESSION_SECRET` | Existing independent learner session secret |
| `DEPLOYMENT_ORIGIN` | Exact admin HTTPS origin, no port suffix or trailing slash |
| `DISPATCH_ORIGIN` | Exact Dispatch HTTPS origin, no port suffix or trailing slash |
| `SENTRI_MODEL` | `huihui_ai/qwen3-abliterated:latest` |
| `OLLAMA_IMAGE` | Currently `ollama/ollama:latest`; pin after validation |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Existing credentials, optional until Gmail testing |

Protocol retains its loopback-only OAuth policy and memory-only sessions.
The Coolify definition has no host port mapping for Protocol, so the old tunnel
to EC2 port 3003 will not reach it after cutover. Private Protocol browser access
needs a separately configured loopback mapping/tunnel; it is not implemented by
the current Coolify file. Do not assign a public domain as a workaround.

## Closing the laptop, rebooting, and stopping EC2

| Action | Expected result |
| --- | --- |
| Close browser, terminal, or laptop | Public EC2 services continue; an SSH tunnel closes |
| Reboot EC2 | Temporary outage; public IP is retained |
| Stop EC2 | All apps, Coolify, proxy, and Ollama stop answering |
| Start EC2 with associated Elastic IP | Same address; DuckDNS should need no edit |

DuckDNS keeps the name registered while EC2 is stopped, but visitors get a
connection failure, not an empty website. Keep the Elastic IP associated and
allocated; do not release it. EBS storage and public IPv4 charges continue while
the instance is stopped.

After a successful initial deployment, existing containers use
`restart: unless-stopped`. They should resume when Docker starts at boot,
provided they were not explicitly stopped or removed. Check boot configuration
on EC2 with `sudo systemctl is-enabled docker` and inspect `sudo docker ps`
after startup. A normal restart does not rebuild images, pull Git, or download
the model again. Allow boot and health-check time; no fixed recovery time has
been measured. Model loading can make the first chat slower.

Data on retained EBS volumes, including Docker images/model storage and Coolify
data, survives stop/start. Neon is independent. Protocol OAuth sessions do not
survive process restarts. Do not confuse Stop with Terminate, which may delete
the root disk. A successfully deployed stack normally needs no new Deploy click
after startup; an unfinished initial deployment still needs to be completed.

## GitHub updates

Automatic updates require Auto Deploy enabled for this Coolify resource and a
working GitHub App webhook. The configured target is `ElKahfi/Sentricol:main`.
Local edits, unpushed commits, pushes to other branches, and pushes only to the
friend's `wembyirving1101/SENTRI` repository do not update this deployment.
Changes must reach the selected repository and branch.

When enabled and EC2 is running, a matching push notifies Coolify, which fetches
the commit, builds the images, and replaces containers. Cached build layers can
reduce build time; updates are not guaranteed instantaneous or zero-downtime.
Runtime secrets remain in Coolify and model files remain in the external volume.
Database schema changes still require their own planned migration.

If EC2 was stopped when a push occurred, do not assume the webhook is replayed
or that startup fetches new code. Start EC2, open Coolify, deploy the latest
selected-branch revision, and verify the commit in Deployment Logs. Test Auto
Deploy with a small reviewed change and confirm both webhook delivery and the
deployed revision before relying on it.

## Recovery

Check deployment logs for missing variables/build failures and runtime logs for
service failures. An origin error requires matching the browser's HTTPS origin
to the corresponding environment variable. An unavailable proxy backend requires
checking service health and internal port 3000. Never fix these by exposing Ollama.

To return to the previous manual stack, first Stop the Coolify application
resource (leave the Coolify dashboard running), then on EC2 run:

```sh
cd ~/SENTRI-fresh
sudo docker compose -f compose.yaml -f compose.gpu.yaml up -d
```

This restores the old private loopback/tunnel access, not public application
domains. Preserve the previous files and `.env` until the migration is verified.

## References

- [Coolify Git-backed Compose](https://coolify.io/docs/applications/builds/docker-compose)
- [Coolify domains and internal ports](https://coolify.io/docs/core/networking/domains)
- [AWS instance lifecycle and IP retention](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-lifecycle.html)
