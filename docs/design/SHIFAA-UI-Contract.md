# SHIFAA UI and Interaction Contract

> **Version:** 0.9.1 · **Status:** Deterministic provisional foundation; composition/tolerance approval remains `OPEN-UX-001/002`  
> **Last verified:** 2026-08-09 · **Locales:** `ar-EG` primary, `en-EG` parity

## 1. Convergence rule

All UI code MUST use this file plus `packages/design-system`. No application may define its own color, radius, spacing, type scale, shadow, focus ring, breakpoint, toast, dialog, or safety-alert anatomy. Exact screen composition/reference images are not yet approved; therefore this document makes implementation deterministic at the system/component/route-state level but does not claim pixel-identical screens until `OPEN-UX-001` closes.

After closure, every route/state row in Section 8 receives an immutable design node ID and reference image digest. Visual-regression differences above the approved threshold fail CI.

## 2. Design direction

- Patient app: calm, high-contrast Egyptian health-service interface using clear cards and limited Bento grouping. Decorative motion is restrained and disabled by reduced-motion preference.
- Staff apps: information-dense, stable, keyboard-first surfaces. Data, status, next action, and responsibility are visible without hover.
- Safety/emergency/approval screens: no decorative animation, no glass/blur, no gesture-only control, no disappearing instruction, and no confirmation whose primary action moves.
- Arabic is authored first. English is a translation, not a separate feature set.

## 3. Tokens

### 3.1 Color

All values are sRGB hex. Components consume semantic tokens only.

| Token            | Light     | Dark      | Use                   |
| ---------------- | --------- | --------- | --------------------- |
| `canvas`         | `#F7FAF9` | `#0C1413` | page background       |
| `surface`        | `#FFFFFF` | `#121D1B` | primary surfaces      |
| `surface-subtle` | `#EDF4F2` | `#192825` | secondary grouping    |
| `text`           | `#102522` | `#F2F7F6` | primary text          |
| `text-muted`     | `#4E6662` | `#AFC2BE` | secondary text        |
| `border`         | `#C9D8D5` | `#344A46` | controls/dividers     |
| `brand`          | `#087F6C` | `#36C2A8` | primary action/brand  |
| `brand-hover`    | `#066858` | `#68D4C0` | hover                 |
| `brand-pressed`  | `#064F45` | `#8EE0D0` | pressed               |
| `info`           | `#1264A3` | `#69B6F0` | neutral information   |
| `success`        | `#19733D` | `#63C985` | confirmed/success     |
| `warning`        | `#8A5400` | `#FFBE55` | interruptive warning  |
| `danger`         | `#B42318` | `#FF8A80` | error/contraindicated |
| `emergency`      | `#8E1111` | `#FF6B6B` | SOS/life safety only  |
| `focus`          | `#6D4AFF` | `#A991FF` | 3 px focus ring       |

Text/background combinations must meet WCAG 2.2 AA. Status always includes visible text and accessible name; semantic color/icon never carries meaning alone.

### 3.2 Typography

Fonts are locally bundled and checksummed: `IBM Plex Sans Arabic` for Arabic, `Inter` for Latin, and platform monospace for codes only. Fallbacks are `system-ui, sans-serif`. Default numeric style is tabular for queue, bed, lab, inventory, time, and money.

| Style      | Size/line | Weight |
| ---------- | --------- | -----: |
| Display    | 32/40     |    700 |
| H1         | 28/36     |    700 |
| H2         | 24/32     |    700 |
| H3         | 20/28     |    600 |
| Body large | 18/28     |    400 |
| Body       | 16/24     |    400 |
| Body small | 14/20     |    400 |
| Label      | 14/20     |    600 |
| Caption    | 12/18     |    500 |

Minimum patient body size is 16 px. OS text scaling through 200% must not clip or hide actions.

### 3.3 Geometry and motion

- Spacing scale: `0, 4, 8, 12, 16, 24, 32, 40, 48, 64` px/dp.
- Radii: controls `8`, cards `12`, modal/sheet `16`, pill `999`.
- Borders: `1` standard, `2` selected/critical, `3` focus ring with `2` offset.
- Shadows: card `0 1px 2px rgba(16,37,34,.08), 0 6px 20px rgba(16,37,34,.06)`; elevated dialog `0 16px 48px rgba(0,0,0,.22)`. No shadow in high-contrast or safety alert.
- Motion: 120 ms press, 180 ms enter, 220 ms route; ease `[0.2,0,0,1]`. Reduced-motion and safety routes use 0 ms.
- Minimum interactive target is 44×44; patient primary actions use 48 px height; staff compact rows use 44 px minimum.

