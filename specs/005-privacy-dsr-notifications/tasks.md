# Tasks: Privacy DSR and Notifications

> **Feature:** `005-privacy-dsr-notifications` · **Plan status:** `PLAN_APPROVED — seeded-synthetic engineering`
> A completed checkbox requires the exact evidence below. Formal production/legal/vendor/design gates remain open.

## Phase 1 — Gates, fixtures, and frozen contracts

- [ ] T001 [FR-AUTH-007, FR-AUTH-008, FR-ADMIN-002, FR-ADMIN-004, FR-NOTIF-001, FR-NOTIF-002, NFR-PRIV-001, NFR-PRIV-002, NFR-PRIV-003, NFR-PRIV-004, NFR-QUALITY-001] Verify engineering approvals, classify every OPEN item, and prove none authorizes production data, retention automation, or SMS — `specs/005-privacy-dsr-notifications/checklists/requirements.md`
  - Depends on: `none`
  - Acceptance evidence: checked engineering-scope items remain distinct from unchecked formal gates and every blocker names the disabled capability
- [ ] T002 [P] [FR-AUTH-007, FR-ADMIN-002, FR-NOTIF-001, FR-NOTIF-002, NFR-SEC-001, NFR-SEC-005] Add deterministic subject, guardian, delegate, facility, admin, DPO-guard permutation, request-state, export, template, retry, callback, replay, race, and redaction fixtures — `packages/test-kit/src/privacy-dsr-notifications.ts`
  - Depends on: `T001`
  - Acceptance evidence: fixture tests enumerate every AC-01 through AC-18 positive and negative vector with synthetic UUIDs and no raw contact, token, body, or PHI sentinel
- [ ] T003 [P] [FR-AUTH-007, FR-ADMIN-002, FR-ADMIN-004, FR-NOTIF-001, FR-NOTIF-002, NFR-API-001, NFR-API-002, NFR-QUALITY-001] Freeze and validate the 12 exact operation schemas, examples, headers, role projections, and problem responses with no active-catalog drift — `specs/005-privacy-dsr-notifications/contracts/openapi.yaml`
  - Depends on: `T001`
  - Acceptance evidence: YAML parses as OpenAPI 3.1, contains exactly the 12 approved operation IDs, and contract drift tests reject additions, renames, removals, and hand-written client routes
- [ ] T004 [P] [FR-AUTH-007, FR-NOTIF-001, NFR-I18N-001, NFR-A11Y-001] Add Arabic-first and English-parity DSR, DPO, template, delivery, erasure-gate, export, and edge-state message keys — `packages/i18n/src/catalogs.ts`
  - Depends on: `T001`
  - Acceptance evidence: catalog tests prove exact key/placeholder parity, RTL-safe copy, no false deletion/provider promise, and no untranslated key

## Phase 2 — PostgreSQL, RLS, and private Storage foundation

- [ ] T005 [FR-AUTH-007, FR-AUTH-008, FR-ADMIN-002, FR-NOTIF-001, FR-NOTIF-002, NFR-DATA-001, NFR-PRIV-001, NFR-PRIV-002, NFR-PRIV-004, NFR-SEC-005] Add the expand migration for governance designations, DSR/events/assignments/export capabilities, templates, notifications, attempts, callback receipts, outbox ordering/replay metadata, inventory, flags, constraints, indexes, transition functions, and deterministic seeds — `supabase/migrations/20260813000500_privacy_dsr_notifications.sql`
  - Depends on: `T002`, `T003`
  - Acceptance evidence: fresh and upgrade migrations succeed, constraints reject invalid state/schema/separation/retention cases, all timestamps/versions/dedup indexes match `data-model.md`, and no automated deletion exists
- [ ] T006 [FR-AUTH-007, FR-ADMIN-002, FR-NOTIF-001, FR-NOTIF-002, NFR-SEC-001, NFR-SEC-003, NFR-SEC-006] Add least grants, fixed-search-path authorization helpers, forced RLS, append-only guards, and function-scoped worker/operator policies — `supabase/migrations/20260813000500_privacy_dsr_notifications.sql`
  - Depends on: `T005`
  - Acceptance evidence: every new/changed table has ENABLE and FORCE RLS, online role is non-owner/non-BYPASSRLS, DELETE is absent, and each helper rechecks current database facts
