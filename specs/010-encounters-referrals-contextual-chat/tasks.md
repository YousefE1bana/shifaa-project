# Tasks: Feature 010 — Encounters, Referrals, and Contextual Chat

> **Feature:** `010-encounters-referrals-contextual-chat` · **Plan status:** `PLAN_APPROVED` · **Ledger status:** generated, all boxes open
> Source of truth: approved `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/openapi.yaml`, `quickstart.md`, dated reconciliation/Plan Gate, and approved TEST-ONLY UX manifest SHA-256 `18e4471d686990e797e8a5e370a20ceda7ea823020e3f84fdea0e03a65394310`.

## Rules

- Exactly `FR-CLINIC-006`, `FR-CLINIC-007`, `FR-FAC-006`; exactly 23 PATIENT ∪ REALTIME NFRs; exactly ten approved operation IDs. `PLAN_APPROVED` authorizes this ledger, not implementation or later gate closure.
- All tasks are unchecked. Each checkpoint has a red test, one bounded implementation step, and a focused green check/evidence step, except the final two-task full-verification checkpoint. A task's completion requires its own acceptance evidence. Test-first means the red test must fail for the intended missing behavior, not broken fixtures or syntax.
- The dependency chain is intentionally serial across checkpoints because migration, F009 booking, authorization and shared DB/test state can interfere. No `[P]` tasks are declared; code-only work may be separately reapproved for parallel ownership after its predecessor is complete.
- Use current standalone `shifaa-local-postgres` and local Supabase `shifaa-local-supabase`; tests use synthetic data. Do not reset/delete retired rollback volumes. Preserve F009 migrations, F009 external `createAppointment` behavior, and all approved Feature 010 reference PNGs.
- No arbitrary workforce IDs on create; exactly one server-derived responsible-clinician interval initially. No participant-add API/picker. `updateEncounter` may end only a current non-responsible interval. Chat is body-only, appointment-context and open/in-consultation only; no attachment property, patient inbox, general consultation, offline write, Feature 011, prescription/safety or post-026 Polish work.
- The seven later-stage gate effects and program-wide `OPEN-UX-001` remain recorded: `OPEN-LEGAL-001`, `OPEN-LEGAL-002`, `OPEN-LEGAL-007`, `OPEN-UX-001`, `OPEN-UX-002`, `OPEN-PRODUCT-001`, `OPEN-TECH-002`, `OPEN-TECH-003`. Feature 010's TEST-ONLY functional `OPEN-UX-001` prerequisite is already approved; no other approval is inferred.
- A new F010 migration path named below is a forward implementation target; if the repository has acquired a conflicting migration filename by execution time, select the next valid forward filename and record the exact substitution before implementation. Never edit historical migrations.

## Phase map and dependency order

Semantic dependency order: `C01→C02→C03→C04→C05→C06→C07→C08→C09→C10→C11→C12→C13→C14→C15→C16`, then independent branches `C17→C18→C19→C20→C21` (US2) and `C22→C23→C24→C25` (US3), joined at `C26→C27→C28→C29`. T049 and T064 both depend on T048; T076 depends on both T063 and T075. Within each checkpoint, tasks depend on the preceding task. C01–C08 are shared foundations; C09–C16 deliver US1; C26–C28 collect focused hardening evidence; C29 alone runs full `corepack pnpm verify`. Sequential execution of the two branches is an orchestration preference when they share API/DB/worker test state, not a semantic dependency. The smallest independently demonstrable MVP is US1 after C01–C16, with synthetic encounter create/read/update/sign/complete and released patient projection.


## Phase 1 — Contract and scope foundation

### C01 — Frozen scope and predecessor guard
**Independent outcome:** Machine checks reject scope drift before implementation.
**Focused checkpoint:** 3 tasks; complete in order and stop on failure.

- [ ] T001 [FR-CLINIC-006, FR-CLINIC-007, FR-FAC-006, NFR-QUALITY-001] Write failing inventory tests for 3 FRs, 23 NFRs, 10 operation IDs, exactly AC-01–AC-14, eight gate IDs, approved baseline digest, and the F009 producer boundary; reject missing/duplicate ACs in the approved spec or checkpoint closure table — `tools/verify-feature-010-scope.test.mjs`
  - Depends on: `none`
  - Acceptance evidence: `node --test tools/verify-feature-010-scope.test.mjs fails only for the missing verifier`

- [ ] T002 [FR-CLINIC-006, FR-CLINIC-007, FR-FAC-006, NFR-QUALITY-001] Implement the read-only scope verifier using the approved spec, plan, catalog, tasks AC-01–AC-14 closure table and manifest; add a focused test script without changing those authorities — `tools/verify-feature-010-scope.mjs; package.json`
  - Depends on: `T001`
  - Acceptance evidence: `node tools/verify-feature-010-scope.mjs exits 0 on the frozen inventory and rejects injected drift`

- [ ] T003 [FR-CLINIC-006, FR-CLINIC-007, FR-FAC-006, NFR-QUALITY-001] Run scope including the 14 AC inventory/closure mapping, baseline, and existing F009 scope/contract checks; record exact command results before DB work — `specs/010-encounters-referrals-contextual-chat/evidence/C01-scope.md`
  - Depends on: `T002`
  - Acceptance evidence: `scope verifier, baseline validator, test:clinic-scheduling:scope and :contract pass`


### C02 — Generated wire contract
**Independent outcome:** Typed source matches the ten approved planning operations.
**Focused checkpoint:** 3 tasks; complete in order and stop on failure.

- [ ] T004 [NFR-API-001, NFR-API-002, NFR-SEC-005] Write red tests for closed request schemas, role projections, RFC 9457 problems, seven Idempotency-Key mutations, three If-Match mutations, and 25/100 cursor limits — `packages/contracts/src/feature-010.test.ts`
  - Depends on: `T003`
  - Acceptance evidence: `focused contract test fails only for missing generated Feature 010 schemas`

- [ ] T005 [NFR-API-001, NFR-API-002, NFR-SEC-005] Add a deterministic generator from the approved OpenAPI 3.1.1 planning source and generate the typed contract module; preserve exactly ten operation IDs — `tools/generate-feature-010-contract.mjs; packages/contracts/src/feature-010.ts; packages/contracts/src/index.ts`
  - Depends on: `T004`
  - Acceptance evidence: `regeneration has zero diff and focused contract tests pass`

- [ ] T006 [NFR-API-001, NFR-API-002, NFR-QUALITY-001] Register contract parity in the existing verifier and run the focused generated-schema check — `tools/verify-contracts.mjs; specs/010-encounters-referrals-contextual-chat/evidence/C02-contract.md`
  - Depends on: `T005`
  - Acceptance evidence: `corepack pnpm contracts:check passes with 10 Feature 010 IDs and no extra route`


### C03 — Generated client and native session boundary
**Independent outcome:** Contract-only client generated directly from the approved OpenAPI source uses typed calls and existing native Auth/session context.
**Focused checkpoint:** 3 tasks; complete in order and stop on failure.

C03 intentionally precedes DB/API implementation: its stable typed boundary is consumed by later checkpoints. Generating and testing this client does not imply a Feature 010 backend exists yet.

- [ ] T007 [NFR-API-001, NFR-SEC-003, NFR-SEC-004] Write red client tests for headers, actor context, no-store responses, 401/403/409/422 problems, and absence of direct PostgREST clinical writes — `packages/api-client/src/feature-010.test.ts`
  - Depends on: `T006`
  - Acceptance evidence: `focused client test fails only for absent Feature 010 client`

