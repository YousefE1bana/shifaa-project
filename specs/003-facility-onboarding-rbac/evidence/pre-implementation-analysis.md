# Pre-implementation SpecKit Analysis

Date: 2026-08-11
Feature: `003-facility-onboarding-rbac`
Gate result: **PASS — zero remaining CRITICAL or HIGH findings**

## Inputs

- `spec.md` 0.1.1
- `plan.md`
- `research.md`
- `data-model.md`
- `contracts/openapi.yaml`
- `contracts/admin-role-actions.yaml`
- `tasks.md`
- Current canonical PRD, Master Plan, Architecture, API Catalog, Data/RLS, UI Contract, Traceability, Constitution, and completed 001/002 artifacts

## Metrics

| Check                          | Result                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| Tasks                          | 30 unique, sequential IDs                                                           |
| Feature OpenAPI                | 22 unique canonical operations                                                      |
| Acceptance                     | `AC-01` through `AC-24` traced                                                      |
| Target functional requirements | 7/7 covered by tasks                                                                |
| Canonical admin matrix         | 5/5 roles; catalog parity: super 10, support 11, medical 11, facility 14, finance 2 |
| Placeholder markers            | 0 actionable                                                                        |
| CRITICAL/HIGH remaining        | 0                                                                                   |

## Resolved findings

| ID    | Severity | Finding                                                                                                                                | Resolution                                                                                                                                                                   |
| ----- | -------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A-001 | HIGH     | `FacilityPatch` inherited all `FacilityCreate` required properties and incorrectly allowed type mutation.                              | Replaced it with a minimum-one-property schema containing only mutable bilingual/address fields; facility type is explicitly immutable.                                      |
| A-002 | HIGH     | One review-decision schema admitted `verify` for facilities and `approve` for professional licenses.                                   | Added separate facility and professional decision schemas with exact state-machine enums.                                                                                    |
| A-003 | HIGH     | FR-ADMIN-001 artifacts described only the five 003 governance operations, leaving the other four canonical roles under-specified.      | Added an API-Catalog-derived five-role registry with exact parity and explicit availability. Only existing/003 rows may seed; later and forbidden scope remains unavailable. |
| A-004 | HIGH     | The facility state diagram exposed a `closed` transition without a canonical 003 operation.                                            | Removed the transition and documented `closed` as readable compatibility state only.                                                                                         |
| A-005 | MEDIUM   | Task acceptance referred to 20 outcomes / AC-22 while the specification defines 24 acceptance criteria plus 20 required live outcomes. | Corrected task traceability to AC-24 and retained the separate 20-outcome live journey requirement.                                                                          |

## Consistency conclusions

- No duplicate or invented 003 endpoint exists.
- Excluded directorship, operational facility, Family Care, DSR, discovery/SOS, AI, real-document, and production-approval behavior remains excluded.
- Canonical open items remain visible and continue to block formal/production approval, not the explicitly authorized seeded-synthetic engineering lifecycle.
- Task dependencies are acyclic and order contracts/policy/tests before persistence, API, UI, and live verification.
- Every implementation task names an intended repository path and acceptance evidence.
