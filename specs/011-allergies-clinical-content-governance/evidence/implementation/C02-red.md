# C02 RED evidence — T004

Date: 2026-10-06. Checkpoint authorization: C02 only, following Product Owner acceptance of C01.

Before adding the generators, generated artifacts or contract verifier, both focused commands ran against the new tests:

| Command | Result |
| --- | --- |
| `corepack pnpm --filter @shifaa/contracts exec vitest run src/feature-011.test.ts` | Exit 1; 20 tests failed |
| `corepack pnpm --filter @shifaa/api-client exec vitest run src/feature-011.test.ts` | Exit 1; 3 tests failed |

Vitest 4.1.0 collected and executed all 23 cases. Explicit assertions failed because the generated wire schemas, generated client and verifier did not exist. There was no unresolved test import or syntax failure. The tests cover the seven bindings, closed known/unknown payloads, three projections, headers, opaque cursors, canonical errors, generation freshness and fail-closed evidence validation.

Fixtures are synthetic opaque values and isolated filesystem copies under the worktree's ignored artifacts directory. Client calls use mocked fetch; they do not establish API authorization, database RLS or transaction behavior. No runtime, migration or C03 task was executed. Full OPEN-TECH-002 evidence remains pending.
