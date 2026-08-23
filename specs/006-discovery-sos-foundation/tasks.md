# Tasks: Discovery and SOS Foundation

> **Feature:** `006-discovery-sos-foundation` · **Plan status:** `PLAN_APPROVED — seeded-synthetic engineering`
> A completed checkbox requires the exact evidence below. Formal production, legal, vendor, emergency-safety Product review, design, UAT, team, and reproducibility gates remain open; clinical dual governance is N/A because 006 adds no clinical rule/content.

## Phase 1 — Gates, provenance, fixtures, and frozen contracts

- [x] T001 [FR-DISC-001, FR-HOSP-007, FR-SOS-001, FR-SOS-002, FR-SOS-003, FR-SOS-004, FR-FAM-006, NFR-PRIV-001, NFR-PRIV-002, NFR-PRIV-004, NFR-QUALITY-001] Verify scope eligibility, engineering approvals, staged requirement coverage, and every applicable OPEN gate without authorizing production data/integrations or 007 — `specs/006-discovery-sos-foundation/checklists/requirements.md`
  - Depends on: `none`
  - Acceptance evidence: `the checklist is complete, each OPEN item retains its canonical blocker, FR-DISC-001 is explicitly staged, and no 001-005 or 007 scope is changed`
- [x] T002 [P] [FR-DISC-001, FR-SOS-001, NFR-SEC-002, NFR-QUALITY-001] Pin and review the vector/geography-only PostGIS local/CI container derivative, provenance, platform manifest, extension behavior, vulnerability/SBOM evidence, and volume compatibility without claiming OPEN-TECH-001 closure — `infra/db/Dockerfile.postgis`, `compose.yml`, `specs/006-discovery-sos-foundation/evidence/security/postgis-runtime.md`
  - Depends on: `T001`
  - Acceptance evidence: `upstream inspect reports OCI index sha256:fae81f3e8da88b8e684c58c8a8616aadda72e6fc1affcb050b490891ecb3db1c; the clean-layer derivative excludes unused raster/GDAL and gosu, Docker Scout reports 0 HIGH/CRITICAL, vector geography/GiST initializes, and PGDATA remains compatible`
- [x] T003 [P] [FR-DISC-001, FR-HOSP-007, FR-SOS-001, FR-SOS-002, FR-SOS-003, FR-SOS-004, FR-FAM-006, NFR-SEC-001, NFR-SEC-005, NFR-DATA-002] Add deterministic facility/license/geodata/capacity, actor/permission/AAL/purpose, incident/state, share/token, contact/precision, replay/race, unavailable-field, and redaction fixtures — `packages/test-kit/src/discovery-sos.ts`
  - Depends on: `T001`
  - Acceptance evidence: `fixture tests enumerate AC-01 through AC-28 with synthetic UUIDs, WGS84 boundaries, fixed clocks/randomness, and no real person/location/phone/clinical value`
- [x] T004 [P] [FR-DISC-001, FR-HOSP-007, FR-SOS-001, FR-SOS-002, FR-SOS-003, FR-SOS-004, NFR-API-001, NFR-API-002, NFR-QUALITY-001] Freeze and validate exactly ten OpenAPI 3.1.1 operations, strict schemas, examples, headers, security, and RFC 9457 problems with no catalog drift — `specs/006-discovery-sos-foundation/contracts/openapi.yaml`
  - Depends on: `T001`
  - Acceptance evidence: `YAML parses, operationId count and uniqueness equal 10, catalog method/path/FR flags match, unknown fields fail, and no capacity-write/doctor/stock/arrival/ambulance operation exists`
- [x] T005 [P] [FR-DISC-001, FR-SOS-001, FR-SOS-002, FR-SOS-003, FR-SOS-004, FR-FAM-006, NFR-I18N-001, NFR-A11Y-001] Add Arabic-first and English-parity discovery, freshness, SOS, call-123, pre-arrival, share, contact-delivery, permission, offline, stale, failure, and success copy — `packages/i18n/src/catalogs.ts`
  - Depends on: `T001`
  - Acceptance evidence: `catalog tests prove exact key/placeholder parity, RTL-safe wording, zero untranslated key, and no bed-reservation, ambulance-dispatch, unavailable-field-is-safe, or production-provider claim`

