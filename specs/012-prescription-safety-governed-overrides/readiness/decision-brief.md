# F012 engineering and authority decision brief

**EXACT ENGINEERING SNAPSHOT APPROVED; REMAINING DECISIONS OPEN.** Feature status: **NOT READY — PRE_SPECIFY_BLOCKED**. Yousef's subsequent [engineering-only approval](engineering-fixture-approval-2026-10-14.md) covers section 1's exact snapshot and limits only. Other product/authority decisions remain draft and unapproved; no clinical policy or lifecycle authorization is recorded. The [pre-approval brief](history/decision-brief-before-engineering-approval.md) and earlier [independent audit record](history/readiness-evidence-before-decision-brief.json) are retained byte-for-byte.

Boundary: seven closure FRs, two prerequisite-only FRs, 22 PATIENT NFRs and ten operations in the [scope manifest](scope-manifest.json). F013 retains product-catalog/search ownership; F014 retains fulfilment-worklist ownership. The [addendum](../../../docs/governance/SHIFAA-F012-Boundary-and-Governance-Addendum.md#L15-L33) records the two directions as approved in principle only, under its [proposed-successor status](../../../docs/governance/SHIFAA-F012-Boundary-and-Governance-Addendum.md#L3-L11).

## 1. Exact engineering fixture and coded-input decision

**Decision recorded after review:** Yousef approved only the exact candidate snapshot below for engineering structural/mechanism tests, including its schema, manifest and [field map](coded-input-proposal.md#L17-L32), under the [approval record](engineering-fixture-approval-2026-10-14.md). This resolves the bounded engineering-input decision before Specify. The five reviewed artifacts remain immutable proposal snapshots, retaining version 1.0.0 and PROPOSED_NOT_APPROVED envelope labels; the separate record approves engineering use of those exact bytes, not a production dataset or runtime contract.

| Review artifact | SHA-256 |
| --- | --- |
| [Schema 0.2.0-proposal](engineering-fixtures.schema.json) | 3a4fb8a9ad99221592ff9f368785d662c6f8bdd0565feeaf28a8e042be4d7a65 |
| [Candidate dataset 1.0.0, proposed](engineering-fixtures.candidate.json) | cff3d02db260e5b4d187ba16cf9f52af0afe60ee8d3129b09a538297032be1ae |
| [Manifest](engineering-fixtures.manifest.json) | def377b2dd59668a5b7e5bde1c23e18f99bef0f664106ace1a04848d5044e8af |
| [Coded-input mapping](coded-input-proposal.md) | b607eef404c176ba72a91ddc8bde3e3216da5644557f3c70c068496c03ed703c |
| [Read-only structural validator](validate-readiness.ps1) | 3b8a9779e843cf01563950ba91fc1f4b4f6edb1649ab2e7d1deef601da293185 |

The proposed carrier includes synthetic item/prescription identity, product/ingredient coding, strength, form, route, dose, frequency, duration, quantity, indication, mock classification evidence and item status. All candidate fields are present and non-null. This is a proposed test carrier; [Data/RLS](../../../docs/architecture/SHIFAA-Data-RLS.md#L60-L66) establishes logical fields, not these complete wire types or production nullability.

Review limits:

- Only the three authored cases: false/false, controlled true/NTI false, controlled false/NTI true. Product/ingredient and mock content-version identities are distinct; case/item IDs are unique. No combined-true scenario is included.
- Namespace `urn:shifaa:engineering:f012`, synthetic coding tokens, zero-prefix synthetic UUIDs and synthetic item status. No real medicine identifiers or F011 fixture bodies.
- Each quantity field has a field-specific synthetic unit token. Candidate values are decimal strings 1 for strength/dose/frequency and 2 for duration/quantity. These express no dose, schedule, unit dimension, conversion or clinical admissibility. The schema's broader numeric syntax is not blanket approval of future values or datasets.
- Mock contentVersion identifiers are fixture scenario identifiers, never F011 publications, signatures, source authority or reviewer qualifications. True and false controlled/NTI flags exercise mechanisms only.
- Readiness-folder isolation, no production loader/seed/import proposed, and no production intake or clinical-source eligibility. Runtime rejection remains required future evidence; static validation has not proved it.
- Any changed candidate, schema, mapping, manifest or validator requires new hashes and review. A positive test does not approve terminology, clinical rules, licensing, production access or the reviewer journey.

**Reviewed decision wording — subsequent approval is recorded separately with its conversation provenance and exact limits:**

> I approve the exact hash-bound fixture proposal above for engineering-only structural/mechanism testing and the bounded F012 engineering-input source discussion. This approval covers the reviewed three synthetic cases and proposed carrier only. It grants no production coding-source admissibility, clinical classification, dose validity, runtime API/DDL contract, permission, endpoint, operation-count amendment or lifecycle authorization. All designated-authority and release gates remain OPEN.

An approved production coded-input source is still undocumented. Medical Director + Chief Pharmacist and applicable legal/regulatory authorities must establish source admissibility separately. No backward F013 dependency is selected.

## 2. Reviewer authority and complete journey decision

**Required before Specify:** establish the authoritative eligibility source, assignment at request creation, request-specific disclosure, discovery, decision authority, immediate emergency pharmacist-review queue, expiry/reassignment and failure/recovery. Evidence gaps and inspected capabilities are in the [reviewer analysis](reviewer-journey-evidence.md#L5-L21). A generic doctor/pharmacist license is not pathway eligibility.

| Responsible authority | Evidence/decision required; still OPEN |
| --- | --- |
| Medical Director + Chief Pharmacist | Authoritative clinical-pharmacist qualification predicates/source, attending/second-physician authority, permitted assignment and clinical review duties, independence and break-glass policy; OPEN-CLIN-001 |
| Medical Director + Chief Pharmacist + Legal | Signed effective controlled/NTI policy and facility emergency window, activation/post-window rules and immediate review policy; OPEN-CLIN-002. Named authority and facility-policy records are still required; no window is chosen here |
| Legal + designated DPO; authoritative credential/licensing verifier to be identified | Lawful request-specific disclosure, qualification-source admissibility and current validity evidence. The exact source and named competent provider remain unresolved |
| Yousef | Product discovery/assignment responsibilities and any boundary/count decision after policy and contract evidence. Designating a responsible person does not prove that person's clinical/legal authority |
| API Lead + Data Lead | Map approved policy to creation/read/decision context, persistence/RLS, current authority, version/expiry, concurrency and retry/recovery; no new grant or endpoint selected |

**Engineering recommendation:** first assess a governed notification extension plus the existing request/read/decision operations against the complete approved policy. Existing notification mechanisms alone are not approved reviewer discovery. If that option cannot supply the full journey, bring the smallest proven API/ownership amendment to Yousef before Specify. A separate discovery query or assignment/detail operation is an unapproved alternative, not a selected capability. F014's worklist cannot be repurposed by implication.

Counts remain ten F012 operations, 242 active plus six reserved (248 total). No eleventh operation is approved. Conditional arithmetic and every affected PRD/Master/roadmap/API/Data-RLS/UI/traceability record are already listed in the [option comparison](reviewer-journey-evidence.md#L29-L45).

## 3. F011 current-validity and server-side consumption decision

**Required before Plan approval:** an approved producer-to-consumer contract for actual protected rule bodies, not clinic metadata. [Existing F011 boundaries](plan-readiness-matrix.md#L26-L44) distinguish immutable artifact verification, current eligibility and authorized projections. They do not establish F012 server access or prove a currently admissible production clinical release.

Yousef decides the engineering/product boundary; API Lead + Data Lead reconcile the authorized source/interface and typed rule body, publication/effective state, version/digest, current source authority, revocation/expiry/supersession, prescription/item/allergy/history binding, non-owner persistence/RLS and transaction/recovery evidence. Clinical/source admissibility remains with Medical Director + Chief Pharmacist and applicable Legal authority. Any boundary or operation amendment is required before Specify.

**Recommendation:** require this explicit consumption contract and current-authority evidence. Reuse an existing protected-material mechanism only after its authorization for F012 is established. Do not select a new endpoint, assume rule-body access, or treat historical signatures as current validity. When source/body/current authority cannot be verified, no safe assertion may be made; exact permitted actions and not_fully_checked recovery remain an explicit product/clinical decision.

## 4. Contracts required before Plan approval

The [decision matrix](plan-readiness-matrix.md#L9-L24) remains the closure checklist, without creating a second governance framework:

- Unknown/incomplete/unavailable inputs: explicit action/signing and recovery matrix; unknown is never safe.
- Emergency activation, independent physicians, immediate pharmacist review, expiry and post-window restrictions, with no invented window or clinical threshold.
- Content/item/allergy/medication-history freshness, completeness and version binding; invalidation on relevant change.
- Signed immutability and cancellation/supersession history; complete actor/state/transition and event/projection ownership.
- Current authorization, minimum reviewer disclosure, forced RLS/least grants, CAS/lock ordering, atomic audit/outbox/receipt, idempotency, races and rollback/recovery.
- Patient/clinic/reviewer AR/EN states, approved composition references and accessibility; independent negative-test design and migration/recovery implications.

Engineering/API/Data owners resolve technical contracts; Yousef resolves product boundaries; designated clinical/legal/facility authorities retain policy decisions; Product Owner + Design Lead retain affected UI approval. The [19-row canonical gate inventory](plan-readiness-matrix.md#L69-L95) preserves every owner, closure-evidence requirement, restriction and earliest blocked stage. No gate is closed or moved by this report.

## Decision sequence and stop

Yousef subsequently required a [project documentation recheck](documentation-recheck-report.md) before F012 starts. Its reconciliation findings remain OPEN. The [authority/reviewer package](authority-and-reviewer-decision-package.md) prepares the source-backed answers needed next; preparation selects no alternative and grants no clinical or lifecycle approval.

1. Completed: exact-hash engineering fixture review and Yousef's limited approval are recorded separately. The reviewed bytes remain unchanged; clinical and production-source admissibility remain OPEN.
2. Obtain the named competent authorities and their source-backed reviewer/assignment/disclosure/emergency decisions; reconcile the complete journey and any boundary amendment before Specify. No outbound authority request was sent.
3. Once both pre-Specify conditions are satisfied, obtain separate lifecycle authorization. This report does not start Specify or any successor stage.
4. Resolve F011 consumption and all Plan-level contracts through the authorized lifecycle. No Tasks or implementation until Architecture Completeness Gate, exact Plan approval, applicable gates and separate authorization are satisfied.

Preserve all applicable OPEN gates, their canonical IDs, designated owners, closure evidence, capability restrictions and earliest blocked lifecycle stages. Do not infer or introduce deadlines unless explicitly recorded in an authoritative source. Engineering readiness is separate from clinical/legal approval and production release. The remaining decisions are draft evidence; the narrow engineering approval is not feature acceptance or Artifact Finalization Gate PASS.
