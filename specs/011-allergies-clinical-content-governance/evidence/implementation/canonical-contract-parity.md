# C02A canonical contract/generated metadata parity

Date: 2026-10-06 (Africa/Cairo). **C02A_ACCEPTED — engineering criteria met; awaiting Product Owner / Architecture checkpoint review.** Only T090, T091 and T092 executed in this pass. No C03/T008, T017 or C13 implementation was executed.

## Approval and immutable inputs

Product Owner + Architecture Lead approved `SHIFAA-F011-ARTIFACT/1` and the four exact hashes in this conversation, then authorized only C02A. All approved files remain byte-identical. Their historical proposal/extension-state labels are frozen capture metadata; this evidence records the subsequent approval and execution disposition.

- `specs/011-allergies-clinical-content-governance/contracts/artifact-canonicalization-v1.md`: `f131fefe06a21ceac85b77349193c8c40b7965b8ef79dc6248b35e78144751a9`
- `specs/011-allergies-clinical-content-governance/contracts/artifact-canonicalization-v1.json`: `88fc3961c18b868d38fda8b8f0d93c49e3cc8ccba64de4a63b66a2081c7f52f2`
- `specs/011-allergies-clinical-content-governance/contracts/artifact-canonicalization-v1-vectors.json`: `7b0a99e183aba2d6e60f2effc7821124a8460b53f67c55c9466cdfddd5ec8133`
- `specs/011-allergies-clinical-content-governance/contracts/artifact-canonicalization-parity-v1.json`: `b382986544a607a930197d107d114ff5256486b1227a38c0e584ee544a0ec523`

All seven positive vectors (V01–V07), their facts, exact canonical UTF-8/hex bytes and expected SHA-256 values are unchanged; all 25 negative vectors are unchanged. Validation reads the fixed bytes and checks framing, fourteen fields, UTF-8 octet lengths, material digests and envelope digest without serializing input facts or generating expected outputs. Ordinal 8 is the canonical predecessor release UUID for successors and `N,` for initials. The current release UUID and any physical/database series UUID remain excluded. No medical policy, canonicalization encoder or normalization function was implemented or generated.

## T090 — RED

See [pre-implementation RED](C02A-red.md). Legacy C02: 27/27 passed, exit 0. After new tests, before T091: 16 intended failures / 28 passes (44 total), exit 1. Fixed expectations are the independently approved inputs, not derived from an implementation under test.

## T091 — GREEN

44/44 focused tests pass (2 files, exit 0), including all 27 legacy C02 tests. The generators reject each missing input, altered normative wording/profile/ordinal-8 binding, vector bytes or digest, registry hash, and malformed profile. The verifier rejects stale metadata in either generated module. Full-mode negative fixtures prove missing canonicalization runtime coverage and stale canonical-input digests cannot pass. Those deliberately invalid evidence fixtures are not real database runs.

Both modules export the same data-only `feature011ArtifactCanonicalizationMetadata` with exactly `contractId`, `normativeInputDigests` (three approved text/profile/vector hashes keyed by repository-relative path), and `parityRegistrySha256` (approved registry hash). No executable artifact encoder export is generated. The verifier includes all four immutable canonical files in preparation `inputDigests` and the required full physical `sourceDigests`; `artifact-canonicalization-v1` is required in each runtime assertion set.

Removing only that generated metadata declaration yields each original C02 generated file SHA-256 exactly. Therefore every schema, method, path, header, client transport body and existing generated declaration remains byte-identical. The OpenAPI/scope/catalog reconciliation inputs are unchanged in this pass.

## T092 — reproducibility and verification

Commands run from the Feature 011 worktree:

