# F012 exact engineering-fixture approval — 2026-10-14

**ENGINEERING-ONLY SNAPSHOT APPROVAL RECORDED. Feature 012 remains NOT READY — PRE_SPECIFY_BLOCKED.** This records Yousef's decision from the current conversation; it is not feature acceptance, clinical approval, production authorization or a SpecKit lifecycle stage.

## Authorization and scope

Yousef's direct message was: “ok i need you to review it and you have my approval”. The immediate context was the exact engineering-only fixture decision in the [retained decision brief](history/decision-brief-before-engineering-approval.md), including its five hashes and explicit limits. The assistant stated that it would review those bytes and record only the engineering approval. This record applies that narrow scope; it does not infer approval of the brief's other pending decisions. Recorded by Codex after review, without backdating or attributing a clinical signature.

Approved: the exact three synthetic cases and proposed carrier below for engineering-only structural/mechanism testing and the bounded F012 engineering-input source discussion. This fulfills the engineering fixture review decision only. The complete reviewer journey and separate lifecycle authorization remain required [before Specify](../../../docs/governance/SHIFAA-F012-Boundary-and-Governance-Addendum.md#L121-L132).

| Reviewed immutable artifact | SHA-256 |
| --- | --- |
| [Schema 0.2.0-proposal](engineering-fixtures.schema.json) | 3a4fb8a9ad99221592ff9f368785d662c6f8bdd0565feeaf28a8e042be4d7a65 |
| [Candidate snapshot, proposed version 1.0.0](engineering-fixtures.candidate.json) | cff3d02db260e5b4d187ba16cf9f52af0afe60ee8d3129b09a538297032be1ae |
| [Proposal manifest](engineering-fixtures.manifest.json) | def377b2dd59668a5b7e5bde1c23e18f99bef0f664106ace1a04848d5044e8af |
| [Field mapping proposal](coded-input-proposal.md) | b607eef404c176ba72a91ddc8bde3e3216da5644557f3c70c068496c03ed703c |
| [Read-only structural validator](validate-readiness.ps1) | 3b8a9779e843cf01563950ba91fc1f4b4f6edb1649ab2e7d1deef601da293185 |

These five files retain their reviewed proposal bytes, including PROPOSED_NOT_APPROVED labels and historical statements that no exact approval had yet been recorded. Those statements describe the reviewed snapshot at preparation time. This separate record supplies the subsequent, limited engineering approval; it does not rewrite the snapshots or publish an approved production dataset version. Validator output describing an unapproved proposal refers to those immutable envelopes, not to the absence of this engineering-use decision. Any change to these five artifacts requires new hashes and review; schema acceptance does not approve additional cases or values.

## Review result and limits

- All five hashes independently matched the brief. The complete carrier maps to [Data/RLS logical fields](../../../docs/architecture/SHIFAA-Data-RLS.md#L60-L66); production wire types, nullability and terminology remain unresolved.
- Exactly three mechanism-only combinations: controlled/NTI false/false, true/false and false/true. Distinct synthetic product/ingredient and mock content-version identities, unique case/item IDs; no combined-true case.
- Namespace urn:shifaa:engineering:f012, synthetic coding tokens, zero-prefix synthetic UUIDs and synthetic item status. No real medicine codes, F011 fixture bodies or clinical source authority.
- Reviewed numeric strings are 1 for strength/dose/frequency and 2 for duration/quantity, with five field-specific synthetic unit tokens. They grant no physical dimension, conversion, clinical dose, schedule or admissible production range. Broader schema syntax is not approval of future dataset values.
- Mock contentVersion identifiers and true/false controlled/NTI flags test mechanisms only. They are not F011 publications, clinical signatures, medicine classifications, qualification evidence or current authority.
- Thirty-two read-only checks passed, including rejection probes for envelope/coding/version/extra-field/purpose/ID/classification/unit/hash failures. Cross-record semantic checks establish structural consistency only. Exact commands, runtimes and outcomes are in [current evidence](evidence.json).
- Readiness-folder isolation and no proposed production loader/seed/import are maintained. Runtime production exclusion, clinical semantics, current licensing, RLS, races, rollback and native accessibility have not been established by these checks.

## Decisions and gates retained

This approval grants no production coding-source admissibility, clinical classification, dose validity, runtime API/DDL contract, permission, endpoint, route, role, reviewer assignment/discovery mechanism, operation-count amendment or lifecycle authorization. F013 retains catalog/search ownership; F014 retains fulfilment-worklist ownership. Scope remains seven closure FRs, two prerequisite-only FRs, 22 PATIENT NFRs and ten F012 operations.

Reviewer eligibility/source, assignment, request-specific disclosure, discovery, decision authority, immediate emergency pharmacist review, expiry/reassignment and failure/recovery remain OPEN before Specify. Yousef retains product-boundary decisions; designated clinical/legal/facility authorities retain policy/source decisions. The F011 server-side rule-body/current-authority/version/invalidation contract and other [Plan contracts and canonical gate inventory](plan-readiness-matrix.md) remain unresolved at their recorded stages. No historical F011 acceptance or preservation disposition changes.

Preserve all applicable OPEN gates, their canonical IDs, designated owners, closure evidence, capability restrictions and earliest blocked lifecycle stages. Do not infer or introduce deadlines unless explicitly recorded in an authoritative source. No Specify, Clarify, Plan, Tasks, Analyze, taskstoissues, implementation, commit, push, PR or merge is authorized by this record.