### 3.4 Breakpoints and grids

| Name      |     Width | Grid                                               |
| --------- | --------: | -------------------------------------------------- |
| `compact` |     0–599 | 4 columns, 16 margin, 12 gutter                    |
| `medium`  |  600–1023 | 8 columns, 24 margin, 16 gutter                    |
| `wide`    | 1024–1439 | 12 columns, 32 margin, 20 gutter                   |
| `xwide`   |     ≥1440 | 12 columns, max content 1440, 40 margin, 24 gutter |

Patient content max width is 720 except discovery/map. Staff app shell is side navigation 256 px at wide/xwide, 72 px collapsed; compact uses bottom navigation or menu sheet. Tables convert to labeled stacked rows below 768, never horizontal page scrolling for core actions.

## 4. Application shells

| App      | Wide navigation                               | Compact navigation                                | Persistent action                                                     |
| -------- | --------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------- |
| Patient  | 104 px top bar + optional 240 px context rail | 64 px top bar + 72 px bottom tabs                 | 56 px SOS button fixed 16 px from logical end/bottom above navigation |
| Clinic   | 256 px side nav + 64 px top utility           | top bar + drawer; queue route may use bottom tabs | patient-context banner while record open                              |
| Pharmacy | side nav + scan action in top utility         | top bar + bottom scan action                      | 56 px scan control, never overlays submit                             |
| Hospital | side nav + facility/ward switcher             | top bar + drawer                                  | capacity freshness indicator                                          |
| Lab      | side nav + worklist filters                   | top bar + drawer                                  | specimen accession action                                             |
| Admin    | side nav filtered by permission               | top bar + drawer                                  | environment/role badge                                                |

Patient/guardian/delegate context is always shown as avatar/initial, full display name, relationship label, and a “switch person” action before mutations. Staff apps always show facility name/type, staff role, AAL state, and environment.

## 5. Shared component contracts

Every interactive component implements default, keyboard focus, pressed, disabled, and loading states; web components additionally implement pointer hover. Inputs implement valid and error states, while action controls expose the resulting success/error in the page region described below rather than changing to an invented “success button” style.

- **Button:** primary, secondary, tertiary, destructive. One primary per decision region. Loading preserves width and label in accessible text. Disabled is not used to hide the reason; helper/error text explains it.
- **Field:** visible persistent label, optional hint, input, counter where applicable, error association. Placeholder is example only. Arabic mixed-direction IDs use an isolated LTR input with Arabic label.
- **Select/combobox:** keyboard searchable, no free text for controlled clinical/catalog codes, explicit “not found/request review.”
- **Card:** header, optional metadata, body, actions; whole-card click is allowed only with equivalent named control and visible focus.
- **Status badge:** icon + localized text + semantic token. Never color alone.
- **Table/worklist:** sticky header wide, named sortable columns, visible filters, cursor pagination, empty/error/stale states, row action menu keyboard accessible.
- **Dialog/sheet:** named title, description, focus trap/return, explicit close except irreversible confirmation where dismissal still has “Cancel.” No critical decision uses a transient toast alone.
- **Toast:** noncritical confirmation only; 6 s default, pause on focus/hover, screen-reader live region. Errors requiring action render inline/banner.
- **Safety alert:** fixed anatomy: severity/title → conflicting facts → clinical consequence → source/version → required action → monitoring/justification fields → signatures/status. Contraindicated uses `danger`, 2 px border, no dismiss icon.
- **Staleness indicator:** timestamp + `Current`, `May be outdated`, or `Unknown`; stale/unknown capacity and inventory cannot look confirmed.
- **Offline banner:** persistent at top, names unavailable actions; queued local writes are prohibited for prescribing, dispense, bed, critical result, consent, role, and finance decisions.

## 6. Forms and confirmations

- Validation runs on blur and submit; server problems map to fields or a page summary. Focus moves to the summary, which links to invalid fields.
- Dates use localized presentation plus an accessible Gregorian date picker; stored/API value is ISO. Clinical/legal documents show the full Gregorian date and time zone.
- Destructive/high-risk confirmation repeats the resource and consequence. Typing a phrase is not used; AAL2 and explicit button confirmation provide assurance.
- Idempotent submit locks only the submitted action, preserves input, displays request state, and safely reuses the same key on network retry.
- A mutation success shows the new status, reference number, time, and next step. It does not rely on toast only.

## 7. RTL and bilingual behavior

