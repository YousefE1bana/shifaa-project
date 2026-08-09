# SHIFAA Constitution

> **Version:** 2.1.0  
> **Status:** Ratified — Product Owner approved  
> **Proposed:** 2026-08-09  
> **Ratified:** 9-Aug-2026  
> **Approved by:** Yousef Osama  
> **Approval version:** v2.1.0  
> **Approval record:** [`../../docs/governance/SHIFAA-Baseline-Approval-v2.1.0.md`](../../docs/governance/SHIFAA-Baseline-Approval-v2.1.0.md)  
> **Last amended:** 2026-08-09  
> **Authority:** [`../../SHIFAA-Implementation-Plan-MASTER.md`](../../SHIFAA-Implementation-Plan-MASTER.md), Section 3

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

## Amendment record

| Version | Date | Change |
|---|---|---|
| 2.1.0 | 2026-08-09 | Ratified as the implementation Constitution by Product Owner Yousef Osama on 9-Aug-2026; no immutable article text changed from the synchronized 2.0.0 proposal. |
| 2.0.0 | 2026-08-09 | Proposed synchronized 15-article text for Master 2.0; reconciled application count, dual clinical sign-off, Egyptian production gates, Arabic/WCAG requirements, and AI authority; ratification remains pending. |
