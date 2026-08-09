# Tasks: Identity Onboarding

> **Feature:** `001-identity-onboarding` · **Plan status:** seeded-synthetic executable; formal gates carry `BLOCKED` overlay  
> Every task has canonical requirement IDs, earlier-task dependencies, an exact path, and deterministic acceptance evidence for GitHub handoff.

## Phase 1 — Workspace and contracts

- [x] T001 [NFR-QUALITY-001, NFR-PORT-001] Create the pinned pnpm/Turborepo canonical workspace, package boundaries, shared TypeScript/test/lint configuration, and placeholder canonical apps/services — `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `packages/config/`
  - Depends on: `none`
  - Acceptance evidence: `fnm use 24.18.0; pnpm install --frozen-lockfile; pnpm lint; pnpm typecheck` exits 0
- [x] T002 [NFR-DATA-001, NFR-SEC-002, NFR-PRIV-002, NFR-QUALITY-001] Add local PostgreSQL 17 container, environment contract, health check, and production-deny synthetic-mode validation — `compose.yml`, `.env.example`, `services/api/src/config.ts`
  - Depends on: `T001`
  - Acceptance evidence: `docker compose config; pnpm --filter @shifaa/api test -- config.test.ts` exits 0 and production synthetic mode is rejected
- [x] T003 [FR-AUTH-001, FR-AUTH-002, FR-AUTH-003, FR-AUTH-004, FR-AUTH-006, FR-AUTH-007, FR-AUTH-008, FR-ADMIN-002, NFR-API-001, NFR-API-002] Implement validators/types from the approved OpenAPI slice and verify operation/requirement parity — `packages/contracts/src/identity-onboarding.ts`, `packages/contracts/src/identity-onboarding.test.ts`
  - Depends on: `T001`
  - Acceptance evidence: `pnpm --filter @shifaa/contracts test` exits 0 with all 16 operation IDs and canonical requirement IDs present

## Phase 2 — Domain, persistence, and policy

- [x] T004 [FR-AUTH-001, FR-AUTH-003, FR-AUTH-004, FR-AUTH-006, FR-AUTH-007, FR-AUTH-008, NFR-PORT-001] Implement pure onboarding aggregates, identity state machine, consent policy, masking, encryption interface, and deterministic crypto adapter — `packages/core/src/identity-onboarding/`
  - Depends on: `T003`
  - Acceptance evidence: `pnpm --filter @shifaa/core test` exits 0 including randomized ciphertext, stable blind index, terminal transition, and granular consent vectors
- [x] T005 [FR-AUTH-001, FR-AUTH-003, FR-AUTH-004, FR-AUTH-006, FR-AUTH-007, FR-AUTH-008, NFR-PRIV-004, NFR-DATA-001, NFR-DATA-002] Add PostgreSQL identity/consent/platform/audit schemas, constraints, state guards, indexes, append-only rules, retention-class metadata, and synthetic notice/purpose seeds — `infra/db/migrations/001_identity_onboarding.sql`
  - Depends on: `T002`, `T004`
  - Acceptance evidence: `pnpm db:migrate; pnpm db:test` exits 0 against PostgreSQL 17 with schema assertions passing
- [x] T006 [FR-AUTH-001, FR-AUTH-003, FR-AUTH-004, FR-AUTH-007, FR-ADMIN-002, NFR-SEC-001, NFR-SEC-004] Add and force RLS, fixed-search-path helpers, reviewer AAL/purpose/assignment guards, and the complete negative actor matrix — `infra/db/policies/001_identity_onboarding_rls.sql`, `infra/db/tests/identity-onboarding-rls.sql`
  - Depends on: `T005`
  - Acceptance evidence: `pnpm db:rls-test` exits 0 and denies cross-patient, guardian/delegate, unassigned, no-purpose, and AAL1 cases
- [x] T007 [FR-AUTH-001, FR-AUTH-003, FR-AUTH-004, FR-AUTH-007, FR-AUTH-008, FR-ADMIN-002, NFR-SEC-001, NFR-SEC-006] Implement the deep identity-onboarding use-case module with repository/auth/proofing/crypto seams and atomic audit/outbox results — `services/api/src/modules/identity-onboarding/`
  - Depends on: `T004`, `T006`
  - Acceptance evidence: `pnpm --filter @shifaa/api test -- identity-onboarding.unit.test.ts` exits 0 with default-deny and atomic-outcome assertions
- [x] T008 [FR-AUTH-002, FR-AUTH-003, FR-AUTH-004, NFR-PORT-001] Implement deterministic local auth/proofing/upload adapters and production-disabled Supabase/Valify adapter contracts — `services/api/src/adapters/`
  - Depends on: `T002`, `T007`
  - Acceptance evidence: `pnpm --filter @shifaa/api test -- adapters` exits 0 for verified, pending, manual, failed, timeout, bad upload, and production-guard vectors
- [x] T009 [FR-AUTH-001, FR-AUTH-003, FR-AUTH-004, FR-AUTH-007, FR-ADMIN-002, NFR-SEC-005] Implement atomic idempotency, terminal replay, request hashing, pre-auth HMAC principal, and optimistic version-conflict policy — `services/api/src/platform/idempotency.ts`
  - Depends on: `T007`
  - Acceptance evidence: `pnpm --filter @shifaa/api test -- idempotency.test.ts` exits 0 for same-key/same-body, changed-body, concurrent claim, and stored-result vectors

## Phase 3 — Core API vertical slice

- [x] T010 [FR-AUTH-001, FR-AUTH-002, FR-AUTH-003, FR-AUTH-004, FR-AUTH-006, FR-AUTH-007, FR-AUTH-008, FR-ADMIN-002, NFR-API-001, NFR-API-002] Register all 16 catalogued routes with validation, no-store headers, localized RFC 9457 problems, request IDs, rate limits, idempotency, and version headers — `services/api/src/routes/identity-onboarding.ts`
  - Depends on: `T003`, `T008`, `T009`
  - Acceptance evidence: `pnpm --filter @shifaa/api test -- identity-onboarding.contract.test.ts` exits 0 and generated route inventory equals the feature OpenAPI operation set
- [x] T011 [FR-AUTH-001, FR-AUTH-002, FR-AUTH-003, FR-AUTH-004, FR-AUTH-006, FR-AUTH-007, FR-AUTH-008, FR-ADMIN-002, NFR-SEC-001, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006] Add end-to-end API acceptance, negative authorization, replay, race, vendor, inventory, review, and consent tests — `services/api/test/identity-onboarding.integration.test.ts`
  - Depends on: `T010`
  - Acceptance evidence: `pnpm --filter @shifaa/api test:integration` exits 0 and covers AC-01 through AC-11, AC-13, and AC-15
- [x] T012 [NFR-API-001, NFR-PORT-001] Generate the typed API client from the feature contract and fail on handwritten or missing operations — `packages/api-client/src/identity-onboarding.ts`
  - Depends on: `T003`, `T010`
  - Acceptance evidence: `pnpm contracts:check` exits 0 with zero diff and 16 generated client operations

## Phase 4 — Patient onboarding experience

- [x] T013 [NFR-I18N-001, NFR-A11Y-001] Implement the canonical SHIFAA tokens/primitives, Arabic-first and English catalogs, RTL/bidi utilities, parity checks, and care-passport status rail — `packages/design-system/`, `packages/i18n/`
  - Depends on: `T001`
  - Acceptance evidence: `pnpm --filter @shifaa/i18n test; pnpm --filter @shifaa/design-system test` exits 0 with equal locale keysets and WCAG token checks
- [x] T014 [US1] [FR-AUTH-001, FR-AUTH-002, NFR-I18N-001, NFR-A11Y-001] Build Expo patient onboarding/login/OTP routes with direct copy and complete loading/offline/rate/error/success states — `apps/patient/app/onboarding.tsx`, `apps/patient/app/login.tsx`
  - Depends on: `T012`, `T013`
  - Acceptance evidence: `pnpm --filter @shifaa/patient test -- onboarding-auth.test.tsx` exits 0 in Arabic/English, RTL, keyboard/web, offline, and rate-limit states
- [x] T015 [US1] [FR-AUTH-001, NFR-SEC-005, NFR-I18N-001, NFR-A11Y-001] Build the provisional `/profile` route with versioned save, conflict recovery, 200% text, and explicit next action — `apps/patient/app/profile.tsx`
  - Depends on: `T014`
  - Acceptance evidence: `pnpm --filter @shifaa/patient test -- profile.test.tsx` exits 0 for empty, loading, offline, conflict, error, and saved states
- [x] T016 [US1] [FR-AUTH-003, FR-AUTH-004, FR-AUTH-006, NFR-I18N-001, NFR-A11Y-001] Build the patient identity route with masked values, vendor/manual/quarantine/rejected states, and blocked offline mutation — `apps/patient/app/identity.tsx`
  - Depends on: `T014`
  - Acceptance evidence: `pnpm --filter @shifaa/patient test -- identity.test.tsx` exits 0 without rendering raw identity values after submission
- [x] T017 [US1] [FR-AUTH-007, FR-AUTH-008, NFR-PRIV-001, NFR-I18N-001, NFR-A11Y-001] Build Arabic-first privacy notice and independent consent/refuse/withdraw routes with zero queued offline writes — `apps/patient/app/privacy.tsx`, `apps/patient/app/privacy-consents.tsx`
  - Depends on: `T014`
  - Acceptance evidence: `pnpm --filter @shifaa/patient test -- consent.test.tsx` exits 0 for granular grant/refuse/withdraw parity and offline blocking
- [x] T018 [US1] [FR-AUTH-001, FR-AUTH-002, FR-AUTH-003, FR-AUTH-004, FR-AUTH-007, FR-AUTH-008, NFR-I18N-001, NFR-A11Y-001] Run the independently demonstrable patient checkpoint from registration through saved privacy choices — `apps/patient/e2e/identity-onboarding.spec.ts`
  - Depends on: `T015`, `T016`, `T017`
  - Acceptance evidence: `pnpm --filter @shifaa/patient test:e2e` exits 0 for 360x800 Arabic and 1440x900 English synthetic flows

## Phase 5 — Reviewer, events, and cross-cutting evidence

- [x] T019 [US2] [FR-AUTH-003, FR-AUTH-004, FR-ADMIN-002, NFR-SEC-004, NFR-I18N-001, NFR-A11Y-001] Build the Next.js admin identity-review worklist/decision route with AAL2/purpose states, zero motion, reason capture, keyboard operation, and minimum projection — `apps/admin/src/app/identity-reviews/`
  - Depends on: `T012`, `T013`
  - Acceptance evidence: `pnpm --filter @shifaa/admin test` exits 0 for AC-12 and no unrelated patient fields are rendered
- [x] T020 [FR-AUTH-003, FR-AUTH-004, FR-AUTH-007, NFR-SEC-006] Implement outbox worker receipt deduplication, bounded retry/dead-letter behavior, and minimum identity/consent event payload allow-lists — `services/worker/src/identity-onboarding.ts`
  - Depends on: `T007`
  - Acceptance evidence: `pnpm --filter @shifaa/worker test` exits 0 for duplicate, retry, dead-letter, and prohibited-field vectors
- [x] T021 [FR-AUTH-001, FR-AUTH-006, FR-AUTH-007, FR-ADMIN-002, NFR-OBS-001] Implement structured request telemetry, recursive redaction, sentinel scanning, and low-cardinality metrics — `packages/observability/src/`
  - Depends on: `T007`
  - Acceptance evidence: `pnpm --filter @shifaa/observability test` exits 0 and finds zero synthetic ID/password/OTP/token/document sentinel values
- [x] T022 [NFR-SEC-007, NFR-QUALITY-001] Add GitHub CI for install/fmt/lint/type/unit/contract/migration/RLS/a11y/E2E/secret/dependency/SAST/SBOM/architecture checks — `.github/workflows/ci.yml`
  - Depends on: `T006`, `T011`, `T018`, `T019`, `T020`, `T021`
  - Acceptance evidence: `pnpm verify; pnpm sbom:generate` exits 0 locally and the pushed GitHub Actions run passes
- [x] T023 [NFR-PERF-002, NFR-QUALITY-001] Add the 100-session synthetic API load profile and store the reproducible p95 evidence — `services/api/test/performance/identity-onboarding.k6.js`, `specs/001-identity-onboarding/evidence/performance.json`
  - Depends on: `T011`
  - Acceptance evidence: `pnpm test:performance` exits 0 with read p95 <=400ms and mutation p95 <=800ms or records a blocking finding
- [x] T024 [NFR-QUALITY-001, NFR-PORT-001] Add architecture-cycle, dependency-boundary, OpenAPI/catalog, secret, and synthetic-fixture safety checks — `tools/verify-architecture.mjs`, `tools/verify-contracts.mjs`, `tools/verify-secrets.mjs`
  - Depends on: `T001`, `T003`
  - Acceptance evidence: `pnpm architecture:check; pnpm contracts:check; pnpm secrets:check` exits 0
- [x] T025 [NFR-PRIV-002, NFR-PRIV-004, NFR-QUALITY-001, NFR-PORT-001] Document deterministic environment bootstrap, Kimi/Codex Issue-scoped implementation, database reset, retention/legal blocks, incident kill switch, and prohibited production use — `docs/TEAM-INSTALLATION-CHECKLIST.md`, `infra/runbooks/identity-onboarding.md`
  - Depends on: `T002`, `T012`
  - Acceptance evidence: a clean Windows PowerShell session can execute every fenced command through `pnpm verify` with only `.env.local` synthetic defaults
- [x] T026 [FR-AUTH-001, FR-AUTH-002, FR-AUTH-003, FR-AUTH-004, FR-AUTH-006, FR-AUTH-007, FR-AUTH-008, FR-ADMIN-002, NFR-QUALITY-001] Run all acceptance evidence, update this checklist honestly, and record remaining formal/production blockers without claiming approval — `specs/001-identity-onboarding/checklists/requirements.md`, `specs/001-identity-onboarding/evidence/verification.md`
  - Depends on: `T022`, `T023`, `T024`, `T025`
  - Acceptance evidence: `pnpm verify` exits 0 and verification.md lists command, timestamp, commit, result, and every unresolved OPEN item

## Dependencies and execution

```text
T001 → T002/T003/T013
T003 → T004 → T005 → T006 → T007 → T008/T009 → T010 → T011/T012
T012 + T013 → T014 → T015/T016/T017 → T018
T012 + T013 → T019
T007 → T020/T021
T006 + T011 + T018 + T019 + T020 + T021 → T022
T011 → T023
T001 + T003 → T024
T002 + T012 → T025
T022 + T023 + T024 + T025 → T026
```

The first independent patient outcome is T018. Formal gate approval and production rollout are intentionally not tasks because their required named/legal/vendor/design evidence is unavailable and already owned by canonical `OPEN-*` rows.
