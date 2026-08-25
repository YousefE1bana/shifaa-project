# OPEN-TEAM-001 — named RACI decision request

> **Status:** OPEN; proposal only
>
> **Gate owner:** Yousef Osama, Product Owner and Team Lead
>
> **Required closure:** named owners, reviewers, supervisor/TA, and on-call/security contacts, each
> acknowledged; this document is not an acknowledgement

## Evidence inspected

Repository and live GitHub evidence as of 2026-08-25 establish only the following:

- The approved Master/PRD baseline and baseline-approval record name Yousef Osama as Product Owner.
- Git history, Issues, and pull requests attribute the delivered repository work to Yousef's account.
- The live collaborator API shows repository access for `YousefE1bana`, `Diaa-AI`, `AmiraSaad747`,
  `ibrahimsaeed2626`, and `most-aly85`. Access level is not evidence of Architecture, Security, QA,
  privacy, legal, or on-call competence.
- No repository document names Mostafa Ali, Diaa Eldin Assem, Ibrahim Saeid, Amira Saad, or Ziad
  Wael in a specialty or reviewer role. The candidate collaborator-to-person matches also require
  confirmation; no collaborator identity for Ziad was established.
- No named academic supervisor/TA or registered DPO was found. The identity of external Egyptian
  legal counsel is deliberately neither requested nor stored; the approved development-stage source
  is recorded only as `External Egyptian legal counsel analysis — Product Owner approved`.
- No pull-request review or acknowledgement from the non-Yousef roster members was found.

Commands used included `git shortlog -sne --all`, exact-name repository searches, and live GitHub
collaborator/contributor/Issue/PR-review API queries. No specialty is inferred from a username.

## Smallest proposed Feature-007 mapping

The allocation below is deliberately a **nomination**, not a statement of existing specialty. It uses
the supplied roster once each so Yousef can approve or replace names in one decision.

| Function                                                                             | Proposed person  | RACI                        | Required acknowledgement                                                                                             |
| ------------------------------------------------------------------------------------ | ---------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Product scope, final gate decision, team leadership, incident escalation             | Yousef Osama     | A                           | Confirm Product Owner/Team Lead and escalation authority.                                                            |
| Owning engineer; backend/data delivery coordinator                                   | Mostafa Ali      | R                           | Confirm competence, availability, and GitHub identity.                                                               |
| Architecture Lead; API/data/RLS design reviewer; OPEN-SEC co-approver                | Diaa Eldin Assem | A/R for architecture        | Confirm competence, independence for review, availability, and GitHub identity.                                      |
| Security Lead; threat-model reviewer; primary security on-call; OPEN-SEC co-approver | Ibrahim Saeid    | A/R for security            | Confirm competence, contact/rotation, availability, and GitHub identity.                                             |
| QA/evidence owner; deterministic-test and bilingual acceptance reviewer              | Amira Saad       | R                           | Confirm competence, independence for acceptance, availability, and GitHub identity.                                  |
| Integration/UI/accessibility reviewer; secondary engineering on-call                 | Ziad Wael        | R                           | Confirm competence, contact/rotation, availability, and GitHub identity.                                             |
| Academic supervisor/TA                                                               | **Unassigned**   | A/R as institution requires | Yousef must supply the name, role, contact, and acknowledgement; do not assume the Team Lead fills an academic role. |

The registered-DPO and production legal responsibilities are not silently assigned from the
engineering roster. They remain governed by the production/release `OPEN-LEGAL-001`,
`OPEN-LEGAL-002`, and `OPEN-LEGAL-007` gates. External counsel identity is not part of
`OPEN-TEAM-001` or the development-stage `OPEN-LEGAL-006` record.

## Exact approval requested from Yousef

Return a dated decision that:

1. approves the table or supplies replacements;
2. confirms each person's GitHub identity and whether they acknowledged the assignment;
3. names the academic supervisor/TA and records acknowledgement;
4. identifies primary and secondary security/on-call contact methods and the coverage/rotation rule;
5. preserves separate assignment and approval of regulated production/DPO responsibilities under
   their applicable production/release gates, without treating an engineering role as professional
   registration or recording external counsel identity; and
6. records the approved artifact version/digest and any required reviewer independence.

Until that attributable decision and acknowledgement exist, `OPEN-TEAM-001` remains open and Feature
007 cannot reach `SPEC_APPROVED`.
