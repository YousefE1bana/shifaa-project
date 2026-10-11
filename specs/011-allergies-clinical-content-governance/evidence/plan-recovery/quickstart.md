# Feature 011 validation quickstart

Future implementation validation guide, not execution evidence. Run only after approved Tasks/implementation authorization; Plan does not start services, reset databases, create migrations or run feature tests.

## Prerequisites and isolation

Use the pinned repository toolchain in plan §3, installed Docker/psql and existing local DB harnesses. No installation/upgrade/hosted production connection is required. Confirm branch codex/011-allergies-clinical-content-governance and worktree under repository .worktrees. Preserve .specify/feature.json.

Two required real runtimes, using the predecessor harness configuration:

| Runtime             | Existing container / admin setup identity                            | Evidence boundary                                                                              |
| ------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Compose PostgreSQL  | shifaa-local-postgres-postgres-1; shifaa_owner; database shifaa      | Admin identity creates isolated temporary test DB only; online API/executor roles prove access |
| Supabase PostgreSQL | supabase_db_shifaa-local-supabase; supabase_admin; database postgres | Same migration chain in isolated temporary test DB; forced-RLS/JWT-bound API checks            |

Inspect actual container/runtime versions at verification; identifiers come from current harness defaults and may require configuration if the local profile changes. Do not treat PostgreSQL major-version matching as proof. Use isolated databases and cleanup by exact harness-owned names; never force cleanup or run shared db:reset/supabase:reset as a feature-specific shortcut. Test failure/missing runtime is failure, not a skip-green.

Existing tools/run-feature-010-postgres-test.mjs and tools/run-feature-010-completion-authority-concurrency-test.mjs demonstrate real sessions, barriers and privilege assertions; reuse their structure without altering historical evidence. tools/run-native-clinical-composition-test.mjs establishes the native/browser module-resolution pattern.

## Proposed Feature 011 entrypoints

The following filenames/commands are **planned, currently unavailable**, to be created and wired during later approved Tasks/implementation. They are not commands executed or installed during Plan:

```powershell
node tools/verify-feature-011-scope.mjs
node tools/verify-feature-011-contracts.mjs
node tools/run-feature-011-postgres-test.mjs --runtime shifaa-local-postgres
node tools/run-feature-011-postgres-test.mjs --runtime shifaa-local-supabase
node tools/run-feature-011-concurrency-test.mjs --runtime shifaa-local-postgres
node tools/run-feature-011-concurrency-test.mjs --runtime shifaa-local-supabase
```

Both harnesses must apply the full current baseline plus additive Feature 011 chain, initialize correct table/function owners, provision synthetic current/expired/revoked actor/evidence fixtures and inspect live grants/pg_roles/RLS flags. Store outputs under evidence/implementation with runtime/toolchain, migration digest, fixture digest, command, result, assertions and redacted barriers. No real credentials/PHI/private signing keys in output.

## Independent-session database scenarios

Use separate physical DB connections A/B/C, explicit barriers and pg_locks checks; no time-delay-only proof or in-memory mutex. Assert SQLSTATE/API problem, durable row/evidence/receipt counts and exact immutable digest/version after every race in **both** runtimes.

| Scenario                          | Controlled schedule                                                                         | Required outcome                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Allergy version race              | A/B verify the same current If-Match with distinct keys                                     | One appended revision; one version-conflict; prior rows unchanged                                            |
| Duplicate mutation                | A holds claimed key; B submits same principal/action/key/body                               | One effect; B returns original result after commit or canonical in-progress; no extra event/signature        |
| Key binding conflict              | Replay with changed body, path, If-Match or selected facility/encounter                     | idempotency-key-reused; original effect unchanged                                                            |
| Replay after later revision       | Commit first result then mutate current resource with new key                               | First key returns original encrypted snapshot/version/status, not current row                                |
| Replay after lost authority       | Revoke care/grant/consent/session before replay                                             | Denial without original clinical body; no second mutation                                                    |
| Authority revocation first        | A updates membership/license/designation/grant/approval status; commit before B check       | B sees revocation and denies; no new evidence/publication                                                    |
| Authorized action first           | A locks current authority FOR SHARE; B attempts non-key status revocation                   | Observe B blocked on conflicting row lock; A commits checked effect, then B commits revocation; record order |
| Signature workflow race           | Two distinct eligible roles sign same workflow ETag                                         | One CAS success/one conflict; reload then second signature binds same artifact, not mutable workflow         |
| Signature substitution            | Wrong person/role/credential/designation/version/digest or same creator/dual-role person    | No accepted approval/publication; exact historical signature unchanged                                       |
| Publish versus revocation/signing | Hold candidate/series and authority/signature locks; reorder revocation or second signature | No publication without both current matching independent approvals; no torn outcome                          |
| Initial publication race          | Different fully signed initial drafts, absent published root                                | Advisory series guard/unique root yields one root; other conflicts                                           |
| Successor publication race        | Two drafts target same currently applicable predecessor/scope                               | One accepted successor; reject second even when first future-dated                                           |
| Time/lineage boundaries           | Before/at future effective instant; stale/cross-series/cyclic/equal-date predecessor        | No early eligibility; only one applicable chain; invalid links denied                                        |
| Transaction fault                 | Inject failure between domain/evidence/outbox/receipt steps; disconnect after commit        | Before commit: zero partial effects; after commit: exact one-effect replay                                   |
| Restore and rollback              | Restore populated history/receipts; fresh separately signed superseding rollback            | Digests/lineage/counts/RLS/replay survive; no old signature reuse or ancestor reactivation                   |

