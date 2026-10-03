# Authentication investigation — 2026-10-03

## Evidence

- Live GET `https://sentriadmin.duckdns.org/api/auth/session` returned database
  mode and no current admin. This unauthenticated endpoint does not query Neon.
- Live POST to admin registration with its exact browser Origin and empty JSON
  returned `Invalid request origin`. No registration was attempted or written.
  The screenshot shows DEPLOYMENT_ORIGIN beginning with a bare hostname.
  Correct the actual runtime setting; a code deployment alone cannot fix it.
- Dispatch returned `Enter your work email and password` for both empty JSON and
  correctly formatted synthetic credentials from its own public Origin. Under
  the current local code those credentials pass field validation, pointing to
  origin rejection. The exact deployed commit/runtime environment remains unverified.
- Form field names and JSON content types match the route contracts. Dispatch
  accepts nonempty passwords up to 72 UTF-8 bytes, including the initial `123`
  password currently assigned by employee provisioning. No new password-length
  restriction was added to login.
- Registration creates an admin; employee provisioning separately creates a
  bcrypt-hashed player account. Dispatch joins users, active employees,
  departments, companies and ranks and requires role `player`. Admin accounts
  cannot sign in to Dispatch. Successful registration leads to a summary and
  admin-login link, not an automatic player session.
- Read-only checks against the locally configured Neon database found required
  identity columns and table privileges, including personnel_number and
  auth_version. This does not establish that Coolify uses the same database.
  No user records, passwords, or production data were changed.

## Fixes

- Dispatch now distinguishes origin (403), content type (415), oversized body
  (413), malformed JSON (400), and credential errors. Login and password-change
  routes preserve these responses instead of masking them as missing credentials
  or service failure. Unexpected failures log only a diagnostic code.
- Dispatch login/logout cookies always use Secure in production even when the
  TLS-terminating proxy communicates with Next.js over HTTP. HttpOnly, SameSite,
  signed sessions and database revalidation remain enabled.
- Deployment explicitly rejects malformed configured origins with a configuration
  error. It does not infer trust from forwarded headers or disable origin checks.
- Registration scrolls back to the error near its heading when submission fails.
- The schema check now covers auth_version and personnel_number. The existing
  additive migration runner can use runtime DATABASE_URL without .env.local.

## Apply and verify

1. In Coolify production Environment Variables set exactly:

   ```dotenv
   DEPLOYMENT_ORIGIN=https://sentriadmin.duckdns.org
   DISPATCH_ORIGIN=https://sentridispatch.duckdns.org
   ```

   No trailing slash, spaces, paths, or `:3000`. Domain routing fields may have
   the internal `:3000` suffix; these environment values must not. Confirm both
   session secrets and DATABASE_URL are populated privately. Preview variables
   do not configure the production containers.
2. Save and recreate/redeploy the resource to apply runtime changes. Publish the
   reviewed code to `ElKahfi/Sentricol:main`, then deploy that commit in Coolify.
   Check the deployed revision in Deployment Logs against the pushed commit;
   public HTTP responses do not establish exact source identity.
3. In the Deployment container terminal run `node scripts/check-database.cjs`.
   This checks the actual runtime database read-only. If auth_version or
   personnel_number is missing, review `deployment/database/employee-accounts.sql`
   and back up/plan the migration before running
   `node scripts/setup-employee-accounts.cjs` there. No migration was applied in
   this investigation; the locally configured database already has those columns.
4. Retry registration. Then log into the admin app, create/import an active
   employee, and provision its player account using the existing admin workflow.
   An imported employee alone is not necessarily a provisioned login.
5. Sign into Dispatch with that employee account. Verify refresh retains the
   session, protected APIs work, logout clears it, and chat succeeds separately.
   Existing accounts retain their existing passwords when provisioned again.

Validation: 14 Deployment unit tests and 7 focused Dispatch authentication tests
passed; both TypeScript checks passed. Tests cover HTTPS origins with internal
HTTP URLs, hostile origins, JSON errors, size limits, secure cookies, registration,
sessions and account ownership. Live successful registration/login, actual
container variables, deployed revision and post-deployment browser flows remain
pending. Changes are local until committed, pushed and deployed.
