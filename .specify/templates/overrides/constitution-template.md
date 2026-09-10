# SHIFAA Constitution Amendment Proposal

> This is not a generic constitution generator. The canonical Constitution is [`.specify/memory/constitution.md`](../memory/constitution.md) and contains exactly the 15 articles below. `/speckit.constitution` may propose a versioned amendment, but MUST NOT replace, delete, rename, or weaken an article without Product Owner approval, rationale, impact/migration analysis, and synchronized PRD/Master/template/contract changes.

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
- [ ] PRD, Master, canonical Constitution, SpecKit templates, API/data/UI contracts, trace matrix, and active specs are updated together.
- [ ] Migration/backward-compatibility and release impact are documented.
- [ ] No `OPEN-*` judgment was silently converted into constitutional fact.
