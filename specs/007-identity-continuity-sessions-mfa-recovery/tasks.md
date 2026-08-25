# Tasks: Identity Continuity, Sessions, MFA, and Recovery

> **Feature:** `007-identity-continuity-sessions-mfa-recovery` · **Plan status:** `PLAN_APPROVED` · **Task baseline:** `TASKS_APPROVED`
> Every task uses the required three-line handoff block. Team members execute their assigned lanes only
> after Yousef authorizes implementation; no unchecked task is implementation authorization.

## Phase 1 — Gates, pinned Auth evidence, fixtures, and frozen contracts

- [x] T001 [FR-AUTH-002, FR-AUTH-005, FR-FAM-003, FR-ADMIN-002, NFR-QUALITY-001] Revalidate v2.1.1/v2.1.2 closures, exact scope eligibility, implementation-only team activation, and preserved production/release blockers — `specs/007-identity-continuity-sessions-mfa-recovery/checklists/requirements.md`
  - Depends on: `none`
  - Acceptance evidence: `the checklist names all 4 FRs, all 23 NFRs, all 8 operations, closed TEAM/SEC/LEGAL-006 evidence, unchanged production gates, and explicit no-implementation-without-Yousef authorization`
- [x] T002 [P] [FR-AUTH-002, FR-AUTH-005, NFR-SEC-003, NFR-SEC-004, NFR-PORT-001, NFR-QUALITY-001] Add a pinned Supabase Auth compatibility probe for required session, refresh, MFA, sign-out, recovery, AAL/AMR, and public/user-context primitives without direct Auth mutation or online service role — `tools/verify-identity-continuity-auth.mjs`, `specs/007-identity-continuity-sessions-mfa-recovery/evidence/security/supabase-auth-compatibility.md`
  - Depends on: `T001`
  - Acceptance evidence: `corepack pnpm exec supabase start plus node tools/verify-identity-continuity-auth.mjs exits 0 against CLI 2.113.0 and records exact supported primitives/schema; any required primitive mismatch stops implementation instead of adding an endpoint or bypass`
- [x] T003 [P] [FR-AUTH-002, FR-AUTH-005, FR-FAM-003, FR-ADMIN-002, NFR-SEC-001, NFR-SEC-003, NFR-SEC-004, NFR-SEC-005, NFR-DATA-002, NFR-QUALITY-001] Add deterministic session/factor/recovery/transition actors, clocks, 299/300/301-second AMR, 10-second reuse, expiry, race, replay, legal-vector, and prohibited-sentinel fixtures — `packages/test-kit/src/identity-continuity.ts`
  - Depends on: `T001`
  - Acceptance evidence: `fixture tests enumerate AC-01..32 and TV-FAM-CAPACITY-TRANSITION-001..020 with synthetic UUIDs/Cairo dates, injected clocks/randomness, and no real handle, identity, factor, location, or clinical value`
- [x] T004 [P] [FR-AUTH-002, FR-AUTH-005, FR-FAM-003, FR-ADMIN-002, NFR-I18N-001, NFR-A11Y-001] Add Arabic-first and English-parity session, MFA, recovery, transition, purpose/reason, offline, conflict, restriction, and failure copy — `packages/i18n/src/catalogs.ts`
  - Depends on: `T001`
  - Acceptance evidence: `catalog parity tests pass with exact placeholders, bidi-safe codes/times, no account oracle, no automatic-transfer/capacity conclusion, and no production-provider/passkey claim`
- [x] T005 [P] [FR-AUTH-002, FR-AUTH-005, FR-FAM-003, FR-ADMIN-002, NFR-API-001, NFR-API-002, NFR-SEC-005] Promote and validate the frozen eight-operation OpenAPI schemas, examples, headers, actor actions, security alternatives, no-store responses, and RFC 9457 problems — `specs/007-identity-continuity-sessions-mfa-recovery/contracts/openapi.yaml`, `packages/contracts/src/identity-continuity.ts`
  - Depends on: `T001`, `T003`
  - Acceptance evidence: `YAML parses; exactly 8 unique operation IDs match API Catalog method/path/flags/FRs; unknown fields fail; generic schema errors are 400, semantic failures remain 422, and no ninth/008 operation exists`
- [x] T006 [P] [FR-AUTH-002, FR-AUTH-005, NFR-SEC-002, NFR-SEC-003, NFR-SEC-004, NFR-QUALITY-001] Apply and test the exact local Auth configuration: 900-second JWT, 23h45m/45m sessions, rotation/reuse 10, TOTP enabled, phone/passkey/WebAuthn disabled — `supabase/config.toml`, `tools/verify-identity-continuity-auth.mjs`
  - Depends on: `T002`
  - Acceptance evidence: `config parser assertions report exact approved values; passkey/phone attempts remain unsupported; secret placeholders remain environment-only; production feature enablement stays false`

## Phase 2 — Continuity workflow schema, RLS, and migration foundation

