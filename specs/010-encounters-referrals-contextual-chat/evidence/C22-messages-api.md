# C22 — Context read/send API

Scope: T064–T066, issues #371–#373 only. Authorization: `TASKS_APPROVED`, with explicit C22 implementation authorization. All data and runtime checks are synthetic local/test evidence. No production, later checkpoint, or `OPEN-*` gate approval is implied.

## Preflight and delegation

The existing worktree was clean on `codex/010-encounters-referrals-contextual-chat` at exact starting HEAD `9eb2459fceb67d1e90ef2ba1c11d79cdb4b27d85`. The task ledger had all T001–T063 checked and T064 as the next unchecked task. The requirements checklist had 19 checked items and zero unchecked items.

Only issues #371–#373 were repaired: their bodies retained the approved task text and received `shifaa-speckit-handoff:v1` markers for T064, T065, and T066 respectively, using the exact starting HEAD as baseline. The repository resolver validated all three mappings and dependency metadata.

A deep-worker owns the bounded SQL transaction, RLS, and race implementation; a normal worker owns the API module, encryption adapter, routes, and API tests. File ownership is independent, database verification is serial, and root retains architecture review, acceptance, task ledger, and Git/issue actions.

## T064 RED

The API RED used the real `buildApp` entrypoint in seeded-synthetic mode:

```text
corepack pnpm --filter @shifaa/api exec vitest run test/feature-010-messages.integration.test.ts
```

Root reran it before production message registration: both tests failed at the absent C22 routes, GET with 404 versus expected 200 and POST with 404 versus expected 201. Application imports and setup succeeded. An earlier empty-Fastify draft was rejected during root review because it did not exercise production registration; it is not counted as RED evidence.

The focused PostgreSQL RED mode applied prerequisite migrations through C19 to disposable databases on both named runtimes. Before invoking the absent C22 functions, it proved `trust.messages` existed, ENABLE/FORCE RLS were true, and the C07 authorized message projection existed. Each expected-red psql invocation exited 3 with both intended markers:

```text
F010_C22_MISSING_API: trust.list_context_messages_api_v1(uuid,timestamptz,uuid,integer)
F010_C22_MISSING_API: trust.send_context_message_api_v1(uuid,jsonb)
```

The runner exited 0 only after recognizing both markers on `shifaa-local-postgres` and `shifaa-local-supabase`. No fixture/setup failure was accepted as RED. Root accepted this evidence before production C22 SQL was added.

A supplemental race omission probe was added after implementation. It applies the C19 baseline without C22, checks C13 completion and forced-RLS prerequisites, commits the existing C11 fixture, and invokes the same real send-first SQL used by the GREEN race. Both runtimes failed precisely at the missing `trust.send_context_message_api_v1(uuid,jsonb)` function. The committed fixture remained `0|0|0|0|open|5` for message/idempotency/audit/outbox/encounter-status/version. This is supplemental post-implementation RED evidence, not a claim that the expanded race harness existed before production implementation.

```powershell
$env:SHIFAA_TEST_POSTGRES_RUNTIME='shifaa-local-postgres' # then shifaa-local-supabase, serially
$env:SHIFAA_TEST_F010_C22_RACE_RED='true'
node tools/run-feature-010-postgres-test.mjs
```

## T065 implementation

The Core API registers only `listContextMessages` and `sendContextMessage` for appointment contexts. Closed existing contract schemas reject extra properties, including any attachment value; a separate nonblank check rejects whitespace-only bodies. The existing seeded-synthetic authentication boundary remains fail-closed outside synthetic mode. No production-authentication gate is closed by this checkpoint.

The adapter uses the existing configured 32-byte identity encryption key and AES-256-GCM envelope convention. SQL receives ciphertext only. Authorized SQL projections and canonical stored responses contain ciphertext; the adapter decrypts them for the closed REST response. API logging is disabled in the existing application configuration. Error responses use generic policy messages.

The additive C22 migration grants only the two narrow SQL entrypoints to the online API role, preserves FORCE RLS/default-deny and existing event types, and adds the body-free `clinical.context_message.created.v1` marker. Its payload is exactly `aggregateId` and `version`; no worker, consumer, template, or channel is added.

Send claims idempotency, locks appointment then queue then encounter and current participant/identity authority, reauthorizes, inserts encrypted body with SQL-null attachment, records audit/outbox effects, stores the encrypted canonical response, and commits. Exact replay reauthorizes before returning the stored response. Pagination uses descending timestamp/ID tuples; its signed cursor binds pagination state to an appointment and supplies no authority. Every page rechecks current authorization.

## T066 acceptance

Root accepted T064–T066 after the final serial runs on both runtimes exited 0. Each run applied the additive migration, ran the C06 storage, C07 forced-RLS/current-participant, C11 immediate participant-removal, and C13 completion regressions, ran C22 SQL vectors, reapplied the migration, reran C22 SQL vectors, exercised both lifecycle races, and ran the actual `buildApp` API with the non-owner/non-BYPASSRLS online role.

```powershell
$env:SHIFAA_TEST_POSTGRES_RUNTIME='shifaa-local-postgres' # then shifaa-local-supabase, serially
$env:SHIFAA_TEST_F010_C22_ONLY='true'
$env:SHIFAA_TEST_F010_C22_RED='false'
$env:SHIFAA_TEST_F010_C22_RACE_RED='false'
node tools/run-feature-010-postgres-test.mjs
```

