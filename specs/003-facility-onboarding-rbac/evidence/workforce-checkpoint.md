# Licensed workforce checkpoint

Result: PASS (seeded-synthetic)

Evidence source: `services/api/test/facility-onboarding.integration.test.ts` and `tests/e2e/facility-access.spec.ts`.

- Owner `...0001` created and obtained approval for a synthetic clinic.
- Worker `...0002` created a professional license, uploaded quarantined evidence, and received an independent verified decision.
- The approved owner invited the named worker with the verified license; the worker alone accepted the opaque invite.
- Membership state changed `invited -> active`; audit rows include the authenticated person and facility IDs.
- Matching facility/type/permission context allowed the tested action.
- Cross-facility, wrong application, wrong role, inactive membership, missing patient basis, AAL1, and missing purpose denied.
- Pending/unverified, rejected, suspended, and clock-expired licenses denied regulated actions.
- Membership end/expiry removes access from current-state policy; no token or raw license number appears in audit/outbox projections.

No real professional, real document, or production session was used.
