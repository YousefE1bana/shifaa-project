# Tasks: Supabase Runtime Foundation

> **Feature:** `002-supabase-runtime-foundation` · **Plan status:** executable seeded-synthetic; production/formal gates blocked

## Phase 1 — Toolchain and stack

- [x] T001 [NFR-QUALITY-001, NFR-PORT-001] Pin Supabase CLI and runtime libraries; add reproducible root commands — `package.json`, `pnpm-lock.yaml`
  - Depends on: `none`
  - Acceptance evidence: `pnpm install --frozen-lockfile; pnpm supabase --version` exits 0 and prints `2.113.0`
- [x] T002 [NFR-DATA-001, NFR-QUALITY-001] Initialize the committed local Supabase topology and safe synthetic configuration — `supabase/config.toml`, `.env.supabase.example`
  - Depends on: `T001`
  - Acceptance evidence: `pnpm supabase:start; pnpm supabase:status` exits 0 with local Auth, DB, Storage and Mailpit healthy
- [x] T003 [FR-AUTH-001, FR-AUTH-003, FR-AUTH-007, NFR-DATA-001, NFR-DATA-002] Adopt the 001 schema/RLS as ordered Supabase migrations and seed only synthetic notice/reviewer/storage rows — `supabase/migrations/`, `supabase/seed.sql`
  - Depends on: `T002`
  - Acceptance evidence: `pnpm supabase:reset` exits 0 twice and schema/RLS assertions pass

## Phase 2 — Runtime adapters

- [x] T004 [FR-AUTH-001, FR-AUTH-002, NFR-SEC-002, NFR-PORT-001] Implement Supabase Auth registration/login/OTP plus strict JWKS JWT verification — `services/api/src/adapters/supabase-auth.ts`, `packages/auth/`
  - Depends on: `T002`
  - Acceptance evidence: integration tests accept a local issued token and reject forged/expired/wrong-audience tokens
- [x] T005 [FR-AUTH-001, FR-AUTH-003, FR-AUTH-004, FR-AUTH-006, FR-AUTH-007, FR-AUTH-008, FR-ADMIN-002, NFR-SEC-001, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006] Implement bounded PostgreSQL pool, transaction-local RLS context, persistent repository, atomic idempotency/audit/outbox — `services/api/src/adapters/postgres/`
  - Depends on: `T003`, `T004`
  - Acceptance evidence: persistence, replay, race and same-pool cross-patient negative integration tests pass
- [x] T006 [FR-AUTH-003, FR-AUTH-004, NFR-PRIV-002, NFR-PORT-001] Implement private quarantine Supabase Storage adapter and public/anonymous denial tests — `services/api/src/adapters/supabase-storage.ts`
  - Depends on: `T002`, `T003`
  - Acceptance evidence: allowed synthetic upload succeeds; public read, wrong MIME/size/checksum and cross-owner access fail
- [x] T007 [NFR-PORT-001, NFR-OBS-001, NFR-QUALITY-001] Make validated config select Supabase/PostgreSQL/Storage, add dependency readiness, and deny executable local adapters — `services/api/src/app.ts`, `services/api/src/config.ts`
  - Depends on: `T004`, `T005`, `T006`
  - Acceptance evidence: runtime starts only with complete local Supabase config; unit tests alone may select in-memory adapters

## Phase 3 — Verification and handoff

- [x] T008 [FR-AUTH-001, FR-AUTH-002, FR-AUTH-003, FR-AUTH-004, FR-AUTH-006, FR-AUTH-007, FR-AUTH-008, FR-ADMIN-002] Add full local-stack integration and API-restart persistence suite — `services/api/test/supabase-runtime.integration.test.ts`
  - Depends on: `T007`
  - Acceptance evidence: complete synthetic 001 records survive API restart and assigned masked review reloads
- [x] T009 [NFR-SEC-001, NFR-SEC-002, NFR-SEC-004, NFR-SEC-006, NFR-OBS-001] Add direct-client, secret, PHI, RLS context-leak and architecture negative gates — `tools/`, `infra/db/tests/`
  - Depends on: `T007`
  - Acceptance evidence: `pnpm architecture:check; pnpm secrets:check; pnpm supabase:test` exits 0
- [x] T010 [NFR-QUALITY-001] Update install/runbook/CI commands and exact seeded-synthetic limitations — `docs/TEAM-INSTALLATION-CHECKLIST.md`, `infra/runbooks/identity-onboarding.md`, `.github/workflows/ci.yml`
  - Depends on: `T008`, `T009`
  - Acceptance evidence: clean PowerShell bootstrap and CI command sequence are copy-paste executable
- [x] T011 [NFR-I18N-001, NFR-A11Y-001, NFR-QUALITY-001] Drive Arabic RTL and English live browser journeys against Supabase, restart API, verify patient profile and admin queue, and record evidence — `specs/002-supabase-runtime-foundation/evidence/manual-live-qa.md`
  - Depends on: `T008`, `T010`
  - Acceptance evidence: browser evidence records URLs, states, masked projections, dependency logs and restart persistence with no real data
- [x] T012 [NFR-QUALITY-001, NFR-PORT-001] Run full verification, SpecKit analyze, enriched Issue generation, commit/push and CI verification — `specs/002-supabase-runtime-foundation/analysis.md`
  - Depends on: `T011`
  - Acceptance evidence: `pnpm verify` and post-implementation analysis pass; GitHub Issues include feature/task/FR-NFR/dependency/evidence/baseline fields
