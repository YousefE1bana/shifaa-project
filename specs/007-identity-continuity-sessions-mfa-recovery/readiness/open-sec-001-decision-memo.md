# OPEN-SEC-001 — session, MFA, and recovery decision memo

> **Status:** RECOMMENDATION READY; approval OPEN
>
> **Required approvers:** named Security Lead and Architecture Lead
>
> **Boundary:** Feature 007 only; no production enablement or implementation authorization

## Authoritative inputs

- SHIFAA `NFR-SEC-003` already requires access tokens at most 15 minutes, strict web refresh cookies,
  Origin/CSRF checks, OS secure storage on mobile, rotation, and reuse detection.
- SHIFAA `FR-AUTH-002`, `FR-AUTH-005`, `FR-ADMIN-002`, `NFR-SEC-004`, the eight roadmap operations,
  and the prohibition on shadow credential/session tables remain controlling.
- [NIST SP 800-63B-4 AAL2](https://pages.nist.gov/800-63-4/sp800-63b/aal/) recommends no more than
  24 hours overall and one hour inactivity for AAL2 reauthentication, requires a phishing-resistant
  option, and defines stronger AAL2 recovery evidence.
- [NIST account recovery and notifications](https://pages.nist.gov/800-63-4/sp800-63b.html) requires
  appropriate recovery evidence, account-recovery notification, and independent notification of
  authenticator binding.
- [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html) requires rotation or sender-constraining for
  public-client refresh tokens, replay detection, family/grant revocation, and inactivity expiry.
- [Supabase session guidance](https://supabase.com/docs/guides/auth/sessions) documents single-use
  rotating refresh tokens, the 10-second reuse exception, whole-session revocation outside its benign
  exceptions, timeout enforcement on refresh, and JWT grace after session timeout.
- [Supabase JWT claims](https://supabase.com/docs/guides/auth/jwt-fields) makes `session_id` required and
  supplies timestamped `amr` entries; [Supabase MFA](https://supabase.com/docs/guides/auth/auth-mfa)
  documents TOTP/phone factors and AAL enforcement.

## Parent's final recommendation

### Session values and revocation

1. Set access JWT lifetime to exactly **15 minutes**. The earlier 60-minute draft is rejected because
   it violates `NFR-SEC-003` and leaves an excessive revocation window.
2. Use the single Supabase project-wide session policy for every actor: configure **23 hours 45
   minutes absolute timebox** and **45 minutes inactivity timeout**. Supabase documents that effective
   enforcement may add one access-token lifetime, so these settings bound the effective maximums to
   **24 hours absolute** and **60 minutes idle**. Clients refresh before expiry only while active and
   foregrounded; background refresh must not defeat idle expiry.
3. Keep refresh-token rotation enabled and the documented **10-second** Supabase reuse interval. A
   reuse outside the two documented benign exceptions revokes the entire affected session/token
   family. No IP, User-Agent, or probabilistic device fingerprint becomes an authorization factor.
4. `logout(all_sessions=false)` revokes the current `session_id`; `logout(all_sessions=true)`,
   successful recovery, password reset, and factor-reset completion revoke all pre-existing sessions.
5. Every authenticated Core API request validates the required `session_id` against the native
   Supabase session record through a least-privilege, fixed-search-path boolean database function
   callable by `shifaa_api`. It returns no Auth rows and uses no service role or shadow session table.
   Missing/invalid session state and Auth dependency failure fail closed. DDL and pinned Supabase
   schema compatibility remain `OPEN-TECH-002` implementation evidence, not an approved change here.

### Reauthentication and MFA

6. Patient routine access may operate at AAL1. Every workforce/admin data access and action requires
   AAL2. High-risk operations require a qualifying AAL2 factor event in signed `amr` no older than
   **5 minutes**; JWT `iat` or token-refresh timestamps never reset freshness. Missing/malformed
   `session_id`, `aal`, or qualifying `amr` fails closed.
7. The existing `login` plus `verifyOtp` challenge flow is the only permitted step-up reuse candidate
   within the frozen catalog. `verifyMfaEnrollment` verifies a newly enrolled factor and must not be
   misused as a general step-up endpoint. The later specification must prove the exact existing
   operation payload/state fit; otherwise it stops for canonical reconciliation rather than adding an
   operation.
8. TOTP is the supported Feature-007 AAL2 factor. Passkeys remain preferred by `NFR-SEC-004` and
   optional under `FR-AUTH-002`, but they remain disabled until the pinned Supabase path proves
   verifier-bound authentication, required `aal2`/`amr` semantics, enrollment, removal, and recovery.
   Phone/SMS OTP is never the sole workforce/admin privileged factor.
9. A factor becomes usable only after verification. Permit at most one pending enrollment per
   user/factor type, expire it after **10 minutes**, rate-limit begin/verify, and remove stale unverified
   factors only through supported Supabase Auth primitives.
10. In-session factor removal requires AAL2 freshness at most five minutes plus recovery verification
    by another enrolled factor or a completed re-proofing case. Serialize factor mutations per user,
    re-read current verified factors immediately before removal, and enforce postconditions. A
    workforce/admin last factor cannot be removed. A patient may intentionally remove an optional last
    factor only outside recovery with explicit warning and fresh proof; recovery can never downgrade an
    existing MFA requirement.

### Recovery and token handling

11. `startRecovery` returns the same `202` status/body class for existing and non-existing accounts,
    uses HMAC-scoped rate limits, and reveals no factor or account state. Challenges are opaque,
    single-use, short-lived, and absent from URLs/logs/analytics/audit payloads.
12. AAL2 recovery requires a still-bound factor plus an independent recovery method, or repeated
    identity proofing. A lost-factor recovery yields a signed, narrowly scoped enrollment-only session;
    all ordinary profile/PHI/admin routes deny it until a replacement factor is verified. Completion
    revokes all old sessions before new access is usable and notifies every verified notification
    address through currently permitted adapters; production SMS remains gated.
13. Web refresh tokens use the existing canonical `HttpOnly; Secure; SameSite=Strict` cookie contract,
    a narrow refresh path, and Origin/CSRF/Fetch-Metadata validation. Native refresh tokens use OS
    secure storage; access tokens remain memory-only where practical. No raw token, OTP, TOTP secret,
    QR secret, recovery handle, or factor secret enters a URL, persistent log, analytics, or audit.

## Required deterministic approval tests

- JWT `exp-1s` allow and `exp+1s` deny; timeout effective boundaries at 23h45m/24h and 45m/60m.
- Foreground refresh vs background/idle behavior; Auth outage and missing-session fail closed.
- Same-token benign concurrent refresh inside 10 seconds; hostile ancestor replay outside 10 seconds
  revokes the whole family; concurrent child use after revocation fails.
- Current-session, all-session, cross-device, recovery, password-change, and factor-reset revocation.
- Required `session_id`, `aal`, and qualifying `amr`; token refresh cannot make stale MFA fresh.
- AAL1 denial for every workforce/admin operation; fresh AAL2 at 4m59s allow and 5m01s deny.
- Enrollment pending quota/expiry, wrong/replayed OTP, factor verification, factor-removal serialization,
  last-factor protection, and immediate post-removal AAL refresh/downgrade.
- Uniform recovery response/timing class, factor/re-proofing negatives, restricted-session route matrix,
  notification fan-out, recovery replay/race, and all-old-session revocation.
- CSRF/Origin/Fetch-Metadata, cookie attributes, native secure-storage, redaction, and secret-sentinel tests.

## AGY findings: parent disposition

| AGY finding                                       | Parent decision                                  | Repository-evidence rationale                                                                                          |
| ------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| 60m JWT/revocation and timeout mismatch           | **Accepted**                                     | The draft violated `NFR-SEC-003`; recommendation is now 15m with timeout offsets.                                      |
| Lost-factor deadlock                              | **Accepted**                                     | Recovery and normal factor management are separated; restricted enrollment solves loss without MFA downgrade.          |
| Missing freshness/session claims and step-up path | **Accepted in part**                             | Require `session_id` and `amr`; reject inventing an operation and prove reuse of existing `login`/`verifyOtp` or stop. |
| Concurrent last-factor removal                    | **Accepted**, implementation correction modified | Serialize supported Supabase factor calls; do not directly mutate internal Auth tables as AGY proposed.                |
| Recovery enumeration/notification blind spot      | **Accepted in part**                             | Uniform 202 and all verified addresses accepted; one-click freeze rejected because it is not a frozen operation.       |
| 10s reuse race                                    | **Accepted as residual vendor risk**             | Preserve vendor default plus strong token storage; reject IP/device fingerprint authorization.                         |
| Unverified-factor quota exhaustion                | **Accepted**                                     | One pending factor/type, ten-minute expiry, rate limit, supported cleanup.                                             |
| Missing `session_id` extraction                   | **Accepted**                                     | Required for current/all-session revocation and attributable, secret-free correlation.                                 |

## Approval block

The gate remains open until the named Security Lead and Architecture Lead each record signer identity,
role, decision, timestamp, memo digest, accepted residual risks, and the frozen deterministic test set.
AGY review and parent recommendation are evidence inputs, not approval.