- [ ] T007 [FR-AUTH-005, FR-FAM-003, FR-ADMIN-002, NFR-SEC-001, NFR-SEC-002, NFR-DATA-001, NFR-DATA-002, NFR-PRIV-002, NFR-PRIV-004] Generate and implement the expand migration for `identity.continuity_cases`, exact shapes/states/checks/unconditional FK and partial indexes, processing inventory, event types/index scope, paired local templates, and decoy-only transient classification — `supabase/migrations/20260825000700_identity_continuity_sessions_mfa_recovery.sql`
  - Depends on: `T002`, `T003`, `T005`, `T006`
  - Acceptance evidence: `fresh and upgrade migrations match data-model.md; only one workflow table is added; no auth-schema object/mutation, credential/factor/session-validity shadow, person/patient/self-record backfill, legal-status table, hard delete of subject evidence, or statutory duration exists`
- [ ] T008 [FR-AUTH-005, FR-FAM-003, FR-ADMIN-002, NFR-SEC-001, NFR-SEC-003, NFR-SEC-004, NFR-SEC-006] Add the boolean native-session compatibility helper, fixed-search-path transition/authorization functions, least grants, ENABLE/FORCE RLS, exact subject/reviewer/preauth/restricted contexts, and worker event select/lease allowlist — `supabase/migrations/20260825000700_identity_continuity_sessions_mfa_recovery.sql`
  - Depends on: `T007`
  - Acceptance evidence: `migration introspects pinned Auth schema, helper returns boolean only, PUBLIC/anon/authenticated receive no execute/table access, shifaa_api remains non-owner/non-BYPASSRLS, worker can claim exactly old allowlist plus 4 new events, and unrelated events deny`
- [ ] T009 [P] [FR-AUTH-005, FR-FAM-003, NFR-DATA-001, NFR-DATA-002, NFR-PRIV-004, NFR-QUALITY-001] Add schema/shape/state/expiry/Cairo-date/uniqueness/FK-index/lock-order/decoy-purge/outbox-index migration tests — `infra/db/tests/identity-continuity-schema.sql`
  - Depends on: `T008`
  - Acceptance evidence: `pnpm db:test proves every valid/invalid case shape, one live case constraint, 15-minute/24-hour decoy boundary, proof expiry, one transition winner, all FK indexes, prior event coexistence, and no subject-linked purge`
- [ ] T010 [P] [FR-AUTH-005, FR-FAM-003, FR-ADMIN-002, NFR-SEC-001, NFR-SEC-003, NFR-SEC-004, NFR-SEC-006] Add the complete forced-RLS actor/resource/action/person/patient/relationship/assignment/AAL/purpose/restriction/native-session/service-role/search-path negative matrix — `infra/db/tests/identity-continuity-rls.sql`
  - Depends on: `T008`
  - Acceptance evidence: `pnpm db:rls-test executes non-owner roles and independently removes every guard; direct/foreign/unassigned/self-review/prior-guardian/AAL1/wrong-purpose/invalid-session/worker-event paths deny with zero leaked case or Auth row`
- [ ] T011 [FR-AUTH-002, FR-AUTH-005, FR-FAM-003, NFR-SEC-001, NFR-SEC-003, NFR-QUALITY-001] Add dual-stack migration and real native Auth/PostgreSQL compatibility tests for Supabase port 54322 and Compose port 5432 — `tools/run-identity-continuity-supabase-test.mjs`, `services/api/test/identity-continuity-postgres.integration.test.ts`
  - Depends on: `T009`, `T010`
  - Acceptance evidence: `supabase db reset --local and standalone db:migrate/db:test/db:rls-test both exit 0; native session helper follows real logout/session rows; neither stack is falsely treated as migrated by the other`

## Phase 3 — Portable policy, Auth ports, generated contracts, and API transaction base

- [ ] T012 [FR-AUTH-002, FR-AUTH-005, FR-FAM-003, FR-ADMIN-002, NFR-SEC-003, NFR-SEC-004, NFR-PORT-001] Implement pure session freshness, MFA enrollment/removal, recovery, Cairo eligibility, transition, restriction, and decision policies with closed states/reasons — `packages/core/src/identity-continuity/`
  - Depends on: `T003`, `T005`
  - Acceptance evidence: `core exports deterministic policy results only and imports no HTTP, SQL, Supabase, UI, clock global, notification, identity vendor, or framework module`
- [ ] T013 [P] [FR-AUTH-002, FR-AUTH-005, FR-FAM-003, FR-ADMIN-002, NFR-SEC-003, NFR-SEC-004, NFR-SEC-005, NFR-QUALITY-001] Add table/property tests for every pure branch, boundary, unsupported factor, optional/mandatory last factor, recovery combination, restriction allowlist, and legal vector — `packages/core/src/identity-continuity/identity-continuity.test.ts`
  - Depends on: `T012`
  - Acceptance evidence: `tests cover AC-01..30 and legal vectors 001..020 with fake clocks; unknown state/factor/relationship/action/purpose fails closed and no sleep exists`
