# Tasks: Facility Onboarding and Contextual RBAC

> **Feature:** `003-facility-onboarding-rbac` · **Plan status:** seeded-synthetic executable; formal/production gates carry a `BLOCKED` overlay
> Every checked task requires its exact implementation and acceptance evidence. Requirement IDs are canonical and uncompressed.

## Phase 1 — Gates, contracts, and deterministic fixtures

- [ ] T001 [FR-FAC-001, FR-FAC-002, FR-FAC-003, FR-FAC-007, FR-ADMIN-001, FR-ADMIN-002, FR-ADMIN-004, NFR-QUALITY-001] Verify active scope, preserve every canonical open blocker, and record the immutable artifact baseline — `specs/003-facility-onboarding-rbac/checklists/requirements.md`
  - Depends on: `none`
  - Acceptance evidence: `specs/003-facility-onboarding-rbac/evidence/pre-implementation-analysis.md` reports zero CRITICAL/HIGH findings and the baseline commit is immutable
- [ ] T002 [P] [FR-FAC-001, FR-FAC-002, FR-FAC-003, FR-FAC-007, FR-ADMIN-001, FR-ADMIN-002, FR-ADMIN-004, NFR-SEC-005, NFR-I18N-001] Add deterministic actors, four facility types, evidence checksums, role/action matrix, license clocks, replay/race, and negative authorization fixtures — `packages/test-kit/src/facility-onboarding.ts`
  - Depends on: `T001`
  - Acceptance evidence: `pnpm --filter @shifaa/test-kit test` exits 0 and all fixtures are marked synthetic
- [ ] T003 [P] [FR-FAC-001, FR-FAC-002, FR-FAC-003, FR-FAC-007, FR-ADMIN-001, FR-ADMIN-002, FR-ADMIN-004, NFR-API-001, NFR-API-002] Implement validators, DTOs, problems, examples, and exact 22-operation inventory from the approved feature OpenAPI — `packages/contracts/src/facility-onboarding.ts`
  - Depends on: `T001`
  - Acceptance evidence: `pnpm --filter @shifaa/contracts test` exits 0 and feature YAML, exported operations, requirements, and schemas are identical
- [ ] T004 [P] [NFR-I18N-001, NFR-A11Y-001] Add Arabic-authored/English-parity licensing, facility, membership, authorization, and role-governance keys with RTL/bidi/accessibility metadata — `packages/i18n/src/facility-onboarding.ts`
  - Depends on: `T001`
  - Acceptance evidence: `pnpm --filter @shifaa/i18n test` exits 0 with exact key parity and direction tests

## Phase 2 — Pure policy and persistent security foundation

- [ ] T005 [FR-FAC-001, FR-FAC-002, FR-FAC-003, FR-FAC-007, FR-ADMIN-001, FR-ADMIN-004, NFR-PORT-001] Add failing unit/property vectors for every facility/license/membership/grant/revocation transition and contextual allow/deny tuple — `packages/core/src/facility-onboarding/facility-onboarding.test.ts`
  - Depends on: `T002`
  - Acceptance evidence: test inventory covers `AC-01`, `AC-05`, `AC-08`, `AC-09`, `AC-14`, `AC-15`, `AC-19`, `AC-20`, and `AC-21`
- [ ] T006 [FR-FAC-001, FR-FAC-002, FR-FAC-003, FR-FAC-007, FR-ADMIN-001, FR-ADMIN-004, NFR-PORT-001] Implement portable facility/license/membership/admin-governance state machines and default-deny authorization policy — `packages/core/src/facility-onboarding/`
  - Depends on: `T005`
  - Acceptance evidence: `pnpm --filter @shifaa/core test` exits 0 for all state, clock, role/action, license, separation, and cross-facility vectors
