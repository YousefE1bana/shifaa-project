# Issue #504 integration preparation — 2026-10-22

Owner: [Issue #504](https://github.com/YousefE1bana/shifaa-project/issues/504). This additive engineering record follows the Product Owner's instruction to reconcile the completed local work after his squash merge of PR #503. It grants no human acceptance or publication exception.

## Source and ancestry

Remote main and PR #503's actual squash merge are `4511c2574e50e59609578256eb77b0dd55a6cbd3`. Its Git tree is `2251511636611d89203c11571f60085d523c9238`, exactly equal to former PR head `b1fe533fd3676acfb0b9e42bcc43bd00ce3f7826`.

The original #504 tested head is `2b41bcdd563eba3191f6c7806abc1170ca34869b`. Before reconciliation, a local rollback branch, `codex/github-work-management-tested-2b41bcdd`, was created at that exact commit. No original commits or retained evidence were removed. The source branch was unpublished; no force push was used.

`git rebase --onto 4511c2574e50e59609578256eb77b0dd55a6cbd3 b1fe533fd3676acfb0b9e42bcc43bd00ce3f7826` replayed exactly eleven follow-on commits, without conflicts, onto merged main. The reconciled head is `967d0737efb3fcf77881148e6bbcb6d4d2bf3e98`. Its complete Git tree equals the original tested tree: `245e9ae917032d0cd3ae214f9d40cdc16655906e`. The effective full-index binary diff is byte-identical before/after reconciliation, SHA-256 `0a304d181118d38eef07a6d2cef80acaf16390ad3c3b514857094527b65f5237`. All eleven `git range-diff` entries are equal. No #503 changes are duplicated and no follow-on changes are lost.

Both source worktrees were clean before and immediately after reconciliation. The primary maintenance checkout remained unchanged. All 60,975 ignored path names in the follow-on worktree remained identical; the primary active-feature pointer hash remained unchanged and the follow-on pointer remained absent. This is an inventory comparison, not a fresh hash of every regenerable dependency/cache file.

This record, its F001 evidence index and the README's current-state clarification are a subsequent documentation-only addendum. They do not change application behavior, tests, assertions, runners, packages, Docker, historical evidence or the original verification chain. The final commit must bind that bounded additional diff separately from the exact-tree reconciliation claim.

## Verification and preservation

The actual original `pnpm verify` ran on `2b41bcdd563eba3191f6c7806abc1170ca34869b`: **42 PASS / 0 FAIL / 0 NOT EXECUTED, exit 0**, 4,142.5824463 seconds (69 minutes 2.58 seconds). `TURBO_FORCE=true`; all four Turbo summaries report zero cache hits. The full retained log SHA-256 is `07cf80e72b8a7c44d00bf5f1078d523a612bbf8706f5985279000bdec3eeee3e`. Family/Privacy E2E remain separately callable and outside these 42 commands.

Fresh direct processes on reconciled head `967d0737efb3fcf77881148e6bbcb6d4d2bf3e98`, without Turbo replay:

| Command                                                                                                                       | Actual result                   | Native duration |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | --------------: |
| `node --test tools/github-metadata.test.mjs tools/vitest-worktree-discovery.test.mjs tools/verify-feature-011-scope.test.mjs` | 35 PASS, 0 FAIL, 0 SKIP; exit 0 |  11.090 seconds |
| `pnpm exec vitest run src/feature-011.test.ts` from `packages/api-client`                                                     | 4 PASS; exit 0                  |   3.926 seconds |
| `pnpm exec vitest run src/feature-011-successor.test.ts` from `packages/contracts`                                            | 14 PASS; exit 0                 |   5.206 seconds |

Six Issue Forms were parsed and structurally checked, including unique field IDs, valid type labels and required evidence fields. The PR template and read-only advisory workflow were checked. CLI cases returned the expected 0 for valid labels, 1 for conflicting types and 2 for malformed input. Local parsing is not hosted form rendering or a human acceptance exercise.

Read-only live REST checks matched all 504 historical classifications and all 45 label names, descriptions and colors. The Project browser readback showed its three saved views, engineering fields, six enabled workflows and actual PR #503 status Done. Auto-close Issue and status override on linked PR remain Off; auto-add retains `is:issue,pr is:open`. The CLI token lacks Project read scope, so no token-scope change was attempted; Project checks used the existing authenticated browser. Native Issue Type assignment is still not claimed implemented.

All 143 indexed private receipts and the ten-file final full-run receipt manifest were rehashed. All 4,584 existing main spec blobs remained unchanged. Seven Docker backup hashes match the original inventory; 7,637 unique surviving hardlink pairs retain shared file identity. Fourteen previously disposed cache pairs remain covered by the authorized historical disposition. There was no new storage cleanup, Docker operation, database reset, backup replacement or restoration test. Earlier recovery and accepted preservation-loss limitations remain unchanged.

The [F001 integration index](../../specs/001-identity-onboarding/evidence/work-management-integration-2026-10-22.json) binds the private reconciliation, focused logs and original full-run receipts. Historical SHA references remain historical evidence, not stale links to be rewritten as newly tested commits.

## Publication and remaining acceptance

Engineering recommendation: accept the exact-tree reconciliation plus this separately reviewed documentation-only addendum as the binding for the existing full verification. No new full aggregate has executed on the reconciled or final addendum head. The Product Owner authorized proportionate validation when exact tree equivalence permits it; this record makes that scope and limitation explicit.

The #503 human acceptance exception applies only to #503. The preserved [F011 reviewer observation](../../specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K24/native-session/reviewer-observation-2026-10-10-remaining-checks.json), recorded 2026-10-10, attributes “Done no issues found” to Yousef Osama for the preceding Arabic/English application checklist, with explicit limits on independently captured state-level details and unchanged OPEN gates. This is reusable historical context, not #504 GitHub-tooling acceptance; it does not establish the date/SHA of the separate earlier exercise described by the Product Owner for #503. No new human execution is claimed. This follow-on changes GitHub tooling, evidence and test setup/discovery, with no production UI or translation change. The smallest relevant human scope is review of the taxonomy, six source forms, PR evidence/approval wording, Project gate separation and the preserved verification/evidence boundaries. A broad application/device session would add no coverage for those changes.

Publication remains withheld pending an attributable #504-specific acceptance decision or a recorded bounded human review satisfying AGENTS.md. The proposed disposition is PR-specific: accept prior application exercise without repeating it for this engineering-only change, accept the documented source/evidence binding, and permit feature-branch publication to obtain fresh current-head CI. It is a proposal, not a granted exception. It changes no clinical/legal/security/production gate or future policy.

After authorization: push only this feature branch, open a separate PR linked to #504 and its owning evidence indices, obtain every required check on its current head, then Yousef Osama performs the human squash merge. Recheck main ancestry/tree if it advances. Issues #493/#502/#504 remain OPEN. No F012, team onboarding, collaborator changes, Organization transfer or worktree deletion is included.
