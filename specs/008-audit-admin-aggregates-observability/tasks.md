# Tasks: Audit, Admin Aggregates, and Observability

> **Feature:** `008-audit-admin-aggregates-observability` · **Plan status:** `PLAN_APPROVED`
> Every task remains open. Implementation is not authorized in this lifecycle turn.

## Rules

- Execute test-first and in dependency order. `[P]` applies only to disjoint files after its listed dependencies.
- Preserve exactly seven canonical operations and the approved inactive `metrics: []` initial configuration.
- Do not modify or absorb `security/sec-001-002-remediation`; do not add patient selectors, aggregate drill-down, export-status, backup, job, retry, notification, or public health operations.
- Every completion requires the recorded evidence; a checked box without evidence is invalid.

## Phase 1 — Gates and contract fixtures

- [x] T001 [FR-ADMIN-002, FR-ADMIN-003, NFR-PRIV-002, NFR-QUALITY-001] Add the Feature 008 scope verifier and planned test commands, revalidate synthetic-engineering gates, and pin the privacy digest without activating a metric — `tools/verify-feature-008-scope.mjs`, `package.json`, `specs/008-audit-admin-aggregates-observability/checklists/requirements.md`
  - Depends on: `none`
  - Acceptance evidence: `node tools/verify-feature-008-scope.mjs` exits 0 with OPEN-PRIV-001 closed, metrics empty, seven operations, and production gates disabled

- [x] T002 [P] [FR-ADMIN-003, NFR-PRIV-002, NFR-QUALITY-001] Add deterministic OPEN-PRIV-001 configuration, boundary, complementary-suppression, linked-release, locale, retry, and attack fixtures for vectors 001 through 034 — `packages/test-kit/src/audit-admin-privacy-fixtures.ts`
  - Depends on: `T001`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/test-kit test -- audit-admin-privacy-fixtures` exits 0 and reports 34 uniquely named vectors

- [x] T003 [P] [FR-ADMIN-002, NFR-SEC-004, NFR-SEC-006, NFR-QUALITY-001] Add synthetic actor/AAL/purpose, audit cursor, chain, export, health, and sentinel fixtures plus the SHA-bound evidence verifier — `packages/test-kit/src/audit-admin-fixtures.ts`, `tools/verify-feature-008-evidence.mjs`
  - Depends on: `T001`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/test-kit test -- audit-admin-fixtures` exits 0 and validates every required actor and failure class

- [x] T004 [P] [FR-ADMIN-002, FR-ADMIN-003, NFR-API-001, NFR-API-002] Lock the seven-operation OpenAPI 3.1.1 schemas and add exact catalog/route verification for problems, cursors, idempotency, and service auth — `specs/008-audit-admin-aggregates-observability/contracts/openapi.yaml`, `tools/verify-feature-008-contract.mjs`
  - Depends on: `T001`
  - Acceptance evidence: `node tools/verify-feature-008-contract.mjs` exits 0 and prints operation_count=7 with exact catalog method and path parity

