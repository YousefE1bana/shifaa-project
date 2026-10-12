# Feature 011 — Plan recovery authority and gate disposition

Date: 2026-10-06 (Africa/Cairo). Record ID: SHIFAA-F011-PLAN-RECOVERY-R1. Authority: Product Owner / Architecture Lead explicitly accepted RECOVERY_RECOMMENDATION: REOPEN_PLAN and authorized Plan-family reconciliation only. This record preserves history and does not attribute approval of the recovered Plan to the author or any reviewer.

## Current lifecycle authority

- Product Spec 0.12 remains SPEC_APPROVED and unchanged. Exactly 19 NFRs, seven operation IDs/methods/paths/public wire shapes, Feature 010 context dependency, both recorded catalog reconciliations, Feature 012 exclusions and retained OPEN gates are unchanged. No product-semantic contradiction was discovered in the accepted recovery decisions.
- Prior PLAN_APPROVED is SUSPENDED FOR RECOVERY. Recovered Plan R1 is REVIEW REQUIRED, not approved. The October 2 [PO approval record](product-owner-approvals-2026-10-02.md) remains immutable historical evidence; it cannot approve this changed Plan family retroactively.
- The current 95-task / 29-checkpoint ledger and task-map remain unchanged historical recovery inputs, NOT current implementation authority. Their legacy PLAN_APPROVED/TASKS_APPROVED labels do not override this dated suspension. No Tasks regeneration has occurred or is authorized yet.
- C01/C02/C02A accepted work and evidence remain preserved pending recovered-Plan revalidation. Historical acceptance was bounded to tooling, public wire/client parity and canonical metadata, not the later handoff/model. Partial C03 RED drafts/captures remain preserved pending revalidation; missing-DDL diagnostics do not establish GREEN physical behavior or races.
- Implementation is fully paused. No C02B/T093–T095, C03, T017 or later checkpoint execution is authorized. No task completion, application/core/UI/runtime/SQL/generated-code change, commit, push, PR or main change is authorized.

## Architecture incorporated as design

The accepted [October 6 design decision](trusted-handoff-design-2026-10-06.md) remains byte-identical. Its contract definitions and allocator correction are now owned by Plan/research/model/governance/quickstart, not deferred choices in Tasks. SHIFAA-F011-ARTIFACT/1 remains frozen; SHIFAA-F011-CREATE-RELEASE-HANDOFF/1 separates trusted evidence hashes, normalized facts, allocated identity/version and opaque BODY/1. AAD/1, five body columns, before-lock preflight/protection, locked equality/revalidation and fresh-attempt versus committed-replay behavior are explicit. next_artifact_version and unique(series_id, artifact_version) are superseded design alternatives, not implemented DDL being altered.

Historical ownership labels C02A/C02B/C03/C04/T017/C13 are crosswalk references only. [Plan §6.1](../plan.md) defines current ordered P1–P7 evidence responsibilities; a future rebuilt Tasks ledger must derive from the recovered approved family. No producer acceptance is required before its producer exists. Physical proof uses synthetic handoffs; real evidence/AES-GCM producer composition and later SQL/core equivalence remain separate future obligations.

## OPEN-UX-001 authority audit

Master §14 OPEN-UX-001 requires Product Owner + Design Lead approval of linked P0 compositions/reference baselines at required viewports and immutable baseline IDs before affected-UI PLAN_APPROVED. The October 2 record supplies PO approval of SHIFAA-F011-OPEN-UX-001-CANDIDATE@0.1.1-test-only, manifest SHA-256 59ea1788edbae023533a9e08da97bc3884e0e098ec6e80721272822b6439c432, but explicitly records no Design Lead signature or acting-role designation. No authoritative Feature 011 Design Lead approval/designation was found in the repository decision records. Feature 010's acting designation is explicitly Feature 010 only; it does not transfer.

Current formal disposition: OPEN-UX-001 PENDING REQUIRED FEATURE 011 DESIGN LEAD APPROVAL/DESIGNATION. PO approval alone did not satisfy that affected-UI gate. The historical record's functional-prerequisite-approved assertion is superseded by this current disposition, not deleted. The operating-model amendment gives Yousef pre-implementation lifecycle authority but expressly does not replace UX approval. No acting role is invented, and the immutable candidate/reference capture is unchanged. Recovery may produce a reviewable architecture draft; affected-UI Plan is not fully approved.

## Other gates

OPEN-TECH-002 remains OPEN under the existing API Lead + Data Lead + QA Lead register. Current physical/generated/handoff inputs require accepted preparation evidence and an applicable owner/stage assertion; none is supplied by recovery. A later physical/generated assertion is limited to its evidence stage, does not accept the subsequent real producer, and does not globally close OPEN-TECH-002.

OPEN-CLIN-001 still permits synthetic governance mechanism engineering but gates real clinical qualification/admissibility/content/code/test vectors. OPEN-TECH-003 and OPEN-UX-002 keep their formal VERIFYING effects. OPEN-LEGAL-001/002/007 keep production restrictions. No owner, scope, stage or waiver is changed.

## Approval and review record

| Artifact / decision | Authority / disposition | Evidence |
| --- | --- | --- |
| Reopen Plan / preserve Spec / pause implementation | PO + Architecture Lead, supplied recovery instruction, 2026-10-06 | This attributable record; authorization is recovery only |
| Original Plan | Historical; original approval suspended | Exact pre-recovery capture [plan.md](../evidence/plan-recovery/plan.md); original SHA-256 bb6f5918696dab056e4cec756324078f5c28ea640d5387ad6fa515caf3992689 |
| Recovered Plan family R1 | Approval PENDING; independent/debate review next | [Input digest manifest](../evidence/plan-recovery-inputs.json), [Plan-level validation](../evidence/plan-recovery-validation.md), [fresh architecture/data review](../evidence/plan-recovery-architecture-review.md) |
| Feature 011 Design Lead | Approval/designation ABSENT | Required OPEN-UX-001 role cannot be inferred from PO approval |
| Checkpoints / production gates | NO new acceptance or closure | Preserved evidence only; later implementation needs explicit authorization |

Pre-recovery captures of plan/research/model/governance/quickstart retain exact bytes under evidence/plan-recovery. Those files are dated historical snapshots, not active design or executable instructions; their original relative links are interpreted at their original source locations. The model/governance captures reflect the October 6 state at recovery entry, not an invented reconstruction of the original October 1 model. Current file hashes in the recovery input manifest identify the reviewed family; they are not approval signatures or generated parity acceptance.

STOP after recovery report. Independent/debate review, required UX authority evidence and a new attributable digest-bound Plan approval precede separately authorized Tasks generation. No implementation resumes automatically.
