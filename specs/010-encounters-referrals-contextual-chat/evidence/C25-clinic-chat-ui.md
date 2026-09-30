# C25 — Clinic context messages composition

Scope: T073–T075 / issues #380–#382 only. Starting branch `codex/010-encounters-referrals-contextual-chat`, HEAD `d28932e95b3c1e92682fcbc4502a146d1b2f9f26`.

## Preflight and frozen references

Root confirmed the exact starting HEAD and an empty tracked/untracked worktree before code. T001–T072 were complete and T073 was next. Only #380–#382 received repaired `shifaa-speckit-handoff:v1` markers; the issue resolver validated their baseline/task/dependency mapping. The remaining checkpoint and OPEN gates were not authorized.

The roadmap, approved Feature 010 artifacts, UI Contract, project guardrails, UI governor, and SpecKit overlay govern this checkpoint. Root retained architecture, acceptance, evidence, ledger, Git integration, and issue closure. A normal implementation worker (`gpt-6-luna`, high) owned the two clinic production files and the small existing Today navigation link; a tester (`gpt-6-luna`, medium) owned focused unit/browser tests and their configuration. Implementation remained held until root accepted T073 RED.

Frozen manifest SHA-256: `18e4471d686990e797e8a5e370a20ceda7ea823020e3f84fdea0e03a65394310`; source revision `SHIFAA-F010-P0-SOURCE@0.3.0-test-only`. `F010-P0-CLN-MESSAGES-001` has 56 references: 14 states, ar-EG/en-EG, 768×1024 and 1440×900. Root inspected active, successful-send, and removed-participant references. The frozen-reference validator passed all six families / 408 references, source/image/inventory hashes, dimensions, ten operations, and Git reference-diff protection. References were not regenerated.

## T073 RED

```text
corepack pnpm --filter @shifaa/clinic exec tsx --test test/feature-010-messages.test.tsx
corepack pnpm exec playwright test --config tools/feature-010-messages-playwright.config.ts
```

The initial five focused tests failed at the explicit assertion `Missing C25 clinic messages boundary: implement ClinicContextMessagesController before exposing /messages.` This is a missing implementation boundary, not an import/fixture failure. The prepared scenarios covered explicit selection, generated REST history, authoritative deferred send, closed refresh hints, error clearing, offline blocking, and late old-context responses; RED does not claim those runtime assertions executed against an implementation.

The two browser tests ran real Next routes. `/today` had no Messages link, and `/messages` had no clinic staff entry heading. Both failed on the missing C25 view/discoverability behavior, after the browser/server setup succeeded. The final test packet expands these cases to the complete rendered matrix.

## Existing boundary regressions

The C22/C23 REST revocation regression ran serially on `shifaa-local-postgres` and then `shifaa-local-supabase`:

```powershell
$env:SHIFAA_TEST_F010_C22_ONLY='true'
$env:SHIFAA_TEST_F010_C23_REGRESSION='true'
$env:SHIFAA_TEST_POSTGRES_RUNTIME='shifaa-local-postgres' # then shifaa-local-supabase
node tools/run-feature-010-postgres-test.mjs
```

Both exited 0. Current workforce authorization, immediate interval-end denial, GUA/DEL denial, completed-context history/read/send/cursor/replay denial, and hint-observation without restored authority passed. Send-first committed exactly one message/audit/outbox/stored response before completion; completion-first denied the send with zero partial effects. The encrypted storage/redaction, NULL attachment, idempotency, and live authorization checks passed. These are synthetic, real-PostgreSQL Core REST checks; browser API fixtures are a separate verification boundary.

`corepack pnpm --filter @shifaa/worker exec node --test src/feature-010-realtime.test.ts` passed 9/9: minimum marker, dedupe, retries, poison/exhaustion DLQ, duplicate delivery, and body/PHI/ciphertext/authority exclusion. `corepack pnpm test:encounters:realtime:db` then ran serially with `SHIFAA_TEST_POSTGRES_RUNTIME` set to each named runtime: 11/11 passed on each, with no skips. These real-database tests cover aggregate ordering behind retry/version gaps, distinct concurrent claims, terminal receipt dedupe, expired leases/stale-owner fencing, fixed retry/DLQ codes, payload exclusion, least-privilege reads, exact three-field publication, poison handling, and retained production gating. C23 worker behavior was not changed.

`corepack pnpm exec playwright test --config tools/feature-010-encounter-playwright.config.ts` passed the existing C15 clinic encounter suite, 11/11. An initial attempt to run its Playwright file with the Node/tsx runner was rejected by Playwright setup; that invocation is not counted as regression evidence. The correct Playwright run covered encounter creation, note signing, interval ending, stale/denied reads, completion/conflict, Arabic status localization, keyboard access, and both clinic viewports.

Feature 010 contracts passed 6/6, generated client tests 10/10, scope tests 3/3, and architecture verification passed 18 boundaries / 17 manifests.

## Composition and live authority

