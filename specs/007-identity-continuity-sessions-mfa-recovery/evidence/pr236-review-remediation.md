# PR #236 Codex review remediation

Date: 2026-08-30 (Africa/Cairo)

## Disposition

All ten comments on PR head `c74da8c93920088b2d5bebd8ec3bd432d93aa382` were
validated as in-scope defects. None required a ninth operation, new role,
relationship type, Auth-table/service-role path, or Feature-008 ownership.

|   # | Finding                                                                 | Closure evidence                                                                                                                                                                                                                 |
| --: | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   1 | Browser refresh idempotency was scoped to the caller key                | Scope now derives from the actual refresh credential; same-key distinct-cookie and rotated-native regressions pass.                                                                                                              |
|   2 | Factor removal classified mandatory MFA without trusted person context  | The PostgreSQL adapter installs `shifaa.person_id` before the forced-RLS mandatory-MFA function; the native workforce last-factor checkpoint passes.                                                                             |
|   3 | Consumed recovery OTP left failed proof/Auth work non-retryable         | A case-scoped encrypted TTL marker resumes the same immutable case after proof or credential-update failure without a second OTP redemption. Expired markers fail closed; successful finalization deletes the marker atomically. |
|   4 | Browser session establishment omitted refresh/CSRF bootstrap            | Existing OTP verification now returns idempotently encrypted `Set-Cookie` headers containing HttpOnly refresh and readable strict-same-origin CSRF cookies only for same-origin browser requests.                                |
|   5 | MFA verification discarded the elevated Supabase session                | The native adapter, contract, API route, and patient secure-session installer propagate the verified AAL2 session; browser responses rotate the refresh cookie without exposing it in JSON.                                      |
|   6 | Recovery completion exposed success before installing the fresh session | The recovered session is installed in the patient secure-session port before navigation or MFA continuation; browser completion bootstraps cookies and strips the refresh token from JSON.                                       |
|   7 | Admin defer omitted its contracted blocker                              | The bilingual admin transition surface supplies exactly `interdiction`, `court_order`, or `dispute` for defer and omits the field for terminal decisions.                                                                        |
|   8 | Transition idempotency used rotating JWT text                           | The scope now derives from the stable resolved actor-person identity; the JWT-rotation regression passes.                                                                                                                        |
|   9 | Decoy purge skipped elapsed unbound requests                            | Purge first atomically marks elapsed unbound `requested` cases `expired`, then applies the fixed 24-hour deletion rule; schema evidence covers recent and old rows.                                                              |
|  10 | Existing staff step-up boundaries were not mounted                      | Admin, clinic, hospital, lab, and pharmacy layouts now wrap their existing protected surfaces in the shared bilingual fail-closed boundary without adding routes or roles.                                                       |

The guard pass also corrected two defects exposed by these changes: staged
idempotency completion now restores its own RLS principal after domain work changes
transaction context, and persisted response headers are encrypted so browser
refresh/CSRF cookies never appear in plaintext.

## Focused verification

- Recovery policy: 29/29 unit tests, including failed proof, failed credential
  update, single OTP redemption, marker expiry, atomic deletion, and ciphertext-only
  persistence.
- Native recovery: 7/7 integration tests plus the fresh-session/revocation
  checkpoint.
- Browser bootstrap/idempotency: 7/7 real Supabase runtime tests; stored response
  headers are encrypted and replay the same cookies.
- API routes and policy: 109 passed, 37 environment-gated; focused route/policy
  group 52/52.
- Native Auth/session: adapter 5/5; PostgreSQL/session and bilingual revocation
  checkpoints passed; Auth 16/16, contracts 22/22, Core 57/57.
- Native MFA: 7/7 plus three bilingual/workforce step-up checkpoints.
- Transition: 33/33 API/service tests, 20/20 legal vectors, admin 12/12, patient
  27/27.
- Staff UI: admin 12/12, clinic 2/2, hospital 3/3, lab 2/2, pharmacy 2/2.
- Contracts: canonical 80 realized operations match generated clients/routes; the
  canonical active catalog remains 242 and Feature 007 remains exactly eight.
- Clean standalone Compose reset, schema tests, and forced-RLS tests passed.

Full `pnpm verify` passed with exit code 0 after the focused gates. Its fresh
Feature-007 performance evidence measured read p95 40.78 ms and combined mutation
p95 139.71 ms against the unchanged 400/800 ms thresholds. The remediation
commit/push, fresh PR checks, and new-head Codex review are intentionally recorded
only after they run.

## Focused SpecKit analysis

The post-change read-only-first analysis found no remaining CRITICAL/HIGH finding,
canonical contradiction, test weakening, Feature-008 scope, or change to the four
FRs and frozen NFR/acceptance/legal boundaries. The elevated MFA session is a
minimum native-session projection of the existing `verifyMfaEnrollment` operation;
it adds no endpoint or authority source. Production/open gates remain unchanged.