- [ ] T014 [FR-AUTH-002, FR-AUTH-005, FR-ADMIN-002, NFR-SEC-002, NFR-SEC-003, NFR-SEC-004, NFR-PORT-001] Extend JWT verification and typed Auth ports for UUID `session_id`, closed AAL, timestamped AMR, current-session check, refresh/logout, factor list/enroll/challenge/verify/unenroll, and public/user-context recovery only — `packages/auth/src/index.ts`, `packages/auth/src/identity-continuity.ts`
  - Depends on: `T002`, `T012`
  - Acceptance evidence: `auth tests reject missing/malformed sub/session_id/aal/amr, user_metadata authorization, stale AMR, unsupported passkeys, and any generic admin/service-role method; list projection excludes secrets`
- [ ] T015 [P] [FR-AUTH-002, FR-AUTH-005, NFR-SEC-003, NFR-SEC-004, NFR-QUALITY-001] Add pinned native Auth adapter contract tests for rotation/reuse/logout/AAL/TOTP/removal/recovery and post-removal refresh behavior — `services/api/test/identity-continuity-auth.integration.test.ts`
  - Depends on: `T006`, `T014`
  - Acceptance evidence: `real local Auth tests prove supported calls, 299/300/301 AMR handling, one verified factor effect, global/local sign-out scopes, no direct Auth SQL/write, and stop rather than bypass on unsupported re-proofing primitive`
- [ ] T016 [FR-AUTH-002, FR-AUTH-005, FR-FAM-003, FR-ADMIN-002, NFR-SEC-001, NFR-SEC-005, NFR-SEC-006, NFR-PORT-001] Implement the continuity repository, deny-only restriction lookup, staged native-command coordinator, per-route HMAC/digest rate limits, encrypted transient replay envelope, idempotency, audit, outbox, and deterministic clock ports — `services/api/src/modules/identity-continuity/`, `services/api/src/adapters/postgres/identity-continuity-service.ts`, `services/api/src/adapters/supabase-auth.ts`
  - Depends on: `T011`, `T012`, `T014`
  - Acceptance evidence: `repository tests prove native Auth and PostgreSQL partial failures only deny/resume, ordinary access never precedes revocation/terminal commit, TOTP secret replay envelope expires at 10m, refresh token never persists, and transition DB effects commit atomically`
- [ ] T017 [FR-AUTH-002, FR-AUTH-005, FR-FAM-003, FR-ADMIN-002, NFR-API-001, NFR-API-002, NFR-SEC-005] Add source schemas, exact registry, validated Fastify routes including DELETE JSON body, localized problems, generated client calls, and no-store/request/version/idempotency headers for all eight operations — `packages/contracts/src/identity-continuity.ts`, `services/api/src/routes/identity-continuity.ts`, `packages/api-client/src/identity-continuity.ts`
  - Depends on: `T005`, `T016`
  - Acceptance evidence: `contract/route/client tests match exact OpenAPI/catalog method/path/requirements, DELETE body parses with standard Fastify application/json, generated files reproduce with zero diff, and no list/step-up/freeze/008 operation is registered`
- [ ] T018 [FR-AUTH-002, FR-AUTH-005, FR-FAM-003, FR-ADMIN-002, NFR-SEC-001, NFR-SEC-005, NFR-SEC-006, NFR-API-001, NFR-API-002, NFR-QUALITY-001] Add shared API contract, authorization, schema/semantic error, same/changed/concurrent idempotency, staged failure/retry, audit/outbox, and prohibited-field integration tests — `services/api/test/identity-continuity.integration.test.ts`, `services/api/test/identity-continuity-postgres.integration.test.ts`
  - Depends on: `T015`, `T016`, `T017`
  - Acceptance evidence: `all 8 routes pass positive and every negative context; schema errors are 400, semantic failures 422, stale versions 409, one effect exists, audit/outbox contain no secret/PHI, and Auth outage fails closed`

## Phase 4 — User Story 1: Bounded session continuation and termination

**Independent outcome:** A valid foreground user rotates one session safely and can revoke the current
or every session, while expiry, replay, background activity, and Auth failure deny on the next request.

- [ ] T019 [US1] [FR-AUTH-005, FR-ADMIN-002, NFR-SEC-001, NFR-SEC-003, NFR-SEC-005, NFR-SEC-006] Implement `refreshSession` and `logout` with web cookie/CSRF/Origin/Fetch-Metadata, native body token, foreground engagement, native family semantics, current/all scopes, and current-session validation — `services/api/src/modules/identity-continuity/`, `services/api/src/routes/identity-continuity.ts`
  - Depends on: `T018`
  - Acceptance evidence: `API tests prove AC-01..06 and AC-16/17/20..22; web/native bodies are mutually exclusive, hostile reuse revokes family, logout stays available without step-up, and no token/cookie enters persistence or telemetry`
