# SHIFAA Constitution

> **Version:** 3.0.0 — prospective release candidate; not ratified.
> **Publication form:** PROSPECTIVE CONDITIONAL RELEASE — approval/effectiveness is established only by the bound approval and activation records.
> **Conditional publication state:** APPROVED_FOR_CONDITIONAL_ACTIVATION (prospective only; this header asserts no approval).
> **Current preparation limit:** Exact Product Owner approval is not recorded by preparation of this form; predecessor authority continues until verified activation.
> **Publication bundle:** F012-GOVERNANCE/3.0.0
> **Preparation history:** Prepared 2026-10-15. Authority is determined by the approval and activation records, never by this preparation date.
> **Effective authority before activation:** Constitution 2.1.0 and PRD/Master 2.1.3 at Git commit `862db9f66c19ccb8efa9163e5221845225b62174` remain controlling until the verified activation receipt satisfies the canonical procedure. An integrated proposal does not withdraw that authority.

### Historical predecessor metadata — not approval of this candidate

> **Predecessor version:** 2.1.0
> **Predecessor status:** Ratified — Product Owner approved
> **Predecessor proposed:** 2026-08-09
> **Predecessor ratified:** 9-Aug-2026
> **Predecessor approved by:** Yousef Osama
> **Predecessor approval version:** v2.1.0
> **Predecessor approval record:** [`../../docs/governance/SHIFAA-Baseline-Approval-v2.1.0.md`](../../docs/governance/SHIFAA-Baseline-Approval-v2.1.0.md)
> **Predecessor last amended:** 2026-08-09
> **Predecessor authority:** [`../../SHIFAA-Implementation-Plan-MASTER.md`](../../SHIFAA-Implementation-Plan-MASTER.md), Section 3

## Immutable articles

### I. Least Privilege and Default Deny

Every action is authorized for the minimum actor, purpose, patient, facility, resource, field set, and time. Missing policy means deny.

### II. Identity Is Internal and Typed

The authentication subject is an internal UUID. National ID, passport, UNHCR card, email, and phone are typed attributes, never the global primary key or exposed credential.

### III. Care Relationships Are Canonical

Self, Guardianship, and Delegation are the only care-management relationship types. Emergency Contact is separate. Every grant is explicit, scoped, reviewable, and revocable.

### IV. Facilities Use Owner/Sub-user Memberships

Every workforce action resolves a facility membership and is attributed to a named authenticated person. Shared accounts are forbidden.

### V. Medical Data Follows the Patient With Purpose Limits

Longitudinal safety data is patient-centric; access still requires a care, consent, emergency, or legal basis. Cross-facility continuity never means universal staff visibility.

### VI. Clinical Safety Requires Dual Governance

Clinical decision-support code, content, severity, exceptions, and test vectors require written senior-physician/medical-director and clinical-pharmacist approval. Unknown is displayed as unknown; it is never silently safe.

F012 isolated graduation-engineering applicability only: policy-shaped software mechanisms and mechanism-only test vectors may receive engineering acceptance without professional clinical signatures only with exclusively synthetic patients, coding, rule scenarios and reviewer designations; trusted deployment isolation must reject real-patient/production inputs and prevent production authority. Synthetic designations are not professional credentials; synthetic content is not admissible F011 clinical content; simulated decisions cannot authorize actual prescribing, dispensing or administration. This applicability grants no endpoint, role, permission or protected rule-body access. Current contextual authorization, independence, immutable history, audit, failure handling and bilingual accessibility remain required. Actual clinical logic, classifications, source admissibility, professional reviewer eligibility, emergency policy and clinically operational use retain the preceding dual-signature obligation and designated approvals. Unknown or unverifiable evidence remains `not_fully_checked`. Engineering evidence is separate from clinical validation and production authorization. All other articles and applicable OPEN gates, their canonical IDs, owners, closure evidence, capability restrictions and earliest blocked stages remain controlling; no undocumented deadline is introduced. This applicability is F012-only and can take effect only under the canonical Constitution's publication and activation procedure. Proposal status never activates it.

F012 non-clinical evidence-matching applicability, after the same exact approval and activation predicate only: a separately indexed, isolated synthetic-patient demonstration may deterministically match verified real medication names and explicitly documented alert conditions to attributed official source statements. The exclusively synthetic coding/rule condition above continues to govern mechanism-only fixtures; this separate path permits source-identified genuine ingredient/combination names and source-condition matching, not fabricated medicines or clinical conclusions. Inputs must be bounded declared synthetic scenario facts, with no real-patient intake or operational clinical action. Outputs distinguish source-condition match, no match for that specific condition, and insufficient evidence; none is a complete safety result, executable SHIFAA clinical severity, treatment recommendation, override approval or F011 clinical-content release. The overall prescription-safety assessment remains not_fully_checked in this path. Do not infer product registration, formulation, dose, medicine codes, class membership or current clinical eligibility. Unknown applicability stays explicit; a missing field required to match a condition prevents a match, and non-match never means safe. Only evidence fidelity, deterministic matching, isolation and authorization mechanics may receive engineering acceptance under this applicability. Actual clinical rules, clinically accepted mappings/vectors, professional authority, facility/emergency policy, lawful disclosure and production activation retain all existing signature and approval requirements. This paragraph changes no operation, endpoint, role, grant, dependency, OPEN gate, protected F011 access or lifecycle authorization.