- [ ] T007 [FR-AUTH-007, NFR-PRIV-002, NFR-SEC-001, NFR-SEC-003] Add the private `dsr-exports` Storage registry/bucket policy and scanner-release binding with no public or direct user access — `supabase/migrations/20260813000600_privacy_dsr_storage.sql`
  - Depends on: `T005`
  - Acceptance evidence: private-bucket tests deny list/read/write to unauthorized users and allow only the Core API bounded capability flow against a released bound object
- [ ] T008 [FR-AUTH-007, FR-AUTH-008, FR-NOTIF-001, FR-NOTIF-002, NFR-DATA-001, NFR-SEC-005] Add migration, state-shape, transition, inventory, separation, ordering, dedup, callback, and no-erasure-automation SQL tests — `infra/db/tests/privacy-dsr-notifications-schema.sql`
  - Depends on: `T006`, `T007`
  - Acceptance evidence: `pnpm db:test` proves fresh/upgrade shape, every valid transition, every invalid transition, duplicate keys, schema constraints, and retention gate without destructive effects
- [ ] T009 [FR-AUTH-007, FR-ADMIN-002, FR-NOTIF-001, FR-NOTIF-002, NFR-SEC-001, NFR-SEC-003, NFR-SEC-006] Add the complete forced-RLS actor/resource/action matrix for patient, guardian, delegate, facility, admin, assigned/unassigned/stale DPO, author/publisher, worker, operator, and callback contexts — `infra/db/tests/privacy-dsr-notifications-rls.sql`
  - Depends on: `T006`, `T007`
  - Acceptance evidence: `pnpm db:rls-test` runs as `shifaa_api`, independently removes relation/designation/assignment/AAL2/purpose/permission guards, denies direct Storage/outbox access, and leaks zero prohibited fields

## Phase 3 — Pure domain, contracts, and generated client

- [ ] T010 [FR-AUTH-007, FR-AUTH-008, FR-ADMIN-002, FR-ADMIN-004, FR-NOTIF-001, FR-NOTIF-002, NFR-PRIV-001, NFR-PRIV-002, NFR-PRIV-004, NFR-PORT-001] Implement pure DSR state/role projection, template schema/digest/separation, notification allow-list, retry, ordering, and erasure-gate policies behind ports — `packages/core/src/privacy-dsr-notifications/`
  - Depends on: `T002`, `T003`
  - Acceptance evidence: core imports no HTTP, SQL, Supabase, UI, or provider SDK and exposes only closed states/types/allowed fields and deterministic policy results
- [ ] T011 [FR-AUTH-007, FR-AUTH-008, FR-ADMIN-002, FR-ADMIN-004, FR-NOTIF-001, FR-NOTIF-002, NFR-SEC-004, NFR-SEC-005, NFR-QUALITY-001] Add table-driven/property tests for all DSR transitions, projections, template placeholders/digests, retry/DLQ, delivery/receipt dedup, callback replay, and forbidden payload fields — `packages/core/src/privacy-dsr-notifications/privacy-dsr-notifications.test.ts`
  - Depends on: `T010`
  - Acceptance evidence: tests cover every branch and boundary from AC-01 through AC-16 without restating implementation logic or relying on wall-clock/network randomness
- [ ] T012 [FR-AUTH-007, FR-ADMIN-002, FR-NOTIF-001, FR-NOTIF-002, NFR-API-001, NFR-API-002] Add TypeBox/source schemas, exact operation registry, role projections, examples, and problem codes generated from the frozen feature contract — `packages/contracts/src/privacy-dsr-notifications.ts`
  - Depends on: `T003`, `T010`
  - Acceptance evidence: contract tests accept all positive fixtures, reject all unknown/prohibited fields, and compare exact operation IDs/methods/paths with the feature OpenAPI and API Catalog
- [ ] T013 [FR-AUTH-007, FR-ADMIN-002, FR-NOTIF-001, FR-NOTIF-002, NFR-API-001, NFR-PORT-001] Generate/export typed calls for all 12 operations and prohibit handwritten endpoint drift, persistent sensitive caching, and direct Supabase access — `packages/api-client/src/privacy-dsr-notifications.ts`
  - Depends on: `T012`
  - Acceptance evidence: client tests verify method/path/header/body/response/problem mapping, private/no-store handling, cancellation, and exact registry parity; regeneration produces zero diff

