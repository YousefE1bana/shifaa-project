# Tasks: Family Care Relationships

> **Feature:** `004-family-care-relationships` · **Plan status:** seeded-synthetic executable; formal/production gates carry a `BLOCKED` overlay
> A checked task means its exact acceptance evidence exists. Requirement IDs are canonical and uncompressed.

## Phase 1 — Gates, contracts, and deterministic fixtures

- [x] T001 [FR-FAM-001, FR-FAM-002, FR-FAM-004, FR-FAM-005, FR-FAM-006, FR-FAM-007, FR-FAM-008, NFR-QUALITY-001] Verify active scope, preserve every canonical open blocker, remediate pre-implementation analysis, and commit the immutable task baseline — `specs/004-family-care-relationships/evidence/pre-implementation-analysis.md`
  - Depends on: `none`
  - Acceptance evidence: `specs/004-family-care-relationships/evidence/pre-implementation-analysis.md` reports zero CRITICAL or HIGH findings and the pushed immutable baseline contains the complete unchecked implementation graph
- [x] T002 [P] [FR-FAM-001, FR-FAM-002, FR-FAM-004, FR-FAM-005, FR-FAM-006, FR-FAM-007, FR-FAM-008, NFR-SEC-005, NFR-I18N-001] Add deterministic people, patients, relationships, contacts, evidence, permission, clock, token, replay, race, redaction, and negative-authorization fixtures — `packages/test-kit/src/family-care.ts`
  - Depends on: `T001`
  - Acceptance evidence: `pnpm --filter @shifaa/test-kit test` exits 0 and every family fixture is explicitly synthetic with no plausible real identity, phone, document, or session value
- [x] T003 [P] [FR-FAM-001, FR-FAM-002, FR-FAM-004, FR-FAM-005, FR-FAM-007, NFR-API-001, NFR-API-002] Implement closed validators, DTOs, problems, examples, and exact 12-operation inventory from the approved feature OpenAPI — `packages/contracts/src/family-care.ts`
  - Depends on: `T001`
  - Acceptance evidence: `pnpm --filter @shifaa/contracts test` exits 0 and feature YAML, exported operations, requirements, schemas, and forbidden-operation assertions are identical
- [x] T004 [P] [FR-FAM-002, FR-FAM-004, FR-FAM-005, FR-FAM-006, FR-FAM-007, NFR-I18N-001, NFR-A11Y-001] Add Arabic-authored and English-parity context, guardianship, delegation, Emergency Contact, disclosure, terminal-state, and problem keys — `packages/i18n/src/catalogs.ts`
  - Depends on: `T001`
  - Acceptance evidence: `pnpm --filter @shifaa/i18n test` exits 0 with exact key parity, RTL or LTR direction, bidi metadata, and no untranslated fallback

## Phase 2 — Pure policy and persistent security foundation

- [x] T005 [FR-FAM-001, FR-FAM-002, FR-FAM-004, FR-FAM-005, FR-FAM-006, FR-FAM-007, FR-FAM-008, NFR-PORT-001] Add failing unit and property vectors for relationship, permission, contact, context, token, expiry, alert, projection, and audit invariants — `packages/core/src/family-care/family-care.test.ts`
  - Depends on: `T002`
  - Acceptance evidence: the test inventory maps `AC-01` through `AC-18`, including every terminal transition, permission independence, context mismatch, non-SOS event, and forbidden alert field
- [x] T006 [FR-FAM-001, FR-FAM-002, FR-FAM-004, FR-FAM-005, FR-FAM-006, FR-FAM-007, FR-FAM-008, NFR-PRIV-001, NFR-PRIV-002, NFR-PORT-001] Implement portable default-deny relationship/contact state machines, current permission policy, context confirmation, token hashing, minimum projections, and alert allow-list — `packages/core/src/family-care/`
  - Depends on: `T005`
  - Acceptance evidence: `pnpm --filter @shifaa/core test` exits 0 for all lifecycle, current-clock, exact-permission, patient-context, token, disclosure, and redaction vectors
- [x] T007 [FR-FAM-001, FR-FAM-002, FR-FAM-004, FR-FAM-005, FR-FAM-008, NFR-DATA-001, NFR-DATA-002] Add clean-migration, closed-type and permission, evidence binding, terminal state, attribution, version, token digest, index, and append-only SQL assertions before the migration — `infra/db/tests/family-care-schema.sql`
  - Depends on: `T002`, `T006`
  - Acceptance evidence: SQL assertion names cover every entity, column, constraint, index, state, attribution, encryption, and retention invariant in `data-model.md`
