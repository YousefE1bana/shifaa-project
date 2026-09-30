# C04 schema evidence

## T010 red check

Before applying the F010 migration, the schema assertion was run against the existing standalone database:

```powershell
Get-Content -Raw infra/db/tests/feature-010-schema.sql | docker exec -i shifaa-local-postgres-postgres-1 psql -v ON_ERROR_STOP=1 -U shifaa_owner -d shifaa
```

It exited with code `1` and failed only because all six F010 relations were absent:

```text
BEGIN
ERROR:  F010 schema missing tables: clinical.encounters, clinical.encounter_participants, clinical.clinical_notes, clinical.conditions, clinical.referrals, trust.messages
CONTEXT:  PL/pgSQL function inline_code_block line 26 at RAISE
```

The statement is wrapped in a transaction that rolls back. The failure is the expected missing-schema result, not a SQL parse or fixture error.

## T011/T012 fresh and replay checks

The migration is `supabase/migrations/20260926001000_encounters_referrals_contextual_chat.sql`. It is included in the standalone `db:migrate` script and its schema assertion is included in `db:test`; the focused runner is `pnpm test:encounters:schema`.

Command run:

```powershell
node tools/run-feature-010-postgres-test.mjs
```

The runner creates uniquely named scratch databases from `template0` in each current named runtime. It applies the standalone migration chain through the migration immediately before F010, captures the F009 appointments/queue schema, applies F010, runs the schema assertions, replays F010 in the same database, reruns the assertions, compares the F009 schema dump, then drops only that scratch database.

Results:

```text
shifaa-local-postgres: C04 default-deny snapshot: forced_rls=6/6; policies=0; direct_online_acl_entries=0
shifaa-local-postgres: fresh migration, same-database replay, schema assertions, and F009 schema parity passed.
shifaa-local-supabase: C04 default-deny snapshot: forced_rls=6/6; policies=0; direct_online_acl_entries=0
shifaa-local-supabase: fresh migration, same-database replay, schema assertions, and F009 schema parity passed.
```

The first parity comparison exposed only pg_dump's per-invocation random `\\restrict`/`\\unrestrict` psql safety tokens. The runner now removes those volatile directive lines before comparing the table-specific `clinical.appointments` and `clinical.queue_entries` schema dumps; the object definitions remain compared. Both fresh/replay runs passed after that normalization.

The active databases in both named runtimes remain unchanged: the six F010 relations are still absent there, and the runner left no `f010_c04_*` scratch databases. No reset/down command or volume operation was used.

## Scope boundary

`clinical.encounters.appointment_id` is nullable in the general schema and is protected by its FK and partial unique-open-appointment index. The C04 migration documents this on the column. The Feature 010 `createEncounter` producer must require and validate a linked appointment when it is implemented in C05; C04 adds no discriminator, trigger, or lifecycle/transition procedure. Direct table privileges are revoked and all six tables have RLS enabled and forced; C04 adds no policies or helper grants. The `policies=0` and direct privilege snapshot above is evidence for this checkpoint only, not a permanent assertion in the schema fixture, so the later C07 policy checkpoint can add its approved action matrix.

The durable SQL fixture checks all six tables' column types/nullability, UUID foreign-key mappings (including same-encounter note supersession), UTC timestamp and version fields, encounter/referral states, the partial unique open-appointment index, optional zero-or-more UUID reference defaults, note visibility, referral authorization/acceptance fields, message edit/delete markers and null attachment, and forced RLS.

## Focused checks

```text
node --check tools/run-feature-010-postgres-test.mjs — passed
node tools/run-feature-010-postgres-test.mjs — passed on both named runtimes
```

`pnpm verify` and live UI acceptance were not run; they are outside C04.