- [ ] T020 [P] [US1] [FR-AUTH-005, NFR-SEC-003, NFR-SEC-005, NFR-QUALITY-001] Add real native Auth fake-clock/replay/current/all/cross-device/session-row/outage tests — `services/api/test/identity-continuity-sessions.integration.test.ts`
  - Depends on: `T019`
  - Acceptance evidence: `exp-1/+1, 23h45m/24h, 45m/60m, foreground/46m idle, 10s benign/hostile ancestor, child-after-revoke, and every logout/reset/recovery scope pass without sleep`
- [ ] T021 [US1] [FR-AUTH-005, NFR-I18N-001, NFR-A11Y-001, NFR-AVAIL-002, NFR-PERF-001] Implement shared web/native session client behavior, memory/access-token handling, strict refresh cookie bridge, OS-secure native refresh port, foreground activity suspension, expired/degraded UI, and no offline queue — `packages/auth/src/identity-continuity.ts`, `packages/design-system/src/security/`, `apps/patient/src/identity-continuity-api.ts`
  - Depends on: `T004`, `T017`, `T019`
  - Acceptance evidence: `component tests prove hidden/background/blur/unattended refresh suspension, no browser persistent token, native secure-storage port use, reconnect from server, AR/EN focus/live-region behavior, and no queued refresh/logout mutation`
- [ ] T022 [US1] [FR-AUTH-005, FR-ADMIN-002, NFR-SEC-003, NFR-I18N-001, NFR-A11Y-001, NFR-AVAIL-002] Run the independent real-stack session continuation/revocation checkpoint — `tests/e2e/identity-continuity-sessions.spec.ts`
  - Depends on: `T020`, `T021`
  - Acceptance evidence: `AC-01..06, AC-16..18, and session AC-31 pass against local Auth/API/PostgreSQL in Arabic and English with cross-device logout, outage, offline/reconnect, keyboard/screen-reader, and zero token leakage`

## Phase 5 — User Story 2: TOTP enrollment, safe removal, and privileged step-up

**Independent outcome:** A patient can manage optional TOTP and workforce/admin users satisfy mandatory
AAL2/purpose rules without unverified factors, stale MFA, last-factor downgrade, or a new endpoint.

- [ ] T023 [US2] [FR-AUTH-002, FR-AUTH-005, FR-ADMIN-002, NFR-SEC-003, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006] Implement `beginMfaEnrollment`, `verifyMfaEnrollment`, and `removeMfaFactor` with pending quota/expiry/rate, one-time secret, fresh proof distinctions, serialized native state, last-factor rules, post-removal refresh, and notifications — `services/api/src/modules/identity-continuity/`, `services/api/src/routes/identity-continuity.ts`
  - Depends on: `T018`
  - Acceptance evidence: `AC-07..10 and AC-19..22 pass; TOTP only verifies, passkey returns factor-type-unsupported with zero factor, patient optional and mandatory accounts differ exactly, and removal immediately recomputes AAL/authorization`
- [ ] T024 [P] [US2] [FR-AUTH-002, FR-AUTH-005, FR-ADMIN-002, NFR-SEC-004, NFR-SEC-005, NFR-QUALITY-001] Add native/API tests for pending exhaustion, 10m expiry, invalid/replayed codes, encrypted same-key secret replay, changed body, 299/300/301 AMR, refresh staleness, removal races, last factors, and DELETE body parsing — `services/api/test/identity-continuity-mfa.integration.test.ts`
  - Depends on: `T023`
  - Acceptance evidence: `real Auth plus API test matrix passes with one verified/removal effect, no plaintext secret in DB/log/audit/outbox, no custom DELETE parser, and no sleep`
- [ ] T025 [US2] [FR-AUTH-002, FR-AUTH-005, NFR-I18N-001, NFR-A11Y-001, NFR-AVAIL-002, NFR-PERF-001] Implement patient `/mfa` with read-only native factor summaries, first/extra enrollment, shown-once QR/manual secret, verify, optional removal confirmation, required-last denial, expiry/rate/offline/error/success states — `apps/patient/app/mfa.tsx`, `apps/patient/src/identity-continuity-api.ts`
  - Depends on: `T004`, `T017`, `T023`
  - Acceptance evidence: `patient tests prove generated-client-only mutations, secret removed after navigation, factor list has no secret, AR RTL/EN LTR, bidi codes, focus, live regions, 200%/400%, 44x44, contrast, reduced motion, and no offline queue`
- [ ] T026 [P] [US2] [FR-AUTH-002, FR-ADMIN-002, NFR-SEC-003, NFR-SEC-004, NFR-I18N-001, NFR-A11Y-001] Integrate shared AAL1/stale-AMR/missing-purpose/reason/Auth-degraded step-up states into existing workforce/admin shells using unchanged `login`/`verifyOtp` — `packages/design-system/src/security/`, `apps/admin/`, `apps/clinic/`, `apps/pharmacy/`, `apps/hospital/`, `apps/lab/`
  - Depends on: `T004`, `T014`, `T017`
  - Acceptance evidence: `each shell test denies sensitive content/action before AAL2/purpose/reason, restores focus/intended action after existing step-up, rejects 301s AMR, and registers no new operation/route role`
