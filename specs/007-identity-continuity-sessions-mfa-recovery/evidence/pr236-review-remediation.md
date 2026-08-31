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

## Round 2 disposition

The fresh Codex review on PR head
`af0a73d8f4cdb1d09b8b77f16b674d868ead8e5b` produced sixteen new comments.
Findings 1 through 15 were validated as in-scope defects and fixed. Finding 16 was
not reproducible as stated: the patient MFA surface already rendered the selectable
TOTP secret through `BidiSafeText`, kept it in LTR isolation, and generated the QR
locally under no-store behavior; focused coverage was strengthened without changing
that production behavior.

|   # | Round 2 finding                            | Closure evidence                                                                                                 |
| --: | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
|   1 | Browser origin topology                    | Browser clients use same-origin URLs, reject cross-origin configuration, and rely only on browser-owned headers. |
|   2 | CSRF cookie path                           | CSRF uses `Path=/`; the HttpOnly refresh cookie remains scoped to `/v1/auth`.                                    |
|   3 | Native OTP refresh credential              | Native OTP returns and installs the provider refresh credential in the secure-storage port.                      |
|   4 | Shared patient session lifecycle           | The root lifecycle uses one token store and reconciles foreground/visibility changes fail-closed.                |
|   5 | Staged native TOTP enrollment              | A pending marker precedes native enrollment; failure cleans both factor and marker or returns fail-closed 503.   |
|   6 | Staff boundary hardcoding                  | The assigned transition workspace derives authorization from the protected read instead of build constants.      |
|   7 | Dead staff step-up event                   | The existing protected authentication/read flow is invoked directly; no custom event remains.                    |
|   8 | Transition rate-limit identity             | Limits are applied after authentication using stable person and relationship identity.                           |
|   9 | Cairo civil leap-day rule                  | A 29 February birth reaches the frozen civil majority boundary on 1 March in a non-leap anniversary year.        |
|  10 | First transition version                   | The patient surface uses the contract's initial continuity version when the existing relationship has none.      |
|  11 | Native actor on existing relationship read | The existing route resolves the native patient session to the stable person principal.                           |
|  12 | Transition reason code                     | Staff step-up uses the stable `human_review.guardianship_transition` code; prose remains separate.               |
|  13 | Transition idempotency expiry              | Expired records are removed for the stable principal and route before a new record is inserted.                  |
|  14 | Recovery-specific proof binding            | Proof must belong to the same current identity and be created no earlier than the same recovery case.            |
|  15 | Worker runtime wiring                      | A local-only, attested, non-owner runner handles retry/order/dedup/DLQ with graceful shutdown.                   |
|  16 | TOTP manual-secret fallback                | Reviewer claim rejected with existing selectable bidi-safe/no-store behavior and strengthened regression proof.  |

No new endpoint, role, relationship type, direct Auth-table/service-role path, or
Feature-008 ownership was added. Feature 007 remains exactly the eight frozen
operations and all 20 legal transition vectors remain accounted for.

## Round 2 verification

- The corrected recovery-proof transition fixture terminally completes its first
  recovery case with `completed_at` before creating the later live case. The
  existing continuity check and partial live-case unique index remain unchanged.
- Transition checkpoint: Core 57/57, API 35/35, admin 12/12, patient 30/30, and
  20/20 frozen legal vectors passed.
- Worker checkpoint: 26/26 unit tests plus 4/4 real recovery, factor, DLQ, and
  transition delivery checks passed after a clean standalone reset.
- Native Auth/session, MFA, recovery, transition, DB/schema/forced-RLS, staff UI,
  build, typecheck, contracts, architecture, secrets, dependencies, and accessibility
  checkpoints passed.
- The first final verification attempt recorded an oracle p95 delta of 50.092 ms
  against the unchanged 50 ms limit and correctly failed. No threshold, test,
  implementation, or Round-2 fix was changed. After an explicitly authorized clean
  runtime restart, the single rerun passed all 7 recovery tests under the unchanged
  oracle limit and full `pnpm verify` exited 0.
- Fresh Feature-007 performance evidence on the reference workstation measured
  read p95 43.74 ms, recovery mutation p95 63.57 ms, transition mutation p95
  160.86 ms, combined mutation p95 152.92 ms, and worker mutation p95 20.61 ms
  against the unchanged 400/800 ms targets. The documented device/network
  limitation and `OPEN-TECH-003` remain unchanged.
- `git diff --check`, clean-code guard, test guard, docs guard, focused SpecKit
  analysis, and an independent read-only Gemini 3.7 Flash High audit found no
  remaining blocking contradiction, test weakening, or scope expansion.