## Phase 2 — PostGIS, schema, RLS, and migration foundation

- [x] T006 [FR-DISC-001, FR-HOSP-007, FR-SOS-001, FR-SOS-002, FR-SOS-003, FR-SOS-004, NFR-SEC-002, NFR-DATA-001, NFR-DATA-002, NFR-PRIV-004] Add the expand migration for PostGIS, verified facility geography, canonical patient blood group, aggregate capacity, SOS incidents, one-use share links, exact states/checks/indexes, minimum outbox/template seeds, feature flags, and synthetic projections only — `supabase/migrations/20260820000600_discovery_sos_foundation.sql`
  - Depends on: `T002`, `T003`, `T004`
  - Acceptance evidence: `fresh and upgrade migrations succeed; patient blood_group plus SRID/range/state/time/FK/digest/expiry/access/count/source constraints match data-model.md; no allergy/medicine/condition/note shadow clinical, capacity-writer, patient/ward/bed capacity, or guessed deletion object exists`
- [x] T007 [FR-SOS-001, FR-SOS-002, FR-SOS-003, FR-SOS-004, FR-FAM-006, NFR-SEC-001, NFR-SEC-003, NFR-SEC-004, NFR-SEC-006] Add least grants, fixed-search-path projection/authorization/state helpers, forced RLS, current relationship/membership/purpose/AAL checks, and append-only/minimum audit/outbox boundaries — `supabase/migrations/20260820000600_discovery_sos_foundation.sql`
  - Depends on: `T006`
  - Acceptance evidence: `every new table has ENABLE and FORCE RLS, shifaa_api remains non-owner/non-BYPASSRLS, PUBLIC/anon/authenticated/service-style direct access is absent, and helper execute grants are exact`
- [x] T008 [FR-DISC-001, FR-HOSP-007, FR-SOS-001, FR-SOS-002, FR-SOS-003, NFR-DATA-001, NFR-DATA-002, NFR-SEC-005] Add PostGIS/schema/state/transition/freshness/token/idempotency/concurrency/index/restore SQL tests — `infra/db/tests/discovery-sos-schema.sql`
  - Depends on: `T007`
  - Acceptance evidence: `pnpm db:test proves valid/invalid shapes, exact freshness boundary, one active incident, terminal transitions, <=30-minute one-use links, stable lock outcomes, GiST presence, FK indexes, and no plaintext token column`
- [x] T009 [FR-SOS-001, FR-SOS-002, FR-SOS-003, FR-SOS-004, FR-FAM-006, NFR-SEC-001, NFR-SEC-003, NFR-SEC-004, NFR-SEC-006] Add the complete forced-RLS actor/resource/action/facility/patient/permission/purpose/AAL negative matrix and forged-JWT/current-revocation tests — `infra/db/tests/discovery-sos-rls.sql`
  - Depends on: `T007`
  - Acceptance evidence: `pnpm db:rls-test executes as non-owner roles, independently removes every guard, denies cross-patient/cross-facility/direct-table access, and leaks zero prohibited field`

## Phase 3 — Pure policies, source contracts, generated client, and API transaction base

- [x] T010 [FR-DISC-001, FR-HOSP-007, FR-SOS-001, FR-SOS-002, FR-SOS-003, FR-SOS-004, FR-FAM-006, NFR-PORT-001] Implement pure eligibility, freshness, ranking, incident/share states, permission independence, share scope, unavailable-field, contact projection, and emergency-copy policies behind ports — `packages/core/src/discovery-sos/`
  - Depends on: `T003`, `T004`
  - Acceptance evidence: `core imports no HTTP, SQL, Supabase, UI, map/SMS/provider SDK and exposes only closed deterministic types/policy results`
