# T035 read-contract reconciliation

> **Decision:** Product Owner approved
>
> **Approver:** Yousef Osama
>
> **Date:** 2026-08-28
>
> **Scope:** Feature 007 T035-T037, seeded-synthetic development only

The Product Owner resolved the T035 read-contract conflict without adding an endpoint or operation.
Feature 007 remains exactly the frozen eight operations. Feature 004 ownership and its existing
guardianship-review behavior are unchanged.

## Approved backward-compatible reads

- `listGuardianshipCases` (`GET /admin/guardianships`) accepts optional
  `mode=dependent_transition`. That mode returns only the assigned continuity case's relationship ID,
  transition case ID, closed workflow state, continuity-case version, minimum proof/review/blocker
  state, and UI timestamps. The server binds assignment to the authenticated ADM-SUPPORT person;
  client-supplied assignee data is neither accepted nor trusted.
- `listRelationships` (`GET /patients/{managedPatientId}/relationships`) accepts optional
  `includeDependentTransition=true`. Only the patient subject may receive the minimum transition
  summary. It reports workflow/UI state and the frozen same-record/prior-authority consequences
  without inferring legal capacity or exposing evidence, documents, Auth data, or unnecessary identity
  data.

The existing default response paths remain backward compatible. The guardianship relationship
version is never substituted for `continuityCaseVersion`.

## Preserved boundaries

- No endpoint, operation ID, role, relationship type, legal conclusion, Auth-table write, service-role
  request path, client database access, or Feature 008 surface is added.
- `identity.continuity_cases` remains private with forced RLS. Admin worklist selection requires both
  the existing RLS policy and an explicit server-side `assigned_reviewer_person_id` predicate.
- Patient summary selection requires the existing self relationship and subject-owned continuity row.
- Default Feature 004 clients continue to receive the pre-reconciliation guardianship and relationship
  projections unless they opt into the new read mode/summary.
