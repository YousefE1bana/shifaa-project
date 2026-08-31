# Feature 007 research and decisions

> **Status:** complete — no unresolved planning item
>
> **Authority:** SHIFAA v2.1.2 baseline, Feature-007 `SPEC_APPROVED`, pinned repository runtime

## R-01 — Native Supabase sessions and factors remain authoritative

**Decision:** Use pinned Supabase Auth for users, sessions, refresh-token families, MFA factors,
challenges, AAL, and AMR. SHIFAA adds no credential, refresh-token-family, factor-secret, or session-
validity table. `packages/auth` owns typed native Auth ports; every mutation is proxied by the exact
catalogued Core API operation, while factor-summary listing is a minimum read-only Auth port.

**Evidence:** The repository pins Supabase CLI `2.113.0`, `@supabase/supabase-js 2.112.2`, `jose 6.2.8`,
Node `24.18.0`, and PostgreSQL 17. The pinned local schema contains `auth.sessions`, `refresh_tokens`,
`mfa_factors`, and `mfa_challenges`. Official Supabase session guidance documents required
`session_id`, refresh rotation/reuse exceptions, timeout-on-refresh behavior, and native session
revocation. Official MFA guidance documents enroll/challenge/verify/list/unenroll and verified-factor
AAL behavior.

**Alternatives rejected:** application session/factor tables; direct Auth SQL mutation; browser domain
mutation; online `service_role`; device fingerprint authorization.

**2026-08-26 contract reconciliation:** Refresh tokens are provider-owned opaque rotation
credentials. Their SHIFAA request/response schemas validate only non-empty bounded strings
(`1..4096`) and never infer entropy, strength, or authority from length. The attributable Product
Owner decision and pinned-runtime evidence are recorded in
`evidence/security/refresh-token-contract-reconciliation.md`.

## R-02 — Exact local Auth configuration

**Decision:** `supabase/config.toml` sets `jwt_expiry = 900`, keeps refresh rotation enabled and
`refresh_token_reuse_interval = 10`, enables `[auth.sessions] timebox = "23h45m"` and
`inactivity_timeout = "45m"`, enables TOTP enroll/verify, leaves phone MFA disabled, and leaves
passkey/WebAuthn disabled. `max_enrolled_factors = 10` remains the pinned provider ceiling; SHIFAA
separately enforces one pending TOTP/user/type and the policy-specific last-factor rules.

**Rationale:** Exact v2.1.2 policy values are already approved. The provider ceiling is not treated as
an authorization rule. The May 2026 passkey beta does not satisfy SHIFAA verifier/AAL/AMR/recovery
evidence and remains disabled.

**Changelog check:** Current official breaking changes affect PostgreSQL 17/self-hosted Studio, Data
API exposure, Auth-schema object restrictions, and OAuth status behavior; none authorizes changing the
approved session/MFA policy. Custom functions remain outside `auth` in the private `platform` schema.

## R-03 — Current native-session validation without direct grants

**Decision:** Add one private boolean-only `platform.auth_session_is_current(p_session_id,
p_auth_user_id)` security-definer function with `search_path = pg_catalog, auth`; revoke `PUBLIC`,
`anon`, and `authenticated`, and grant execute only to non-owner `shifaa_api`. It checks exact session
ID/user binding and current provider state and returns no Auth row/metadata. The Core API first verifies
the signed JWT, matches `sub`, validates UUID `session_id`, then calls the function on every protected
request. Any missing claim, mismatch, function error, or Auth dependency failure denies.

**Pinned-schema gate:** The migration test introspects required `auth.sessions` columns/indexes before
creating the helper and fails with a compatibility error when the pinned schema drifts. No function or
object is created inside `auth`.

**Alternatives rejected:** direct `SELECT` grants; a view exposing Auth rows; JWT-only logout delay;
service-role HTTP lookup; copied validity state.

## R-04 — One application workflow table, not shadow Auth state

**Decision:** Add `identity.continuity_cases` for recovery and dependent-transition workflow evidence.
It stores case type/state, subject/person/patient/relationship/proof references, reviewer attribution,
opaque public-token HMAC digest, expiry, version, and—only for restricted recovery—a binding to an
already-valid native session ID. That binding can only narrow authorization; it cannot authenticate,
refresh, revoke, or make a native session valid.