- [x] T011 [FR-DISC-001, FR-HOSP-007, FR-SOS-001, FR-SOS-002, FR-SOS-003, FR-SOS-004, FR-FAM-006, NFR-SEC-005, NFR-QUALITY-001] Add table-driven/property tests for distance/freshness boundaries, stable ties, states, replay/races, exact permissions, scope intersection, unavailable fields, contact precision, and prohibited copy/data — `packages/core/src/discovery-sos/discovery-sos.test.ts`
  - Depends on: `T010`
  - Acceptance evidence: `tests cover every pure branch used by AC-01 through AC-24 with fixed clock/randomness and fail if unknown data is represented as clinically safe`
- [x] T012 [FR-DISC-001, FR-HOSP-007, FR-SOS-001, FR-SOS-002, FR-SOS-003, FR-SOS-004, NFR-API-001, NFR-API-002] Add TypeBox/source schemas, exact ten-operation registry, minimum projections, examples, sensitive annotations, and stable problem codes generated from the frozen contract — `packages/contracts/src/discovery-sos.ts`
  - Depends on: `T004`, `T010`
  - Acceptance evidence: `contract tests accept positive fixtures, reject unknown/prohibited fields, and compare exact operation IDs/methods/paths/requirements with feature OpenAPI and API Catalog`
- [x] T013 [FR-DISC-001, FR-HOSP-007, FR-SOS-001, FR-SOS-002, FR-SOS-003, NFR-API-001, NFR-PORT-001] Generate/export typed calls for all ten operations with cancellation, no-store handling, idempotency/version headers, token-safe public call, and no handwritten endpoint/direct Supabase path — `packages/api-client/src/discovery-sos.ts`
  - Depends on: `T012`
  - Acceptance evidence: `client tests verify exact method/path/query/header/body/response/problem mapping, abort behavior, no persistent sensitive cache, and registry parity; regeneration produces zero diff`
- [x] T014 [FR-DISC-001, FR-HOSP-007, FR-SOS-001, FR-SOS-002, FR-SOS-003, FR-SOS-004, FR-FAM-006, NFR-SEC-001, NFR-SEC-005, NFR-SEC-006, NFR-PORT-001] Implement the shared PostgreSQL repository transaction/context, PostGIS query, current authorization, canonical idempotency, audit/outbox, token digest/randomness, and feature configuration base — `services/api/src/adapters/postgres/discovery-sos-service.ts`, `services/api/src/modules/discovery-sos/`
  - Depends on: `T009`, `T010`, `T012`
  - Acceptance evidence: `real PostgreSQL integration proves stable lock order, short transactions, current database facts, atomic domain/audit/outbox/canonical-response/idempotency commit, and no owner/service-role/vendor call`

## Phase 4 — User Story 1: Verified facility and capacity discovery

**Independent outcome:** A public or authenticated user can find only active verified facilities and understand aggregate capacity freshness without retaining their search point.

- [x] T015 [US1] [FR-DISC-001, FR-HOSP-007, NFR-API-001, NFR-API-002, NFR-PERF-002, NFR-OBS-001] Implement `searchFacilities` and `getFacilityCapacity` repository/use cases/routes with GiST prefilter, stable cursor, exact public projection, manual/list fallback, request IDs, localized problems, and coordinate redaction — `services/api/src/routes/discovery-sos.ts`, `services/api/src/modules/discovery-sos/`
  - Depends on: `T013`, `T014`
  - Acceptance evidence: `API tests include/exclude every authority combination, prove distance-order/cursor/freshness behavior, expose no hidden counts/license/member/patient/ward/bed fields, and persist/log zero query coordinate`
- [x] T016 [US1] [FR-DISC-001, FR-HOSP-007, NFR-SEC-001, NFR-PERF-002, NFR-QUALITY-001] Add in-memory and real PostGIS discovery/capacity contract, authorization, boundary, query-plan, and redaction tests — `services/api/test/discovery-sos.integration.test.ts`, `services/api/test/discovery-sos-postgres.integration.test.ts`
  - Depends on: `T015`
  - Acceptance evidence: `tests run against real PostGIS, verify ST_DWithin/GiST plan on the declared dataset, exact stale boundary, no N+1, and public/forced-RLS outcomes agree`
