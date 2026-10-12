# Feature 011 K22 review evidence

Primary Codex review. Recorded 2026-10-09T14:10:16.641Z. Authorization: “start review and if everything is right go for K22”. K21 T077–T079 accepted after fresh 93/93 regressions, exact source/evidence/screenshot verification and unchanged 133 pins; Issues #474–#476 closed. Acceptance record: [K21 acceptance](../../../decisions/k21-accepted-2026-10-09.md). Historical records remain intact.

K22 T080–T083 verification PASS; Product Owner acceptance pending. T080–T092 remain unchecked; #477–#480 remain open. K23/T084 was not started.

## Results

| Task | PostgreSQL 17.11 | Supabase PostgreSQL 17.6 | Evidence |
| --- | --- | --- | --- |
| T080 | Required runtime checked | Required runtime checked | [composition-harness.json](composition-harness.json) |
| T081 | 252 application checks; 12/12 physical race categories | Same | [all-races.json](all-races.json) |
| T082 | 157 direct-role denials; 45 physical consumer checks; 39 native-auth/API checks | Same | [security-proof.json](security-proof.json) |
| T083 | 66 application boundary faults across five mutations; six shared deferred completeness faults | Same | [atomic-proof.json](atomic-proof.json) |

T080 discovers 29 TypeScript/TSX suites plus five tooling suites. Eight package commands, tooling and native handoff: 1401 passing checks. Existing API package discovery reports 65 conditional skips, preserved from predecessor configuration; no required Feature 011 runtime proof is counted as a skip. Browser patient 38/38 and clinic 49/49 AR/EN checks passed against running applications with synthetic response fixtures. Missing/unhealthy/wrong-version runtimes fail before database proof; expected vectors are not regenerated. Root full verify retains its predecessor command prefix and appends the composition command. Full destructive pnpm verify was not run here; that execution belongs to T091/K24.

T081 re-executes all five native-authorized application suites plus the complete physical race suite using independent sessions, barriers, pg_locks and real authorized predecessor writers. Head/support/key/CAS, allocation, roots/successors, effective time, signing/admission/current authority, original replay, crash/unknown settlement and zero loser effects are bound to fresh logs. Synthetic structural physical fixtures are distinct from real application AES proof.

T082 additionally reruns current physical security, typed evidence producer association, SQL/core/frozen-vector equality, governance disclosure and clinic status suites. FORCE RLS, restricted online/worker/service_role access, revoked PUBLIC execution, fixed-search-path/non-owner executor and native/GUC boundaries remain enforced. Both executor and API superuser/bypass flags remain false. Thirty-five negative native cases span the seven existing operations plus four positive/anti-elevation controls per runtime. Exact material disclosure, private/source/key/plaintext sink negatives and lost replay authority remain covered. This is bounded applicable OWASP L2/L3/API testing, not global certification.

T083 faults actual canonical response serialization and actual local AES creation, in addition to response composition, post-encryption, finalization and before-COMMIT boundaries. Eleven fresh mutations exercise the five operation types. The original K08 crypto/fault suite is also freshly rerun. Shared deferred constraints separately deny missing receipt, incomplete completion, wrong pointer, wrong tuple, wrong audit and wrong outbox at COMMIT after healthy setup. These storage-only fixtures are structural, not real AES proof. Exact original replay and authoritative commit-unknown settlement preserve all-five effects; keys/capabilities finish external preparation before locks, and external network/KMS calls under locks are zero.

## Repairs and attempts

All failed setup/preflight attempts are retained as hashed attempt logs and were excluded from PASS counts. Repairs were limited to test discovery/fixtures/harness: TSX loading with preserved predecessor discovery; initial frozen-ledger scratch normalization while checking current task/map consistency; exact hash-denial diagnostics; CSRF hostname derived from configured baseURL; screenshot output redirected to K22; direct pinned local Supabase CLI status parsing; current accepted completion-prefix preflight in disposable physical copies; current accepted stage and fresh producer hashes in the disposable historical equivalence copy; required governance fixture repository/cursor key; approved original_recorder_person_id column in the native attribution assertion. The equivalence preflight repair reconciles accepted K12/K17 maintenance with an old K08/K09 preflight, not an unexpected normative drift. Pinned vectors, SQL and original reused runtime suite sources remain byte-identical; physical/vector/security/race behavior assertions were retained. No product, migration, schema, privilege, grant, architecture or public contract repair was required.

## Commands

- K21 focused regressions: 93/93 PASS.
- node tools/run-feature-011-composition-test.mjs --units / --browser / --races / --security / --atomic; stopped setup attempts resumed only with fresh prior source/log/pin hashes verified.
- corepack pnpm --filter @shifaa/api typecheck: PASS.
- corepack pnpm secrets:check: PASS.
- corepack pnpm architecture:check: PASS.
- Project-local Prettier and Node syntax checks for the new tooling: PASS.
- Current generated-contract/P1–P5 verifier: PASS; exact 133 pins unchanged. No T029 renewal required.

Execution records include exact commands, input/source/log hashes and output-only/preflight substitutions. [checkpoint-review.json](checkpoint-review.json) binds the four required proofs. [git-status.txt](git-status.txt) captures the existing dirty worktree plus this checkpoint’s changes.

## Changed files and preservation

Changed existing files this run:

- specs/011-allergies-clinical-content-governance/contracts/task-map.json
- specs/011-allergies-clinical-content-governance/tasks.md
- tests/e2e/feature-011-ui.spec.ts
- tests/e2e/feature-011-verification.spec.ts
- tools/feature-011-ledger-contract.test.mjs
- tools/verify-feature-011-scope.test.mjs
- apps/clinic/package.json
- apps/patient/package.json
- package.json
- services/api/test/identity-continuity-mfa-harness.ts

New tooling: tools/run-feature-011-composition-test.mjs, tools/feature-011-composition-playwright.config.ts, tools/feature-011-composition-security.mjs, tools/feature-011-composition-atomic.mjs. New K21 acceptance record/review and K22 evidence/log/browser artifacts. Package tests/full verify discovery are additive. Next-generated type import bytes were restored exactly after the isolated browser run. 4009 preexisting files were preservation-checked; none disappeared. Task definitions/dependencies normalize to the exact approved initial hashes; only K21 completion state changed in this run.

## Review and cleanup

The test-guard second pass checked actual infrastructure, behavior/durable-state assertions, data-driven authentication cases and boundary-only fault injection. The docs-guard pass checked paths, commands, measured counts and claims against current source/evidence. Production code was not changed. Fresh read-only cleanup inspection found none of the 56 temporary database names recorded by the proofs in either healthy runtime. [cleanup-verification.json](cleanup-verification.json) records that inspection. All four task proofs remain green and current.

## Boundaries

Exactly seven operations, four bounded FR targets, 19 NFRs and Feature 012 exclusions retained. All OPEN gates remain unchanged: OPEN-UX-002, OPEN-TECH-002 globally, OPEN-TECH-003, OPEN-CLIN-001 and applicable OPEN-LEGAL gates. OPEN-UX-001 remains limited to the affected Plan prerequisite. Synthetic engineering only; no production KMS, real clinical/source acceptance, final visual approval, production readiness or shippable MVP claim. No subagent/delegate used. No commit, push, PR or main change.

Branch: codex/011-allergies-clinical-content-governance. HEAD and local main: 670b1e0fe15c719b98179805f2628d1b478a55dd. No blocker or unexpected drift remains. Ready for review; awaiting authorization before K23.