- `corepack pnpm exec vitest run packages/contracts/src/feature-011.test.ts packages/api-client/src/feature-011.test.ts --reporter=verbose` — baseline, RED and final GREEN recorded above.
- `node tools/generate-feature-011-contract.mjs` and `node tools/generate-feature-011-client.mjs` — initial metadata generation, then two repeated rounds.
- `node tools/generate-feature-011-contract.mjs --check` and `node tools/generate-feature-011-client.mjs --check` — both passed in each repeated round.
- Each repeat compared exact output hashes before/after: **zero changed bytes**.
- `node tools/verify-feature-011-contracts.mjs --contracts-only` — exit 0 / PASS, no failures, physicalParity=PENDING, affectedConsumersAllowed=false.
- `node tools/verify-feature-011-contracts.mjs` — exit 1 / FAIL solely on absent `evidence/implementation/physical-parity.json`; physicalParity=PENDING, affectedConsumersAllowed=false. This expected block is not converted into a full-verification pass.
- `corepack pnpm --filter @shifaa/contracts typecheck` and `corepack pnpm --filter @shifaa/api-client typecheck` — both passed. The review corrected the new client test cross-package import boundary after an initial TS6059 failure; no package/compiler configuration was changed.
- Focused task-ledger consistency validation — 606 assertions passed; 92 tasks / 28 checkpoints, 10 complete / 82 pending. Only T090–T092 were newly checked. Scope, ordering, task definitions, AC-01–AC-16 and retained gates remain unchanged.
- `git diff --check` — passed.
- `corepack pnpm exec prettier --check` on the seven changed generator/verifier/generated/test files — passed.
- Final preservation check over 3,418 snapshotted files — passed: exactly nine allowed existing files changed, plus the two new review evidence files. All approved canonical inputs, C03 drafts, historical migrations and `.specify/feature.json` are unchanged; staging is empty. See `artifacts/feature-011/c02a-final-preservation.json`.

Generated output SHA-256:

| File | SHA-256 |
| --- | --- |
| `packages/contracts/src/feature-011.ts` | `268790dd2f3dd2dfe7c0e6c63a189b8daffe8c8f17e223e7de5bdbbe15507162` |
| `packages/api-client/src/feature-011.ts` | `0dcbe39619ed2e87fd78fd89b8d2364be91d92e56ee186d778b3c4e50c564467` |

## OPEN-TECH-002 and next dependency

**OPEN-TECH-002 remains OPEN.** C02/C02A contract/generated-client preparation is current and complete. C03 must still produce the approved seven-migration physical schema/RLS/function/grant chain and digest-bound evidence from both `shifaa-local-postgres` and `shifaa-local-supabase`, including online/non-owner/NOBYPASSRLS enforcement, ENABLE + FORCE RLS, signatures/qualification/authority-loss and publication/supersession/future-effective concurrency, lock/version/idempotency invariants, and real SQL matching approved v1 fixed vectors/negatives. Runtime evidence must include `artifact-canonicalization-v1` and current input/tool/output/migration digests. T017 must then assert the complete current bundle plus applicable owner/stage disposition before affected consumers proceed. Later C13/T045–T047 implements the core encoder against the same fixed contract/vectors and proves SQL/core equivalence; C02A does not claim that proof.

C03/T008 is dependency-unblocked at the contract producer boundary. Resumption still requires Product Owner / Architecture checkpoint review and explicit next-checkpoint authorization. No gate is closed or weakened. All 19 NFRs, seven operations, Feature 010 boundary, Feature 012 exclusions, synthetic-only fixtures and retained clinical/technical/UX/legal gates are preserved. No database runtime was started or exercised by C02A.

## Changed files in this pass

- `tools/generate-feature-011-contract.mjs`
- `tools/generate-feature-011-client.mjs`
- `tools/verify-feature-011-contracts.mjs`
- `packages/contracts/src/feature-011.ts`
- `packages/contracts/src/feature-011.test.ts`
- `packages/api-client/src/feature-011.ts`
- `packages/api-client/src/feature-011.test.ts`
- `specs/011-allergies-clinical-content-governance/tasks.md`
- `specs/011-allergies-clinical-content-governance/contracts/task-map.json`
- `specs/011-allergies-clinical-content-governance/evidence/implementation/C02A-red.md`
- `specs/011-allergies-clinical-content-governance/evidence/implementation/canonical-contract-parity.md`