- [x] T017 [US1] [FR-DISC-001, FR-HOSP-007, NFR-I18N-001, NFR-A11Y-001, NFR-PERF-001, NFR-AVAIL-002] Implement patient `/discover` and `/discover/map` using the generated client and shared tokens with location-denied, map-unavailable, manual/list, loading, empty, stale/unknown, offline, error, and success states — `apps/patient/app/discover/`, `apps/patient/src/discovery-sos-api.ts`
  - Depends on: `T005`, `T013`, `T016`
  - Acceptance evidence: `component/a11y tests prove AR RTL/EN LTR parity, cancellation, no persistent coordinate/cache, no offline mutation, keyboard/screen-reader/reflow/contrast/reduced-motion behavior, and list fallback without external map traffic`
- [x] T018 [US1] [FR-DISC-001, FR-HOSP-007, NFR-I18N-001, NFR-A11Y-001, NFR-PERF-002] Run the independent real-stack discovery/capacity checkpoint — `tests/e2e/discovery-sos-discovery.spec.ts`
  - Depends on: `T017`
  - Acceptance evidence: `seeded browser/API/PostGIS evidence proves AC-01 through AC-04 in both locales, includes location denied/stale/unknown states, and meets read p95 <=400ms on the declared profile`

## Phase 5 — User Story 2: Explicit SOS activation and subject lifecycle

**Independent outcome:** An authorized subject/caregiver explicitly creates and tracks one SOS, receives a truthful match or call-123 fallback, and closes it without duplicate effects.

- [x] T019 [US2] [FR-SOS-001, FR-SOS-002, FR-SOS-004, FR-FAM-006, NFR-SEC-001, NFR-SEC-003, NFR-SEC-005, NFR-SEC-006, NFR-PERF-002] Implement create/get/close SOS use cases and routes with exact patient context/permission, verified callback source, `none|all_confirmed`, synchronous match, no-match guidance, optimistic versions, and atomic audit/outbox/idempotency — `services/api/src/modules/discovery-sos/`, `services/api/src/routes/discovery-sos.ts`
  - Depends on: `T014`, `T016`
  - Acceptance evidence: `API tests prove self/current guardian/activate delegate, deny every invalid context, store search point only after activation, return one truthful match or 123 guidance, and same/changed/concurrent requests have canonical outcomes`
- [x] T020 [US2] [FR-SOS-001, FR-SOS-002, FR-SOS-004, NFR-SEC-001, NFR-SEC-005, NFR-OBS-001, NFR-QUALITY-001] Add real PostgreSQL SOS activation/get/close integration, race, audit/outbox/idempotency, redaction, rate/fail-closed, and no-guarantee tests — `services/api/test/discovery-sos-postgres.integration.test.ts`
  - Depends on: `T019`
  - Acceptance evidence: `AC-05 through AC-10 and AC-13 pass; one concurrent winner exists; no coordinate/phone/callback/clinical value leaks; absent production config cannot qualify a match`
- [x] T021 [US2] [FR-SOS-001, FR-SOS-002, FR-SOS-004, NFR-I18N-001, NFR-A11Y-001, NFR-PERF-001, NFR-AVAIL-002] Implement patient `/sos` and `/sos/:id` with fixed emergency action, explicit confirmation/context/reason/contact/callback, locating, matched/unmatched/accepted/closed, contact delivery, offline/stale/error/success, and call-123 states — `apps/patient/app/sos/`
  - Depends on: `T005`, `T013`, `T020`
  - Acceptance evidence: `component/a11y tests prove zero decorative motion, stable primary action, 48px target, AR/EN accessible state parity, no offline queue, and no bed-reserved/ambulance-dispatched wording`
