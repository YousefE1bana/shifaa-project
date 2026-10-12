# C02A test-first RED evidence

Recorded before T091 implementation on 2026-10-06. Only T090–T092 are authorized.

## Approved immutable inputs

Product Owner + Architecture Lead approved SHIFAA-F011-ARTIFACT/1 and these exact hashes in this conversation. Historical PROPOSED/NOT_IMPLEMENTED labels in the frozen files describe their original capture; this dated evidence records subsequent approval without changing the approved bytes.

- `specs/011-allergies-clinical-content-governance/contracts/artifact-canonicalization-v1.md`: `f131fefe06a21ceac85b77349193c8c40b7965b8ef79dc6248b35e78144751a9`
- `specs/011-allergies-clinical-content-governance/contracts/artifact-canonicalization-v1.json`: `88fc3961c18b868d38fda8b8f0d93c49e3cc8ccba64de4a63b66a2081c7f52f2`
- `specs/011-allergies-clinical-content-governance/contracts/artifact-canonicalization-v1-vectors.json`: `7b0a99e183aba2d6e60f2effc7821124a8460b53f67c55c9466cdfddd5ec8133`
- `specs/011-allergies-clinical-content-governance/contracts/artifact-canonicalization-parity-v1.json`: `b382986544a607a930197d107d114ff5256486b1227a38c0e584ee544a0ec523`

The positive bytes/digests, 14-field order, framing and ordinal-8 predecessor UUID exception are frozen. No current release UUID or physical/database series UUID is included. No encoder or normalization implementation is authorized here.

## Command and observed results

`corepack pnpm exec vitest run packages/contracts/src/feature-011.test.ts packages/api-client/src/feature-011.test.ts --reporter=verbose`

- Before new tests: exit 0; 27 legacy tests passed in 2 files.
- After T090 test additions, before generator/verifier changes: exit 1; 44 tests total, 16 failed / 28 passed. Sixteen intended failures expose missing metadata exports/bindings, acceptance of missing or altered canonical inputs, stale-output enforcement and missing physical canonicalization assertion enforcement. The additional source-digest negative already fails closed, hence passes. No syntax or fixture setup failure is used as RED evidence.
- Disposable invalid physical bundles are synthetic negative-test fixtures, not executed database evidence.

## Evidence hashes at RED

- `artifacts/feature-011/c02a-legacy-before.log`: `afafe7abed0f1fa0efa383966eb4b9ec04923358e41624601d61af383485ec35`
- `artifacts/feature-011/c02a-red.log`: `8d2f9cd2e8dbac5a09f4ff080a43c235e0d3d26940acd77b334905ad5cdfccd6`
- `packages/contracts/src/feature-011.test.ts`: `48c8a9b086fa4bcedafb59d5642f8b86d426078b1837f89085fda711925fc774`
- `packages/api-client/src/feature-011.test.ts`: `6f908e234bd1d94716e47006fa693db33346143f12ccd7e5c90b01bed325df77`

## Boundary

Legacy wire-shape parity is established before changes. C03/T008 is not executed in this C02A pass; physical parity remains pending; OPEN-TECH-002 stays OPEN. Green canonical metadata preparation will not establish physical SQL/core equivalence or authorize affected consumers.
