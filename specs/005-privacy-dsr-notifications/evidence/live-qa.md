# Feature 005 live browser QA

> Seeded-synthetic engineering evidence only. This is not production, legal, vendor, DPO, regulator, accessibility-lab, or formal design approval. `OPEN-UX-001`, `OPEN-UX-002`, and `OPEN-TEAM-001` remain open.

## Execution identity

- Date: 2026-08-20 (Africa/Cairo)
- Branch: `codex/005-privacy-dsr-notifications`
- Starting commit: `51b66adaae5256101ddd2c6387a7644abe436f09`
- Verified implementation commit: `3b3896d5a938d43b7692a26cf7a890bf0705ebef`
- Runtime: local in-memory feature API on port 3000, Expo web patient on 8082, Next admin on 3002, Chromium in the reviewed Docker browser relay
- Data: deterministic synthetic patient, guardian, DPO, evidence, template, export, and notification fixtures only
- Browser origin accommodation: `host.docker.internal` is explicitly allowed in Next development mode and in the local API CORS list; it is not a production origin.

## Live journeys

| Surface                   | Locale                     | Result                                                                                                                                                                                                                                                                                                                   |
| ------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/privacy/requests`       | Arabic RTL and English LTR | Loaded the subject-only list; created access/export, correction, restriction, and erasure-review requests; each appended a received item with version and synthetic non-statutory follow-up label.                                                                                                                       |
| `/privacy/requests`       | Arabic RTL and English LTR | Displayed the seeded identity-verification-required correction request and the explicit legal-retention block for erasure automation.                                                                                                                                                                                    |
| `/privacy-requests`       | Arabic RTL and English LTR | Loaded only three assigned minimum-projection requests. A live partial-approval initially exposed a UI mapping defect (free text sent as `reason_code`); after correction to `reason_code=request.reviewed` plus `reason_summary`, the mutation advanced v2 to `partially_approved` v3 and fulfilment advanced it to v4. |
| `/privacy/requests`       | English LTR                | The fulfilled access request exposed the private export action. The two-step capability issue/consume path completed and the UI showed success. Replay/expiry/no-store enforcement remains proven by the real-stack API tests; the live expired state was rendered separately.                                           |
| `/notification-templates` | Arabic RTL and English LTR | Created a paired Arabic/English `DSR_EXPORT_READY` draft as the author, switched to the independent AAL2 publisher, and published v2. The author could not publish and the publisher could not create a draft.                                                                                                           |

## State and accessibility matrix

The browser directly rendered and inspected:

- Patient: loading, empty, offline/no-queue, permission, stale/conflict, export-ready, export-expired, failure/retry, success, identity-required, retention-blocked, and ready/list states.
- DPO: loading, empty, AAL2-required, purpose-required, permission, identity-required, stale/conflict, offline, failure, success, and assigned-ready states.
- Templates: loading, empty, AAL2-required, purpose-required, separation-denied, stale, offline, failure, success, draft, and published states.
- Compact 360x800 and 390x844, tablet 768x900, desktop 1280x800 and 1440x900.
- Keyboard traversal reached real buttons and form controls with visible focus.
- At 200% zoom on a 720px viewport, `scrollWidth === clientWidth`; no horizontal reflow overflow occurred.
- Ten local browser samples across exact 412x915 and 768x1024 viewports measured LCP p95 348ms and locale-switch input response p95 10.6ms against the 3000ms/200ms engineering thresholds; see `browser-performance.json`.
- `prefers-reduced-motion: reduce` and `forced-colors: active` both matched and retained focus/control visibility.
- Arabic pages reported `lang=ar-EG`, `dir=rtl`; English pages reported `lang=en-EG`, `dir=ltr`.
- With the loaded app taken offline, attempting a privacy mutation announced that no request is created or queued.
- Browser network inspection showed successful feature API calls after the CORS/dev-origin correction. Remaining console messages were development-tool notices only.

The container renderer provides only fallback Arabic fonts. The UI Contract's formal renderer/font-matrix acceptance remains `OPEN-UX-002`; these screenshots are informative live evidence, not pixel-identical approval.

## Inspected screenshots

| File                                             | View/state                               | SHA-256                                                            |
| ------------------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------ |
| `live/005-ar-patient-compact.png`                | Arabic RTL, 360px patient list           | `11f6527506e017bf99737a7675989bf7a7209144e88fe45beaed625752f4908b` |
| `live/005-en-patient-desktop.png`                | English LTR, desktop patient list        | `b9ef8aafe35fb1d031f1fab251b0da706a32dd04261c2f26fef2ef816cda1f48` |
| `live/005-en-patient-desktop-export-ready.png`   | English LTR, fulfilled/export-ready      | `d2f8efa79efe32420494b0cce3218e2b165abfa87a80c34060828437b895f873` |
| `live/005-en-patient-compact-export-expired.png` | English LTR, compact expired capability  | `a3fbd49ba4952a9755edd34218614dbd1b3fcc42a75a3501c2e49bdd5a442846` |
| `live/005-en-patient-412-success.png`            | English LTR, exact 412x915 success state | `95bd20da40907f291a01ee01750eeb15f3996dcf2ee769489d947fe56bfbed65` |
| `live/005-ar-patient-768-empty.png`              | Arabic RTL, exact 768x1024 empty state   | `25837a25be054a61cc65b940359e9f73bd5f6b16d262a86ef7254e7cd09220d9` |
| `live/005-ar-dpo-desktop-ready.png`              | Arabic RTL, assigned DPO worklist        | `dae355006917dbd9a1880a0ceac8c078057a84d9ee9f7a7ea74f241da964c47e` |
| `live/005-en-dpo-tablet-stale.png`               | English LTR, tablet stale/conflict       | `f67a96feda6a90b10b20343a72652fc89406a99c60acedf5caf9b7c6b1dd8f34` |
| `live/005-ar-templates-compact-published.png`    | Arabic RTL, compact published release    | `670028cefac96582b98a493b0f4b7cddbec5679e161821a809607594a46039b0` |
| `live/005-en-templates-desktop-separation.png`   | English LTR, separation-denied state     | `9a71f9cc2e6248e11245b043129e1995d7fb24913954f61663104048003a072a` |

Every listed PNG was reopened from `specs/005-privacy-dsr-notifications/evidence/live/` and visually inspected. No real person, contact detail, PHI, provider secret, capability token, or production message body appears.
