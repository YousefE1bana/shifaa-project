# F011 delegated functional/accessibility second pass

Status: bounded second pass complete with evidence limits. This is advisory PO technical delegation, not Design Lead/QA approval or a gate disposition. No confirmed product defect was established in the selected sample.

## Independently inspected evidence

Twelve distinct saved PNGs were opened with view_image across patient records, clinic summary, admin governance and clinic content status. Both locales and compact/wide captures are included. Every selected file was freshly SHA-256 checked and matched its bilingual-acceptance or supplementary review-manifest entry. PNG dimensions below distinguish full-page height from viewport naming. The admin EN image was additionally viewed at original detail; tall compact images are limited by display downsampling.

| Saved image | Dimensions | SHA-256 |
| --- | --- | --- |
| specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K24/browser/patient/patient-ar-EG-history.png | 1280x720 | 553990c855f5e180e8668d6397fc539fe92c42ee907f6419056c75d17a2dd2ab |
| specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K24/browser/patient/patient-en-EG-reflow-contrast.png | 360x900 | 86f92d5d96c07b9d58400bb43e8100d9a06dac397c66019f233bc956e26e2d50 |
| specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K24/ui-gap-scenarios/clinic-ar-EG-aal2-required.png | 1280x949 | 40b77763534050c1578a4aac35146a1492dba3aa4e79b85693e5fdc3c770d3fa |
| specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K24/browser/clinic/clinic-en-EG-receipt.png | 1280x1297 | cbe288e7a76310da3f032e66f9911e0c48a3fc9f5b03e559f8935c46947b7a50 |
| artifacts/feature-011/k24/admin/shifaa-local-postgres-ar-EG-360x800.png | 360x9451 | f16464f48fed4c7074d559bfa33169ba5c6e3741a2ac0c4d079d921956cdad0c |
| artifacts/feature-011/k24/admin/shifaa-local-postgres-en-EG-1440x900.png | 1440x7974 | 77c8720a0314faf288c6891dc5b57b2d3ff52aa36e78e86bb60c2cd7fd77e7f1 |
| artifacts/feature-011/k24/status/shifaa-local-postgres-ar-EG-future.png | 1440x993 | bf512cdbafab10e21dcaa5d4ea5407dbd2c4970b0a3722759cdba0d5d72c743f |
| artifacts/feature-011/k24/status/shifaa-local-postgres-en-EG-gated.png | 1440x900 | f5723f31f2e779dde3c70f67c449802fdb40a79e19b9b810a3ee3f31f48a67b6 |
| specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K24/ui-gap-scenarios/patient-ar-EG-submitting.png | 1280x2000 | 6692b212294e0b1e039d02734d976fd40af8a4b4445adce7c88b2b35e1770cfc |
| specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K24/ui-gap-scenarios/patient-en-EG-authority-lost.png | 1280x2000 | 04f436dab10f691238fb61d401c933d779a98048d9baa78ea2ab2f22b42145ad |
| artifacts/feature-011/k24/status/shifaa-local-postgres-en-EG-360x800.png | 360x1437 | 5d21a6397b36f882583d552790ebb49f9dbdc06219c1b4f366a0f1771fc1a6e5 |
| specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K24/browser/clinic/clinic-ar-EG-reflow-contrast.png | 360x42013 | a8c46302fe6575643160a65523a19efad11876c4ae9cc855709758d7952a2864 |

## Observed meanings

- Patient AR submitting image has explicit submission text and no report confirmation action visible; unknown facts retain localized unknown text.
- Patient EN authority-lost image shows safe unavailability and cleared referral data, with visible focused refresh action and source/history/privacy actions.
- Clinic EN receipt includes saved-new-revision status, report reference, recorded time and next step to preserved history.
- Clinic AR aal2 fixture renders generic unavailable-under-authority/context copy and no report form; it does not independently prove an AAL2-specific native cause or distinct step-up composition.
- Admin AR compact and EN wide captures stack labeled release metadata, exact synthetic material and signature history; approval history is explicitly not proof of current eligibility. English source was additionally viewed at original detail.
- Status AR future displays published status together with not-currently-available meaning; EN gated displays unknown/unavailable without release detail. EN compact labels wrap and release identifier remains within the content card.
- Status and patient images show text meaning in addition to visual treatment; RTL/LTR placement is visible in the selected pairs.

