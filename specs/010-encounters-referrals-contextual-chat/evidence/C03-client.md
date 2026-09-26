# C03 — Generated client and native session boundary

Date: 2026-09-26
Scope: T007–T009, Issues #314–#316
Mode: synthetic contract-only client; no Feature 010 backend route is asserted or required.

## T007 — Focused RED

The focused test was added before the Feature 010 client. The exact command and failing output show the suite stopped only because the client module did not yet exist.

Command:

```text
corepack pnpm --filter @shifaa/api-client exec vitest run src/feature-010.test.ts
```

Exit code: `1`

Output:

```text

 RUN  v4.1.0 D:/ECU/Gradution-Project/.worktrees/010-encounters-referrals-contextual-chat/packages/api-client

 ❯ src/feature-010.test.ts (0 test)

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/feature-010.test.ts [ src/feature-010.test.ts ]
Error: Cannot find module './feature-010.js' imported from D:/ECU/Gradution-Project/.worktrees/010-encounters-referrals-contextual-chat/packages/api-client/src/feature-010.test.ts
 ❯ src/feature-010.test.ts:5:1
      3| import { describe, expect, it, vi } from 'vitest';
      4|
      5| import {
       | ^
      6|   Feature010ApiError,
      7|   Feature010Client,

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  no tests
   Start at  20:26:59
   Duration  245ms (transform 42ms, setup 0ms, import 0ms, tests 0ms, environment 0ms)

undefined
D:\ECU\Gradution-Project\.worktrees\010-encounters-referrals-contextual-chat\packages\api-client:
[ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL] Command failed with exit code 1: vitest run src/feature-010.test.ts
```

## T008 — OpenAPI-generated client

`packages/api-client/src/feature-010.ts` is generated from the approved OpenAPI 3.1.1 file by `tools/generate-feature-010-client.mjs`. The generator validates the ten approved operation IDs, derives paths, request/response types, parameters, and headers from the YAML, formats the result, and supports a byte-for-byte `--check` mode. The package root and `./feature-010` export the generated client.

The client reads the current bearer token through an access-token callback on each request. The server derives actor identity and authority from that session; the client exposes no actor-ID argument. Requests use the approved locale and request-ID headers, and only operations declaring `Idempotency-Key` or `If-Match` accept those options. Compile-time assertions and request inspection show reads do not accept or send mutation headers. All requests use `cache: 'no-store'`. Responses fail closed unless `Cache-Control` includes both `private` and `no-store`. RFC 9457 problem bodies for 401, 403, 409, and 422 remain available on `Feature010ApiError`. The client calls only `/v1` API paths and includes no Supabase or PostgREST clinical write path.

Generated operation inventory:

```text
createEncounter
getEncounter
updateEncounter
signEncounterNote
completeEncounter
createReferral
listReferrals
acceptReferral
listContextMessages
sendContextMessage
```

Generation command:

```text
corepack pnpm --filter @shifaa/api-client generate:feature-010
```

Output:

```text
$ node ../../tools/generate-feature-010-client.mjs
Generated Feature 010 API client.
```

## T009 — Focused verification

Generator check command:

```text
corepack pnpm --filter @shifaa/api-client generate:feature-010:check
```

Output:

```text
$ node ../../tools/generate-feature-010-client.mjs --check
Feature 010 generated client is current.
```

Focused client tests:

```text
corepack pnpm --filter @shifaa/api-client exec vitest run src/feature-010.test.ts
```

Result: exit code `0`; 1 test file passed, 10 tests passed.

Typecheck:

```text
corepack pnpm --filter @shifaa/api-client typecheck
```

Result: exit code `0`; `tsc -p tsconfig.json --noEmit` passed.

Contract and client tests:

```text
corepack pnpm contracts:check
```

Result: exit code `0`; verification matched 97 OpenAPI operations, including the Feature 010 client marker and exact ten-operation inventory. Contract tests passed (9 files, 36 tests); API client tests passed (9 files, 35 tests).

The generated client and contract checks establish only a stable typed client boundary. They do not establish backend route, database, RLS, or production readiness.
