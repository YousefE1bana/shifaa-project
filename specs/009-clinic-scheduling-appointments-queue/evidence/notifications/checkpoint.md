# Feature 009 — Checkpoint E notification evidence

Feature: `009-clinic-scheduling-appointments-queue`. This is **synthetic graduation engineering** evidence for the local/test notification path only. Production approval: not granted.

## Candidate template authority

The checked-in `contracts/notification-template-candidates.json` contains only version-1 candidate SMS bodies for doctor delay and doctor absence, each with equal Arabic (`ar-EG`) and English (`en-EG`) placeholders and a closed, patient-only field schema. Both entries remain `candidate`; `publication`, `publisher_person_id`, and `published_at` are null. No publication or production-provider evidence is asserted here.

| Candidate               | Canonical content digest                                           |
| ----------------------- | ------------------------------------------------------------------ |
| `CLINIC_DOCTOR_DELAY`   | `b7dea5cb6aba15b4a492f9a1bd23d1af3da40d768eaf491f65154b273200d657` |
| `CLINIC_DOCTOR_ABSENCE` | `c7dc3df3901e9429068632e250292b10371619cb89a0ae34da6162e3d6f9a157` |

The end-to-end test creates **test-only** published releases through the existing Feature 005 draft/publish governance lifecycle in a synthetic database, then removes those fixtures. They are not published Feature 009 releases or an authorization to activate production SMS. `OPEN-VENDOR-002` remains open. Production worker startup and production API notification activation fail closed; the only delivery adapter is local/CI synthetic messaging.

The PostgreSQL worker receives fixed event claims and current minimum recipient projections through scoped database functions. It does not receive raw exception reason, contact destination, token, or credential fields. Retry/dead-letter and delivery-receipt work occurs after the domain transaction; adapter failure cannot reverse the committed schedule exception, appointment, or queue mutation. Fixture tests cover replay deduplication, a superseded overlay, recipient/schema boundaries, transient/permanent failure, and redacted safe error codes. This evidence makes no real publisher, production delivery, or provider receipt claim.

## Focused acceptance

- `corepack pnpm test:clinic-scheduling:notifications -- candidates` — PASS, 51/51 worker tests including candidate locale/schema/digest/status assertions.
- `corepack pnpm --filter @shifaa/worker test -- clinic-scheduling-notifications` — PASS, 51/51 worker tests including bounded retry, dead-letter, redaction, and production-denial assertions.
- `corepack pnpm --filter @shifaa/worker typecheck` and `corepack pnpm --filter @shifaa/api typecheck` — PASS.
- `corepack pnpm test:clinic-scheduling:e2e -- notifications` — PASS, 2/2 serial synthetic API-commit-to-worker tests, including immutable failed-attempt and retry receipts, domain-state preservation, and fixture cleanup.
- `node tools/verify-feature-009-evidence.mjs --checkpoint notifications` — PASS for checkpoint metadata and document markers only; it is not a byte-integrity proof of the approved PNGs.

The repository-wide `pnpm verify` gate was not run for this bounded checkpoint.

The approved UI baseline authority remains `SHIFAA-F009-P0-SOURCE@1.0.0-candidate`, manifest digest `3ac755cc03c263826d1a07d53e08716e8390857249dbda1eb936833265ac0a4c`, 492 references, and 29237789 recorded bytes across 8 approved route families. The manifest/digest is treated as immutable authority. No PNG was opened, modified, regenerated, recompressed, or newly hashed for this checkpoint.