- [x] T005 [P] [FR-ADMIN-002, FR-ADMIN-003, NFR-I18N-001, NFR-A11Y-001] Add Arabic-first and English-parity keys for dashboard, audit, purpose, suppression, export, integrity, stale, offline, and health states — `packages/i18n/src/audit-admin.ts`
  - Depends on: `T001`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/i18n test -- audit-admin` exits 0 with zero missing or asymmetric keys

## Phase 2 — Data, chain, export, and RLS foundation

- [x] T006 [FR-ADMIN-002, NFR-SEC-006, NFR-DATA-001, NFR-DATA-002, NFR-PRIV-004] Add the fail-closed empty-legacy preflight and UTC-month partitioned audit event v1 schema — `supabase/migrations/20260904000800_audit_admin_aggregates_observability.sql`
  - Depends on: `T003`, `T004`
  - Acceptance evidence: `corepack pnpm test:audit-admin:db -- schema` exits 0 on clean baseline and the legacy-row upgrade case aborts without row or hash changes

- [x] T007 [FR-ADMIN-002, NFR-SEC-002, NFR-SEC-006, NFR-DATA-001, NFR-PRIV-004] Add append-only signature evidence and audit export batch tables, integrity checks, indexes, and retention classifications — `supabase/migrations/20260904000800_audit_admin_aggregates_observability.sql`
  - Depends on: `T006`
  - Acceptance evidence: `corepack pnpm test:audit-admin:db -- schema` exits 0 with every digest, proof, range, state, index, encryption, and retention assertion passing

- [x] T008 [FR-ADMIN-002, NFR-SEC-001, NFR-SEC-006, NFR-DATA-001, NFR-DATA-002] Add fixed-search-path canonical append and chain-verification functions with per-partition transaction serialization — `supabase/migrations/20260904000800_audit_admin_aggregates_observability.sql`
  - Depends on: `T006`
  - Acceptance evidence: `corepack pnpm test:audit-admin:db -- chain` exits 0 with one contiguous sequence per partition and all injected tampering detected

- [x] T009 [FR-ADMIN-002, NFR-SEC-005, NFR-SEC-006, NFR-DATA-001] Add export state functions, feature flags, processing inventory, and minimum audit export outbox allow-list — `supabase/migrations/20260904000800_audit_admin_aggregates_observability.sql`
  - Depends on: `T007`, `T008`
  - Acceptance evidence: `corepack pnpm test:audit-admin:db -- export` exits 0 with one atomic batch audit outbox and idempotency effect and metrics remaining inactive

- [x] T010 [FR-ADMIN-002, FR-ADMIN-003, NFR-SEC-001, NFR-SEC-004, NFR-PRIV-002] Add forced RLS, current-role/AAL/purpose and exact-worker helpers, minimum grants, and PUBLIC/direct-table denials — `supabase/migrations/20260904000800_audit_admin_aggregates_observability.sql`
  - Depends on: `T007`, `T009`
  - Acceptance evidence: `corepack pnpm test:audit-admin:rls` exits 0 with only current super-admin AAL2 purpose and exact worker contexts authorized

- [x] T011 [P] [FR-ADMIN-002, NFR-SEC-006, NFR-DATA-001, NFR-DATA-002, NFR-QUALITY-001] Add fresh, upgrade-fail-closed, partition-boundary, append-only, chain, export-state, and concurrency database tests — `infra/db/tests/audit-admin-observability-schema.sql`
  - Depends on: `T006`, `T007`, `T008`, `T009`
  - Acceptance evidence: `corepack pnpm test:audit-admin:db` exits 0 twice from clean resets with identical chain and state results

- [x] T012 [P] [FR-ADMIN-002, FR-ADMIN-003, NFR-SEC-001, NFR-SEC-004, NFR-SEC-007, NFR-QUALITY-001] Add complete patient/workforce/admin/DPO/stale/AAL/purpose/service/direct-SQL forced-RLS negative matrix — `infra/db/tests/audit-admin-observability-rls.sql`
  - Depends on: `T010`
  - Acceptance evidence: `corepack pnpm test:audit-admin:rls` exits 0 with zero rows or effects for every unauthorized matrix cell

- [x] T013 [P] [NFR-SEC-002, NFR-AVAIL-001, NFR-DATA-001, NFR-PRIV-004] Add deterministic database/object/digest/retention-proof backup and restore fixtures without statutory duration claims — `infra/db/fixtures/audit-admin-restore.sql`
  - Depends on: `T007`, `T008`
  - Acceptance evidence: `corepack pnpm test:audit-admin:restore -- fixture` exits 0 and verifies restored chains and object digests from synthetic data only

## Phase 3 — Portable policy and observability packages

- [x] T014 [FR-ADMIN-003, NFR-PRIV-002, NFR-PORT-001] Implement the vendor-free approved aggregate configuration validator and fail-closed disclosure pipeline — `packages/core/src/audit-admin/aggregate-policy.ts`
  - Depends on: `T002`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/core test -- aggregate-policy` exits 0 and metrics empty or any unknown configuration returns no cells