- [x] T022 [US2] [FR-SOS-001, FR-SOS-002, FR-SOS-004, NFR-SEC-001, NFR-SEC-005, NFR-I18N-001, NFR-A11Y-001, NFR-PERF-002] Run the independent real-stack SOS subject/replay/race/no-capacity checkpoint — `tests/e2e/discovery-sos-subject.spec.ts`
  - Depends on: `T021`
  - Acceptance evidence: `AC-05 through AC-10 plus subject portions of AC-13 and AC-25 pass in Arabic and English; SOS match p95 <=2s; zero dispatch/reservation claim`

## Phase 6 — User Story 3: Hospital pre-arrival acceptance

**Independent outcome:** Only the currently authorized matched hospital sees its minimum pre-arrival and can accept it once without reserving a bed.

- [x] T023 [US3] [FR-SOS-002, NFR-SEC-001, NFR-SEC-003, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006, NFR-API-001, NFR-API-002] Implement `listSosPrearrivals` and `acceptSosPrearrival` with exact facility membership/purpose/AAL2, minimum projection, current capacity recheck, cursor/version/idempotency, and one-winner transition — `services/api/src/modules/discovery-sos/`, `services/api/src/routes/discovery-sos.ts`
  - Depends on: `T019`
  - Acceptance evidence: `matched HSP sees/accepts only its row; cross-facility/stale membership/missing purpose/AAL/stale capacity/version/concurrent attempts deny or conflict without partial effect`
- [x] T024 [US3] [FR-SOS-002, FR-HOSP-007, NFR-SEC-001, NFR-SEC-004, NFR-SEC-005, NFR-QUALITY-001] Add real PostgreSQL hospital worklist/acceptance authorization, freshness, replay, accept/close race, minimum-field, and copy contract tests — `services/api/test/discovery-sos-postgres.integration.test.ts`
  - Depends on: `T023`
  - Acceptance evidence: `AC-11 through AC-14 and hospital AC-26 vectors pass with one winner, no clinical/contact/bed details, and no reservation/dispatch wording`
- [x] T025 [US3] [FR-SOS-002, FR-HOSP-007, NFR-I18N-001, NFR-A11Y-001, NFR-AVAIL-002] Implement hospital read-only `/capacity` and `/sos-prearrivals` with facility/AAL/purpose context, aggregate fresh/stale/unknown, empty/matched/accepted/conflict/offline/error/success states and accessible explicit acceptance — `apps/hospital/src/app/capacity/`, `apps/hospital/src/app/sos-prearrivals/`
  - Depends on: `T005`, `T013`, `T024`
  - Acceptance evidence: `hospital tests prove AR RTL/EN LTR aggregate capacity and minimum rows, keyboard-first accept dialog, visible freshness/facility context, stacked compact layout, no patient/ward/bed detail, no offline submit, and no bed-reservation language`
- [x] T026 [US3] [FR-SOS-002, FR-HOSP-007, NFR-SEC-001, NFR-SEC-004, NFR-I18N-001, NFR-A11Y-001] Run the independent matched/cross-facility hospital pre-arrival checkpoint — `tests/e2e/discovery-sos-prearrival.spec.ts`
  - Depends on: `T025`
  - Acceptance evidence: `AC-03, AC-04, and AC-11 through AC-14 pass against running API/PostGIS in both locales, every guard permutation denies safely, and no later arrival/triage/bed state is created`

## Phase 7 — User Story 4: One-use emergency share

**Independent outcome:** An independently authorized actor creates/revokes a bounded share, and a public holder consumes exactly one minimum available projection without token leakage.

