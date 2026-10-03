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

## Docker / EC2

Use the root [Docker starter guide](../docker/README.md) in `SENTRI-fresh`.
Compose runs Deployment with database authentication and the shared Neon
`DATABASE_URL`. Set a separate `DEPLOYMENT_SESSION_SECRET`; runtime settings
come from the root `.env`, not an image-bundled `.env.local`. The private pilot
binds port 3002 to loopback. Public access requires HTTPS and a matching
`DEPLOYMENT_ORIGIN`. Compose does not migrate or seed the database.
# Public authentication troubleshooting

Set `DEPLOYMENT_ORIGIN=https://sentriadmin.duckdns.org` exactly in Coolify's
production environment and recreate the containers. Bare hostnames are invalid.
See [the investigation and verification guide](../docker/AUTH-TROUBLESHOOTING.md).
`node scripts/check-database.cjs` now checks employee-account columns too;
the migration runner accepts runtime DATABASE_URL without a local env file.
