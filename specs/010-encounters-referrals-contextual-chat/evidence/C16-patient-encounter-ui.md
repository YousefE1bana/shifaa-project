# C16 — Patient encounter projection evidence

**Scope:** Patient `GET /encounters/:id` subject projection for Feature 010. All fixtures use synthetic IDs, records, and note bodies. The generated Feature 010 client performs the read; PAT self, current approved GUA, and current DEL `record.view` authority is rechecked by the API on each request. The patient adapter only selects subject fields and patient-visible notes. A denied, offline, or failed freshness read clears previously displayed encounter content.

## T046 RED

Added `apps/patient/test/feature-010-encounter.test.tsx` before the adapter and route existed.

Command:

```text
corepack pnpm --filter @shifaa/patient exec tsx --test test/feature-010-encounter.test.tsx
```

Result: **failed as intended** with `ERR_MODULE_NOT_FOUND` for `apps/patient/src/feature-010-encounter.ts`, the missing implementation imported by the new tests. This was the intended red boundary, not a fixture or syntax failure.

## T048 GREEN

Focused adapter and route contract tests:

```text
corepack pnpm exec tsx --test apps/patient/test/feature-010-encounter.test.tsx
```

Result: **7 passed, 0 failed**. Covers generated `getEncounter` requests in `ar-EG`/`en-EG`, PAT/GUA/DEL bearer contexts, live-denial failure, 404 empty projection, private-note indistinguishability, rejection of unexpected metadata on released notes, completed projection, offline clearing, 503 stale clearing, and late-response races against offline and newer denied reads.

Live rendered browser tests:

```text
corepack pnpm exec playwright test --config tools/feature-010-patient-encounter-playwright.config.ts
```

Result: **8 passed, 0 failed** in Chromium with a synthetic refreshed session. Six locale/viewport cases exercised the visible projection and then cycled through completed, empty, refreshed, stale, denied, and offline states. The subject-visible-note route rendered at each approved patient viewport in both locales:

| Locale        | 360×800 | 412×915 | 768×1024 |
| ------------- | ------: | ------: | -------: |
| `ar-EG` (RTL) |    pass |    pass |     pass |
| `en-EG` (LTR) |    pass |    pass |     pass |

Each viewport case confirmed the released note is visible, the private test secret and unexpected private metadata are absent, the root direction matches locale, and page width does not exceed the viewport. The test then removes the private note from the same synthetic response, waits for the refreshed GET and rendered state, and confirms the main text is identical. Completed, empty, stale, denied/revoked, and offline states are also checked in both locales at all three viewports; denied/stale/offline states remove prior note text. Keyboard focus and Enter activation of the retry control are checked in both locales. Two further AR/EN cases check the main landmark and heading, Tab order and visible focus border, doubled rendered text at 360 px, and reflow at 320 px without horizontal document overflow. Denied startup reads expose a retry action so the route can recover after asynchronous session restoration, while server authority remains rechecked on retry. Superseded requests are aborted and guarded by a request generation before route state updates; adapter race tests also model a fetch implementation that resolves after abort.

Focused checks:

```text
corepack pnpm --filter @shifaa/patient typecheck
corepack pnpm architecture:check
```

Results: **typecheck passed**; **architecture verification passed for 18 canonical boundaries and 17 package manifests**.

## C16 privacy dependency — subject note correction metadata

The API adapter regression uses a synthetic `patient_visible` note whose `supersedesId` points to a private predecessor. Before the fix, the focused adapter test failed because PAT/GUA/DEL results included that private predecessor ID. The change removes `supersedesId` from subject note projections while preserving it in the CLN care-team projection. The patient adapter also drops the field from its explicit allowlist because the patient view does not use correction-chain metadata.

RED command:

```text
corepack pnpm --filter @shifaa/api exec vitest run test/feature-010-notes-adapter.test.ts
```

Result before the fix: **1 failed, 2 passed**; the new subject-projection assertion failed on the leaked private predecessor UUID.

GREEN focused checks after the fix:

```text
corepack pnpm --filter @shifaa/api exec vitest run test/feature-010-notes-adapter.test.ts
corepack pnpm --filter @shifaa/api typecheck
corepack pnpm --filter @shifaa/patient typecheck
corepack pnpm exec tsx --test apps/patient/test/feature-010-encounter.test.tsx
corepack pnpm exec playwright test --config tools/feature-010-patient-encounter-playwright.config.ts
corepack pnpm architecture:check
```

Results: API adapter tests **3 passed**; API typecheck **passed**; patient typecheck **passed**; patient route tests **7 passed**; rendered browser suite **8 passed** (six locale/viewport matrix cases plus two AR/EN accessibility cases); architecture verification **passed for 18 canonical boundaries and 17 package manifests**. No full `pnpm verify` was run.

## Evidence limits

The browser run is synthetic engineering evidence for the approved Feature 010 TEST-ONLY functional baseline. The doubled text and 320 px reflow checks approximate scaling; actual 400% browser zoom, NVDA/TalkBack, and reference-device acceptance were not exercised. It does not claim production authorization integration, pixel identity, or closure of `OPEN-UX-002`, `OPEN-TECH-003`, or legal gates. No full `pnpm verify` was run in this checkpoint.
