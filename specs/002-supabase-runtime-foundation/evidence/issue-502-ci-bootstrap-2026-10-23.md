# Issue #502: CI pnpm bootstrap correction

Additive investigation following Draft [PR #506](https://github.com/YousefE1bana/shifaa-project/pull/506), published head `bc08d62a02b2194499674ac64982c005e8227788`. Client date: 23 October 2026, Africa/Cairo; retained execution receipts use actual UTC. No historical receipt is replaced.

## Confirmed cause

The hosted installer warning was separate from the two project dependency findings. The pinned `pnpm/action-setup` v6.0.9 commit `0ebf47130e4866e96fce0953f49152a61190b271` first runs `npm ci` with its embedded pnpm **11.7.0** lockfile, then self-updates to requested workspace pnpm **11.13.1**. Auditing only workspace pnpm 11.13.1 could not reproduce that bootstrap warning.

A read-only `npm audit --package-lock-only --ignore-scripts --json` against a private copy of the exact upstream bootstrap lockfile reproduced **one HIGH package finding, exit 1**. Its advisory records include GHSA-c59q-g84q-2gj5, GHSA-vq4v-j7r6-jq4m, GHSA-qrv3-253h-g69c and GHSA-vx52-2968-3vc6. This establishes the vulnerable bootstrap dependency and reproduces the warning count; no exploitation of the hosted job is claimed.

## Minimal correction

All six CI jobs now pin released [action v6.0.10](https://github.com/pnpm/action-setup/releases/tag/v6.0.10), exact commit `0977fd99725f1db4007ccb2928dbb4e90d06cc86`. Its normal and standalone bootstrap locks use pnpm **11.19.0**. Upstream installer `run.ts` is byte-identical to the former pin; the distributed bundle includes 11.19.0 and no 11.7.0. The release also changes the action's own cache restore-key handling; SHIFAA leaves that action cache disabled and continues using `actions/setup-node` caching. MIT licensing and the complete five-commit upstream comparison were inspected and retained.

Workspace pnpm remains **11.13.1**, explicitly requested in every job. The package manifests, lockfile, security threshold, audit assertions, original 42-command verification string and Compose reset are unchanged. No dependency installation or downloaded action execution was performed during these probes.

The physical-preflight historical reader initially rejected this new workflow digest (two failures, one pass). Its current workflow binding now admits only SHA-256 `fd78bd9143813c864b990ba6789eb2ae4478b348a7c7c17ba2f9162897b44c05`. The original historical blob and digest remain unchanged. Its existing regression normalizes only the exact reviewed action replacement in addition to the previously enumerated runtime pins, still compares the entire workflow with the historical input, and still rejects unrelated byte drift. No wildcard binding or frozen-evidence rewrite is introduced.

## Validation and limits

- Exact original normal bootstrap lock: audit exit 1, one HIGH package finding.
- Exact replacement normal bootstrap lock: audit exit 0, zero findings.
- Both original and replacement standalone bootstrap locks: audit exit 0, zero findings. The registry's lack of a standalone advisory is not proof that the old bundled executable is safe.
- All four audits preserved their input package/lock hashes. They query registry advisory data; they are not action runtime execution or project acceptance.
- Focused workflow validation parses all six jobs, checks their requested pnpm and install settings, proves the complete workflow delta is exactly six action pins, and compares verification/Compose against merged main. It also verifies unchanged workspace package/lock files, upstream installer bytes and distributed bootstrap content.
- Working-source physical-preflight regressions passed 3/3, exit 0 in 1.78 seconds; CURRENT passed, exit 0 in 5.83 seconds; formatting passed, exit 0 in 0.77 seconds. These receipts explicitly record the modified working source above `bc08d62a`; the final receipt separately identifies validation on the committed successor.
- The first private validation probe incorrectly expected licensing in upstream `package.json`; the license is in `LICENSE.md`. A subsequent failed retrieval and missing-script invocation, plus a Windows console encoding error, are retained as operator/probe errors. The corrected probe passed without changing the CI correction or weakening a project assertion.

Full source copies, audit outputs, input hashes, comparison, command logs and true exit receipts are retained under private evidence root `D:\ECU\GP-STUFF\SHIFAA-Issue-502-Remediation-20261022`, using the `followup-` prefix. `followup-final-receipt.json` records the committed source, focused checks and preservation readback. Earlier manifests and full hosted log remain intact.

This is a **local candidate correction**. The Product Owner's previous exception authorized Draft publication of exact `bc08d62a`, not this successor. No new publication, current-head hosted CI, full aggregate PASS or human language acceptance is claimed. The existing hosted result remains **5/6 PASS** on `bc08d62a`.

## Remaining blockers

Project dependency advisories **GHSA-86w9-cpqp-85rv** (node-forge) and **GHSA-vfj7-8cjw-p6xm** (braces) remain open. Registry readback found latest `@expo/cli` 58.1.14 and `@expo/code-signing-certificates` 0.0.7 still depend on node-forge `^1.4.0`; micromatch 4.0.8 still depends on braces `^3.0.3`. No fixed leaf release or parent upgrade removing those paths was established. An unrelated Expo major upgrade would not remove the demonstrated Forge path.

Existing Supabase wildcard bindings and unsupported bridge containment remain unresolved. No live cutover, Firewall change, Docker mutation, evidence cleanup, full verification rerun, merge, issue closure or F012 lifecycle is performed. Security remediation, safe aggregate verification or an attributable bounded disposition, PR-specific human acceptance, publication authorization, fresh CI and Yousef's human squash merge remain distinct gates.
