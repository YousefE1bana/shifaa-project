# Live browser QA — Family Care Relationships

**Date:** 2026-08-13

**Feature:** `004-family-care-relationships`

**Source state:** frozen baseline `468dc193b93ad8350f71c5fb44e16468f83329a1` plus the reviewed 004 working diff; the final verification record pins the feature commit.

**Migration SHA-256:** `14dc1537ed4700d438c9d2303cb696bf9cb8dbeb5ce84996c479cc6bdc5c585e`

**Seed SHA-256:** `9f48c900e791f14d2b9f9a67008dde1f6133a63685410cfedaa0bab416c0c97e`

## Runtime boundary

The browser drove the real local Expo patient app (`127.0.0.1:8081`) and Next admin app (`127.0.0.1:3001`) against the running Fastify API (`127.0.0.1:3000`). The API used the local Supabase Auth/PostgreSQL/Storage stack after `pnpm supabase db reset` applied migrations through `20260811000600_family_care_storage.sql`. All records, principals, phone values, evidence objects, and tokens were seeded-synthetic. No production provider or real-person data was used.

## Inspected screenshots

| Surface                              | Locale / direction    | Viewport | Result                                                                                                                               | Screenshot                                       |
| ------------------------------------ | --------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| patient context switcher             | Arabic `ar-EG` / RTL  | 360×800  | PASS — explicit selection, announced patient and relationship, disabled-until-confirmed continuation, 44/48 px controls, no clipping | `live/004-ar-care-switcher-360.png`              |
| guardianship and delegation          | Arabic `ar-EG` / RTL  | 360×800  | PASS after remediation — visible labels, spaced sections, LTR-isolated UUID/date/permission values, no horizontal overflow           | `live/004-ar-relationships-360-fixed.png`        |
| Emergency Contact                    | Arabic `ar-EG` / RTL  | 360×800  | PASS — separate consent states, labeled masked-contact inputs, closed SOS disclosure, terminal states, no horizontal overflow        | `live/004-ar-emergency-contacts-360.png`         |
| Emergency Contact                    | English `en-EG` / LTR | 768×1024 | PASS after remediation — root locale/direction and dynamic status copy switch without fallback text                                  | `live/004-en-emergency-contacts-768-fixed.png`   |
| guardianship and delegation          | English `en-EG` / LTR | 1440×900 | PASS — full-width desktop reflow, labeled controls, exact closed permissions, no clipping                                            | `live/004-en-relationships-1440.png`             |
| Support Admin guardianship           | Arabic `ar-EG` / RTL  | 1440×900 | PASS — real pending released-evidence case, minimum projection, independent decision surface                                         | `live/004-ar-admin-relationships-1440-case.png`  |
| Support Admin guardianship           | English `en-EG` / LTR | 768×1024 | PASS — responsive two-panel layout, minimum projection, correct root locale/direction                                                | `live/004-en-admin-relationships-768.png`        |
| final relationship regression        | Arabic `ar-EG` / RTL  | 360×800  | PASS — final hydrated code, labeled 44/48 px controls, bidi-isolated machine values, no horizontal overflow                          | `live/004-final-ar-relationships-360.png`        |
| final invitation-fragment regression | Arabic `ar-EG` / RTL  | 768×1024 | PASS — fragment consumed after hydration and scrubbed after Expo Router reconciliation; no hash/history secret remains               | `live/004-final-ar-emergency-contacts-768.png`   |
| final Support Admin regression       | English `en-EG` / LTR | 1440×900 | PASS — final code, released-evidence minimum worklist and independent-decision surface visually inspected                            | `live/004-final-en-admin-relationships-1440.png` |

Every listed PNG was opened and visually inspected. Superseded screenshots that exposed the defects described below were not retained as acceptance evidence.

## Real browser journeys

- Arabic patient context was confirmed, focus advanced with `Tab`, and `Enter` activated the enabled continuation into `/relationships`.
- A fresh synthetic Emergency Contact was created from the Arabic browser; the network record was `POST /v1/patients/{id}/emergency-contacts -> 201` and the polite live region announced success.
- A fresh English browser contact creation also returned `201`. PostgreSQL showed encrypted name and phone byte arrays, a masked projection, and a 32-byte invitation HMAC digest. Its one audit row and one outbox row contained none of the token, phone, evidence, diagnosis, medication, lab, admission, or record-link sentinels; no plaintext `invitation_token` column exists.
- An English browser delegation creation returned `POST /v1/patients/{id}/delegations -> 201` with the exact selected `record.view` permission.
- The seeded pending guardianship appeared in the real Support Admin worklist. An independent Support Admin session with AAL2 and `guardianship_review` submitted an approval and received `POST /v1/admin/guardianships/{id}/decision -> 200`; the live region announced success.
- The admin synthetic-state control was driven through loading, empty, AAL-required, purpose-required, self-review denied, conflict, error, and success. Each state produced distinct English live-region text; Arabic parity is enforced by the catalog test.
- With the browser context offline, Emergency Contact creation produced `navigator.onLine=false` and announced `Connect to the internet. This change was not queued.` Connectivity was restored before later mutations.

The automated real PostgreSQL journeys remain the acceptance evidence for replay, changed-payload idempotency, token race, expiry, revocation, cross-patient, direct-RLS, and terminal-state negatives that cannot safely be represented by retained browser URLs or screenshots.

## Accessibility and responsive checks

- Arabic and English synchronize both `document.documentElement.lang` and `dir`; page-level content uses logical direction.
- Accessibility snapshots exposed named headings, regions, radio groups, checkboxes, textboxes, live status/alert regions, and buttons. UUID, date, phone, and permission strings remain LTR-isolated inside Arabic layouts.
- Compact 360 px, tablet 768 px, and desktop 1440 px layouts had `scrollWidth == clientWidth`. A 200% CSS zoom reflow check at 768 px also had no horizontal overflow.
- `prefers-reduced-motion: reduce` was active for patient and admin checks; the feature has no decorative decision/revocation motion.
- `forced-colors: active` was exercised on admin. Keyboard traversal reached the locale control, state selector, worklist item, reason field, and decision controls; the hidden Next development portal is a dev-only artifact and not feature UI.
- Core actions measured at least 44×44 CSS px; mutation buttons measured 48 px high. Focus remained visible in the browser and the patient context flow restored focus to the next enabled action.
- Browser console inspection reported zero errors on all retained surfaces. No Next/Vite error overlay or blank page was present.

## Defects found and corrected during live QA

1. Patient Arabic initially left the root document at English/no direction. The locale provider now synchronizes root language and direction.
2. Admin used an invalid synthetic Support Admin token shape and would always receive 401. The token now includes the required `support_admin` role segment and the live request returns 200.
3. Compact Arabic relationship controls lacked visible labels, spacing, and bidi isolation. Labels, layout spacing, full-width controls, and LTR machine-value direction were added.
4. Emergency Contact success copy was stored as translated text and remained Arabic after switching to English. The component now stores a locale-neutral state and translates at render time.
5. The deterministic migration seed did not include the documented pending guardianship case. A released-evidence pending case and its exact requested permissions were added with a schema assertion.
6. Final regression verification found Expo web hydration left invitation fragments in the address because the lazy state initializer ran during pre-render. Fragment consumption now runs after hydration and repeats URL scrubbing after router reconciliation; live evaluation proved `location.hash === ''` and the token absent from `location.href` one second after navigation.

**T026 result:** PASS for seeded-synthetic engineering. Formal design/accessibility approval remains blocked by the canonical `OPEN-UX-001`, `OPEN-UX-002`, and `OPEN-TEAM-001`; this evidence does not close them.