- [ ] T007 [FR-FAC-001, FR-FAC-002, FR-FAC-003, FR-FAC-007, FR-ADMIN-001, FR-ADMIN-002, FR-ADMIN-004, NFR-DATA-001, NFR-DATA-002] Add clean-migration, constraint, index, state-function, attribution, version, and four-eyes SQL assertions before the migration — `infra/db/tests/facility-onboarding-schema.sql`
  - Depends on: `T002`, `T006`
  - Acceptance evidence: SQL test names cover every entity/state/invariant in `data-model.md`
- [ ] T008 [FR-FAC-001, FR-FAC-002, FR-FAC-003, FR-FAC-007, FR-ADMIN-001, FR-ADMIN-002, FR-ADMIN-004, NFR-SEC-002, NFR-DATA-001, NFR-DATA-002] Add the expand-only Supabase/PostgreSQL migration, canonical action permissions, transition functions, encryption/retention metadata, partial/FK/RLS indexes, and deterministic seeds — `supabase/migrations/20260811000300_facility_onboarding_rbac.sql`
  - Depends on: `T007`
  - Acceptance evidence: `pnpm supabase:reset` succeeds twice and `infra/db/tests/facility-onboarding-schema.sql` exits 0
- [ ] T009 [FR-FAC-001, FR-FAC-002, FR-FAC-003, FR-FAC-007, FR-ADMIN-001, FR-ADMIN-002, FR-ADMIN-004, NFR-SEC-001, NFR-SEC-004] Add the complete actor/facility/action/AAL/purpose/license/separation forced-RLS matrix and private Storage list/fetch/quarantine negatives — `infra/db/tests/facility-onboarding-rls.sql`
  - Depends on: `T008`
  - Acceptance evidence: test vectors include direct `shifaa_api` cross-facility, wrong-role, AAL1, no-purpose, invalid-license, self-decision, public-list, and quarantine-read denial
- [ ] T010 [FR-FAC-001, FR-FAC-002, FR-FAC-003, FR-FAC-007, FR-ADMIN-001, FR-ADMIN-002, FR-ADMIN-004, NFR-SEC-001, NFR-SEC-004] Implement fixed-search-path helpers, `ENABLE`/`FORCE` RLS, least-privilege grants, transition guards, Storage policies, and current-state predicates — `supabase/migrations/20260811000400_facility_onboarding_rbac_policies.sql`
  - Depends on: `T009`
  - Acceptance evidence: `pnpm db:rls-test; pnpm test:facility:stack` exits 0 and public/authenticated clients have no domain-table privileges

## Phase 3 — Core API, generated client, and events

- [ ] T011 [FR-FAC-001, FR-FAC-002, FR-FAC-003, FR-FAC-007, FR-ADMIN-001, FR-ADMIN-002, FR-ADMIN-004, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006, NFR-API-001, NFR-API-002] Add failing route, repository, minimum-projection, replay/race, version, attribution, and negative authorization integration tests for all 22 operations — `services/api/test/facility-onboarding.integration.test.ts`
  - Depends on: `T003`, `T006`, `T010`
  - Acceptance evidence: test inventory maps every operation and `AC-01` through `AC-24` before implementation
- [ ] T012 [FR-FAC-001, FR-FAC-002, FR-FAC-003, FR-FAC-007, FR-ADMIN-001, FR-ADMIN-002, FR-ADMIN-004, NFR-SEC-001, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006, NFR-PORT-001] Implement short-transaction PostgreSQL repositories/use cases, deterministic clock/scanner, encryption/masking, current-state policy, atomic idempotency/audit/outbox, and fail-closed adapters — `services/api/src/modules/facility-onboarding/`
  - Depends on: `T011`
  - Acceptance evidence: module tests prove external preparation precedes DB transactions and one replay-safe effect commits for every mutation family
