# SHIFAA Baseline Amendment — v2.1.2 / Feature-007 Readiness

| Field            | Value                                                                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Amendment ID     | `SHIFAA-AMENDMENT-007-READINESS-2026-08-25`                                                                                               |
| Approver         | Yousef Osama                                                                                                                              |
| Roles            | Product Owner, Team Lead, Architecture Lead, SpecKit/Governance Owner, current pre-implementation engineering/security decision authority |
| Decision         | Close `OPEN-TEAM-001` globally and `OPEN-SEC-001` for Feature-007 specification/development                                               |
| Approval date    | 25-Aug-2026                                                                                                                               |
| Version          | v2.1.2                                                                                                                                    |
| Baseline         | `origin/main@ccd76c4875821beb246fa3b0abf32f225c54f6ae` plus Feature-007 readiness history                                                 |
| Digest algorithm | SHA-256                                                                                                                                   |

## OPEN-TEAM-001 closure

The Product Owner approves this operating model:

| Person              | Responsibility                                                                                                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Yousef Osama        | Product Owner, Team Lead, Architecture Lead, SpecKit/Governance Owner, and current pre-implementation engineering/security decision authority; sole owner of `specify -> clarify -> plan -> tasks -> analyze -> taskstoissues` |
| Mostafa Ali         | Security Lead when implementation/security review activates                                                                                                                                                                    |
| Diaa Eldin Assem    | Backend/Core API implementation                                                                                                                                                                                                |
| Ibrahim Saeid       | Data/PostgreSQL/RLS implementation                                                                                                                                                                                             |
| Amira Saad          | QA/testing/evidence                                                                                                                                                                                                            |
| Ziad Wael           | Frontend/UI/A11y/integration                                                                                                                                                                                                   |
| Dr Asmaa Hekal      | Academic Supervisor                                                                                                                                                                                                            |
| TA Mahmoud Ghalwash | Academic Reviewer/TA                                                                                                                                                                                                           |

Team members implement assigned work later under Yousef's approved specs/tasks and do not individually
approve the lifecycle artifacts. Their assignment acknowledgement, contact method, and rotation start
are implementation-activation records, not independent `SPEC_APPROVED` signatures. Academic review
does not replace professional legal/DPO, clinical, security-testing, vendor, UX, or release approval.

Therefore `OPEN-TEAM-001` is **CLOSED** and no longer blocks Feature 007 or later features. This
closure grants no repository/runtime permission and does not authorize implementation by itself.

## OPEN-SEC-001 closure

Yousef approves the following exact development-stage session, MFA, and recovery policy:

1. Access JWT lifetime is exactly 15 minutes.
2. The Supabase project config uses a 23-hour-45-minute absolute timebox and 45-minute inactivity
   timeout, bounding effective access to 24 hours absolute and 60 minutes idle after the final JWT.
3. Proactive refresh requires foreground user engagement; hidden, backgrounded, blurred, or otherwise
   unattended clients suspend refresh, and no timer may defeat inactivity expiry.
4. Refresh rotation stays enabled with the documented 10-second reuse interval. Reuse outside the
   documented benign exceptions revokes the affected session/token family. IP, User-Agent, or device
   fingerprints are not authorization factors.
5. Current logout revokes the current native `session_id`; all-session logout, successful recovery,
   password reset, and factor-reset completion revoke every pre-existing session.
6. Every authenticated Core API request validates `session_id` and user binding against native
   Supabase session state through a boolean-only, fixed-search-path, least-privilege database boundary.
   Auth/session dependency failure fails closed. No shadow session table, online service role, direct
   client Auth-table access, or policy-selected physical SQL is authorized.
7. Routine patient access may use AAL1. Every workforce/admin access/action requires AAL2. High-risk
   actions require a signed qualifying factor-event `amr` no older than five minutes: 300 seconds is
   valid and 301 seconds is stale. JWT `iat`, password `auth_time`, and refresh time never substitute.
8. Step-up may reuse only the existing `login` plus `verifyOtp` challenge flow if the Feature-007
   contract proves the fit. `verifyMfaEnrollment` cannot become a general step-up operation; otherwise
   the lifecycle stops for canonical reconciliation rather than adding an endpoint.
9. TOTP is the supported Feature-007 AAL2 factor. Passkey configuration and enrollment remain disabled
   until pinned Supabase compatibility proves required verifier binding, AAL/AMR, enrollment, removal,
   and recovery behavior. SMS/phone OTP is never the sole privileged workforce/admin factor.
10. Only one pending enrollment per user/factor type is permitted; it expires after ten minutes.
    Enrollment/verification is rate-limited, and factors become usable only after verification.
11. Factor removal requires fresh AAL2 plus another verified factor or completed re-proofing. Mutations
    serialize per user and re-read verified factors. Workforce/admin last-factor removal is forbidden;
    patient optional-last-factor removal is explicit, fresh, and never permitted through recovery.
12. `startRecovery` is a uniform non-oracular `202` response with HMAC-scoped rate limits. Challenges
    are opaque, single-use, short-lived, and absent from URLs/logs/analytics/audit payloads.
13. AAL2 recovery requires a still-bound factor plus an independent method, or repeated identity
    proofing. Lost-factor recovery produces a server-enforced restricted enrollment-only session that
    allows only `refreshSession`, `logout`, `beginMfaEnrollment`, and `verifyMfaEnrollment`; every other
    registered operation denies until replacement-factor verification.
14. Recovery completion revokes every old session before new ordinary access is usable and notifies
    all verified notification addresses through currently permitted adapters. Production SMS remains
    gated.
