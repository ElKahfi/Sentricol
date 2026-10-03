# Repository comparison and integration — 2026-10-03

## Recommendation and evidence

Use `SENTRI-fresh` as the base and integrate new-pull's feature changes.
Newest does not mean most complete: the two histories diverge at `52a2350`.

| Evidence | SENTRI-fresh (before integration) | SENTRI-new-pull |
| --- | --- | --- |
| Checked-out branch | release/ec2-concurrency-test | main |
| HEAD | d1082ef | 6060978 |
| Commit time, UTC+07 | Oct 3, 12:10:28 | Oct 3, 12:35:16 |
| Unique commits since common ancestor | 7 | 5 |
| Origin | wembyirving1101/SENTRI | ElKahfi/Sentricol |
| Additional remote | deploy: ElKahfi/Sentricol | none |
| Local modifications | protocol/next-env.d.ts generated development path | clean |

Read-only remote checks confirmed `ElKahfi/Sentricol/main=6060978` and
`wembyirving1101/SENTRI/main=208e603`. Fresh's saved deploy/main reference was
`d1082ef`, so that tracking reference was stale. Fresh is not simply an older
checkout of new-pull. No branch reset or automatic pull was appropriate.

## Retained changes by area

| Area | From Fresh | From new-pull |
| --- | --- | --- |
| Deployment/security | EC2/Coolify/GPU stack, origin validation, secure cookies, authentication errors | Company dashboard, scoped employee progress and risk alerts |
| Protocol | Exact public HTTPS configuration, mailbox allowlist, OAuth protections, public status authentication | Active company account checks, encrypted monitoring retries, revocation checks |
| Dispatch | Proxy-aware authentication, chat identity fixes, regression coverage | Username login, AI course pools/evidence, review/progression controls |
| Harness | Concurrency benchmark and its tests | Course evidence instructions, schema and generation validation |
| Database | Employee-account scripts accepting runtime configuration | Monitoring migration and backward-compatible AI course columns/constraints |
| Docs/tests | Deployment guides, architecture logs, benchmark documentation | Monitoring documentation and unit/integration tests |

New-pull contributes 77 changed/added files relative to the common ancestor;
Fresh contributes 46. Dependencies and lockfiles do not require version changes.
Package-script differences select Webpack for development and add monitoring
commands/tests; Deployment separates development and production build folders.

## Integration decisions

- Used Git's three-way merge result and resolved overlaps explicitly in Fresh.
  New-pull, local secret files and remote branches were not changed.
- Preserved both Protocol authorization layers: mailbox allowlist and active
  Deployment account. Public status also revalidates company access.
- Preserved secure cookies and authentication error handling while adding username
  login and signed local admin claims.
- Added explicit `DISPATCH_LOCAL_ADMIN_TOOLS=true` opt-in for the development demo
  shortcut. It remains unavailable in production and on non-loopback login URLs.
- Added the service URL/secret to Compose environment wiring and persistent
  `protocol-data` outbox storage, with image ownership for the unprivileged user.
- Excluded `.sentri` runtime data from Docker build contexts. Added `.pnpm-store`
  to ignore rules; already tracked caches were left intact.
- Preserved the pre-existing Protocol development type-reference change after
  build verification. No commits or pushes were made; changes remain reviewable.

## Findings and remaining risks

1. Protocol now intentionally requires the Deployment service. Existing Gmail
   setup alone is insufficient. Set `DEPLOYMENT_URL` and matching
   `PROTOCOL_DEPLOYMENT_SECRET` (32+ characters) in both relevant services.
   Public access still needs `PROTOCOL_ALLOWED_EMAILS` and Google OAuth settings.
2. Inside containers, localhost does not reach Deployment. Use its reachable HTTPS
   origin; plain HTTP is accepted only for loopback development. Configure TLS
   and test real OAuth before public rollout.
3. Apply `deployment/database/migrations/003_company_monitoring.sql` before using
   the dashboard (`npm run db:monitoring` in deployment). For AI course testing,
   apply the updated `dispatch/database/migrations/002_email_course.sql` using
   the documented course setup command. Review/back up the target database first.
   Neither migration was applied in this task.
4. Regular practice remains enabled. Four-stage AI training remains disabled for
   normal production users. Hard/master drafts require review, but upstream's
   reviewer is a development-only tool for the seeded learner. A production
   reviewer workflow is required before enabling four-stage training globally.
5. Protocol sessions remain memory-only and its encrypted outbox is single-process.
   Restart requires Gmail reconnection; secret rotation can invalidate pending
   encrypted alerts. No multi-instance reliability claim is made.
6. Both histories already contain tracked package-cache database files, generated
   PDF previews and document outputs. They were not imported as new changes or
   deleted. A separate reviewed repository cleanup is advisable.
7. A limited pattern scan found no private keys, common GitHub/AWS tokens or
   credential-bearing PostgreSQL URLs in scanned tracked text. This is not a
   full secret-history scan. Local environment files were not copied or printed.
8. Dispatch's existing lint script cannot run: ESLint is absent from dependencies
   and there is no lint configuration. No unrelated tooling upgrade was introduced.
9. Migration filenames include two existing Dispatch `003_...` scripts; use explicit
   migration paths rather than assuming numeric prefixes are unique.

## Validation

- Production Webpack builds passed for Deployment, Dispatch and Protocol,
  including Next.js TypeScript validation.
- Deployment: 21 unit tests passed.
- Dispatch: 46 unit tests passed, including the new demo-login guard test.
- Protocol: 28 tests passed, including the new public-status account guard test.
- Standalone TypeScript checks passed for all three apps after the builds.
- All three Compose files passed YAML parsing; both main stacks include the
  service secret settings, model host and persistent Protocol outbox volume.
- Final whitespace/conflict checks passed and new-pull's working tree stayed clean.
- Python harness: 37 passed. Its timing-sensitive benchmark test initially failed
  under simultaneous builds/tests, then all 37 passed when rerun without contention.
- Protocol Python: 11 passed using the existing virtual environment. The system
  Python lacked Google OAuth dependencies; no reinstall was needed.
- Live database tests, real Gmail/model calls, Docker image build and deployment
  were not performed. Docker and PostgreSQL CLIs are not available on this host.
- Lint is blocked by the existing missing ESLint setup described above.

## Next rollout steps

Review the local diff, provide the required runtime settings, and approve the
target database migrations before deployment. Validate company isolation against
the migrated database, complete real Google sign-in, and verify one risk alert
arrives and survives a Protocol container restart. Keep regular training as the
production mode until the reviewer workflow is implemented.