**Rationale:** Existing `identity.verification_cases` requires one `identity_id` and owns onboarding
proof state; overloading it would couple three state machines and break 001. Mutating only
`care_relationships` cannot represent recovery, proof/review, restricted enrollment, replay, or
versioned decision evidence. Separate recovery and transition tables duplicate assignment, expiry,
event, idempotency, and RLS behavior.

**Shape boundary:** Anonymous recovery intake cases may use a null subject whether the supplied
handle belongs to an account or not. Only server-side Supabase recovery-OTP verification whose returned
subject and normalized-handle digest match the intake binds the existing person. Transition cases always
bind the existing person, patient, and guardianship. No credential, token, factor secret, legal document,
or session-validity copy is stored.

## R-05 — Restricted recovery is native authentication plus a deny-only binding

**Decision:** After approved lost-factor re-proofing, Supabase issues a native session. The recovery
case binds that valid `session_id` with `restriction_scope = 'mfa_enrollment_only'`. Middleware first
requires native validity, then denies every registered operation except `refreshSession`, `logout`,
`beginMfaEnrollment`, and `verifyMfaEnrollment`. Replacement verification removes the restriction only
after global old-session revocation and terminal recovery completion.

**Rationale:** A signed claim alone could be stale; frontend guards are bypassable; a second SHIFAA
session/token would be shadow Auth. The database binding supplies current deny-only authorization and
cannot grant access if the native session is absent.

**Alternatives rejected:** custom application access token; account-global user metadata restriction;
frontend allowlist; three-operation allowlist that deadlocks after a 15-minute JWT expires.

## R-06 — Native Auth commands use a safety-first staged transaction

**Decision:** Native Auth HTTP operations and SHIFAA PostgreSQL cannot share one ACID transaction.
Use the existing durable idempotency reservation/prepare/complete pattern:

1. reserve and lock the idempotency/case transition;
2. re-read native session/factor state and application authorization;
3. execute one supported user-context Auth command;
4. reconcile the native result;
5. commit case/audit/outbox/non-secret response atomically;
6. issue ordinary access only after all required native revocations and the application terminal state.

Retries reconcile from native state. A crash can cause extra denial or require resume, never access
before proof/replacement/revocation. Transition-only database mutations remain one PostgreSQL
transaction.

**Secret replay envelopes:** The existing AES-256-GCM idempotency response protection may hold the
one-time TOTP enrollment response for at most ten minutes under `TRANSIENT_TECHNICAL`; the key stays
outside PostgreSQL. This is a transient encrypted replay envelope, not credential authority. Refresh
replay uses native refresh-family benign-parent behavior and persists no refresh token in SHIFAA.

## R-07 — Dependent identity and clinical continuity

**Decision:** `transitionDependent` requires the authenticated `sub` to equal the existing
`identity.people.user_id` for the guardianship's existing patient/person. It never inserts or rebinds
`identity.people`, `identity.patients`, the medical-record number, or clinical containers. The
existing active self relationship remains the same row. Approval atomically marks the transition case
approved and the prior guardianship revoked; unrelated delegation rows are not inferred or revoked.

**Eligibility mapping:** The date-only birth date becomes eligible when the Africa/Cairo civil date is
on or after `birth_date + 21 years`. Reaching that date does not write state. Age 18 is never a trigger.

**Review:** The same `transitionDependent` operation has closed `submit_proof` and `decide` actions.
Subject submission requires matching identity; decision requires assigned ADM-SUPPORT, AAL2,
`guardianship_review`, qualifying factor AMR ≤300s, separation, `If-Match`, and no unresolved
interdiction/order/dispute.

## R-08 — Recovery and MFA supported primitives

**Decision:** TOTP uses native `enroll`, `challenge`, `verify`, `listFactors`, and `unenroll` through
`packages/auth`. `beginMfaEnrollment` returns a no-store one-time response; `verifyMfaEnrollment`
performs challenge+verify and invalidates other sessions as the provider specifies. Removal re-reads
verified factors and performs an immediate session refresh/current-state reauthorization.

