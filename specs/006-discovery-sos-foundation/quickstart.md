# Quickstart: Discovery and SOS Foundation

This guide validates seeded-synthetic 006 behavior only. It never contacts a map/geocoder, SMS provider, hospital system, ambulance service, or production data source and never promises dispatch, reservation, or care.

## 1. Preconditions

```powershell
git status --short --branch
git rev-parse HEAD
corepack pnpm install --frozen-lockfile
docker compose down -v
corepack pnpm verify
```

Expected branch: `codex/006-discovery-sos-foundation`. Expected base ancestor: `090efaa8c7ff3ea86e2b01efa2f77f874c0aa800`. Do not run `pnpm db:reset` immediately before `pnpm verify`.

## 2. Runtime provenance

```powershell
docker buildx imagetools inspect postgis/postgis:17-3.5-alpine
docker compose config --quiet
docker compose build postgres
docker scout cves --only-severity critical,high shifaa/postgis:17-3.5-006-local
docker compose up -d --wait postgres
docker compose exec -T postgres psql -U shifaa_owner -d shifaa -c "select version(), postgis_full_version();"
```

Expected upstream OCI index digest: `sha256:fae81f3e8da88b8e684c58c8a8616aadda72e6fc1affcb050b490891ecb3db1c`. The derived runtime must report zero critical/high vulnerabilities. A changed upstream digest or dependency requires review; do not silently update it.

## 3. Planned automated gates

The feature commands are registered during implementation. Until then, their absence is not a pass; use the baseline verification only.

```powershell
pnpm test:discovery-sos:stack
pnpm test:discovery-sos:e2e
pnpm test:discovery-sos:security
pnpm test:discovery-sos:performance
pnpm contracts:check
pnpm architecture:check
pnpm secrets:check
pnpm dependencies:check
```

Evidence must cover PostGIS/GiST plans, freshness boundaries, forced RLS, exact permissions, idempotency/races, share-token secrecy/access limits, contact privacy/dedup, and canonical latency thresholds.

## 4. Start local services

```powershell
pnpm dev:discovery-sos:api
pnpm dev:discovery-sos:worker
pnpm dev:patient:web
pnpm --filter @shifaa/hospital dev
```

Start each command in a separate terminal. The API launcher checks for the 006 migration and idempotently loads `infra/db/fixtures/discovery-sos.sql` into the repository-scoped PostGIS database; it does not use or reset Supabase. Startup must state that production capacity publishing, maps/geocoding, messaging, and production PHI are disabled. Use only deterministic synthetic IDs from `packages/test-kit`.

## 5. Discovery acceptance

In Arabic RTL and then English LTR at `/discover` and `/discover/map`:

1. Search by type/service with synthetic current location, manual area, and bounded radius.
2. Confirm only active verified licensed/geolocated facilities appear, ordered by distance then stable ID.
3. Confirm rating is explicitly unavailable until Trust exists and non-hospital operational signal is unknown.
4. Exercise location denied, map unavailable, manual/list fallback, loading, empty, stale/unknown, offline, recoverable/unrecoverable error, and success.
5. Inspect logs/metrics/audit/outbox and prove the query coordinate sentinel appears nowhere.

## 6. SOS and hospital acceptance

At `/sos` and `/sos/:id`:

1. Select explicit patient context, one closed non-diagnostic reason, contact preference, and verified callback source.
2. Activate with fresh qualifying synthetic capacity; confirm an informational match and no reservation/dispatch wording.
3. Replay the same idempotency key/body, then change the body and run concurrent activation; prove one effect and the canonical `409` behavior.
4. Use stale/no capacity and confirm nearby hospitals plus prominent call-`123` guidance with no match guarantee.
5. Prove self/current guardian/activate-only delegate and deny share-only/revoked/expired/unrelated actors.

At hospital `/sos-prearrivals`:

1. Prove only the matched facility member at the required purpose sees the minimum row.
2. Deny another facility, stale membership, missing purpose, and mutation below AAL2.
3. Accept once with the current version; race accept/close and confirm one valid transition.
4. Confirm every locale says accepted pre-arrival, never bed reserved or ambulance dispatched.

## 7. Emergency share acceptance

At owner `/sos/:id/share` and public `/sos/share`:

1. Independently prove `sos.share`; `record.view` and `sos.activate` alone fail.
2. Select each allow-listed field; unavailable future clinical sources remain labeled unavailable, not empty/normal.
3. Create the link, verify <=30-minute expiry, copy it once, and inspect database/log/audit/outbox/idempotency storage for absence of plaintext token.
4. Open the public fragment link once and verify `Cache-Control: private, no-store`, `Pragma: no-cache`, `Referrer-Policy: no-referrer`, exact scope, and safe path logging.
5. Prove replay, expiry, revocation, unknown token, and concurrent view/revoke return no data after the one winner.

## 8. Emergency Contact acceptance

1. Activate a qualifying incident with `all_confirmed`; prove one minimum local-synthetic delivery per confirmed contact.
2. Exercise `none|coarse|exact` location precision and server-verified patient/initiator callback selection.
3. Use `none`, declined/revoked/expired contacts, and lab, interaction, medication, admission, referral, and routine events; prove zero delivery.
4. Exercise transient retry, permanent failure, DLQ, replay, and receipt dedup; incident/match truth must not change.
5. Prove no diagnosis, medication, lab, admission, record link, phone, raw coordinate, callback, rendered body, or token leaks to disallowed storage/telemetry.

## 9. Live accessibility and visual evidence

Inspect Arabic and English states at `360x800`, `412x915`, `768x1024`, and `1440x900` as applicable. Record keyboard-only behavior, visible focus, screen-reader names/live regions, 200% text, 400% web reflow, high contrast, zero emergency motion/reduced motion, touch targets, bidi isolation, and offline handling.

Save inspected screenshots under `specs/006-discovery-sos-foundation/evidence/live/` and record commit, seed/config digest, locale, viewport, route/state, interaction result, and screenshot path in `evidence/live-qa.md`. Screenshots are informative while `OPEN-UX-001/002` remain open.

## 10. Final clean gate

```powershell
docker compose down -v
corepack pnpm verify
git diff --check
git status --short --branch
```

Then run post-implementation SpecKit analysis and quality guards, refresh task/verification/security/performance evidence only from fresh output, push only the feature branch, open the linked PR, and wait for every required check. Stop at ready-for-merge and request explicit squash-merge authorization.