- Direction derives from locale at document/root view. Logical CSS properties are mandatory.
- Navigation, breadcrumbs, stepper direction, chevrons, form alignment, and reading order mirror in Arabic.
- Phone numbers, National ID masks, GTIN/serial/batch, URLs, email, code, timestamps in ISO form, charts, and medication strength expressions remain LTR inside bidi isolation.
- Icons with inherent direction mirror; universal icons (search, plus, close, warning, medical cross) do not.
- Arabic/English labels are content-reviewed for clinical meaning; concatenated translations and runtime word-order assembly are prohibited.

## 8. Route and screen-state inventory

Every route requires loading skeleton, empty, permission denied, recoverable error, unrecoverable error, offline, success, and Arabic/English visual tests. A route displaying queue, bed, capacity, inventory, message, delivery, or other freshness-qualified data additionally requires a stale state with its last-updated timestamp. Parenthesized states are additional mandatory states.

### Family Care implementation slice (004)

- Patient routes `/care-switcher`, `/relationships`, and `/emergency-contacts` implement Arabic RTL and English LTR, compact/tablet/desktop reflow, keyboard-visible controls, reduced-motion behavior, offline no-queue messaging, and persistent explicit patient context.
- The Family Context banner always announces the selected patient and relationship and requires confirmation before a managed-patient action. No dependent login or automatic age/capacity transition exists.
- Guardianship and delegation surfaces expose only minimum relationship, current-permission, purpose, validity, and status projections. Guardianship decisions remain exclusive to the Support Admin `/relationships` workspace with AAL2 and `guardianship_review` purpose.
- Invitation bearer material is accepted from a URL fragment, scrubbed immediately, and sent only in an anonymous request body. It is never rendered, cached, logged in a path, or retained in browser history.
- Emergency Contact UI is a separate consent surface with masked owner projections and a closed future-SOS disclosure preview. It does not create an SOS or contact a provider in feature 004.

### 8.1 Patient app

| Route                                                     | Primary content                                                        | Additional states                                                                                                            |
| --------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `/onboarding`, `/login`, `/recovery`, `/mfa`              | locale, credential, proof/recovery                                     | vendor pending/failed, MFA challenge, locked/rate-limited                                                                    |
| `/identity`                                               | identity documents and verification                                    | upload quarantine, manual review, rejected with reason                                                                       |
| `/privacy`, `/privacy/consents`, `/privacy/requests`      | Arabic-first notice, consent, DSR                                      | withdrawal impact, export ready/expired                                                                                      |
| `/care-switcher`, `/relationships`, `/emergency-contacts` | guardianship/delegation/contact                                        | invitation pending/declined/revoked/expired                                                                                  |
| `/home`                                                   | next appointment, medicines, results, quick actions                    | managed patient, no data, stale signals                                                                                      |
| `/symptom-check`                                          | structured synthetic-scenario symptom routing with no-diagnosis notice | deterministic red flag, identifiers/free text rejected, model timeout/fallback, uncertainty/sources, kill-switch unavailable |
| `/discover`, `/discover/map`, `/doctors/:id`              | filters, verified facilities/doctors, live signals                     | location denied, stale/unknown, no qualifying SOS capacity                                                                   |
| `/appointments/new`, `/appointments/:id`                  | slot/fee/confirmation/queue                                            | slot conflict, reschedule required, live queue reconnect                                                                     |
| `/records`, `/encounters/:id`, `/prescriptions/:id`       | released record projections                                            | not fully checked, warning, cancelled/superseded                                                                             |
| `/medications`, `/medications/:id`                        | schedule/dose/adherence/refill                                         | missed/snoozed, insufficient prediction data                                                                                 |
| `/observations`, `/vaccinations`, `/entitlements`         | trends/schedule/credential                                             | self-reported, clinical review required, unverified benefit                                                                  |
| `/lab-orders/:id`, `/lab-results/:id`                     | lifecycle/released result                                              | not released, corrected, critical acknowledgement                                                                            |
| `/complaints`, `/reviews`                                 | private timeline/public review                                         | SLA escalation, moderation state                                                                                             |
| `/payments/:id`                                           | cash instruction or hosted care-payment status                         | provider pending, failed, expired, reconciled                                                                                |
| `/sos`, `/sos/:id`, `/sos/:id/share`                      | emergency action/match/share                                           | consent, no confirmed capacity, contact delivery, link revoke/expiry                                                         |

### 8.2 Clinic app

