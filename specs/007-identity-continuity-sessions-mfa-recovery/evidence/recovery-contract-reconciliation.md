# Recovery contract reconciliation

**Authority:** Product Owner approval recorded in the 2026-08-26 Feature 007 recovery-resumption instruction.

## Decision

`startRecovery` remains anonymous and non-oracular. It creates an unbound recovery-intake case with
only an HMAC digest of the normalized handle; it must not perform an Auth, admin, or service-role
account lookup.

`completeRecovery` remains anonymous at the HTTP transport boundary. It presents the provider-owned
recovery OTP with the normalized handle, case token, proof, and new credential. The Core API redeems
that OTP through Supabase `verifyOtp({ email, token, type: 'recovery' })`, derives the resulting native
subject, and compares the normalized-handle HMAC with the intake before binding the case. A mismatch
fails closed.

Credential replacement uses the recovery OTP verification session returned by Supabase. The API then
globally revokes the prior native sessions and obtains the response session only through the ordinary
public Supabase sign-in boundary using the verified handle and replacement credential. No service-role
or direct Auth-table mutation is permitted.

Lost-factor recovery binds that fresh native session only as the existing deny-only
`mfa_enrollment_only` restriction. The frozen allowlist remains exactly `refreshSession`, `logout`,
`beginMfaEnrollment`, and `verifyMfaEnrollment`.

## Boundary check

- Four Feature 007 FRs remain unchanged.
- The existing eight operations remain unchanged; only `completeRecovery` authentication semantics
  are reconciled.
- `identity.continuity_cases` remains workflow evidence, not credential, factor, or session authority.
- Feature 008 is out of scope.

## Supersession

The earlier bearer-required completion wording is superseded. Supabase `PASSWORD_RECOVERY` is a client
SDK event rather than server-verifiable bearer state, so the provider-owned recovery OTP is now the
sole server-side recovery-ownership proof. No client event, URL flag, or application-created recovery
flag is trusted.