Ignored logs/reports under `artifacts/feature-011/` are local diagnostic captures. Preexisting C03 draft fixtures/runners, all migrations, the approved Spec/Plan/UI baseline, package manifests, lockfile and `.specify/feature.json` remain unchanged.

Implementation/test source hashes:

- `tools/generate-feature-011-contract.mjs`: `2d7b66225d11588c191ca17e30143b346a26c89ebeabbb1932afbb958c5d5a68`
- `tools/generate-feature-011-client.mjs`: `b13e8082253230c75e49df22c5cf335873e892506cd7be889ec53f0b4aa1ce54`
- `tools/verify-feature-011-contracts.mjs`: `d9358df653eb1b13584a1b0a9a91f9084ec08517305c13b74fb8b1c9fcea7b46`
- `packages/contracts/src/feature-011.ts`: `268790dd2f3dd2dfe7c0e6c63a189b8daffe8c8f17e223e7de5bdbbe15507162`
- `packages/contracts/src/feature-011.test.ts`: `62217388477e7be2e33426d00ad45e119e92efb9831054bdbd1b279410eae555`
- `packages/api-client/src/feature-011.ts`: `0dcbe39619ed2e87fd78fd89b8d2364be91d92e56ee186d778b3c4e50c564467`
- `packages/api-client/src/feature-011.test.ts`: `018bab1060cd5f9ea8f108ffb2f31a4a03eb2bc680185f7959b3870947ebc822`

Diagnostic hashes:

- `artifacts/feature-011/c02a-legacy-before.log`: `afafe7abed0f1fa0efa383966eb4b9ec04923358e41624601d61af383485ec35`
- `artifacts/feature-011/c02a-red.log`: `8d2f9cd2e8dbac5a09f4ff080a43c235e0d3d26940acd77b334905ad5cdfccd6`
- `artifacts/feature-011/c02a-green.log`: `0d1ec04267edcee74d194b73caea4ee40fcbef65420e2750b19280ce4f6b499a`
- `artifacts/feature-011/c02a-contracts-typecheck.log`: `d66548006c5c7c54f315f252a8864713f539323f6c6187c23bb7db83274361fa`
- `artifacts/feature-011/c02a-client-typecheck.log`: `d66548006c5c7c54f315f252a8864713f539323f6c6187c23bb7db83274361fa`
- `artifacts/feature-011/c02a-contracts-only.json`: `74c9e6517701966445837e32fab60b6bc41a51450ad4edfdb119c24a4bfa4a58`
- `artifacts/feature-011/c02a-full.json`: `1dcc87db72f8800e73544d1c969d48c855448a6d6df1e71d019c5e6721884c53`
- `artifacts/feature-011/c02a-reproducibility.json`: `b248826a94f8804245daf6626d583440172fc9546144c9f940453ee104ab2d58`
- `artifacts/feature-011/c02a-task-validation.json`: `e338a1d6fe0f6c77a1b72b0bb40924668e5f761db07c44400776a133497ff051`

## Review and Git disposition

`clean-code-guard`: split the canonical input review into focused profile/lineage/registry/vector checks; preserved failure causes. `test-guard`: corrected the cross-package test import; independent frozen expectations and real generator/verifier filesystem boundaries retained. `docs-guard`: claims checked against captured results and current source; synthetic negative fixtures are not presented as physical evidence.

Worktree: `D:\ECU\Gradution-Project\.worktrees\011-allergies-clinical-content-governance`. Branch: `codex/011-allergies-clinical-content-governance`. HEAD: `670b1e0fe15c719b98179805f2628d1b478a55dd`. Git remains dirty with preexisting Feature 011 changes plus the bounded files listed above; no staging, commit, push or PR occurred. Main still resolves to the starting HEAD and was untouched. See local status capture `artifacts/feature-011/c02a-git-status.txt`.

**STOP — C02A checkpoint review pending; C03 execution not authorized by this report.**
