<task>
Act as the adversarial repository reconciliation reviewer for closing SHIFAA OPEN-LEGAL-006 at the
Feature-007 specification/development stage. This is a read-only review. Do not edit files, approve a
gate, perform legal research, reinterpret Egyptian law, or request/reproduce any lawyer identity.

Authority and premise:

- Repository baseline for this branch is origin/main ccd76c4875821beb246fa3b0abf32f225c54f6ae plus
  readiness commit 91868636693b008aca1c75b4b8f3d658114a1d0f.
- The Product Owner has approved an external Egyptian legal transition analysis as SHIFAA's
  development-stage legal basis. The only permitted source label is exactly:
  "External Egyptian legal counsel analysis — Product Owner approved".
- Do not reopen or independently validate the legal research. Reconcile only the frozen rules below
  against repository authority.
- Read AGENTS.md, shifaa-prd.md FR-FAM-003 and OPEN registers,
  SHIFAA-Implementation-Plan-MASTER.md lifecycle/gates/register,
  docs/governance/SHIFAA-Remaining-Specs-Roadmap.md section 007,
  docs/governance/SHIFAA-Completion-Coverage.md relevant rows,
  docs/architecture/SHIFAA-API-Catalog.md transitionDependent,
  docs/architecture/SHIFAA-Data-RLS.md existing identity/care relationship model,
  docs/traceability/SHIFAA-Traceability-Matrix.md FR-FAM-003, and current Feature-007 readiness files.

Frozen legal rules; these are the entire legal closure boundary:

1. 18 is not an automatic SHIFAA account-transfer trigger.
2. 21 starts eligibility and verification, not silent automatic transfer.
3. Transition requires identity proofing and reviewed confirmation.
4. Active interdiction, a controlling court order, or a dispute blocks automatic transition and
   requires human review.
5. Successful transition preserves the same patient and clinical record.
6. Prior guardian acting authority does not continue automatically after approved transition.
7. Any later guardian or delegate access requires a separately lawful relationship or grant.

Frozen repository boundary:

- Exact active requirements: FR-AUTH-002, FR-AUTH-005, FR-FAM-003, FR-ADMIN-002.
- Exact Feature-007 operations: refreshSession, logout, beginMfaEnrollment, verifyMfaEnrollment,
  removeMfaFactor, startRecovery, completeRecovery, transitionDependent.
- Existing relationship types remain exactly self, guardianship, delegation.
- Do not propose new relationship types, endpoints, operation IDs, shadow auth/session state,
  physical tables, columns, DDL, legal-status fields, holds, role splits, or wider scope.
- OPEN-LEGAL-001, OPEN-LEGAL-002, OPEN-LEGAL-007 and every production-PHI authorization remain open
  and unchanged.

Proposed minimum development-stage governance clarification to attack:

- A versioned Product Owner-approved amendment records that anonymous external Egyptian legal counsel
  analysis is acceptable evidence for OPEN-LEGAL-006 specification/development closure when the
  repository stores only the exact source label above and the frozen rule/matrix/test artifact.
- Product Owner approval remains attributable by name/date/artifact digest.
- The old DPO co-owner wording is clarified: it does not require a registered-DPO signature merely to
  freeze these development rules with synthetic data and no evidence intake. It does not waive any
  DPO/legal approval, processing inventory, retention, official-Arabic-source, processor, or
  production-PHI obligation under OPEN-LEGAL-001/002/007.
- Synchronize only the PRD/Master OPEN registers and version history, roadmap gate references,
  FR-FAM-003 traceability/coverage status, and Feature-007 readiness closure record. Do not revise
  completed Feature 004 historical artifacts.

Proposed legal state/event matrix to attack (logical contract only, not a data model):
| State | Entry/event | Required proof/review | Authority effect |
| not_eligible | before 21, including reaching 18 | none | no transition and no authority mutation |
| verification_required | verified clock reaches 21 | identity proofing required | eligibility only; no transfer |
| review_required | identity proof succeeds | reviewed confirmation required | no transfer while pending |
| human_review_blocked | active interdiction, controlling court order, or dispute is identified | human review of controlling evidence | no automatic transition; apply no inferred outcome |
| approved | identity proof and reviewed confirmation both succeed with no unresolved blocker | attributed human decision | same patient/clinical record; prior guardian acting authority ends for this approved transition |
| not_approved | proof/review fails, is rejected, expires, or remains unresolved | attributed outcome where applicable | no transition; do not infer a new legal status |
| later_access | after approved transition, a guardian/delegate access request occurs | separately lawful existing canonical relationship/grant | no access from the former authority; only the new grant's exact scope applies |

Proposed deterministic vector families to attack:

- age 18 minus/exact/plus: no automatic transition or authority change;
- age 21 minus: not eligible; exact/plus: eligibility only, no transfer;
- age 21 with missing, failed, mismatched, expired, or unreleased identity proof: no transition;
- valid identity proof without reviewed confirmation: no transition;
- active interdiction, controlling court order, or dispute: automatic path blocked, human review
  required, no inferred guardian continuation/termination;
- approved transition: exactly one reviewed winner, same patient ID/clinical record, prior guardian
  acting authorization denied on the next check, attributed audit/outbox/idempotency result;
- concurrent approve/reject, stale version, identical replay, changed-body replay;
- former guardian attempts each existing permission after approval: denied from prior authority;
- later guardian/delegate request without a separate lawful relationship/grant: denied; with one:
  only current validity, purpose, and exact permissions apply;
- cross-patient, self-review, wrong reviewer role, missing AAL/purpose, and forced-RLS negatives;
- gate/source provenance test: repository contains only the approved source label and no counsel name.

Review questions:

1. Do the seven rules and matrix faithfully close only the legal ambiguity named by FR-FAM-003 and
   transitionDependent without selecting unapproved technical persistence?
2. Which canonical/governance files must change to eliminate contradictions while keeping the change
   minimal and preserving the approved-baseline digest rules?
3. Which matrix rows or test vectors are ambiguous, over-broad, missing, or inconsistent with the
   existing API/Data/RLS contracts?
4. Does any proposed wording accidentally waive production DPO/legal obligations or imply production
   PHI readiness?
   </task>

<action_safety>
Read-only. Do not edit, commit, push, merge, create issues, contact people, request counsel identity,
or access the external memo. AGY gives findings only. The parent accepts/rejects with repository
evidence and owns all changes.
</action_safety>

<structured_output_contract>
Return findings first, ordered CRITICAL/HIGH/MEDIUM/LOW. For each: cite repository evidence, identify
the exact challenged rule/matrix/vector/governance statement, and give a bounded correction that does
not add an endpoint, relationship type, table, column, auth/session state, or scope. Then list:
(1) rules/matrix/vectors accepted as written, (2) exact governance files that genuinely must change,
(3) proposed finding-by-finding parent decisions, and (4) whether this closure would remove only
OPEN-LEGAL-006 while preserving OPEN-LEGAL-001/002/007. Explicitly state AGY cannot approve the gate.
</structured_output_contract>