- [x] T027 [US4] [FR-SOS-003, NFR-PRIV-001, NFR-PRIV-002, NFR-PRIV-004, NFR-SEC-001, NFR-SEC-002, NFR-SEC-005, NFR-SEC-006] Implement create/revoke/view share transactions with independent `sos.share`, >=256-bit randomness, digest-only storage, encrypted idempotency response, <=30-minute one-use state, fixed scope intersection, unavailable fields, uniform 410, and safe audit — `services/api/src/modules/discovery-sos/`, `services/api/src/adapters/postgres/discovery-sos-service.ts`
  - Depends on: `T014`, `T019`
  - Acceptance evidence: `transaction tests prove first-use/replay/expiry/revoke/unknown token and view/revoke races; exact codes are blood_group, confirmed_allergies, active_dispensed_medicines, chronic_conditions, emergency_notes; only synthetic canonical blood_group is available and the other four are unavailable; zero shadow clinical data and no raw/digest token outside allowed encrypted storage`
- [x] T028 [US4] [FR-SOS-003, NFR-API-001, NFR-SEC-001, NFR-SEC-005, NFR-SEC-006, NFR-OBS-001, NFR-QUALITY-001] Register and test share routes, private/no-store/no-cache/no-referrer headers, path redaction, rate abuse, unknown-field/scope expansion, foreign actor, and token telemetry/cache/history negatives — `services/api/src/routes/discovery-sos.ts`, `services/api/test/discovery-sos-share.integration.test.ts`
  - Depends on: `T027`
  - Acceptance evidence: `AC-15 through AC-20 pass; route logs replace token; response keys equal selected available fields plus unavailable_fields; indexers/referrers/caches receive no bearer material`
- [x] T029 [US4] [FR-SOS-003, NFR-I18N-001, NFR-A11Y-001, NFR-AVAIL-002] Implement owner `/sos/:id/share` and public `/sos/share` fragment-scrubbed viewer with field choice, shown-once, copied, unavailable, used/revoked/expired/error states and no persistent cache — `apps/patient/app/sos/[id]/share.tsx`, `apps/patient/app/sos/share.tsx`
  - Depends on: `T005`, `T013`, `T028`
  - Acceptance evidence: `UI tests prove token fragment is scrubbed before API use, absent from history/storage/render after use, exact AR/EN risk/unavailable copy, keyboard/screen-reader/reflow/zero-motion behavior, and no offline queue`
- [x] T030 [US4] [FR-SOS-003, NFR-SEC-001, NFR-SEC-002, NFR-SEC-005, NFR-SEC-006, NFR-I18N-001, NFR-A11Y-001] Run the independent real-stack owner/public share secrecy/scope/race checkpoint — `tests/e2e/discovery-sos-share.spec.ts`
  - Depends on: `T029`
  - Acceptance evidence: `AC-15 through AC-20 and share AC-25/AC-26 vectors pass in both locales; database/log/audit/outbox/browser scans find zero plaintext token or extra clinical field`

## Phase 8 — User Story 5: Minimum Emergency Contact delivery

**Independent outcome:** An active SOS with `all_confirmed` produces at most one governed local-synthetic minimum notice per currently confirmed contact; every other event/contact produces zero delivery.

- [x] T031 [US5] [FR-SOS-004, FR-FAM-006, NFR-PRIV-001, NFR-PRIV-002, NFR-PRIV-004, NFR-OBS-001, NFR-PORT-001] Connect committed incidents to the existing `sos.emergency_contact.requested` policy, fan out/recheck current consent and precision, resolve verified callback, render the paired local template, and isolate SOS vs privacy worker claims — `services/worker/src/discovery-sos.ts`, `services/worker/src/postgres-discovery-sos-processor.ts`
  - Depends on: `T019`, `T020`
  - Acceptance evidence: `worker processes only active all_confirmed incidents/current confirmed contacts, preserves none/coarse/exact precision, exact fields, recipient type isolation, ordered outbox, and synthetic-only provider mode`
- [x] T032 [US5] [FR-SOS-004, FR-FAM-006, NFR-SEC-001, NFR-SEC-005, NFR-OBS-001, NFR-QUALITY-001, NFR-PORT-001] Add worker/integration tests for `none`, terminal contacts, close-before-claim, prohibited source events/fields, precision, callback source, template/inventory/provider gates, retry/DLQ/order/crash/dedup/replay, and redaction — `services/worker/src/discovery-sos.test.ts`, `tests/e2e/discovery-sos-contact.spec.ts`
  - Depends on: `T031`
  - Acceptance evidence: `AC-21 through AC-24 pass; one visible local delivery per eligible contact; every lab/interaction/medication/admission/referral/routine or invalid contact vector delivers zero; incident truth never changes`