- [x] T008 [FR-FAM-001, FR-FAM-002, FR-FAM-004, FR-FAM-005, FR-FAM-008, NFR-SEC-002, NFR-DATA-001, NFR-DATA-002] Add the expand-only PostgreSQL and Supabase migration, guards, helpers, encryption and retention metadata, private evidence bucket extension, indexes, and deterministic seeds — `supabase/migrations/20260811000500_family_care_relationships.sql`
  - Depends on: `T007`
  - Acceptance evidence: `pnpm db:reset; pnpm db:test` exits 0 twice with existing self rows preserved and no age or capacity trigger, destructive purge, or public evidence policy
- [x] T009 [FR-FAM-001, FR-FAM-002, FR-FAM-004, FR-FAM-005, FR-FAM-007, FR-FAM-008, NFR-SEC-001, NFR-SEC-004] Add the complete direct `shifaa_api` actor, patient, relationship, permission, state, evidence, role, AAL, purpose, context, token, and terminal-transition forced-RLS matrix — `infra/db/tests/family-care-rls.sql`
  - Depends on: `T008`
  - Acceptance evidence: vectors prove cross-family, cross-patient, wrong-person, wrong-role, AAL1, wrong-purpose, stale, revoked, expired, self-review, evidence substitution, permission inflation, and direct terminal updates deny
- [x] T010 [FR-FAM-001, FR-FAM-002, FR-FAM-004, FR-FAM-005, FR-FAM-007, FR-FAM-008, NFR-SEC-001, NFR-SEC-004] Implement fixed-search-path helpers, least-privilege grants, `ENABLE` and `FORCE` RLS, current-state policies, state and attribution guards, and private Storage denial — `supabase/migrations/20260811000500_family_care_relationships.sql`, `supabase/migrations/20260811000600_family_care_storage.sql`
  - Depends on: `T009`
  - Acceptance evidence: `pnpm db:rls-test; pnpm test:family:stack` exits 0, every feature table reports forced RLS, and public or authenticated clients have no domain-table or private-object access

## Phase 3 — Core API, generated client, and worker policy

- [x] T011 [FR-FAM-001, FR-FAM-002, FR-FAM-004, FR-FAM-005, FR-FAM-007, FR-FAM-008, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006, NFR-API-001, NFR-API-002] Add failing route, repository, projection, current-policy, replay, changed-payload, race, version, attribution, pagination, rate, and negative-authorization integration tests for all 12 operations — `services/api/test/family-care.integration.test.ts`
  - Depends on: `T003`, `T006`, `T010`
  - Acceptance evidence: contract and route inventory maps exactly 12 operations and the combined API plus SQL suite maps `AC-01` through `AC-21` with no forbidden operation
- [x] T012 [FR-FAM-001, FR-FAM-002, FR-FAM-004, FR-FAM-005, FR-FAM-007, FR-FAM-008, NFR-SEC-001, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006, NFR-PRIV-004, NFR-PORT-001] Implement short-transaction repositories and use cases with current-state authorization, released evidence, encryption and masking, token consume, optimistic version, atomic idempotency, immutable audit/use, outbox, and fail-closed ports — `services/api/src/modules/family-care/`, `services/api/src/adapters/postgres/family-service.ts`
  - Depends on: `T011`
  - Acceptance evidence: module and PostgreSQL tests prove one domain/audit/outbox effect per successful mutation and one minimum use/audit effect per managed-patient authorization, with no partial effect on denial, conflict, replay, or dependency failure
- [x] T013 [FR-FAM-001, FR-FAM-002, FR-FAM-004, FR-FAM-005, FR-FAM-007, FR-FAM-008, NFR-SEC-006, NFR-API-001, NFR-API-002] Register the exact 12 validated Fastify routes with patient-context, AAL and purpose, no-store, request ID, version, idempotency, opaque cursor, anonymous token-in-body response, secret-free request paths, and localized RFC 9457 behavior — `services/api/src/routes/family-care.ts`
  - Depends on: `T012`
  - Acceptance evidence: `pnpm --filter @shifaa/api test` exits 0 and runtime route inventory equals the approved OpenAPI with no transition, upload, SOS-create, or provider route
