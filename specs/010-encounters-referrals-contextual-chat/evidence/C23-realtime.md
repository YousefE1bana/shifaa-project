# C23 — Outbox and realtime refresh hint

Scope: T067–T069 and issues #374–#376 only. Authorization: `TASKS_APPROVED`, with explicit C23 implementation authorization. Evidence is synthetic local/test only. Production delivery, C24, and all later `OPEN-*` gates remain outside this acceptance.

## Preflight and delegation

Root confirmed the existing worktree was clean on `codex/010-encounters-referrals-contextual-chat` at exact starting HEAD `647f9931145d9ea6aec8b394c6dd792d9ddede70`. T001–T066 were checked, including C22 T064–T066; T067 was next. The feature requirements checklist had no unchecked items.

Only #374–#376 handoff metadata was repaired. Existing issue bodies were preserved and received `shifaa-speckit-handoff:v1` markers for T067, T068, and T069 with the exact starting HEAD as baseline. The repository resolver validated each task and its predecessor.

A deep-worker (gpt-6-luna, max) owned the bounded transaction/lease/RLS tests and additive migration; a normal worker (gpt-6-luna, high) owned the consumer and runner. A tester (gpt-6-luna, medium) added the C22 REST revocation probes. Independent file ownership was maintained, database verification was serial, and root retained architecture review, acceptance, ledger, and Git/issue actions. SHIFAA guardrails and SpecKit overlay governed the checkpoint; clean-code-guard, test-guard, and docs-guard were applied as advisory second-pass reviews.

## T067 RED evidence

Before the consumer implementation, root ran:

```text
corepack pnpm --filter @shifaa/worker exec node --test src/feature-010-realtime.test.ts
```

Exit 1: nine tests, one existing C22 marker baseline pass and eight failures with the explicit missing boundary `C23_REALTIME_BOUNDARY_MISSING: services/worker/src/feature-010-realtime.ts`. Test import/setup succeeded. A draft baseline-source assertion was corrected before this accepted RED; fixture failures were not accepted.

The durable PostgreSQL scenarios were written before the adapter. Root ran:

```text
corepack pnpm --filter @shifaa/worker exec node --test src/feature-010-realtime.postgres.test.ts
```

Exit 1 at `C23_REALTIME_DURABLE_BOUNDARY_MISSING: PostgresFeature010RealtimeHintStore`. The database suite was skipped without database URLs. This RED proves the missing adapter export; it does not claim the database scenarios executed before implementation. Root accepted both missing-boundary results before authorizing production C23 code.

Later GREEN runs exposed fixture-only issues: a variadic JSON parameter needed an integer cast; worker privilege introspection needed owner-side relation lookup; one pending fixture needed isolation; and the Supabase TCP fixture account needed grants inside its disposable database. These were corrected and both runtimes rerun. None is counted as RED evidence.

## Accepted marker and implementation

The existing C22 durable event remains `clinical.context_message.created.v1`, aggregate type `context_message`, aggregate ID equal to the message ID, and payload exactly:

```text
{ aggregateId: messageId, version: aggregateVersion }
```

The outward refresh hint is a newly constructed closed projection:

```text
{ eventId: outboxEventId, contextId: appointmentContextId, version: aggregateVersion }
```

The event ID supports deduplication, the context ID scopes REST invalidation, and version preserves the existing aggregate marker version. C22 currently emits version 1 for each separate message aggregate; this is not a context-wide sequence. Distinct-message hints may arrive out of order without reconstructing content or conveying authority.

The consumer reuses `platform.outbox_events`, `platform.event_receipts`, the existing state/lease convention, and the shared bounded retry policy. The additive forward migration is `supabase/migrations/20260930001000_f010_c23_realtime_hint.sql`. It adds only narrow worker EXECUTE seams, an exact C22 payload constraint, and a disabled-by-default local/CI/production gate. ENABLE/FORCE RLS remain true. The worker receives no event payload, has no direct message SELECT, and cannot directly see C22 outbox payloads under existing RLS.

Claiming uses row locks and `SKIP LOCKED`; retries block later aggregate versions and missing predecessor versions remain blocked. Completion checks current owner and unexpired lease, clears the lease, and atomically records one terminal receipt per event/consumer. Repeated completion returns false and terminal events are not reclaimed. A publication followed by lease loss may produce another identical invalidation with the same event ID; it creates no second semantic message or terminal receipt.

Transient publication failures use the existing 1 minute, 5 minute, 30 minute, 2 hour, and 12 hour schedule with 10% jitter. Attempt six dead-letters; missing routing projection dead-letters immediately. Retry/DLQ use only closed codes: `f010_hint_publish_failed`, `f010_hint_projection_invalid`, and `f010_hint_retries_exhausted`. No new queue or DLQ table is added.

The runner uses a local/test stdout sink only. Writes are awaited, output-stream failure is handled with fixed safe text, and no raw exception is serialized. Production mode, non-synthetic mode, disabled activation, remote database host, and owner-role configuration fail closed before connecting. There is no production provider, notification template/channel, or client subscription implementation.

## T069 verification

Commands were run serially for each runtime:

```powershell
$env:SHIFAA_TEST_POSTGRES_RUNTIME='shifaa-local-postgres' # then shifaa-local-supabase
corepack pnpm test:encounters:realtime:db

$env:SHIFAA_TEST_F010_C22_ONLY='true'
$env:SHIFAA_TEST_F010_C23_REGRESSION='true'
$env:SHIFAA_TEST_POSTGRES_RUNTIME='shifaa-local-postgres' # then shifaa-local-supabase
node tools/run-feature-010-postgres-test.mjs
```