15. Web refresh uses `HttpOnly; Secure; SameSite=Strict`, a narrow path, and Origin/CSRF/Fetch-Metadata
    validation. Native refresh uses OS secure storage. Tokens, OTP/TOTP secrets, QR secrets, recovery
    handles, and factor secrets never enter URLs, persistent logs, analytics, or audit.

## Frozen deterministic security tests

- JWT: `exp-1s` permits and `exp+1s` denies.
- Absolute timeout: configured 23h45m and effective 24h boundary; inactivity: configured 45m and
  effective 60m boundary. At 46m without foreground engagement, the next refresh returns
  `401 session-expired`.
- Benign same-token concurrency inside ten seconds returns one rotated child; hostile ancestor replay
  after the interval revokes the family and concurrent child use fails.
- Current/all-session, cross-device, recovery, password-reset, and factor-reset revocation.
- Required `session_id`, `aal`, and timestamped qualifying factor `amr`; refresh at `t0+10m` cannot make
  `t0` MFA fresh. AAL2 at 299s and 300s permits, 301s denies.
- AAL1 denies every workforce/admin operation. Auth outage, missing session, malformed claims,
  wrong actor/purpose, and cross-resource attempts fail closed.
- Enrollment quota/ten-minute expiry, wrong/replayed OTP, unverified factor denial, serialized removal,
  last-factor protection, passkey-disabled behavior, and immediate post-removal authorization.
- Uniform recovery response/timing class, factor/re-proofing negatives, recovery replay/race,
  all-old-session revocation, notification fan-out, and exhaustive denial of every registered operation
  outside the four-operation restricted-session allowlist.
- CSRF/Origin/Fetch-Metadata, web cookie attributes, native secure storage, and secret/redaction
  sentinel tests.
- Every time boundary uses injected/fake clocks or database test-clock parameters. Sleep-based CI
  timing tests are forbidden.

## Final AGY disposition

AGY used `gemini-3.7-flash-high`, HIGH reasoning, read-only, project
`57e12fe0-99bb-44ac-8b66-5c403b3465f4`, conversation
`d011053d-ddf6-49b3-9280-fde2ec7921e2`, exit `0`, and `readOnlyViolation: false`. AGY did not approve
the gate.

| Finding                                    | Parent decision                                                                                                                    |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Unattended refresh defeats idle expiry     | Accepted; foreground engagement and the 46-minute vector are frozen.                                                               |
| JWT refresh could reset MFA freshness      | Accepted with a stricter 300s/301s factor-AMR boundary; AGY's five-second tolerance is rejected.                                   |
| Freeze exact Auth `SECURITY DEFINER` SQL   | Principle accepted; exact SQL/schema mechanics rejected here and deferred to `OPEN-TECH-002`.                                      |
| Recovery restriction must be server-side   | Accepted; AGY's three-operation allowlist is corrected to include refresh and avoid enrollment deadlock.                           |
| Time-bound tests need deterministic clocks | Accepted; sleeps are forbidden.                                                                                                    |
| Passkeys must remain disabled              | Accepted; exact contract problem code belongs to specification.                                                                    |
| Mostafa must co-approve now                | Rejected; Yousef owns the pre-implementation decision, while Mostafa's Security Lead responsibility activates with implementation. |

No unresolved technical contradiction remains. `OPEN-SEC-001` is **CLOSED for Feature-007
specification/development**.

## Preserved blockers and authorization boundary

This amendment authorizes neither implementation nor production deployment. `OPEN-LEGAL-001`,
`OPEN-LEGAL-002`, `OPEN-LEGAL-007`, vendor gates, UX gates, `OPEN-TECH-002`, `OPEN-TECH-003`,
`NFR-SEC-007`, production secrets/KMS, ASVS/API abuse evidence, live security acceptance, and release
approval retain their canonical effects. `OPEN-LEGAL-006` remains closed and unchanged.

## Approved artifact digests

| Artifact                                                                                          | SHA-256                                                                        |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `shifaa-prd.md`                                                                                   | `9525ee9d6498600c1d3bd14794b5983687e4f6ee6e8052ce9ecc9a622856064a`             |
| `SHIFAA-Implementation-Plan-MASTER.md`                                                            | `ac1d77fbc0ceac01c40c5c7a135b8fae5f8699ac5cbdce080715c2d0a36210d5`             |
| `docs/governance/SHIFAA-Remaining-Specs-Roadmap.md`                                               | `f8cefe6313fa7c1d51733a7fa14c112efe77d98903036834f348a3cf7a8eae3d`             |
| `docs/governance/SHIFAA-Completion-Coverage.md`                                                   | `721e9ceaada0a6327aee4e1f0c568e1d23ae76a96361f876db67d61d18aca51a`             |
| `docs/traceability/SHIFAA-Traceability-Matrix.md`                                                 | `aceeacb0788b56e849df64894ed9fa9473ecb29ee7f460feef622d8510ca396c`             |
| `specs/007-identity-continuity-sessions-mfa-recovery/readiness/open-team-001-decision-request.md` | `f965357954f96d0053600e67ab41e358a93aea1a934508c2be5b04155e001037`             |
| `specs/007-identity-continuity-sessions-mfa-recovery/readiness/open-sec-001-decision-memo.md`     | `2bbb2243dfb9d1d24c1dd05a7ab9f6d2499e6a90c656ef9c1c93e2316f7039da`             |
| `.specify/memory/constitution.md`                                                                 | `25419aa07eca0c7846a80acb9720e3f4041c0970cd78025fbf1107bae659c30a` (unchanged) |

This is the attributable Product Owner approval record for v2.1.2. Earlier approval records remain
immutable history.
