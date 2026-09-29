# C19 — Referral role projection and pagination evidence

**Scope:** T055–T057 / issues #362–#364 only, starting at `e8ed3fc3e76265df481df382270d7af81a674250` on `codex/010-encounters-referrals-contextual-chat`. The starting worktree was clean, T052–T054 were complete, and T055 was next. Only these three issue handoff markers were repaired and resolved before implementation. All people, referrals, and clinical text in the fixture are synthetic; each PostgreSQL run uses an isolated scratch database.

## T055 RED

The new non-owner `list_referrals_api_v1` fixture ran before the C19 migration through `pnpm test:encounters:schema` on `shifaa-local-postgres`. It exited **1** at the genuine assertion `C19 current source clinician lost the source-care referral projection`. The actual JSON was the accepted target envelope: it lacked `sourceEncounterId` and `targetSpecialty` even though the actor was the current source treating clinician and also had target-facility membership. An initial assertion using `<>` had passed on SQL `NULL` for a missing JSON key; the fixture was corrected to `IS DISTINCT FROM` before recording RED.

## T056 implementation and root review

The additive C19 migration replaces only `clinical.feature_010_referral_projection_v1`. It checks current source-care authority before choosing the accepted-target branch, preserving the source clinician's approved tracking projection when source and target authority overlap. Target-only clinicians still receive the C07 accepted-field envelope. The function retains the live `listReferrals` authorization call, and the existing `list_referrals_api_v1` filters each row through current authorization on every invocation. The API cursor contains version, person binding, filter hash, creation timestamp, and referral ID; it carries no grant, relationship, role, or entitlement snapshot. The route accepts only contracted filters and the adapter validates every closed referral projection.

Root review found no C20/UI code, new operation, clinical write, note payload, approved spec/plan/OpenAPI/baseline edit, or historical migration edit. The forced-RLS/default-deny boundary and narrow `shifaa_api` function execute grant remain in place. The C17 create path, C18 acceptance path, and Feature 009 booking primitive were not changed. Clean-code, test, and docs guard passes were applied to the changed SQL, tests, runner, and this evidence.

## T057 role and pagination results

The real PostgreSQL matrix executes list calls as non-owner `shifaa_api`, without clinical table DML privileges. The C19 fixture and focused C18 regression assert:

| Actor or scenario                                          | Verified result                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PAT self, approved active GUA, active DEL with both grants | Each receives the exact closed pending subject projection. PAT also receives the exact closed accepted subject projection.                                                                                                                                          |
| Source CLN                                                 | Receives the source-care projection while pending and after acceptance, including when the same clinician has target-facility authority.                                                                                                                            |
| Pending target CLN                                         | Receives zero list rows before acceptance; no referral content or useful pending existence cue.                                                                                                                                                                     |
| Accepted, linked target CLN                                | `list_referrals_api_v1` returns exactly the contract envelope with `reasonSummary` and selected `encounterType` as its only source clinical disclosure fields. It contains no source encounter ID or other source record field.                                     |
| Revoked GUA and DEL with only `record.view`                | Each had a nonempty second page before revocation; after authority loss, the same cursor position returns zero newly unauthorized rows and a fresh list returns zero.                                                                                               |
| Expired GUA and expired DEL                                | Each receives zero referral rows under its expired relationship.                                                                                                                                                                                                    |
| Wrong clinician or facility/patient filters                | No row is projected outside current source/target and patient/facility authority. Filters only narrow results.                                                                                                                                                      |
| Pagination and query validation                            | API integration checks default 25, maximum 100, deterministic timestamp/ID ordering, deduplication across role branches, a stable signed cursor for repeat reads, cursor binding to actor and filters, per-page SQL rechecks, and rejection of widening query keys. |

Exact JSON comparisons and closed contract validation exclude note body, private-note existence, supersession, conditions, observations, orders, and unauthorized source identifiers from these referral views. C07 authority requires both `record.view` and `appointment.manage` within the same current delegation relationship. The cursor is pagination state only; the database reevaluates authority for each page.

### Serial PostgreSQL runs

```powershell
$env:SHIFAA_TEST_F010_C19_ONLY='true'; $env:SHIFAA_TEST_POSTGRES_RUNTIME='shifaa-local-postgres'; pnpm test:encounters:schema
$env:SHIFAA_TEST_F010_C19_ONLY='true'; $env:SHIFAA_TEST_POSTGRES_RUNTIME='shifaa-local-supabase'; pnpm test:encounters:schema
$env:SHIFAA_TEST_F010_C17_ONLY='true'; $env:SHIFAA_TEST_POSTGRES_RUNTIME='shifaa-local-postgres'; pnpm test:encounters:schema
$env:SHIFAA_TEST_F010_C17_ONLY='true'; $env:SHIFAA_TEST_POSTGRES_RUNTIME='shifaa-local-supabase'; pnpm test:encounters:schema
```

All four commands exited **0**. Each C19 run applied the C19 migration fresh and on replay, then passed the C07 RLS matrix, C08 internal F009 booking parity, C18 acceptance/privacy vectors, C19 role/pagination matrix, and two-session acceptance race. The race produced one committed referral/appointment/canonical response/audit/outbox set and one deterministic `40001` loser on each runtime. Both C17-only runs passed create/list, atomic effects, idempotency, and current-authority/privacy regressions.

### Focused API and repository checks

```text
Feature 010 API Vitest (encounter contract, referral create, accept, projection): 4 files, 38/38 tests passed
API typecheck: passed
Feature 010 scope: 3/3 passed
Feature 010 contracts: 6/6 passed
Contract catalog/generated parity: 97 operations passed
Feature 009 contract: 18 operations passed
Architecture: 18 boundaries, 17 manifests passed
Targeted Prettier: passed after formatting changed supported files
git diff --check: passed
```

Full `pnpm verify` and live Arabic/English UI acceptance were outside this bounded C19 checkpoint and were not run. No later `OPEN-*` gate was closed.
