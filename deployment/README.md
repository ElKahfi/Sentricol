# SENTRI Deployment

Company registration, admin login, employee management, and Dispatch account provisioning.
Run `pnpm install`, then `pnpm dev` and open http://localhost:3002.

## Database setup

Set `DEPLOYMENT_AUTH_MODE=database`, `DATABASE_URL`, and a separate
`DEPLOYMENT_SESSION_SECRET` in `.env.local`. Dispatch must connect to the same
database and have its own `DISPATCH_SESSION_SECRET`. Restart after changing configuration.
Run `pnpm db:employees` once against an existing SENTRI database. The migration
adds `employees.personnel_number` and `users.auth_version`, preserving existing data.
Fresh databases created from `dispatch/database/schema.sql` include those columns.

## Employee accounts

1. Register a company and administrator, or sign in at `/login`.
2. Open `/admin`; add employees manually or import and review a CSV.
3. Select active employees, choose **Prepare invitations**, then **Create Dispatch accounts**.
4. Share the Dispatch address, employee work email, and initial password **123** with the employee.
5. Employees can change their password in **Dispatch → Settings → Account** using their current password.

Saving an employee does not create a login until invitations are prepared.
New accounts have independent progress. Re-inviting never resets a password or
progress. Pending means the account is ready; Accepted means it has been used to
sign in. Email delivery is not configured: the application does not send invitation emails.
Inactive employees cannot sign in. Changing employment status or email invalidates
existing Dispatch sessions. Password changes invalidate other sessions and keep the
current browser signed in. New passwords require 12 characters, up to 72 UTF-8 bytes.

CSV limits: 2 MB / 2,000 employees. Required columns: Full Name, Work Email,
Employee ID, Department, Rank, Title. Employment Status is optional (True/False,
default True). Database employee email/title limits are 150/100 characters.
Employee IDs are unique within the company; work emails are unique across accounts.
Imports are transactional: conflicting records cause the batch to roll back.

`DEPLOYMENT_AUTH_MODE=demo` retains a labeled browser-only employee preview.
Demo admin: `admin@demo.sentri.test` / `SentriDemo123!`. Demo invites do not create
Dispatch access. Real Dispatch no longer accepts the old hardcoded `admin` login.

Checks: `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm db:check`, and
`pnpm test:database`. Database tests use temporary tables and roll back; no real
employee accounts are created by the tests.

## Company monitoring dashboard

`/admin` includes Overview, Employees, Dispatch Progress, and Protocol Alerts. Employee creation, CSV import and Dispatch account preparation use the existing employee workflow. Monitoring refreshes every 30 seconds. Regular practice shows EXP and completed tasks; an enrolled four-stage course also shows course percentage, phase and status. All queries derive company ownership from the signed-in administrator.

Run `npm run db:monitoring` to add the metadata tables. Deployment and Dispatch must use the same company database. Protocol sends signed-service requests to Deployment; put the same random `PROTOCOL_DEPLOYMENT_SECRET` (at least 32 characters) in both apps' `.env.local`, and set `DEPLOYMENT_URL` in Protocol. Keep the secret server-side. Use HTTPS outside localhost. Restart both apps after changing environment settings.

An employee connects Gmail in Protocol using the exact work email on their active employee/Dispatch account. This verified Google identity is matched server-side; the client cannot choose a company or employee ID. Risk notifications contain only a keyed message identifier, employee identity, severity, and detection time. No subject, sender, body, attachment, Gmail token, or model explanation is sent to Deployment.

Protocol retries failed deliveries from an encrypted local outbox while open and signed in. One message creates one alert even when delivery repeats. The dashboard considers a connection online for two minutes after a heartbeat. Acknowledging an alert records admin review; it does not label the email safe or change Gmail. Existing locally cached analyses are not backfilled automatically; new analyses send alerts.

The current outbox supports one Protocol server process per local data directory; a multi-instance deployment needs a coordinated queue. Preserve the service secret while pending events exist because it encrypts the outbox and derives stable event identifiers.

Checks: `npm test`; `node --test tests/monitoring-database.test.cjs` runs the integration checks inside a rolled-back transaction with temporary tables only.
