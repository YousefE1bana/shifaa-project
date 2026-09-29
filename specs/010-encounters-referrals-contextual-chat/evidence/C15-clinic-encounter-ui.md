# C15 clinic encounter UI evidence

Date: 2026-09-29
Scope: Feature 010 checkpoint C15, clinic encounter workspace issues #350–#352 (T043–T045). Synthetic test data only.

## Baseline and boundary

- Approved baseline family: `F010-P0-CLN-ENCOUNTER-001`
- Route and reference states: `/encounters/:id`, including loading, fresh created encounter, open encounter, note draft/review/signed, participant review/end confirmation, completion review/completed.
- Approved viewports exercised: 768×1024 and 1440×900; locales: `ar-EG` RTL and `en-EG` LTR.
- Reference manifest SHA-256: `18e4471d686990e797e8a5e370a20ceda7ea823020e3f84fdea0e03a65394310`.
- This records browser-observable functional and structural evidence. It does not claim pixel identity or formal UI acceptance. No baseline assets, contract, spec, or plan were changed.

## Test-first evidence

Command: `corepack pnpm exec playwright test --config tools/feature-010-encounter-playwright.config.ts`

The initial RED run stopped at the expected missing-route/UI behavior: the browser could not find the English locale control while opening `/encounters/:id`. The route and workspace were then implemented. The final focused run passed all eleven browser cases.

## Covered behavior

- The fresh created projection renders exactly one responsible participant and no signed notes; no participant-add picker is present.
- Note drafts capture type, body, and private or patient-visible visibility. Both review paths disclose the selected visibility before signing. Sign requests use generated Core API and idempotency metadata.
- A successful sign followed by failed authoritative refresh remains reported as successful, blocks further writes against the stale version, and can recover through refresh without repeating the sign.
- Active and historical participant intervals are shown. Participant editing first opens a review surface; ending an active non-responsible interval requires a second explicit confirmation. The responsible participant cannot be ended. The update request uses If-Match and idempotency metadata. If its projection omits participants and authoritative reconciliation fails, the encounter is hidden and writes remain unavailable until recovery. A denied refresh hides encounter content.
- Completion requires review of a nonblank summary plus structural confirmation. The completion response’s encounter, appointment, and queue identifiers/versions are shown for that completed mutation. Appointment/queue statuses are localized human-readable labels. Completed encounters expose no further clinical write actions. A completion conflict leaves the encounter open and does not report success.
- Arabic and English locale direction, keyboard focus/dialog behavior, and both approved viewport sizes were exercised. Human-readable Arabic values and localized dates remain naturally RTL; machine identifiers and versions are isolated LTR. Signed timestamps use `Intl.DateTimeFormat` with `Africa/Cairo`.

## Verification

- `corepack pnpm --filter @shifaa/clinic typecheck` — passed.
- `corepack pnpm exec playwright test --config tools/feature-010-encounter-playwright.config.ts` — 11 passed, including participant refresh failure/recovery, refresh denial, and completion conflict.
- Prettier applied to `EncounterWorkspace.tsx` and `feature-010-encounter.test.tsx`.
- No full `pnpm verify` was run, per the C15 task boundary.

- `corepack pnpm architecture:check` — passed (18 canonical boundaries, 17 package manifests). The workspace derives encounter/note/completion/participant types from generated Feature 010 client method return types and adds no clinic dependency on @shifaa/contracts.
