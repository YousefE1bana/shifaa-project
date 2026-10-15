# SHIFAA PRD — F012 graduation-engineering amendment

> Document ID: SHIFAA-PRD-F012-AMENDMENT
> Version: 2.2.0-proposed
> Package: F012-GRADUATION-ENGINEERING/2.2.0-proposed
> Status: PROPOSED_UNAPPROVED — NOT_EFFECTIVE
> Approval of exact contents: NOT RECORDED
> Effective authority: NONE; existing approved baseline remains controlling.

## Authority and acceptance applicability

Baseline: [PRD 2.1.3](../../shifaa-prd.md). Approval owner: Yousef Osama. Engineering review uses the existing Product/QA/domain operating model.

Activation follows the [Master amendment](SHIFAA-MASTER-F012-Graduation-Amendment-v2.2.0.md#activation-and-version-authority). Until activation, PRD 2.1.3 remains controlling.

For F012 only, this proposed amendment qualifies PRD Section 1's completion claim: a technically complete synthetic workflow may receive explicitly scoped engineering acceptance when approved contracts and executed evidence support it. Simulated clinical operations must remain identified as simulated and cannot be described as completed clinical services.

This distinction grants no acceptance now and no general graduation waiver.

## Immutable scope

Closure FRs: FR-SAFE-001, FR-SAFE-003, FR-SAFE-004, FR-SAFE-005, FR-SAFE-006, FR-SAFE-007, FR-SAFE-011.

Prerequisite-only FRs: FR-SAFE-009, FR-SAFE-010. Later closure ownership is unchanged.

Exact 22 PATIENT NFRs:

- NFR-SEC-001, NFR-SEC-002, NFR-SEC-003, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006, NFR-SEC-007.
- NFR-PRIV-001, NFR-PRIV-002, NFR-PRIV-004.
- NFR-I18N-001, NFR-A11Y-001, NFR-PERF-001, NFR-PERF-002, NFR-AVAIL-002.
- NFR-DATA-001, NFR-DATA-002, NFR-API-001, NFR-API-002.
- NFR-OBS-001, NFR-QUALITY-001, NFR-PORT-001.

The [frozen F012 roadmap row](SHIFAA-Remaining-Specs-Roadmap.md#L118-L126) and retained [scope manifest](../../specs/012-prescription-safety-governed-overrides/readiness/scope-manifest.json) identify the boundary. F010/F011 remain prerequisites. F013 owns catalog/search. F014 owns fulfilment/substitution. No backward dependency on F013, dispensing, administration or refill closure is added.

The ten operations remain:
createPrescription, updatePrescription, runPrescriptionSafety, acknowledgeWarning,
requestContraindicatedOverride, decideOverride, signPrescription, cancelPrescription,
getPrescription, listPatientMedications.

Twelve is the preferred candidate for detailed contract review only. It is not an approved inventory; [conditional alternatives](../architecture/SHIFAA-F012-Synthetic-Engineering-Boundary.md#operation-alternatives) must be reconciled separately.

## Engineering versus clinical acceptance

Engineering evidence may establish software mechanics for the approved informational, warning, contraindicated and not_fully_checked model; warning reason/justification; normal-signing hard stops; independent simulated review; emergency two-person mechanics; expiry, current-authority rejection, version invalidation, audit, concurrency, recovery and bilingual UI.

FR-SAFE-011 retains its actual requirement: FHIR R4-aligned MedicationRequest, DetectedIssue and provenance semantics without national certification. Signed immutability/correction remain architecture and safety invariants; they are not a replacement definition of FR-SAFE-011.

Clinical rule validity, real ingredient classifications, clinical source admissibility, actual licensed-clinical-pharmacist approval and real facility emergency windows remain unapproved where evidence is absent. Synthetic decisions authorize no actual dispense or administration.

Engineering acceptance never closes a clinical/legal OPEN gate or changes historical requirement acceptance. [Evidence classifications](../traceability/SHIFAA-F012-Graduation-Evidence-Overlay.md) and [adoption limitations](../architecture/SHIFAA-F012-Synthetic-Engineering-Boundary.md#future-production-adoption-limitations) must accompany any future acceptance claim.

## Consultation and production limits

Q1–Q10 consists of Product Owner-supplied clinical consultation text used as advisory input. Original survey provenance, respondent identity and professional credentials have not been independently verified in repository evidence. This input establishes no professional sign-off, clinically validated rule bundle or regulatory approval. Q1/Q2/Q3 address candidate interaction discussion, severity advice and sign-off; Q4/Q5 concern F011 allergy provenance; Q6 intersects controlled/NTI prerequisites and later pharmacy/refill owners; Q7 does not establish an emergency algorithm or SOS notification authority; Q8 belongs to laboratory owners; Q9/Q10 belong to vaccination owners.

The advisory two-level risk suggestion does not replace the four approved safety states. Candidate drug examples, emergency symptoms, lab thresholds and vaccination advice are not executable rules.

No independent licensed clinical pharmacist approval is available from this clarification. No real-patient clinical, legal, licensing or facility approval is fabricated. Actual production activation requires each existing authority's specific evidence.

## Successor-reference correction — Product Owner direction, 2026-10-15

> Preparation authorized; exact contents PROPOSED_UNAPPROVED — NOT_EFFECTIVE.
> This section supersedes conflicting earlier instructions in this document only upon governed approval and activation; earlier text is retained as historical proposal/evidence. F012 remains NOT READY — PRE_SPECIFY_BLOCKED.

The [canonical Constitution publication procedure](../../.specify/memory/constitution.md#f012-publication-and-activation-procedure) is the sole proposed constitutional authority and activation locator. Earlier composite-authority, baseline-plus-sidecar precedence and sidecar-led activation instructions are historical proposals, not operative instructions. Constitution 2.1.0 and approved PRD/Master 2.1.3 remain effective until the exact conditional-publication predicate is satisfied. Recommended candidates are Constitution 3.0.0 and PRD/Master 2.2.0; the v2.2.0 sidecar filenames remain historical locators, without renaming or ratification.

For any future separately authorized lifecycle stage, explicitly read the effective canonical Constitution, PRD, Master and applicable templates; verify versions/hashes, actual remote-main authority, attributable exact-content approval, final manifest and activation receipt. Read sidecars and supplement as supporting decisions/evidence only. No automatic SpecKit loading is claimed. Independently check branch/worktree and active-feature pointer; a pointer is not feature authority. No Specify, Plan, Tasks or other lifecycle stage is authorized.

Yousef's current evidence-location direction is preparation authority within Product Owner scope: every feature's official evidence belongs to its owning specs directory. F011 evidence remains in F011 and is referenced without copying or changing it. F012 evidence remains in F012. No generic external vault/cloud destination is mandatory. Earlier external-retention requirements below are superseded proposed policy, not an instruction to relocate evidence. See the [versioned feature-owned integration/retention successor](../../specs/012-prescription-safety-governed-overrides/governance-remediation/integration-retention-manifest-v2.json); the original manifest and all 37 original readiness records retain their original bytes and hashes.

Review each of the 14 publication candidates individually; retain the other 23 restricted/historical records in their F012 scope without automatic staging. Local existence is not durable, independently recoverable retention. Until access controls, authorized recovery and original-byte checks are established, retain the worktree and mark artifact finalization/cleanup pending. The sibling archive is backup only. Do not add a .gitattributes exception unless exact approved publication of the historical CRLF file requires one. Preserve all F011 historical bytes, manifests and approval limits.

The [P01–P30 questionnaire](../../specs/012-prescription-safety-governed-overrides/readiness/clinical-pharmacist-review-questionnaire.md) only prepares professional consultation. Every question awaits input. No professional identity, credentials, participation, clinical validation, Medical Director approval or OPEN-CLIN closure is established. The [reviewer candidate](../architecture/SHIFAA-F012-Synthetic-Engineering-Boundary.md#selected-direction-for-contract-review--not-an-approved-boundary) uses synthetic designations only; effective F012 operations remain ten and twelve remains an unapproved contract-review candidate. All applicable OPEN gates, named owners, evidence requirements and earliest blocked stages remain intact. Spec Kit stays 1.1.3 with custom workflow 2.3.0.
