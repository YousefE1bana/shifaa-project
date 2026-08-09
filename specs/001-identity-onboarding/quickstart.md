# Quickstart: Identity Onboarding

## Prerequisites

- Windows PowerShell 7, Git, fnm, Node 24.18.0, Corepack/pnpm 11.13.0.
- Docker Desktop with Linux containers and at least 4 GB available memory.
- No production or real-person data. Use only committed synthetic fixtures.

## Install and verify

```powershell
$ErrorActionPreference = "Stop"
fnm use 24.18.0
corepack enable
pnpm install --frozen-lockfile
Copy-Item .env.example .env.local -ErrorAction SilentlyContinue
docker compose up -d postgres
pnpm db:migrate
pnpm db:test
pnpm verify
```

Expected: PostgreSQL becomes healthy, migrations/RLS tests pass, all packages lint/type/test/build, and secret/redaction scans report zero findings.

## Run the synthetic vertical slice

```powershell
$env:SHIFAA_SYNTHETIC_MODE = "true"
pnpm dev
```

- Patient web: `http://localhost:8081`
- Admin review: `http://localhost:3001/identity-reviews`
- Core API/OpenAPI: `http://localhost:3000/v1/health` and `http://localhost:3000/docs`

Use the seeded Arabic patient `patient.one@synthetic.shifaa.test`, password `Synthetic-Only-2026!`, and the local OTP displayed only by the development inbox. No seed is accepted when `NODE_ENV=production`.

## Deterministic checkpoint

1. Create/log in to the synthetic account.
2. Save the profile and observe a versioned success result.
3. Submit the documented synthetic National ID fixture and observe `manual_review`.
4. In admin, authenticate with the seeded AAL2 reviewer and approve the case with a reason.
5. Return to patient identity and observe `verified` with a masked value only.
6. Grant one optional privacy purpose, refuse another, then withdraw the grant.
7. Repeat a mutation with the same idempotency key/body and observe the stored result; change the body and observe `409`.

Production use is prohibited while the spec's `OPEN-*` blockers remain.