Native Auth dependency tests run at the API boundary using supported verification, not direct auth.sessions edits or synthetic JWT role authority. The database race tests cover authority facts stored in the canonical DB; no claim to distributed atomic session revocation is made.

## RLS, contracts and API acceptance

Connect as actual non-owner/NOBYPASSRLS execution role and shifaa_api, not harness owner. Verify ENABLE/FORCE RLS, no PUBLIC direct EXECUTE, minimum entrypoint grants, and deny direct tables/helper spoofing/anon/authenticated/service_role access. A table owner/BYPASSRLS result cannot certify RLS.

Exercise every AC-01–16 from spec and plan §6. Assert GUA/DEL authorized read/denied create, cross-patient/facility denial, current clinician transitions/error correction and known/unknown provenance. For each content operation exercise wrong/expired/grantless/AAL1/purpose-less contexts, separate ADM/signing authorities and complete initial/future/supersession history.

Check closed clinic status serialization at SQL, API, client and UI: no draft/unsigned row, content body, evidence references, signer identities or mutation/admin controls. An explicitly scoped reviewer may inspect only its assigned artifact and signs without ADM-MEDICAL. Missing real admissibility/gate approval remains unavailable. Use neutral artifacts such as SYNTHETIC-CONTENT-A and opaque synthetic evidence; no diseases, treatments, severity thresholds, warnings or drug rules.

Contract verification must resolve all local refs, validate request/response/Problem shapes and generated client parity, method/path mapping, required Idempotency-Key/If-Match and cursor scoping. Do not run only manifest counts and call schema/RLS parity complete.

## Bilingual, degraded, redaction, performance and recovery

Capture live Arabic/English read/report/verify/review/publish/status journeys on approved compositions, including offline/no queue/reconnect original-receipt reconciliation, stale conflict, focus/announcements/scale/reflow/contrast/targets/reduced motion. Native Node ESM resolution and browser/native rendering must both pass. Preserve OPEN-UX and formal reference-environment limits.

Insert synthetic clinical-text/token/signature-secret sentinels and inspect permitted audit attribution versus logs/events/URLs/analytics/evidence; prohibited values never appear. Mutation rollback leaves no partial outbox/evidence. Worker redelivery cannot repeat publication.

Record proposed engineering workload of 10,000 synthetic allergy assertions with revision histories, 1,000 synthetic release artifacts across separate series and concurrency 1/10/25. These are disclosed test inputs, not clinical or formally approved reference datasets; owner-approved formal workload/equipment belongs to OPEN-TECH-003. Measure both reads and all five mutation operations, separately report p95 ≤400/800 ms targets excluding vendors, counts/conflicts, date/runtime/network. Do not hide contention failures or claim real regional performance from local runs.

After populated upgrade/restore compare original/version/signature/digest/lineage/receipt counts and RLS/grants. Reserve future successors and test rollback conflicts. Retention classes/holds remain canonical and no production deletion duration is invented.

## Existing repository gates for eventual delivery

These commands exist today; run at the appropriate later authorized verification stage, not during Plan:

```powershell
corepack pnpm contracts:check
corepack pnpm architecture:check
corepack pnpm secrets:check
corepack pnpm test:pre-011:integration
corepack pnpm verify
```

The full verify includes shared database reset and broad feature checks; coordinate the approved verification environment first. Preserve first failure and unrelated generated evidence according to repo policy. Require local green plus live AR/EN, then feature-branch PR and current required checks; stop for Product Owner squash merge. Plan alone satisfies none of these runtime/integration gates.

Deferred installation-checklist and roadmap progress updates are maintenance later; no frozen ownership/scope changes or premature Feature 011 completion. Stop after the authorized lifecycle phase.
