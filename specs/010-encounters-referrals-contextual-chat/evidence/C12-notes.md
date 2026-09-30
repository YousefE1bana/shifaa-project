# C12 signed note implementation evidence

**Scope:** T034–T036 (`signEncounterNote`, encrypted append-only versions, and the authorized `fields=notes` projection).

## RED evidence

Before implementation, the route integration tests failed on the missing behavior rather than fixture setup:

```powershell
pnpm --filter @shifaa/api exec vitest run test/feature-010-notes.integration.test.ts
```

The note-sign request expected `201` and received `404`; authorized `fields=notes` reads expected `200` and received `503` for both care-team and patient projections.

The real-PostgreSQL probe applied the approved F010, C10, and C11 migrations, then stopped at its explicit missing-signer marker before creating note fixtures:

```powershell
$env:SHIFAA_TEST_F010_C12_RED = 'true'
try { node tools/run-feature-010-postgres-test.mjs }
finally { Remove-Item Env:\SHIFAA_TEST_F010_C12_RED -ErrorAction SilentlyContinue }
```

Both `shifaa-local-postgres` and `shifaa-local-supabase` reported `F010_C12_MISSING_SIGNER: clinical.sign_encounter_note_api_v1(uuid,jsonb)`. The runner itself exited successfully because it recognized the expected RED marker; that exit is not a GREEN test result.

## GREEN evidence

Focused API tests and typechecking:

```powershell
pnpm --filter @shifaa/api typecheck
pnpm --filter @shifaa/api exec vitest run test/feature-010-notes.integration.test.ts test/feature-010-notes-adapter.test.ts test/feature-010-update.integration.test.ts src/routes/feature-010-encounters.contract.test.ts
```

Typecheck passed. Vitest passed all 20 tests across 4 files. The note adapter test confirms only ciphertext reaches SQL, stored protected responses decrypt to the canonical API response on replay, and a tampered envelope fails closed. Route tests cover signing, `fields=notes`, patient-visible-only notes, blank bodies, AAL2, and purpose enforcement.

The focused real-PostgreSQL runner applies F010/C10/C11/C12, runs the C11 fixture with C12 signer/projection assertions, reapplies C12, and repeats the vectors. The commands were run serially:

```powershell
$env:SHIFAA_TEST_F010_C12_ONLY = 'true'
$env:SHIFAA_TEST_POSTGRES_RUNTIME = 'shifaa-local-postgres'
try { node tools/run-feature-010-postgres-test.mjs }
finally { Remove-Item Env:\SHIFAA_TEST_F010_C12_ONLY,Env:\SHIFAA_TEST_POSTGRES_RUNTIME -ErrorAction SilentlyContinue }
```

Result: `shifaa-local-postgres: focused C12 note signing and projection PostgreSQL vectors passed.`

```powershell
$env:SHIFAA_TEST_F010_C12_ONLY = 'true'
$env:SHIFAA_TEST_POSTGRES_RUNTIME = 'shifaa-local-supabase'
try { node tools/run-feature-010-postgres-test.mjs }
finally { Remove-Item Env:\SHIFAA_TEST_F010_C12_ONLY,Env:\SHIFAA_TEST_POSTGRES_RUNTIME -ErrorAction SilentlyContinue }
```

Result: `shifaa-local-supabase: focused C12 note signing and projection PostgreSQL vectors passed.`

The PostgreSQL vectors verify narrow function grants, live current-clinician authorization, original-author and responsible-clinician correction, unrelated-clinician and cross-encounter denial, revoked-authority and completed-encounter denial, malformed visibility and ciphertext-envelope denial, exact same-key replay, changed-body conflict, encrypted stored response, and unchanged note/idempotency/audit/outbox counts immediately after the negative cases. They also verify one note/audit/outbox effect per successful key, immutable history, and private exclusion for PAT/GUA/DEL while CLN can read private ciphertext. The SQL assertions verify the stored idempotency response and outbox payload do not contain a plaintext body; they verify audit event JSON has no body/bodyCiphertext field or note-type sentinel. Referral and signature-evidence tables are not asserted by these vectors; code inspection confirms this C12 signing path does not write to either table.
