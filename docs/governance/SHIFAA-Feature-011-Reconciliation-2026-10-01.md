# Feature 011 specification approval and API reconciliation

Date: 2026-10-01 (Africa/Cairo). Authority: Yousef Osama's direct Product Owner instruction in the current Spec Kit conversation approving Feature 011 `SPEC_APPROVED` and authorizing Plan only. This records that decision; it claims no independent reviewer signature or later lifecycle approval.

## Approved boundary

The clarified [Feature 011 spec](../../specs/011-allergies-clinical-content-governance/spec.md), with eleven recorded answers, is the authoritative feature input. It owns `FR-SAFE-002`, `FR-SAFE-008`, `FR-SAFE-012` and only the clinical-content publication slice of `FR-ADMIN-004`: CORE + `NFR-PRIV-001`, exactly 19 NFRs and exactly seven operations. The [scope manifest](../../specs/011-allergies-clinical-content-governance/contracts/scope-manifest.json) lists their exact IDs and existing methods/paths. Feature 012 and all other exclusions remain intact.

## Two catalog reconciliations

| Existing operation    | Previous mismatch                                                           | Reconciled contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verifyAllergy`       | Confirmed/refuted/reason wording omitted the approved error-marking outcome | Authorized clinicians use the same operation to append confirmation, refutation, confirmed/refuted revisions or terminal `entered_in_error`, with a new reason and attributable evidence. No return to `self_reported` or terminal exit. A corrected assertion is a new linked `self_reported` record through existing `createAllergy`.                                                                                                                                                           |
| `listClinicalContent` | `ADM-MEDICAL`-only wording omitted the approved clinic status projection    | The same GET serves authority-selected projections. Clinic staff need explicit current status-read authority, current workforce/facility context, purpose and AAL2. They receive only published/effective source/version/effective-date/publication-eligibility/supersession metadata and minimum signature-status evidence. Drafts, unsigned details, content bodies, excess signatures and derived mutation/admin authority are denied. Governance/admin inspection retains separate authority. |

Only these two existing catalog rows change. No operation, method, path, app route, platform-admin role, or Feature 012 ownership is added. Planning contract schemas describe the same seven operations; generated client and physical enforcement evidence remain future work.

## Unchanged clinical and production boundaries

Signing requires authoritative professional verification plus evidence-backed clinical-owner designation, explicit current signing authority, purpose, AAL2 and two independent people in the physician/pharmacist capacities. It does not require `ADM-MEDICAL` and confers no create/publish/admin authority. Creation/publication retain `ADM-MEDICAL`; creator self-signing and self-publication remain forbidden.

Clinical owners define and separately approve real-content category/source/code/test-vector admissibility. Missing approval denies real eligibility. Neutral synthetic fixtures test the mechanism without approving real content. `OPEN-CLIN-001` remains open; so do `OPEN-TECH-002/003`, `OPEN-UX-001/002` and applicable `OPEN-LEGAL-001/002/007`, with their existing stage effects.

Specification approval does not imply `PLAN_APPROVED`. `OPEN-UX-001` still blocks affected-UI Plan approval until Feature 011 compositions/references are approved; Feature 010's test-only design record is not inherited. No Plan-only artifact closes physical/generated-contract, clinical, legal, formal visual or reference-environment gates.

The installation-checklist refresh and roadmap completed/remaining checkboxes are later repository-maintenance work. Their target documents are unchanged during Plan; Feature 011 is not marked complete. No Tasks, Analyze, implementation, commit, push, or main modification is authorized by this record.
