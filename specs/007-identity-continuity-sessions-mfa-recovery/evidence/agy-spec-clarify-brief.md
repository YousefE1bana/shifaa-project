<task>
Adversarially review the Feature-007 specification and clarification result. Read only. Give findings
first; do not edit, approve, commit, push, merge, create Issues, or authorize implementation.
</task>

<authority>
Read AGENTS.md, the Constitution, PRD v2.1.2, Master v2.1.2, Remaining Specs Roadmap Feature 007,
API Catalog, Data/RLS, Architecture, UI Contract, Traceability Matrix, v2.1.1 legal amendment, v2.1.2
readiness amendment, readiness security/team records, and specs/007-identity-continuity-sessions-mfa-recovery/spec.md,
clarification-log.md, and checklists/requirements.md. Repository authority wins.
</authority>

<attack>
Find ambiguity, scope leakage, missing actor/authorization paths, missing legal-transition edge cases,
non-deterministic security tests, incorrect status/error assumptions, operation catalog drift, shadow
auth/session state, record-continuity risk, offline/replay/race gaps, notification/privacy leakage,
Arabic/English/accessibility omissions, and success criteria that cannot be proven. Check exact four FRs
and eight operations. OPEN-LEGAL-006 is closed and must not be reopened.
</attack>

<forbidden_expansion>
Reject Feature 008, new relationship types, new endpoints/operation IDs, platform roles, shadow
credential/session state, direct Auth-table mutation, production Valify/SMS/passkeys/PHI, or weakening
of the approved v2.1.1/v2.1.2 rules.
</forbidden_expansion>

<output_contract>
List CRITICAL/HIGH/MEDIUM/LOW findings with exact file/line evidence and smallest bounded correction.
Then list scope-expanding proposals separately and state whether any unresolved issue prevents
SPEC_APPROVED. AGY is advisory; parent accepts/rejects every finding.
</output_contract>
