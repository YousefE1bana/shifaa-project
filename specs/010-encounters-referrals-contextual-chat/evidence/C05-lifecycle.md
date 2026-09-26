# C05 lifecycle producer evidence

## T013 RED

Before adding the F010 producer functions, ran the focused lifecycle runner against the named `shifaa-local-postgres` runtime:

```text
node tools/run-feature-010-postgres-test.mjs
```

The baseline and F010 schema were applied, schema assertions and fixture setup completed, and the lifecycle test stopped at the intended missing-producer assertion (exit code 3):

```text
C04 default-deny snapshot: forced_rls=6/6; policies=0; direct_online_acl_entries=0
ERROR: missing F010 createEncounter producer guard: clinical.create_encounter_v1(jsonb)
```

This established the RED at the missing F010 producer boundary, with no parse or fixture setup error.

## T015 GREEN

After implementing the C05 producer guards, reran the focused runner serially against disposable scratch databases in both named runtimes. The runner applies the baseline migrations, the forward F010 migration, schema and lifecycle assertions, the F009 check-in/queue regression fixture after F010, and a same-database F010 replay. It drops each scratch database in a `finally` block; the existing runtime volumes are preserved.

Command:

```text
node tools/run-feature-010-postgres-test.mjs
```

Result (exit code 0):

```text
shifaa-local-postgres: format
 C04 default-deny snapshot: forced_rls=6/6; policies=0; direct_online_acl_entries=0
(1 row)
shifaa-local-postgres: fresh migration, same-database replay, schema assertions, and F009 schema parity passed.
shifaa-local-supabase: format
------------------------------------------------------------------------------------
 C04 default-deny snapshot: forced_rls=6/6; policies=0; direct_online_acl_entries=0
(1 row)
shifaa-local-supabase: F009 lifecycle run omits the direct SET ROLE shifaa_api subvector (role membership is unavailable).
shifaa-local-supabase: fresh migration, same-database replay, schema assertions, and F009 schema parity passed.
```

The lifecycle vectors cover checked-in plus called eligibility, missing and mismatched queue scope, duplicate open encounter rejection, unauthorized clinician and missing AAL/purpose rejection without effects, client workforce-ID rejection, creation of the open encounter with one responsible-clinician interval, completion with zero optional references, required summary and explicit confirmation, stale-version rollback, and rejection of the legacy broad `allowed` marker for F010 transitions. The current membership/licence/patient authorization query runs after the appointment and matching queue are locked and duplicate-open eligibility is rechecked, immediately before encounter insertion.

The complete F009 fixture, including its direct `SET ROLE shifaa_api` subvector, passed against `shifaa-local-postgres` after F010. On `shifaa-local-supabase`, only that final subvector is omitted because the runtime's `postgres` login is not a member of `shifaa_api`; no cluster-wide role membership was added for this test. The earlier F009 appointment/check-in and queue lifecycle vectors ran in both runtimes.

## Scope and limitations

- The migration adds only the C05 lifecycle producer boundary. C05 producer functions have no API-role grant; C07 must bind the approved clinical purpose and RLS/API access before exposure.
- Producer authorization requires a current CLN actor, actor matching the appointment doctor, active facility membership, current verified licence, active patient, AAL2, and a nonempty purpose context. It does not introduce a purpose code.
- Idempotency, audit, and outbox mutation checkpoints remain later work; those checkpoints must wrap the producer effects atomically.
- `pnpm verify` and live Arabic/English acceptance were not run as part of this focused C05 handoff.

After moving the live authorization recheck under the appointment and queue locks, reran `node tools/run-feature-010-postgres-test.mjs`; it again exited 0 with the same two-runtime results above.