### VII. Regulated Activity Is Gated by Evidence

Sensitive-data processing, controlled medicines, payments, donations, facility licensing, and official integrations cannot enter production on verbal assurance or an inferred rule.

### VIII. Separation of Duties Is Structural

A person cannot approve their own facility, role grant, clinical-content publication, contraindicated override, or donation nomination. The database enforces the separation where representable.

### IX. Privileged Access Requires MFA and Purpose

Workforce/admin sensitive operations require AAL2, reason capture where catalogued, short sessions, and attributable audit. Recovery cannot bypass MFA.

### X. Domain Logic Is Portable

Core policies and state machines have no vendor/framework dependency. Every external system is behind a tested port/adapter.

### XI. One Authoritative App Per User Surface

MVP has one patient app and one staff app per facility type. A second app for the same operational surface requires a constitutional amendment and must not duplicate auth, contracts, or domain logic.

### XII. Consent and Privacy Are Arabic-first and Granular

Privacy information and consent are specific, affirmative, separable, versioned, recorded, and withdrawable. Collection is limited to an inventoried purpose and retention class.

### XIII. Accessibility and Localization Ship With the First Screen

Arabic/RTL and English/LTR parity, WCAG 2.2 AA, keyboard and screen-reader support, scalable text, contrast, touch targets, and reduced motion are release criteria, not later enhancements.

### XIV. Safety-Critical UI Prioritizes Clarity

Prescribing alerts, emergency actions, critical results, identity approval, and financial approval use stable layouts, plain language, redundant text/icon cues, and no decorative motion that delays action.

### XV. AI Advises; Licensed Humans Decide

AI cannot diagnose, prescribe, dose, promise care, or execute a consequential clinical state change. Approved deterministic red flags run first; AI input is minimized; every output shows uncertainty/source/version and remains reviewable and reversible.

## Governance

- Each feature specification MUST list targeted immutable FR/NFR IDs and pass the lifecycle in Master Section 11.
- Legal, privacy, clinical, security, architecture/data, design/accessibility, and release gates apply according to feature risk; a missing required signature blocks the feature.
- A Constitution exception is not permitted inside a feature spec or task. Amendments require Product Owner approval, a semantic version change, rationale, impact/migration analysis, and propagation to the PRD, Master, templates, contracts, and traceability matrix.
- Compliance review verifies fact versus inference versus SHIFAA policy. Unverified claims receive an `OPEN-*` ID rather than confident wording.
- The implementation and documentation in one change MUST remain traceable and consistent; automated checks are release-gating.

## F012 publication and activation procedure

The single normative constitutional locator is `.specify/memory/constitution.md`. Master mirrors the articles. Separately versioned F012 sidecars, the supplement and remediation analyses are supporting decisions/evidence only; no baseline-plus-sidecar composite has normative precedence. Historical acceptance remains bound to its original commits and blobs. Before verified activation, Constitution 2.1.0 and approved PRD/Master 2.1.3 at `862db9f66c19ccb8efa9163e5221845225b62174` remain effective, including when a proposal has been merged.

### Approval, participation and clinical authority

Amendment approval belongs to the Product Owner under the existing amendment rule. Affected-discipline participation and Article VI professional clinical sign-off remain distinct obligations. The mandatory template does not state an additional affirmative clinical-professional acceptance requirement for this non-clinical constitutional amendment.

For the F012 isolated non-clinical constitutional-applicability amendment only, record each affected discipline separately as actual attributable participation, unavailable, unresponsive, or review not obtained. Record the materials and versions offered, date and response evidence when an invitation actually occurred; do not invent outreach or infer unresponsiveness from missing evidence. Separate engineering impact analysis from professional consultation. Under this amended internal procedure, exact Product Owner amendment approval may accept a documented missing-participation disposition for this narrowly bounded engineering applicability, including consequences, limitations and required follow-up. The inclusion checklist then records the accepted procedural disposition, never a completed professional review. This alternative has no authority before its exact governed approval and activation. It does not waive Article VI dual senior-physician/medical-director and clinical-pharmacist signatures for real clinical code, rules, severity, exceptions, clinical test vectors or operational use; lawful disclosure, legal/privacy, credential, facility and production restrictions remain intact. No unperformed professional review may be marked complete, PASS or N/A, and no other feature or gate receives this procedural alternative.

### Fixed publication states and non-circular records

These are proposed publication rules, not an approval or status promotion in this copy:

