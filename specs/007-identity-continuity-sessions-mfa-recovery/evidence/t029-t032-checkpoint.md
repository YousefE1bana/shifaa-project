# T029-T032 recovery checkpoint evidence

Date: 2026-08-27 (Africa/Cairo)  
Environment: seeded-synthetic local native Supabase/Auth (54322) plus standalone Compose PostgreSQL
(5432). No production provider or service-role application path was enabled.

## T029 no-oracle and recovery security

- Real native Auth/PostgreSQL suite: 6/6.
- Warmed timing sample: 100 existing and 100 nonexistent handles; identical accepted response keys.
- Existing p95: 51.297 ms; nonexistent p95: 20.147 ms; absolute delta: 31.150 ms (budget <=50 ms).
- Provider OTP/handle binding, cross-account denial, 15-minute expiry, one concurrent winner,
  crash-resume without replayed provider work, global old-session denial, proof-shape negatives, and
  stale unbound/decoy purge boundary are covered by API unit/integration and schema tests.
- Restricted registry is exactly `refreshSession`, `logout`, `beginMfaEnrollment`, and
  `verifyMfaEnrollment`. Remove/transition and bearer use of anonymous recovery operations deny.

## T030 factor and recovery notifications

- Unit worker suite: 21/21.
- Real standalone PostgreSQL worker checkpoint: 3/3.
- Factor event resolves the owner address at claim time. A stale address was replaced before claim;
  only the SHA-256 alias of the current active address reached the synthetic adapter.
- An inactive/unverified owner produced zero visible delivery and reached DLQ after six bounded claims.
- Retry then success reused one provider idempotency key; replay produced no second visible delivery.
- Aggregate/version ordering and notification uniqueness remain enforced by existing outbox/notification
  constraints. Factor ID remains only the aggregate ID.
- Worker RLS/grants and function-source tests deny Auth-table and Emergency Contact recipient paths.
- Event payload, notification fields, attempts, receipts, and safe error state contain no address,
  OTP/TOTP, factor secret/ID payload field, QR, credential, token, recovery proof, or PHI.

## T031 automated recovery surface checkpoint

- Patient typecheck and 24/24 patient tests pass.
- Automated evidence covers request/accepted/proof/pending/failed/restricted/completed/expired/rate/offline
  states, identical account-existence copy, memory-only case/OTP/proof/credential material, no URL/history/
  storage/analytics secret path, no offline queue, reconnect reset, AR RTL/EN LTR direction, live status,
  one-time-code semantics, and the restricted link only to existing `/mfa` replacement enrollment.
- T040 retains final live screenshot, viewport, keyboard, screen-reader, zoom, contrast, and visual
  inspection ownership; this checkpoint makes no final live-QA or pixel-identity claim.

## T032 independent real-stack checkpoint

- Native Auth/API/PostgreSQL/worker E2E: 1/1.
- Proves provider recovery OTP, fresh native session, all-old-session denial, completed case/outbox,
  one safe patient notification, and zero prohibited durable sentinel.
- Standalone migration/schema/RLS and native Supabase migration both accept the portable private
  pgcrypto-schema address-alias boundary.
