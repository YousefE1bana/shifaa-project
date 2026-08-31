# OPEN-TEAM-001 — approved SHIFAA operating model

> **Status:** CLOSED
>
> **Approved by:** Yousef Osama, Product Owner and Team Lead
>
> **Approval date:** 2026-08-25
>
> **Effect:** named accountability for specification, implementation assignment, academic review, and
> security escalation; no independent team-member approval of SpecKit artifacts

## Approved ownership model

| Person              | Approved responsibility                                                                                                                       | Lifecycle authority                                                                                                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Yousef Osama        | Product Owner, Team Lead, Architecture Lead, SpecKit/Governance Owner, and current pre-implementation engineering/security decision authority | Sole owner of `specify -> clarify -> plan -> tasks -> analyze -> taskstoissues`; approves the development-stage governance/specification baseline and assigns later implementation work. |
| Mostafa Ali         | Security Lead when team implementation activates                                                                                              | Owns implementation-stage security review and security findings under Yousef's approved specs/tasks; does not separately approve pre-implementation SpecKit artifacts.                   |
| Diaa Eldin Assem    | Backend/Core API implementation                                                                                                               | Implements assigned API/domain work later; does not own requirements or lifecycle approval.                                                                                              |
| Ibrahim Saeid       | Data/PostgreSQL/RLS implementation                                                                                                            | Implements assigned migrations, constraints, and forced-RLS work later; does not own requirements or lifecycle approval.                                                                 |
| Amira Saad          | QA/testing/evidence                                                                                                                           | Executes assigned automated/live evidence work later; does not own requirements or lifecycle approval.                                                                                   |
| Ziad Wael           | Frontend/UI/A11y/integration                                                                                                                  | Implements assigned UI, bilingual accessibility, and integration work later; does not own requirements or lifecycle approval.                                                            |
| Dr Asmaa Hekal      | Academic Supervisor                                                                                                                           | Academic supervision; not a substitute for Product, legal/DPO, clinical, security, or release approval.                                                                                  |
| TA Mahmoud Ghalwash | Academic Reviewer/TA                                                                                                                          | Academic review; not a substitute for Product, legal/DPO, clinical, security, or release approval.                                                                                       |

## RACI and activation boundary

- Yousef is accountable and responsible for Feature-007 scope, architecture, pre-implementation
  security decisions, SpecKit artifact decisions, task publication, and escalation before
  implementation authorization.
- Named team members are responsible for their assigned implementation/evidence lanes only after
  Yousef authorizes implementation from an approved task baseline.
- Individual team-member acknowledgement, contact method, and rotation activation are operational
  implementation-start records. They are not independent approvals and do not block
  `SPEC_APPROVED` under this operating model.
- Before implementation begins, Yousef records assignment by task/Issue. Mostafa is the primary
  implementation security escalation; Yousef remains accountable and is the pre-implementation
  escalation point.
- Academic supervisor/TA review does not close professional legal, DPO, clinical, security-testing,
  vendor, or production-release gates.

## Preserved governance boundaries

This closure assigns no unproven specialty beyond the Product Owner-approved model, creates no sixth
admin role, and grants no repository/runtime permission. External counsel identity remains unrecorded.
`OPEN-LEGAL-001`, `OPEN-LEGAL-002`, `OPEN-LEGAL-007`, clinical gates, vendor gates, UX gates,
technology/reproducibility gates, and production-PHI authorization retain their canonical effects.

The v2.1.2 governance amendment records the attributable Product Owner decision and artifact digest.
`OPEN-TEAM-001` no longer blocks Feature 007 or later features at `SPEC_APPROVED`; implementation
still requires Yousef's explicit authorization under approved specs/tasks.
