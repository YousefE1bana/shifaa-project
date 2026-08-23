# Discovery and SOS foundation runbook

This runbook covers the seeded-synthetic 006 engineering runtime. SHIFAA does not dispatch an ambulance, reserve a bed, publish production capacity, or contact a production messaging provider. Users must retain the visible Egyptian ambulance guidance `123`.

## Start and verify

```powershell
corepack pnpm install --frozen-lockfile
docker compose down -v
docker compose build postgres
docker compose up -d --wait postgres
corepack pnpm db:migrate
corepack pnpm test:discovery-sos:stack
```

Confirm PostgreSQL 17, PostGIS 3.5, and a healthy vector/geography extension:

```powershell
docker compose exec -T postgres psql -U shifaa_owner -d shifaa -c "select version(), postgis_full_version();"
```

Only repository-scoped synthetic data is permitted. Never load a real person, phone number, clinical fact, facility feed, or coordinate.

## Feature controls

The runtime keeps separate controls for discovery, SOS activation, hospital pre-arrivals, emergency-share creation/view, and local contact delivery. Production capacity publishing, external map/geocoder traffic, ambulance integration, and production messaging remain absent.

When risk is detected:

1. Disable new SOS or share creation with the narrowest applicable feature control.
2. Preserve incident read/close, share revocation, committed audit truth, and `123` guidance.
3. Disable contact delivery independently if the message projection, consent recheck, or local adapter is suspect.
4. Do not mutate historical audit/outbox rows or describe a queued local-synthetic event as delivered.

## Operational triage

| Signal                  | Check                                                                                | Safe response                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Discovery empty or slow | facility active/license/geodata authority, GiST plan, radius config                  | show manual/list fallback; never retain the search point                                           |
| Capacity stale/unknown  | `observed_at`, `fresh_until`, approved source, version                               | exclude from qualifying matches and label honestly                                                 |
| No SOS match            | verified candidates and fail-closed capacity configuration                           | keep incident active, show nearby minimum projections and `123`; do not imply dispatch/reservation |
| Acceptance conflict     | incident/capacity versions, current membership, purpose, AAL2                        | reload current state; do not create an arrival, bed, or admission                                  |
| Share returns 410       | expiry, revoke, prior use, access limit                                              | create a new bounded share only with current `sos.share` authority                                 |
| Contact delayed/failed  | active incident, `all_confirmed`, current confirmed consent, template, local adapter | show truthful retry/failure state; never claim provider contact                                    |

Logs, traces, metrics, audit metadata, and outbox payloads must not contain query/SOS coordinates, raw or hashed share tokens, phone/callback values, emergency-profile values, free text, or rendered messages.

## Restore and roll forward

- Back up and restore with the repository PostgreSQL procedure while preserving the PostgreSQL 17 major version and PostGIS extension availability.
- Restore into an isolated synthetic environment first, run all migrations, schema tests, forced-RLS tests, and the PostGIS query-plan probe, then compare aggregate row counts and immutable evidence chains.
- Roll forward with a new migration. Do not edit or remove the applied 006 migration.
- If a code rollback is required, first disable new writes with feature controls. Preserve readable/closable incidents and revocable shares until the compatible application version is restored.
- Retention/deletion automation for `SOS_LOCATION` remains disabled while `OPEN-LEGAL-002` is open. Do not invent a purge period.

## Escalation gates

Production deployment requires the named owners to close the applicable canonical gates, including `OPEN-TECH-001`, `OPEN-LEGAL-001/002/007`, `OPEN-VENDOR-002`, `OPEN-UX-001/002`, `OPEN-PRODUCT-001`, and `OPEN-TEAM-001`. Passing this runbook is engineering evidence only.