- [x] T014 [FR-FAM-001, FR-FAM-002, FR-FAM-004, FR-FAM-005, FR-FAM-007, NFR-API-001, NFR-API-002, NFR-PORT-001] Generate and export all 12 typed Family Care client calls with explicit context, version, idempotency, token, and cursor handling — `packages/api-client/src/family-care.ts`
  - Depends on: `T003`, `T013`
  - Acceptance evidence: `pnpm contracts:check` exits 0 with feature YAML, source contracts, generated client, and runtime operation parity
- [x] T015 [FR-FAM-002, FR-FAM-004, FR-FAM-005, FR-FAM-006, FR-FAM-008, NFR-SEC-006, NFR-PRIV-001, NFR-PRIV-002, NFR-OBS-001] Implement closed relationship and contact event projections, receipt deduplication, bounded retry and dead-letter behavior, and active-SOS-only minimum Emergency Contact alert policy — `services/worker/src/family-care.ts`
  - Depends on: `T006`, `T012`
  - Acceptance evidence: `pnpm --filter @shifaa/worker test; pnpm --filter @shifaa/observability test` exits 0 with zero token, phone, evidence, identity, diagnosis, medication, lab, admission, record-link, or unconsented-location sentinel
- [x] T016 [FR-FAM-002, FR-FAM-008, NFR-SEC-001, NFR-SEC-004] Enable only the two guardianship operations for Support Admin in the closed operation registry and keep every unrelated later operation denied — `specs/003-facility-onboarding-rbac/contracts/admin-role-actions.yaml`
  - Depends on: `T003`, `T013`
  - Acceptance evidence: role-action parity tests show `listGuardianshipCases` and `reviewGuardianship` are `feature_004`, require Support Admin and AAL2, and no other later-feature action changed availability

## Phase 4 — User Story 1: Evidence-backed guardianship and explicit context

**Independent outcome:** A proposed synthetic guardian submits released evidence, an independent Support Admin decides it, and current authority works only after explicit dependent selection.

- [x] T017 [US1] [FR-FAM-001, FR-FAM-002, FR-FAM-007, NFR-I18N-001, NFR-A11Y-001] Build patient `/care-switcher` and the persistent Family Context banner with self, guardian, delegate, loading, empty, permission, revoked, expired, offline, and explicit-confirmation states — `apps/patient/app/care-switcher.tsx`, `packages/design-system/src/FamilyContextBanner.tsx`
  - Depends on: `T004`, `T014`
  - Acceptance evidence: patient and design-system tests prove full patient plus relationship announcement, focus restoration, bidi isolation, 44 by 44 targets, no implicit context, and no offline mutation queue in Arabic and English
- [x] T018 [US1] [FR-FAM-001, FR-FAM-002, FR-FAM-007, FR-FAM-008, NFR-I18N-001, NFR-A11Y-001] Build patient `/relationships` guardianship display states and exact current-permission, evidence, validity, rejection, revoked, expiry, conflict, dependency, error, and success behavior without a patient-side guardianship decision control — `apps/patient/app/relationships.tsx`
  - Depends on: `T017`
  - Acceptance evidence: `pnpm --filter @shifaa/patient test` exits 0 with real client calls, minimum projection, accessible confirmation, Arabic RTL and English LTR, reduced motion, and every guardianship edge state
- [x] T019 [US1] [FR-FAM-002, FR-FAM-008, NFR-SEC-004, NFR-I18N-001, NFR-A11Y-001] Build admin `/relationships` minimum worklist and stable independent approve, reject, or authorized revoke surface with released-evidence, AAL2, purpose, self-review, stale-version, conflict, and success states — `apps/admin/src/app/relationships/`
  - Depends on: `T014`, `T016`, `T018`
  - Acceptance evidence: `pnpm --filter @shifaa/admin test` exits 0 and the rendered case contains no raw evidence path, identity, contact, unrelated patient, clinical, or token field
- [x] T020 [US1] [FR-FAM-001, FR-FAM-002, FR-FAM-007, FR-FAM-008, NFR-SEC-001, NFR-SEC-004, NFR-SEC-005] Run the API-backed guardianship create, independent review, explicit selection, allowed use, rejection, revocation, expiry, and negative authorization checkpoint — `tests/e2e/family-guardianship.spec.ts`
  - Depends on: `T018`, `T019`
  - Acceptance evidence: the real API and PostgreSQL journey proves no dependent login, one attributable effect, next-check revocation or expiry denial, and all evidence, role, AAL, purpose, context, cross-patient, replay, version, and RLS negatives