The C23 harness uses unique disposable databases, applies the migration chain only through C23, replays C23, verifies all three gate defaults are off and four affected tables retain ENABLE/FORCE RLS, and enables only the local test gate. Supabase fixture grants are confined to that disposable database; no shared login/password or online-worker grants are changed. Cleanup closes clients and drops only the guarded scratch database owned by the run.

| Check                                                                      | shifaa-local-postgres  | shifaa-local-supabase  |
| -------------------------------------------------------------------------- | ---------------------- | ---------------------- |
| C23 durable worker vectors                                                 | 11/11 passed, no skips | 11/11 passed, no skips |
| C22 SQL/API plus hint revocation probes with C23 migration applied         | Passed                 | Passed                 |
| C06 storage, C07 forced RLS, C11 participant cutoff, C13 completion cutoff | Passed                 | Passed                 |
| Send-first and completion-first locking races                              | Passed                 | Passed                 |
| Gate defaults, migration replay, scratch cleanup                           | Passed                 | Passed                 |

Durable vectors prove valid marker routing, retry/gap blocking then version 2 before version 3, concurrent distinct claims, stale-owner fencing, one receipt with duplicate completion rejected, five safe retries then DLQ, clinical extras rejected before insertion, worker ciphertext/payload denial, actual processor-to-store publication of exactly three fields, missing-message poison DLQ, and a hard production denial even if its flag is tampered on.

The C22 actual `buildApp` API test observes test-only duplicate/out-of-order refresh-hint fixtures and then makes real PostgreSQL-backed REST read/send requests. Ended workforce remains 403 for both; after actual encounter completion PAT history, stale pagination cursor, send, and canonical replay remain denied. Hint absence does not prevent authorized REST pagination; after closure REST denies even without a hint. These fixtures test the authorization consequence of observing a hint, not a browser subscription or production transport.

C22 owner inspection still finds exactly two encrypted message rows, two completed idempotency responses, two message audit effects, and two message outbox effects for its two successful sends. Added hint/negative requests produce no partial effects. Both valid send/completion orderings retain their original fail-closed counts.

Additional focused commands passed:

```text
corepack pnpm --filter @shifaa/worker exec node --test src/feature-010-realtime.test.ts src/feature-010-realtime.postgres.test.ts
corepack pnpm --filter @shifaa/worker exec node --test src/clinic-scheduling-notifications.test.ts src/privacy-dsr-notifications.test.ts
corepack pnpm --filter @shifaa/contracts exec vitest run src/feature-010.test.ts
corepack pnpm test:encounters:scope
corepack pnpm --filter @shifaa/worker typecheck
corepack pnpm --filter @shifaa/api typecheck
corepack pnpm architecture:check
```

The no-URL focused worker run passes ten unit/boundary tests and skips the database suite; the separate real-database runs above have no skips. Existing Feature 009/privacy worker regressions pass 17/17, Feature 010 contracts 6/6, and frozen scope 3/3. Architecture passes 18 boundaries and 17 package manifests. Targeted Prettier and `git diff --check` pass; historical ledger formatting is preserved. Full `pnpm verify` was not run, as instructed.

## Files changed

- `services/worker/src/feature-010-realtime.ts`
- `services/worker/src/feature-010-runner.ts`
- `services/worker/src/feature-010-realtime.test.ts`
- `services/worker/src/feature-010-realtime.postgres.test.ts`
- `supabase/migrations/20260930001000_f010_c23_realtime_hint.sql`
- `services/api/test/feature-010-messages.postgres.integration.test.ts`
- `tools/run-feature-010-realtime-postgres-test.mjs`
- `tools/run-feature-010-postgres-test.mjs`
- `package.json`
- `services/worker/package.json`
- `specs/010-encounters-referrals-contextual-chat/tasks.md`
- `specs/010-encounters-referrals-contextual-chat/evidence/C23-realtime.md`

## Privacy and root acceptance

Root inspected the consumer, SQL projection/completion, runner output paths, and test captures. Unit fault injection places prohibited content in thrown text and untrusted extra fields; captured hints and completion metadata contain none of it. Exact output keys exclude message body, ciphertext, note body, patient/participant identity or display names, clinical reasons/types, attachment data, and authorization fields. The worker never imports the message encryption boundary or selects ciphertext. The SQL payload constraint rejects extras with 23514 and zero retained rows; durable retry/DLQ metadata rejects unapproved error text and null DLQ codes with 22023. Actual terminal payload remains the exact two-field marker with one receipt. Runner failures print constants only. No prohibited content appeared in successful test output, worker event captures, retry captures, or DLQ representation.

Root review corrected nullable SQL parameter fallthroughs, awaited stdout completion/error handling, concurrent test ownership mapping, and fixture isolation/cleanup. All were reverified. REST is authoritative on every read/send; hints carry no entitlement, cursor authority, message content, or alternate message transport. Duplicate, missed, and stale hints leave revocation/completion intact.

Accepted: T067–T069 only. No Feature 009 runner change, notification template/channel, UI/C24 work, approved spec/plan/OpenAPI/baseline edit, or historical migration edit. All later gates remain open. Git integration and issue closure are performed by root after this acceptance; the evidence belongs to the resulting C23 commit.
