# Clarification Log: Family Care Relationships

**Date:** 2026-08-11
**Result:** No unresolved ambiguity requires a Product Owner question before planning.

## Canonical resolutions

| Topic                      | Resolution                                                                                                                                                                         | Source of truth                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Active scope               | Implement only `FR-FAM-001`, `FR-FAM-002`, `FR-FAM-004`, `FR-FAM-005`, `FR-FAM-006`, `FR-FAM-007`, and `FR-FAM-008`.                                                               | PRD v2.1.0 and explicit Product Owner directive          |
| Age/capacity transition    | `FR-FAM-003`, `transitionDependent`, and every automatic age/capacity transition are excluded and remain blocked by `OPEN-LEGAL-006`.                                              | PRD, API Catalog, Traceability Matrix                    |
| API boundary               | The slice contains the 12 Family Care operation IDs enumerated in `spec.md`; no guardianship upload or SOS-creation endpoint is invented.                                          | API Catalog v1.1.0                                       |
| Guardianship evidence      | Seeded-synthetic creation references a pre-provisioned, private, scanner-released evidence object. Production intake remains blocked by the incomplete canonical payload contract. | Data/RLS, API Catalog, `OPEN-TECH-002`                   |
| Emergency Contact alerting | 004 establishes the consent, event, worker-policy, and minimum-disclosure boundary. A later SOS feature creates qualifying incidents and requests delivery.                        | `FR-FAM-005`, `FR-FAM-006`, Master sequencing            |
| Relationship revocation    | `revokeRelationship` is limited to guardianship/delegation revocation authorized by the active 004 requirements and performs no dependent transition.                              | API Catalog operation mapping plus excluded `FR-FAM-003` |
| Production/formal gates    | Canonical legal, retention, reviewer, and UI-baseline open items stay open. They do not authorize real data or a production-release claim.                                         | Constitution, Master §11, open register                  |

## Coverage result

The specification resolves actors, current-state authorization, states and terminal transitions, permissions, purpose/AAL, idempotency, concurrency, RLS, audit/outbox, minimization, bilingual UI, accessibility, degraded paths, performance, observability, rollback, and seeded-synthetic boundaries. The remaining `OPEN-*` items are named governance gates rather than ambiguities that engineering may guess around.
