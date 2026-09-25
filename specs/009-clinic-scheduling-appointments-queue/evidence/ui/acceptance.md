# Feature 009 UI evidence — synthetic browser checkpoint

This document records live browser observations with synthetic fixtures for T076. All 492 approved metadata rows have mapped, freshly rendered actual captures. This evidence does not close visual approval, UAT, or the retained `OPEN-UX-002` gate.

## Approved metadata binding

- Baseline source version: `SHIFAA-F009-P0-SOURCE@1.0.0-candidate`.
- Approved metadata digest: `3ac755cc03c263826d1a07d53e08716e8390857249dbda1eb936833265ac0a4c`.
- Coverage contract: 492 route/locale/state/canonical-viewport tuples across eight route families, with `ar-EG` RTL and `en-EG` LTR.
- Reference PNG files are immutable. This work reads approved metadata only; it does not read, write, or hash approved reference PNGs. Fresh rendered PNGs live under `evidence/ui/actual/` and map by baseline ID, locale, viewport, state, and approved route.

## Machine-observed browser evidence

The Playwright capture helper checks the current rendered route against the approved route, selects the visible `main` landmark containing the asserted state anchor, verifies its language and direction, waits for web fonts, and requires a visible text descendant to use a registered, loaded locale-appropriate font face. Before each capture the test asserts its actual state anchor, scrolls that anchor into the canonical viewport, verifies its full bounding box, and saves the real browser viewport PNG. These are state-focused viewport captures; lower-page captures may omit the route title or other content above the state. They are not full-page composition evidence.

Playwright assertions cover visible keyboard focus, dialog entry/cancel/focus return, result focus, localized accessible names and `role=status`/`role=alert`/`aria-live` semantics in the rendered DOM, mixed-direction isolation, target dimensions, normal-palette computed contrast, forced-colors and reduced-motion media behavior, responsive overflow, and synthetic state recovery. The checks inspect browser DOM and computed styles. They do not establish what a particular screen reader speaks or prove assistive-technology announcement timing.

Clinic web typography is locally bundled from the pinned `@fontsource/inter` and `@fontsource/ibm-plex-sans-arabic` 5.3.0 packages. Their dependency integrity is recorded in `pnpm-lock.yaml`; browser captures also require the route’s relevant font face to load and pass `document.fonts.check`. The clinic focus outline reads the shared design-system `color.focus` token.

Clinic text enlargement tests apply a 2rem CSS rule to rendered content. Patient route tests use the `scaleRenderedText(2)` fixture control. Compact clinic reflow checks use a 320 CSS-pixel viewport, equivalent in width to a 1280 CSS-pixel layout viewed at 400% zoom. These are reproducible layout proxies; they are not actual operating-system text scaling or browser zoom. Forced-colors checks emulate the browser media feature and are not a Windows High Contrast manual session.

The contrast check measures visible rendered text/control nodes where both computed foreground and nearest opaque ancestor background colors are available. It reports the measured node count and fails any sampled pair below 4.5:1. This automated sample does not replace complete manual WCAG assessment for gradients, images, anti-aliasing, or every non-text boundary.

## Manual evidence and retained limits

No NVDA with Chrome on Windows or TalkBack session was performed for this evidence pass. Keyboard and screen-reader claims above are limited to machine-observed DOM semantics, focus state, and live-region attributes. Real assistive-technology speech, reading order, and announcement timing remain unproven. Actual 200% browser zoom and 400% browser zoom were not exercised. `OPEN-UX-002` remains open, and the captures support structural/manual comparison only; they do not certify pixel identity, reference-device behavior, formal visual acceptance, or UAT.

All test data and server responses are synthetic fixtures. The screenshots show the running application rendering those fixtures; fixture state labels are not overlaid onto screenshots. The frozen 18-operation contract, appointment and queue state producers, `cash_on_arrival` payment method, production SMS disablement, and Feature 010 exclusion remain unchanged.

## Focused result and capture inventory

Focused browser results were clinic appointment 10/10, clinic schedule 4/4 (including the 76-tuple state matrix), and clinic queue 9/10 followed by a passing focused rerun of its one failed focus case. The patient suite passed 20/24 before the four booking cases failed at the capture font guard. The serial booking rerun passed all four locale/viewport cases with `corepack pnpm exec playwright test --config tools/clinic-scheduling-playwright.config.ts --grep "Booking validation, conflict, uncertain, and confirmed result"` (4/4). Its font guard exposed an Expo Router hidden prior `main`; the capture helper now binds the visible landmark containing the rendered state anchor. The four passing cases include booking conflict, uncertain retry, and confirmed result states. These are separate focused runs; no single rerun of all patient or clinic suites is claimed here.

The schedule confirmation review found that a prior generic accepted `Action result` could remain visible below an open absence or retirement confirmation and imply the pending action had succeeded. The result region now hides while a confirmation is pending and returns if staff cancel. The focused clinic schedule browser suite passed 4/4 after this correction, including cancel/restore assertions and Arabic/English assertions that the old result heading is absent during destructive confirmation. The Arabic and English absence and retirement confirmation captures were refreshed at both canonical viewports. Before an absence submission, the dialog says the server will determine the affected appointments and that the count is unknown; the authoritative count appears only after the server responds.

An actual Arabic booking conflict capture exposed an ISO appointment timestamp whose RTL inline layout scrambled and wrapped its characters. Arabic discovery and doctor captures exposed the same risk for next-slot and last-updated values. Booking, discovery, and doctor now display technical timestamps on separate LTR lines; the shared staleness indicator uses that layout only where the Feature 009 routes opt in. The focused serial discovery, doctor, and booking run passed 12/12 locale/viewport cases with rendered assertions for LTR direction, left alignment, and a single-line ISO value. Actual Arabic 360x800 booking conflict, discovery results, and doctor available captures were inspected after recapture; the ISO values appeared in order without wrapping. This visual observation applies to those inspected captures, not every image in the inventory.

`node tools/verify-feature-009-evidence.mjs --ui` exited zero against 492/492 mapped captures. The manifest inventory is CLN-APPOINTMENT 100, CLN-QUEUE 68, CLN-SCHEDULE 76, CLN-TODAY 48, PAT-APPOINTMENT 100, PAT-BOOK 36, PAT-DISCOVER 32, and PAT-DOCTOR 32. The verifier reports `reference_png_io=none`: it reads the approved metadata and hashes the actual captures, not the approved reference PNGs.
