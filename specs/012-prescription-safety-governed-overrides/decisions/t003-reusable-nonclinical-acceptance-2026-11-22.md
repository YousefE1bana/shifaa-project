# T003 reusable synthetic mechanism acceptance

On 2026-11-22, Yousef Osama, SHIFAA Product Owner, approved reusable isolated
nonclinical evaluation of the exact W-M, W-NA, N and E artifacts in his
“SHIFAA — F012 Engineering Continuation & Governed Acceptance” directive.
He separately confirmed the evaluator digest below in the same collaboration
after Codex identified a malformed digest in the original directive. Codex
recorded the decision for [Issue #514](https://github.com/YousefE1bana/shifaa-project/issues/514).

## Accepted bytes

| Artifact                                                            | SHA-256                                                            |
| ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [Manifest](../evidence/implementation/t003-candidate/manifest.json) | `794d2e272d6455ff048441389730a111233134301aa44583b463e135c019e13f` |
| [Vectors](../evidence/implementation/t003-candidate/vectors.json)   | `9df5225f65b67747e32d86b1ab2f6df186a7c21f0d80c063ddaa08244ae6671b` |
| [Evaluator](../../../packages/test-kit/src/feature-012.ts)          | `52dd389af1c6baa827baf341a22a455194c4aec44e8ae56adc08c6a4923e5a3d` |
| Isolated synthetic harness, indexed in the execution receipt        | `b148e0c834653b8464729d4ddaddf9d30699ddc070f720a16d282e4f2145cbf8` |

The [D2 decision](../readiness/po-decision-approval-2026-10-23.md#d2--approved)
approved four logical contexts and required separate acceptance for executable
bytes. This decision supplies that exact-byte acceptance for isolated synthetic
evaluation. The evaluator and vectors match their manifest entries. The
isolated harness is the separate 3,444-byte artifact indexed in the
[execution receipt](../evidence/implementation/t003.json). The manifest's
`verify-behavior.mjs` entry is an additional bound input.

Codex verified the manifest and its ten entries against the tested revision
`4712109dbe8fadc78cb497a20cc33ab92de9efdf`, [PR #604](https://github.com/YousefE1bana/shifaa-project/pull/604)
as merged at `6a5c74cee79a67d4e1defde97ebf2b1fe5721bb8`, and current main
`ca56eb2d03bc38ec18ed9c3d56eba597534e136a`. All five protected original
input blobs and their byte counts match `fbd2b5312a5038aad21db0001a17dac22bdcbf7e`.
The [execution receipt](../evidence/implementation/t003.json) records 313 passed,
0 failed and 0 unexecuted. The earlier [failed run](../evidence/implementation/t003-isolated-behavior-run.md)
remains 102 passed, 1 failed and 210 unexecuted. The behavioral suite was not rerun.
The separate hard-disabled entry and binding checks passed 6/6 on Node 24.22.1.

## Evidence retention and limits

The tested Git revision and integrated files retain their original bytes. The
execution receipt indexes eleven captures from the successful run and four from
the failed run by path, byte count and SHA-256. Codex re-read all fifteen captures
from the original ignored engineering workspace and verified their byte counts and
hashes on 2026-11-22. The indexed harness remains available there to authorized
operators. Both runs and their supporting material stay in place. No cleanup was
performed.

The SHIFAA engineering workstation is the custodian. Its T003 inventory under
`.tmp/engineering-decisions-2026-11-21/` includes 17 top-level files (36,956
bytes), the original snapshot (13 files, 88,726 bytes) and the repaired run
directory (29 files, 150,827 bytes). These groups retain the indexed raw
execution records and their supporting snapshots, preparation and readback files
as restricted engineering evidence. The additional failed-run container and
resource receipts matched the hashes in the failed-run record. The T003 candidate
worktree was clean at the merged PR's reviewed head. The checked-in candidate
and original fixture blobs can be recovered from the revisions above. To recover
the isolated harness, use the saved snapshot path and verify its byte count and
digest against the execution receipt before admission.

Any reusable execution must verify the exact bindings and use an admitted
isolated synthetic environment. Package and product runtime entry remain
hard-disabled. The overall assessment stays `not_fully_checked`. Native
cross-account identity verification remains a separate obligation. Controlled and
NTI fixture flags have no bearing on severity, monitoring applicability or
emergency eligibility. Clinical rules, real patient inputs, production use,
runtime enablement and modified bytes require their own applicable approvals.
Medical, legal, facility and release gates retain their existing restrictions.
