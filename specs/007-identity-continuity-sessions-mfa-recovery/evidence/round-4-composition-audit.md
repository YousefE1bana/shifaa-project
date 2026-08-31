# Round 4 bounded composition audit

Date: 2026-08-31 (Africa/Cairo)

## Boundary and result

This audit followed only the eight canonical Feature-007 operations through their real executable
application paths. It did not reopen the whole-repository security review. The approved Recovery
Proof Grant is a narrow authentication mode on the existing Feature-001 identity-proof creation
path; it is not an access session, a new endpoint, or a ninth Feature-007 operation.

All eight operations are reachable, consume their contracted fields, preserve native Supabase Auth
authority, use forced-RLS PostgreSQL persistence, and fail closed across offline, retry, and
concurrency boundaries. The canonical API catalog remains 242 operations, with exactly eight owned
by Feature 007.

## Executable-path trace

| Canonical operation   | Real composition and evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `refreshSession`      | The root patient layout mounts `PatientSessionLifecycle`, which refreshes on foreground, visibility, a fourteen-minute timer, and immediate online restoration. `IdentityContinuityClient` supplies same-origin browser CSRF cookies or OS-secure native refresh storage. Core calls native Auth rotation, checkpoints the encrypted rotated result before fallible work, rechecks the native session and recovery restriction, and commits the resolved-person audit. Concurrent/retried idempotency returns stored canonical success.                                                                                                                                                                                                                                                |
| `logout`              | The patient profile exposes current-session and all-session controls through `SessionContinuationController`; success clears memory access authority and native secure refresh storage and returns to login. Core resolves the authenticated person, calls native local/global logout, and records the attributed audit. Offline logout is denied and never queued.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `beginMfaEnrollment`  | The patient `/mfa` route supplies the authenticated bearer and TOTP-only request. Core serializes subject factor state, evaluates frozen policy, stages the pending enrollment, calls native Auth, stores only encrypted/TTL-bound resumable state, and audits the resolved actor. Failed persistence compensates by removing the undisclosed native factor.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `verifyMfaEnrollment` | The same `/mfa` route submits the staged enrollment and OTP, installs the elevated native session before continuing, and reconciles factors. Core verifies the exact marker with native Auth, atomically clears any bound recovery restriction, attributes the audit, and emits the minimum factor-change outbox event. The worker resolves the current governed recipient at claim time and applies retry/dedup/DLQ.                                                                                                                                                                                                                                                                                                                                                                  |
| `removeMfaFactor`     | The `/mfa` route sends the selected factor and contracted proof/confirmation fields. Core validates a supplied proof case for the same person, evaluates the last-factor policy, checkpoints the mutation before native unenrollment, recomputes live assurance, then atomically commits the marker, actor audit, and minimum notification event. Replay resumes without repeating native removal.                                                                                                                                                                                                                                                                                                                                                                                     |
| `startRecovery`       | The public patient `/recovery` route submits the normalized handle without bearer authority. Core invokes native recovery delivery and creates a uniform digest-only intake/decoy with the same response shape. It emits no user-visible account-existence signal and never queues offline.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `completeRecovery`    | The `/recovery` route keeps OTP, case token, credential, and any proof grant in component memory. Core redeems OTP once, encrypts resumable state, binds the case, and either completes bound-factor recovery or returns the approved short-lived Recovery Proof Grant. Only the existing identity-proof creation path accepts that digest-bound, single-purpose grant to create and link a same-person recovery re-proof case. After approval, retry resumes the same recovery without OTP reuse; terminal success revokes prior sessions, installs the fresh/restricted native session before UI continuation, atomically records recovery evidence/outbox, and deletes the resume checkpoint. Expired, replayed, wrong-person, and wrong-case grants return the same closed denial. |
| `transitionDependent` | The patient relationships route submits proof with the current continuity version; the actual admin relationships route logs staff in through the existing OTP flow and passes the real bearer to `GuardianshipWorkspace`. Core resolves the stable actor person across JWT rotation and PostgreSQL enforces the frozen subject/reviewer authority, AAL2, purpose, assignment, separation, reason, version, and legal-vector rules. Audit/outbox commit together; notifications fan out to the subject and authorized minimum reviewer with localized AR/EN display values, stable payload codes, ordering, retry, dedup, and DLQ. Offline-to-online worklists refresh before mutation.                                                                                                |

## Additional in-scope composition defects found and closed

1. `logout` had a complete client/controller path but no real application caller. The existing
   operation is now reachable from the patient profile for both frozen scopes, with bilingual
   labels and minimum target sizing.
2. The recovery-grant path revealed that the shared Postgres adapter persisted terminal identity
   verification cases without `decided_at`, violating the existing terminal-state constraint. The
   adapter now writes the decision timestamp atomically for verified/rejected creation; the real
   grant integration proves link, actor audit, expiry, wrong-person denial, and replay denial.
3. Native-session and transition fixtures were reconciled with production authority: direct Auth
   setup now creates the governed person row, and recovery-proof fixtures declare their exact
   recovery link/purpose. No production constraint or authorization predicate was weakened.

## Verification captured before the final gate

- Focused contracts: all 80 realized operations after Feature 007 match the generated
  clients/routes; the canonical API catalog remains 242 and Feature 007 remains exactly 8.
- Focused packages: API 124/124, patient 32/32, admin 13/13, worker 28/28.
- Clean standalone migration/schema/forced-RLS gates: pass.
- Native Auth/PostgreSQL/session checkpoint: pass, including refresh rotation, replay/reuse, and
  current/global revocation.
- Native MFA 7/7 plus bilingual real-stack TOTP 3/3: pass.
- Native recovery 7/7 plus fresh-session/notification E2E 1/1: pass.
- Transition API 40/40, admin 13/13, patient 32/32, and legal vectors 20/20: pass.
- Worker unit 28/28 and real-stack recovery/factor/transition checks 4/4: pass.

No Feature-008 owner, endpoint, operation, role, relationship type, direct Auth-table write, or
service-role path was introduced.

## Final verification

- The one authorized isolated Feature-006 performance rerun passed without changing its
  implementation, workload, thresholds, or assertions: read p95 213.65 ms, mutation/matching p95
  364.72 ms, and worker-claim p95 30.51 ms. All 20 configured API connections were observed warm
  and excluded from the samples.
- The one authorized final `pnpm verify` completed with exit code 0. Its clean-run Feature-006
  checkpoint also passed (read p95 301.62 ms, mutation/matching p95 461.83 ms, worker-claim p95
  46.28 ms), followed by the complete Feature-007 native and standalone stack.
- Fresh Feature-007 evidence measured native-session reads at p95 42.45 ms, recovery mutations at
  p95 61.62 ms, dependent-transition mutations at p95 185.73 ms, combined mutations at p95 166.68
  ms, and transition-worker mutations at p95 30.38 ms against unchanged 400/800 ms targets. All
  20 database connections were warmed; the workstation/loopback limitation and `OPEN-TECH-003`
  remain unchanged.
- Final evidence verification confirmed T001-T048, 4 FRs, 23 NFRs, 48 linked open Issues, exactly
  8 Feature-007 operations, 80 realized operations after Feature 007, canonical API catalog total
  242, and no Feature-008 scope.