- [ ] T013 [FR-FAC-001, FR-FAC-002, FR-FAC-003, FR-FAC-007, FR-ADMIN-001, FR-ADMIN-002, FR-ADMIN-004, NFR-API-001, NFR-API-002] Register the exact 22 validated Fastify routes, no-store/request-ID/version/idempotency headers, cursor worklists, and localized RFC 9457 problems — `services/api/src/routes/facility-onboarding.ts`
  - Depends on: `T012`
  - Acceptance evidence: `pnpm --filter @shifaa/api test` exits 0 and route inventory equals the feature contract with zero extra operation
- [ ] T014 [NFR-API-001, NFR-API-002, NFR-PORT-001] Generate/export all 22 typed API client calls and prohibit handwritten endpoint drift — `packages/api-client/src/facility-onboarding.ts`
  - Depends on: `T003`, `T013`
  - Acceptance evidence: `pnpm contracts:check` exits 0 with feature YAML, contracts, client, and route operation parity
- [ ] T015 [FR-FAC-001, FR-FAC-002, FR-FAC-007, FR-ADMIN-004, NFR-SEC-006, NFR-OBS-001] Implement minimum allow-listed facility/license/membership/admin-role outbox events, receipt deduplication, retry/DLQ tests, and recursive prohibited-field redaction — `services/worker/src/facility-onboarding.ts`
  - Depends on: `T012`
  - Acceptance evidence: `pnpm --filter @shifaa/worker test; pnpm --filter @shifaa/observability test` exits 0 with zero raw number/document/object/token/address sentinel matches

## Phase 4 — User Story 1: Governed facility onboarding

**Independent outcome:** A synthetic owner can create, evidence, submit, and receive an attributable approve/reject decision for each of the four facility types, with quarantined evidence blocked.

- [ ] T016 [P] [US1] [FR-FAC-001, FR-FAC-002, NFR-I18N-001, NFR-A11Y-001] Create the four separate Next.js facility app shells with shared package dependencies but distinct type/name/navigation and no app-to-app imports — `apps/clinic/`, `apps/pharmacy/`, `apps/hospital/`, `apps/lab/`
  - Depends on: `T004`, `T014`
  - Acceptance evidence: all four apps build independently and architecture checks prove separate entrypoints with no generic facility app
- [ ] T017 [US1] [FR-FAC-001, FR-FAC-002, NFR-SEC-005, NFR-I18N-001, NFR-A11Y-001] Build `/facility/onboarding` in all four apps with draft/upload/quarantine/released/pending/rejected/active/suspended/offline/conflict/error/success states — `packages/design-system/src/staff-facility.tsx`, `apps/*/src/app/facility/onboarding/page.tsx`
  - Depends on: `T016`
  - Acceptance evidence: component tests pass Arabic/English, RTL/LTR, 200% text, keyboard, reduced-motion, and no-offline-queue vectors for four types
- [ ] T018 [US1] [FR-FAC-001, FR-ADMIN-002, FR-ADMIN-004, NFR-SEC-004, NFR-I18N-001, NFR-A11Y-001] Build admin `/facility-approvals` minimum worklist and stable zero-motion review surface with AAL2/purpose/quarantine/self-review/version states — `apps/admin/src/app/facility-approvals/`
  - Depends on: `T014`, `T017`
  - Acceptance evidence: `pnpm --filter @shifaa/admin test` exits 0 and rendered projection contains no raw license/document/unrelated-person field
- [ ] T019 [US1] [FR-FAC-001, FR-FAC-002, FR-ADMIN-002, FR-ADMIN-004, NFR-SEC-001, NFR-I18N-001, NFR-A11Y-001] Run the API-backed four-type onboarding checkpoint including quarantine denial and approve/reject outcomes — `tests/e2e/facility-onboarding.spec.ts`
  - Depends on: `T017`, `T018`
  - Acceptance evidence: four independent app journeys and admin decisions pass against the running Supabase/API stack

## Phase 5 — User Story 2: Licensed named workforce and contextual access

**Independent outcome:** An approved owner can invite a verified professional, the invitee accepts, and current policy allows only the matching facility/application while every invalid license/context denies.