- [ ] T027 [US2] [FR-AUTH-002, FR-AUTH-005, FR-ADMIN-002, NFR-SEC-004, NFR-I18N-001, NFR-A11Y-001] Run the independent TOTP and privileged-step-up checkpoint — `tests/e2e/identity-continuity-mfa.spec.ts`, `tests/e2e/identity-continuity-admin-step-up.spec.ts`
  - Depends on: `T024`, `T025`, `T026`
  - Acceptance evidence: `AC-07..10, AC-19..22, and MFA/admin AC-31 pass in both locales against local Auth/API; all workforce/admin AAL1 operations deny and no provider/passkey/SMS claim appears`

## Phase 6 — User Story 3: Non-oracular recovery without MFA downgrade

**Independent outcome:** Existing and nonexistent handles receive the same recovery response; approved
proof yields only permitted native access, and lost-factor recovery cannot expose PHI before replacement.

- [ ] T028 [US3] [FR-AUTH-005, FR-ADMIN-002, NFR-SEC-001, NFR-SEC-003, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006, NFR-PRIV-001, NFR-PRIV-002] Implement `startRecovery` and `completeRecovery` with real/decoy cases, HMAC/digest rate limits, 15m single-use challenge, factor/independent or re-proof policy, deny-only native-session binding, staged revocation/completion, and uniform case ID/token — `services/api/src/modules/identity-continuity/`, `services/api/src/routes/identity-continuity.ts`
  - Depends on: `T018`
  - Acceptance evidence: `AC-11..18 and AC-20..22 pass; real/decoy response fields are identical, unsupported total-loss primitive stops rather than uses service role, and ordinary access never precedes replacement/revocation/terminal state`
- [ ] T029 [P] [US3] [FR-AUTH-005, FR-ADMIN-002, NFR-SEC-001, NFR-SEC-003, NFR-SEC-004, NFR-SEC-005, NFR-QUALITY-001] Add real Auth/PostgreSQL recovery oracle, proof-combination, restricted-registry, expiry/replay/race/crash-resume/global-revocation, and decoy-purge tests — `services/api/test/identity-continuity-recovery.integration.test.ts`
  - Depends on: `T028`
  - Acceptance evidence: `100 existing/100 nonexistent warmed attempts have identical 202 schema and p95 delta <=50ms; exactly 4 allowlisted operations pass a restricted session; every other registered operation denies; decoys alone purge 24h after expiry`
- [ ] T030 [US3] [FR-AUTH-005, FR-ADMIN-002, NFR-SEC-006, NFR-PRIV-001, NFR-PRIV-003, NFR-OBS-001, NFR-PORT-001] Implement minimum factor/recovery notification projections and current verified-address fan-out in the existing worker with exact RLS event claims — `services/worker/src/identity-continuity.ts`, `services/worker/src/postgres-identity-continuity-processor.ts`
  - Depends on: `T008`, `T023`, `T028`
  - Acceptance evidence: `worker tests show one local-synthetic visible delivery per verified address, zero Emergency Contact/unknown/terminal-invalid delivery, bounded retry/DLQ/dedup, and no handle, token, factor ID, proof, or PHI field`
- [ ] T031 [US3] [FR-AUTH-005, NFR-I18N-001, NFR-A11Y-001, NFR-AVAIL-002, NFR-PERF-001] Implement patient `/recovery` request/accepted/proof/pending/failed/restricted-enrollment/completed/expired/rate/offline states with fragment/query secret prohibition — `apps/patient/app/recovery.tsx`, `apps/patient/src/identity-continuity-api.ts`
  - Depends on: `T004`, `T017`, `T028`
  - Acceptance evidence: `UI tests prove identical account-existence copy, no token in URL/history/storage/analytics, only replacement-factor actions under restriction, AR/EN accessible state parity, no offline queue, and safe reconnect`
- [ ] T032 [US3] [FR-AUTH-005, FR-ADMIN-002, NFR-SEC-003, NFR-SEC-004, NFR-PRIV-001, NFR-I18N-001, NFR-A11Y-001] Run the independent real-stack recovery/no-oracle/restricted-session/notification checkpoint — `tests/e2e/identity-continuity-recovery.spec.ts`
  - Depends on: `T029`, `T030`, `T031`
  - Acceptance evidence: `AC-11..18, recovery AC-20..22, and recovery AC-31 pass in Arabic/English against Auth/API/PostgreSQL/worker with all-old-session denial, one notification, keyboard/screen-reader evidence, and zero secret sentinel`

## Phase 7 — User Story 4: Reviewed dependent transition with record continuity

**Independent outcome:** An eligible authenticated existing person submits proof and an assigned human
reviewer decides one version while the same patient/clinical record survives and prior authority ends.