- [x] T015 [FR-ADMIN-003, NFR-PRIV-002, NFR-QUALITY-001] Execute all 34 approved boundary/attack vectors against primary, complementary, linked-release, locale, and retry behavior — `packages/core/src/audit-admin/aggregate-policy.test.ts`
  - Depends on: `T014`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/core test -- aggregate-policy` exits 0 with 34 of 34 vectors passing and zero raw suppressed counts

- [x] T016 [P] [FR-ADMIN-002, NFR-SEC-006, NFR-DATA-002, NFR-PORT-001] Implement portable canonical event serialization, genesis/link calculation, and export-manifest verification — `packages/core/src/audit-admin/audit-integrity.ts`
  - Depends on: `T003`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/core test -- audit-integrity` exits 0 with stable bytes and hashes across repeated UTC fixtures

- [x] T017 [FR-ADMIN-002, NFR-SEC-006, NFR-QUALITY-001] Add content, previous-hash, ordering, object-byte, recorded-digest, and ambiguous-manifest tamper tests — `packages/core/src/audit-admin/audit-integrity.test.ts`
  - Depends on: `T016`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/core test -- audit-integrity` exits 0 with every tamper rejected and the valid chain accepted

- [ ] T018 [P] [FR-ADMIN-002, FR-ADMIN-003, NFR-OBS-001, NFR-PORT-001] Extend default-deny structured redaction and request/trace correlation for API, worker, adapter, aggregate, and health contexts — `packages/observability/src/audit-admin.ts`
  - Depends on: `T003`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/observability test -- audit-admin` exits 0 with only allow-listed fields and bounded labels emitted

- [ ] T019 [NFR-SEC-007, NFR-OBS-001, NFR-QUALITY-001] Add prohibited-value sentinel and high-cardinality label rejection tests for every Feature 008 telemetry surface — `packages/observability/src/audit-admin.test.ts`
  - Depends on: `T018`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/observability test -- audit-admin` exits 0 with zero prohibited sentinel or identifier labels

## Phase 4 — Core API contracts, repositories, and routes

- [ ] T020 [FR-ADMIN-002, FR-ADMIN-003, NFR-PORT-001] Define portable aggregate, audit, export, object-proof, clock, and readiness ports and fixed DTOs — `services/api/src/modules/audit-admin/types.ts`
  - Depends on: `T014`, `T016`, `T018`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/api typecheck` exits 0 and module types import no framework or vendor package

- [ ] T021 [FR-ADMIN-002, NFR-SEC-001, NFR-SEC-006, NFR-DATA-001, NFR-DATA-002] Implement the PostgreSQL redacted audit, chain, export batch, and readiness repository through non-owner transactions — `services/api/src/adapters/postgres/audit-admin-service.ts`
  - Depends on: `T008`, `T009`, `T010`, `T020`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/api test -- audit-admin-postgres` exits 0 with forced RLS and no raw metadata DTO

- [ ] T022 [FR-ADMIN-003, NFR-SEC-001, NFR-PRIV-002, NFR-PERF-002] Implement `getAdminSummary` authorization, approved configuration lookup, server-side suppression, and inactive-gate behavior — `services/api/src/modules/audit-admin/service.ts`
  - Depends on: `T014`, `T015`, `T020`, `T021`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/api test -- audit-admin-summary` exits 0 with metrics empty returning legal-gate-disabled and approved fixtures never leaking suppressed counts

- [ ] T023 [FR-ADMIN-002, NFR-SEC-001, NFR-SEC-004, NFR-SEC-006, NFR-API-002] Implement purpose-limited redacted list/detail use cases with current AAL2 and opaque bounded cursors — `services/api/src/modules/audit-admin/service.ts`
  - Depends on: `T020`, `T021`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/api test -- audit-admin-events` exits 0 with only the authorized matrix case receiving bounded redacted evidence

- [ ] T024 [FR-ADMIN-002, NFR-SEC-002, NFR-SEC-005, NFR-SEC-006, NFR-PRIV-004] Implement transactional audit export acceptance with range validation, idempotency, audit, outbox, and stored response — `services/api/src/modules/audit-admin/service.ts`
  - Depends on: `T009`, `T020`, `T021`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/api test -- audit-export-request` exits 0 with one effect for concurrent identical requests and changed-body reuse returning 409