- [ ] T020 [US2] [FR-FAC-007, FR-ADMIN-002, FR-ADMIN-004, NFR-SEC-004, NFR-I18N-001, NFR-A11Y-001] Build admin `/professional-licenses` minimum review worklist with released-evidence, verify/reject/suspend/expired, AAL2/purpose/self-review/conflict states — `apps/admin/src/app/professional-licenses/`
  - Depends on: `T014`, `T018`
  - Acceptance evidence: admin tests pass minimum projection, quarantine denial, clock expiry, keyboard, Arabic/English, and zero-motion decision vectors
- [ ] T021 [P] [US2] [FR-FAC-002, FR-FAC-003, FR-FAC-007, NFR-I18N-001, NFR-A11Y-001] Build `/facility/team` in all four facility apps with empty/invited/active/suspended/ended/expired/license-invalid/permission/offline/conflict/success states — `apps/*/src/app/facility/team/page.tsx`
  - Depends on: `T017`, `T020`
  - Acceptance evidence: team component tests prove named person+facility attribution, accessible invite/update/end confirmation, and compact stacked-row reflow
- [ ] T022 [US2] [FR-FAC-002, FR-FAC-003, FR-FAC-007, NFR-SEC-001, NFR-SEC-004] Add generated-client application gates and server-probed contextual authorization tests for matching type, cross-facility, wrong role, AAL/purpose, patient-basis declaration, and every invalid license state — `tests/e2e/facility-access.spec.ts`
  - Depends on: `T021`
  - Acceptance evidence: allowed worker enters exactly one matching app and all cross-facility/wrong-app/expired/suspended/rejected/unverified vectors return deny without an oracle
- [ ] T023 [US2] [FR-FAC-002, FR-FAC-003, FR-FAC-007, NFR-SEC-001, NFR-SEC-006] Run the professional-license, membership invitation/acceptance, immediate revocation/expiry, and attribution checkpoint — `specs/003-facility-onboarding-rbac/evidence/workforce-checkpoint.md`
  - Depends on: `T022`
  - Acceptance evidence: evidence records exact synthetic actors/facilities, API results, RLS denials, and audit person+facility attribution

## Phase 6 — User Story 3: Exact admin roles and four-eyes governance

**Independent outcome:** Two distinct super admins can grant and revoke one exact canonical role with immutable attribution; proposal alone grants nothing and self-decision/direct-update paths deny.

- [ ] T024 [US3] [FR-ADMIN-001, FR-ADMIN-002, FR-ADMIN-004, NFR-SEC-001, NFR-SEC-004, NFR-SEC-005] Add exhaustive five-role × canonical active-admin-operation allow/deny parity, 003 proposal/decision/revocation, self/target/stale/replay/race/direct-SQL vectors — `services/api/test/admin-role-governance.integration.test.ts`, `infra/db/tests/admin-role-governance-rls.sql`
  - Depends on: `T012`, `T013`
  - Acceptance evidence: tests prove `contracts/admin-role-actions.yaml` covers every canonical role and active admin-mapped operation, while only current/003 operations are seedable and no role inherits another
- [ ] T025 [US3] [FR-ADMIN-001, FR-ADMIN-002, FR-ADMIN-004, NFR-I18N-001, NFR-A11Y-001] Build admin `/role-grants` list/propose/independent decision/revocation UI with exact action summary and stable zero-motion high-risk confirmations — `apps/admin/src/app/role-grants/`
  - Depends on: `T014`, `T024`
  - Acceptance evidence: admin tests pass pending/active/rejected/revocation-pending/revoked/self-denied/conflict plus Arabic/English keyboard/screen-reader states
- [ ] T026 [US3] [FR-ADMIN-001, FR-ADMIN-002, FR-ADMIN-004, NFR-SEC-001, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006] Run the independent proposer/decider grant and revocation checkpoint with idempotency and direct forced-RLS negatives — `tests/e2e/admin-role-governance.spec.ts`
  - Depends on: `T025`
  - Acceptance evidence: one grant and one revocation effect persist with distinct actors; self-decision, changed-body replay, stale version, proposal-only access, and direct update deny