- [ ] T033 [US4] [FR-FAM-003, FR-ADMIN-002, NFR-SEC-001, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006, NFR-DATA-001] Implement `transitionDependent` submit/decide actions, Cairo civil-date eligibility, proof/reviewer/blocker rules, person/patient/user matching, lock/version/idempotency, guardianship revocation, audit/outbox, and same-record invariants — `packages/core/src/identity-continuity/`, `services/api/src/modules/identity-continuity/`, `services/api/src/adapters/postgres/identity-continuity-service.ts`
  - Depends on: `T018`
  - Acceptance evidence: `AC-23..30 and TV-FAM-CAPACITY-TRANSITION-001..020 pass; age 18/clock-only writes never occur, no legal outcome is inferred, and approval changes no person/patient/self/MRN/clinical link or unrelated delegation`
- [ ] T034 [P] [US4] [FR-FAM-003, FR-ADMIN-002, NFR-SEC-001, NFR-SEC-004, NFR-SEC-005, NFR-DATA-001, NFR-QUALITY-001] Add real PostgreSQL/API transition proof, assignment, separation, blocker, forced-RLS, continuity, former-authority, later-grant, replay/version/race/rollback tests — `services/api/test/identity-continuity-transition.integration.test.ts`, `infra/db/tests/identity-continuity-rls.sql`
  - Depends on: `T033`
  - Acceptance evidence: `one concurrent decision wins with 409 loser; same IDs/MRN/history hashes remain; former guardian denies next request; separately lawful grant retains only its own scope; every direct/cross/unassigned/AAL1/purpose path denies`
- [ ] T035 [P] [US4] [FR-FAM-003, FR-ADMIN-002, NFR-I18N-001, NFR-A11Y-001, NFR-AVAIL-002] Implement assigned ADM-SUPPORT transition review states inside existing admin `/relationships` with minimum projection, proof/blocker status, purpose/AAL/AMR, reason, version conflict, and no legal inference — `apps/admin/app/relationships/page.tsx`, `apps/admin/src/identity-continuity-api.ts`
  - Depends on: `T004`, `T017`, `T033`
  - Acceptance evidence: `admin tests prove assigned-only minimum data, 300s allow/301s deny, self/prior-guardian separation, keyboard confirmation, AR/EN parity, stale refresh, and no new admin role/route`
- [ ] T036 [US4] [FR-FAM-003, NFR-I18N-001, NFR-A11Y-001, NFR-AVAIL-002, NFR-PERF-001] Extend patient `/relationships` with not-eligible/verification/review/human-review/approved/rejected/conflict states and same-record/prior-authority consequences — `apps/patient/app/relationships.tsx`, `apps/patient/src/identity-continuity-api.ts`
  - Depends on: `T004`, `T017`, `T033`
  - Acceptance evidence: `patient tests prove authenticated existing-person submission, no automatic trigger/countdown claim, current authority truth until decision, no offline queue, AR/EN RTL/LTR, focus/live status, reflow/touch/contrast/reduced motion`
- [ ] T037 [US4] [FR-FAM-003, FR-ADMIN-002, NFR-SEC-001, NFR-SEC-004, NFR-I18N-001, NFR-A11Y-001] Run the independent real-stack subject/reviewer/record-continuity/former-authority checkpoint — `tests/e2e/identity-continuity-transition.spec.ts`
  - Depends on: `T034`, `T035`, `T036`
  - Acceptance evidence: `AC-23..31 and all 20 legal vectors pass in Arabic/English against API/PostgreSQL; screenshots show no legal-capacity assertion; DB/API evidence proves same record and immediate old-authority denial`

## Phase 8 — User Story 5: Coherent bilingual security experience across surfaces

**Independent outcome:** Patients and staff can understand and recover every session/MFA/transition
state in Arabic or English using keyboard, screen reader, scalable text, and safe reconnect behavior.

- [ ] T038 [US5] [FR-AUTH-002, FR-AUTH-005, FR-FAM-003, FR-ADMIN-002, NFR-I18N-001, NFR-A11Y-001] Consolidate shared security banners, factor/recovery/transition status, destructive confirmation, problem mapping, focus restoration, and bidi-safe primitives without changing the UI Contract — `packages/design-system/src/security/`, `packages/i18n/src/catalogs.ts`
  - Depends on: `T022`, `T027`, `T032`, `T037`
  - Acceptance evidence: `design-system/i18n tests prove exact state/key parity, stable safety layout, redundant text/icon cues, 44x44, visible focus, WCAG AA contrast, reduced motion, and no pixel-identical/formal approval claim`
- [ ] T039 [P] [US5] [FR-AUTH-002, FR-AUTH-005, FR-FAM-003, FR-ADMIN-002, NFR-AVAIL-002, NFR-OBS-001] Add cross-surface offline/reconnect/stale-session/current-authority reconciliation and redacted low-cardinality observability tests — `apps/patient/test/identity-continuity.test.ts`, `apps/admin/test/identity-continuity.test.ts`, `packages/observability/src/identity-continuity.test.ts`
  - Depends on: `T038`
  - Acceptance evidence: `all security mutations refuse offline queue, reconnect re-reads Auth/API state, stale cached grants never authorize, metrics/logs contain request/trace/outcome only, and prohibited identifiers/session/factor/proof labels fail tests`
