# Facility Onboarding and RBAC Runbook

Scope: seeded-synthetic local/CI operation for feature 003 only. This runbook does not authorize real Egyptian licensing evidence, production identities, or production approval claims. `OPEN-SEC-001`, `OPEN-LEGAL-*`, `OPEN-TEAM-001`, and `OPEN-UX-*` remain open.

## Start and verify

1. Copy only the synthetic values from `.env.supabase.example`; never place secrets or real documents in Git.
2. Run `pnpm install`, `pnpm db:reset`, `pnpm db:test`, and `pnpm db:rls-test`.
3. For the deterministic in-process stack run `pnpm --filter @shifaa/api test:integration`.
4. For local Supabase run `pnpm supabase:start`, `pnpm supabase:reset`, then start the API with `pnpm dev:supabase:api`.
5. Start the distinct facility app needed for the journey: `pnpm --filter @shifaa/clinic dev`, `@shifaa/pharmacy`, `@shifaa/hospital`, or `@shifaa/lab`. Start admin separately with `pnpm dev:admin:web`.

Feature flags `FACILITY_ONBOARDING_ENABLED` and `SYNTHETIC_LICENSING_ENABLED` must remain false outside local/test. Production startup must fail closed while a deterministic scanner, local authentication, memory repository, or synthetic licensing adapter is selected.

## Evidence handling

- Buckets `facility-license-evidence` and `professional-license-evidence` are private.
- Upload intent accepts JPEG, PNG, or PDF up to 10 MiB and starts in quarantine.
- Never approve quarantined, rejected, missing, or checksum-mismatched evidence.
- Reviewers receive a short-lived single-object view only after release; list access is forbidden.
- Raw license number, document bytes/key/URL, address, invite token, phone, and email are prohibited in logs and events.

## Authorization diagnosis

Check in order: authenticated person → facility ID/type → active membership → named action → current role → AAL → purpose → current professional license → patient relationship where the action declares one. A denial at any step is final and must not reveal whether a cross-facility resource exists.

Administrative facility and professional review requires `facility_approver`, AAL2, the exact review purpose, assignment, released evidence, current version, and an actor other than the subject/owner. Administrative grants and revocations require two active `super_admin` actors; proposer, decider, and target must be distinct. A pending proposal grants no permissions.

## Incident signals and safe actions

| Signal                                       | Immediate action                                                                 | Recovery evidence                                                            |
| -------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Scanner unavailable or quarantine age rising | Disable submissions/reviews; keep objects private; do not mark released manually | dependency restored, checksum/magic scan receipt, queued objects reprocessed |
| Idempotency conflicts/replay spike           | Preserve records, inspect hashed request/key dimensions, rate-limit actor        | one domain/audit/outbox effect per accepted mutation                         |
| Cross-facility or wrong-role allow           | Disable feature routes, preserve audit, rotate affected synthetic sessions       | API and direct forced-RLS negative matrix passes                             |
| Role self-decision/direct revoke             | Disable role governance, preserve immutable rows                                 | independent actor and direct-SQL tests pass                                  |
| Prohibited telemetry sentinel                | Stop worker delivery, quarantine logs/events, follow breach process              | recursive redaction scan returns zero matches                                |
| Outbox lag/dead letter                       | Keep domain state authoritative; retry boundedly; never repeat domain mutation   | deduplicated receipt and lag recovered                                       |

Incident and escalation ownership remains `OPEN-TEAM-001`. Do not delete facility, membership, license, grant, audit, idempotency, or outbox history. Roll back by disabling route registration and rolling forward a corrective migration.

## Performance and portability

The seeded target is 100 concurrent sessions, read p95 at most 400 ms, and mutation p95 at most 800 ms excluding scanner time. Transactions set bounded statement/lock timeouts and perform external upload/scanner preparation before opening the mutation transaction. PostgreSQL/Supabase boundaries stay behind repository/storage ports; browser applications call only the Core API.