## Final Phase — Integrated evidence, hardening, and PR readiness

- [ ] T027 [FR-FAC-001, FR-FAC-002, FR-FAC-003, FR-FAC-007, FR-ADMIN-001, FR-ADMIN-002, FR-ADMIN-004, NFR-PERF-002, NFR-DATA-001, NFR-QUALITY-001] Run clean Supabase reset/migrations twice, full RLS/Storage/replay/race acceptance, and 100-session load profile — `specs/003-facility-onboarding-rbac/evidence/performance.json`
  - Depends on: `T019`, `T023`, `T026`
  - Acceptance evidence: `pnpm test:facility:stack; pnpm test:facility:performance` exits 0 with read p95 <=400ms and mutation p95 <=800ms
- [ ] T028 [FR-FAC-001, FR-FAC-002, FR-FAC-003, FR-FAC-007, FR-ADMIN-001, FR-ADMIN-002, FR-ADMIN-004, NFR-I18N-001, NFR-A11Y-001] Drive and inspect live Arabic RTL and English LTR desktop/compact journeys, keyboard-only and reduced-motion flows, and every relevant state — `specs/003-facility-onboarding-rbac/evidence/live-qa.md`, `specs/003-facility-onboarding-rbac/evidence/screenshots/`
  - Depends on: `T027`
  - Acceptance evidence: Browser-driven real services cover all 24 acceptance criteria and the 20 mandatory live journey outcomes; every saved screenshot is inspected before PASS
- [ ] T029 [NFR-SEC-001, NFR-SEC-002, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006, NFR-SEC-007, NFR-OBS-001, NFR-QUALITY-001, NFR-PORT-001] Run feature threat model, security diff validation, ASVS/API abuse, secret/dependency/SAST/SBOM, architecture, redaction, and supply-chain checks; remediate every reportable HIGH/CRITICAL issue — `specs/003-facility-onboarding-rbac/evidence/security/`
  - Depends on: `T027`, `T028`
  - Acceptance evidence: security report has no unresolved reportable HIGH/CRITICAL finding and all required CI security commands exit 0
- [ ] T030 [FR-FAC-001, FR-FAC-002, FR-FAC-003, FR-FAC-007, FR-ADMIN-001, FR-ADMIN-002, FR-ADMIN-004, NFR-API-001, NFR-API-002, NFR-I18N-001, NFR-A11Y-001, NFR-QUALITY-001] Reconcile final SpecKit analysis, task/Issue states, traceability, runbook, contract/architecture drift, evidence manifest, clean Git status, and full install/verify results without closing canonical blockers — `specs/003-facility-onboarding-rbac/evidence/verification.md`, `docs/traceability/SHIFAA-Traceability-Matrix.md`, `infra/runbooks/facility-onboarding-rbac.md`
  - Depends on: `T029`
  - Acceptance evidence: `pnpm install; pnpm verify` exits 0, final analysis has zero implementation/spec/task mismatch, every checkbox matches evidence, and only intended feature changes remain

## Dependencies and independent checkpoints

```text
T001 → T002/T003/T004
T002 → T005 → T006 → T007 → T008 → T009 → T010
T003 + T006 + T010 → T011 → T012 → T013 → T014
T012 → T015
T004 + T014 → T016 → T017 → T018 → T019
T017 + T020 → T021 → T022 → T023
T012 + T013 → T024 → T025 → T026
T019 + T023 + T026 → T027 → T028 → T029 → T030
```

- US1 checkpoint: T019, independently proves four-type governed onboarding.
- US2 checkpoint: T023, independently proves licensed named workforce and contextual isolation.
- US3 checkpoint: T026, independently proves exact-role four-eyes grant/revocation.
- Suggested first increment: Phase 1 through US1, while retaining the full feature baseline and all gates.