## Phase 4 — Atomic API, export, and authorization

- [ ] T014 [FR-AUTH-007, FR-AUTH-008, FR-ADMIN-002, NFR-PRIV-001, NFR-PRIV-002, NFR-SEC-001, NFR-SEC-003, NFR-SEC-006, NFR-PORT-001] Implement PostgreSQL privacy repository transactions with current subject/guardian/DPO authorization, assignments, processing inventory, events, audit, outbox, private evidence, and one-time export capability — `services/api/src/adapters/postgres/privacy-dsr-service.ts`
  - Depends on: `T009`, `T010`, `T012`
  - Acceptance evidence: real PostgreSQL integration proves current-state authorization and atomic domain/event/audit/outbox/canonical-response/idempotency commit with no owner/service-role path
- [ ] T015 [FR-AUTH-007, FR-AUTH-008, FR-ADMIN-002, FR-NOTIF-001, NFR-SEC-005, NFR-QUALITY-001] Implement privacy/template use cases, exact validation, role-minimized projections, stable problems, optimistic versions, separation, and retention/inventory gates — `services/api/src/modules/privacy-dsr-notifications/`
  - Depends on: `T010`, `T012`, `T014`
  - Acceptance evidence: unit tests prove same-key replay, changed-body conflict, processing-state race, invalid transition, missing evidence, missing inventory, self-publish, and erasure automation denial with no partial effect
- [ ] T016 [FR-AUTH-007, FR-ADMIN-002, FR-NOTIF-001, FR-NOTIF-002, NFR-API-001, NFR-API-002, NFR-SEC-004] Register all 12 validated Fastify routes, provider signature/timestamp envelope, no-store headers, generated schemas, and feature flags — `services/api/src/routes/privacy-dsr-notifications.ts`
  - Depends on: `T013`, `T015`
  - Acceptance evidence: route contract tests cover every status/schema/header/guard/problem, no unregistered route exists, callback verification precedes persistence, and production provider mode fails closed
- [ ] T017 [FR-AUTH-007, FR-AUTH-008, FR-ADMIN-002, FR-NOTIF-001, FR-NOTIF-002, NFR-SEC-001, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006] Add in-memory and real PostgreSQL API integration tests for the full actor/transition/export/template/callback/replay matrix — `services/api/test/privacy-dsr-notifications.integration.test.ts`
  - Depends on: `T016`
  - Acceptance evidence: API and forced-RLS outcomes agree for all actors, export is ready/private/once/expired/no-store, callbacks accept valid once and reject invalid/replayed, and every mutation is atomic/idempotent/versioned

## Phase 5 — Worker, delivery adapter, receipts, and dead letters

- [ ] T018 [FR-NOTIF-001, FR-NOTIF-002, NFR-PRIV-001, NFR-PRIV-004, NFR-OBS-001, NFR-PORT-001] Implement published-template resolution, exact field rendering, recipient policy, notification dedup, aggregate ordering, leases, receipts, retry schedule, dead letter, and immutable replay — `services/worker/src/privacy-dsr-notifications.ts`
  - Depends on: `T010`, `T012`, `T014`
  - Acceptance evidence: worker state machine processes only the next aggregate version, creates one visible notification, records minimum attempts/receipts, and emits only safe metrics/errors
- [ ] T019 [FR-NOTIF-002, NFR-SEC-004, NFR-PORT-001] Implement the deterministic local messaging adapter and signed provider receipt fixture with production adapter hard-disabled — `services/worker/src/adapters/local-synthetic-messaging.ts`
  - Depends on: `T018`
  - Acceptance evidence: deterministic success/transient/permanent/timeout outcomes use opaque destinations and provider idempotency; no network/vendor SDK/raw contact/full body persistence exists
- [ ] T020 [FR-NOTIF-001, FR-NOTIF-002, NFR-PRIV-001, NFR-PRIV-004, NFR-SEC-004, NFR-SEC-005, NFR-OBS-001, NFR-QUALITY-001] Add worker tests for schema/recipient denial, canonical retry plus jitter, leases, crash/reclaim, ordering gaps, visible-delivery dedup, receipt replay, DLQ, authorized replay, kill switch, and redaction — `services/worker/src/privacy-dsr-notifications.test.ts`
  - Depends on: `T018`, `T019`
  - Acceptance evidence: all canonical delays and outcomes are deterministic, duplicate/replay/crash vectors produce one visible delivery, original dead letters stay immutable, and sentinels never appear in persisted/logged projections
