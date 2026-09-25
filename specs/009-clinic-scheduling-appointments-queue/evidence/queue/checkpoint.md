# Feature 009 — Checkpoint H clinic today and queue

Feature: `009-clinic-scheduling-appointments-queue`. This is **synthetic graduation engineering** evidence. Production approval: not granted. Work began from `c955ada56f628ee9232257848798e3c981e2f20d`; the final commit is identified by Git after this checkpoint is recorded. Checkpoint H covers only T064–T067 and stops before T068.

## Independent review and corrected findings

The root agent independently reviewed the T064 UI, T065 rendered tests, T066 HTTP/PostgreSQL test, reorder mutation path, SQL authorization, and task boundary. Review found that the existing HTTP route incorrectly required the queue-scope `queueVersion` to equal the entry version in `If-Match`. The route now passes both versions separately through the service and PostgreSQL adapter. The SQL reorder function checks the current scope version under lock, in addition to the entry version, before changing any waiting order. Existing SQL fixtures and function grants were updated for the revised signature. A stale entry or scope version returns conflict with no partial reorder.

Review also corrected restricted-reason validation for blank, control-character, overlong, and 500 Unicode code-point inputs; a rendered test initially expected the old HTML UTF-16 limit and was updated before the final passing browser run. The reason is persisted only in the restricted queue-entry field and excluded from the clinic projection, audit, and outbox assertions. The serial test checks that exactly one of two competing reorders succeeds, waiting positions remain contiguous, the winner reaches its requested position, and the loser makes no partial change.

## Clinic projections and action truth

The `/today` route presents selected facility, doctor, and civil date; an authorized worklist; empty, delay, absence, stale, offline, and error states; and a visible operational-context panel. The `/queue` route renders exactly `waiting`, `called`, `in_service`, `completed`, and `removed`. It shows server freshness, queue version, position, available estimate, and current delay as an overlay. Call and reorder controls appear only for waiting entries; complete appears only for called entries. Reorder requires a bounded restricted reason and current entry plus queue versions. Conflict reloads the full authoritative queue before another action. Neither route queues offline mutations or creates Feature 010 behavior.

Facility and selected doctor/date are displayed from the authorized requested scope. AAL is shown when the existing OTP result supplies it. The existing Feature 009 queue/read contract supplies no verified named role or deployment environment, so the UI explicitly labels role as unavailable from that response and displays only the **application build environment**. Server-side current membership, licence, AAL, action, and facility checks remain authoritative; the UI does not claim that a role label grants permission. `estimated_service_at` is nullable and the current policy defines no service-time formula. The UI shows “no current estimate” when null, and the test does not claim a newly calculated non-null time. The delay overlay does not change appointment time, queue order, or queue state.

The clinic queue projection excludes patient identity and appointment identifiers in the rendered browser assertions, and the real API/PostgreSQL test confirms a patient can read only their own position while a different appointment returns a concealed 404. The synthetic E2E injects a minimal service authorization context to exercise the API boundary; the PostgreSQL mutation and projection functions still check current seeded membership, licence, facility, doctor, and civil-date facts. The test is not a full production identity sign-in or screen-reader acceptance.

## Executable evidence

- `corepack pnpm --filter @shifaa/clinic test -- clinic-scheduling-queue` — PASS, 8/8 node tests, including the actual UI reason validator and 500-code-point boundary.
- `corepack pnpm exec playwright test --config tools/clinic-scheduling-queue-playwright.config.ts` — PASS, 7/7 executable rendered Chromium tests. Both `ar-EG` RTL and `en-EG` LTR render the five queue states and Today empty/delay/absence states. The browser exercises permission, stale/error/offline/reconnect, call, reason validation, reorder conflict refresh, complete, and focus return at 768×1024 and 1440×900, plus structural reflow, contrast, target size, forced colors, and reduced motion.
- `corepack pnpm test:clinic-scheduling:e2e -- queue` — PASS, 1/1 serial real API/PostgreSQL test in one isolated database: check-in → waiting, three concurrent unique queue numbers, own-position privacy, clinic projection, 500-character Unicode reason, invalid reasons, one-winner reorder race, stale entry and queue-scope versions, call, complete, absence removal, failed network request and reconnect, and cross-facility/doctor/date denials. Queue actions leave appointment `checked_in`; Feature 009 produces no queue `in_service` state.
- `corepack pnpm --filter @shifaa/api exec vitest run src/modules/clinic-scheduling/service.test.ts` — PASS, 28/28 focused service tests.
- Clinic and API package typechecks — PASS.
- `node tools/verify-feature-009-scope.mjs` — PASS; exactly 18 operations, nine appointment states, five queue states, `cash_on_arrival`, production SMS disabled, Feature 010 excluded, and open gates retained.
- `node tools/verify-feature-009-contract.mjs --generated --implemented` — PASS; OpenAPI 3.1.1 and exact 18-operation catalog.

These browser checks use synthetic HTTP fixtures; the serial journey uses synthetic people, facilities, memberships, and appointments with a real PostgreSQL database. No screen reader, real 200% text-scale or 400% browser-zoom acceptance, pixel-identity review, or production-data evidence is claimed. Formal all-route UI acceptance remains a later task.

## Approved visual metadata and retained gates

Approved metadata remains source `SHIFAA-F009-P0-SOURCE@1.0.0-candidate`, manifest digest `3ac755cc03c263826d1a07d53e08716e8390857249dbda1eb936833265ac0a4c`, 492 reference PNGs, 29237789 recorded bytes, eight route families, and locales `ar-EG` and `en-EG`. This checkpoint uses the two clinic baseline families `F009-P0-CLN-TODAY-001` and `F009-P0-CLN-QUEUE-001` as structural authority; it did not modify, regenerate, recompress, move, or re-hash their approved reference PNGs. `OPEN-UX-002`, `OPEN-TECH-003`, `OPEN-PRODUCT-001`, `OPEN-VENDOR-002`, and applicable legal gates remain open.
