# Feature 011 C03 prerequisite blocker

Date: 2026-10-06 (Africa/Cairo). Status: **C03_BLOCKED**. No C03 task is complete. This record does not change the approved Spec, Plan, contracts, task ledger or Product Owner decisions.

## Missing artifact byte contract before physical preparation

The approved [governance boundary](../../contracts/governance-boundaries.md) requires:

> Compute SHA-256 from a versioned canonical artifact envelope including series identity, source, effective instant, predecessor/initial marker, content and code/test-vector evidence digests. Field-order/encoding rules are part of generated contract parity, not medical content. Caller-declared digest must match server computation.

The [data model](../../data-model.md) makes that digest immutable at draft creation; signatures bind it and artifact_version, independently of workflow_version. T012 prepares the draft function, T013/T014 consume its exact binding, and T016 must prove the resulting physical/runtime parity before T017. These are obligations within C03, not deferred API exposure.

Current inspected artifacts specify which facts are bound and the SHA-256 algorithm, but do not specify the canonical envelope version/byte representation, field ordering, UTC instant normalization or fixed expected-digest vectors. The OpenAPI Artifact schema contains evidence references and an optional declaredDigest; its request/response shapes do not define that encoding. The C02 schema/client generators generate those shapes. Their current tests check digest shape and artifact/workflow separation, without an artifact encoder or expected canonical-byte vectors.

The private canonical helper in tools/verify-feature-011-contracts.mjs compares evidence/catalog JSON. It is not an artifact envelope encoder and is not exported or specified as the signing-byte contract. Reusing it would silently choose artifact semantics outside its documented purpose.

The exact encoder tests, implementation and digest-equivalence evidence are assigned to **C13/T045–T047** in both tasks.md and contracts/task-map.json. They have not been executed and are outside this run's authorization. No implementation of packages/core/src/feature-011/content-artifact.ts exists. The current ledger does not supply an earlier byte-contract producer for C03.

Without that contract, implementing a local SQL encoding now would choose an unrecorded immutable signing protocol. Later implementing the separate C13 policy could produce different hashes for the same facts (for example, different representations of one effective instant or different envelope field orders). Merely checking a 64-character digest, or trusting a caller-declared digest, would not satisfy server computation and exact-artifact parity. A fail-closed placeholder would also not satisfy T016's required operation GREEN.

Under the Product Owner instruction to preserve the frozen contract/Plan and stop rather than expand scope, preparation stopped before T009 DDL. No canonical encoder, additional generated export, contract amendment or C13 implementation was introduced.

## Reconciliation needed to resume

Provide the versioned canonical artifact byte contract and neutral expected-byte/digest vectors before T012 consumes them, with explicit task ownership for that prerequisite. Bind the eventual C13 policy to the same contract. This is an engineering contract/sequencing reconciliation; it requires no new operation, medical rule, authority, route, NFR or gate closure.

Once authorized, finish T008's fixture/negative/race matrix, capture RED for the finalized vectors, and execute T009–T016 in order. The current draft fixture/response/race limitations listed in [C03-red.md](C03-red.md) must also be corrected; they are not separate baseline blockers.

## Current disposition

- T008: partial test/harness drafts; 16 missing-DDL RED results and two concurrency-entrypoint RED probes across both real database runtimes. No operation/race GREEN.
- T009–T016: not started; no Feature 011 migration, policy, executor or physical function implementation.
- T017: explicitly excluded, not run, still dependency-blocked on T016.
- C02 contracts-only verifier and both generator --check commands: PASS; physical parity remains PENDING and affected consumers remain blocked.
- OPEN-TECH-002: retained, open, fail-closed. No physical parity or stage acceptance claimed. OPEN-CLIN-001 and the other retained gates are not treated as defects or closed.
- Exactly 19 NFRs/seven operations, Feature 010 context dependency, both API reconciliations, approved UX references, synthetic-only constraints and Feature 012 exclusions remain unchanged.
- No task status, lifecycle approval, application/API/UI source, main, commit, push or PR changed.

The detailed commands, runtime versions, preserved source state and evidence limits are in [C03-red.md](C03-red.md).
