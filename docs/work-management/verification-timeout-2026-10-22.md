# Issue #504 verification follow-up — 2026-10-22

This additive record follows the [original failed acceptance](maintenance-2026-10-21.md). It preserves that failure and the completed storage cleanup. It does not authorize publication or claim full acceptance before execution.

## Diagnosis and correction

On `9c7391d912f20edd7cf7cb2faf45089511570cb6`, command 7 (`pnpm test`) exceeded the existing 5000 ms budget in the F011 API-client canonicalization metadata test. No assertion mismatch was reported. The test dynamically imported the contracts graph inside its timed assertion body.

The effective installed Vitest configuration loads the root configuration: two workers, fork pool, 5000 ms test timeout. An instrumented uncached root `pnpm test` executed all 21 Turbo tasks successfully in 34.34 seconds, with zero cached tasks. Contracts preparation consumed approximately 241 ms in that run. Sampling observed up to 48 descendant Node processes and at least 3.85 GB available physical memory. These measurements do not establish the resource conditions of the earlier failure.

A controlled Vite load hook delayed only first preparation of `packages/contracts/src/feature-011.ts` by 5250 ms. The original test reproduced the same timeout: three tests passed, the metadata test failed after 5007 ms, native exit 1. Preparing that same dependency during test-file collection passed all four unchanged tests under the same injected delay, native exit 0. Collection still took approximately 5.43 seconds; the test phase took 47 ms. This diagnostic injection is not an application-performance acceptance result.

Commit `b3c6bb9d35353fa83522618eb16f9d35b898718e` replaces the dynamic absolute-file import with the existing package export `@shifaa/contracts/feature-011` at collection. The export resolves to the same contracts source. All four tests and all 19 `expect` expressions remain unchanged. Generated clients, contracts, fixed vectors, timeouts, worker configuration and assertions are unchanged. The correction removes unrelated module preparation from the semantic assertion budget. The specific historical scheduler, I/O or resource-pressure trigger remains unproven because the original aggregate has no process samples.

Two real uncached root `pnpm test` runs on this correction passed all 21 Turbo tasks, with zero cache hits, in **30.65 and 31.75 seconds**, exit 0 both times. F011 passed 4/4 in **108 and 111 ms**. The first run had clean source; only the metadata audit CSV was modified during the second. Test source bytes were identical. API-client typecheck and focused formatting also passed. Detailed commands, configurations, logs, sample data, source hashes and diagnostic scripts are bound from the [owning evidence index](../../specs/001-identity-onboarding/evidence/work-management-validation-2026-10-22.json), with an additive [F011 reference](../../specs/011-allergies-clinical-content-governance/evidence/work-management-validation-2026-10-22.json).

## Representative classification review

Thirty records were sampled across all five assigned types, 20 Issues and 10 PRs, 26 historical closed and four open records, two duplicates and linked feature/task sources. Fifteen sampled rows shared the common task rationale. All 30 original body hashes matched; sampled task definitions and PR inventories supported their type classifications. No systematic type error was demonstrated, and high confidence was retained where supported.

Issue #78 omitted `area:documentation`: its pinned F004 T001 definition and acceptance explicitly require a pre-implementation analysis document and immutable evidence baseline. That label was added and independently read back; the CSV records the correction. Its type, confidence, body and closed state were preserved. The original CSV is retained by hash. PR #498's historical heading names an approved “P0 resource guards” scope within a mixed-scope PR; it does not unambiguously assign the PR's work-priority field. No retrospective priority was invented. The review and before/after mutation receipt are bound in the evidence index.

## Full acceptance and integration

The original literal 42-command `pnpm verify`, including its authorized synthetic local database reset, remains the acceptance baseline. Family/Privacy E2E remain separately callable and are not part of those 42 commands. No launcher was reintroduced. The final committed source is to be tested with complete native-process logging at `D:\ECU\GP-STUFF\SHIFAA-Work-Management-20261021\acceptance-20261022`; the execution, per-command and integrity receipts there establish the actual result. This pre-execution record does not claim a PASS.

Existing storage manifests, hardlinked evidence paths, backup hashes and recovery limitations remain authoritative. Validation adds evidence; it does not repeat cleanup or improve prior recovery claims. Generated historical-file drift must be retained separately before exact restoration from tested Git blobs.

The branch remains unpublished and stacked above Draft PR #503. Human live Arabic/English acceptance, publication, fresh required CI and Yousef Osama's human squash merge remain mandatory. First integrate #503 through its own gates; then reconcile only the follow-on commits onto the squash-merged main, verify the resulting source and rerun applicable acceptance before publication/integration. Do not merge the old maintenance base a second time or drop the follow-on work. No integration action is performed by this record. Issue #493 remains OPEN; F012 and team onboarding remain untouched.
