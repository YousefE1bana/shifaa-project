# C24 — Patient encounter chat composition

Scope: T070–T072 / issues #377–#379 only. Starting branch `codex/010-encounters-referrals-contextual-chat`, HEAD `88948222d6b765027e2eec6d985e7297661234a5`.

## Preflight and approved references

Root confirmed an empty tracked/untracked Git status and the exact starting HEAD before code. T001–T069 were complete and T070 was next. Only issues #377–#379 received repaired `shifaa-speckit-handoff:v1` metadata; the issue resolver validated their task IDs and dependency chain. No later issue or gate was changed.

The roadmap, approved Feature 010 artifacts, UI Contract, and TEST-ONLY patient encounter composition govern this checkpoint. Frozen manifest SHA-256: `18e4471d686990e797e8a5e370a20ceda7ea823020e3f84fdea0e03a65394310`; source revision `SHIFAA-F010-P0-SOURCE@0.3.0-test-only`. `F010-P0-PAT-ENCOUNTER-001` contains 90 references across 15 states, two locales, and three viewports. The reference validator passed all six baseline IDs / 408 references, dimensions, inventory, and source/image hashes. References were inspected and not regenerated.

Root assigned a bounded tester and normal implementation worker, retaining architecture/security/visual review, acceptance, ledger, and Git/issue lifecycle ownership. Production code remained held until the following RED results were accepted.

## T070 RED

```text
corepack pnpm --filter @shifaa/patient exec tsx --test test/feature-010-chat.test.tsx
corepack pnpm exec playwright test --config tools/feature-010-chat-playwright.config.ts
```

The first unit run failed two explicit missing-C24-boundary assertions. Before implementation, the final expanded packet failed ten tests: nine runtime scenarios reached the explicit missing `PatientFeature010ChatApi` sentinel, and the route integration assertion failed. Runtime scenarios were written for REST read/send, pagination, closed projection/cross-context rejection, body-only validation, offline blocking, denial/staleness/conflict, hint invalidation/deduplication, and aborted reads. These RED results establish the missing adapter boundary; they do not claim those scenarios executed against an implementation. The source-wiring sentinel is removed from the final suite in favor of rendered behavior.

The rendered RED loaded the real existing encounter route at 360×800 with a synthetic session and a successful encounter projection. Its heading and `Encounter in progress` status assertions passed, then the message textbox assertion failed because the composer did not exist. Snapshot contained only the existing encounter record. An earlier browser attempt failed because the first read preceded session refresh; that fixture failure was rejected, corrected using the existing C16 reconciliation convention, and is not counted as RED.

## Verification and root acceptance

The patient route uses `PatientFeature010ChatApi` and the generated Feature 010 client for `listContextMessages` and `sendContextMessage`. The appointment ID returned by the encounter projection is the context ID; the encounter route ID is not substituted. The encounter remains `open` while its linked appointment is `in_consultation`; completion is enforced by the authoritative API.

Each read clears protected history before REST reauthorization. Closed allowlisted projections retain only the approved message/page fields; wrong-context and malformed responses fail closed. Errors are reduced to fixed safe codes without retaining raw HTTP problem metadata or causes. Body-only sends reject blank or extra fields before a request. No local queue, optimistic message, attachment control, new inbox route, direct database client, or notification channel was added.

The C23 marker is exactly `{ eventId, contextId, version }`. Its version belongs to the message aggregate, so different message markers can each have version 1. The bounded event-ID dedupe set suppresses duplicate invalidations without treating version as context authority. The local/test `shifaa:feature-010-refresh-hint` event is an invalidation seam: it accepts no body, ciphertext, clinical metadata, or entitlement. C23 currently provides a local worker stdout sink, not a production browser transport; C24 does not fabricate one. A valid hint, manual refresh, foreground/focus, and reconnect all clear protected content and re-fetch authoritative REST data. A missed hint is recovered by manual REST refresh.

Route/acting-role remounts, request generations, AbortControllers, adapter request epochs, and captured-token checks fence asynchronous responses. Unit fetches deliberately ignore cancellation to prove late successful responses still cannot replace offline, denied, token-rotated, or changed-context state. Browser deferred POST fixtures wait for completion attempts after releasing their barrier; an intentionally aborted browser request is not mistaken for a required successful HTTP response.

