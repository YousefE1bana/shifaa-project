# AGY independent SpecKit analyze brief

Perform an independent, hostile, read-only cross-artifact analysis of Feature 007. Use HIGH reasoning.

## Immutable authority

- Repository: `D:\ECU\Gradution-Project-007-identity-continuity-sessions-mfa-recovery`
- Baseline: `origin/main` at `ccd76c4875821beb246fa3b0abf32f225c54f6ae`
- Feature: `007-identity-continuity-sessions-mfa-recovery`
- Scope IDs: `FR-AUTH-002`, `FR-AUTH-005`, `FR-FAM-003`, `FR-ADMIN-002`.
- Scope operations only: `refreshSession`, `logout`, `beginMfaEnrollment`,
  `verifyMfaEnrollment`, `removeMfaFactor`, `startRecovery`, `completeRecovery`,
  `transitionDependent`.
- OPEN-LEGAL-006, OPEN-TEAM-001, and OPEN-SEC-001 are closed. Do not reopen or approve gates.
- Preserve all production/release legal, DPO, PHI, vendor, security, UX, and technology gates.

## Required reading

Read `AGENTS.md`, `.specify/memory/constitution.md`, the assigned Feature 007 roadmap row, and the
complete contents of:

- `specs/007-identity-continuity-sessions-mfa-recovery/spec.md`
- `specs/007-identity-continuity-sessions-mfa-recovery/plan.md`
- `specs/007-identity-continuity-sessions-mfa-recovery/research.md`
- `specs/007-identity-continuity-sessions-mfa-recovery/data-model.md`
- `specs/007-identity-continuity-sessions-mfa-recovery/contracts/openapi.yaml`
- `specs/007-identity-continuity-sessions-mfa-recovery/quickstart.md`
- `specs/007-identity-continuity-sessions-mfa-recovery/tasks.md`
- Feature 007 readiness and adversarial-review evidence.

## Analysis contract

Independently search for duplication, ambiguity, underspecification, constitutional conflict,
uncovered FR/NFR/SC/AC, unmapped tasks, terminology/data/state/API drift, dependency contradictions,
security or legal-policy contradictions, and scope leakage. Pay special attention to:

- exact session/MFA/recovery values and deterministic boundaries;
- native Supabase Auth authority versus app workflow evidence;
- forced RLS, non-owner/service-role negatives, worker event access, concurrency, and rollback;
- all 20 legal transition vectors and same-record/prior-authority invariants;
- exact eight-operation OpenAPI mapping and the no-ninth-operation boundary;
- preservation of Feature 008, production PHI/provider/passkey, merge, and implementation gates.

Return findings first, ordered CRITICAL to LOW, with exact file/line evidence, contradicted authority,
and smallest in-scope remediation. Then provide:

- coverage totals for 4 FRs, 23 NFRs, 10 SCs, 32 ACs, 48 tasks, and 8 operations;
- constitution alignment issues;
- unmapped tasks;
- a final explicit contradiction/coverage verdict.

If no actionable defect remains, say `ZERO ACTIONABLE FINDINGS`.

Do not edit files, implement, commit, push, create Issues, merge, or start Feature 008.