## Evidence findings

- **UX-E01 (CAPTURE_LIMIT)**: Image begins within revision history and omits route heading/current context; it cannot alone establish full-page hierarchy or focus order. Evidence: specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K24/browser/patient/patient-ar-EG-history.png. Recommendation: Retain this historical image and prefer the supplementary scroll-to-top capture for current hierarchy review.
- **UX-E02 (CAPTURE_LIMIT)**: 360px-wide clinic reflow image is 42013px tall; whole-image display reduces it to an unreadable strip. Patient EN scale capture shows fragmented oversized words and only a scroll slice. Evidence: specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K24/browser/clinic/clinic-ar-EG-reflow-contrast.png. Recommendation: Use existing physical reviewer report only within its attributed scope; future scaled capture evidence should record settings and readable viewport slices of critical actions. No new production defect inferred.
- **UX-E03 (STATE_MEANING_LIMIT)**: Supplement labels identify HTTP fixture causes; generic forbidden/conflict/unavailable presentations do not establish distinct candidate-copy acceptance or physical Auth/SQL cause. Evidence: specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K24/ui-gap-scenarios/review.md. Recommendation: Keep scenario association and distinct composition acceptance separate; root should resolve product-copy decisions only against approved authority.

## Source inspection and render binding

The image bytes match recorded capture entries. Current source observation supports the visible meanings below; none of the selected component paths is pinned in browser-execution top-level sourceDigests, so this does not establish immutable capture-time component byte identity. Current source SHA-256 values are retained in ux-review.json.
- AllergySummaryPanel.tsx:123-129 localized polite status region; :185-201 linked required form labels; :233-242 persistent reference/time/next step; :150 and :236 LTR bdi identifiers.
- StatusWorkspace.tsx:45-53 section language/direction and atomic polite outcome; :68 eligibility copy; :75-94 isolated version/release and withheld-signature wording.
- ClinicalContentWorkspace.tsx:24-26 isolated technical identifiers; :252-271 outcome/modal/return focus source; clinical-content.css provides wrapping, target-size variables and focus-visible outline. These are static source observations, not independently executed behavior.

## Recorded results, not independently rerun

- Browser execution records exitCode 0 for patient/clinic/admin/status; not rerun by this delegate.
- Gap execution records PASS_SUPPLEMENTARY_TRANSPORT_SCENARIOS, 36 AR/EN cases, nativeAssistiveTechnology=false, nativeZoom=false, distinctCandidateCopyAcceptance=false.
- Yousef Osama reviewer reports PC 400% patient AR/EN reflow, physical access/readability, review/cancel and remaining NVDA/TalkBack/text/high-contrast/reduced-motion checks with no issues. This delegate did not observe those live checks or native utterances.

The reviewer consolidation and five linked observation reports were read. Earlier incomplete observations remain historical; the later remaining-checks reply supplements them. No utterances, timings or individual native executions are invented.

## Limits and retained authority

- Not a manual review of all 99 states or 746 references
- No live DOM/browser/DB/network activity
- No native speech transcript or independent device-setting verification
- No exhaustive contrast, target measurement, focus traversal, 200%/400% or reduced-motion test independently executed
- OPEN-UX-002 and OPEN-TECH-003 formal disposition remains for owners; no gate changes
- No pixel lock, clinical approval, production readiness or Design Lead/QA approval
- Selected component source paths are absent from browser-execution top-level sourceDigests; current source hashes are recorded, but exact capture-time component byte identity is not established by those pins.

Only ux-review.json and ux-review.md were written. No product source, canonical/spec authority, ledgers or gates were changed. No services, browser sessions, database, Git or network were used. Existing test outcomes remain recorded evidence; no fresh pnpm verify was run within this bounded review.

Docs Guard second pass under the SHIFAA third-party overlay checked paths, hash claims, source line references and attribution. No external executable was run.
