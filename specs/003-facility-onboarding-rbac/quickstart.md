# Quickstart: Facility Onboarding and Contextual RBAC

## Prerequisites

- Windows PowerShell 7, Node `24.18.0`, pnpm `11.13.0`, Docker Desktop, and the pinned Supabase CLI dependency.
- Seeded-synthetic data only. Never enter a real person, facility, license number, address, or document.

## Install and reset the named local stack

```powershell
$ErrorActionPreference = 'Stop'
fnm use 24.18.0
corepack enable
pnpm install --frozen-lockfile
pnpm supabase:start
pnpm supabase:reset
Copy-Item .env.supabase.example .env.local -ErrorAction SilentlyContinue
pnpm test:facility:stack
```

## Run services

```powershell
$env:SHIFAA_SYNTHETIC_MODE = 'true'
$env:FACILITY_ONBOARDING_ENABLED = 'true'
$env:SYNTHETIC_LICENSING_ENABLED = 'true'
pnpm dev:supabase:api
pnpm dev:admin:web
pnpm dev:clinic:web
pnpm dev:pharmacy:web
pnpm dev:hospital:web
pnpm dev:lab:web
```

Use the generated seeded accounts documented in `evidence/fixtures.md`. Retrieve any real local GoTrue OTP only from local Mailpit. The four facility apps run on distinct ports printed by their scripts; admin uses `http://127.0.0.1:3001`.

## Deterministic acceptance checkpoint

1. For each facility type, create a draft, upload the matching committed synthetic evidence fixture, confirm quarantine blocks approval, release it through the deterministic scanner, and submit.
2. As an assigned AAL2 `facility_approver`, inspect only the minimum projection and approve two fixtures/reject two fixtures with reasons.
3. Create and verify a synthetic professional license, invite the licensed worker, and accept the membership.
4. Confirm the worker enters only the facility application matching the facility type; attempt the same session against another facility/type and observe denial.
5. Exercise AAL1, missing purpose, wrong admin role, expired/suspended/rejected/unverified license, and direct SQL RLS negatives.
6. With two distinct super admins, propose/decide a role grant, propose/decide revocation, and prove self-decision denial.
7. Replay identical idempotency keys and compare stored results/effect counts; change the body and observe `409 idempotency-key-reused`.
8. Run Arabic RTL and English LTR browser journeys at desktop and compact viewports with keyboard and reduced motion.

## Full verification

```powershell
pnpm install
pnpm verify
pnpm test:facility:stack
pnpm test:facility:performance
pnpm sbom:generate
```

Production or official licensing use is prohibited while the feature's canonical `OPEN-*` blockers remain.
