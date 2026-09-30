# C20 — Patient referral acceptance in /records

**Scope:** T058–T060, issues #365–#367. Synthetic TEST-ONLY data and the approved Feature 010 composition were used. The approved visual manifest remained at `SHIFAA-F010-P0-SOURCE@0.3.0-test-only`, SHA-256 `18e4471d686990e797e8a5e370a20ceda7ea823020e3f84fdea0e03a65394310`.

## T058 RED

The focused patient test was added before the route adapter. `pnpm exec tsx --test test/feature-010-records.test.tsx` from `apps/patient` failed with `ERR_MODULE_NOT_FOUND` for `src/feature-010-referrals.ts`. This was the missing C20 implementation, not fixture or syntax failure.

## T059 implementation and T060 GREEN

The patient route uses the generated Feature 010 client for `listReferrals` and `acceptReferral`. Existing approved Feature 009 `searchDoctors` and `listDoctorAvailability` supply doctor and effective slot choices. There is no new operation or direct domain write. The API authorizes each referral read and acceptance; role and patient context are display inputs, not authority claims.

The pending and accepted results are constructed from closed subject schemas. The review requires an explicit reason-summary authorization and an explicit include or exclude choice for optional `encounter_type`. The initial choice is unset. Acceptance uses the selected effective slot and does not send fee, currency, or payment method. Denied, stale, offline, and conflict paths clear protected content and show no success. The success view requires a matching authoritative acceptance result and shows the linked appointment, selected doctor/facility/time, and the existing appointment route action.

Focused checks:

```text
corepack pnpm exec tsx --test apps/patient/test/feature-010-records.test.tsx
corepack pnpm --filter @shifaa/patient typecheck
corepack pnpm --filter @shifaa/contracts exec vitest run src/feature-010.test.ts
corepack pnpm --filter @shifaa/api-client exec vitest run src/feature-010.test.ts
corepack pnpm test:encounters:scope
corepack pnpm architecture:check
```

Results: patient tests **7/7**, patient typecheck **passed**, contracts **6/6**, generated-client tests **10/10**, scope **3/3**, architecture **18 boundaries and 17 package manifests passed**.

Rendered Chromium verification:

```text
corepack pnpm exec playwright test --config tools/feature-010-records-playwright.config.ts
```

Result: **28/28 passed**. The synthetic API fixture exercises current PAT self, GUA, and DEL context, pending review, explicit opt-in and opt-out request bodies, success linkage, and denial, stale, conflict, and offline failures. Injected private/source-only fields are absent from rendered content. Role and patient context remain visible in representative mode. Keyboard focus and Space/Enter activation of custom disclosure controls were exercised; radio/checkbox checked state is exposed to the web accessibility tree.

| Locale | 360×800 | 412×915 | 768×1024 |
| --- | ---: | ---: | ---: |
| ar-EG RTL | pass | pass | pass |
| en-EG LTR | pass | pass | pass |

Each viewport case checked no document overflow, reachable review/acceptance actions, and an appointment ID, doctor, facility, time, and View appointment action only after successful acceptance. The Arabic date/time assertion accepts Arabic numerals. The failed acceptance and lost-authority cases render no appointment success or retained referral reason.

Targeted Prettier checks on the five C20 code/test/config files passed. `git diff --check` passed after staging. Approved reference validation passed before implementation: six identifiers, 408 references, ten operations, digests, dimensions, and Git diff were unchanged. No full `pnpm verify` was run.

## Root review and limits

The request never includes client fee, currency, or payment. The UI contains no representative chat, private-note preview, offline clinical write, or invented discovery source. The accepted response is checked against the selected referral, authorized fields, linked appointment, and selected slot before success. No C21 code, API/schema change, approved authority edit, historical migration, or reference regeneration entered this checkpoint.

These are synthetic local/browser checks. They do not establish production authorization, assistive-technology device acceptance, pixel identity, or closure of later `OPEN-*` gates.