- [x] T033 [US5] [FR-SOS-004, FR-FAM-006, NFR-I18N-001, NFR-A11Y-001, NFR-AVAIL-002] Integrate subject contact-delivery pending/delayed/delivered/failed visibility and run the independent bilingual contact privacy checkpoint — `apps/patient/app/sos/[id].tsx`, `tests/e2e/discovery-sos-contact.spec.ts`
  - Depends on: `T021`, `T032`
  - Acceptance evidence: `running API/worker UI shows truthful status/next step in AR/EN, never claims provider contact on failure, keeps call-123 guidance, and passes keyboard/live-region/offline/reconnect behavior`

## Final phase — Security, performance, documentation, live evidence, and PR readiness

- [x] T034 [FR-DISC-001, FR-HOSP-007, FR-SOS-001, FR-SOS-002, FR-SOS-003, FR-SOS-004, FR-FAM-006, NFR-SEC-001, NFR-SEC-002, NFR-SEC-003, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006, NFR-SEC-007, NFR-PRIV-001, NFR-PRIV-002, NFR-PRIV-004, NFR-PERF-001, NFR-PERF-002, NFR-OBS-001, NFR-PORT-001, NFR-QUALITY-001] Run PostGIS/RLS/API abuse/token/contact/redaction/SAST/secret/dependency/SBOM/architecture/portability and declared-dataset performance gates; remediate every reportable HIGH/CRITICAL finding — `specs/006-discovery-sos-foundation/evidence/security/`, `specs/006-discovery-sos-foundation/evidence/performance.json`
  - Depends on: `T018`, `T022`, `T026`, `T030`, `T033`
  - Acceptance evidence: `security report has zero unresolved reportable HIGH/CRITICAL; GiST plan is recorded; reads p95 <=400ms, mutations p95 <=800ms, SOS match p95 <=2s, patient-home LCP p95 <=3.0s/input p95 <=200ms; prohibited sentinels are absent; production adapters remain disabled`
- [x] T035 [FR-DISC-001, FR-HOSP-007, FR-SOS-001, FR-SOS-002, FR-SOS-003, FR-SOS-004, FR-FAM-006, NFR-API-001, NFR-API-002, NFR-DATA-001, NFR-DATA-002, NFR-AVAIL-002, NFR-OBS-001, NFR-QUALITY-001] Update verification scripts, API/Data/UI realization notes, traceability staged coverage, operations availability, PostGIS/SOS runbook, restore/roll-forward/kill-switch guidance, and evidence manifests without closing an OPEN gate or changing the active inventory — `package.json`, `tools/verify-contracts.mjs`, `docs/architecture/SHIFAA-API-Catalog.md`, `docs/architecture/SHIFAA-Data-RLS.md`, `docs/design/SHIFAA-UI-Contract.md`, `docs/traceability/SHIFAA-Traceability-Matrix.md`, `infra/runbooks/discovery-sos.md`
  - Depends on: `T034`
  - Acceptance evidence: `contract/architecture/docs drift checks pass; root verify executes 006 real PostGIS/API/worker/E2E/RLS gates; every target ID maps bidirectionally to code/tests/Issue/evidence; FR-DISC-001 remains staged and all OPEN gates remain open`
