# Threat model — 003 facility onboarding and RBAC

Date: 2026-08-11
Scope: changed 003 code and data flows; seeded-synthetic executable boundary

## Assets and trust boundaries

Assets are private license bytes and metadata, encrypted license numbers/blind indexes, facility and membership authority, five-role grants/revocations, invite tokens, idempotency results, immutable audit attribution, and minimum outbox payloads.

Trust boundaries are browser -> API, bearer/AAL/purpose -> authorization context, API -> PostgreSQL/RLS, API -> private Supabase Storage, scanner -> evidence release metadata, and outbox -> worker/receipt store. Production authentication remains outside this feature under `OPEN-SEC-001`.

## Threats and controls

| Threat                               | Control and evidence                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------------- |
| BOLA/cross-facility access           | facility/person/type tuple checks plus forced-RLS negatives                              |
| Role spoofing or inherited privilege | exact five-role registry, no inheritance, operation-level allow list                     |
| AAL/purpose bypass                   | API and RLS require current AAL2/purpose for review/governance                           |
| Quarantine bypass                    | client checksum never releases evidence; explicit scanner boundary; Storage is private   |
| Raw license disclosure               | AES-256-GCM envelope plus HMAC blind index; DTOs expose mask only                        |
| Invite theft/replay                  | hashed expiring token, named subject, active facility, validity/license recheck          |
| Duplicate mutation/race              | principal/method/route/key/hash record locked in same transaction as domain/audit/outbox |
| Four-eyes bypass                     | current DB actor-bound proposer/decider triggers plus direct-revoke guard                |
| Stale decision                       | mandatory `If-Match` and state/version conflicts                                         |
| Audit/outbox data leak               | closed envelope/payload allow lists, recursive redaction, sentinel tests                 |
| Duplicate worker delivery            | in-flight same-ID promise reservation and durable receipt state                          |
| Synthetic auth in production         | production feature enablement fails closed with explicit `OPEN-SEC-001` error            |
| Storage enumeration                  | private buckets, owner-folder RLS, anonymous list empty, unrelated fetch denied          |

## Findings and resolution

- HIGH (resolved): explicit production enablement could have reached synthetic bearer parsing. Configuration now rejects production facility enablement, and route parsing independently requires synthetic mode.
- HIGH (resolved): the initial PostgreSQL adapter shared mutable snapshots between requests and wrote a grant before its approved revocation request. Each transaction now owns its state, and revocation is persisted before the guarded grant transition.
- HIGH (resolved): `INSERT ... ON CONFLICT` caused update transitions to be evaluated by the draft-only insert policy. Existing facilities now use RLS-guarded `UPDATE`; new facilities use draft-only `INSERT`.
- MEDIUM (resolved): worker redaction was top-level only. Recursive redaction now removes nested document/token sentinels.
- LOW in sealed seeded-synthetic scan (12, all resolved): scanner trust, membership role/license binding, stale invite activation, submission AAL, database actor attribution, purpose-bound reviewer RLS, worker envelope minimization, and concurrent receipt execution. See `validation.md` for the sealed scan identifier and post-remediation gates.

No unresolved reportable HIGH or CRITICAL finding remains. This does not close `OPEN-SEC-001` or constitute production security approval.