- [ ] T040 [US5] [FR-AUTH-002, FR-AUTH-005, FR-FAM-003, FR-ADMIN-002, NFR-I18N-001, NFR-A11Y-001, NFR-PERF-001, NFR-QUALITY-001] Drive and visually inspect live Arabic RTL and English LTR `/mfa`, `/recovery`, `/relationships`, and staff/admin step-up journeys at contracted viewports/input modes — `specs/007-identity-continuity-sessions-mfa-recovery/evidence/live-qa.md`, `specs/007-identity-continuity-sessions-mfa-recovery/evidence/live/`
  - Depends on: `T038`, `T039`
  - Acceptance evidence: `inspected screenshots record commit/seed/config/locale/viewport/state; keyboard, screen reader, 200%/400%, high contrast, 44x44, bidi, offline/reconnect, zero/reduced motion pass with no unresolved critical/high A11y finding or formal pixel-identity claim`
- [ ] T041 [US5] [FR-AUTH-002, FR-AUTH-005, FR-FAM-003, FR-ADMIN-002, NFR-I18N-001, NFR-A11Y-001, NFR-AVAIL-002] Run the independent cross-surface bilingual accessibility checkpoint — `tests/e2e/identity-continuity-accessibility.spec.ts`
  - Depends on: `T040`
  - Acceptance evidence: `AC-18 and AC-31 pass for every contracted route/state in both locales, with no offline mutation, hidden sensitive content before authorization, untranslated key, focus trap, or directionality failure`

## Final phase — Security, performance, documentation, analysis, and PR readiness

- [ ] T042 [FR-AUTH-002, FR-AUTH-005, FR-FAM-003, FR-ADMIN-002, NFR-SEC-006, NFR-PRIV-001, NFR-PRIV-002, NFR-PRIV-003, NFR-PRIV-004, NFR-OBS-001, NFR-PORT-001] Complete factor/recovery/transition worker retry, dedup, ordering, DLQ, consent/recipient/current-address, template/inventory/provider-gate, and prohibited-field security tests — `services/worker/src/identity-continuity.test.ts`, `tests/e2e/identity-continuity-worker-security.spec.ts`
  - Depends on: `T030`, `T037`
  - Acceptance evidence: `one visible local delivery per eligible recipient, zero Emergency Contact/production SMS/invalid event, deterministic retry/DLQ/replay, and zero token/factor/proof/identity/clinical sentinel`
- [ ] T043 [FR-AUTH-002, FR-AUTH-005, FR-FAM-003, FR-ADMIN-002, NFR-SEC-001, NFR-SEC-002, NFR-SEC-003, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006, NFR-SEC-007, NFR-QUALITY-001] Run Auth/RLS/search-path/CSRF/cookie/native-storage/replay/oracle/rate/race/idempotency/redaction/ASVS/API-abuse/SAST/dependency/secret/SBOM security gates and close every reportable HIGH/CRITICAL finding — `specs/007-identity-continuity-sessions-mfa-recovery/evidence/security/`
  - Depends on: `T022`, `T027`, `T032`, `T037`, `T042`
  - Acceptance evidence: `security report records zero unresolved reportable HIGH/CRITICAL, real Auth/RLS negatives, no online service-role/direct Auth mutation/shadow state/new endpoint, exact residual 10s risk, and production adapters/passkeys remain disabled`
- [ ] T044 [FR-AUTH-002, FR-AUTH-005, FR-FAM-003, FR-ADMIN-002, NFR-PERF-001, NFR-PERF-002, NFR-OBS-001, NFR-QUALITY-001] Run declared-dataset/native-session/API/workflow/worker and reference-device performance evidence after warming all 20 connections — `tools/identity-continuity-performance.ts`, `specs/007-identity-continuity-sessions-mfa-recovery/evidence/performance.json`
  - Depends on: `T043`
  - Acceptance evidence: `100 concurrent sessions/5000 people/5000 checks/1000 recovery/1000 transition samples record read p95 <=400ms and mutation p95 <=800ms; device LCP/input evidence declares OPEN-TECH-003 limits and no unverified formal claim`
- [ ] T045 [FR-AUTH-002, FR-AUTH-005, FR-FAM-003, FR-ADMIN-002, NFR-AVAIL-002, NFR-DATA-001, NFR-DATA-002, NFR-OBS-001, NFR-PRIV-003] Add identity-continuity operations/runbook for dual-stack migration, staged failure resume, Auth outage, restriction, notification/DLQ, decoy purge, roll-forward, kill switch, incident/breach evidence, and no authority resurrection — `infra/runbooks/identity-continuity.md`
  - Depends on: `T042`, `T044`
  - Acceptance evidence: `tabletop exercises prove Auth/API/DB/worker outage behavior, RPO/RTO claims are not widened, subject evidence is not purged, revoked sessions/factors/guardianship never resurrect, and production contacts/providers remain disabled`
