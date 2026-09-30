# C06 storage integrity evidence

## T016 RED

The new `infra/db/tests/feature-010-storage-invariants.sql` ran against a fresh disposable `shifaa-local-postgres` database before the C06 migration guards were added:

```text
node tools/run-feature-010-postgres-test.mjs
exit 1 (psql exit 3)
C04 default-deny snapshot: forced_rls=6/6; policies=0; direct_online_acl_entries=0
ERROR: missing F010 signed-note no-update guard
CONTEXT: PL/pgSQL function inline_code_block line 12 at RAISE
```

The baseline migrations, F010 schema, C04 assertions, C05 lifecycle vectors, and C06 synthetic fixture setup all completed before this assertion. The failure was the permitted UPDATE of an already signed note, not SQL syntax or fixture setup.

## T017 storage boundary

- A signed clinical note rejects UPDATE and DELETE. Corrections insert a new row referencing a signed note in the same encounter; the prior ciphertext and visibility remain unchanged. The existing private/patient_visible check and composite same-encounter FK remain in force.
- A referral's patient must match its source encounter's patient. An explicitly selected encounter type must equal the source encounter's type. Accepted appointment patient, facility, and doctor must match the referral's resolved target. An accepted referral cannot change its linkage or selected disclosure; the existing pending/accepted check and unique resulting-appointment index remain in force.
- Note and message bodies remain nonempty ciphertext `bytea` at rest. The existing appointment-only message context and SQL-NULL attachment check remain in force. The migration adds no cryptography, key handling, retention duration, target-disclosure read policy, API transaction, RLS policy, or online EXECUTE grant.

## T018 GREEN

```text
corepack pnpm test:encounters:schema
exit 0
shifaa-local-postgres: C04 default-deny snapshot: forced_rls=6/6; policies=0; direct_online_acl_entries=0
shifaa-local-postgres: fresh migration, same-database replay, schema assertions, and F009 schema parity passed.
shifaa-local-supabase: C04 default-deny snapshot: forced_rls=6/6; policies=0; direct_online_acl_entries=0
shifaa-local-supabase: F009 lifecycle run omits the direct SET ROLE shifaa_api subvector (role membership is unavailable).
shifaa-local-supabase: fresh migration, same-database replay, schema assertions, and F009 schema parity passed.
```

The storage vectors ran after the fresh migration and after replay in each named runtime. They use synthetic IDs and opaque synthetic bytes and roll back their fixture transaction. Negatives cover mutable signed notes, unsupported visibility, empty ciphertext, cross-encounter supersession, invalid referral status, mismatched referral patient/encounter type/appointment, pending appointment/disclosure, duplicate or unapproved disclosure selection, duplicate appointment link, accepted disclosure mutation/reversal, non-appointment context, blank message body, and JSON or object attachment values. Positive vectors cover a same-encounter note correction, both approved referral disclosure selections, and an appointment-context message with SQL-NULL attachment. The runner also executes the C04 schema assertions, C05 lifecycle vectors, and the existing F009 check-in/queue regression against the fresh F010 schema; F009 appointment/queue schema dumps are unchanged after F010 replay.

```text
corepack pnpm test:encounters:scope                         exit 0 (3/3)
corepack pnpm exec prettier --check tools/run-feature-010-postgres-test.mjs  exit 0
node --check tools/run-feature-010-postgres-test.mjs       exit 0
git diff --check                                           exit 0
```

The existing Supabase runner omits only the final direct `SET ROLE shifaa_api` subvector of the F009 regression because the local Supabase `postgres` login lacks that role membership; its earlier F009 transitions run in both runtimes. C07 must implement live RLS and authorization. Later API checkpoints must encrypt through the existing adapter and enforce request-level attachment rejection and transactional audit/outbox/idempotency. Full `pnpm verify` and live Arabic/English acceptance were intentionally outside C06.