- [ ] T021 [FR-NOTIF-002, NFR-SEC-001, NFR-SEC-004, NFR-SEC-005, NFR-PERF-002] Run real PostgreSQL worker/callback/replay integration with concurrent claims and duplicate receipts — `tests/e2e/privacy-notification-delivery.spec.ts`
  - Depends on: `T017`, `T020`
  - Acceptance evidence: concurrent workers claim once with `SKIP LOCKED`, receipt/callback/provider idempotency suppress duplicates, dead-letter replay appends one new attempt, and p95 worker claim/process evidence meets the stated local profile

## Phase 6 — User Story 1: Patient DSR and private export

**Independent outcome:** A patient or legally authorized guardian can create/track all four DSR types and securely consume a released export while every unauthorized context is denied.

- [ ] T022 [US1] [FR-AUTH-007, FR-AUTH-008, NFR-PRIV-001, NFR-PRIV-002, NFR-SEC-003, NFR-I18N-001, NFR-A11Y-001] Add generated-client privacy request data handling with cancellation, memory-only/no-store behavior, authoritative reconnect, explicit offline/stale/conflict states, and no offline mutation queue while preserving secure mobile/web session storage and refresh rotation — `apps/patient/src/privacy-dsr-api.ts`
  - Depends on: `T004`, `T013`, `T017`
  - Acceptance evidence: patient API tests prove request cancellation, RFC 9457 mapping, no persistent sensitive cache, no offline write, relation context, and export response privacy
- [ ] T023 [US1] [FR-AUTH-007, FR-AUTH-008, NFR-PRIV-001, NFR-PRIV-002, NFR-PERF-001, NFR-I18N-001, NFR-A11Y-001] Preserve `/privacy` and `/privacy/consents` and implement `/privacy/requests` with all four types, history/due labels, identity gate, export-ready/expired, erasure warning, responsive RTL/LTR, keyboard/reflow/contrast/reduced-motion, bundle/render discipline, and all required states — `apps/patient/app/privacy-requests.tsx`
  - Depends on: `T004`, `T022`
  - Acceptance evidence: component/a11y tests cover compact and wide layout, loading/empty/form/offline/permission/stale/conflict/failure/success/status/export states in both locales with focus and announcement assertions
- [ ] T024 [US1] [FR-AUTH-007, FR-AUTH-008, NFR-PRIV-001, NFR-PRIV-002, NFR-SEC-001, NFR-SEC-005] Run the real patient/guardian/delegate/facility/unrelated-admin DSR, identity gate, decision history, export once/expiry/replay/no-store, and erasure-block checkpoint — `tests/e2e/privacy-dsr-subject.spec.ts`
  - Depends on: `T021`, `T023`
  - Acceptance evidence: all four types work for self/authorized guardian, every unauthorized API/RLS actor is denied, export consumes once from private Storage, and no subject data is deleted or pseudonymized

## Phase 7 — User Story 2: Purpose-limited DPO worklist

**Independent outcome:** An assigned current DPO can reasonedly decide/fulfil valid requests with minimum data, while each missing guard and general admin route is denied.

- [ ] T025 [US2] [FR-AUTH-007, FR-ADMIN-002, NFR-PRIV-001, NFR-SEC-003, NFR-SEC-004, NFR-I18N-001, NFR-A11Y-001] Implement admin `/privacy-requests` assigned worklist/detail/decision/fulfilment surfaces with secure session/AAL2 step-up, purpose, identity block, required reason/evidence, minimum projection, versions, permission/offline/stale/conflict/error/success, and accessible RTL/LTR layouts — `apps/admin/src/app/privacy-requests/`
  - Depends on: `T004`, `T013`, `T017`
  - Acceptance evidence: admin tests prove route filtering, every DPO guard, minimum fields, valid approve/partial/refuse/fulfil forms, focus/error/live announcements, responsive/reflow/contrast/reduced-motion, and no general-admin fallback