- [ ] T025 [FR-ADMIN-002, NFR-SEC-002, NFR-SEC-005, NFR-SEC-006, NFR-PORT-001] Implement service-authenticated `exportAuditPartition` orchestration with deterministic object key, digest/proof verification, and fail-closed replay — `services/api/src/modules/audit-admin/export-service.ts`
  - Depends on: `T016`, `T017`, `T021`, `T024`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/api test -- audit-export-internal` exits 0 with identical replay accepted and byte, digest, proof, auth, or state mismatch denied

- [ ] T026 [FR-ADMIN-002, FR-ADMIN-003, NFR-API-001, NFR-API-002, NFR-SEC-004] Register the four admin and internal export routes with validated schemas, RFC 9457 problems, request IDs, cache controls, AAL/purpose, and service authentication — `services/api/src/routes/audit-admin.ts`
  - Depends on: `T004`, `T022`, `T023`, `T024`, `T025`
  - Acceptance evidence: `node tools/verify-feature-008-contract.mjs --implemented admin-export` exits 0 with exactly five registered Feature 008 operations and no undocumented route

- [ ] T027 [FR-ADMIN-002, FR-ADMIN-003, NFR-SEC-001, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006, NFR-API-002, NFR-QUALITY-001] Add API contract, authorization, cursor, redaction, idempotency, race, tamper, failure, and cache-control integration tests — `services/api/test/audit-admin-observability.integration.test.ts`
  - Depends on: `T022`, `T023`, `T024`, `T025`, `T026`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/api test:integration -- audit-admin-observability` exits 0 with every AC-01 through AC-07 API case passing

- [ ] T028 [P] [FR-ADMIN-002, FR-ADMIN-003, NFR-API-001] Add deterministic generation and generate TypeBox contracts and the API client only from the locked Feature 008 OpenAPI source — `tools/generate-feature-008-contracts.mjs`, `packages/contracts/src/audit-admin.ts`, `packages/api-client/src/audit-admin.ts`
  - Depends on: `T004`
  - Acceptance evidence: `node tools/generate-feature-008-contracts.mjs --check` exits 0 and a write run followed by check produces zero Git diff

- [ ] T029 [FR-ADMIN-002, FR-ADMIN-003, NFR-API-001, NFR-API-002, NFR-QUALITY-001] Add contract/client/catalog parity tests and public export maps for the locked seven-operation source — `packages/contracts/src/audit-admin.test.ts`, `packages/api-client/src/audit-admin.test.ts`
  - Depends on: `T026`, `T028`
  - Acceptance evidence: `corepack pnpm contracts:check` exits 0 with exact seven-operation schema and client parity

## Phase 5 — Export worker and adapters

- [ ] T030 [FR-ADMIN-002, NFR-SEC-002, NFR-SEC-006, NFR-PORT-001] Define the minimum export work, immutable object, retention-proof, clock, and telemetry adapter ports — `services/worker/src/audit-export.ts`
  - Depends on: `T020`, `T024`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/worker typecheck` exits 0 and ports expose no audit payload, signed URL, credential, or actor secret

- [ ] T031 [P] [NFR-SEC-002, NFR-PORT-001] Implement a local synthetic create-if-absent encrypted object and retention-proof simulator without production WORM claims — `services/worker/src/adapters/local-synthetic-audit-object.ts`
  - Depends on: `T030`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/worker test -- local-synthetic-audit-object` exits 0 with overwrite and digest mismatch rejected

- [ ] T032 [FR-ADMIN-002, NFR-SEC-005, NFR-SEC-006, NFR-OBS-001] Implement ordered export claims, bounded leases/backoff, unique receipts, internal operation calls, dead letter, and append-only replay handling — `services/worker/src/audit-export.ts`
  - Depends on: `T009`, `T019`, `T025`, `T030`, `T031`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/worker test -- audit-export` exits 0 with per-export order, one reclaim, bounded retry, and immutable original request

- [ ] T033 [FR-ADMIN-002, NFR-SEC-005, NFR-SEC-006, NFR-QUALITY-001] Add worker race, transient, permanent-schema, service-auth, proof, lease-expiry, deduplication, dead-letter, and replay tests — `services/worker/src/audit-export.test.ts`
  - Depends on: `T032`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/worker test -- audit-export` exits 0 with all AC-05 through AC-07 worker cases passing

