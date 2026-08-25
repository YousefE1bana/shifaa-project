# Feature 007 pinned Supabase Auth compatibility

> **Observed:** 2026-08-25
>
> **Command:** `node tools/verify-identity-continuity-auth.mjs`
>
> **Result:** `PASS`

## Pinned runtime

| Component                                    | Verified version/value         |
| -------------------------------------------- | ------------------------------ |
| Supabase CLI package and running local stack | `2.113.0`                      |
| `@supabase/supabase-js`                      | `2.112.2`                      |
| Access JWT                                   | `900` seconds                  |
| Session timebox / inactivity                 | `23h45m` / `45m`               |
| Refresh rotation / reuse interval            | enabled / `10` seconds         |
| TOTP enroll / verify                         | enabled / enabled              |
| Phone MFA / passkey / WebAuthn               | disabled / disabled / disabled |

The local Auth stack started successfully with this exact configuration. The probe queried schema
metadata only and confirmed the pinned `auth.sessions`, `auth.refresh_tokens`, `auth.mfa_factors`, and
`auth.mfa_challenges` resources and the minimum columns required by the approved plan.

## Supported public and user-context primitives

The pinned JavaScript client exposes `refreshSession`, `signOut`, `resetPasswordForEmail`,
`updateUser`, MFA `listFactors`, `enroll`, `challenge`, `verify`, `unenroll`, and
`getAuthenticatorAssuranceLevel`. This is compatibility evidence, not authorization to use a generic
admin client, service role, or direct Auth-table mutation.

Official Supabase session documentation confirms the `session_id` claim/native session-row
correlation, timeout-on-refresh behavior, one-use refresh rotation with documented reuse exceptions,
and whole-session revocation outside those exceptions. Official MFA documentation confirms native
TOTP enroll/challenge/verify/list/unenroll and AAL behavior:

- <https://supabase.com/docs/guides/auth/sessions>
- <https://supabase.com/docs/guides/auth/auth-mfa>
- <https://supabase.com/docs/guides/auth/auth-mfa/totp>

## Frozen boundary result

- Native Supabase Auth remains authoritative for sessions, refresh families, factors, challenges,
  AAL, and AMR.
- Feature 007 adds no shadow session/factor/credential authority and performs no direct Auth mutation.
- The planned cross-schema boundary may return only current-session boolean evidence to the non-owner
  API role.
- Repeated total-loss recovery still must stop if the implemented public/user-context primitive cannot
  satisfy every frozen vector; production identity/SMS/passkey providers remain disabled.