`/messages` requires explicit encounter and appointment IDs and a confirmation action. The existing Today navigation pattern has a small appointment-messages link. No context index, general inbox, consultation channel, patient picker, new API operation, or navigation architecture was introduced.

A successful C22 message GET alone is insufficient to establish clinic eligibility because C22 supports both PAT and current workforce. The clinic controller therefore uses the existing authenticated profile operation only for its validated person ID, and the generated Feature 010 `getEncounter` with `fields=participants` only for the selected encounter/appointment association, open status, and that person's current workforce interval. It rejects patient-self identity, mismatched context IDs, unknown roles, future/malformed interval starts, ended intervals, and missing participants. A historical ended interval does not override a separate current active interval. Other profile, participant, note, and clinical fields are discarded and never reach component state or UI.

Every history read, cursor page, send, hint refresh, reconnect, foreground refresh, and freshness refresh repeats this preflight and uses the generated `listContextMessages`/`sendContextMessage` operation. AAL2 is read from the verified OTP result, with the existing `appointment.scheduling` purpose header. The final C22 PostgreSQL authorization remains authoritative for current membership/license/participant/context validity. The UI preflight supplies no entitlement to the server.

History, cursor, canonical success, and draft content clear when authority becomes uncertain, on refresh, offline, selection change, background suspension, denied/stale/conflicting responses, interval end, removal, or completion. Request epochs, fixed token snapshots, selected encounter/appointment identity, abort checks, and controller disposal fence both old successes and old failures. Local send callbacks also check current controller/context/generation and ignore aborted requests. Pure local invalid body input performs no request and preserves already-authorized history; stale or denied authority cannot send until REST recovery.

The closed message/page projection retains only approved contract fields. Extra clinical/private metadata is discarded; malformed/wrong-context responses fail closed. Body-only mutation input rejects blank bodies and any extra property, including attachment input. No file control, optimistic message, local persistence, offline queue, write replay, body logging, raw HTTP problem retention, or message transport through realtime was added.

The only accepted refresh hint is `{ eventId, contextId, version }`, matching the selected appointment. Extra-content and foreign-context hints are rejected. Bounded event-ID deduplication is safe for distinct message markers that each have version 1; hint versions do not represent context authority. A valid hint invalidates protected content and triggers a new REST read. A duplicate or missed hint cannot reconstruct content or grant access. The existing local/test `shifaa:feature-010-refresh-hint` invalidation seam is reused; C23's local worker sink is not fabricated into a production browser transport.

Authority freshness expires after 30 seconds, checked on a five-second timer; expiry triggers a cleared-state REST refresh. Focus/foreground/reconnect and manual refresh also reauthorize. The client cannot observe an unsignalled server transition instantaneously: observable invalidation or REST denial removes protected content immediately, and every operation performs live REST checks. This checkpoint does not claim a production realtime subscription.

The approved functional arrangement is retained: a top canonical success receipt, selected-context and message cards in two columns on wide screens, stacked cards on compact screens, shared tokens/bundled fonts, Arabic-first RTL and English LTR, wrapped body text, isolated LTR references, localized Cairo timestamps, and a keyboard-focusable success heading. Focus/scroll runs after the authoritative success is committed to the DOM.

## Root review corrections

Rendered verification caught a real DOM typography defect: native typography tokens contain pixel line heights and native font-family names. The C25-only web adapter now converts line height to the token line-height/font-size ratio and maps fonts to the existing bundled CSS families. This preserves token dimensions while allowing text scaling. The grid uses the existing `breakpoint.wide` token. No shared tokens, fonts, approved composition sources, or references changed.

Root also tightened the authentication response boundary to retain only a validated challenge ID or verified session token/AAL, and moved success focus/scroll into an effect after DOM commitment. A missing breakpoint import introduced during root review was caught by the rendered run, fixed, and clinic typecheck passed before the next run. Intermediate failed runs are not accepted as GREEN evidence.

Browser fixture corrections preserve the intended assertions: locale state must actually change after hydration; the receipt selector targets its body paragraph; stale recovery uses a new marker while duplicates remain inert; and keyboard traversal uses an enabled send action with a valid unsent draft. The rendered matrix uses real Next/Chromium with synthetic HTTP fixtures. It does not replace the separate real-database authorization regressions.

## T075 rendered and focused results

```text
corepack pnpm --filter @shifaa/clinic exec tsx --test test/feature-010-messages.test.tsx
corepack pnpm exec playwright test --config tools/feature-010-messages-playwright.config.ts
corepack pnpm exec playwright test --config tools/feature-010-encounter-playwright.config.ts
corepack pnpm --filter @shifaa/clinic typecheck
node --test tools/verify-feature-010-scope.test.mjs
node tools/verify-architecture.mjs
pwsh -NoProfile -File specs/010-encounters-referrals-contextual-chat/visual-baselines/validate-reference-baselines.ps1
```