## Phase 5 — User Story 2: Exact adult delegation

**Independent outcome:** A self-managed synthetic adult delegates only named actions, the named adult accepts once, and update, revocation, or expiry changes authorization on the next check.

- [x] T021 [US2] [FR-FAM-001, FR-FAM-004, FR-FAM-007, FR-FAM-008, NFR-I18N-001, NFR-A11Y-001] Add delegation create, invite acceptance, exact permission list, update, revoke, expiry, terminal, conflict, permission, offline, error, and success behavior to patient `/relationships` — `apps/patient/app/relationships.tsx`
  - Depends on: `T018`, `T014`
  - Acceptance evidence: patient tests prove a named delegate, explicit purpose and validity, independent permissions, no `consent.manage`, accessible confirmation, no offline queue, and Arabic or English consequence parity
- [x] T022 [US2] [FR-FAM-001, FR-FAM-004, FR-FAM-007, FR-FAM-008, NFR-SEC-001, NFR-SEC-004, NFR-SEC-005] Run the real delegation invite, named acceptance, allowed use, excess-permission denial, current-version update, revocation, expiry, and replay or race checkpoint — `tests/e2e/family-delegation.spec.ts`
  - Depends on: `T021`
  - Acceptance evidence: allowed delegate receives only each named current permission and wrong person, token replay, changed payload, stale version, unrelated patient, implicit SOS, consent, cached grant, direct SQL, and concurrent effects deny

## Phase 6 — User Story 3: Separate Emergency Contact consent and minimum disclosure

**Independent outcome:** A patient or active guardian obtains separate contact confirmation, terminal states remain closed, and only a future qualifying SOS can pass the minimum-disclosure policy.

- [x] T023 [US3] [FR-FAM-005, FR-FAM-006, FR-FAM-007, FR-FAM-008, NFR-PRIV-001, NFR-PRIV-002, NFR-I18N-001, NFR-A11Y-001] Build patient `/emergency-contacts` create, masked list, separate location precision, exact future-alert preview, confirm or decline, revoke, expiry, terminal re-invite, token, conflict, offline, error, and success states — `apps/patient/app/emergency-contacts.tsx`
  - Depends on: `T004`, `T014`, `T017`
  - Acceptance evidence: patient tests prove separate affirmative consent, fresh-row re-invite, accessible terminal states, masked owner projection, closed disclosure preview, no offline queue, and Arabic or English parity
- [x] T024 [US3] [FR-FAM-005, FR-FAM-006, FR-FAM-007, FR-FAM-008, NFR-SEC-001, NFR-SEC-005, NFR-SEC-006, NFR-PRIV-001, NFR-PRIV-002] Run the real contact create, confirm or decline, revoke, expiry, re-invite, token race, non-SOS zero-delivery, qualifying-SOS allow-list, and forbidden-field checkpoint — `tests/e2e/family-emergency-contact.spec.ts`
  - Depends on: `T015`, `T023`
  - Acceptance evidence: one terminal response persists; wrong or expired token is non-oracular; routine events deliver zero; one qualifying synthetic request exposes only consented canonical fields; all unknown or clinical fields deny

## Final Phase — Integrated evidence, hardening, and PR readiness

- [x] T025 [FR-FAM-001, FR-FAM-002, FR-FAM-004, FR-FAM-005, FR-FAM-006, FR-FAM-007, FR-FAM-008, NFR-DATA-001, NFR-PERF-002, NFR-QUALITY-001] Run clean migrations twice, complete RLS and Storage, replay and race acceptance, and the 100-session synthetic load profile — `specs/004-family-care-relationships/evidence/performance.json`
  - Depends on: `T020`, `T022`, `T024`
  - Acceptance evidence: `pnpm test:family:stack; pnpm test:family:performance` exits 0 with relationship or contact read p95 at most 400ms and mutation p95 at most 800ms
- [x] T026 [FR-FAM-001, FR-FAM-002, FR-FAM-004, FR-FAM-005, FR-FAM-006, FR-FAM-007, FR-FAM-008, NFR-I18N-001, NFR-A11Y-001] Drive and inspect live Arabic RTL and English LTR real-service journeys at compact, tablet, and desktop viewports with keyboard, screen reader, 200 percent text, high contrast, reduced motion, and every relevant edge state — `specs/004-family-care-relationships/evidence/live-qa.md`
  - Depends on: `T025`
  - Acceptance evidence: browser-driven running API, patient, and admin services cover every browser-applicable state in `AC-01` through `AC-22`, with automated real-stack evidence linked for SQL, replay, race, expiry, and forced-RLS cases; every saved screenshot exists and is visually inspected before PASS