Routes: `/today`, `/queue`, `/schedule`, `/appointments/:id`, `/patients/:id/summary`, `/encounters/:id`, `/referrals`, `/prescriptions/:id`, `/clinical-content/status`, `/messages`. Mandatory additional states include facility absence/delay, patient-context authorization, unknown clinical standardization, warning acknowledgement, contraindicated hard stop, override requested/approved/rejected/expired, and offline mutation blocked.

### 8.3 Pharmacy app

Routes: `/worklist`, `/receipts`, `/receipts/:id/scan`, `/inventory`, `/inventory/packs/:id`, `/fulfilments/:id`, `/substitutions/:id`, `/eptts`. Mandatory states include scanner permission/unavailable, invalid/damaged/duplicate serial, aggregation not represented, unverified exception, expired/quarantined/recall, partial pack, version conflict, insufficient units, prescriber approval pending, and EPTTS manual/submitted/receipt-error.

### 8.4 Hospital app

Routes: `/arrivals`, `/arrivals/:id/triage`, `/capacity`, `/wards/:id`, `/beds`, `/admissions/:id`, `/admissions/:id/transfer`, `/admissions/:id/discharge`, `/sos-prearrivals`. Mandatory states include unconfirmed AI suggestion, stale capacity, held/expired bed, bed-version conflict, atomic transfer failure, discharge checklist incomplete, and signed amendment history.

### 8.5 Lab app

Routes: `/orders`, `/orders/:id`, `/specimens/:id`, `/results/:id`, `/critical-results`, `/catalog`, `/critical-policies`. Mandatory states include specimen rejected/recollection, preliminary/verified/not-released, critical policy/version, dual notification delivery, acknowledgement overdue/escalated, and corrected-result chain.

### 8.6 Admin app

Routes are permission-filtered: `/dashboard`, `/identity-reviews`, `/facility-approvals`, `/relationships`, `/complaints`, `/reviews`, `/clinical-content`, `/notification-templates`, `/ai-model-releases`, `/role-grants`, `/audit`, `/privacy-requests`. Mandatory states include AAL2 step-up, purpose capture, separation-of-duties conflict, pending independent role grant/revocation decision, minimum-cell aggregate suppression, missing mapped AI signatures, legal/clinical feature gate, and immutable evidence digest. DPO-designated users see only the purpose-limited privacy-request worklist and AI privacy-signature evidence assigned to them, not general admin routes. `/donations` and `/donation-cases` are explicitly absent from the graduation route inventory under ADR-016.

Feature 005 realizes `/privacy/requests`, `/privacy-requests`, and `/notification-templates` with Arabic RTL and English LTR parity. The patient surface exposes all four DSR types, due/history state, identity and retention gates, and a memory-only one-time export download. The DPO surface exposes minimum assigned fields plus reasoned approve/partial/refuse/fulfil actions. The template surface pairs both locales, shows the exact field schema, and separates author from AAL2 publisher. All three surfaces must retain loading, empty, offline, permission/AAL2/purpose, stale/conflict, failure, and success states at compact and desktop widths with keyboard focus, 200% reflow, high contrast, and reduced motion.

## 9. Safety and emergency copy rules

- Use plain Egyptian Modern Standard Arabic suitable for low health literacy; never use humor, blame, or reassurance unsupported by a clinician/system state.
- “No interaction found” is allowed only after a complete approved check; otherwise use the localized equivalent of “The check is incomplete—review is required.”
- SOS never says “bed reserved” until hospital acceptance and never says “ambulance dispatched.”
- Emergency-contact SMS contains only the approved minimum template; patient-facing UI previews exactly what will be sent.
- Critical result UI says contact/seek instructions defined by the facility policy and records acknowledgement; it never invents thresholds or diagnosis.

## 10. Accessibility test matrix

Each P0 route passes axe/static rules, keyboard-only use, NVDA + Chrome on Windows for web, TalkBack on reference Android for patient, 200% text, 400% browser zoom for responsive web, high contrast, reduced motion, and screen orientation/reflow where supported. Focus order follows visual/reading order. Live queue/notification changes use polite announcements; contraindicated and life-safety changes use assertive announcements once, without repetition.

## 11. Visual regression

Required viewports are 360×800 and 412×915 for patient compact, 768×1024 medium, and 1440×900 wide staff. Tests run `ar-EG` and `en-EG`, light mode, plus dark mode for shared primitives. Fonts and animations are stabilized. Baselines are accepted only by Product Owner + Design Lead and are identified by design node/version plus screenshot SHA-256. Until OPEN-UX-001 closes, visual snapshots are informative rather than proof of pixel-identical product intent.
