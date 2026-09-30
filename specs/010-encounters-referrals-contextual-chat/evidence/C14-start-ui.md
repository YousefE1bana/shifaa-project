# C14 Clinic Start Encounter UI Evidence

Date: 2026-09-29

Scope: T040–T042, clinic `/patients/:id/summary` Start encounter only. Browser fixtures use synthetic IDs and API responses; no production data or service was used.

## RED

Command: `pnpm exec playwright test --config tools/feature-010-start-playwright.config.ts`

Before adding the route, the first test failed while looking for the summary language control (`getByRole('button', { name: 'English' })` timed out). The `/patients/:id/summary` route was absent at that point, so the browser showed no summary UI. This records the T040 missing-UI failure.

## GREEN

Commands:

- `pnpm --filter @shifaa/clinic typecheck` — passed.
- `pnpm exec playwright test --config tools/feature-010-start-playwright.config.ts` — 6 passed.

The live Chromium route tests covered:

- `en-EG` LTR at 768×1024: checked-in appointment plus matching `called` queue renders Start encounter; keyboard activation opens review, confirms focus order and API recheck text.
- `en-EG` LTR at 768×1024: explicit review calls generated `createEncounter` with the checked-in appointment ID, current patient ID, and the approved `consultation` type, then navigates to `/encounters/:id`.
- `ar-EG` RTL at 768×1024: absent appointment, a fresh appointment with a waiting queue, denied read, and stale read do not render Start encounter or navigate.
- `ar-EG` RTL at 1440×900: review opens, Escape returns focus to Start encounter, and stale authoritative confirmation reads prevent the mutation request.
- `en-EG` LTR at 1440×900: a server `409` from `createEncounter` shows a conflict, with no success state or navigation.
- `en-EG` LTR at 768×1024: if the fresh confirmation read returns a different checked-in appointment and matching called queue than the reviewed pair, the UI blocks creation and reports stale eligibility.

The read path uses generated Feature 009 `listAppointments` and `getQueue` clients, requires fresh complete pages and exactly one matching called entry, and fails closed on missing, stale, denied, inconsistent, or incomplete reads. Start uses the generated Feature 010 client. No workforce picker or direct database write is present.

The patient-context header is neutral; it does not assert a clinic name, workforce role, AAL, or test-environment status. Facility, appointment, and queue IDs are shown only from an eligible authorized appointment/queue response. The review dialog includes both the reviewed queue-entry ID and its `called` state.

## Baseline notes

The approved `F010-P0-CLN-SUMMARY-001` start-eligible, start-review, and start-stale PNGs were inspected read-only. The app uses their patient-summary, appointment-review, and stale-denial structure. The approved composition uses short synthetic appointment/queue reference labels, while the contracted API exposes UUID identifiers; the route currently displays those returned IDs in an LTR-isolated form. The reference PNGs, source composition, manifest, and inventory were not changed. This evidence records engineering behavior only; it does not claim pixel identity, formal visual acceptance, or closure of `OPEN-UX-002`.
