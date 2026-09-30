# C26 — Security, privacy and redaction

Accepted by root on 2026-09-30 for T076–T078 / #383–#385 only. Starting HEAD: `7890d6b6444150e964864b59e93c283f49457535`; feature branch `codex/010-encounters-referrals-contextual-chat`. All data and captures are synthetic local/test evidence. C27 was not started before this acceptance.

## Preflight and RED

The worktree was clean at the exact supplied HEAD; T001–T075 were checked and T076 was next. Only #383–#388 handoff metadata was repaired/validated against that starting baseline. Guardrails, UI governor, approved security/privacy/observability requirements and immutable references were inspected. Root retained architecture/threat review, acceptance and integration; a bounded worker implemented the routes/observability/migration and a tester supplied abuse vectors.

T076 exposed three genuine gaps, with working fixtures and registered API routes:

- The installed problem handler returned clinical canaries from `ApiPolicyError.message`.
- Its `instance` included message/query/session canaries from the request URL.
- The real PostgreSQL create-referral boundary distinguished an absent source (404) from a hidden existing open source (403), and could inspect lifecycle state before resource authorization. The focused C17 RED exited nonzero with `observed status classes: {404,403}`. Completed hidden sources and hidden/stale referral acceptance were subsequently covered.

The route RED failures and SQL oracle RED preceded their fixes. Fixture syntax/action mistakes and changed negative-test expectations were corrected and explicitly excluded from RED evidence. Local diagnostic files: `%TEMP%/shifaa-c26-oracle-red.log` and `%TEMP%/shifaa-c26-final-focused.log`.

## Implementation and root threat review

`@shifaa/observability/feature-010` emits a closed `feature_010.api.request` event: validated request ID, optional validated trace ID, one of ten fixed operations, fixed result/status classes and optional bounded latency bucket. Metrics permit only operation/result/status/bucket; no identifiers, clinical text or user-controlled dimensions. The wrapper receives no request payload and logging failure cannot change a committed domain response.

Only the ten registered Feature 010 route templates use fixed localized problem titles/details and safe code/status mapping. `instance` is the registered template, never a supplied URL. Extra error headers/content are discarded; 429 permits only bounded decimal Retry-After. The mapping retains authentication/MFA/purpose, validation, hidden-resource, conflict, rate and existing gate behavior. This adds no rate policy, provider or telemetry channel.

The additive `20260930001001_f010_c26_privacy_guards.sql` reorders live authorization ahead of protected lifecycle/version information for encounter update/note/completion and referral create/accept. Hidden resources use P0002 / 404; authenticated general role/MFA/purpose failures retain 403. Current memberships/licenses/participants and representative grants are locked/rechecked before mutation or replay. Existing authorized state transitions, idempotency and booking behavior are preserved. Root compared the restated functions with historical definitions; only authorization ordering/locks and hidden-resource mapping changed. Execute grants, empty search paths, FORCE RLS and default deny remain intact. Historical migrations were not edited.

## Abuse and authorization matrix

| Vector                                                                         | Evidence / result                                                                                                                                                                              |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cross-patient, cross-facility, unrelated clinician, forged/missing identifiers | Real SQL encounter/referral/message projections and mutation vectors deny; absent and hidden lifecycle resources share 404 where resource existence is protected.                              |
| Revoked workforce, ended/removed interval, stale authority                     | C11/C12/C13/C22 live checks deny read/send/mutation and replay. No cached authority is restored.                                                                                               |
| Revoked/expired GUA or revoked/expired/insufficient DEL grants                 | C18/C19 real SQL denies acceptance/listing after grant change; GUA/DEL message read/send remain denied.                                                                                        |
| Completed context                                                              | C13/C22 deny send and old history, including stale cursor/canonical replay.                                                                                                                    |
| Forged hint, wrong context/event, content extras, malformed version            | Actual patient/clinic controllers ignore invalid hints. They grant no encounter/referral/message authority or content.                                                                         |
| Valid future/stale/out-of-order/duplicate hint                                 | Hint is invalidation only. Future or out-of-order distinct positive markers require REST; duplicate is inert. REST denial/completion clears history/composer; no send entitlement is restored. |
| Unauthorized mutation effects                                                  | SQL asserts zero rejected-path domain mutation, domain outbox, successful idempotency response or audit success. Authorized controls still produce balanced exactly-once effects.              |

The new API abuse suite injects failures at the domain service boundary to exercise the actual installed routes/problem handler. Database authority/no-effects claims come from the non-owner online-role PostgreSQL suites, not those stubs.

## Canary scan by sink

Eight unmistakable synthetic categories cover private note, released note, referral reason, optional encounter type, message plaintext/ciphertext, session/token and patient payload. Actual AES note adapter tests round-trip private/released plaintext canaries without sending plaintext to SQL. Real SQL referral creation persists its reason canary; C22 real API sends persist two actual encrypted message bodies and decrypt only after authorized projection. SQL note tests additionally scan their stored encryption-envelope fixtures. Hostile optional clinical/auth/patient fields are supplied to the closed telemetry/problem/worker boundaries.