- [ ] T026 [US2] [FR-AUTH-007, FR-ADMIN-002, NFR-PRIV-001, NFR-SEC-001, NFR-SEC-003, NFR-SEC-005, NFR-SEC-006] Run real assigned-DPO guard permutations, valid/invalid transitions, reasons/evidence, version races, minimum projection, and no-general-admin checkpoint — `tests/e2e/privacy-dpo-worklist.spec.ts`
  - Depends on: `T024`, `T025`
  - Acceptance evidence: removing designation/assignment/AAL2/purpose independently denies API and forced RLS, all decision outcomes persist one event atomically, stale/invalid attempts persist none, and DPO cannot access audit/role/facility routes

## Phase 8 — User Story 3: Template governance and delivery operations

**Independent outcome:** Support authors create exact bilingual drafts, independent publishers release them, and local delivery/replay operations expose only governed minimum state.

- [ ] T027 [US3] [FR-NOTIF-001, FR-NOTIF-002, FR-ADMIN-004, NFR-PRIV-001, NFR-I18N-001, NFR-A11Y-001] Implement admin `/notification-templates` list/draft/publish/retry-status surfaces with paired locale editing, exact schema/recipient summary, separation/AAL2/purpose, production-disabled banner, and all accessible responsive states — `apps/admin/src/app/notification-templates/`
  - Depends on: `T004`, `T013`, `T017`, `T020`
  - Acceptance evidence: admin tests accept a valid paired draft/publish and reject missing locale, placeholder/schema/prohibited field, changed digest, self-publish, offline submit, and stale version in Arabic/English accessible layouts
- [ ] T028 [US3] [FR-AUTH-008, FR-NOTIF-001, FR-NOTIF-002, FR-ADMIN-004, NFR-PRIV-001, NFR-SEC-004, NFR-SEC-005] Run real template draft/independent publish, minimum delivery, retry/DLQ, valid/invalid callback, dedup, and authorized replay checkpoint — `tests/e2e/privacy-template-delivery.spec.ts`
  - Depends on: `T021`, `T026`, `T027`
  - Acceptance evidence: active inventory gates every stage, one visible message results, prohibited recipients/fields deliver zero, valid receipt persists once, invalid/replayed signatures are safe, and original dead letter remains immutable

## Final Phase — Evidence, hardening, convergence, and PR readiness

- [ ] T029 [NFR-PRIV-003, NFR-OBS-001, NFR-QUALITY-001] Add and execute the synthetic breach tabletop with awareness, +72-hour regulator target, regulator-notified fixture, +3-working-day subject target, decisions/evidence/closure timestamps, and explicit no-real-incident disclaimer — `specs/005-privacy-dsr-notifications/evidence/breach-tabletop.json`
  - Depends on: `T028`
  - Acceptance evidence: deterministic timestamp/working-day tests and runbook evidence agree, required fields/digests exist, no real person/regulator/vendor data or submission claim appears
- [ ] T030 [FR-AUTH-007, FR-AUTH-008, FR-ADMIN-002, FR-NOTIF-001, FR-NOTIF-002, NFR-PERF-001, NFR-PERF-002, NFR-PRIV-002, NFR-PRIV-003, NFR-PRIV-004, NFR-SEC-001, NFR-SEC-003, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006, NFR-OBS-001, NFR-PORT-001, NFR-QUALITY-001] Run migration/RLS/Storage, privacy production-gate/tabletop, API abuse, callback/export/replay, redaction, SAST, secret, dependency, SBOM, architecture, portability, and stated 100-session/row-volume performance gates; remediate every reportable HIGH/CRITICAL finding — `specs/005-privacy-dsr-notifications/evidence/security/`, `specs/005-privacy-dsr-notifications/evidence/performance.json`
  - Depends on: `T024`, `T026`, `T028`, `T029`
  - Acceptance evidence: security report has no unresolved reportable HIGH/CRITICAL, 001/002 session/CSRF/secure-storage/rotation-reuse/AAL2 tests pass, reads p95 ≤400ms and mutations p95 ≤800ms excluding adapter, patient-home LCP p95 ≤3.0s and input response p95 ≤200ms on the canonical profile, outbox lag/dedup/redaction metrics pass, and production provider/deletion automation stay absent