- [ ] T034 [NFR-SEC-001, NFR-SEC-005, NFR-SEC-007, NFR-QUALITY-001] Add private-network service-auth, wrong-batch, wrong-range, changed-body replay, and rate-abuse integration tests for the internal export operation — `services/api/test/audit-export-service-auth.integration.test.ts`
  - Depends on: `T025`, `T026`, `T033`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/api test:integration -- audit-export-service-auth` exits 0 with every unauthenticated or mismatched request denied

## Phase 6 — User story 1: privacy-safe admin summary

**Independent outcome:** An authorized admin sees the bilingual gated state with `metrics: []`, and approved test fixtures render only safe role-projected cells.

- [ ] T035 [US1] [FR-ADMIN-003, NFR-I18N-001, NFR-A11Y-001, NFR-AVAIL-002] Implement `/dashboard` loading, empty, gated, suppressed, stale, offline, permission, error, and safe-success states using shared primitives — `apps/admin/src/app/dashboard/AdminDashboard.tsx`
  - Depends on: `T005`, `T022`, `T028`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/admin test -- dashboard` exits 0 with no selector, drill-down, raw suppressed count, or offline mutation

- [ ] T036 [US1] [FR-ADMIN-003, NFR-I18N-001, NFR-A11Y-001, NFR-QUALITY-001] Add Arabic/English parity, RTL/LTR, bidi, keyboard, screen-reader, focus, reflow, contrast, targets, and reduced-motion component tests — `apps/admin/test/audit-admin-dashboard.test.ts`
  - Depends on: `T035`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/admin test -- audit-admin-dashboard` exits 0 in both locales and all required accessibility states

- [ ] T037 [US1] [FR-ADMIN-003, NFR-PRIV-002, NFR-AVAIL-002, NFR-QUALITY-001] Add end-to-end inactive-config, suppression, linked-release, stale/reconnect, private-cache, and non-admin denial coverage — `tests/e2e/audit-admin-summary.spec.ts`
  - Depends on: `T015`, `T027`, `T036`
  - Acceptance evidence: `corepack pnpm test:audit-admin:e2e -- summary` exits 0 with metrics empty gated and every safe-disclosure assertion passing

- [ ] T038 [US1] [FR-ADMIN-003, NFR-I18N-001, NFR-A11Y-001, NFR-PRIV-002] Record the independently demonstrable dashboard checkpoint and privacy-vector evidence — `specs/008-audit-admin-aggregates-observability/evidence/dashboard/checkpoint.md`
  - Depends on: `T037`
  - Acceptance evidence: `node tools/verify-feature-008-evidence.mjs --story US1` exits 0 with 34 of 34 vectors and complete Arabic/English accessibility metadata

## Phase 7 — User stories 2 and 3: audit investigation and verifiable export

**Independent outcome:** A current super-admin at AAL2 with purpose can inspect redacted evidence and queue one verifiable export without any new operation or offline mutation.

- [ ] T039 [US2] [FR-ADMIN-002, NFR-SEC-004, NFR-I18N-001, NFR-A11Y-001, NFR-AVAIL-002] Implement `/audit` step-up, purpose, filters, list/detail, empty, permission, stale, offline, error, and chain-evidence states — `apps/admin/src/app/audit/AuditWorkspace.tsx`
  - Depends on: `T005`, `T023`, `T028`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/admin test -- audit-workspace` exits 0 with non-super, DPO-only, AAL1, and no-purpose states denied