- [ ] T008 [NFR-API-001, NFR-SEC-003, NFR-SEC-004] Generate the contract-only Feature 010 API client directly from the approved OpenAPI source and export it; reuse current bearer/AAL session handling without assuming implemented backend routes — `packages/api-client/src/feature-010.ts; packages/api-client/src/index.ts; packages/api-client/package.json`
  - Depends on: `T007`
  - Acceptance evidence: `client regeneration is stable; no handwritten endpoint or shadow session`

- [ ] T009 [NFR-API-001, NFR-SEC-003, NFR-QUALITY-001] Run contract/client tests and prove the operation inventory and generated markers — `specs/010-encounters-referrals-contextual-chat/evidence/C03-client.md`
  - Depends on: `T008`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/api-client test and contracts:check pass`



## Phase 2 — Data, transaction and RLS foundation

### C04 — Six-area forward schema
**Independent outcome:** Additive F010 schema is migration-safe in both local runtimes.
**Focused checkpoint:** 3 tasks; complete in order and stop on failure.

- [ ] T010 [FR-CLINIC-006, FR-CLINIC-007, FR-FAC-006, NFR-DATA-001, NFR-DATA-002] Write red schema checks for six canonical areas, UUID/FK/nullability, UTC/version, open|completed, pending|accepted, partial unique open appointment, and zero-or-more references — `infra/db/tests/feature-010-schema.sql`
  - Depends on: `T009`
  - Acceptance evidence: `new schema assertions fail on missing F010 objects only`

- [ ] T011 [FR-CLINIC-006, FR-CLINIC-007, FR-FAC-006, NFR-DATA-001, NFR-DATA-002, NFR-PERF-002] Create forward additive tables/indexes in a new F010 migration; require linked appointment on F010 insert while general appointment_id remains nullable; leave F009 migrations untouched — `supabase/migrations/20260926001000_encounters_referrals_contextual_chat.sql`
  - Depends on: `T010`
  - Acceptance evidence: `schema test passes on fresh shifaa-local-postgres and shifaa-local-supabase`

- [ ] T012 [NFR-DATA-001, NFR-DATA-002, NFR-QUALITY-001] Add F010 migration to the standalone reset chain and run fresh schema/replay checks in both named local runtimes — `package.json; tools/run-feature-010-postgres-test.mjs; specs/010-encounters-referrals-contextual-chat/evidence/C04-schema.md`
  - Depends on: `T011`
  - Acceptance evidence: `fresh migration and repeat application pass without changing F009 schema/evidence`


### C05 — Encounter producer guards
**Independent outcome:** Only F010 starts and completes the linked appointment/queue triple.
**Focused checkpoint:** 3 tasks; complete in order and stop on failure.

- [ ] T013 [FR-CLINIC-006, NFR-DATA-001, NFR-SEC-005] Write red real-Postgres vectors for checked_in/called creation, missing/mismatched queue, duplicate open, and atomic completion with zero optional references — `infra/db/tests/feature-010-lifecycle.sql`
  - Depends on: `T012`
  - Acceptance evidence: `test fails for missing F010 producer guards, not fixture setup`

- [ ] T014 [FR-CLINIC-006, NFR-DATA-001, NFR-SEC-005] Extend F009 appointment/queue transition guards only for createEncounter and completeEncounter; lock in stable order, derive one responsible interval, reject client workforce IDs, require nonblank summary plus explicit confirmation — `supabase/migrations/20260926001000_encounters_referrals_contextual_chat.sql`
  - Depends on: `T013`
  - Acceptance evidence: `invalid source state or stale version rolls back all three states and effects`

- [ ] T015 [FR-CLINIC-006, NFR-DATA-001, NFR-QUALITY-001] Run lifecycle/schema tests and F009 transition regression after the forward migration — `specs/010-encounters-referrals-contextual-chat/evidence/C05-lifecycle.md`
  - Depends on: `T014`
  - Acceptance evidence: `F010 atomic vectors and existing F009 check-in/queue tests pass`


### C06 — Note, referral and message invariants
**Independent outcome:** Storage prevents mutable signed notes, premature referral disclosure and attachments.
**Focused checkpoint:** 3 tasks; complete in order and stop on failure.

- [ ] T016 [FR-CLINIC-006, FR-CLINIC-007, FR-FAC-006, NFR-SEC-002, NFR-PRIV-004] Write red SQL checks for private|patient_visible signed append-only same-encounter supersession, pending|accepted referral link/field selection, and appointment-only messages with attachment SQL NULL — `infra/db/tests/feature-010-storage-invariants.sql`
  - Depends on: `T015`
  - Acceptance evidence: `missing check/constraint/supersession rules fail deterministically`

- [ ] T017 [FR-CLINIC-006, FR-CLINIC-007, FR-FAC-006, NFR-SEC-002, NFR-PRIV-004, NFR-DATA-002] Add narrow encryption-backed inserts, signed-note no-update/no-delete guards, referral uniqueness, and body-only message constraints without retention durations — `supabase/migrations/20260926001000_encounters_referrals_contextual_chat.sql`
  - Depends on: `T016`
  - Acceptance evidence: `signed prior versions persist; pending target sees nothing; valid message attachment is SQL NULL`

- [ ] T018 [NFR-SEC-002, NFR-PRIV-004, NFR-QUALITY-001] Run the storage invariant and migration replay checks with synthetic data — `specs/010-encounters-referrals-contextual-chat/evidence/C06-storage.md`
  - Depends on: `T017`
  - Acceptance evidence: `all note/referral/message negative constraints pass`


### C07 — Forced RLS and live authority
**Independent outcome:** Every action has independent fail-closed SQL policy.
**Focused checkpoint:** 3 tasks; complete in order and stop on failure.

- [ ] T019 [FR-CLINIC-006, FR-CLINIC-007, FR-FAC-006, NFR-SEC-001, NFR-SEC-004, NFR-PRIV-002] Write red non-owner matrix for all ten operations: PAT/GUA/DEL/CLN, live grants, facility/purpose/AAL, private note exclusion, pending target denial, and ended participant denial — `infra/db/tests/feature-010-rls.sql`
  - Depends on: `T018`
  - Acceptance evidence: `each denied actor/action returns no clinical row and no write`

- [ ] T020 [FR-CLINIC-006, FR-CLINIC-007, FR-FAC-006, NFR-SEC-001, NFR-SEC-004, NFR-PRIV-002] ENABLE/FORCE RLS on new tables, default deny, fixed-search-path narrow helpers, non-owner EXECUTE grants and current-authority projections; no owner/service-role online bypass — `supabase/migrations/20260926001000_encounters_referrals_contextual_chat.sql`
  - Depends on: `T019`
  - Acceptance evidence: `SQL matrix passes under shifaa_api without BYPASSRLS`

- [ ] T021 [NFR-SEC-001, NFR-SEC-004, NFR-QUALITY-001] Run full F010 SQL RLS matrix and relevant F009 forced-RLS regression — `specs/010-encounters-referrals-contextual-chat/evidence/C07-rls.md`
  - Depends on: `T020`
  - Acceptance evidence: `all current-authority allow/deny rows and F009 negatives pass`


### C08 — Composable F009 booking seam
**Independent outcome:** Both wrappers preserve one-winner booking without a new API operation.
**Focused checkpoint:** 3 tasks; complete in order and stop on failure.

- [ ] T022 [FR-CLINIC-007, NFR-SEC-005, NFR-DATA-001] Write red regression for existing createAppointment fee/EGP/cash, request/result/problems, replay and slot race, plus primitive with optional expected schedule version and exact effective slot tuple — `infra/db/tests/feature-010-booking-seam.sql`
  - Depends on: `T021`
  - Acceptance evidence: `tests expose missing primitive without weakening F009 wrapper behavior`

- [ ] T023 [FR-CLINIC-007, NFR-SEC-005, NFR-DATA-001] In the forward F010 migration extract one internal booking primitive with authoritative schedule/time/fee/exclusion checks and no operation records; keep create_appointment_v1 wrapper externally identical — `supabase/migrations/20260926001000_encounters_referrals_contextual_chat.sql`
  - Depends on: `T022`
  - Acceptance evidence: `primitive writes no idempotency/audit/outbox/response record; F009 wrapper still does`

- [ ] T024 [FR-CLINIC-007, NFR-SEC-005, NFR-QUALITY-001] Run serial/concurrent booking-seam tests and existing F009 booking contract/DB suite — `specs/010-encounters-referrals-contextual-chat/evidence/C08-booking.md`
  - Depends on: `T023`
  - Acceptance evidence: `one winner, unchanged F009 behavior and no partial effect pass`



## Phase 3 — US1 encounter documentation

### C09 — Pure encounter policy
**Independent outcome:** Portable policy enforces exact state and signer rules.
**Focused checkpoint:** 3 tasks; complete in order and stop on failure.

- [ ] T025 [US1] [FR-CLINIC-006, NFR-PORT-001, NFR-DATA-001] Write red pure-policy tests for checked_in/called handoff, one responsible interval, optional 0..n references, note signer/supersession and structural completion — `packages/core/src/feature-010/encounter-policy.test.ts`
  - Depends on: `T024`
  - Acceptance evidence: `tests fail for missing policy decisions only`

- [ ] T026 [US1] [FR-CLINIC-006, NFR-PORT-001, NFR-DATA-001] Implement pure encounter and note decision functions with no DB/framework/vendor imports — `packages/core/src/feature-010/encounter-policy.ts; packages/core/src/index.ts`
  - Depends on: `T025`
  - Acceptance evidence: `policy returns approved transitions and rejects all unspecified ones`

- [ ] T027 [US1] [FR-CLINIC-006, NFR-PORT-001, NFR-QUALITY-001] Run focused core policy tests and dependency-boundary check — `specs/010-encounters-referrals-contextual-chat/evidence/C09-core.md`
  - Depends on: `T026`
  - Acceptance evidence: `core tests and architecture:check pass`


### C10 — Encounter create and read API
**Independent outcome:** API exposes authoritative start and role-projected read.
**Focused checkpoint:** 3 tasks; complete in order and stop on failure.

- [ ] T028 [US1] [FR-CLINIC-006, NFR-SEC-001, NFR-API-002, NFR-SEC-003, NFR-SEC-005, NFR-SEC-006] Write red createEncounter/getEncounter API and real-Postgres tests for closed input, session/AAL/purpose, private-note exclusion, missing queue and no client workforce IDs; for createEncounter assert identical-key/body replay returns the canonical stored response, changed-body reuse returns `idempotency-key-reused`, one success stores domain/audit/outbox/response once, and replay or stale/invalid/unauthorized/conflicting requests leave no duplicate or partial effects — `services/api/src/routes/feature-010-encounters.contract.test.ts`
  - Depends on: `T027`
  - Acceptance evidence: `red route/persistence tests fail on missing create/read and replay/effects behavior, not fixture errors`

- [ ] T029 [US1] [FR-CLINIC-006, NFR-SEC-001, NFR-API-002, NFR-SEC-003, NFR-SEC-005, NFR-SEC-006] Implement create/read Core API and PostgreSQL adapter with locked F010 SQL entry and role projection; createEncounter atomically commits one domain/audit/outbox/canonical stored response, returns that response on identical-key/body replay without duplicate effects, and denies changed-body key reuse or stale/invalid/unauthorized/conflicting requests without partial effects; register only two approved routes — `services/api/src/modules/feature-010/encounters.ts; services/api/src/adapters/postgres/feature-010-encounters.ts; services/api/src/routes/feature-010-encounters.ts; services/api/src/app.ts`
  - Depends on: `T028`
  - Acceptance evidence: `one open/consultation/service triple and stored response; replay is canonical and effect-free; changed-body conflict/negative paths are partial-effect-free; private note never leaks`

- [ ] T030 [US1] [FR-CLINIC-006, NFR-SEC-001, NFR-API-002, NFR-SEC-005, NFR-SEC-006] Run create/read route and non-owner real-Postgres tests; verify identical-key/body createEncounter replay returns the canonical stored response, changed-body reuse conflicts, one success has exactly one domain/audit/outbox/stored response, and replay/stale/invalid/unauthorized/conflicting paths create no duplicate or partial effects — `specs/010-encounters-referrals-contextual-chat/evidence/C10-encounter-api.md`
  - Depends on: `T029`
  - Acceptance evidence: `authorized/denied and AC-01 identical replay plus AC-09 changed-body/effects matrix pass`


### C11 — Structured update and participant end
**Independent outcome:** Only same-subject facts and confirmed non-responsible interval end can mutate.
**Focused checkpoint:** 3 tasks; complete in order and stop on failure.

- [ ] T031 [US1] [FR-CLINIC-006, FR-FAC-006, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006, NFR-DATA-001] Write red updateEncounter tests for If-Match, 0..n same-patient references, participant-add/responsible-end denial and immediate chat cutoff; assert identical-key/body replay returns the canonical stored response, changed-body reuse returns `idempotency-key-reused`, one success writes domain/audit/outbox/response once, and replay or stale/invalid/unauthorized/conflicting paths leave no duplicate or partial effects — `services/api/test/feature-010-update.integration.test.ts`
  - Depends on: `T030`
  - Acceptance evidence: `focused test fails on missing update guard only`

- [ ] T032 [US1] [FR-CLINIC-006, FR-FAC-006, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006, NFR-DATA-001] Implement updateEncounter through Core API and locked SQL for approved structured fields and confirmed non-responsible interval end; atomically write domain/audit/outbox/canonical stored response once, return it on identical-key/body replay without duplicate effects, and reject changed-body key reuse plus stale/invalid/unauthorized/conflicting requests without partial effects — `services/api/src/modules/feature-010/encounters.ts; services/api/src/adapters/postgres/feature-010-encounters.ts; services/api/src/routes/feature-010-encounters.ts`
  - Depends on: `T031`
  - Acceptance evidence: `identical same-key replay returns the stored response without another effect; stale/invalid/unauthorized/changed-body replay conflict leaves no duplicate or partial domain/audit/outbox/idempotent-response effect`

- [ ] T033 [US1] [FR-CLINIC-006, FR-FAC-006, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006] Run update transaction, interval-revocation and RLS tests; verify identical-key/body replay returns the canonical stored response, changed-body reuse conflicts, one success has exactly one domain/audit/outbox/stored response, and replay/stale/invalid/unauthorized/conflicting paths cause no duplicate or partial effects — `specs/010-encounters-referrals-contextual-chat/evidence/C11-update.md`
  - Depends on: `T032`
  - Acceptance evidence: `all update cases pass with immediate chat denial, exactly-once successful effect/response and no partial negative-path effects`


### C12 — Immutable note signing
**Independent outcome:** A signed correction appends a version without sharing private text.
**Focused checkpoint:** 3 tasks; complete in order and stop on failure.

- [ ] T034 [US1] [FR-CLINIC-006, NFR-SEC-002, NFR-SEC-005, NFR-SEC-006, NFR-PRIV-004] Write red signEncounterNote tests for nonblank body/type/visibility, encrypted immutable supersession and authorized signer; assert identical-key/body replay returns the canonical stored response, changed-body reuse returns `idempotency-key-reused`, one success inserts a signed version/audit/outbox/response once, and replay or stale/invalid/unauthorized/conflicting paths leave no duplicate or partial effects — `services/api/test/feature-010-notes.integration.test.ts`
  - Depends on: `T033`
  - Acceptance evidence: `missing note signer/supersession behavior is the only failing assertion`

- [ ] T035 [US1] [FR-CLINIC-006, NFR-SEC-002, NFR-SEC-005, NFR-PRIV-004, NFR-SEC-006] Implement signEncounterNote in Core API/PostgreSQL with append-only signed versions and private|patient_visible projection; atomically write domain/audit/outbox/canonical stored response once, return it on identical-key/body replay without duplicates, and reject changed-body key reuse plus stale/invalid/unauthorized/conflicting requests without partial effects — `services/api/src/modules/feature-010/notes.ts; services/api/src/adapters/postgres/feature-010-notes.ts; services/api/src/routes/feature-010-encounters.ts`
  - Depends on: `T034`
  - Acceptance evidence: `private bodies never enter patient/referral/audit/outbox; unauthorized, stale, invalid and changed-body replay conflicts deny without duplicate or partial effects`

- [ ] T036 [US1] [FR-CLINIC-006, NFR-SEC-002, NFR-SEC-005, NFR-SEC-006, NFR-PRIV-004] Run note API, SQL append-only and private-projection checks; verify identical-key/body signing replay returns the canonical stored response, changed-body reuse conflicts, one success has exactly one signed-version/audit/outbox/stored response, and replay/stale/invalid/unauthorized/conflicting paths have no duplicate or partial effects — `specs/010-encounters-referrals-contextual-chat/evidence/C12-notes.md`
  - Depends on: `T035`
  - Acceptance evidence: `signed history remains immutable; role projection and exactly-once domain/audit/outbox/stored-response tests pass, with no partial negative-path effects`


### C13 — Atomic completion
**Independent outcome:** Completion ends all three linked states and chat access.
**Focused checkpoint:** 3 tasks; complete in order and stop on failure.

- [ ] T037 [US1] [FR-CLINIC-006, FR-FAC-006, NFR-SEC-005, NFR-SEC-006, NFR-DATA-001] Write red completeEncounter race tests for nonblank responsible summary, true confirmation, If-Match and atomic completed triple with zero optional refs; assert identical-key/body replay returns the canonical stored response, changed-body reuse returns `idempotency-key-reused`, one success writes domain/audit/outbox/response once, and replay or stale/invalid/unauthorized/conflicting paths leave no duplicate or partial effects — `services/api/test/feature-010-completion.integration.test.ts`
  - Depends on: `T036`
  - Acceptance evidence: `tests fail only for missing completion behavior`

- [ ] T038 [US1] [FR-CLINIC-006, FR-FAC-006, NFR-SEC-005, NFR-DATA-001, NFR-SEC-006] Implement completeEncounter locked triple transition with encounter/appointment/queue IDs and versions; atomically write domain/audit/outbox/canonical stored response once, return it on identical-key/body replay without duplicates, and reject changed-body key reuse plus stale/invalid/unauthorized/conflicting requests without partial effects — `services/api/src/modules/feature-010/encounters.ts; services/api/src/adapters/postgres/feature-010-encounters.ts; services/api/src/routes/feature-010-encounters.ts`
  - Depends on: `T037`
  - Acceptance evidence: `blank/false/stale/invalid state has zero partial effects; completed context denies messages`

- [ ] T039 [US1] [FR-CLINIC-006, FR-FAC-006, NFR-SEC-005, NFR-SEC-006] Run completion concurrency and SQL state tests; verify identical-key/body replay returns the canonical stored response, changed-body reuse conflicts, one success has exactly one completed triple/audit/outbox/stored response, and replay/stale/invalid/unauthorized/conflicting paths have no duplicate or partial effects — `specs/010-encounters-referrals-contextual-chat/evidence/C13-complete.md`
  - Depends on: `T038`
  - Acceptance evidence: `one completed triple and no post-completion chat pass`


### C14 — Clinic start composition
**Independent outcome:** Eligible clinic summary starts only the linked encounter.
**Focused checkpoint:** 3 tasks; complete in order and stop on failure.

- [ ] T040 [US1] [FR-CLINIC-006, NFR-I18N-001, NFR-A11Y-001] Write red AR/EN clinic summary tests for checked_in+called start action, review, stale denial, API recheck and success navigation to existing encounter route — `apps/clinic/test/feature-010-start.test.tsx`
  - Depends on: `T039`
  - Acceptance evidence: `no successful start is rendered for absent or stale eligibility`

- [ ] T041 [US1] [FR-CLINIC-006, NFR-I18N-001, NFR-A11Y-001] Implement Start encounter on existing clinic /patients/:id/summary using generated client, bilingual labels/focus and reviewed TEST-ONLY composition; no new route beyond contract — `apps/clinic/src/app/patients/[id]/summary/page.tsx; apps/clinic/src/lib/feature-010-api.ts`
  - Depends on: `T040`
  - Acceptance evidence: `success uses createEncounter then /encounters/:id; stale/denied never claim success`

- [ ] T042 [US1] [FR-CLINIC-006, NFR-I18N-001, NFR-A11Y-001] Run clinic start route tests at ar-EG RTL and en-EG LTR canonical viewports — `specs/010-encounters-referrals-contextual-chat/evidence/C14-start-ui.md`
  - Depends on: `T041`
  - Acceptance evidence: `eligible/review/stale states and keyboard focus pass`


### C15 — Clinic encounter composition
**Independent outcome:** Clinician can review facts, sign notes, end intervals and confirm completion.
**Focused checkpoint:** 3 tasks; complete in order and stop on failure.

- [ ] T043 [US1] [FR-CLINIC-006, FR-FAC-006, NFR-A11Y-001] Write red UI tests for created empty content, private/patient-visible note draft and sign review, active/historical intervals, confirmed end, and distinct completion effects — `apps/clinic/test/feature-010-encounter.test.tsx`
  - Depends on: `T042`
  - Acceptance evidence: `fixture prevents a second initial participant or pre-existing signed note`

- [ ] T044 [US1] [FR-CLINIC-006, FR-FAC-006, NFR-A11Y-001, NFR-I18N-001] Implement existing clinic /encounters/:id with note sign, interval end modal/drawer and completion review; responsible is non-removable, no add picker, completed participants are historical — `apps/clinic/src/app/encounters/[id]/page.tsx; apps/clinic/src/components/feature-010/EncounterWorkspace.tsx`
  - Depends on: `T043`
  - Acceptance evidence: `no offline write or participant-add control; actions use generated Core API client`

- [ ] T045 [US1] [FR-CLINIC-006, FR-FAC-006, NFR-A11Y-001] Run clinic encounter state/keyboard/RTL tests against approved family baselines — `specs/010-encounters-referrals-contextual-chat/evidence/C15-clinic-encounter-ui.md`
  - Depends on: `T044`
  - Acceptance evidence: `created/note/participant/completion/completed states pass at 768 and 1440`


### C16 — Patient encounter projection
**Independent outcome:** Patient sees released encounter and patient-visible notes only.
**Focused checkpoint:** 3 tasks; complete in order and stop on failure.

- [ ] T046 [US1] [FR-CLINIC-006, NFR-PRIV-004, NFR-I18N-001] Write red patient /encounters/:id tests for current PAT/GUA/DEL record authority, indistinguishable private-note exclusion, completed state and offline/stale read — `apps/patient/test/feature-010-encounter.test.tsx`
  - Depends on: `T045`
  - Acceptance evidence: `private note body and its existence cue never render for subject projection`

- [ ] T047 [US1] [FR-CLINIC-006, NFR-PRIV-004, NFR-I18N-001] Implement released encounter projection on existing approved patient /encounters/:id using generated client and bilingual state copy; do not add representative chat — `apps/patient/app/encounters/[id].tsx; apps/patient/src/feature-010-encounter.ts`
  - Depends on: `T046`
  - Acceptance evidence: `only authorized released fields display; private-note state equals no-private-note view`

- [ ] T048 [US1] [FR-CLINIC-006, NFR-PRIV-004, NFR-A11Y-001] Run patient record projection tests in ar-EG/en-EG and three approved viewports — `specs/010-encounters-referrals-contextual-chat/evidence/C16-patient-encounter-ui.md`
  - Depends on: `T047`
  - Acceptance evidence: `denied/empty/visible-note/completed/offline states pass`



## Phase 4 — US2 patient-authorized referrals

### C17 — Referral creation and source list
**Independent outcome:** Creation remains pending and internal.
**Focused checkpoint:** 3 tasks; complete in order and stop on failure.

- [ ] T049 [US2] [FR-CLINIC-007, NFR-PRIV-001, NFR-API-002, NFR-SEC-005, NFR-SEC-006] Write red createReferral/listReferrals tests for required specialty+reason_summary, optional encounter_type, pending-only source and target denial; for createReferral assert identical-key/body replay returns the canonical stored response, changed-body reuse returns `idempotency-key-reused`, one success writes domain/audit/outbox/response once, and replay or stale/invalid/unauthorized/conflicting paths leave no duplicate or partial effects — `services/api/test/feature-010-referral-create.integration.test.ts`
  - Depends on: `T048`
  - Acceptance evidence: `target sees no pending referral or note body`

- [ ] T050 [US2] [FR-CLINIC-007, NFR-PRIV-001, NFR-API-002, NFR-SEC-005, NFR-SEC-006] Implement pending source-clinician createReferral and role-projected cursor list through Core API; atomically write one referral/audit/outbox/canonical stored response, return it on identical-key/body replay without duplicates, and deny changed-body key reuse plus stale/invalid/unauthorized/conflicting requests without partial effects — `services/api/src/modules/feature-010/referrals.ts; services/api/src/adapters/postgres/feature-010-referrals.ts; services/api/src/routes/feature-010-referrals.ts; services/api/src/app.ts`
  - Depends on: `T049`
  - Acceptance evidence: `pending referral has null appointment and no target disclosure`

- [ ] T051 [US2] [FR-CLINIC-007, NFR-PRIV-001, NFR-API-002, NFR-SEC-005, NFR-SEC-006] Run create/list contract and real-Postgres pending-target denial tests; verify identical-key/body createReferral replay returns the canonical stored response, changed-body reuse conflicts, one success has exactly one pending referral/audit/outbox/stored response, and replay/stale/invalid/unauthorized/conflicting paths have no duplicate or partial effects — `specs/010-encounters-referrals-contextual-chat/evidence/C17-referral-create.md`
  - Depends on: `T050`
  - Acceptance evidence: `source list and pending target negatives pass`


### C18 — Atomic referral acceptance
**Independent outcome:** Current subject consent and F009 booking form one transaction.
**Focused checkpoint:** 3 tasks; complete in order and stop on failure.

- [ ] T052 [US2] [FR-CLINIC-007, NFR-SEC-005, NFR-SEC-006, NFR-PRIV-002, NFR-DATA-001] Write red acceptReferral real-Postgres tests for live PAT/GUA/DEL authority, exact disclosure, target matching and slot/version races; assert identical-key/body replay returns the canonical stored response, changed-body reuse returns `idempotency-key-reused`, one success writes referral+appointment/audit/outbox/response once, and replay or stale/invalid/unauthorized/conflicting paths leave no duplicate or partial effects — `services/api/test/feature-010-referral-accept.integration.test.ts`
  - Depends on: `T051`
  - Acceptance evidence: `each failure leaves referral pending, no appointment and no target disclosure`

- [ ] T053 [US2] [FR-CLINIC-007, NFR-SEC-005, NFR-PRIV-002, NFR-DATA-001, NFR-SEC-006] Implement acceptReferral claim-key→lock pending→live authority→target/effective slot→internal F009 booking primitive→link→accept→audit/outbox/canonical stored response→commit exactly once; server fee EGP cash_on_arrival only. Return the stored response on identical-key/body replay without duplicates; changed-body key reuse and stale/invalid/unauthorized/conflicting requests leave no partial referral, booking, audit, outbox or response effect — `services/api/src/modules/feature-010/referrals.ts; services/api/src/adapters/postgres/feature-010-referrals.ts; services/api/src/routes/feature-010-referrals.ts`
  - Depends on: `T052`
  - Acceptance evidence: `no client fee/currency/payment; one accepted referral and appointment only`

- [ ] T054 [US2] [FR-CLINIC-007, NFR-SEC-005, NFR-SEC-006, NFR-PRIV-002] Run acceptReferral concurrency/rollback and F009 createAppointment parity; verify identical-key/body replay returns the canonical stored response, changed-body reuse conflicts, one success has exactly one accepted referral+appointment/audit/outbox/stored response, and replay/stale/invalid/unauthorized/conflicting paths have no duplicate or partial effects — `specs/010-encounters-referrals-contextual-chat/evidence/C18-referral-accept.md`
  - Depends on: `T053`
  - Acceptance evidence: `one winner and unchanged F009 fee/replay/slot-race results pass`


### C19 — Referral role projections
**Independent outcome:** Each page rechecks live representative and target authority.
**Focused checkpoint:** 3 tasks; complete in order and stop on failure.

- [ ] T055 [US2] [FR-CLINIC-007, NFR-SEC-001, NFR-PRIV-004, NFR-API-002] Write red pagination matrix for PAT self, active approved GUA, DEL requiring both record.view and appointment.manage, source CLN and accepted-linked target CLN; revoke between pages — `services/api/test/feature-010-referral-projections.integration.test.ts`
  - Depends on: `T054`
  - Acceptance evidence: `one-grant DEL and pending target receive no content`

- [ ] T056 [US2] [FR-CLINIC-007, NFR-SEC-001, NFR-PRIV-004, NFR-API-002] Implement per-action live list projection and cursor filtering; target receives only accepted authorized reason_summary and optional encounter_type, never note bodies — `services/api/src/modules/feature-010/referrals.ts; services/api/src/adapters/postgres/feature-010-referrals.ts`
  - Depends on: `T055`
  - Acceptance evidence: `no stale grant or query filter can broaden returned fields`

- [ ] T057 [US2] [FR-CLINIC-007, NFR-SEC-001, NFR-PRIV-004] Run role/pagination negatives under non-owner forced RLS — `specs/010-encounters-referrals-contextual-chat/evidence/C19-referral-projection.md`
  - Depends on: `T056`
  - Acceptance evidence: `revoked next page denies and target projection is two-field maximum`


### C20 — Patient /records referral acceptance
**Independent outcome:** PAT/GUA/DEL review exact disclosure and accept on existing route.
**Focused checkpoint:** 3 tasks; complete in order and stop on failure.

- [ ] T058 [US2] [FR-CLINIC-007, NFR-PRIV-001, NFR-I18N-001, NFR-A11Y-001] Write red bilingual patient tests for pending preview, affirmative encounter_type opt-in/out, representative acting role+patient context, authority-lost blank state, accepted appointment/target and 360px action reachability — `apps/patient/test/feature-010-records.test.tsx`
  - Depends on: `T057`
  - Acceptance evidence: `no acceptance without explicit selection or live authority`

- [ ] T059 [US2] [FR-CLINIC-007, NFR-PRIV-001, NFR-I18N-001, NFR-A11Y-001] Implement approved /records referral list/review/acceptance using generated client; show linked appointment, doctor/facility/slot and View appointment after success — `apps/patient/app/records.tsx; apps/patient/src/feature-010-referrals.ts`
  - Depends on: `T058`
  - Acceptance evidence: `GUA/DEL context explicit; stale/denied/offline/conflict states fail closed`

- [ ] T060 [US2] [FR-CLINIC-007, NFR-PRIV-001, NFR-A11Y-001] Run ar-EG RTL/en-EG LTR referral flow at 360, 412 and 768 against approved references — `specs/010-encounters-referrals-contextual-chat/evidence/C20-records-ui.md`
  - Depends on: `T059`
  - Acceptance evidence: `acceptance actions reachable, role context and authorized fields visible`


### C21 — Clinic /referrals creation and tracking
**Independent outcome:** Clinic never accepts on a patient's behalf.
**Focused checkpoint:** 3 tasks; complete in order and stop on failure.

- [ ] T061 [US2] [FR-CLINIC-007, NFR-I18N-001, NFR-A11Y-001] Write red clinic tests for create review without precommitted REF ID, source encounter confirmation, pending/accepted tracking and resolved linked appointment/target — `apps/clinic/test/feature-010-referrals.test.tsx`
  - Depends on: `T060`
  - Acceptance evidence: `review does not show a committed worklist row before success`

- [ ] T062 [US2] [FR-CLINIC-007, NFR-I18N-001, NFR-A11Y-001] Implement approved clinician /referrals page and generated client calls; no PAT/GUA/DEL acceptance control or private-note preview — `apps/clinic/src/app/referrals/page.tsx; apps/clinic/src/components/feature-010/ReferralWorkspace.tsx`
  - Depends on: `T061`
  - Acceptance evidence: `pending and accepted states show only clinician-allowed fields`

- [ ] T063 [US2] [FR-CLINIC-007, NFR-I18N-001, NFR-A11Y-001] Run clinic referral route tests at 768 and 1440 with discoverable navigation and localized ar-EG dates — `specs/010-encounters-referrals-contextual-chat/evidence/C21-clinic-referrals-ui.md`
  - Depends on: `T062`
  - Acceptance evidence: `review/success/pending/accepted/denied/offline pass`



## Phase 5 — US3 appointment-context chat

### C22 — Context read/send API
**Independent outcome:** Only linked open appointment context permits body-only reads/sends.
**Focused checkpoint:** 3 tasks; complete in order and stop on failure.

- [ ] T064 [US3] [FR-FAC-006, NFR-SEC-001, NFR-SEC-002, NFR-API-002, NFR-SEC-005, NFR-SEC-006] Write red sendContextMessage/listContextMessages tests for appointment-only context, PAT/active workforce, GUA/DEL and ended/completed denial, cursor and any attachment property rejection; for send assert identical-key/body replay returns the canonical stored response, changed-body reuse returns `idempotency-key-reused`, one success writes message/audit/outbox/response once, and replay or stale/invalid/unauthorized/conflicting paths leave no duplicate or partial effects — `services/api/test/feature-010-messages.integration.test.ts`
  - Depends on: `T048`
  - Acceptance evidence: `no message inserted for forbidden context or attachment`

- [ ] T065 [US3] [FR-FAC-006, NFR-SEC-001, NFR-SEC-002, NFR-API-002, NFR-SEC-005, NFR-SEC-006] Implement listContextMessages/sendContextMessage through Core API and locked PostgreSQL checks; encrypt nonblank body, persist SQL-null attachment, atomically write one message/audit/outbox/canonical stored response, return it on identical-key/body replay without duplicates, and deny changed-body key reuse plus stale/invalid/unauthorized/conflicting requests without partial effects — `services/api/src/modules/feature-010/messages.ts; services/api/src/adapters/postgres/feature-010-messages.ts; services/api/src/routes/feature-010-messages.ts; services/api/src/app.ts`
  - Depends on: `T064`
  - Acceptance evidence: `read/send reauthorize each call and completed/ended context denies old history`

- [ ] T066 [US3] [FR-FAC-006, NFR-SEC-001, NFR-SEC-002, NFR-SEC-005, NFR-SEC-006] Run message contract, SQL RLS and send/completion race tests; verify identical-key/body sendContextMessage replay returns the canonical stored response, changed-body reuse conflicts, one success has exactly one message/audit/outbox/stored response, and replay/stale/invalid/unauthorized/conflicting paths have no duplicate or partial effects — `specs/010-encounters-referrals-contextual-chat/evidence/C22-messages-api.md`
  - Depends on: `T065`
  - Acceptance evidence: `body-only PAT/active CLN pass; GUA/DEL/ended/completed deny`


### C23 — Outbox and realtime hint
**Independent outcome:** Event delivery is body-free and never grants authority.
**Focused checkpoint:** 3 tasks; complete in order and stop on failure.

- [ ] T067 [US3] [FR-FAC-006, NFR-OBS-001, NFR-AVAIL-001] Write red worker tests for minimum-ID context marker, aggregate ordering/dedup/retry/DLQ, revoked participant and duplicate/missed hint followed by REST reauthorization — `services/worker/src/feature-010-realtime.test.ts`
  - Depends on: `T066`
  - Acceptance evidence: `no PHI body reaches event payload or retry log`

- [ ] T068 [US3] [FR-FAC-006, NFR-OBS-001, NFR-AVAIL-001] Implement Feature 010 outbox marker consumer as a realtime refresh hint using existing worker pipeline; add no notification template/channel or Feature 009 runner change — `services/worker/src/feature-010-realtime.ts; services/worker/src/feature-010-runner.ts; package.json`
  - Depends on: `T067`
  - Acceptance evidence: `client must re-fetch REST; hint never authorizes read/send`

- [ ] T069 [US3] [FR-FAC-006, NFR-OBS-001, NFR-AVAIL-001] Run worker ordering/redaction/retry tests and message API revocation test — `specs/010-encounters-referrals-contextual-chat/evidence/C23-realtime.md`
  - Depends on: `T068`
  - Acceptance evidence: `one accepted marker, body-free payload and REST reauth pass`


### C24 — Patient encounter chat composition
**Independent outcome:** Subject patient composes only inside /encounters/:id.
**Focused checkpoint:** 3 tasks; complete in order and stop on failure.

- [ ] T070 [US3] [FR-FAC-006, NFR-AVAIL-002, NFR-I18N-001, NFR-A11Y-001] Write red compact-viewport tests for open/in_consultation body send, in-frame success, completed chat-ended proof, offline block, stale/last-updated and REST reconnect — `apps/patient/test/feature-010-chat.test.tsx`
  - Depends on: `T069`
  - Acceptance evidence: `no patient inbox, GUA/DEL composer or offline queue`

- [ ] T071 [US3] [FR-FAC-006, NFR-AVAIL-002, NFR-I18N-001, NFR-A11Y-001] Add body-only chat composition inside approved patient /encounters/:id; reauthorize on reconnect, remove history/composer on completed context — `apps/patient/app/encounters/[id].tsx; apps/patient/src/feature-010-chat.ts`
  - Depends on: `T070`
  - Acceptance evidence: `messages never use attachment or local offline write replay`

- [ ] T072 [US3] [FR-FAC-006, NFR-AVAIL-002, NFR-A11Y-001] Run ar-EG/en-EG patient chat states at 360/412/768 and compare approved functional baselines — `specs/010-encounters-referrals-contextual-chat/evidence/C24-patient-chat-ui.md`
  - Depends on: `T071`
  - Acceptance evidence: `message success visible in-frame; completed chat end visible`


### C25 — Clinic context messages composition
**Independent outcome:** Clinic selects only an eligible appointment context.
**Focused checkpoint:** 3 tasks; complete in order and stop on failure.

- [ ] T073 [US3] [FR-FAC-006, NFR-SEC-004, NFR-I18N-001, NFR-A11Y-001] Write red clinic /messages tests for explicit eligible context selection, ended interval access loss, completion, offline, conflict and REST reconnect/stale label — `apps/clinic/test/feature-010-messages.test.tsx`
  - Depends on: `T072`
  - Acceptance evidence: `no general consultation channel or attachment control`

- [ ] T074 [US3] [FR-FAC-006, NFR-SEC-004, NFR-I18N-001, NFR-A11Y-001] Implement approved clinic /messages view with generated client and current-participant reauthorization; body-only composer disappears immediately after interval end — `apps/clinic/src/app/messages/page.tsx; apps/clinic/src/components/feature-010/ContextMessages.tsx`
  - Depends on: `T073`
  - Acceptance evidence: `no ended workforce history/read/send access`

- [ ] T075 [US3] [FR-FAC-006, NFR-SEC-004, NFR-A11Y-001] Run clinic context states in ar-EG/en-EG at 768/1440 with keyboard/focus and refreshed authority — `specs/010-encounters-referrals-contextual-chat/evidence/C25-clinic-chat-ui.md`
  - Depends on: `T074`
  - Acceptance evidence: `active/send-success/participant-removed/access-ended/reconnecting pass`



## Final phase — Focused hardening and evidence

### C26 — Security, privacy and redaction
**Independent outcome:** Abuse and telemetry checks preserve synthetic-only data boundaries.
**Focused checkpoint:** 3 tasks; complete in order and stop on failure.

- [ ] T076 [FR-CLINIC-006, FR-CLINIC-007, FR-FAC-006, NFR-SEC-006, NFR-SEC-007, NFR-PRIV-004, NFR-OBS-001] Write red abuse/privacy vectors for cross-patient/facility, forged realtime hint, revoked grants, private-note/referral/message body canaries in audit/outbox/logs/metrics/events — `tests/e2e/feature-010-security-privacy.spec.ts`
  - Depends on: `T063, T075`
  - Acceptance evidence: `unauthorized mutations have no domain outbox and no PHI telemetry`

- [ ] T077 [NFR-SEC-007, NFR-PRIV-004, NFR-OBS-001, NFR-SEC-006] Enforce approved redaction, rate/problem mapping and minimum attributable event fields using existing observability adapters; add no retention period or production channel — `packages/observability/src/feature-010.ts; services/api/src/routes/feature-010-encounters.ts; services/api/src/routes/feature-010-referrals.ts; services/api/src/routes/feature-010-messages.ts`
  - Depends on: `T076`
  - Acceptance evidence: `canary scan finds no raw clinical body, token or patient payload`

- [ ] T078 [NFR-SEC-006, NFR-SEC-007, NFR-PRIV-004, NFR-OBS-001] Run focused ASVS/API-abuse vectors, secrets check and no-PHI audit/outbox/telemetry scan — `specs/010-encounters-referrals-contextual-chat/evidence/C26-security-privacy.md`
  - Depends on: `T077`
  - Acceptance evidence: `negative tests pass; legal production gates remain open`


### C27 — Arabic/English accessibility parity
**Independent outcome:** All six approved families render and operate in both locales.
**Focused checkpoint:** 3 tasks; complete in order and stop on failure.

- [ ] T079 [FR-CLINIC-006, FR-CLINIC-007, FR-FAC-006, NFR-I18N-001, NFR-A11Y-001] Write red catalog and browser checks for state labels, dates, RTL/LTR, bidi IDs, keyboard/focus, screen reader, 44x44 targets, 200/400% reflow and reduced motion — `packages/i18n/src/feature-010.test.ts; tests/e2e/feature-010-accessibility.spec.ts`
  - Depends on: `T078`
  - Acceptance evidence: `test enumerates six approved families and P0 state matrix`

- [ ] T080 [NFR-I18N-001, NFR-A11Y-001, NFR-PERF-001] Consolidate the already-tested ar-EG/en-EG Feature 010 route labels into exact shared message keys and wire accessible state primitives on approved patient/clinic routes only — `packages/i18n/src/feature-010.ts; packages/i18n/src/index.ts; apps/clinic/src/app/layout.tsx; apps/patient/app/_layout.tsx`
  - Depends on: `T079`
  - Acceptance evidence: `human-facing enum codes do not appear as raw UI copy`

- [ ] T081 [NFR-I18N-001, NFR-A11Y-001, NFR-PERF-001] Run bilingual live route/semantic checks against immutable 87-state/408-reference TEST-ONLY manifest without regenerating it — `specs/010-encounters-referrals-contextual-chat/evidence/C27-ar-en-accessibility.md`
  - Depends on: `T080`
  - Acceptance evidence: `AR RTL/EN LTR evidence recorded; OPEN-UX-002/OPEN-TECH-003 not auto-closed`


### C28 — Performance, restore and verification wiring
**Independent outcome:** Focused nonfunctional evidence is measured without claiming open-gate closure.
**Focused checkpoint:** 3 tasks; complete in order and stop on failure.

- [ ] T082 [NFR-PERF-001, NFR-PERF-002, NFR-AVAIL-001, NFR-AVAIL-002, NFR-DATA-002] Write red synthetic load/restore vectors for patient LCP/input, API read/mutation p95, one-winner concurrency, migration replay and restore from both named local runtimes — `tools/feature-010-performance.test.ts; tools/feature-010-restore.test.ts`
  - Depends on: `T081`
  - Acceptance evidence: `tests fail on missing measurement or restore proof, never fabricate device profile`

- [ ] T083 [NFR-PERF-001, NFR-PERF-002, NFR-AVAIL-001, NFR-AVAIL-002, NFR-DATA-002, NFR-QUALITY-001] Implement focused measurement/restore runners and register F010 checks in package.json verify chain; use shifaa-local-postgres and shifaa-local-supabase without deleting legacy rollback volumes — `tools/feature-010-performance.ts; tools/run-feature-010-restore-test.mjs; package.json`
  - Depends on: `T082`
  - Acceptance evidence: `focused commands produce reproducible synthetic evidence and retain OPEN-TECH-003`

- [ ] T084 [NFR-PERF-001, NFR-PERF-002, NFR-AVAIL-001, NFR-AVAIL-002] Run focused perf/restore/migration and F009 regression, record topology, measured thresholds and any honest unavailable profile — `specs/010-encounters-referrals-contextual-chat/evidence/C28-perf-restore.md`
  - Depends on: `T083`
  - Acceptance evidence: `results are measured, not inferred; no open production/release gate is closed`


## Acceptance criteria closure before final integration

C01 verifies that the approved spec and this table each contain exactly AC-01–AC-14. Each listed implementation checkpoint contains a bounded implementation task, and each listed focused verification checkpoint contains red tests plus a checkpoint evidence task. This mapping is the coverage inventory before C29; T086 reconciles completed evidence and gates rather than discovering first-time AC coverage.

| Approved AC | Implementation checkpoint(s) | Focused verification checkpoint(s) |
|---|---|---|
| `AC-01` | C05, C10, C14 | C05, C10 (createEncounter identical-key/body canonical stored-response replay), C14 |
| `AC-02` | C07, C10, C16 | C07, C10, C16 |
| `AC-03` | C06, C12, C16 | C06, C12, C16 |
| `AC-04` | C05, C13, C15 | C05, C13, C15 |
| `AC-05` | C17, C20, C21 | C17, C20, C21 |
| `AC-06` | C07, C18, C19 | C07, C18, C19 |
| `AC-07` | C08, C18, C20 | C08, C18, C20 |
| `AC-08` | C11, C13, C22 | C11, C13, C22 |
| `AC-09` | C10 (createEncounter), C11 (updateEncounter), C12 (signEncounterNote), C13 (completeEncounter), C17 (createReferral), C18 (acceptReferral), C22 (sendContextMessage), C26 | C10, C11, C12, C13, C17, C18, C22 (each: identical-key/body replay, changed-body conflict, exactly-once domain/audit/outbox/stored response and no partial negative effects), C26 |
| `AC-10` | C22, C24, C25 | C22, C24, C25 |
| `AC-11` | C26, C27 | C26, C27 |
| `AC-12` | C09, C11, C12, C13 | C09, C11, C12, C13 |
| `AC-13` | C17, C19, C20, C21 | C17, C19, C20, C21 |
| `AC-14` | C05, C11, C15, C22, C23, C24, C25 | C05, C11, C15, C22, C23, C24, C25 |



## Final phase — Full verification and integration

### C29 — One full verify and scope decision
**Independent outcome:** Single final full verification checkpoint after all focused evidence.
**Focused checkpoint:** 2 tasks; complete in order and stop on failure.

- [ ] T085 [FR-CLINIC-006, FR-CLINIC-007, FR-FAC-006, NFR-SEC-001, NFR-SEC-002, NFR-SEC-003, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006, NFR-SEC-007, NFR-PRIV-001, NFR-PRIV-002, NFR-PRIV-004, NFR-I18N-001, NFR-A11Y-001, NFR-PERF-001, NFR-PERF-002, NFR-AVAIL-001, NFR-AVAIL-002, NFR-DATA-001, NFR-DATA-002, NFR-API-001, NFR-API-002, NFR-OBS-001, NFR-QUALITY-001, NFR-PORT-001] Run one fresh corepack pnpm verify after C01–C28, including F010 focused suites, F009 regressions and both named runtimes; capture exact exit/head — `specs/010-encounters-referrals-contextual-chat/evidence/C29-full-verify.md`
  - Depends on: `T084`
  - Acceptance evidence: `corepack pnpm verify exits 0 on the integration head`

- [ ] T086 [FR-CLINIC-006, FR-CLINIC-007, FR-FAC-006, NFR-SEC-001, NFR-SEC-002, NFR-SEC-003, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006, NFR-SEC-007, NFR-PRIV-001, NFR-PRIV-002, NFR-PRIV-004, NFR-I18N-001, NFR-A11Y-001, NFR-PERF-001, NFR-PERF-002, NFR-AVAIL-001, NFR-AVAIL-002, NFR-DATA-001, NFR-DATA-002, NFR-API-001, NFR-API-002, NFR-OBS-001, NFR-QUALITY-001, NFR-PORT-001] Reconcile all 14 ACs, 10 operations, 3 FRs, 23 NFRs, approved baseline digest and eight retained gates against focused/live evidence; record remaining QA/clinical/Legal/DPO/UX/production/release effects without closing them — `specs/010-encounters-referrals-contextual-chat/evidence/C29-integration-gates.md`
  - Depends on: `T085`
  - Acceptance evidence: `matrix has no missing implementation/verification row and git diff --check passes`


## Story independence and evidence

- **US1 / J-01:** From an eligible F009 checked-in/called pair, create one open encounter, document/sign, optionally link zero or more existing same-subject references, complete the atomic triple, and show only released patient fields. C09–C16 can be accepted without referral or chat UI.
- **US2 / J-02:** From a source encounter, create a pending internal referral; PAT/GUA/DEL explicitly accept only the two-field maximum and one authoritative F009 slot, with one atomic accepted booking. C17–C21 require the shared C01–C08 foundations and US1 source encounter, not US3.
- **US3 / J-03:** Subject PAT and active workforce read/send body-only messages only in the eligible linked appointment context; interval end and completion immediately revoke access, and reconnect reauthorizes via REST. C22–C25 require the C01–C08 foundation and US1 lifecycle, not US2.
- **Branch execution:** C17–C21 and C22–C25 are independent after T048 and both feed T076. They may be run sequentially to avoid shared API/DB/worker harness interference; this preference adds no dependency between US2 and US3. Parallel execution requires explicit file/test-state ownership review.

## Requirement and operation closure

The bracketed canonical IDs on each task are the machine-readable requirement mapping. Each FR and each of the 23 targeted NFRs has at least one bounded implementation task (middle task of a focused checkpoint) and one specific red/focused verification task; final C29 confirms rather than substitutes for those checks. Approved operation ownership:

| Operation ID | Primary checkpoints |
|---|---|
| `createEncounter` | C05, C09, C10, C14–C15 |
| `getEncounter` | C07, C10, C15–C16 |
| `updateEncounter` | C07, C11, C15 |
| `signEncounterNote` | C06, C12, C15 |
| `completeEncounter` | C05, C13, C15 |
| `createReferral` | C06–C07, C17, C21 |
| `listReferrals` | C07, C17, C19–C21 |
| `acceptReferral` | C08, C18, C20 |
| `listContextMessages` | C07, C22–C25 |
| `sendContextMessage` | C06–C07, C22–C25 |

No work item changes a feature boundary or claims Clinical, QA, Legal/DPO, `OPEN-UX-002`, product UAT, production or release approval. F010 implementation must remain synthetic-only until its named later gates are satisfied.
