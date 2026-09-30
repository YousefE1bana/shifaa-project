# C17 — Referral creation and source list evidence

**Scope:** T049–T051 / issues #356–#358 only. Starting HEAD `32c8fb0f4eeb78dacb4cacb827348a89b1e903b5` on `codex/010-encounters-referrals-contextual-chat`. Fixtures use synthetic people, encounters, notes, and referral reasons. Before code, #356–#358 handoff markers were repaired and resolved to T049→T050→T051; T049 was the next open task after C16.

## T049 RED

The new `services/api/test/feature-010-referral-create.integration.test.ts` was run before the route existed:

```text
corepack pnpm --filter @shifaa/api exec vitest run test/feature-010-referral-create.integration.test.ts
```

Result: **exit 1**, with the expected `Failed to resolve import "../src/routes/feature-010-referrals.js"` missing implementation error (zero tests collected). This was the intended absent route boundary. The tests cover required and nonblank specialty/reason, optional explicit encounter type, closed request fields, pending source projection, no target pending result, no appointment or note fields, exact idempotency replay, changed-body conflict, and request context denial. The real-PostgreSQL vectors below verify storage and effect counts that a route mock cannot prove.

## T050 implementation boundary

The Core API exposes only `createReferral` and `listReferrals`. The new forward C17 migration provides locked PostgreSQL entrypoints with `SECURITY DEFINER`, pinned empty search path, and `shifaa_api`-only EXECUTE grants; the online role has no direct referral or clinical table DML. Creation locks the linked appointment and source encounter, rechecks the current treating clinician, active participant, facility membership, license, purpose, and AAL2, and inserts a pending referral with a SQL NULL resulting appointment. C07 authorization and role projection are reused for the source response and cursor list. The mutation transaction writes the referral, one audit event, one PHI-free outbox event, and the canonical stored idempotency response together. Replay returns that stored response; changed-body key reuse conflicts. No acceptance or booking path was added.

## T051 GREEN

Focused API, contract, scope, and architecture commands:

```text
pnpm --filter @shifaa/api exec vitest run src/routes/feature-010-encounters.contract.test.ts test/feature-010-referral-create.integration.test.ts
pnpm --filter @shifaa/api typecheck
pnpm test:encounters:scope
pnpm --filter @shifaa/contracts test -- feature-010
node tools/verify-contracts.mjs
pnpm architecture:check
```

Results: **18/18 API tests** in two files; API typecheck passed; **3/3 scope tests**; **6/6 Feature 010 contract tests**; contract verifier passed across 97 OpenAPI operations; architecture check passed across 18 canonical boundaries and 17 package manifests.

The focused PostgreSQL runner was run serially on both named local runtimes. It creates and drops disposable scratch databases without changing persistent runtime data:

```powershell
$env:SHIFAA_TEST_F010_C17_ONLY='true'; $env:SHIFAA_TEST_POSTGRES_RUNTIME='shifaa-local-postgres'; node tools/run-feature-010-postgres-test.mjs
$env:SHIFAA_TEST_F010_C17_ONLY='true'; $env:SHIFAA_TEST_POSTGRES_RUNTIME='shifaa-local-supabase'; node tools/run-feature-010-postgres-test.mjs
```

Both runs **passed** fresh and replayed C17 migration/vector checks under non-owner, non-BYPASSRLS `shifaa_api`, plus C06 storage and C07 RLS regression vectors. The C17 vectors assert:

- Required nonblank specialty and reason; an explicit encounter type must match the locked source.
- One pending referral with `resulting_appointment_id IS NULL`; source clinician list returns its source projection, while the target clinician receives zero rows before acceptance.
- Source response and list contain no note body, private-note metadata, or appointment field. The existing C07 role projection supplies only contracted fields; the outbox payload contains aggregate ID and version only.
- Identical key/body replay equals the canonical stored response. Changed-body reuse is rejected; a successful request leaves exactly one referral, audit event, outbox event, and completed idempotency record.
- Missing fields, mismatched encounter type, stale completed source, unauthorized target clinician, missing purpose, and low AAL leave no extra or partial referral/audit/outbox/idempotency effects.
- Public/anonymous EXECUTE and online direct clinical table privileges remain denied.

Formatting and diff checks passed:

```text
pnpm exec prettier --check package.json services/api/src/app.ts tools/run-feature-010-postgres-test.mjs services/api/src/adapters/postgres/feature-010-referrals.ts services/api/src/modules/feature-010/referrals.ts services/api/src/routes/feature-010-referrals.ts services/api/test/feature-010-referral-create.integration.test.ts
git diff --check
```

## Root review and limits

Pending target existence is hidden by current C07 authorization before the role projection or cursor page is returned. New request, response, SQL projection, audit, and outbox paths contain no clinical note body or private-note existence cue. No `acceptReferral`, booking, fee, currency, payment, or client writes were added. Approved visual baselines, authority documents, historical migrations, and C18 tasks were not changed.

This is synthetic local/test evidence. `OPEN-LEGAL-001`, `OPEN-LEGAL-002`, `OPEN-LEGAL-007`, `OPEN-UX-001`, `OPEN-UX-002`, `OPEN-PRODUCT-001`, `OPEN-TECH-002`, and `OPEN-TECH-003` remain recorded; this checkpoint does not close them. Full `pnpm verify` was not run, as requested for C17.
