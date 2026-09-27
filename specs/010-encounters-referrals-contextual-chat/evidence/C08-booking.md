# C08 composable F009 booking seam evidence

Date: 2026-09-27. All IDs and records in these vectors are synthetic, and the PostgreSQL databases are disposable local scratch databases.

## T022 RED

`infra/db/tests/feature-010-booking-seam.sql` first exercised the existing public `clinical.create_appointment_v1` on the pre-F010 migration chain. Its fee snapshot, `EGP`, `cash_on_arrival`, result/problem semantics, same-key replay, changed-body conflict, effective availability, and exclusion checks passed. The test then failed at the required absent primitive, before any C08 migration edit:

```text
node tools/run-feature-010-postgres-test.mjs
shifaa-local-postgres expected C08 RED: psql exit 3
NOTICE: F009_BOOKING_PARITY_PASS: authoritative fee/EGP/cash, public result and problem semantics, same-key replay and changed-body conflict, effective availability and exclusion
ERROR: F010_INTERNAL_BOOKING_PRIMITIVE_MISSING: clinical.book_appointment_internal_v1(jsonb,integer,jsonb)
```

The same expected RED was reproduced on `shifaa-local-supabase` during the final focused run. The prior parity notice proves the failure was the missing primitive, not broken fixture setup or SQL syntax.

## T023 boundary

The forward F010 migration adds `clinical.book_appointment_internal_v1(p_input jsonb, p_expected_schedule_version integer DEFAULT NULL, p_expected_slot jsonb DEFAULT NULL) RETURNS uuid`. It locks the authoritative schedule, verifies existing F009 schedule/time scope, snapshots the schedule fee with `EGP` and `cash_on_arrival`, and inserts the appointment under the existing exclusion constraint. When supplied for F010, the expected version and exact effective start/end/timezone/civil-date/local-start tuple are checked under the schedule lock, including weekly windows and exceptions. It has no direct online EXECUTE grant and writes no operation-level idempotency, audit, outbox, or canonical-response record.

The public F009 `create_appointment_v1` wrapper calls the primitive without the F010-only version/slot preconditions. It retains its public validation, patient-scope check, idempotency replay/conflict, canonical result, audit/outbox, failure injection, and stored response. No historical migration or public API operation changed. `acceptReferral` remains unimplemented in C08.

## T024 focused verification

```text
corepack pnpm test:encounters:schema          exit 0
  shifaa-local-postgres: fresh migration, replay, C04–C07 checks and F009 schema parity passed
  shifaa-local-supabase: fresh migration, replay, C04–C07 checks and F009 schema parity passed
  both: concurrent F009 booking had one winner and one 23P01 loser;
        appointment/idempotency/audit/outbox counts were 1 each
  both: two version-stale primitive contenders returned 40001 after the locked schedule advanced;
        no appointment was created by either stale request
corepack pnpm test:clinic-scheduling:db       exit 0; 9/9 tests
corepack pnpm test:clinic-scheduling:rls      exit 0
corepack pnpm test:clinic-scheduling:contract exit 0; 18 F009 operation IDs retained
corepack pnpm test:encounters:scope           exit 0; 3/3 tests
node --check tools/run-feature-010-postgres-test.mjs                         exit 0
corepack pnpm exec prettier --check tools/run-feature-010-postgres-test.mjs exit 0
git diff --check                                                        exit 0
```

The serial C08 vectors also proved a direct primitive call creates one authoritative appointment and zero independent operation records; wrong slot, blocked effective slot, and stale schedule version fail without partial effects. The F009 public same-key replay returned its stored result with exactly one appointment, idempotency record, audit event, and outbox event. Changed body and invalid fee/payment requests retained their approved conflict/problem behavior.

The local Supabase runner still omits its historical F009 direct `SET ROLE shifaa_api` subvector because that login lacks role membership; no F010 C08 vector was omitted. The separate F009 forced-RLS regression passed. Root review found no approved authority artifact, API/UI, Feature 011, later gate, or C09 implementation change. Full `pnpm verify` and live acceptance remain later integration work.
