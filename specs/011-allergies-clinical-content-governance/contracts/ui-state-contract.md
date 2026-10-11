# Feature 011 UI state contract

Planning only, 2026-10-01. Approved UI Contract 0.9.2 and clarified spec §8 control behavior. OPEN-UX-001 remains an affected-UI PLAN_APPROVED blocker: Feature 011 composition/reference evidence is pending. Existing Feature 010 compositions are contextual dependencies, not Feature 011 approval. OPEN-UX-002 retains formal visual/reference VERIFYING limits.

## Existing routes and authority

| Surface / route                 | Required rendering and action boundary                                                                                                                                                                                                                                                                      |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Patient /records                | Selected subject; authorized allergy current/history and four-state labels. Self can report with substance/source and known/unknown optional fields. GUA/DEL existing read only; no report button for their managed subjects. Empty/unknown never means allergy-free                                        |
| Clinic /patients/:id/summary    | Consume Feature 010 patient/encounter/facility context; current clinician care authority. Create still self_reported; verify confirmed/refuted revisions and terminal error with new reason/evidence. Show source/recorder/verifier/version/time and correction links                                       |
| Clinic /clinical-content/status | Explicit status-read/current workforce-facility/purpose/AAL2. Only published/effective metadata and minimal signature-status evidence; no body, draft/unsigned detail, signer identities or mutation/admin controls                                                                                         |
| Admin /clinical-content         | Explicit ADM-MEDICAL action grants control create/publish; independently eligible signing does not require that admin role. Separately authorized assigned reviewer may inspect/sign only the exact assigned immutable artifact. No general admin navigation or create/publish controls derive from signing |

No new route or app. Reuse existing design-system forms, status text/icon cues, feedback, confirmations, paging and i18n. Composition reference IDs are intentionally not invented; required owner-approved references must be attached before affected Plan approval.

## States required for every route

| State                  | Observable behavior and recovery                                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Loading                | Stable skeleton/progress announcement; no stale action enabled before current authority/version is available                           |
| Empty / unknown        | Explain no available record/content; no clinical safety assertion or guessed field                                                     |
| Ready                  | Explicit patient/facility/purpose and version/time; distinguish reported, verified, refuted and erroneous                              |
| Permission / step-up   | No protected body/existence leak; explain required authorization or AAL2 without granting authority                                    |
| Unavailable dependency | Fail closed; no partial success/signature/publication; deliberate retry after recovery                                                 |
| Offline                | Explicit offline/unknown; disable mutations, do not queue clinical/governance actions                                                  |
| Stale / conflict       | Explain version/key conflict; refresh live authority/version and require review before a new action                                    |
| Receipt reconciliation | On uncertain transport outcome, reuse same exact key/bindings to reconcile original result; no automatically queued new mutation       |
| Success                | Attributable versioned receipt and focus return; no implied clinical approval or downstream decision effect                            |
| Future / gated         | Show effective instant/publication/eligibility separately; synthetic labels and retained-gate limits; unavailable has no safe fallback |

Confirm terminal entered_in_error and explain corrected assertion must be a new linked self_reported record. Confirmed/refuted changes capture a fresh reason/evidence. Never offer verified-to-self_reported or error reversal.

Signing confirmation displays exact artifact version/digest, source/effective instant, reviewed content/code/test-vector evidence, role capacity and independence. Publication confirmation displays two approval-status evidence bindings and supersession/initial marker. Refresh workflow ETag after each signature. No decorative motion or countdown changes a consequential action.

## Bilingual, accessibility and evidence

Arabic-first RTL and English LTR cover every state and action equally. Isolate opaque UUID/digest/code/UTC values bidirectionally; localize displayed instants without ambiguous effective time. Unknown values remain explicit, not blank defaults or fabricated severity.

Keyboard/focus order, screen-reader labels/live-region outcomes, text/icon redundancy, 200% scaling/reflow, contrast/touch targets and reduced motion follow canonical WCAG 2.2 AA requirements. Modal confirmation keeps focus and supports dismissal without accidental action. No color-only approval/status meaning.

Later capture synthetic live AR/EN acceptance for each route/state at approved compact/medium/wide viewports; patient checks include native Node module resolution and browser/native interaction as applicable. Redact identifiers/material from evidence. Record reference/device/network limits, never relabel test captures as approved baselines. No screen, screenshot, UI code or baseline amendment is created in Plan.
