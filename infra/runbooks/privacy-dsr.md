# Privacy DSR operations — feature 005

This runbook is for the seeded-synthetic engineering slice only. It does not establish Egyptian statutory retention periods, legal approval, DPO approval, or production erasure authority. `OPEN-LEGAL-001`, `OPEN-LEGAL-002`, and `OPEN-LEGAL-007` remain open.

## Intake and review

1. Confirm the processing-inventory entries for DSR intake/export are active.
2. Confirm subject authority: patient self or an active guardianship that includes `consent.manage`. Delegation and facility membership never qualify.
3. For DPO work, independently confirm current designation, AAL2, `privacy.dsr.review`, and an active assignment for the exact request.
4. Treat `identity_verification_required` as blocking. Do not decide or fulfil until verified evidence is recorded through an approved future proofing path.
5. Require `If-Match`, reason code/summary, and a released private evidence object bound to the same DSR. Partial approval requires both included and excluded scopes.
6. Under `OPEN-LEGAL-002`, reject `hard_delete` and `automated_pseudonymize`. Record only approved review/hold actions; never invent a retention duration.

## Private export

- Release only a fulfilled `access_export` request with a released evidence object.
- Issue a random capability whose SHA-256 digest alone is stored. The capability expires no later than five minutes after issuance and is bound to one authorized person.
- Return `Cache-Control: private, no-store`; consume once; reject expiry/replay with `410`; reject another person with `403`.
- The `dsr-exports` bucket is private. No direct subject/object policy exists; all access is mediated through the Core API capability flow.

## Evidence and recovery

- Verify request event, audit event, outbox event, canonical response, and completed encrypted idempotency record commit together.
- For a stale version, refresh authoritative state and submit a new idempotency key. Never replay a changed body with an old key.
- Use only the deterministic fixtures under `specs/005-privacy-dsr-notifications/evidence/`; never place real subject data in tickets, logs, screenshots, or exports.