Focused controller tests passed 13/13. The complete C25 browser run passed 2/2 scenario groups, each iterating all four requested locale/viewport combinations. Root then strengthened the send proof to use Tab/Enter from the composer and assert focus on the canonical success heading; the entire current-tree matrix again passed 2/2 (15.4 seconds), including all four combinations. The final current-tree C15 regression passed 11/11 after the Today navigation addition. Clinic typecheck passed. API production files were not touched, so API typecheck was not required for this UI-only checkpoint.

| State/check                                                                       | ar-EG 768×1024 | en-EG 768×1024 | ar-EG 1440×900 | en-EG 1440×900 |
| --------------------------------------------------------------------------------- | -------------- | -------------- | -------------- | -------------- |
| Today discovery; explicit IDs/confirmation; visible selected context              | PASS           | PASS           | PASS           | PASS           |
| Active workforce history/body-only composer; canonical send in-frame              | PASS           | PASS           | PASS           | PASS           |
| Empty history; context-bound cursor page; manual REST update after missed hint    | PASS           | PASS           | PASS           | PASS           |
| Hint → REST; duplicate/foreign/extra-content hint inert; distinct marker refresh  | PASS           | PASS           | PASS           | PASS           |
| Stale/last-updated; reconnecting with hidden history; REST recovery               | PASS           | PASS           | PASS           | PASS           |
| Actual browser offline transition clears draft/history/composer; zero queued POST | PASS           | PASS           | PASS           | PASS           |
| Older held read cannot overwrite newer identity denial                            | PASS           | PASS           | PASS           | PASS           |
| Conflict/503/PAT identity fail closed; recovery requires REST                     | PASS           | PASS           | PASS           | PASS           |
| Removed participant and ended interval clear history/composer                     | PASS           | PASS           | PASS           | PASS           |
| Completion removes history/composer; later hint cannot restore content            | PASS           | PASS           | PASS           | PASS           |
| RTL/LTR; bundled font; keyboard/focus; 200% text; 320 CSS-pixel reflow            | PASS           | PASS           | PASS           | PASS           |
| No attachment/file control, general channel, or general inbox                     | PASS           | PASS           | PASS           | PASS           |

The unit scenarios additionally prove patient-self/context mismatch, missing/unknown workforce roles, future/malformed interval starts, AAL1 denial, extra attachment property rejection, token rotation, late send after offline/completion, late selected-context reads, old failure after newer success, and ignored-abort old success after newer denial. These cannot reach a successful protected state or send on stale local authority.

Sixteen synthetic captures are retained locally at `%TEMP%/shifaa-f010-clinic-chat-captures`: `c25-{ar-EG,en-EG}-{768x1024,1440x900}-{success,stale,completed,removed}.png`. Root inspected current rendered success, stale, removed, and completed examples across both locales/viewports. Success captures include the receipt above the workspace; completed captures also preserve the matrix's 200% text scaling. These are informative TEST-ONLY composition evidence, not regenerated baselines or pixel-identity approval. Keyboard, live-region, computed text scaling/reflow, forced-colors, and reduced-motion behavior were checked in Chromium. Native screen-reader use and actual browser 400% zoom were not performed; later OPEN gates remain open.

## Root acceptance and files

Root's security/privacy review found no body logging/persistence or raw unexpected response retention, private-note existence cue, unrelated clinical field display, hint-to-message insertion, authority granted by hints, cached participant entitlement, optimistic fake success, cross-context history, attachment control, or offline write queue. Denied, ended, removed, completed, stale, offline, changed-selection, and superseded-response paths clear protected content. The documented unsignalled-transition limit remains: server REST is authoritative, and the client clears on observed invalidation/denial rather than claiming knowledge of an unseen server change.

Clean-code, test, and documentation guard passes checked the production trust boundaries, meaningful externally observed assertions, correct runners, and evidence against implementation. No remaining checkpoint acceptance finding. C15 behavior remains passing. No new API/domain operation, Feature 009 runner change, T076+ implementation, approved spec/plan/OpenAPI/baseline edit, or historical migration edit. The known Next-generated `next-env.d.ts` path changes were restored after browser servers stopped.

- `apps/clinic/src/app/messages/page.tsx`
- `apps/clinic/src/components/feature-010/ContextMessages.tsx`
- `apps/clinic/src/components/clinic-scheduling/ClinicQueueRoute.tsx`
- `apps/clinic/test/feature-010-messages.test.tsx`
- `apps/clinic/test/feature-010-messages.browser.spec.ts`
- `tools/feature-010-messages-playwright.config.ts`
- `specs/010-encounters-referrals-contextual-chat/evidence/C25-clinic-chat-ui.md`
- `specs/010-encounters-referrals-contextual-chat/tasks.md` (T073–T075 acceptance only)

Targeted formatting and both staged/working-tree whitespace checks govern the resulting C25 commit. Root owns the feature-branch push and closure of only #380–#382. Full `pnpm verify`, feature integration to main, and T076 or later work are excluded from this checkpoint.
