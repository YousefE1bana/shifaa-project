<task>
Act as the final adversarial security reviewer for SHIFAA Feature 007 before the parent decides whether
OPEN-SEC-001 can close for specification/development. This is a read-only review. AGY cannot approve
the gate, own requirements, edit files, commit, push, merge, create Issues, or authorize implementation.
</task>

<authority>
Read AGENTS.md, .specify/memory/constitution.md, shifaa-prd.md,
SHIFAA-Implementation-Plan-MASTER.md, docs/governance/SHIFAA-Remaining-Specs-Roadmap.md,
docs/architecture/SHIFAA-API-Catalog.md, docs/architecture/SHIFAA-Data-RLS.md,
docs/architecture/SHIFAA-Architecture.md, docs/traceability/SHIFAA-Traceability-Matrix.md, and
specs/007-identity-continuity-sessions-mfa-recovery/readiness/open-sec-001-decision-memo.md.
Repository authority outranks generic advice.
</authority>

<frozen_boundary>
Feature 007 owns only FR-AUTH-002, FR-AUTH-005, FR-FAM-003, FR-ADMIN-002 and the exact operations
refreshSession, logout, beginMfaEnrollment, verifyMfaEnrollment, removeMfaFactor, startRecovery,
completeRecovery, transitionDependent. OPEN-LEGAL-006 is closed and must not be reopened. Feature 008,
new operation IDs/endpoints, new relationship types, shadow credential/session state, direct Auth-table
mutation, service-role/owner online access, production Valify/SMS, and weakened MFA/recovery are forbidden.
</frozen_boundary>

<approved_operating_model>
Yousef Osama is Product Owner, Team Lead, Architecture Lead, SpecKit/Governance Owner, and current
pre-implementation engineering/security decision authority. Mostafa Ali becomes Security Lead for
implementation/security review when team implementation activates. The Product Owner explicitly
approves the development-stage policy if the parent finds no unresolved canonical contradiction.
This does not waive any production security, legal, vendor, release, or live-PHI gate.
</approved_operating_model>

<review_questions>
Attack the existing recommendation and deterministic tests for:

1. 15-minute JWT, 23h45m configured/24h effective absolute lifetime, and 45m configured/60m effective idle lifetime.
2. Supabase rotating refresh tokens, documented 10-second reuse interval, benign exceptions, hostile reuse, and whole-family/session revocation.
3. session_id validation, current/all-session logout, Auth outage fail-closed behavior, and absence of shadow state/service-role access.
4. AAL1 patient versus AAL2 workforce/admin, five-minute qualifying AMR freshness, step-up reuse through only existing operations, and passkey disablement until proven.
5. TOTP enrollment pending quota/expiry, verification, serialized removal, last-factor rules, and immediate post-removal authorization.
6. Uniform recovery response, lost-factor restricted enrollment-only session, repeated identity proofing, all-old-session revocation, notification, replay/race resistance, CSRF/cookies/native storage, and secret redaction.
7. Exact boundary and race test vectors. Identify any contradiction with canonical SHIFAA material, missing deterministic negative, non-deterministic statement, or assumption that belongs to OPEN-TECH-002 rather than policy.
   </review_questions>

<output_contract>
Give findings first, ordered CRITICAL/HIGH/MEDIUM/LOW, with exact repository evidence. For every finding,
give the smallest bounded correction. Then state whether any unresolved technical contradiction prevents
development-stage OPEN-SEC-001 closure. Explicitly separate policy decisions from later implementation
mechanics/evidence and list any proposal that would expand scope. Do not claim approval.
</output_contract>
