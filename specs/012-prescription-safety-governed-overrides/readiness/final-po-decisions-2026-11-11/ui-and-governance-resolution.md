# F012 bounded UI/governance resolution — FOR PRODUCT OWNER DECISION

No approval is invented. C3 v0.3.0 Product approval is final and recorded in [decision record](product-owner-decision-record.md); it does not make the Product Owner subordinate to a Design Lead. Existing higher-priority clauses nevertheless explicitly require dual attribution:

- [PRD §10.2, OPEN-UX-001](../../../../shifaa-prd.md#102-remaining-open-items), line 375: owner “Product Owner + Design Lead”; closure “Approve linked designs at required viewports; export immutable baseline IDs”; earliest block “PLAN_APPROVED for affected UI”.
- [Master §14.2, OPEN-UX-001](../../../../SHIFAA-Implementation-Plan-MASTER.md), line 475: same owner/evidence/stage.
- [UI Contract §11](../../../../docs/design/SHIFAA-UI-Contract.md#11-visual-regression), line 208: “Baselines are accepted only by Product Owner + Design Lead” and source version/screenshot SHA-256 binding. Four viewports, both locales, shared dark primitive references are specified there.
- OPEN-TEAM-001 (PRD line 354) gives Yousef pre-implementation engineering ownership but explicitly preserves UX gates; it is not an existing implicit waiver.

## U1 — smallest formal resolution, not enacted

Ready-to-decide text:

> For isolated synthetic F012 only, approve an additive feature-specific governance exception to the Design Lead co-acceptance element of OPEN-UX-001 (PRD §10.2, Master §14.2) and UI Contract §11. Accept my attributable Product Owner C3 v0.3.0 decision, bound to the exact hashes in this package, as sufficient visual-composition authority for those named references. This does not invent another person's signature, rename roles, restructure general governance, waive required composition/baseline coverage or amend other features. New C2 release controls require their own exact source/baseline Product review under this same bounded arrangement; they are not pre-approved by the existing C3 decision. Keep OPEN-UX-002, native accessibility, live locale, clinical/legal/production and runtime/security verification separate. Prepare/integrate only the bounded governance successor through the existing governed amendment process before asserting effective closure.

Alternative: obtain an actual attributable Design Lead acceptance of named exact source/baselines without changing the rule. No repeated Product approval of v0.3.0 is requested. U1 would be a new explicit governed exception, not something this record enacts. Canonical PRD/Master/UI bytes remain unchanged here.

## New C2 control delta — precise affected composition contract

Only Clinic's existing prescription authoring/details route changes. Patient, Pharmacy review, independent reviewer and emergency flows retain their approved v0.3.0 baseline references. No new route/app/role or broad patient audience selector. Required exact additional reference states:

| State                                     | Required review outcome                                                                                                                                                                   |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign confirmation                         | Separate unchecked prescription and prescribed-record choices; neither selected by default; deliberate confirmation; immutable clinical/sign result.                                      |
| Post-sign selection                       | Current prescriber/care/facility/AAL2/fresh-TOTP and release permission shown as required context; exact signed revision and current control state; independent P and selected M targets. |
| Confirm release                           | Subject only; exact targets; prior hidden history is not disclosed until committed confirmation; no clinical edit/sign control reused.                                                    |
| Durable success                           | Receipt/reference/time and actual target release state, next step; no toast-only confirmation or implication of dispensing.                                                               |
| Withdrawal confirm/success                | Exact releases, bounded reason, current withdrawal permission, durable receipt; warn that earlier disclosure cannot be recalled; never re-open a withdrawn release.                       |
| Denied/step-up/current-care loss          | No sensitive detail or operable mutation; restore current authorization, never borrow prior prescriber identity.                                                                          |
| Stale/conflict                            | Mutations clearly disabled; authoritative refresh/control CAS reconciliation required.                                                                                                    |
| Unknown commit                            | No duplicate new key or unchecked retry; reconcile original key under current authority before another action.                                                                            |
| Offline/producer or authority unavailable | No mutation queue or successful empty claim; explain recoverable failure and current refresh.                                                                                             |
| Historical/expired/new release blocked    | Clinical record remains immutable and visibly historical; existing released history can be withdrawn under independent current authority, never newly released here.                      |
| Already withdrawn                         | Explicit terminal withholding; no implicit re-release/undo.                                                                                                                               |

Required output before affected-UI Plan acceptance: additive source compositions and immutable PNG hashes for these states in ar-EG RTL/en-EG LTR at 360×800, 412×915, 768×1024 and 1440×900, plus applicable shared dark primitive references; keyboard/focus/200%-text evidence. These new compositions are now rendered as unapproved additive candidates: [C2 control gallery](c2-control-gallery.html), [source](../../design/c2-release-controls-2026-11-11-v0.1.0/index.html), [manifest](../../design/c2-release-controls-2026-11-11-v0.1.0/baselines/manifest.json) and [browser evidence](../../design/c2-release-controls-2026-11-11-v0.1.0/validation.json). 124 full-page compositions at the four labelled viewport widths (15 states × 2 locales × 4 viewports, plus 4 dark references); eight compact 200%-text/focus cases passed. These are full-page reference compositions, not a new initial-viewport claim or Product/Design/native-AT acceptance. No prior C3 screenshot is falsely offered as a post-sign release screen. Review only this delta; do not repeat the satisfactory existing C3 layouts. Browser checks cannot replace native assistive-technology or human live-language verification at their later stages.

The new control references can be reviewed and explicitly accepted in the same C2 decision; no extra lifecycle or generic research pass is required. U1 stays a proposed exception until your exact decision and governed integration.
