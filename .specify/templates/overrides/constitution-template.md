# SHIFAA Constitution Amendment Proposal

> **Publication form:** PROSPECTIVE CONDITIONAL RELEASE — approval/effectiveness is established only by the bound approval and activation records.
> **Conditional publication state:** APPROVED_FOR_CONDITIONAL_ACTIVATION (prospective only; this header asserts no approval).
> **Current preparation limit:** Exact Product Owner approval is not recorded by preparation of this form; predecessor authority continues until verified activation.
> **Publication bundle:** F012-GOVERNANCE/3.0.0
> Template changes take effect only with the canonical Constitution's verified activation receipt. Until then use the predecessor template at `862db9f66c19ccb8efa9163e5221845225b62174`.

> This is not a generic constitution generator. The canonical Constitution is [`.specify/memory/constitution.md`](../../memory/constitution.md) and contains exactly the 15 articles below. `/speckit.constitution` may propose a versioned amendment, but MUST NOT replace, delete, rename, or weaken an article without Product Owner approval, rationale, impact/migration analysis, and synchronized PRD/Master/template/contract changes.

## Proposal metadata

| Field | Value |
|---|---|
| Proposed version | `[MAJOR.MINOR.PATCH]` |
| Proposer | `[name/role]` |
| Date | `[YYYY-MM-DD]` |
| Product Owner decision | `[pending / approved / rejected]` |
| Rationale and evidence | `[objective conflict/source/change]` |
| Affected FR/NFR/contracts/specs | `[IDs and paths]` |
| Migration/compatibility impact | `[exact]` |

## Canonical articles — preserve verbatim unless the proposal explicitly amends them

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

## Amendment decision

| Article/section | Exact old text | Exact proposed text | Objective reason/evidence | Migration/affected artifacts |
|---|---|---|---|---|
| `[article]` | `[verbatim]` | `[verbatim]` | `[source/conflict]` | `[paths/IDs]` |

## Governance checklist

- [ ] Product Owner decision and date are attributable.
- [ ] Version impact is correct; weakening/removing an article is a major version.
- [ ] Security, legal/DPO, clinical, architecture, design, and QA reviewers are included where affected.

For the F012 isolated non-clinical constitutional-applicability amendment only, record each affected discipline separately as actual attributable participation, unavailable, unresponsive, or review not obtained. Record the materials and versions offered, date and response evidence when an invitation actually occurred; do not invent outreach or infer unresponsiveness from missing evidence. Separate engineering impact analysis from professional consultation. Under this amended internal procedure, exact Product Owner amendment approval may accept a documented missing-participation disposition for this narrowly bounded engineering applicability, including consequences, limitations and required follow-up. The inclusion checklist then records the accepted procedural disposition, never a completed professional review. This alternative has no authority before its exact governed approval and activation. It does not waive Article VI dual senior-physician/medical-director and clinical-pharmacist signatures for real clinical code, rules, severity, exceptions, clinical test vectors or operational use; lawful disclosure, legal/privacy, credential, facility and production restrictions remain intact. No unperformed professional review may be marked complete, PASS or N/A, and no other feature or gate receives this procedural alternative.

- [ ] PRD, Master, canonical Constitution, SpecKit templates, API/data/UI contracts, trace matrix, and active specs are updated together.
- [ ] Migration/backward-compatibility and release impact are documented.
- [ ] No `OPEN-*` judgment was silently converted into constitutional fact.

### Proposed F012 review and consumption clarification

Keep the exact existing Article VI paragraph and identify the additional F012 applicability paragraph separately in the old/new comparison. Its narrowing of an unqualified prerequisite is a major-version candidate, not an approved minor amendment. The canonical Constitution is the sole normative constitutional locator; a versioned sidecar is decision/evidence only. Historical specifications and approval hashes remain tied to their original commits.

Distinguish Product Owner amendment approval, affected-discipline participation/impact review, and Article VI dual clinical sign-off. The inclusion checklist does not itself require affirmative clinical-professional acceptance of a non-clinical amendment. Use the narrow F012 procedural disposition above only after exact amendment approval and activation; record unavailable participation honestly and never represent engineering assessment as professional approval. Preserve the checklist above and record each affected API/data/UI/traceability/spec/template change or accepted unchanged disposition before activation.

Use the canonical Constitution's fixed publication states and two-phase procedure: review candidate; exact approved conditional release and hash-bound decision; authorized PR A/human merge; remote verification; separately reviewed receipt in PR B/human merge; verified activation; separate lifecycle authorization. Before activation the predecessor templates and baseline remain effective. Final status text is reviewed before approval, not rewritten after merge. The manifest excludes the approval record and receipt; neither record binds its own future bytes. The receipt binds only known PR A content and evidence. No automatic loading or applicability follows a merged NOT_EFFECTIVE file.