Recovery start uses the supported public flow without account lookup. Completion remains anonymous but
redeems the provider-owned recovery OTP with Supabase `verifyOtp({ email, token, type: 'recovery' })`.
The returned native user-context session supplies the subject and current verified handle; its HMAC must
match the unbound intake before binding. Credential replacement uses that returned user context; global
revocation is followed by ordinary public sign-in with the verified handle and replacement credential.
Repeated identity proofing never permits server-side password/session changes through `service_role`.
Production provider activation remains off.

## R-09 — Exact abuse limits and expiries

**Decision:** Seeded-synthetic policy uses HMAC/digest keys and `429` plus `Retry-After`:

| Operation             | Limit                                                                             |
| --------------------- | --------------------------------------------------------------------------------- |
| refresh               | 12 attempts/native session/5 minutes; provider rotation/reuse rules still control |
| logout                | 10/person/5 minutes                                                               |
| begin enrollment      | 3/person/hour; one pending TOTP/type                                              |
| verify enrollment     | 5 invalid codes/enrollment within its ten-minute lifetime, then expire            |
| remove factor         | 3/person/hour                                                                     |
| start recovery        | 5/handle-HMAC/15 minutes and 20/IP-HMAC/15 minutes                                |
| complete recovery     | 5/case-token-digest/15 minutes                                                    |
| transition submission | 3/person+relationship/24 hours                                                    |
| transition decision   | 30/assigned reviewer/hour                                                         |

MFA pending enrollment and public recovery challenges expire after ten and fifteen minutes
respectively. Transition cases do not auto-transfer or auto-approve; proof expiry is derived from the
referenced verification evidence and evaluated on request.

## R-10 — Deterministic time, availability, and performance

**Decision:** All unit/API tests inject clocks; PostgreSQL helpers accept a transaction-local test
timestamp only in the test harness. CI uses no sleep. Real-stack tests use bounded polling only for
service readiness, never expiry correctness. The approved boundaries are 299/300/301 seconds,
10s/10.001s refresh reuse, ten-/fifteen-minute challenge expiry, 45m/60m idle, and 23h45m/24h absolute.

Load evidence uses 100 concurrent sessions, 5,000 synthetic people/patients, 5,000 native-session
validity checks, 1,000 recovery cases, 1,000 transition cases, and 20 warmed API database connections.
Targets remain read p95 ≤400ms and mutation p95 ≤800ms. `OPEN-TECH-003` still blocks formal device/
accessibility performance claims.

## R-11 — Notification and no-oracle response

**Decision:** `startRecovery` always returns the same `202` schema and queues no account-specific
response fields. Under one warmed synthetic harness, 100 existing and 100 nonexistent attempts must
have p95 latency difference ≤50ms; the body differs only by `X-Request-Id`. Rate-limit and downstream
notification work occurs after the uniform response boundary. Factor/recovery notifications reuse the
005 worker with new allowlisted event/template projections; production SMS remains disabled.

Emergency Contacts never receive session, MFA, recovery, or transition notifications.

## R-12 — Planning conclusion

All pre-plan unknowns are resolved. The approved design adds one application workflow table and no new
operation, role, relationship type, credential store, session authority, production provider, or
Feature-008 surface. At the planning checkpoint this conclusion did not itself authorize implementation.

## R-13 — Recovery re-proof reachability reconciliation

**Decision:** when a bound recovery attempt requires repeated identity proof but has no approved
verification case, `completeRecovery` may return an opaque ten-minute Recovery Proof Grant. The API
stores only its HMAC digest and encrypted resume checkpoint, bound to the recovery case, resolved
person, `account_recovery_reproof` purpose, and the earlier of grant/case expiry. Only the existing
`createIdentityProof` operation accepts it, and only to create one verification case atomically linked
to that recovery case. The grant is not a Supabase token or application session, cannot read profile or
domain data, cannot invoke another mutation, and does not enter the restricted-session allowlist.
Expiry, replay, wrong-person, and wrong-case inputs use the same fail-closed response. The redeemed OTP
resume checkpoint remains encrypted and retryable until final recovery succeeds or the case expires.

This Product Owner reconciliation preserves all four FRs, exactly eight Feature 007 operations, native
Supabase Auth authority, and the Feature 008 exclusion.