- [x] T036 [FR-DISC-001, FR-HOSP-007, FR-SOS-001, FR-SOS-002, FR-SOS-003, FR-SOS-004, FR-FAM-006, NFR-I18N-001, NFR-A11Y-001, NFR-AVAIL-002, NFR-QUALITY-001] Drive and visually inspect live Arabic RTL and English LTR discovery/SOS/hospital-capacity/pre-arrival/share/contact journeys against running API/PostGIS/worker at all contracted viewports and interaction modes — `specs/006-discovery-sos-foundation/evidence/live-qa.md`, `specs/006-discovery-sos-foundation/evidence/live/`
  - Depends on: `T035`
  - Acceptance evidence: `screenshots exist and are visually inspected with commit/seed/config/locale/viewport/state; hospital /capacity fresh/stale/unknown/offline/error/success plus all other journeys pass keyboard, screen reader, 200%/400% reflow, high contrast, zero/reduced motion without unresolved critical/high accessibility finding, WCAG blocker, pixel-identity claim, or emergency guarantee`
- [x] T037 [FR-DISC-001, FR-HOSP-007, FR-SOS-001, FR-SOS-002, FR-SOS-003, FR-SOS-004, FR-FAM-006, NFR-SEC-007, NFR-QUALITY-001] Run post-implementation SpecKit analyze plus clean-code, test, docs, UI, React/Expo networking, Supabase/RLS, and security reviews; fix every actionable critical/high mismatch and record final coverage — `specs/006-discovery-sos-foundation/evidence/final-analysis.md`
  - Depends on: `T036`
  - Acceptance evidence: `post-implementation analysis reports zero actionable critical/high mismatch, T001 through T036 have exact evidence and T037 records its own report, guard reviews have no unresolved critical/high finding, and no 001-005 or 007 file/scope was reopened`
- [ ] T038 [FR-DISC-001, FR-HOSP-007, FR-SOS-001, FR-SOS-002, FR-SOS-003, FR-SOS-004, FR-FAM-006, NFR-SEC-001, NFR-SEC-002, NFR-SEC-003, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006, NFR-SEC-007, NFR-PRIV-001, NFR-PRIV-002, NFR-PRIV-004, NFR-I18N-001, NFR-A11Y-001, NFR-PERF-001, NFR-PERF-002, NFR-AVAIL-002, NFR-DATA-001, NFR-DATA-002, NFR-API-001, NFR-API-002, NFR-OBS-001, NFR-QUALITY-001, NFR-PORT-001] Run a frozen install and one clean repository-scoped synthetic database verification, validate evidence/task/Issue truth, push only the feature branch, open the linked ready PR, and wait for all required up-to-date checks — `specs/006-discovery-sos-foundation/evidence/verification.md`
  - Depends on: `T037`
  - Acceptance evidence: `corepack pnpm install --frozen-lockfile; docker compose down -v; corepack pnpm verify exits 0; git diff --check passes; all 38 tasks and task Issues match exact evidence; only intended 006 changes remain; PR checks pass; squash merge uses Yousef Osama's explicit advance authorization from the 2026-08-23 execution request only after every stated merge gate passes`

## Dependencies and independent checkpoints

```text
T001 -> T002/T003/T004/T005
T002 + T003 + T004 -> T006 -> T007 -> T008/T009
T003 + T004 -> T010 -> T011/T012 -> T013
T009 + T010 + T012 -> T014
T013 + T014 -> T015 -> T016 -> T017 -> T018
T014 + T016 -> T019 -> T020 -> T021 -> T022
T019 -> T023 -> T024 -> T025 -> T026
T014 + T019 -> T027 -> T028 -> T029 -> T030
T019 + T020 -> T031 -> T032; T021 + T032 -> T033
T018 + T022 + T026 + T030 + T033 -> T034 -> T035 -> T036 -> T037 -> T038
```

- US1 checkpoint T018 independently proves verified facility/capacity discovery.
- US2 checkpoint T022 independently proves explicit subject/caregiver SOS and no-capacity guidance.
- US3 checkpoint T026 independently proves matched-hospital minimum pre-arrival acceptance.
- US4 checkpoint T030 independently proves one-use minimum ER share and token secrecy.
- US5 checkpoint T033 independently proves current-consent Emergency Contact privacy and delivery status.
- No task implements 007, doctor search, pharmacy stock, reviews, arrival/triage/beds, ambulance dispatch, a production vendor, or a shadow clinical profile.
