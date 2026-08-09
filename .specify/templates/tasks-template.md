# Tasks: [FEATURE]

> **Feature:** `[NNN-short-name]` · **Plan status:** `PLAN_APPROVED`  
> Every task uses `- [ ] T### [P?] [US#?] [FR/NFR IDs] description — exact file/path`. A completed box means the named verification evidence exists.

## Rules

- Order tasks by dependency and independently testable user story. `[P]` is allowed only for non-overlapping files/contracts with approved dependencies.
- Abort task generation if any target ID is not `ACTIVE` in the current PRD; deferred/reserved/retired IDs require a prior approved re-entry ADR and synchronized scope update.
- Every targeted FR/NFR appears in at least one implementation task and one verification task.
- Tests are mandatory for domain logic, API contracts, RLS, migrations, safety, security, accessibility, and acceptance paths. Do not omit them because the spec did not ask for TDD.
- Legal/clinical/design/vendor blockers become explicit gate tasks and cannot be “implemented around.”
- Tasks cite actual repository paths. Generated artifacts name their source and generation command; generated files are not manually edited.
- Each story ends with a checkpoint that can be demonstrated using synthetic data without relying on a later story.

## Phase 1 — Gates and contract fixtures

- [ ] T001 [FR/NFR IDs] Verify spec/plan approvals, classify every open blocker by gate/capability, and confirm no blocker applies to implementation with synthetic data — `specs/[feature]/checklists/requirements.md`
- [ ] T002 [FR/NFR IDs] Add deterministic positive/negative/race/replay/vendor-failure fixtures — `packages/test-kit/...`
- [ ] T003 [NFR-API-001] Update operation schemas and examples — `specs/[feature]/contracts/openapi.yaml`
- [ ] T004 [FR/NFR IDs] Add Arabic/English message keys and parity test — `packages/i18n/...`

## Phase 2 — Data foundation

- [ ] T005 [FR/NFR IDs] Add expand migration, constraints, indexes, state functions, encryption/retention metadata — `infra/db/migrations/...`
- [ ] T006 [NFR-SEC-001] Add/force RLS and fixed-search-path helpers — `infra/db/policies/...`
- [ ] T007 [FR/NFR IDs] Add migration/state/concurrency tests — `infra/db/tests/...`
- [ ] T008 [NFR-SEC-001] Add complete actor/resource/action negative RLS matrix — `infra/db/tests/rls/...`

## Phase 3 — Domain and API

- [ ] T009 [FR/NFR IDs] Implement pure domain states/policies — `packages/core/src/[domain]/...`
- [ ] T010 [FR/NFR IDs] Add unit/property test vectors — `packages/core/src/[domain]/*.test.ts`
- [ ] T011 [FR/NFR IDs] Implement repositories/use cases with transaction, authorization, audit, and outbox — `services/api/src/modules/[domain]/...`
- [ ] T012 [NFR-SEC-005] Implement/test idempotency and version conflict behavior — `services/api/src/...`
- [ ] T013 [NFR-API-001/002] Register generated/validated routes and RFC 9457 problems — `services/api/src/routes/...`
- [ ] T014 [FR/NFR IDs] Add API contract/integration/negative authorization tests — `services/api/test/...`
- [ ] T015 [NFR-API-001] Regenerate OpenAPI and client; verify zero diff after regeneration — `packages/contracts/...`, `packages/api-client/...`

## Phase 4 — Events, notifications, and adapters

- [ ] T016 [FR-NOTIF-001/002 if applicable] Implement minimum outbox event/template/recipient contract — `services/worker/src/...`
- [ ] T017 [FR-NOTIF-002] Add retry, deduplication, dead-letter, ordering, and replay tests — `services/worker/test/...`
- [ ] T018 [NFR-PORT-001] Implement vendor adapter without domain leakage — `services/*/src/adapters/...`
- [ ] T019 [FR/NFR IDs] Add sandbox, timeout, invalid signature/replay, fallback, and kill-switch tests — `services/*/test/adapters/...`

## Phase 5 — User story [US1: title]

**Independent outcome:** [one observable end-to-end outcome]

- [ ] T020 [US1] [FR/NFR IDs] Add route/screen states using shared components — `apps/[app]/...`
- [ ] T021 [P] [US1] [NFR-I18N-001/NFR-A11Y-001] Add Arabic/English/RTL/keyboard/screen-reader behavior — `apps/[app]/...`
- [ ] T022 [US1] [FR/NFR IDs] Add loading/empty/error/offline/stale/success/permission/override states — `apps/[app]/...`
- [ ] T023 [US1] [FR/NFR IDs] Add E2E, accessibility, and approved visual tests — `apps/[app]/test/...`
- [ ] T024 [US1] [FR/NFR IDs] Run independent story checkpoint and attach evidence — `specs/[feature]/checklists/requirements.md`

> Repeat one phase per additional user story. Number tasks monotonically; do not reuse IDs.

## Final phase — Hardening and release evidence

- [ ] T0XX [NFR-SEC-007] Run ASVS/API abuse/security scans and close applicable findings — `[evidence path]`
- [ ] T0XX [NFR-PERF-001/002] Run reference-device/API load tests against stated dataset/topology — `[evidence path]`
- [ ] T0XX [NFR-OBS-001] Verify dashboards/alerts/redaction/no-PHI telemetry — `[evidence path]`
- [ ] T0XX [NFR-AVAIL-001/002] Verify backup/restore/reconnect/degraded behavior as applicable — `[evidence path]`
- [ ] T0XX [FR/NFR IDs] Run full Given/When/Then acceptance suite and migration validation — `[evidence path]`
- [ ] T0XX [FR/NFR IDs] Update API/data/UI catalogs, trace matrix, ADR/open register, and generated docs — `[paths]`
- [ ] T0XX [FR/NFR IDs] Complete release approvals with artifact digests and no applicable blocker — `specs/[feature]/checklists/requirements.md`
- [ ] T0XX [FR/NFR IDs] Execute feature-flag rollout and verify SLO/rollback/kill switch — `[runbook/evidence]`
