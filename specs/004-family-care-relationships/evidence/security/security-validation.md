# Security validation — Family Care Relationships

**Date:** 2026-08-13

**Scan:** `3e045de3-2a84-46bc-89fa-65bfae9bd223`

**Captured baseline:** `468dc193b93ad8350f71c5fb44e16468f83329a1` plus the immutable pre-remediation 004 working-tree digest

**Coverage:** complete — 65/65 full-file receipts, 20/20 candidate validation and attack-path closures

The diff scan reported 14 reachable findings in the captured seeded-synthetic implementation: eight medium and six low. It reported no HIGH or CRITICAL finding. All 14 were remediated in the current 004 worktree and received targeted executable or direct-SQL regression evidence.

Remediations cover URL/path invitation leakage; anonymous inherited authorization; encrypted idempotency responses; purpose-bound authority; delegate Emergency Contact denial; permission-inflation denial; immutable relationship/contact/acceptance attribution; synthetic-mode authentication gating; private no-store responses; minimum authorization-use audit; closed worker event schemas; and YAML-parsed forbidden-operation enforcement.

Direct forced-RLS tests cover cross-person, cross-patient, wrong purpose, delegate contact access, permission self-grant, scope/evidence substitution, confirmed-contact substitution, terminal mutation, and private table grants. The real PostgreSQL journeys prove one relationship/contact effect, HMAC-only aggregate token storage, encrypted idempotency replay, immutable acceptance time, minimum use attribution, and minimized audit/outbox payloads.

Final targeted revalidation passed on 2026-08-13 through `pnpm test:family:security`, all three real PostgreSQL journeys, and the hydrated invitation-fragment browser regression. The final implementation also passed the complete clean-database `pnpm verify` gate and generated a CycloneDX SBOM.

`FR-FAM-003`, `transitionDependent`, automatic age/capacity transition, SOS creation, and provider delivery are absent. Production Family Care remains disabled; this record makes no production-security or legal-approval claim. Canonical open items remain open.