| Actor/state                                   | Read/history/page                               | Send/replay                         |
| --------------------------------------------- | ----------------------------------------------- | ----------------------------------- |
| PAT linked to current appointment             | Pass, authorized body decrypts                  | Pass; identical replay is canonical |
| Current active responsible CLN                | Pass, authorized body decrypts                  | Pass                                |
| Current active alternate CLN                  | Pass before interval end                        | Pass before interval end            |
| GUA                                           | Denied                                          | Denied                              |
| DEL                                           | Denied                                          | Denied                              |
| Ended CLN participant                         | Denied, including cursor acquired before ending | Denied, including exact replay      |
| Suspended workforce membership                | Denied on next page                             | Exact replay denied                 |
| Completed encounter/context                   | Old history and stale-cursor page denied        | New send and exact replay denied    |
| Foreign person/appointment or general context | Denied/invalid                                  | Denied/invalid                      |

Both real API runs passed the same single comprehensive integration test (no skip). Authorized PAT and CLN bodies round-tripped through authenticated encryption and decryption, including a long Unicode body. Closed projections expose no ciphertext or attachment. Missing/blank bodies and both `attachment` and `attachments` properties with null, boolean, number, string, array, and object values were rejected before persistence. All persisted message attachments were SQL NULL. Denied responses did not echo body canaries.

Cursor pagination returned successive descending timestamp/ID pages without repeating a message. The SQL tests ended an active alternate participant through `update_encounter_api_v1`, advancing encounter version 5 to 6; the previously acquired page cursor, new send, and exact replay then failed. Separate membership-revocation vectors also denied continued history and replay. Actual API completion denied PAT history, an acquired cursor, new send, and exact replay. Cursor possession never preserved authority.

| Effect proof                                                            | Message | Audit | Outbox | Stored response/claim |
| ----------------------------------------------------------------------- | ------- | ----- | ------ | --------------------- |
| Each accepted send                                                      | 1       | 1     | 1      | 1                     |
| Identical replay, additional effects                                    | 0       | 0     | 0      | 0                     |
| Changed-body key reuse, additional effects                              | 0       | 0     | 0      | 0                     |
| Invalid/unauthorized/stale requests, additional effects                 | 0       | 0     | 0      | 0                     |
| Injected outbox failure after message/audit insertion, retained effects | 0       | 0     | 0      | 0                     |
| Three successful SQL-vector sends, total                                | 3       | 3     | 3      | 3                     |
| Two successful actual API sends, total                                  | 2       | 2     | 2      | 2                     |

The changed-body API replay returned 409 `idempotency-key-reused`; identical replay returned the exact original closed response. Owner inspection counted every C22 idempotency record, including potential unfinished claims, and found only the successful sends. It verified envelope bytes, absence of plaintext body bytes, SQL-null attachments, ciphertext-only canonical responses, and no body canary in full idempotency/audit/outbox metadata. Every outbox payload contained exactly `aggregateId` and `version=1`. The API's existing `logger:false` configuration and generic error handling were reviewed; there is no C22 retry payload or consumer.

The two deterministic race cases use PostgreSQL lock waits observed through `pg_stat_activity`, not sleep-based ordering:

| Ordering                               | Committed result on both runtimes                                                                          |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Send holds authorization locks first   | Completion blocks; send commits one message and one set of effects; completion then commits                |
| Completion holds lifecycle locks first | Send blocks; completion commits; waiting send is denied with zero message/audit/outbox/idempotency effects |

Final states were respectively `1|1|1|1|1|completed|completed|6|1|1|1` and `0|0|0|0|1|completed|completed|6|1|1|1` for message/idempotency/audit/outbox/completed-encounter-count/appointment-state/queue-state/encounter-version/completion-idempotency/completion-audit/completion-outbox. No send committed after completed authorization state.

## Other focused verification

- API route/adapter Vitest: 21/21 passed.
- Feature 010 contract Vitest: 6/6 passed.
- `corepack pnpm test:encounters:scope`: 3/3 passed.
- `corepack pnpm --filter @shifaa/api typecheck`: passed.
- `corepack pnpm architecture:check`: passed, 18 boundaries and 17 manifests.
- `node --check tools/run-feature-010-postgres-test.mjs`: passed.
- Targeted Prettier and `git diff --check`: passed.

Full `pnpm verify` was not run, as explicitly prohibited for C22.

## Root review and scope

Root reviewed the API module/routes/adapter, additive SQL migration, SQL vectors, real API tests, and synchronized harness. Clean-code, test, and documentation second passes found no remaining implementation finding. Review corrections preserved both prior referral event types in the global outbox constraint/index, normalized PostgreSQL base64, narrowed ciphertext decode exceptions, derived participant role from live SQL authorization, added actual API cross-scope/attachment denials, strengthened raw-byte encryption inspection, and counted unfinished claims as well as completed responses.

FORCE RLS/default-deny and narrow execute grants remain intact. No cached participant authority, plaintext message metadata, attachments, inbox, GUA/DEL chat, UI, notification template/channel, or C23 worker/consumer was added. Historical migrations and approved spec/plan/OpenAPI/baselines are unchanged. Only T064–T066 may be marked complete; T067 onward and all existing `OPEN-*` gates remain open.

Changed files: `package.json`; `services/api/src/app.ts`; the C22 module, adapter, and routes; three C22 API tests; three C22 SQL tests (primary RED, supplemental race RED, GREEN vectors); the additive C22 migration; the existing PostgreSQL runner; this evidence file; and the task ledger. Git/issue completion is reported with the verified commit and remote state in the checkpoint delivery response, avoiding a self-referential commit hash in this artifact.

Verification corrections: the first SQL canonical-response assertion compared wrapped PostgreSQL base64 with unwrapped input; it was corrected to compare ciphertext bytes and retain exact replay-response equality. The first API database smoke used the real date against workforce fixture credentials beginning in 2030; the runner now sets the approved synthetic clock only for the API role in each disposable database. Neither initial run was counted as a pass. No production authorization or time behavior was weakened.