- [ ] T046 [FR-AUTH-002, FR-AUTH-005, FR-FAM-003, FR-ADMIN-002, NFR-API-001, NFR-API-002, NFR-DATA-001, NFR-DATA-002, NFR-I18N-001, NFR-A11Y-001, NFR-QUALITY-001] Update verification scripts and API/Data/UI realization notes, trace matrix, coverage, operations availability, runbook links, evidence manifest, and task/Issue truth without changing the active operation count or starting 008 — `package.json`, `tools/verify-contracts.mjs`, `docs/architecture/SHIFAA-API-Catalog.md`, `docs/architecture/SHIFAA-Data-RLS.md`, `docs/design/SHIFAA-UI-Contract.md`, `docs/traceability/SHIFAA-Traceability-Matrix.md`
  - Depends on: `T045`
  - Acceptance evidence: `contract/architecture/docs drift gates pass; implemented operation count rises by exactly 8 with catalog total unchanged; every target ID maps bidirectionally to code/tests/evidence/Issue; OPEN production gates and Feature 008 remain untouched`
- [ ] T047 [FR-AUTH-002, FR-AUTH-005, FR-FAM-003, FR-ADMIN-002, NFR-SEC-007, NFR-I18N-001, NFR-A11Y-001, NFR-QUALITY-001] Run post-implementation SpecKit analyze plus clean-code, test, docs, UI, Supabase/RLS, and security reviews; fix every actionable critical/high mismatch and record coverage — `specs/007-identity-continuity-sessions-mfa-recovery/evidence/final-analysis.md`
  - Depends on: `T046`
  - Acceptance evidence: `analysis reports zero actionable critical/high contradiction, every task T001..T046 has exact evidence, every FR/NFR has implementation+verification coverage, and no test is weakened or production/008 scope opened`
- [ ] T048 [FR-AUTH-002, FR-AUTH-005, FR-FAM-003, FR-ADMIN-002, NFR-SEC-001, NFR-SEC-002, NFR-SEC-003, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006, NFR-SEC-007, NFR-PRIV-001, NFR-PRIV-002, NFR-PRIV-003, NFR-PRIV-004, NFR-I18N-001, NFR-A11Y-001, NFR-PERF-001, NFR-PERF-002, NFR-AVAIL-002, NFR-DATA-001, NFR-DATA-002, NFR-API-001, NFR-API-002, NFR-OBS-001, NFR-QUALITY-001, NFR-PORT-001] Run frozen install, clean Supabase/Compose synthetic verification, task/Issue/evidence truth checks, push only the feature branch, open the linked ready PR, and stop without merge — `specs/007-identity-continuity-sessions-mfa-recovery/evidence/verification.md`
  - Depends on: `T047`
  - Acceptance evidence: `corepack pnpm install --frozen-lockfile; corepack pnpm exec supabase stop --no-backup; docker compose down -v; corepack pnpm verify exits 0; git diff --check passes; all 48 tasks/Issues match evidence; required PR checks pass; no direct main push, merge, Issue closure, branch cleanup, or Feature 008 start occurs without Yousef authorization`

## Dependencies and independent checkpoints

```text
T001 -> T002/T003/T004
T002 + T003 -> T005/T006
T002 + T003 + T005 + T006 -> T007 -> T008 -> T009/T010 -> T011
T003 + T005 -> T012 -> T013
T002 + T012 -> T014 -> T015
T011 + T012 + T014 -> T016 -> T017 -> T018
T018 -> T019 -> T020; T004 + T017 + T019 -> T021; T020 + T021 -> T022
T018 -> T023 -> T024; T004 + T017 + T023 -> T025/T026; T024 + T025 + T026 -> T027
T018 -> T028 -> T029; T008 + T023 + T028 -> T030; T004 + T017 + T028 -> T031; T029 + T030 + T031 -> T032
T018 -> T033 -> T034; T004 + T017 + T033 -> T035/T036; T034 + T035 + T036 -> T037
T022 + T027 + T032 + T037 -> T038 -> T039 -> T040 -> T041
T030 + T037 -> T042
T022 + T027 + T032 + T037 + T042 -> T043 -> T044
T042 + T044 -> T045 -> T046 -> T047 -> T048
```

- US1 checkpoint T022 proves bounded refresh/logout/current-session behavior independently.
- US2 checkpoint T027 proves TOTP and privileged AAL2/purpose behavior independently.
- US3 checkpoint T032 proves non-oracular recovery and restricted enrollment independently.
- US4 checkpoint T037 proves reviewed transition and record continuity independently.
- US5 checkpoint T041 proves cross-surface bilingual accessibility and safe reconnect.
- No task implements Feature 008, a ninth operation, a new role/relationship type, shadow Auth
  authority, automatic age/capacity transfer, production provider/passkey/PHI, or merge authorization.
