# C27 — Arabic/English accessibility parity

Accepted by root on 2026-09-30 for T079–T081 / #386–#388 only, following accepted C26 commit `addd8b9d7ba899def11d484223504d879933f164`. Evidence uses synthetic local/test data and the explicitly clarified existing-route acceptance boundary below.

## Acceptance boundary and immutable inventory

Yousef clarified this checkpoint's acceptance to **existing-route accessibility coverage, with missing product states recorded separately**. The current clinic patient-summary route provides C14 appointment/queue eligibility and encounter start. It does not implement the encounter overview and authorized private/patient-visible note cards depicted by its frozen note variants. C27 adds no such business/data flow and does not represent those states as implemented.

| Approved family                    | Existing route          | Frozen P0 state count |
| ---------------------------------- | ----------------------- | --------------------- |
| PAT records                        | `/records`              | 15                    |
| PAT encounter and appointment chat | `/encounters/:id`       | 15                    |
| CLN summary/start                  | `/patients/:id/summary` | 13                    |
| CLN encounter                      | `/encounters/:id`       | 18                    |
| CLN referrals                      | `/referrals`            | 12                    |
| CLN appointment-context messages   | `/messages`             | 14                    |

The tests enumerate all six families and all 87 inventory state rows, and validate the 408-reference manifest. Inventory enumeration is separate from live existing-state coverage; this is not a claim that 87 distinct product states are implemented or rendered. No manufactured state aliases substitute for missing product behavior. The source remains `SHIFAA-F010-P0-SOURCE@0.3.0-test-only`; the approved manifest digest remains `18e4471d686990e797e8a5e370a20ceda7ea823020e3f84fdea0e03a65394310`.

## Genuine T079 RED

- The executable namespace-import catalog test found the Feature 010 bilingual six-family exports absent (`undefined` versus `object`), without an import/setup error.
- The live clinic sign-in route at 320px and four-times computed heading text produced 376px document width. The two-times case passed. Reflow wrapping was fixed without clipping content or reducing text.
- The live clinic document retained `<html lang="ar" dir="rtl">` despite exact `ar-EG` requirements and English subtree switching. The focused root-language assertion failed after 33 polls. A shared Feature 010 document-locale hook now synchronizes language/direction and restores previous document attributes on cleanup.
- The active clinic summary's Arabic start control measured 40.5px wide; the clinic messages Today link measured 28.94px wide. Both failed the 44px target check.
- At 320px, the fixed clinic sidebar left the encounter's note-type text input only 18px wide and the summary overflowed to 333px at twice-size text. The existing medium breakpoint now stacks these compact layouts while preserving the approved wider composition.
- Four-times text exposed actual Arabic heading/identifier overflow: referrals reached 416px, messages 331px and the encounter 466px. The encounter's denied-state reload button reached 435px. Fixes constrain intrinsic widths and allow wrapping; they do not clip content or reduce text.
- Root visual review identified incorrect native-token use on three clinic web roots. The rendered summary paragraph measured 16px font and 384px line height (ratio 24), failing the approved 24px body line-height assertion (ratio 1.5). The bounded fix converts the existing pixel token into a CSS unitless ratio, following the already-correct clinic messages conversion. No typography token or approved reference is changed.
- Strengthened React Native Web text-leaf measurements exposed hidden internal overflow at 400% text despite document width remaining 320px: Arabic Records heading extended from -95.7px to 304px, Encounter heading from -80.6px to 304px, and the language switches were entirely offscreen. A Records role label also began at -46.2px. Both header rows now wrap with constrained shrinking titles, and Records role labels stay within their controls. A subsequent English Encounter send label measured 242px scroll width inside a 238px button; this receives a bounded text-wrap correction rather than font reduction or clipping.

Fixture/session errors, an incorrect manifest JSON assumption, overly broad Next route-announcer alert selectors, a readiness assertion for referral reason text before review, and a transient misplaced client directive were corrected and excluded from RED evidence. Container font-size alone does not prove scaling of fixed-pixel text and is not accepted as a scaling measurement.

## Copy and bounded implementation review

Root independently compared the seven original dictionaries at the C26 commit with the shared catalog using TypeScript AST extraction and deep equality: all **568 bilingual copy entries** are preserved verbatim. Existing patient helper exports remain available. Catalog families have closed known keys; patient encounter chat keys are prefixed only to prevent collisions with encounter labels, not to invent product states.