- [ ] T040 [US3] [FR-ADMIN-002, NFR-SEC-002, NFR-SEC-005, NFR-I18N-001, NFR-A11Y-001] Add queued, retrying, dead-letter, proven, digest, retention-proof, and no-offline-export states sourced only from catalogued audit evidence — `apps/admin/src/app/audit/AuditWorkspace.tsx`
  - Depends on: `T024`, `T025`, `T039`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/admin test -- audit-export` exits 0 with no export polling endpoint and no toast-only success

- [ ] T041 [US3] [FR-ADMIN-002, NFR-SEC-001, NFR-SEC-004, NFR-SEC-006, NFR-I18N-001, NFR-A11Y-001, NFR-QUALITY-001] Add Arabic/English audit UI, full authorization matrix, cursor, redaction, export race/failure, keyboard/NVDA, reflow, contrast, and reduced-motion E2E tests — `tests/e2e/audit-admin-events.spec.ts`, `tests/e2e/audit-export.spec.ts`
  - Depends on: `T027`, `T033`, `T036`, `T040`
  - Acceptance evidence: `corepack pnpm test:audit-admin:e2e -- audit export` exits 0 with AC-03 through AC-08 passing and zero offline export effects

- [ ] T042 [US3] [FR-ADMIN-002, NFR-SEC-004, NFR-SEC-006, NFR-I18N-001, NFR-A11Y-001] Record independently demonstrable audit investigation and export checkpoints with immutable digests — `specs/008-audit-admin-aggregates-observability/evidence/audit/checkpoint.md`
  - Depends on: `T041`
  - Acceptance evidence: `node tools/verify-feature-008-evidence.mjs --story US2 --story US3` exits 0 with exact SHA-backed authorization, redaction, chain, export, and bilingual evidence

## Phase 8 — User story 4: honest health and operational signals

**Independent outcome:** Private probes distinguish live from ready and operators receive correlated low-cardinality signals without sensitive detail.

- [ ] T043 [US4] [NFR-API-001, NFR-AVAIL-001, NFR-OBS-001, NFR-PORT-001] Implement process-only liveness and bounded database/outbox/audit-integrity readiness policies and register both health routes — `services/api/src/modules/audit-admin/health-service.ts`, `services/api/src/routes/audit-admin.ts`
  - Depends on: `T018`, `T021`, `T026`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/api test -- health-readiness` and `node tools/verify-feature-008-contract.mjs --implemented all` exit 0 with liveness independent of database and exactly seven registered operations

- [ ] T044 [US4] [NFR-SEC-001, NFR-SEC-007, NFR-AVAIL-001, NFR-OBS-001, NFR-QUALITY-001] Add service-auth, healthy, database-down, backlog, chain/proof failure, timeout, abuse, redaction, and bounded-reason health tests — `services/api/test/audit-admin-health.integration.test.ts`
  - Depends on: `T019`, `T034`, `T043`
  - Acceptance evidence: `corepack pnpm --filter @shifaa/api test:integration -- audit-admin-health` exits 0 with AC-09 passing and zero secret topology or payload detail

- [ ] T045 [US4] [NFR-AVAIL-001, NFR-OBS-001] Record the independent liveness/readiness and operational-signal checkpoint — `specs/008-audit-admin-aggregates-observability/evidence/operations/health-checkpoint.md`
  - Depends on: `T044`
  - Acceptance evidence: `node tools/verify-feature-008-evidence.mjs --story US4` exits 0 with every expected ready degraded and not-ready result

## Phase 9 — Hardening, performance, restore, and release evidence

- [ ] T046 [NFR-SEC-001, NFR-SEC-002, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006, NFR-SEC-007] Run ASVS L2, applicable admin/health-data L3, API Top 10, RLS/search-path/grant, replay/race, dependency, SAST, secret, and storage-proof reviews and close applicable findings — `specs/008-audit-admin-aggregates-observability/evidence/security/security-report.md`
  - Depends on: `T012`, `T019`, `T034`, `T041`, `T044`
  - Acceptance evidence: `corepack pnpm test:audit-admin:security` exits 0 with zero unresolved reportable high or critical finding

- [ ] T047 [FR-ADMIN-002, FR-ADMIN-003, NFR-PERF-002, NFR-API-002, NFR-QUALITY-001] Run the declared 250000-event, three-partition, 50-cell, 20-connection, 25-worker load profile with warmed pools — `tools/audit-admin-performance.ts`
  - Depends on: `T037`, `T041`, `T044`
  - Acceptance evidence: `corepack pnpm test:audit-admin:performance` exits 0 with read p95 at most 400 ms and mutation p95 at most 800 ms under the recorded topology

- [ ] T048 [NFR-SEC-002, NFR-AVAIL-001, NFR-DATA-001, NFR-PRIV-004, NFR-QUALITY-001] Execute database plus immutable-object restore and verify RPO, RTO, every chain, digest, proof, and fail-closed readiness — `specs/008-audit-admin-aggregates-observability/evidence/operations/restore-report.md`
  - Depends on: `T013`, `T033`, `T044`
  - Acceptance evidence: `corepack pnpm test:audit-admin:restore` exits 0 with RPO at most 15 minutes RTO at most 60 minutes and zero verification mismatch

