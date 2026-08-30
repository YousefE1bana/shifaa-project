# Feature 007 realization truth

Date: 2026-08-30 (Africa/Cairo)

## Lifecycle

- Local Feature-007 implementation, realization reconciliation, post-implementation
  analyze, and clean verification: complete through T048.
- PR required checks and Product Owner squash-merge authorization remain external
  lifecycle gates.
- Merge/release: not performed. Production enablement remains false.
- Feature 008: not started; no operation, route, data owner, task, Issue, or artifact
  is claimed for it here.

## Exact operation availability

| Operation             | Local engineering realization                        | Production     |
| --------------------- | ---------------------------------------------------- | -------------- |
| `refreshSession`      | native Supabase Auth plus Core API/client            | disabled/gated |
| `logout`              | current/all native revocation plus Core API/client   | disabled/gated |
| `beginMfaEnrollment`  | native TOTP enrollment                               | disabled/gated |
| `verifyMfaEnrollment` | native TOTP challenge/verification                   | disabled/gated |
| `removeMfaFactor`     | serialized native factor removal                     | disabled/gated |
| `startRecovery`       | no-oracle digest-only recovery intake                | disabled/gated |
| `completeRecovery`    | proof/restriction/staged native completion           | disabled/gated |
| `transitionDependent` | subject submission and assigned independent decision | disabled/gated |

Count: **exactly 8**. The canonical API catalog remains **242 active
operations**. Realized operation parity advances from 72 through Feature 006 to
80 through the current Feature-007 branch. No ninth operation exists.

## Realization surfaces

- API/contracts: OpenAPI 3.1.1, generated contracts/client, Fastify routes,
  RFC 9457 problems, request/version/idempotency/no-store controls.
- Data/RLS: one `identity.continuity_cases` workflow table, native session boolean
  helper only on Supabase, fixed-search-path functions, forced RLS/default deny,
  non-owner API/worker roles, exact event/template extensions.
- UI: patient `/mfa`, `/recovery`, and `/relationships`; admin `/relationships`;
  shared existing staff/admin step-up shells. Arabic RTL and English LTR evidence
  remains engineering-only under the formal UX/device gates.
- Operations: `infra/runbooks/identity-continuity.md` covers dual-stack migration,
  outage/recovery, kill switches, DLQ, evidence, and monotonic revocation.

## Requirements and evidence

The implementation maps to exactly four FRs: `FR-AUTH-002`, `FR-AUTH-005`,
`FR-FAM-003`, and `FR-ADMIN-002`, plus the 23 NFRs frozen in `spec.md`. Security,
performance, live UI/accessibility, runbook, contract, database/RLS, Auth, worker,
and transition-vector evidence is indexed by `evidence/manifest.json`.

`OPEN-TECH-003`, production legal/retention, production identity/messaging vendor,
and formal UX gates retain their canonical effects. Local passing evidence does
not close them.

## Task and Issue truth

GitHub Issues `#188` through `#235` were live-read on 2026-08-30. All 48 are open
and map monotonically: `#188` → T001, ..., `#235` → T048 (`Issue = 187 + task
number`). No Issue was closed in this implementation session. T001-T048 are now
complete; PR checks and Product Owner squash-merge authorization remain pending.
