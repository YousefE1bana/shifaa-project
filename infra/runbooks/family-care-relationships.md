# Family Care Relationships Runbook

Scope: seeded-synthetic local/CI operation for feature 004 only. This runbook does not authorize real family/patient data, real guardianship evidence, production sessions, legal approvals, or provider delivery. `FR-FAM-003`, `transitionDependent`, and automatic age/capacity transitions are absent and remain blocked by `OPEN-LEGAL-006`.

## Start and verify

1. Use only checked-in synthetic defaults. Keep `FAMILY_CARE_ENABLED` and synthetic authentication disabled outside local/test; production startup fails closed.
2. Run `pnpm install --frozen-lockfile`, `pnpm db:reset`, `pnpm test:family:stack`, `pnpm test:family:e2e`, and `pnpm test:family:performance`.
3. Start the real local API with `pnpm dev:supabase:api`, patient web with `pnpm dev:patient:web`, and admin with `pnpm dev:admin:web`.
4. Verify both Arabic RTL and English LTR journeys using only seeded synthetic fixtures.

## Authority diagnosis

Check in order: authenticated/synthetic-mode boundary → actor/person → explicit patient context → current relationship status and time → exact relationship type → exact purpose → exact permission → current version. Emergency Contact management is limited to self or an active purpose-bound guardian. Support Admin guardianship decisions require AAL2, `guardianship_review`, current version, released evidence, and an actor independent from the subject and creator.

Invitation responses are anonymous and non-oracular. Tokens arrive in a scrubbed URL fragment, travel in the request body, persist only as HMAC digests in relationship/contact rows, and are encrypted at rest inside replayable idempotency responses.

## Evidence and privacy

- `guardianship-evidence` is private. Only released, owner/patient-bound evidence can support a proposal or reviewer projection.
- Contact name/phone are encrypted; user projections contain only the masked phone and consent scope.
- Audit, authorization-use, outbox, logs, and worker projections prohibit tokens, plaintext phone, evidence paths, identity payloads, diagnosis, medication, lab, admission, and record links.
- Emergency Contact policy projects a closed minimum alert only for a current confirmed contact and qualifying active SOS. Feature 004 has no SOS creation or external provider adapter.

## Incident signals

| Signal                                                  | Immediate action                                                                                | Recovery evidence                                                                    |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| cross-patient, delegate-contact, or wrong-purpose allow | disable Family Care routes, preserve audit/idempotency rows, rotate affected synthetic sessions | API and direct forced-RLS negative matrix passes                                     |
| token in URL/log/plain idempotency JSON                 | disable invitation issuance/response, preserve evidence, rotate affected synthetic tokens       | fragment/body transport, encrypted replay record, recursive sentinel scan pass       |
| attribution or outbox duplication/loss                  | stop affected mutation/use path and preserve transaction records                                | exactly one domain/audit/use/outbox effect under replay/fault tests                  |
| private evidence/object exposure                        | disable evidence review and keep bucket private                                                 | anonymous/authenticated list/read denial plus released single-object reviewer access |
| worker prohibited-field sentinel                        | stop handler/provider seam; do not retry external delivery                                      | closed runtime schema and projection sentinel suite passes                           |

Rollback is feature-flag route disablement followed by a forward corrective migration. Never delete relationship, permission, contact, authorization-use, audit, idempotency, or outbox history. Incident ownership remains `OPEN-TEAM-001`.

## Performance and portability

The synthetic capacity target is 5,000 relationships, 20,000 permissions, 5,000 contacts, and 100 concurrent sessions. Relationship/contact read p95 must be at most 400 ms and mutation p95 at most 800 ms. PostgreSQL and Supabase remain behind service/repository/storage ports; browsers call only the Core API.