Existing identifiers and timestamps use explicit LTR isolation within localized text. Message success/state announcements are concise; whole protected history and message bodies are not added to broad live regions. Existing REST authorization, request fencing, mutation confirmation, offline cutoff, completion/revocation cutoff, server-authoritative success and private-note projection behavior remain unchanged.

The clinic locale primitive is scoped to the four existing Feature 010 clinic routes. Patient layout already uses its existing locale provider and disables Stack animation, so no unnecessary patient layout change is needed. No API/domain operation, new route, product redesign or baseline regeneration is introduced.

## Verification and limitations

Root inspected the actual normal 320px Arabic/English captures across all six families, including explicit clinic context selection and the body-only patient composer. The web typography correction restores the approved 16px/24px body ratio rather than introducing new typography. Root also inspected enlarged-text captures and rejected the earlier document-width-only result when a patient heading clipped inside React Native Web's scroll container. The strengthened final suite includes ordinary React Native text leaves, actual text geometry and internal block-text clipping. Root inspected the corrected Arabic Encounter heading/language control, English Records heading and scrolled Records/Encounter action captures: text wraps within the available width without font reduction or hidden actions.

The final browser commands ran serially with one Chromium worker and zero retries:

```powershell
$env:SHIFAA_F010_ACCESSIBILITY_APP='patient'
corepack pnpm exec playwright test --config tools/feature-010-accessibility-playwright.config.ts
$env:SHIFAA_F010_ACCESSIBILITY_APP='clinic'
corepack pnpm exec playwright test --config tools/feature-010-accessibility-playwright.config.ts
```

| Final selection                                                                | Passed | Explicit opposite-app skips | Failed |
| ------------------------------------------------------------------------------ | ------ | --------------------------- | ------ |
| Patient: C16 encounter, C20 records, C24 chat and C27 profiles                 | 67     | 7 clinic-only checks        | 0      |
| Clinic: C14 start, C15 encounter, C21 referrals, C25 messages and C27 profiles | 32     | 4 patient-only checks       | 0      |

The skips select the other app's four clinic/two patient live-family profiles and app-specific sign-in/denied/summary checks. No failed state is skipped. All six active family profiles run in both locales; existing regression suites additionally exercise their original compact/tablet/wide viewports. REST is intercepted at the network boundary with closed synthetic generated-client projections; live browser evidence is not production deployment or native-device acceptance.

| Existing family    | Rendered functional/state coverage                                                                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PAT records        | PAT/GUA/DEL acting context, pending/referral review, authorized reason/type disclosure, keyboard acceptance, authoritative success, authority loss, offline/stale/conflict and failed acceptance with no false appointment                 |
| PAT encounter/chat | Authorized released projection/private-note exclusion, active/empty/history/send success, GUA/DEL denial, completion/access loss, stale/hint/reconnect/offline recovery and late-response fencing                                          |
| CLN summary/start  | Current eligibility, reviewed start, fresh appointment/queue recheck, authoritative navigation, absent/denied/stale/conflict, keyboard review/focus restoration                                                                            |
| CLN encounter      | Created/open, private/patient-visible note draft and sign review, signed success, participant end/review/removal cutoff, completion review/success/conflict, failed refresh and disabled writes                                            |
| CLN referrals      | Authorized source selection, proposed create review, canonical create success, empty/history, denied/offline clearing and REST recovery, failed create with no fake success, existing Today discoverability                                |
| CLN messages       | Explicit context selection/current participant, history/canonical send success, ended/removed/completed/stale/conflicting authority, overlapping/late response fencing, hint invalidation, reconnect/offline REST recovery, keyboard focus |

For each active family/locale at 320×800, the final checks measure actual computed heading, known body text (16→32→64px) and control enlargement at 200% and 400%. They assert document width and internal block-text bounds/scroll width, not just a container font or viewport change. Inline span/bdi `clientWidth=0` is not mistaken for clipping; rendered bounds remain checked. Native form controls retain standard value/caret behavior while their bounds, names and keyboard access remain checked. The final enlarged-text profiles have no normal-content horizontal overflow or clipped heading/action/body text.