1. **Review candidate:** `PROPOSED_UNAPPROVED — NOT_EFFECTIVE`. Presence, approval of direction or merge never activates these bytes. Use the effective predecessor.
2. **Exact release form:** before integration, review the complete final bytes with Constitution 3.0.0, PRD/Master 2.2.0, bundle `F012-GOVERNANCE/3.0.0` and explicitly prospective conditional-publication headers. The header names `APPROVED_FOR_CONDITIONAL_ACTIVATION` conditionally, not as approval evidence. Only the attributable exact-content approval bound to those known bytes establishes conditional approval. The same reviewed headers remain unchanged after approval and both merges; effective status is resolved through the records, never by treating prospective text as ratification. Any content change requires fresh hashes and exact approval.
3. **Approval record:** proposed locator `specs/012-prescription-safety-governed-overrides/decisions/graduation-governance-approval.md`. Record Yousef Osama's attributable exact-content decision, capacity/date, final artifact paths/versions/statuses/byte counts/SHA-256, accepted impact dispositions, limitations and final integration/retention-manifest hash. The manifest binds reviewed artifacts and retained evidence but excludes this approval record and the later receipt. The approval record excludes its own digest and any unknown future receipt bytes. Neither a draft record nor a placeholder is approval.
4. **Conditional publication:** after separate integration authorization, PR A contains the approved release bytes, resolvable supporting evidence, final manifest and attributable approval record. Required checks and human-only squash merge remain controlling. Verify the actual remote-main merge, Git blobs and all approved hashes. Pending activation receipt, the predecessor remains effective even though the approved conditional release is present. A merged ordinary `NOT_EFFECTIVE` proposal without an exact approved conditional-release form cannot use this path.
5. **Durable activation receipt:** proposed locator `specs/012-prescription-safety-governed-overrides/decisions/graduation-governance-activation-receipt.md`. After PR A remote verification, prepare the receipt from known facts: PR A merge SHA, artifact blob identities/hashes, approval-record and manifest hashes, actual verifier/time, reference/retention accessibility and hash results, and accepted authority/impact limitations. It records no clinical approval. It contains neither its own hash nor its own future integration SHA. The exact receipt requires separate review and authorized PR B, human-only squash merge and remote-main verification. PR B changes only the approved receipt unless additional scope is explicitly authorized.
6. **Effective authority:** only when remote main contains the exact approved conditional release, its attributable approval, the verified manifest/evidence and the approved receipt with every prerequisite satisfied does this canonical version govern F012 applicability. Retain the observed PR B remote SHA in the verification evidence; the receipt need not refer to its own commit. Missing/mismatched evidence, an unresolved mandatory participation disposition or absence of exact approval for the prospective canonical/mandatory-template conditional-release bytes means no activation. Historical supporting proposals may retain their original labels; that neither activates their contents nor gives them constitutional precedence. The approval record must distinguish accepted operative decisions from retained proposals. Receipt publication does not authorize Specify.

The receipt records completion of an already approved predicate; it cannot approve unknown artifact bytes, repair a mismatch, or ratify an unapproved change. No effective-status or header rewrite follows either merge. Approved historical metadata and acceptance are not reattributed. Before activation rollback means non-activation with the predecessor still controlling; after activation any governance rollback needs a new attributable decision and retained evidence, not destructive restoration.

### Explicit lifecycle consumption

For each separately authorized F012 stage, manually read and record this effective canonical Constitution path/version/hash, approved PRD/Master/template hashes, approval-record and activation-receipt identities, observed remote-main SHA, scope and applicable gates. Read sidecars/supplement as supporting evidence, never as a second Constitution. Verify actual branch/worktree and `.specify/feature.json` context independently; pointer identity is not feature authority. No automatic supplementary-document loading is claimed. Missing/inactive/inconsistent inputs block applicability. No Tasks before required architecture decisions, approval of the exact Plan and separate Tasks authorization. F012 remains `NOT READY — PRE_SPECIFY_BLOCKED` pending governance activation, complete reviewer-boundary decisions and separate lifecycle authorization. Ten operations remain effective; 11/12 are unapproved alternatives. Spec Kit stays pinned to v1.1.3 with the established custom workflow.

## Amendment record

| Version | Date | Change |
|---|---|---|
| 3.0.0-proposed | 2026-10-15 | UNAPPROVED, NOT_EFFECTIVE: narrow F012 engineering applicability changes an otherwise unqualified Article VI prerequisite; major version recommended by the mandatory template. No historical ratification or clinical acceptance changes. |
| 2.1.0 | 2026-08-09 | Ratified as the implementation Constitution by Product Owner Yousef Osama on 9-Aug-2026; no immutable article text changed from the synchronized 2.0.0 proposal. |
| 2.0.0 | 2026-08-09 | Proposed synchronized 15-article text for Master 2.0; reconciled application count, dual clinical sign-off, Egyptian production gates, Arabic/WCAG requirements, and AI authority; ratification remains pending. |
