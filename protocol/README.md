# SENTRI Protocol

Gmail phishing-analysis app supporting loopback development and explicitly configured public HTTPS. Google handles login; Python calls the Gmail API. Connecting Gmail starts automatic analysis of the 20 newest Inbox messages by the shared Qwen harness.

## Public HTTPS on Coolify

Use one Protocol container/process. This change is prepared locally; DNS, Google
configuration, deployment and real Gmail verification have not been performed.

1. Register an available DuckDNS name such as `sentriprotocol.duckdns.org` and
   point it to the instance's associated Elastic IP. This is a suggested name,
   not a confirmed domain registration.
2. Set Coolify production runtime variables:

   ```dotenv
   PROTOCOL_BASE_URL=https://sentriprotocol.duckdns.org
   PROTOCOL_ALLOWED_EMAILS=your-google-email@example.com
   ```

   Substitute the actual domain and exact permitted Google mailbox addresses.
   Multiple addresses use commas. No wildcard access is granted. Public mode
   denies login until the allowlist is configured. Keep GOOGLE_CLIENT_ID and
   GOOGLE_CLIENT_SECRET configured privately as before.
3. In the existing Google Web application OAuth client, add the exact redirect:
   `https://sentriprotocol.duckdns.org/api/gmail/callback`. Keep the local callback
   if still used. Enable Gmail API and add permitted users as Google test users
   while the OAuth app is in Testing. Google requires an exact redirect match;
   see [Google's OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server).
4. Publish the reviewed changes, reload `/compose.coolify.yaml` in Coolify, set
   Protocol's domain to `https://sentriprotocol.duckdns.org:3000`, then deploy.
   The environment base URL and browser URL do not include `:3000`. The two
   new variables are required by this Compose file before any stack redeployment.
5. Open the HTTPS site, connect an allowed Google account, verify Inbox and an
   analysis, refresh, then disconnect. A disallowed account must receive no
   Protocol session. Confirm restarting Protocol requires Gmail reconnection.

The public Host must be preserved by Coolify. State-changing requests require
the exact configured Origin; forwarded headers do not establish trust. OAuth
callbacks can omit Origin and still require one-time state bound to the flow
cookie plus PKCE. Google-reported mailbox identity is checked before storing a
session and on subsequent use. Rejected accounts' tokens are revoked best-effort
and never retained. Public model status also requires a Gmail session.

Cookies are Secure on HTTPS, HttpOnly and SameSite=Lax. Tokens remain only in
server memory for up to about an hour; no database, refresh tokens or persistent
token files are introduced. Users reconnect after expiration/restart. The page
itself is publicly visible; mailbox APIs and analysis require an allowed session.

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
                             ↓ queued email, newest first
                        Shared AI harness → configured Qwen service
```

- Google collects the password; SENTRI receives an access token after the authorization-code exchange with state validation and PKCE.
- Only an opaque, HttpOnly, SameSite cookie is returned to the browser. Tokens stay in server memory. No refresh token/offline access is requested. Sessions last about one hour; server restarts require reconnection.
- Inbox listings fetch at most 20 INBOX messages, ordered by Gmail internal received time. The browser polls every 30 seconds while open and on returning to the tab. The serial queue fetches each message using the current account token, checks sender trust, and sends unapproved messages to Qwen. The running request finishes before new arrivals are processed. Pagination is disabled for this flow.
- Email HTML is displayed as escaped plain text. Links and external images are not fetched. Attachment names are shown; attachment contents are not analyzed. Inline text parts may be fetched through Gmail's attachment-body endpoint.
- Analysis covers up to 20,000 body characters. Truncation and missing content are reported. Results are advisory; this does not authenticate senders, scan attachment files, or inspect destination sites.
- Email content, metadata, results, queue state, and alert history are encrypted in browser IndexedDB. The server does not persist messages, results, tokens, or prompt logs. Disconnect clears visible email data and the server session and attempts Google token revocation; the encrypted browser cache remains for the same account to resume later.
- The Protocol server can access mail granted by `gmail.readonly`, and the configured AI server receives queued message text. This is **not** a guarantee that SENTRI-operated infrastructure cannot see email data. Keep both components company-controlled for that trust boundary; review infrastructure logging separately.

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

This implementation runs in one persistent Node process with Python installed.
Public access uses HTTPS and an explicit mailbox allowlist; loopback development
remains supported. It does not support multi-instance/serverless session sharing.
Gmail read-only is a restricted scope; Google's verification requirements still
apply to wider distribution. Public HTTPS support does not itself verify the
Google OAuth application. Review infrastructure logging separately.

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

A message is automatically **Safe — trusted sender, not scanned** when its single From address matches an approval, Reply-to is absent or identical, it isn't labeled SPAM, and Gmail's receiver Authentication-Results report DMARC pass with the exact From domain plus an exactly aligned SPF or DKIM pass. Duplicate/ambiguous results, missing checks, and unknown senders require Qwen analysis. A clear result skips Qwen entirely, even if the model is offline.

Processing a message checks the sender before calling Qwen. Unknown/unverified messages are analyzed automatically within the latest-20 Inbox window. Sender evidence comes from the authenticated Gmail API; browser-provided sender names or verdicts are not accepted.

Trust boundary: this consumes Google's `mx.google.com` receiver results on mail retrieved directly from Gmail, following RFC 8601. It does not independently perform cryptographic authentication or establish provenance of manually imported/altered messages. Use this gate for normally received Gmail mail; authenticated compromised accounts remain possible. Clear is a policy skip, never a content-safety guarantee. Exact domain alignment is deliberately conservative: forwarding and subdomain cases can require scanning even when Gmail accepts them.

Email analysis has no application or Ollama request deadline in this local setup. It remains active until the model responds, the user cancels, the connection closes, or an upstream service fails. Gmail API operations and model status checks retain bounded timeouts.

If Qwen returns an answer that fails the email evidence/format checks twice, Protocol displays **Requires investigation** (internal verdict: inconclusive) with independent verification advice. It does not treat the unvalidated answer as a phishing verdict or clear the message. Ollama connection and service failures still appear as errors.

## Assessment categories

Protocol shows five user-facing categories. **Safe** means an exact approved sender passed Gmail authentication checks and Qwen was skipped; it is a sender-policy result, not a content-safety guarantee. **Safe but requires investigation** maps to Qwen's `low-risk` assessment of an unapproved sender: no meaningful warning signs were found in the available text, but the sender and linked destinations remain unverified. **Requires investigation** maps to `inconclusive`, including a model answer that failed evidence checks; no safety conclusion was reached. **Risky** combines `suspicious` and `high-risk` when the model provides grounded phishing evidence. **Spam** is reserved for nuisance/bulk/promotional mail with grounded evidence and no meaningful phishing indicators. Phishing risk takes precedence over spam; the app does not infer spam merely from an unknown sender. These labels are advisory, and the current inbox only displays messages Gmail places in INBOX.


## Local queue, encryption, and alerts

- `src/lib/inbox-monitor.ts` owns the queue independently of the React view. A Web Lock allows one processing tab per mailbox; another tab waits for it to close. Requests carry the expected mailbox so a Google account switch in another tab cannot mix caches.
- `src/lib/inbox-queue.ts` retains the latest 20 Inbox records, reuses completed results by message ID, resets interrupted work to queued, and prioritizes new messages over retries. A request already running finishes even if its email leaves the window, but its content/result is then discarded. Messages outside the refreshed window are removed from the local content cache.
- `src/lib/local-vault.ts` uses AES-256-GCM with a fresh 96-bit IV on every save and the account hash as authenticated additional data. Each account has a non-exportable Web Crypto key persisted through IndexedDB structured cloning. Only ciphertext, IVs, hashed account identifiers, and CryptoKey objects are stored; raw message bodies, subjects, labels, and OAuth tokens are not written in plaintext.
- This is browser-profile encryption, not a password-protected vault or end-to-end encryption against the app itself. Same-origin application code can use the key, and compromised browser/OS access remains outside this protection. Keep the app origin trusted. Clearing Protocol site data deletes both the key and cache. There is no server recovery or cross-device synchronization. Encryption failure pauses processing instead of silently storing plaintext.
- Reload/close pauses processing; reopening and reconnecting Gmail resumes after fetching the current latest-20 window. An expired Google session pauses new work without discarding an already-running completed result. The browser must remain open to monitor, and background-tab throttling may delay checks. No Gmail Pub/Sub setup is required.
- Service failures show Requires investigation with the failure reason, allow other messages to continue, and retry at most three times with backoff. An unreadable body or invalid model evidence produces an inconclusive result. Neither is treated as Safe.
- Enable alert sounds once per page session using the sound button (browser audio permission requires interaction). The first Risky result from the initial batch sounds once; the visible count updates as the rest finish. Each subsequently arriving Risky email sounds once. Alert history is committed before sound playback and is encrypted alongside results. Alerts encountered while muted are not replayed later. Up to 1,000 previously alerted IDs are retained to prevent replay without retaining old email content.
- Labels appear inside Protocol only; Gmail messages and labels are not modified. The API scope remains `gmail.readonly`.
