# SENTRI Protocol

Local Gmail phishing-analysis app. Google handles login; Python calls the Gmail API. The user selects an inbox message and explicitly requests analysis by the shared Qwen harness.

## Google setup (first time)

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create or select a project.
2. In **APIs & Services → Library**, search for **Gmail API** and enable it.
3. Open **Google Auth Platform → Branding** and configure the app name (SENTRI Protocol), support email, and developer contact email.
4. Under **Audience**, choose **External** for a personal Gmail account, keep the app in **Testing**, and add the Gmail address you will sign in with under **Test users**. A Workspace-only project may instead use Internal if your organization allows it.
5. Under **Data Access → Add or remove scopes**, add `https://www.googleapis.com/auth/gmail.readonly`. This app does not request sending or editing permissions.
6. Under **Clients → Create client**, select **Web application**, name it SENTRI Protocol Local, and add this exact **Authorized redirect URI**:

   ```text
   http://127.0.0.1:3003/api/gmail/callback
   ```

   No Authorized JavaScript origin is needed for this server-side authorization-code flow.
7. Copy the client ID and client secret into `protocol/.env.local` (prepared with blank values; do not commit or paste secrets into chat):

   ```dotenv
   PROTOCOL_BASE_URL=http://127.0.0.1:3003
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret
   ```

8. Restart Protocol, open **http://127.0.0.1:3003**, and click **Sign in with Google**. Sign in as the test user and grant the read-only Gmail permission. Google may show an unverified-app screen while your own project is in testing. Confirm the project/client is yours before proceeding.

Use `127.0.0.1` consistently: `localhost` and `127.0.0.1` are different OAuth redirect addresses. If you change ports, update the app's port, PROTOCOL_BASE_URL, and Google's redirect URI together.

## Run

From `protocol/`:

```sh
pnpm install
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
pnpm dev
```

The Gmail environment is separate from the shared harness, which uses Python's standard library. Start Ollama (or your SSH tunnel) and configure `ai-harness/.env.local`:

```dotenv
OLLAMA_HOST=http://127.0.0.1:11434
SENTRI_MODEL=huihui_ai/qwen3-abliterated:latest
```

For your forwarded EC2 Ollama service use `http://127.0.0.1:11435`. Protocol can override these values in its own environment file. `GMAIL_PYTHON` overrides `.venv/bin/python`; `SENTRI_PYTHON` overrides `python3` for the shared harness.

## Workflow and data handling

```text
Browser → Protocol server → Python → Google OAuth / Gmail API
                             ↓ selected email, only on Analyze
                        Shared AI harness → configured Qwen service
```

- Google collects the password; SENTRI receives an access token after the authorization-code exchange with state validation and PKCE.
- Only an opaque, HttpOnly, SameSite cookie is returned to the browser. Tokens stay in server memory. No refresh token/offline access is requested. Sessions last about one hour; server restarts require reconnection.
- Inbox listings request metadata for ten messages at a time. Opening a message fetches its body. Analyze fetches that message using the current account's token and sends its sender, reply-to, subject and extracted text to Qwen.
- Email HTML is displayed as escaped plain text. Links and external images are not fetched. Attachment names are shown; attachment contents are not analyzed. Inline text parts may be fetched through Gmail's attachment-body endpoint.
- Analysis covers up to 20,000 body characters. Truncation and missing content are reported. Results are advisory; this does not authenticate senders, scan attachment files, or inspect destination sites.
- The app does not persist messages, results, tokens, or prompt logs. Inbox content and results remain in browser memory until disconnect/reload. Disconnect clears the server session and attempts Google token revocation.
- The Protocol server can access mail granted by `gmail.readonly`, and the configured AI server receives selected message text. This is **not** a guarantee that SENTRI-operated infrastructure cannot see email data. Keep both components company-controlled for that trust boundary; review infrastructure logging separately.

## Validation

```sh
pnpm test
.venv/bin/python -B -m unittest discover -s python/tests -v
pnpm typecheck
pnpm build
```

Development uses `.next-dev` while production uses `.next`, so a production build does not overwrite a running development server's client manifests. Use `pnpm start` after a build, with the dev server stopped if using the same port.

## Troubleshooting

- **Setup required:** fill both Google values and restart the app.
- **redirect_uri_mismatch:** compare Google's authorized redirect URI with the exact URI above, including scheme, host, port and path.
- **Access blocked / 403:** confirm Gmail API is enabled, your account is a test user, and your Workspace administrator permits the OAuth app.
- **No session after redirect:** open the configured origin consistently, then reconnect. Sessions are local to one server process.
- **Python unavailable:** install requirements in `protocol/.venv`, or configure GMAIL_PYTHON with its full executable path.
- **Model offline:** check Ollama or the SSH tunnel and OLLAMA_HOST.

## Production scope

This implementation intentionally accepts only loopback requests and runs in one persistent Node process with Python installed. It is not ready for a public/serverless or multi-instance deployment. Production needs company-managed identity and access controls, HTTPS, an explicit session/token-storage policy, and infrastructure privacy controls. Gmail read-only is a restricted scope; review Google's verification and security-assessment requirements for your distribution and data usage before public rollout.

References: [Gmail API guides](https://developers.google.com/workspace/gmail/api/guides), [server-side OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes).

## Specialized sender gate

Before Qwen, a deterministic Python sender agent checks the sender. The model cannot approve senders or override this gate.

Edit `config/trusted-senders.local.json` on the Protocol server (ignored by Git):

```json
{
  "accounts": {
    "your-connected-mailbox@example.com": ["approved-person@partner.example"]
  }
}
```

Use actual full addresses. The list starts empty; no sender is approved automatically. Approvals apply only to the specified connected mailbox. Changes take effect on the next message fetch. `PROTOCOL_TRUSTED_SENDERS_PATH` can override the file path; malformed/missing configuration scans all messages.

A message is automatically **Clear — trusted sender, not scanned** when its single From address matches an approval, Reply-to is absent or identical, it isn't labeled SPAM, and Gmail's receiver Authentication-Results report DMARC pass with the exact From domain plus an exactly aligned SPF or DKIM pass. Duplicate/ambiguous results, missing checks, and unknown senders require Qwen analysis. A clear result skips Qwen entirely, even if the model is offline.

Opening a message displays the sender decision immediately. Unknown/unverified messages retain the Analyze action; no background transmission of the entire inbox is introduced. Both preview and analysis fetch sender evidence through the authenticated Gmail API. Browser-provided sender names or verdicts are not accepted.

Trust boundary: this consumes Google's `mx.google.com` receiver results on mail retrieved directly from Gmail, following RFC 8601. It does not independently perform cryptographic authentication or establish provenance of manually imported/altered messages. Use this gate for normally received Gmail mail; authenticated compromised accounts remain possible. Clear is a policy skip, never a content-safety guarantee. Exact domain alignment is deliberately conservative: forwarding and subdomain cases can require scanning even when Gmail accepts them.

## Docker / EC2 private pilot

Use the root [Docker starter guide](../docker/README.md) in `SENTRI-fresh`.
The image contains Node, the Gmail Python environment, and the shared Harness.
Compose points the Harness at `http://ollama:11434`; set `SENTRI_MODEL` to the
exact installed **Qwen 3.0** tag in the root `.env`. Google credentials are also
supplied at runtime. Existing loopback checks stay enabled: access port 3003
through the documented SSH tunnel and retain the loopback OAuth callback.
Sessions remain in memory and are lost on restart. This does not enable public
Protocol access or change the production limitations above.