### Rendered role and state matrix

All entries below ran in Chromium against the actual Expo encounter route with synthetic HTTP-boundary fixtures, in both `ar-EG` RTL and `en-EG` LTR at 360×800, 412×915, and 768×1024.

| Actor/state                                           | Read/composer/send outcome                                       | Evidence                                                                                         |
| ----------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| PAT, open encounter + in-consultation appointment     | Authoritative history and body-only composer available           | Six active state flows; generated GET/POST and opaque cursor inspected                           |
| PAT, successful send                                  | Canonical server message visible at the top, in-frame            | Held POST shows draft only; 201 returns body; exactly one visible canonical message and one POST |
| PAT, stale/current-access denial                      | History, success body, draft, and composer cleared               | Stale page after success, 403 after reconnect, and safe-error adapter probes                     |
| PAT, offline/reconnecting                             | No send or replay; no protected history/composer during recovery | Browser network offline plus held encounter GET; REST recovery with unchanged POST count         |
| PAT, completed                                        | Localized chat-ended state in-frame; no history/composer         | Six completed flows; stale/duplicate/out-of-order hints make zero message requests               |
| GUA                                                   | No chat history, composer, GET, or POST                          | Six representative flows; C16 encounter record preserved                                         |
| DEL                                                   | No chat history, composer, GET, or POST                          | Six representative flows; C16 encounter record preserved                                         |
| Pending PAT send, then completion/acting-route change | Late result cannot restore body or success/composer              | Two rendered deferred-send cases, plus ignored-cancellation adapter tests                        |

Active flows also cover empty history, older cursor pages, body-free hints followed by REST, duplicate hints, out-of-order identifiers, wrong-context hints, unexpected-content hints, missed-hint/manual refresh, stale/last-updated labels, restored fresh REST state, keyboard Tab/Enter send, LTR canonical reference isolation, and horizontal overflow checks. Message body and success heading bounding boxes stay within the viewport after authoritative success. Send targets are at least 48 CSS pixels high. C16's keyboard/focus-ring and single page-level heading assertions pass unchanged; new chat headings are level 2.

Root inspected all 12 live success/completed captures under `%TEMP%/shifaa-f010-chat-captures/patient-chat-{ar-EG|en-EG}-{success|completed}-{360x800|412x915|768x1024}.png`. These are synthetic temporary acceptance captures, not replacement baseline bytes. Comparison confirms functional placement, localized state parity, body-only composition, top-visible success/ended proof, token usage, and RTL/LTR behavior. This is not pixel-tolerance acceptance or closure of `OPEN-UX-002`.

### Focused commands and results

```text
corepack pnpm --filter @shifaa/patient exec tsx --test test/feature-010-chat.test.tsx test/feature-010-encounter.test.tsx
corepack pnpm exec playwright test --config tools/feature-010-chat-playwright.config.ts
corepack pnpm exec playwright test --config tools/feature-010-patient-encounter-playwright.config.ts
corepack pnpm --filter @shifaa/patient typecheck
corepack pnpm --filter @shifaa/contracts exec vitest run src/feature-010.test.ts
corepack pnpm --filter @shifaa/api-client exec vitest run src/feature-010.test.ts
node --test tools/verify-feature-010-scope.test.mjs
node tools/verify-architecture.mjs
powershell.exe -NoProfile -ExecutionPolicy Bypass -File specs/010-encounters-referrals-contextual-chat/visual-baselines/validate-reference-baselines.ps1
```

Root final runs: patient chat 17/17 and C16 adapter 7/7; C24 browser 26/26 in one complete serial run; unchanged C16 browser 8/8; patient typecheck passed; contracts 6/6; generated client 10/10; frozen scope 3/3; architecture 18 boundaries / 17 manifests; immutable reference validator passed all 408 references. The two package suites use Vitest; an attempted Node test-runner invocation was corrected and is not counted as contract evidence.

The relevant C22 regression was run serially on both existing local runtimes:

