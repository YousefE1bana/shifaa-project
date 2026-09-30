# C29 prerequisite verification-harness repair

## Original attempt — failed, preserved

- Integration HEAD: `183ac3353a6e20303f14ba6584a0db07863c5c44`.
- Exact command: `corepack pnpm verify`, executed once on 2026-09-30.
- Start/end: `2026-09-30T13:13:46.7401901+03:00` / `2026-09-30T13:16:40.4204846+03:00`; elapsed 173.6619765 seconds; exit **3**.
- First failing stage: `db:test`, `infra/db/tests/discovery-sos-schema.sql:189`, with `006 introduced a shadow or later clinical source`.
- Complete original captures remain at `%TEMP%/shifaa-f010-c29-20260930-131345/verify.log` and `run.json`. Log SHA256: `112167a00837c1ec41f12355cadb407249324185ec52628b4104d51a22fab5a0`.
- T085 failed; T086 was not started. Neither task nor issue #392/#393 was completed by that attempt.

## Authorized repair and root cause

The Product Owner / Architecture decision in this conversation authorizes a bounded C29 prerequisite harness repair and one subsequent canonical verification attempt. Classification: **verification-harness / cross-feature compatibility defect**.

The legacy Feature 006 final-schema test required canonical later-feature tables to remain absent. A fully migrated database cannot prove which earlier migration introduced a table by testing final-schema absence. Feature 010 explicitly owns `clinical.conditions` in the approved roadmap and its six-area schema. The actual fresh database contained that canonical table with ENABLE/FORCE RLS.

The repair changes only `infra/db/tests/discovery-sos-schema.sql`: retain the permanent absence checks for `platform.emergency_profile` and `platform.emergency_profile_projections`, remove final-schema absence checks for all three later canonical resources (`clinical.conditions`, `clinical.allergies`, `clinical.medication_statements`), and clarify the assertion/comment. All other Feature 006 schema, security, capacity, lifecycle and delivery assertions remain intact.

For provenance, source inspection of `supabase/migrations/20260820000600_discovery_sos_foundation.sql` found no reference to any of those five resources. This is a scoped migration-source observation; final-schema absence is no longer used to infer historical provenance.

## Focused verification

Executed against the real `shifaa-local-postgres` final schema, serially, using owner access solely for disposable test setup:

| Probe                                                                                                            | Result                                                                          |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Run repaired `discovery-sos-schema.sql` unchanged                                                                | Exit 0, all assertions execute, transaction rolls back                          |
| Inject `platform.emergency_profile`, run the actual test                                                         | Exit 3 at `006 shadow emergency-profile source exists`                          |
| Inject `platform.emergency_profile_projections`, run the actual test                                             | Exit 3 at the same intended assertion                                           |
| Inject both later canonical allergy/medication tables while existing F010 conditions remain, run the actual test | Exit 0; legitimate later schema presence does not invalidate F006               |
| Run `infra/db/tests/feature-010-schema.sql`                                                                      | Exit 0; canonical conditions and other F010 schema requirements remain verified |
| Inspect F006 migration source                                                                                    | No reference to the five resources above                                        |
| Post-probe database check                                                                                        | Four injected relations absent; `clinical.conditions` still present             |
| `git diff --check`                                                                                               | Exit 0                                                                          |

Each injected relation was created inside an uncommitted transaction in the same psql connection as the actual schema check. Expected failures abort the connection and roll back; the positive test explicitly rolls back. No durable domain/history state was removed. Captures: `%TEMP%/shifaa-f010-c29-repair/` (`emergency_profile.log`, `emergency_profile_projections.log`, `later-canonical-tables.log`, `feature-010-schema.log`).

## Scope and review

This does not create a clinical table or API operation, implement Feature 011, alter authorization, or change production/domain behavior. No migration, generated contract/client, UI, dependency/toolchain, approved baseline or C01–C28 evidence was edited. The original C01–C28 evidence hashes were checked after attempt 1 and were unchanged.

The known pnpm normalization from `auditConfig: {}` to `auditConfig: { ignoreGhsas: null }` was inspected and restored exactly to HEAD. Dependency/audit checks remain unchanged. Only the SQL test and this evidence file belong to the repair commit.

Root test/doc review: the retained invariant was exercised through real PostgreSQL positive and negative behavior, with no mocks or broad historical-test refactoring. The evidence distinguishes the original failure, focused repair verification and the not-yet-executed new full attempt. T085/T086 remain incomplete at repair acceptance. Retained gates are unchanged.
