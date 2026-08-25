# AGY adversarial task-baseline review brief

Review Feature 007's task baseline as a hostile, read-only second reviewer. Use HIGH reasoning.

## Authority and immutable scope

- Repository: `D:\ECU\Gradution-Project-007-identity-continuity-sessions-mfa-recovery`
- Baseline: `origin/main` at `ccd76c4875821beb246fa3b0abf32f225c54f6ae`
- Feature: `007-identity-continuity-sessions-mfa-recovery`
- Required operations only: `refreshSession`, `logout`, `beginMfaEnrollment`,
  `verifyMfaEnrollment`, `removeMfaFactor`, `startRecovery`, `completeRecovery`,
  `transitionDependent`.
- Required IDs only: `FR-AUTH-002`, `FR-AUTH-005`, `FR-FAM-003`, `FR-ADMIN-002`.
- OPEN-LEGAL-006, OPEN-TEAM-001, and OPEN-SEC-001 are closed. Do not reopen them.
- Do not invent endpoints, relationship types, roles, tables, shadow Auth/session authority,
  production authorization, Feature 008 work, implementation, or merge approval.

## Files to review

Read the repository governance and the complete Feature 007 artifact set, especially:

- `AGENTS.md`
- `docs/governance/SHIFAA-Remaining-Specs-Roadmap.md`
- `specs/007-identity-continuity-sessions-mfa-recovery/spec.md`
- `specs/007-identity-continuity-sessions-mfa-recovery/plan.md`
- `specs/007-identity-continuity-sessions-mfa-recovery/research.md`
- `specs/007-identity-continuity-sessions-mfa-recovery/data-model.md`
- `specs/007-identity-continuity-sessions-mfa-recovery/contracts/openapi.yaml`
- `specs/007-identity-continuity-sessions-mfa-recovery/quickstart.md`
- `specs/007-identity-continuity-sessions-mfa-recovery/tasks.md`

## Attack goals

Find only evidence-backed defects in the task baseline:

1. Missing dependencies or unsafe ordering, including migration/RLS/Auth/worker/concurrency order.
2. Missing negative, boundary, replay, race, failure-resume, oracle, evidence, or acceptance tests.
3. Requirements or operation coverage gaps, compressed IDs, or tasks that cannot yield auditable proof.
4. Scope leakage or contradictions with the approved spec, plan, Data/RLS, API catalog, or roadmap.
5. Tasks whose claimed parallelism conflicts with shared files or unmet prerequisites.
6. Any task that weakens preserved production security/legal/PHI gates.

## Report contract

Return findings first, ordered HIGH to LOW. For every finding provide:

- severity;
- exact task/file/line evidence;
- the contradicted canonical evidence;
- the smallest correction that remains inside frozen scope.

Then report explicit checks for: all 48 task IDs, all 4 FRs, all 23 NFRs, all 8 operations,
dependency direction, story checkpoint independence, negative/security evidence, and no 008/merge scope.
If no actionable defect remains, say `ZERO ACTIONABLE FINDINGS`.

Do not edit files, run destructive commands, commit, push, create Issues, approve gates, or implement.