Browser semantic checks cover main/navigation landmarks, named headings/sections, form/control names, radio checked state, disabled actions, localized status/alert feedback, visible keyboard focus, dialog review/return behavior through the existing regressions, LTR-isolated technical IDs and Cairo-localized dates/times where current routes actually display them. Human-facing workflow labels have no tested raw enum/status fallback. Visible enabled controls and label hit areas meet 44×44; patient primary actions retain 48px minimum height.

Reduced-motion checks inspect a nonempty set of visible header/navigation/main content with zero animation/transition durations. A zero-size, z-index -1 safe-area sensor has a 0.05s measurement animation; its exact wrapper/geometry is captured and excluded from visible-content motion assertions. No information is communicated by motion alone.

Informative captures remain outside Git at `%TEMP%/shifaa-f010-accessibility-captures`: 12 current bilingual semantic `.aria.yml` snapshots, 12 wrapper JSON captures and 51 investigation/current PNGs, including 12 `*-320-400-text-content.png` captures after scrolling the actual route container. Playwright temporary output directories are `%TEMP%/shifaa-f010-patient-accessibility-temporary` and `%TEMP%/shifaa-f010-clinic-accessibility-temporary`. Final counts were recorded from the console line reporter; no saved console-log file is claimed. Captures neither replace nor regenerate approved references.

Non-browser verification passes: i18n 11/11; focused patient encounter/records/chat and clinic referrals/messages controllers 52/52; C22 API integration/adapter 21/21; C23 unit 9/9; Feature 010 contracts 6/6 and generated client 10/10. Patient, clinic and i18n typechecks pass. Architecture verifies 18 boundaries/17 manifests, scope passes 3/3, secrets checks pass, and targeted formatting/diff whitespace checks pass. The frozen validator confirms six families, 87 states/408 references, all source/inventory/image digests and PNG dimensions unchanged. C27 changes no API/worker/persistence behavior; C26's serial real-PostgreSQL/Supabase evidence remains the persistence regression evidence.

Native/manual assistive-technology and device profiles are not synthesized by browser tests. NVDA, VoiceOver, TalkBack and physical assistive-device execution are unavailable in this browser-only run. Computed 200%/400% text enlargement and 320px layout checks are browser measurements, not claims of operating-system scaling or native browser zoom execution. `OPEN-UX-002`, `OPEN-TECH-003` and all other retained gates remain open.

## Root acceptance and changed files

Root clean-code/test/docs and UX/a11y review accepts the clarified existing-route scope: six families covered; exact Arabic/English copy preserved; bidi/date/state semantics checked; keyboard/focus/targets/reflow/motion verified; generated REST behavior and live authority/fencing preserved. Missing CLN summary encounter-overview/private-note/patient-visible-note product flows remain separately recorded above. Inventory enumeration is not evidence that these absent flows exist. There is no remaining checkpoint finding within the clarified scope.

No new business logic/API operation, C28 work, post-026 polish, approved spec/plan/OpenAPI/baseline regeneration or historical migration edit. Patient layout already meets the locale/zero-animation boundary and is unchanged. Next's two generated development-import rewrites were restored after servers stopped. Root marks only T079–T081 complete, commits/pushes this checkpoint separately, and closes only #386–#388.

Changed files:

- `packages/i18n/src/feature-010.ts`, `feature-010.test.ts`, `index.ts`, and `packages/i18n/package.json`.
- `apps/clinic/src/app/layout.tsx`, `apps/clinic/src/app/patients/[id]/summary/page.tsx`.
- `apps/clinic/src/components/feature-010/EncounterWorkspace.tsx`, `ReferralWorkspace.tsx`, `ContextMessages.tsx`, `useFeature010DocumentLocale.ts`, `feature010WebTypography.ts`.
- `apps/patient/app/records.tsx`, `apps/patient/app/encounters/[id].tsx`, `apps/patient/src/feature-010-encounter.ts`, `feature-010-referrals.ts`.
- `apps/patient/test/feature-010-chat.browser.spec.ts` (exact canonical-ID assertions include the approved bidi isolation).
- `tests/e2e/feature-010-accessibility.spec.ts`, `tests/e2e/support/feature-010-accessibility-fixtures.ts`, `tools/feature-010-accessibility-playwright.config.ts`.
- This evidence and the T079–T081 acceptance ledger.