- [ ] T049 [FR-ADMIN-002, FR-ADMIN-003, NFR-I18N-001, NFR-A11Y-001, NFR-AVAIL-002] Capture live Arabic RTL and English LTR keyboard/NVDA/zoom/reflow/forced-colors/reduced-motion evidence at 768x1024 and 1440x900 — `specs/008-audit-admin-aggregates-observability/evidence/ui/acceptance.md`
  - Depends on: `T038`, `T042`
  - Acceptance evidence: `node tools/verify-feature-008-evidence.mjs --ui` exits 0 and snapshots are labeled informative rather than pixel-identical

- [ ] T050 [FR-ADMIN-002, FR-ADMIN-003, NFR-OBS-001, NFR-QUALITY-001] Run the complete prohibited-sentinel scan across API, UI, logs, traces, metrics, cache metadata, exports, screenshots, and evidence — `specs/008-audit-admin-aggregates-observability/evidence/observability/redaction-report.md`
  - Depends on: `T019`, `T038`, `T042`, `T045`
  - Acceptance evidence: `corepack pnpm test:audit-admin:privacy` exits 0 with zero prohibited value and zero high-cardinality identifier label

- [ ] T051 [FR-ADMIN-002, FR-ADMIN-003, NFR-SEC-006, NFR-AVAIL-001, NFR-AVAIL-002, NFR-OBS-001, NFR-QUALITY-001] Run the full AC-01 through AC-10 and SC-001 through SC-008 suite and generate a SHA-bound evidence manifest — `specs/008-audit-admin-aggregates-observability/evidence/manifest.json`
  - Depends on: `T046`, `T047`, `T048`, `T049`, `T050`
  - Acceptance evidence: `node tools/verify-feature-008-evidence.mjs --all` exits 0 with every acceptance and success criterion mapped to a present digest

- [ ] T052 [FR-ADMIN-002, FR-ADMIN-003, NFR-API-001, NFR-DATA-001, NFR-OBS-001] Update the Feature 008 realization, API/data/UI catalogs, traceability, processing inventory, and audit/export/health/restore incident runbooks without changing the frozen scope — `docs/architecture/SHIFAA-API-Catalog.md`, `docs/architecture/SHIFAA-Data-RLS.md`, `docs/design/SHIFAA-UI-Contract.md`, `docs/traceability/SHIFAA-Traceability-Matrix.md`, `infra/runbooks/audit-admin-observability.md`
  - Depends on: `T051`
  - Acceptance evidence: `corepack pnpm architecture:check` exits 0 and the trace matrix maps only the seven canonical operations and approved Feature 008 requirements

- [ ] T053 [FR-ADMIN-002, FR-ADMIN-003, NFR-SEC-007, NFR-PRIV-002, NFR-I18N-001, NFR-A11Y-001, NFR-PERF-002, NFR-AVAIL-001, NFR-AVAIL-002, NFR-DATA-002, NFR-API-001, NFR-API-002, NFR-OBS-001, NFR-QUALITY-001, NFR-PORT-001] Run clean full repository verification, contract regeneration zero-diff, migration reset, and final scope/security-branch audit — `specs/008-audit-admin-aggregates-observability/evidence/final-verification.md`
  - Depends on: `T029`, `T046`, `T047`, `T048`, `T049`, `T050`, `T051`, `T052`
  - Acceptance evidence: `corepack pnpm verify` and `git diff --check` exit 0 with exact seven operations metrics empty by default and no security remediation diff

- [ ] T054 [FR-ADMIN-002, FR-ADMIN-003, NFR-PRIV-002, NFR-PRIV-004, NFR-QUALITY-001] Record implementation-stage QA/Product/Security/Data evidence, preserve production and formal-UX blockers, and approve only the supported synthetic rollout/kill-switch state — `specs/008-audit-admin-aggregates-observability/checklists/requirements.md`
  - Depends on: `T053`
  - Acceptance evidence: `node tools/verify-feature-008-evidence.mjs --release` exits 0 with no fabricated production WORM legal retention device pixel-identity or UAT approval
