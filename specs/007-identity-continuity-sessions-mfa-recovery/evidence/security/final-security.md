# Feature 007 final security gates

Date: 2026-08-29 (Africa/Cairo)

## Scope and boundary

- Scan ID: `3ef18add-b9a5-4b93-baa7-c4c556bc3469`
- Immutable scan target: `ccd76c4875821beb246fa3b0abf32f225c54f6ae..e8fc415c3408a3a2c74c677a851776fe5de8d3df`
- Review worklist: 89 changed-source items, 89 closed
- Discovery: 21 validated concrete instances, grouped into six report findings
- Boundary: Feature 007 only, exactly eight operations; unrelated standalone audit findings were excluded
- Production CodeQL remains a required pull-request check. The local diff scan, secrets, dependency, and SBOM gates ran without hiding or downgrading results.

The sealed pre-remediation report is `codex-security-report.md`. Its findings remain
open in that immutable report by design; the closure evidence below applies to the
post-remediation working tree that will become the final Feature-007 checkpoint.

## Findings and closure

| Finding                                                                          | Initial severity | Instances | Closure                                                                                                                                                      | Verification                                                                           |
| -------------------------------------------------------------------------------- | ---------------- | --------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Revoked or recovery-restricted JWT reached legacy identity-onboarding operations | HIGH             |         9 | Added native `session_id` propagation and one authoritative current/restricted-session decision before OTP session return and all protected onboarding sinks | restricted/revoked authority unit coverage; real native session revocation gate        |
| Expired or revoked identity evidence satisfied lost-factor recovery              | HIGH             |         1 | Repeated proof now requires a decided verified case joined to a currently verified, non-expired identity                                                     | mutation red/green PostgreSQL proof test; transition integration 4/4                   |
| Restricted recovery bound only one session                                       | HIGH             |         1 | Restriction lookup is subject-wide across staged and restricted states and is enforced by protected Core API operations                                      | different-session subject restriction PostgreSQL test; recovery and onboarding gates   |
| Refresh rotation bypassed idempotency                                            | MEDIUM           |         1 | Provider rotation is inside the idempotency store with a key-scoped HMAC principal                                                                           | concurrent same-key one-call test; changed-body reuse returns 409; native session gate |
| Native credential mutation preceded durable deny checkpoint                      | MEDIUM           |         1 | A subject-wide deny-only recovery restriction is persisted before credential, logout, or sign-in mutation                                                    | service order test plus real staged-restriction PostgreSQL test                        |
| Pre-authentication rate bucket cardinality was unbounded                         | LOW              |         8 | Added a 10,000 live-bucket cap, expired-entry purge, and fail-closed capacity response without allocating another entry                                      | focused limiter capacity and eviction test                                             |

Unresolved actionable HIGH/CRITICAL findings: **0**.

## Executable gates

| Gate                                   | Result                                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| Focused remediation tests              | 47 passed; 4 environment-gated skipped in the focused command                |
| API TypeScript                         | passed                                                                       |
| Native Supabase reset and migrations   | passed from a clean local Auth schema                                        |
| Auth/session/revocation/refresh-reuse  | 5 API tests, 3 integration tests, and bilingual real-stack checkpoint passed |
| Native MFA/TOTP and privileged step-up | 7 API tests and 3 bilingual checkpoints passed                               |
| Recovery/oracle/restriction            | 6 real native tests and 1 real bilingual worker checkpoint passed            |
| Dependent transitions                  | 20/20 legal vectors; PostgreSQL transition integration 4/4                   |
| Standalone schema and forced RLS       | `pnpm db:test` and `pnpm db:rls-test` passed after clean migration           |
| Worker retry/dedup/order/DLQ/redaction | 25/25 unit tests and 4/4 clean-DB real worker checkpoints passed             |
| Lint                                   | passed (16/16 workspace tasks)                                               |
| Secrets                                | passed                                                                       |
| Dependency integrity/audit             | passed; no new vulnerabilities ignored                                       |
| SBOM                                   | CycloneDX generated and captured                                             |
| Diff hygiene                           | `git diff --check` passed                                                    |

The standalone worker rerun required a clean repository-scoped Compose reset because
the preceding transition checkpoint intentionally left 18 pending synthetic events.
Against the clean queue, every worker checkpoint passed; no test or finding was
suppressed.

## Security invariants reverified

- Native Supabase Auth remains authoritative for sessions, refresh rotation, factors,
  AAL/AMR, and global logout.
- Web refresh tokens remain cookie-only with origin, Fetch Metadata, double-submit
  CSRF, `HttpOnly`, `Secure`, `SameSite=Strict`, and bounded path controls; native
  refresh material is not placed in durable web storage.
- Recovery responses retain no-oracle behavior; public tokens, provider OTPs,
  credentials, factor material, recovery proof, PHI, and governed addresses are not
  written to logs, audit metadata, outbox payloads, notifications, or evidence.
- Forced RLS/default deny and hardened function `search_path` controls remain active.
- Dependent transition authority remains AAL2, purpose-bound, assigned,
  separation-of-duties protected, optimistic-concurrency checked, and limited to the
  20 frozen legal vectors.
- Retry, deduplication, ordering, bounded DLQ, and staged recovery resume do not
  resurrect revoked sessions, factors, or guardian authority.

## Captured artifacts

- `codex-security-scan-manifest.json`
- `codex-security-coverage.json`
- `codex-security-findings.json`
- `codex-security-report.md` — SHA-256 `B0710B5DD5D44D9C85916C1C3A1FDF4C4FFCFBC678EA471B630C197CCB8D1FE6`
- `repository-sbom.cdx.json` — SHA-256 `416F9E8196A17BCC9DE15A4CDB14700F2E9DF30BFDD715A9608AB16FD67D671B`

## Quality-guard review

- Clean-code guard: no actionable naming, responsibility, duplication, or hidden
  error-flow issue remains in the remediation diff.
- Test guard: behavior is asserted at service, route, PostgreSQL, native Auth, and
  worker boundaries; the mutation check proved the new PostgreSQL assertions fail
  when the authorization predicates are removed.
- No assertion was weakened. Two stale session evidence assertions were corrected to
  follow the current `SecurityStatusBanner` accessibility ownership, retaining checks
  for alert role, live region, and assertive behavior.

T043 is complete only for the post-remediation working tree described here. The
final clean verification and PR CodeQL result remain T048 responsibilities.