- [x] T027 [FR-FAM-001, FR-FAM-002, FR-FAM-004, FR-FAM-005, FR-FAM-006, FR-FAM-007, FR-FAM-008, NFR-SEC-001, NFR-SEC-002, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006, NFR-SEC-007, NFR-OBS-001, NFR-QUALITY-001, NFR-PORT-001] Complete feature threat model, forced-RLS and private-Storage validation, ASVS or API abuse, token and redaction review, secret, dependency, SAST, SBOM, architecture, and supply-chain checks; remediate every reportable HIGH or CRITICAL issue — `specs/004-family-care-relationships/evidence/security/`
  - Depends on: `T025`, `T026`
  - Acceptance evidence: security validation has no unresolved reportable HIGH or CRITICAL finding, direct database and object negatives pass, and every required CI security command exits 0
- [x] T028 [FR-FAM-001, FR-FAM-002, FR-FAM-004, FR-FAM-005, FR-FAM-006, FR-FAM-007, FR-FAM-008, NFR-API-001, NFR-API-002, NFR-DATA-001, NFR-DATA-002, NFR-I18N-001, NFR-A11Y-001, NFR-QUALITY-001] Update API, data, UI, traceability, admin-action availability, runbook, evidence manifest, and implementation status without closing any canonical open item — `docs/architecture/SHIFAA-API-Catalog.md`, `docs/architecture/SHIFAA-Data-RLS.md`, `docs/design/SHIFAA-UI-Contract.md`, `docs/traceability/SHIFAA-Traceability-Matrix.md`, `infra/runbooks/family-care-relationships.md`
  - Depends on: `T027`
  - Acceptance evidence: contract and architecture drift checks pass and each active 004 requirement maps bidirectionally to code, tests, live evidence, security evidence, task, Issue, and runbook while `FR-FAM-003` remains blocked and absent
- [x] T029 [FR-FAM-001, FR-FAM-002, FR-FAM-004, FR-FAM-005, FR-FAM-006, FR-FAM-007, FR-FAM-008, NFR-QUALITY-001] Run final SpecKit analysis, correct every implementation, specification, plan, task, and evidence mismatch, and synchronize task and Issue states honestly — `specs/004-family-care-relationships/evidence/final-analysis.md`
  - Depends on: `T028`
  - Acceptance evidence: final analysis reports zero actionable mismatch and every checked task plus resolved Issue has its exact acceptance evidence at the pinned feature commit
- [x] T030 [FR-FAM-001, FR-FAM-002, FR-FAM-004, FR-FAM-005, FR-FAM-006, FR-FAM-007, FR-FAM-008, NFR-SEC-007, NFR-QUALITY-001] Run the complete final install, verify, migration, contract, architecture, secret, dependency, SAST, SBOM, threat, clean-status, and evidence gates and prepare the ready PR — `specs/004-family-care-relationships/evidence/verification.md`
  - Depends on: `T029`
  - Acceptance evidence: `pnpm install --frozen-lockfile; pnpm verify` exits 0 on the feature branch, local security and evidence gates pass, and only intended 004 changes are present before the ready PR is opened

## Dependencies and independent checkpoints

```text
T001 → T002/T003/T004
T002 → T005 → T006 → T007 → T008 → T009 → T010
T003 + T006 + T010 → T011 → T012 → T013 → T014
T006 + T012 → T015
T003 + T013 → T016
T004 + T014 → T017 → T018 → T019 → T020
T018 + T014 → T021 → T022
T004 + T014 + T017 → T023
T015 + T023 → T024
T020 + T022 + T024 → T025 → T026 → T027 → T028 → T029 → T030
```

- US1 checkpoint: T020 independently proves governed guardianship and explicit dependent context.
- US2 checkpoint: T022 independently proves exact adult delegation and next-check invalidation.
- US3 checkpoint: T024 independently proves separate Emergency Contact consent and minimum disclosure.
- No task implements `FR-FAM-003`, age/capacity transition, SOS creation, production evidence intake, or any feature numbered 005 or later.
