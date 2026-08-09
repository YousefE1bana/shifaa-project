# Identity Onboarding Verification Evidence

**Feature:** `001-identity-onboarding`  
**Evidence date:** 2026-08-09 (Africa/Cairo)  
**Evidence commit:** The implementation commit containing this file; the final SHA and CI run are recorded after push.  
**Engineering status:** Seeded-synthetic implementation complete locally; formal gates remain blocked.

## Executed evidence

| Command or check                                                                             | Result | Evidence                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify`                                                                                | PASS   | Formatting, lint, strict type checking, production builds, unit/integration/accessibility/E2E tests, 16-operation contract parity, architecture boundaries, secret scanning, dependency checks, PostgreSQL 17 migration/schema assertions, and forced-RLS negative tests all exited 0. |
| `pnpm test:performance`                                                                      | PASS   | 100 synthetic sessions; read p95 `34.80681825 ms` against `400 ms`, mutation p95 `89.2201725 ms` against `800 ms`; see `performance.json`.                                                                                                                                             |
| `pnpm sbom:generate`                                                                         | PASS   | CycloneDX SBOM generated at the intentionally ignored CI artifact path `artifacts/sbom.cdx.json`.                                                                                                                                                                                      |
| `docker run --rm -v "${PWD}:/repo" -w /repo rhysd/actionlint:1.7.7 .github/workflows/ci.yml` | PASS   | The pinned actionlint image parsed the GitHub Actions workflow without findings.                                                                                                                                                                                                       |
| `.specify/tests/issue-handoff.Tests.ps1`                                                     | PASS   | Enriched Issue payload cardinality, composite feature/task identity, references, dependencies, evidence, and baseline metadata passed.                                                                                                                                                 |
| PowerShell AST parse                                                                         | PASS   | Every checked-in `.specify/scripts/powershell/*.ps1` file parsed without errors.                                                                                                                                                                                                       |
| `specify workflow info speckit`                                                              | PASS   | Registered SHIFAA workflow `2.2.0` parsed all 13 lifecycle steps on SpecKit `0.16.2.dev0`.                                                                                                                                                                                             |

The generated API client is used by the patient and reviewer feature adapters. The cross-layer E2E test drives registration, OTP verification, profile save, manual-review identity proofing, privacy-notice acknowledgement, and consent through the generated client and Fastify routes in Arabic at 360×800 and English at 1440×900.

## Dependency advisory disposition

`pnpm dependencies:check` passes with exact Expo SDK compatibility and `pnpm audit --audit-level high --ignore-unfixable`. The remaining `image-size` advisories are transitive development-tool dependencies in the Expo/Metro chain and currently have no patched version. They are not suppressed as fixed; the CI command continues to fail on any fixable high-or-critical advisory.

## Deliberately unresolved gates

This evidence does **not** claim `SPEC_APPROVED`, `PLAN_APPROVED`, `DONE`, `RELEASED`, or production readiness. The following canonical items remain visible:

- `OPEN-TEAM-001`: named lifecycle reviewers and approvers are not assigned.
- `OPEN-SEC-001`: production authentication/session policy is not approved.
- `OPEN-UX-001` and `OPEN-UX-002`: composition ownership and the approved visual baseline are absent; no pixel-perfect or native-device visual claim is made.
- `OPEN-LEGAL-001`, `OPEN-LEGAL-002`, and `OPEN-LEGAL-007`: production Egyptian legal interpretation and operating controls remain unresolved.
- `OPEN-VENDOR-001` and `OPEN-VENDOR-002`: production identity and messaging vendor contracts are not active.
- `OPEN-TECH-001`: the scaffold exists, but clean-clone evidence, CI, and Architecture/Platform acceptance remain to be recorded.
- `OPEN-TECH-003`: the native Android SDK/JDK/device and browser validation matrix is not pinned.

Production vendor adapters remain disabled. Demonstration paths use seeded-synthetic inputs only and reject production-mode synthetic configuration.
