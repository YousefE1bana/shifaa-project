# Feature 009 P0 visual baseline approval record

## Exact approved candidate

| Field | Value |
|---|---|
| Source version | `SHIFAA-F009-P0-SOURCE@1.0.0-candidate` |
| Source artifact | `source/composition.html` |
| Baseline IDs | 8, unchanged from the approved specification |
| Reference images | 492 seeded-synthetic PNGs |
| Manifest | `reference-manifest.json` |
| Manifest SHA-256 | `3ac755cc03c263826d1a07d53e08716e8390857249dbda1eb936833265ac0a4c` |
| Capture environment | Edge `151.0.4129.93`; CDP exact viewport emulation; light mode; reduced motion; repository-pinned IBM Plex Sans Arabic and Inter |
| Status | `APPROVED_FOR_FEATURE_009_OPEN_UX_001` (the immutable manifest retains its pre-approval candidate-status bytes) |

The full manifest is authoritative. Each row maps route, locale, viewport,
state, seeded fixture, source node/version, reference artifact, and SHA-256.
The references freeze composition and test evidence only; the provisional mark
and replaceable neutral visual layer are not final project branding.

## Eight-baseline review index

| Baseline ID | Route | States | Viewports | Arabic review reference | English review reference |
|---|---|---:|---|---|---|
| `F009-P0-PAT-DISCOVER-001` | Patient `/discover` | 8 | 360×800, 412×915 | `references/F009-P0-PAT-DISCOVER-001/ar-EG/360x800/results.png` | `references/F009-P0-PAT-DISCOVER-001/en-EG/412x915/results.png` |
| `F009-P0-PAT-DOCTOR-001` | Patient `/doctors/:id` | 8 | 360×800, 412×915 | `references/F009-P0-PAT-DOCTOR-001/ar-EG/360x800/available.png` | `references/F009-P0-PAT-DOCTOR-001/en-EG/412x915/no-slots.png` |
| `F009-P0-PAT-BOOK-001` | Patient `/appointments/new` | 9 | 360×800, 412×915 | `references/F009-P0-PAT-BOOK-001/ar-EG/360x800/conflict.png` | `references/F009-P0-PAT-BOOK-001/en-EG/412x915/success.png` |
| `F009-P0-PAT-APPOINTMENT-001` | Patient `/appointments/:id` | 25 | 360×800, 412×915 | `references/F009-P0-PAT-APPOINTMENT-001/ar-EG/360x800/reschedule-required.png` | `references/F009-P0-PAT-APPOINTMENT-001/en-EG/412x915/cancel-confirmation.png` |
| `F009-P0-CLN-TODAY-001` | Clinic `/today` | 12 | 768×1024, 1440×900 | `references/F009-P0-CLN-TODAY-001/ar-EG/768x1024/worklist.png` | `references/F009-P0-CLN-TODAY-001/en-EG/1440x900/delay-active.png` |
| `F009-P0-CLN-QUEUE-001` | Clinic `/queue` | 17 | 768×1024, 1440×900 | `references/F009-P0-CLN-QUEUE-001/ar-EG/768x1024/delay-active.png` | `references/F009-P0-CLN-QUEUE-001/en-EG/1440x900/reorder-review.png` |
| `F009-P0-CLN-SCHEDULE-001` | Clinic `/schedule` | 19 | 768×1024, 1440×900 | `references/F009-P0-CLN-SCHEDULE-001/ar-EG/768x1024/absence-confirmation.png` | `references/F009-P0-CLN-SCHEDULE-001/en-EG/1440x900/overlap-conflict.png` |
| `F009-P0-CLN-APPOINTMENT-001` | Clinic `/appointments/:id` | 25 | 768×1024, 1440×900 | `references/F009-P0-CLN-APPOINTMENT-001/ar-EG/768x1024/checked-in.png` | `references/F009-P0-CLN-APPOINTMENT-001/en-EG/1440x900/reschedule-required.png` |

State totals include loading, empty where applicable, recoverable/terminal
error, offline, stale, conflict, permission, submitting, success, state
projections, and explicit cancellation/reorder/absence/retirement review
compositions where applicable.

## Validation result

`validate-reference-baselines.ps1` passes:

- all 8 approved routes and immutable baseline IDs;
- all 492 inventory combinations with no missing or extra PNG;
- Arabic/English and canonical viewport mapping parity;
- source node/version, per-image SHA-256, PNG signature, and exact dimensions;
- exact 18-operation parity;
- appointment and queue no-producer state taxonomy, including queue `removed`;
- no route or operation introduced by visual evidence;
- `git diff --check`.

Two consecutive full exports produced the same manifest SHA-256 above. The
stabilized reduced-motion profile removes animated skeleton paint from evidence
captures rather than accepting frame-dependent hashes.

Behavioral keyboard/focus, semantic naming, target, reflow, forced-color,
reduced-motion, and announcement obligations remain frozen in
`decisions/OPEN-UX-001-test-only-p0-baselines.md`. Their later implementation
and renderer/tolerance verification remain governed by `OPEN-UX-002` and other
recorded verification gates; this candidate does not claim completed product
accessibility testing.

## Approval record

On 2026-09-10, Yousef Osama, Product Owner, explicitly assigned Yousef Osama as
Design Lead for Feature 009 visual-baseline governance only. He then separately
approved the exact source version and manifest SHA-256 above in his Product
Owner and Feature 009 Design Lead capacities. The digest was revalidated before
the approvals were recorded.

`OPEN-UX-001` is therefore satisfied for Feature 009 affected UI and no longer
blocks Feature 009 planning. The assignment and approvals do not establish a
permanent project-wide Design Lead, globally close `OPEN-UX-001` for later UI
features or authorize implementation. This visual approval did not itself grant
`PLAN_APPROVED`; a separate Product Owner decision later granted planning-only
`PLAN_APPROVED` on 2026-09-10. `OPEN-UX-002` remains open for later formal
visual-regression acceptance.