| Sink                                    | Check and result                                                                                                                                                                                                |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audit                                   | Real persisted note/message ciphertext and referral reason absent; all eight patterns absent from metadata. Fixed audit markers only; denied paths have no success effect. PASS.                                |
| Domain outbox                           | Actual note/message envelopes and referral canary absent. Message marker remains two fields `aggregateId`/`version`; no body/ciphertext. PASS.                                                                  |
| Realtime publish                        | Actual C23 processor and durable worker expose only `eventId`, `contextId`, `version`. Extra clinical payload is rejected. PASS.                                                                                |
| Retry / DLQ                             | Actual processor hostile-error captures and durable PostgreSQL receipts contain fixed safe codes, no canary or body/ciphertext. PASS.                                                                           |
| Application logs / structured telemetry | Actual wrapper log captures for success/denial/conflict are closed. All eight hostile canaries absent. Fastify's existing logger configuration remains unchanged; no production log collector is claimed. PASS. |
| Metrics labels                          | Closed bounded projection drops body/note/ciphertext/auth/patient fields and IDs; invalid operations/results/status/duration rejected without echo. PASS.                                                       |
| Problem responses                       | Actual registered routes across all three domains suppress clinical error text, request query and hostile headers/codes. Fixed localized copy/template only. PASS.                                              |
| Idempotency metadata                    | Actual message plaintext absent throughout; stored note/message ciphertext absent from metadata outside `response_body`. Referral clinical text absent from metadata outside approved canonical response. PASS. |

Approved protected canonical `response_body` is intentionally excluded from the metadata scan: encrypted note/message stored responses and authorized referral projections are existing approved persistence boundaries. This is not a claim that protected stored responses contain no encrypted or clinical data. No synthetic token pattern is treated as a real credential.

## Verification

All database commands ran serially in disposable scratch databases, preserving named runtimes and rollback volumes:

```powershell
$env:SHIFAA_TEST_POSTGRES_RUNTIME='shifaa-local-postgres' # then shifaa-local-supabase
node tools/run-feature-010-postgres-test.mjs
$env:SHIFAA_TEST_F010_C22_ONLY='true'
$env:SHIFAA_TEST_F010_C23_REGRESSION='true'
node tools/run-feature-010-postgres-test.mjs
node tools/run-feature-010-realtime-postgres-test.mjs
pnpm exec tsx --test tests/e2e/feature-010-security-privacy.spec.ts apps/patient/test/feature-010-chat.test.tsx apps/clinic/test/feature-010-messages.test.tsx
```

| Check                                                                                  | shifaa-local-postgres                             | shifaa-local-supabase                             |
| -------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------- |
| Fresh/replayed forward migration; encounter/referral privacy; storage/RLS; F009 parity | PASS                                              | PASS                                              |
| C22 actual encrypted API, cursor/live revocation/canonical replay                      | PASS                                              | PASS                                              |
| Send-first / completion-first lock-barrier races                                       | One message/effect set / zero denied-send effects | One message/effect set / zero denied-send effects |
| C23 durable ordering/dedup/retry/DLQ/worker ACL                                        | 11/11                                             | 11/11                                             |

FORCE RLS remains 6/6 with zero direct online table ACL entries. Supabase lacks role membership for one legacy direct SET ROLE F009 subvector; the harness reports that omission explicitly while Feature 010 assertions run as the online role. The existing expected missing-booking-primitive RED probe inside the full runner is intentional; both final runners exit 0.

Focused API regression: 81/81; new privacy plus C24/C25 controller regressions: 41/41 (9 privacy, 18 patient, 14 clinic); C23 unit tests 9/9; contracts 6/6; generated client focused tests 10/10; existing observability tests 13/13. API, worker and observability typechecks, architecture (18 boundaries/17 manifests), Feature 010 scope (3/3), secrets scan, targeted Prettier and diff whitespace checks pass. Frozen reference validator confirms six families, 87 states/408 references and unchanged source/inventory/image digests. The harmless synthetic Authorization fixture was simplified to avoid a secret-scanner false positive without weakening its override assertion.

## Acceptance and changed files

Root clean-code/test/docs guard review found no remaining C26 finding: no cross-subject/facility authority, live revocation preserved, hint grants nothing, no unauthorized partial effects, no prohibited canary in an unauthorized sink, bounded safe metrics and fixed problems. Authorized behavior remains passing. No retention period, production channel/provider, legal-gate closure, approved authority/baseline edit or historical migration edit. Full pnpm verify and main integration are excluded.

Changed surfaces: the new observability module/export; three Feature 010 routes and their narrowly scoped shared problem handler; new forward privacy migration and two migration runners/package wiring; focused security suite; six SQL regression fragments; note adapter/API tests; generated-client synthetic test fixture; patient/clinic forged-hint tests; this evidence and T076–T078 ledger acceptance. Root commits/pushes C26 separately and closes only #383–#385 after acceptance.
