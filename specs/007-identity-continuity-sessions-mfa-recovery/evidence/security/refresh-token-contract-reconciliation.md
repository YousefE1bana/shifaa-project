# Feature 007 refresh-token contract reconciliation

**Decision date:** 2026-08-26
**Authority:** Yousef Osama, Product Owner
**Scope:** `NativeRefreshRequest.refreshToken` and optional `SessionResult.refreshToken` only

## Evidence and decision

- The pinned local Supabase CLI/Auth stack (`2.113.0`) issued a valid refresh token whose measured
  length was 12 characters. The measurement recorded length only; no token value was written to
  output, logs, evidence, audit, or application persistence.
- Supabase documents a refresh token as a unique string governed by native single-use rotation,
  benign reuse exceptions, and token-family revocation. SHIFAA does not own its format:
  <https://supabase.com/docs/guides/auth/sessions>.
- The former 32-character minimum was an unsupported SHIFAA assumption and is not a security
  property. The Product Owner approved replacing it with a non-empty opaque-string boundary.

## Exact reconciled contract

Both refresh-token fields are `string`, `minLength: 1`, `maxLength: 4096`, and `writeOnly: true`.
Empty strings remain invalid. No access-token, recovery-token, case-token, CSRF, idempotency-key,
credential, secret, QR, or other length constraint changes. Native Supabase Auth remains the sole
rotation, reuse-detection, session, and token-family authority; the eight operations and all FR/NFR
scope remain unchanged.
