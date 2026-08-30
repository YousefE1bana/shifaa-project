# Feature 007 validation quickstart

> This is the staged validation guide. Tasks T001-T048 are implemented and verified on the current Feature-007 branch; PR checks and Product Owner merge authorization remain external lifecycle gates. Nothing here claims merge or production release.

## Prerequisites

- Node `24.18.0`, pnpm `11.13.0`, Docker, and Supabase CLI `2.113.0`.
- Synthetic-only keys/configuration; no real identity, phone, email, clinical, or production credential.
- Feature branch and immutable approved spec/plan/task baseline.

## Clean setup

```powershell
corepack pnpm install --frozen-lockfile

# Native Supabase Auth stack (port 54322) and its migration history
corepack pnpm exec supabase stop --no-backup
corepack pnpm exec supabase start
corepack pnpm supabase:reset

# Standalone Compose verification stack (port 5432)
docker compose down -v
docker compose up -d --wait postgres
corepack pnpm db:migrate
```

The Supabase CLI stack proves native Auth/session/MFA compatibility. The Compose stack proves the
repository's standalone PostgreSQL migration/RLS suite. Never assume migration of one stack updated
the other.

Do not run `pnpm db:reset` immediately before the final `pnpm verify`; the canonical final gate starts
from `docker compose down -v` and lets verification build one clean repository-scoped database.

## Contract and configuration checkpoint

1. Assert exactly eight Feature-007 OpenAPI operation IDs and exact API Catalog method/path/flags.
2. Assert `jwt_expiry=900`, sessions `23h45m`/`45m`, rotation enabled, reuse `10`, TOTP enabled,
   phone/passkey/WebAuthn disabled.
3. Regenerate source contracts/client and require zero subsequent diff.
4. Assert no Feature-008 operation, new relationship/admin role, shadow session/factor table, Auth SQL
   mutation, or client domain mutation.

## Independent checkpoints

### US1 — bounded sessions

- Use fake clocks for JWT, idle, absolute, and refresh-reuse boundaries.
- Prove foreground refresh, unattended denial, benign concurrent parent use, hostile replay family
  revocation, current/all/cross-device logout, missing/native-invalid session, and Auth outage fail-close.

### US2 — TOTP and privileged step-up

- Enroll one TOTP, verify it, list minimum factor summaries, and remove it under patient optional and
  mandatory workforce/admin rules.
- Prove pending quota/ten-minute expiry, invalid/replayed codes, unsupported passkey, 299/300/301s AMR,
  refresh-staleness, serialized removal, last-factor denial, and immediate post-removal AAL refresh.

### US3 — recovery

- Compare 100 existing and 100 nonexistent starts: same `202` schema and p95 delta ≤50ms.
- Prove bound-factor/independent-method and repeated-proof paths, restricted four-operation allowlist,
  challenge expiry/replay/race, all-old-session revocation, and one notification/address.

### US4 — dependent transition

- Run `TV-FAM-CAPACITY-TRANSITION-001..020` and `AC-23..30`.
- Assert age-18 no-op, Cairo civil-date 21 eligibility-only, proof/reviewer/blocker matrix, one
  concurrent winner, same person/patient/MRN/clinical links, former guardian denial, and separate later
  grants only.

### US5 — bilingual accessible security surfaces

- Drive `/mfa`, `/recovery`, `/relationships`, and staff/admin step-up states in Arabic RTL and English
  LTR at compact/desktop plus reference Android.
- Inspect screenshots; run keyboard, screen reader, visible focus, 200%/400% reflow, 44×44 targets,
  contrast, bidi, offline no-queue, reconnect, and reduced-motion checks.

## Security, performance, and final gate

```powershell
corepack pnpm test:identity-continuity:stack
corepack pnpm test:identity-continuity:e2e
corepack pnpm test:identity-continuity:performance
corepack pnpm test:identity-continuity:security
docker compose down -v
corepack pnpm verify
git diff --check
```

Expected: zero unresolved reportable HIGH/CRITICAL finding; zero prohibited secret/PHI sentinel; 100%
acceptance vector pass; read p95 ≤400ms and mutation p95 ≤800ms. Formal device/visual/production claims
remain blocked until their separate OPEN gates close.
