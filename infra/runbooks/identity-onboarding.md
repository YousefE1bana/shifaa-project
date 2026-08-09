# Identity onboarding seeded-synthetic runbook

> Scope: `001-identity-onboarding`. This runbook authorizes local/test seeded-synthetic operation only. It does not authorize production identity proofing, SMS, PHI processing, or real identity documents.

## Operating boundary

- Keep `IDENTITY_ONBOARDING_ENABLED=false` and `SYNTHETIC_PROOFING_ENABLED=false` in every production environment.
- Never put Egyptian National IDs, passports, UNHCR card values, document images, patient data, or vendor credentials in fixtures, logs, Issues, screenshots, or performance evidence.
- Valify and SMS adapters remain disabled under `OPEN-VENDOR-001/002`.
- Production sensitive-data processing remains blocked by `OPEN-LEGAL-001/007`.
- Retention durations and deletion actions remain blocked by `OPEN-LEGAL-002`; do not invent a purge schedule.
- Formal release remains blocked by `OPEN-SEC-001`, `OPEN-TEAM-001`, and `OPEN-UX-001/002`.

## Deterministic local bootstrap

Run from the repository root in Windows PowerShell:

```powershell
$ErrorActionPreference = 'Stop'
fnm use 24.18.0
corepack install --global pnpm@11.13.0
pnpm install --frozen-lockfile
if (-not (Test-Path '.env.local')) { Copy-Item '.env.example' '.env.local' }
docker compose --env-file .env.local config
docker compose --env-file .env.local up -d --wait postgres
pnpm db:migrate
pnpm db:test
pnpm db:rls-test
pnpm verify
```

## Verification and evidence

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm contracts:check
pnpm architecture:check
pnpm secrets:check
pnpm test:a11y
pnpm test:e2e
pnpm sbom
```

Run the 100-session performance profile only while the local synthetic API is available:

```powershell
pnpm test:performance
Get-Content 'specs/001-identity-onboarding/evidence/performance.json'
```

The run is passing only when the evidence records read p95 at or below 400 ms and mutation p95 at or below 800 ms. A failed or unavailable run is a blocking finding, not passing evidence.

## Local database reset

`pnpm db:reset` destroys this repository's local PostgreSQL volume. It is forbidden against shared, staging, or production databases.

```powershell
$confirmation = Read-Host 'Type RESET-SHIFAA-LOCAL to delete the local database volume'
if ($confirmation -ne 'RESET-SHIFAA-LOCAL') { throw 'Reset cancelled' }
pnpm db:reset
pnpm db:test
pnpm db:rls-test
```

Append-only consent and audit records must be corrected by forward migration after shared use; they must not be deleted as a rollback technique.

## Kill switch and incident response

1. Set both deployment variables to false:

   ```text
   IDENTITY_ONBOARDING_ENABLED=false
   SYNTHETIC_PROOFING_ENABLED=false
   ```

2. Restart the API and worker deployment using the environment's normal deployment mechanism.
3. Confirm identity-onboarding mutations are unavailable; do not disable general authentication or unrelated emergency capabilities.
4. Preserve audit records, idempotency records, outbox events, database snapshots, and application logs. Do not run `db:reset`.
5. Revoke any exposed vendor or signing credential at its issuer, replace it in the secret store, and record the incident without copying the credential into the ticket.
6. Roll back the application artifact if needed. For an already shared database, use a forward corrective migration; do not drop append-only evidence tables.
7. Escalate ownership remains blocked by `OPEN-TEAM-001`. Until an incident owner is assigned, this feature must remain outside production.

## Shutdown

Preserve the local database volume:

```powershell
docker compose --env-file .env.local down
```

Delete the local synthetic volume only through the confirmed reset procedure above.
