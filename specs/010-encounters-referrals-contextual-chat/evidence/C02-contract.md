# C02 — Generated wire contract evidence

**Scope:** T004–T006 (issues #311–#313). The approved OpenAPI 3.1.1 planning contract is the generator source and contains exactly these ten operation IDs: `createEncounter`, `getEncounter`, `updateEncounter`, `signEncounterNote`, `completeEncounter`, `createReferral`, `listReferrals`, `acceptReferral`, `listContextMessages`, and `sendContextMessage`.

## T004 — Red contract test

Before generating the Feature 010 module, the focused test failed because that module did not exist. Vitest reported zero tests because the import could not resolve; it reported no syntax or fixture failures.

Command: `corepack pnpm --filter @shifaa/contracts exec vitest run src/feature-010.test.ts`
Exit code: `1` (expected red result)

```text
 RUN  v4.1.0 D:/ECU/Gradution-Project/.worktrees/010-encounters-referrals-contextual-chat/packages/contracts

 ❯ src/feature-010.test.ts (0 test)

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/feature-010.test.ts [ src/feature-010.test.ts ]
Error: Cannot find module './feature-010.js' imported from D:/ECU/Gradution-Project/.worktrees/010-encounters-referrals-contextual-chat/packages/contracts/src/feature-010.test.ts
 ❯ src/feature-010.test.ts:4:1
      2| import { describe, expect, it } from 'vitest';
      3|
      4| import {
       | ^
      5|   feature010Operations,
      6|   feature010QuerySchemas,

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  no tests
   Start at  20:04:51
   Duration  900ms (transform 187ms, setup 0ms, import 0ms, tests 0ms, environment 0ms)

undefined
D:\ECU\Gradution-Project\.worktrees\010-encounters-referrals-contextual-chat\packages\contracts:
[ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL] Command failed with exit code 1: vitest run src/feature-010.test.ts
```

## T005 — Generated contracts

`node tools/generate-feature-010-contract.mjs` exited `0` and printed `Generated Feature 010 contracts.` It emitted TypeBox schemas and operation metadata from the approved OpenAPI document, and exported the module from the contracts index.

`node tools/generate-feature-010-contract.mjs --check` exited `0` and printed `Feature 010 generated contracts are current.` This confirmed the generated artifact matched a fresh deterministic render.

`corepack pnpm --filter @shifaa/contracts typecheck` exited `0` (`tsc -p tsconfig.json --noEmit`).

The focused contract test then exited `0`: 1 test file passed, 6 tests passed. It checks closed mutation bodies, role projections, RFC 9457 problem constraints, the seven `Idempotency-Key` mutations, the three `If-Match` mutations, and cursor pagination defaults and limits.

## T006 — Contract parity

`corepack pnpm contracts:check` exited `0`.

```text
Contract verification passed: 97 OpenAPI operations match the catalog and generated contracts; implemented clients and routes match where registered.
Test Files  9 passed (9)
Tests  36 passed (36)
Test Files  8 passed (8)
Tests  25 passed (25)
```

Feature 010 contributes exactly its approved ten OpenAPI/catalog/generated-contract operations to parity. C02 added no Feature 010 client or API route; operation registration remains at the contract boundary for this checkpoint.
