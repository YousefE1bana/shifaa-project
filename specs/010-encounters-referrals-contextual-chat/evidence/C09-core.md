# C09 pure encounter policy evidence

Date: 2026-09-29. Checkpoint: T025–T027 / issues #332–#334. Inputs are synthetic.

## T025 RED

The policy test was added before its module. `pnpm --filter @shifaa/core exec vitest run src/feature-010/encounter-policy.test.ts` failed on the missing `./encounter-policy.js` import. The test file parsed and the failure was the absent C09 policy implementation, rather than a fixture or syntax error.

## T026 boundary

`encounter-policy.ts` exports deterministic, IO-free decisions for the sole `checked_in`/`called` opening transition and one responsible interval, optional clinical references, the structural completion triple, and authorized signed-note visibility and same-encounter supersession. Reference ownership, current authority, locks, and persistence remain with the later API/database boundary. No C10 route or storage code was added.

## T027 focused verification and root review

```text
corepack pnpm --filter @shifaa/core exec vitest run src/feature-010/encounter-policy.test.ts   exit 0; 8/8 tests
corepack pnpm --filter @shifaa/core typecheck                                          exit 0
corepack pnpm architecture:check                                                      exit 0; 18 boundaries, 17 manifests
corepack pnpm exec prettier --check packages/core/src/feature-010/encounter-policy.ts packages/core/src/feature-010/encounter-policy.test.ts packages/core/src/index.ts   exit 0
git diff --check                                                                     exit 0
```

The delegate also ran the complete `@shifaa/core` test package with 151 passing tests. Root reviewed the policy and tests, requested explicit original-author supersession and invalid-reference negatives, and verified the amended focused run. The diff contains only the new pure policy/test, its core export, this evidence, and T025–T027 ledger completion. Approved specification, plan, contracts, baselines, later gates, and C10+ implementation remain unchanged.