```powershell
$env:SHIFAA_TEST_F010_C22_ONLY = 'true'
$env:SHIFAA_TEST_F010_C23_REGRESSION = 'true'
$env:SHIFAA_TEST_POSTGRES_RUNTIME = 'shifaa-local-postgres'
node tools/run-feature-010-postgres-test.mjs
$env:SHIFAA_TEST_POSTGRES_RUNTIME = 'shifaa-local-supabase'
node tools/run-feature-010-postgres-test.mjs
```

| Check                                                                                  | shifaa-local-postgres | shifaa-local-supabase |
| -------------------------------------------------------------------------------------- | --------------------- | --------------------- |
| C22 focused SQL and actual API test                                                    | Passed                | Passed                |
| PAT/current workforce; GUA/DEL denied                                                  | Passed                | Passed                |
| Ended participant cutoff; completion read/send/history/cursor/replay cutoff after hint | Passed                | Passed                |
| Body encryption/decryption; NULL attachment; audit/outbox/idempotency privacy          | Passed                | Passed                |
| Replay/conflict/negative effects                                                       | Passed                | Passed                |
| Send-first/completion-first lock races                                                 | Passed                | Passed                |
| Relevant C06/C07/C11/C13 and migration replay                                          | Passed                | Passed                |

For two successful C22 sends, owner inspection retains exactly two encrypted message rows, two stored responses, two message audit effects, and two outbox effects. Added unauthorized/hint/replay probes create no additional effects. Send-first commits one valid message before completion; completion-first denies the send with zero send effects. No API, DB, migration, or worker production code changed in C24.

### Root review and acceptance boundary

Root corrected callback/effect stability, token/epoch fencing, offline recovery authority, newest-first pagination, success clearing on stale/denied/paged reads, and safe closed response/error projections before acceptance. Test review corrected a privacy fixture's undefined identifier so assertions genuinely observe 403/503 rather than accepting an unrelated thrown error. Browser review corrected draft-versus-rendered-message counting and replaced late-request response waits with fixture barriers. The unchanged C16 rendered regression exposed new page-level chat headings and ambiguous Arabic completion copy; production chat headings/copy were corrected and C16 then passed 8/8.

The final privacy/security review found no protected content outside the approved in-memory REST/UI read/write path, no logging or persistence of bodies, no raw unexpected metadata/ciphertext, no event-to-message insertion, no role authority from query parameters, no offline queue, and no attachment transport/control. Query acting role only suppresses representative presentation; server REST authorizes every read/send, including a forged or absent role hint. Completion/access-loss/offline paths clear canonical success as well as history. Later hints and asynchronous responses cannot resurrect protected state.

Final test review found that the inherited `main span/p` scaling selector did not select React Native's actual text elements. The new C24 suite now selects text leaves under the rendered `role=main`, captures baseline computed sizes before changes, asserts a nonempty target set, and proves the chat body's computed font size doubles. Root reran `corepack pnpm exec playwright test --config tools/feature-010-chat-playwright.config.ts --grep 'supports body send'`: 6/6 passed after this test correction, including overflow checks at the requested viewport and 320 CSS pixels. This is DOM text scaling/reflow evidence. Native device/screen-reader and actual browser 400% zoom acceptance were not run. All later governance gates remain open; synthetic browser/real-local-DB evidence does not claim production or final visual readiness.

Targeted Prettier checks and `git diff --check` passed. Existing ledger formatting is preserved. Root's final diff review found only the seven C24 files below and no remaining acceptance finding.

## Files changed

- `apps/patient/app/encounters/[id].tsx`
- `apps/patient/src/feature-010-chat.ts`
- `apps/patient/test/feature-010-chat.test.tsx`
- `apps/patient/test/feature-010-chat.browser.spec.ts`
- `tools/feature-010-chat-playwright.config.ts`
- `specs/010-encounters-referrals-contextual-chat/evidence/C24-patient-chat-ui.md`
- `specs/010-encounters-referrals-contextual-chat/tasks.md` (T070–T072 acceptance only)

Accepted: T070–T072 only. No C25 clinic work, approved spec/plan/OpenAPI/baseline change, historical migration edit, or full `pnpm verify`. Root owns the resulting commit, feature-branch push, and closure of only #377–#379; this evidence belongs to that resulting C24 commit.
