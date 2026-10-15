# Coded prescription input — engineering proposal

**PROPOSED / NOT APPROVED.** The merged addendum records Yousef's separately authored engineering-fixture direction as [approved in principle only](../../../docs/governance/SHIFAA-F012-Boundary-and-Governance-Addendum.md#L15-L24). It explicitly leaves version 1.0.0, schema, manifest, field mapping and admissible values awaiting review. Its [proposed-successor status and authorization limits](../../../docs/governance/SHIFAA-F012-Boundary-and-Governance-Addendum.md#L3-L11) must not be read as exact candidate approval. The current instruction authorizes this bounded audit/correction, not a lifecycle stage, runtime schema, production vocabulary or clinical/legal approval. No new approval record is created.

## Minimum boundary and source authority

[Data/RLS line 61](../../../docs/architecture/SHIFAA-Data-RLS.md#L61) requires product/ingredient coding, strength, form, route, dose/frequency/duration/quantity, indication, content-version controlled/NTI flags and item status. [Storage conventions](../../../docs/architecture/SHIFAA-Data-RLS.md#L8-L14) specify numeric quantities plus unit codes, textual codes, UUID identity and UTC timestamps. [API catalog](../../../docs/architecture/SHIFAA-API-Catalog.md#L152-L161) owns items in create/update and safety digest/version operations; it does not yet define complete wire schemas.

Existing [F011 coding representation](../../../packages/contracts/src/feature-011.ts#L665-L681) provides a closed known(system/code/display)/unknown representation for allergies. That is a structural precedent only; it is not an approved F012 product vocabulary. [F011 source boundary](../../011-allergies-clinical-content-governance/contracts/governance-boundaries.md#L97) explicitly says no real known-coding source was identified. [F011 approval](../../011-allergies-clinical-content-governance/decisions/product-owner-approvals-2026-10-02.md#L15-L17) approves no real medical content or F012 capability.

Propose mandatory nonempty version-bound product and ingredient coding plus the complete item shape for engineering structural review. Display text cannot be the sole product identity. Whether an ingredient-only product representation is admissible, unknown ingredient nullability, authoritative wire types/units and product mappings require review; do not treat this candidate's stricter all-fields shape as an approved production requirement. Unknown/unstandardized input remains `not_fully_checked`, never safe ([PRD SAFE-003](../../../shifaa-prd.md#L159)).

No approved production prescribing vocabulary is established by the feature-relevant records inspected. [FR-PHARM-007](../../../shifaa-prd.md#L180) requires versioned EDA-approved/public imports with provenance and reviewer approval, owned by [F013](../../../docs/governance/SHIFAA-Remaining-Specs-Roadmap.md#L128-L134). F012 must not invent that source or depend backwards on F013. Production-source admissibility remains OPEN: Yousef decides engineering/product boundary; Medical Director + Chief Pharmacist and applicable regulatory/legal authorities must establish source admissibility with signed provenance. Production prescribing remains disabled pending applicable release gates.

## Candidate field map

All JSON carrier details below are proposals, not approved API/DDL. Schema is closed against unknown fields. Every item field is present and non-null in the candidate; production nullability and clinical admissibility remain unresolved.

| Proposed field | Type / units / candidate values | Canonical basis / limitation |
| --- | --- | --- |
| prescriptionId | synthetic UUID | Prescription FK, Data/RLS 61; not a real persisted prescription |
| productCoding, ingredientCoding | closed system/code/version object, namespace urn:shifaa:engineering:f012; SYNTHETIC_* tokens only | Product/ingredient coding, Data/RLS 61; F011 structure precedent; version field proposed; no real code |
| strength | decimal string + synthetic unitCode | Strength and numeric/unit convention, Data/RLS 11/61; decimal-string wire encoding proposed |
| formCoding, routeCoding | synthetic coding objects | Form/route, Data/RLS 61; approved vocabulary and route restrictions remain OPEN |
| dose, frequency, duration, quantity | decimal string + synthetic unitCode | Required logical fields and storage convention; dimension-specific production units and schedule shape remain OPEN |
| indicationCoding | synthetic coding object | Indication required logical field; coding carrier proposed, not a new mandatory production coding policy |
| classificationEvidence | synthetic contentVersion + controlled/nti booleans | Flags must derive from content version (Data/RLS 61); these flags exercise branches only |
| itemStatus | literal SYNTHETIC_ITEM_STATUS | Item status field required; production status enum not supplied by canonical table |
| itemId / caseId | synthetic UUID / case token | Engineering identity only, not extra API input authority |

Decimal strings such as 0, 1 and 2 illustrate structural values, not clinically valid doses, strengths or durations. Each carrier has its own literal token: SYNTHETIC_STRENGTH_UNIT, SYNTHETIC_DOSE_UNIT, SYNTHETIC_FREQUENCY_UNIT, SYNTHETIC_DURATION_UNIT and SYNTHETIC_QUANTITY_UNIT. These tokens label a proposed field role only; they establish no physical dimension, conversion, schedule or clinical validity. Production units, nullability and admissible ranges remain unresolved. The three mechanism cases use distinct synthetic product/ingredient and mock content-version identities. Purpose conditionals require false/false, true/false and false/true respectively; no combined-true case is scoped. Neither true nor false classifies a real medicine. No warning rule, interaction, allergy, diagnosis, dose limit, emergency window or safety verdict is authored.

## Provenance, versions and exclusions

- Author: Codex, under Yousef's bounded readiness mission; separately authored on 2026-10-14. No copying of F011 fixture bodies, patient data, external catalogs or medicine codes.
- Schema 0.2.0-proposal and dataset 1.0.0 PROPOSED_NOT_APPROVED are independent. The proposal schema revision corrects structural inconsistencies; validation does not approve either version. Namespace, zero-prefix UUIDs and mock contentVersion identifiers are visibly synthetic. A mock contentVersion is never an F011 release, digest, signature, source authority or reviewer qualification. Manifest hashes bind the final schema/data/mapping/validator bytes; changes invalidate prior review and require updated hashes/version review.
- Files live only in readiness, with no production loader, seed, migration, generated client, API registration or UI import. Exclusion flags and placement are proposal safeguards; this mission implements no runtime guard and claims no runtime proof. Future implementation must reject this namespace and unapproved source in production at API/core/persistence and content-publication boundaries.
- A synthetic code can prove parser, mapping, provenance and branch mechanics only. F011 licensed reviewer/content authority, publication and evidence protocols must not be spoofed by a synthetic contentVersion.
- Review exact schema, manifest, every field mapping, units/nullability, admissible structural values and exclusion vectors before approving a dataset. Record approved hashes and approval limits. Production terminology approval is separate.

The read-only [validator](validate-readiness.ps1) checks the candidate against the proposed JSON Schema, then separately checks unique caseId/itemId and consistent flags for each identical product system/code/version plus mock contentVersion. Its in-memory negative probes cover non-engineering envelopes, non-synthetic codes/namespaces, missing coding/content versions, extra fields, mismatched purpose/flags, combined-true flags, duplicate IDs, conflicting classifications, all five field-specific unit tokens and manifest hash/entry failures. These are schema and cross-record structural checks, not clinical semantic validation. Exact command, runtime versions and results are in [evidence](evidence.json).

Production namespace rejection and cross-patient/prescription linkage are required future authorized runtime evidence, not established by placement or passing this validator. Unknown-input and incomplete-history clinical action policies remain OPEN in the [Plan matrix](plan-readiness-matrix.md).