- [ ] T031 [FR-AUTH-007, FR-AUTH-008, FR-ADMIN-002, FR-NOTIF-001, FR-NOTIF-002, NFR-PRIV-003, NFR-API-001, NFR-API-002, NFR-DATA-001, NFR-I18N-001, NFR-A11Y-001, NFR-OBS-001, NFR-QUALITY-001] Update package scripts, API/data/UI/traceability docs, operations availability, breach/DSR/delivery runbooks, and evidence manifests without closing any OPEN item or changing active operations — `package.json`, `docs/architecture/SHIFAA-API-Catalog.md`, `docs/architecture/SHIFAA-Data-RLS.md`, `docs/design/SHIFAA-UI-Contract.md`, `docs/traceability/SHIFAA-Traceability-Matrix.md`, `infra/runbooks/privacy-dsr.md`, `infra/runbooks/notification-delivery.md`, `infra/runbooks/privacy-breach-tabletop.md`
  - Depends on: `T030`
  - Acceptance evidence: contract/architecture/docs drift checks pass and every target requirement maps bidirectionally to code, tests, Issue, live/security/performance/tabletop evidence while all named OPEN gates remain open
- [ ] T032 [FR-AUTH-007, FR-AUTH-008, FR-ADMIN-002, FR-NOTIF-001, FR-NOTIF-002, NFR-I18N-001, NFR-A11Y-001, NFR-QUALITY-001] Drive and visually inspect live Arabic RTL and English LTR patient/admin journeys against running API/worker at compact/tablet/desktop, keyboard-only, 200%/reflow, high contrast, reduced motion, offline, loading, empty, permission, stale/conflict, export-ready/expired, failure, and success states — `specs/005-privacy-dsr-notifications/evidence/live-qa.md`, `specs/005-privacy-dsr-notifications/evidence/live/`
  - Depends on: `T031`
  - Acceptance evidence: every screenshot exists and is inspected, records commit/seed/locale/viewport/state, and browser/API/RLS evidence covers every browser-applicable AC-01 through AC-19 without claiming formal design approval
- [ ] T033 [FR-AUTH-007, FR-AUTH-008, FR-ADMIN-002, FR-NOTIF-001, FR-NOTIF-002, NFR-QUALITY-001] Run `speckit-converge`, append and implement every genuine remaining task, then run final SpecKit analysis and clean-code/test/docs/web/React performance reviews and fix every actionable critical/high mismatch — `specs/005-privacy-dsr-notifications/evidence/final-analysis.md`
  - Depends on: `T032`
  - Acceptance evidence: convergence finds no unimplemented behavior, final analysis reports zero actionable mismatch, guard reviews have no unresolved critical/high finding, and checked tasks/Issues cite exact evidence at the pinned commit
- [ ] T034 [FR-AUTH-007, FR-AUTH-008, FR-ADMIN-002, FR-NOTIF-001, FR-NOTIF-002, NFR-SEC-001, NFR-SEC-003, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006, NFR-I18N-001, NFR-A11Y-001, NFR-OBS-001, NFR-PERF-001, NFR-PERF-002, NFR-QUALITY-001] Run the fresh frozen install and one clean synthetic-database full verification, restore only the proven pnpm audit normalization side effect, verify evidence/task truth and clean intended diff, and prepare the ready PR — `specs/005-privacy-dsr-notifications/evidence/verification.md`
  - Depends on: `T033`
  - Acceptance evidence: `pnpm install --frozen-lockfile; docker compose down -v; pnpm verify` exits 0, all feature/security/evidence checks pass, every checked task is proven, only intended 005 changes remain, and the ready feature PR waits for all six required checks before stopping for squash merge

## Dependencies and independent checkpoints

```text
T001 → T002/T003/T004
T002 + T003 → T005 → T006/T007 → T008/T009
T002 + T003 → T010 → T011/T012 → T013
T009 + T010 + T012 → T014 → T015 → T016 → T017
T010 + T012 + T014 → T018 → T019 → T020 → T021
T004 + T013 + T017 → T022 → T023 → T024
T004 + T013 + T017 → T025 → T026
T004 + T013 + T017 + T020 → T027 → T028
T024 + T026 + T028 → T029 → T030 → T031 → T032 → T033 → T034
```

- US1 checkpoint T024 independently proves subject/guardian DSR and private bounded export.
- US2 checkpoint T026 independently proves assigned purpose-limited DPO review and no general admin power.
- US3 checkpoint T028 independently proves bilingual template governance and duplicate-safe local delivery operations.
- No task implements 006/SOS, unrelated domain triggers, real SMS, guessed retention, or production deletion/pseudonymization.
