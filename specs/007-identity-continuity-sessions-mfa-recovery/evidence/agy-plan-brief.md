<task>
Adversarially review the Feature-007 plan draft and its research, data model, OpenAPI contract, and
quickstart. Read only. Findings first. Do not edit, approve, implement, commit, push, merge, or create
Issues.
</task>

<authority>
Read AGENTS.md, Constitution, PRD/Master v2.1.2, Roadmap 007, Architecture, API Catalog, Data/RLS, UI
Contract, Traceability, v2.1.1/v2.1.2 amendments, approved spec/clarification, and every current
Feature-007 planning artifact.
</authority>

<attack>
Attack native Supabase Auth compatibility, refresh/session revocation, AAL/AMR, TOTP enrollment/
removal, recovery saga/restriction/no-oracle behavior, idempotent secret responses, PostgreSQL schema/
checks/indexes/locks, forced RLS/security-definer boundaries, person/patient/record continuity,
transition concurrency/legal rules, API schemas/errors, notification data, rate/expiry/time tests,
offline/UI/A11y, rollback, performance, and taskability. Independently look for cross-system atomicity
lies, shadow auth/session state, service-role/direct Auth mutation, ambiguous nullable shapes, missing
foreign-key indexes, or scope leakage.
</attack>

<frozen>
Exactly four FRs and eight operations. OPEN-LEGAL-006 stays closed. No Feature 008, new endpoint,
relationship type, role, shadow credential/session authority, production provider/passkey/PHI, or
automatic age/capacity transfer.
</frozen>

<output_contract>
List CRITICAL/HIGH/MEDIUM/LOW findings with exact evidence and smallest bounded correction. Separate
scope-expanding proposals. State whether any contradiction prevents PLAN_APPROVED. AGY is advisory;
the parent accepts/rejects every finding.
</output_contract>
