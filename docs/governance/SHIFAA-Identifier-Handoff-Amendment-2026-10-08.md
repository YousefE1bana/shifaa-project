# Post-acceptance additive identifier handoff maintenance

Date: 2026-10-08, Africa/Cairo. Authority: Yousef Osama's direct `F011_K12_BASELINE_RECONCILIATION_APPROVED` instruction.

This amends current response descriptions only. Historical F001/F004/F010 approvals, acceptance evidence and K11 acceptance remain intact. It does not redesign Feature 011, change its seven operations, request semantics, routes, architecture, requirements or retained gates.

`identity.people.id` and `identity.patients.id` are independent identities. Only the server derives the pair through `identity.patients.person_id`. Clients never assert or infer that mapping.

The existing `getMyProfile` response gains optional nullable `managedPatientId`. The current server returns the authenticated person's own patient ID, or null without a patient record. PATCH input and response behavior remain unchanged. No other-person selector is accepted.

F004 is unchanged. Its existing authorized relationship supplies `managed_patient_id`. The care switcher retains that server-issued ID in transient selected context, revalidates the current relationship using the existing operation and clears revoked, wrong-actor, expired, offline or missing context. It never uses a person ID to bootstrap a relationship read. GUA/DEL allergy access remains read-only and is freshly authorized by the server.

The existing authorized F010 encounter projection gains `patientPersonId` and `managedPatientId` beside the unchanged legacy `patientId` (person). The current SQL projection joins the canonical patient record after existing authorization. Historical canonical mutation responses may omit new fields; clients must obtain a current authorized `getEncounter` projection before allergy consumption. The clinic validates route person, projected person, encounter and facility together, ignoring client-claimed mappings. No F009 mapping path, table, operation, privilege or grant is introduced.

Current F001/F010 OpenAPI/contracts/client types and API Catalog/Data-RLS/traceability clarification describe this post-acceptance maintenance. A new additive CLI-generated migration replaces only the existing F010 projection function, preserving its owner, authorization, fixed search_path and grants. Current proof hashes must renew before K12 consumes changed inputs; historical proof is retained.

K12 remains functional/test-only and pending acceptance. OPEN-UX-002 and every retained gate remain open according to existing lifecycle effects. No production, clinical, final-design or shippable-MVP approval is implied. T048–T050 stay unchecked; #445–#447 stay open. Stop before K13. No Git integration is authorized.
