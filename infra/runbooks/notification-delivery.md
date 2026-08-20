# Notification governance and delivery — feature 005

Production messaging is disabled under `OPEN-VENDOR-002`. Only the deterministic `local-synthetic` adapter is permitted.

## Template release

1. The author supplies paired Arabic/English content, the exact patient-only recipient set, an `additionalProperties: false` field schema, and the canonical digest.
2. A different support actor with AAL2 and `notification.template.publish` verifies the same digest and publishes the immutable release.
3. Never include PHI, secrets, tokens, raw contact data, or a persisted full rendered body. Reject fields outside the published schema.

## Worker and receipts

- Connect as `shifaa_worker`, which is non-owner and `NOBYPASSRLS`; do not use `service_role`.
- Claim due notifications with `FOR UPDATE SKIP LOCKED`. The unique notification key and provider idempotency digest guarantee one visible delivery.
- Retry transient/timeout outcomes on the canonical bounded schedule; permanent or exhausted outcomes enter `dead_letter`. Attempts are append-only.
- Signed callbacks accept the exact minimum receipt envelope within the timestamp window. Store only receipt/nonce/request digests and minimum status. Duplicate receipt or nonce returns `409` without a second effect.
- Dead-letter replay requires the platform-operator role, AAL2, purpose `platform.outbox.replay`, reason, and exact version. The original row remains immutable; replay appends a new outbox event and replay-attempt row.

## Kill switch and triage

- Keep the production adapter constructor disabled. If a non-synthetic destination reaches the local adapter, stop processing and investigate the fixture boundary.
- Alert on oldest pending age, retry count, dead-letter count, signature failures, and dedup conflicts using identifiers/digests only.
