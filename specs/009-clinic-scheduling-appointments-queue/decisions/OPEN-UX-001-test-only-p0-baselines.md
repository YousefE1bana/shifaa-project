# Feature 009 TEST-ONLY P0 UI Composition Baselines

> **Decision ID:** `F009-OPEN-UX-001-P0-BASELINES`
>
> **Feature:** `009-clinic-scheduling-appointments-queue`
>
> **Version:** `1.2.0-approved`
>
> **Recorded:** 2026-09-10 (Africa/Cairo)
>
> **Product decision owner:** Yousef Osama, Product Owner
>
> **Feature 009 Design Lead:** Yousef Osama (assignment limited to Feature 009 visual-baseline governance)
>
> **Purpose:** immutable functional composition contracts for planning, implementation, testing, accessibility, and Arabic/English evidence only
>
> **Gate state:** `OPEN-UX-001 SATISFIED FOR FEATURE 009 AFFECTED UI` on 2026-09-10; program-wide `OPEN-UX-001` remains applicable to future UI features

## 1. Authority and boundary

Yousef Osama explicitly approved the clarified Feature 009 specification as
`SPEC_APPROVED` on 2026-09-10. That decision covers the frozen Feature 009 scope
and `CLARIFY-009-001..003`; it grants neither `PLAN_APPROVED` nor implementation
authorization.

The Product Owner also directs that Feature 009 use **TEST-ONLY P0** UI
baselines. The current UI is functional verification UI, not SHIFAA's final
visual identity. Final branding, logo, colors, typography, decorative identity,
illustrations, visual polish, animation language, and refined component styling
are deferred to a dedicated project-wide Polish phase after the planned
specifications are completed.

This document is therefore the source of truth only for:

- route information hierarchy and structural region order;
- required controls and actions already authorized by the specification;
- required loading, empty, error, offline, stale, conflict, and success states;
- destructive confirmations and persistent result regions;
- keyboard, focus, accessibility, RTL/LTR, and responsive structure;
- stable test/evidence identifiers.

It does not add a route, operation, role, state producer, payment flow,
notification promise, data field, or product capability. `cash_on_arrival` is
the only payment presentation. Production SMS remains disabled. Encounters and
their state producers remain Feature 010.

### 1.1 Feature-scoped Design Lead assignment

On 2026-09-10, Yousef Osama, Product Owner, explicitly assigned Yousef Osama as
the Design Lead responsible for reviewing and approving the Feature 009 P0
source-of-truth compositions. This assignment is limited to Feature 009 visual-
baseline governance. It does not establish a permanent project-wide Design
Lead and may be superseded during the later project-wide Polish / visual-
identity phase.

The assignment is recorded independently from the existing Frontend/UI/A11y/
integration implementation ownership. It creates no implementation authority,
does not grant `PLAN_APPROVED`, and does not change any program-wide role.

Canonical closure evidence is the exact source-of-truth composition set at the
required viewports, accepted by both the Product Owner and Design Lead, with
immutable baseline IDs and each reference identified by source design
node/version plus screenshot SHA-256. The approvers must cite the exact source
version and manifest digest; a general product direction or implementation
assignment is not approval of this visual set.

Figma availability was checked for this work. The connected account exposes a
view-only Starter seat, so it cannot create or edit the required source file.
Because the gate permits a Figma **or source-of-truth** composition set, this
candidate uses the versioned local renderer and immutable manifest below. No
Figma node or approval is fabricated.

## 2. Replaceable visual layer

Feature 009 implementation must reuse the current `packages/design-system`
primitives, semantic states, target sizes, focus treatment, and breakpoints so
that it does not create a second design system. For this test-only baseline,
their visual values are neutral and replaceable. This decision does **not**
approve or freeze a final logo, palette, type family or scale, illustration,
decorative asset, shadow language, or animation style.

Meaning must survive removal of color, iconography, decoration, and motion.
Status is always written in text. Motion is never required to understand or
complete a task, and reduced-motion behavior is functionally equivalent.

## 3. Immutable baseline-ID registry

The following eight route composition IDs are immutable. A material hierarchy,
control, state, focus, or responsive-contract change requires a new numeric
suffix; an existing ID must never be repurposed.

| Baseline ID | App and route | P0 purpose |
|---|---|---|
| `F009-P0-PAT-DISCOVER-001` | Patient `/discover` | Find an eligible doctor and enter doctor detail |
| `F009-P0-PAT-DOCTOR-001` | Patient `/doctors/:id` | Inspect one doctor and select current availability |
| `F009-P0-PAT-BOOK-001` | Patient `/appointments/new` | Review context and create one confirmed appointment |
| `F009-P0-PAT-APPOINTMENT-001` | Patient `/appointments/:id` | Inspect and perform currently permitted appointment actions |
| `F009-P0-CLN-TODAY-001` | Clinic `/today` | Inspect the scoped daily worklist and operational status |
| `F009-P0-CLN-QUEUE-001` | Clinic `/queue` | Operate the scoped current queue |
| `F009-P0-CLN-SCHEDULE-001` | Clinic `/schedule` | Manage one doctor's schedule, exceptions, delay, and absence |
| `F009-P0-CLN-APPOINTMENT-001` | Clinic `/appointments/:id` | Inspect and perform permitted clinic appointment actions |

Every required state is addressed as a state baseline using the immutable form
`<route-baseline-id>--<state-key>`. Locale and viewport are evidence dimensions,
not different compositions. Evidence records must carry the route baseline ID,
state key, `ar-EG` or `en-EG`, viewport, synthetic fixture ID, commit SHA, and
artifact digest. A screenshot is not an approved visual baseline until the
canonical evidence owners accept the exact source and manifest. The approval
in Section 8 supplies that acceptance for this Feature 009 set; `OPEN-UX-002`
still governs later automated visual-diff acceptance.

## 4. Shared P0 composition contract

### 4.1 Landmark and information order

Every route has one deterministic reading and focus order:

1. skip link on web;
2. application header and locale control;
3. current patient context on patient mutations, or facility/role/AAL/
   environment context on clinic routes;
4. one route-level `h1` and concise task/status summary;
5. route filters or selectors;
6. primary content or form;
7. persistent error/conflict/success result region;
8. secondary navigation or safe next steps.

No responsive variant changes semantic order. Visually adjacent items that are
not adjacent in reading/focus order are prohibited.

### 4.2 Common state keys and behavior

Each route implements every applicable state below. Route-specific registries
in Section 5 determine exact applicability.

| State key | Immutable functional behavior |
|---|---|
| `loading` | The main region is named and busy; existing context and heading remain stable; unavailable controls are disabled, not focusable placeholders. |
| `empty` | States what is empty, preserves usable filters/context, and offers only an authorized next action. It never implies unavailable data exists. |
| `error-recoverable` | Persistent named error summary precedes affected content, identifies the failed task without sensitive data, and provides a retry or safe correction path. |
| `error-terminal` | Persistent named error summary explains that the task cannot continue and provides safe navigation; fabricated success and endless retry are prohibited. |
| `offline` | Offline status is persistent. Mutations are disabled and never queued. Cached read data, if shown, is explicitly stale with its last known time. |
| `stale` | Freshness label and last-known time appear before affected actions; mutation requires authoritative reconciliation first. Unknown freshness is not presented as current. |
| `conflict` | A persistent conflict summary receives focus, preserves entered non-secret values, presents current authoritative state, and exposes refresh/reselect rather than client-side overwrite. |
| `submitting` | The single initiating action is disabled against duplicates, progress is announced once, and navigation that would produce an ambiguous retry is guarded. |
| `success` | A persistent result region receives programmatic focus or a polite announcement and includes textual status, safe reference, effective time, and authorized next step. A toast alone is insufficient. |
| `permission-denied` | States that the current context cannot perform the task without revealing protected resource existence or another patient's data. |

### 4.3 Destructive confirmations and result regions

- Cancellation, terminal schedule retirement, and doctor-absence declarations
  use a modal confirmation with a visible title, consequence summary, scoped
  appointment or schedule/doctor/date context, explicit destructive action
  label, and non-destructive return action.
- Queue reorder is not destructive, but its bounded restricted reason and
  target position are reviewed in the same inline action region before submit.
- Initial dialog focus is on the title or non-destructive action. Tab/Shift+Tab
  remain inside the modal. Escape closes when no mutation is submitting. On
  close or completion, focus returns to the invoking control unless the route
  transitions to a result region.
- Result regions persist in the document until dismissed or superseded by a
  later authoritative action. They expose no raw restricted reason, contact
  destination, token, or unrelated patient detail.

### 4.4 Keyboard, focus, and announcements

- All controls are reachable and operable with keyboard alone in logical
  reading order, with visible focus and no keyboard trap.
- Route navigation places focus on the `h1`; filter submission places focus on
  the results heading; validation places focus on the error summary; successful
  mutation places focus on or announces the persistent result region.
- Dynamic queue, delay, availability, and appointment updates use one polite
  live announcement after the visible region updates. Errors preventing an
  action use an assertive announcement once without repetition.
- Lists, tables, fieldsets, radios, dialogs, and buttons use semantic names.
  Icon-only action controls are prohibited for P0 evidence.
- Row actions return focus to the same authoritative item when it remains, or
  to the nearest stable list/queue heading when it is removed.
- Targets are at least 44 by 44 CSS pixels; patient primary actions are at least
  48 pixels. Focus is not obscured by persistent headers or action regions.

### 4.5 Arabic/English and bidirectionality

- `ar-EG` is authored first with root `dir="rtl"`; `en-EG` has complete content
  and functional parity with root `dir="ltr"`.
- Layout uses logical start/end properties. Directional order mirrors where it
  conveys flow, while semantic/DOM order remains task order.
- Phone-like identifiers, appointment references, UTC/RFC 3339 values,
  timezone identifiers, codes, and currency codes are bidi-isolated. Numbers,
  dates, times, and EGP amounts are locale-formatted without changing stored
  meaning.
- Neither locale may truncate state text, hide an action, change a confirmation
  consequence, or fall back to the other locale.

### 4.6 Responsive structure

- `compact` (0–599): one content column; filters/forms stack in reading order;
  the primary action follows its review/context; no horizontal page scrolling.
- `medium` (600–1023): one main reading column or two structural columns only
  where labels and actions remain adjacent to their content. Below 768, tabular
  worklists become labeled stacked records without hiding actions.
- `wide` (1024–1439) and `xwide` (1440+): clinic context and filters may occupy a
  stable leading region while the worklist/detail occupies the main region;
  keyboard/DOM order remains context, filters, content, result.
- At 200% text and applicable 400% web zoom, content reflows without loss,
  overlap, clipped state text, or page-level horizontal scrolling. Orientation
  changes preserve task state and entered non-secret values.

Required evidence viewports remain patient 360×800 and 412×915, medium
768×1024, and wide staff 1440×900. These dimensions are test obligations, not a
choice of final visual styling.

## 5. Route baselines

### 5.1 `F009-P0-PAT-DISCOVER-001` — Patient `/discover`

**Hierarchy:** patient/application context → heading and freshness → search and
filters → active-filter summary → doctor result count → doctor results → result
status/next action.

**Controls:** specialty, facility, availability/date, and permitted distance/
location filters; submit/apply; clear filters; retry; named “view doctor” action
per result. Location denial always preserves manual search.

**Result content:** verified facility identity, current professional-licence
status representation, specialty, facility-defined fee, next available slot or
explicit unknown/unavailable status, and freshness. No review/stock projection.

**State keys:** `loading`, `empty`, `location-denied`, `results`, `stale`,
`error-recoverable`, `error-terminal`, `offline`.

**Focus/result rule:** applying filters focuses the result heading; empty/error
does not discard filters. Offline/stale results cannot claim current
availability and doctor detail remains a read-only path.

### 5.2 `F009-P0-PAT-DOCTOR-001` — Patient `/doctors/:id`

**Hierarchy:** back/navigation context → doctor and verified facility identity →
fee and `cash_on_arrival` instruction → freshness → civil-date selector → slot
group → selection summary → booking continuation/result.

**Controls:** date selection; one slot selection; retry/refresh; continue to
`/appointments/new`. No payment control exists.

**State keys:** `loading`, `available`, `no-slots`, `stale`, `offline`,
`error-recoverable`, `error-terminal`, `permission-denied`.

**Focus/result rule:** a date change focuses the availability heading after the
update; the selected slot is announced. Continue is disabled offline or when
freshness is unknown/stale and revalidation has not succeeded.

### 5.3 `F009-P0-PAT-BOOK-001` — Patient `/appointments/new`

**Hierarchy:** patient context → heading → doctor/facility/date/slot review → fee
and `cash_on_arrival` instruction → confirmation statement → primary create
action → persistent result region.

**Controls:** return to current slots; confirm patient context; create
appointment. One visible primary submit exists.

**State keys:** `loading`, `ready`, `submitting`, `conflict`, `offline`,
`error-recoverable`, `error-terminal`, `permission-denied`, `success`.

**Focus/result rule:** conflict focuses its summary, preserves patient context,
and leads to current slots. An uncertain retry reuses the same idempotency key.
Success names `confirmed`, safe appointment reference, time, and appointment
detail next step.

### 5.4 `F009-P0-PAT-APPOINTMENT-001` — Patient `/appointments/:id`

**Hierarchy:** patient context → heading/reference → textual appointment state →
doctor/facility/time/fee/cash details → delay and queue projection → permitted
actions → replacement suggestions when required → persistent result region.

**Controls:** refresh; check in, cancel, or reschedule only when the clarified
state/time/authority contract permits; choose a future same-facility,
same-doctor replacement suggestion; confirm cancellation. Suggestions state
that no slot is held. There is no producer control for `requested`, `in_queue`,
`in_consultation`, `completed`, or `no_show`.

**State keys:** `loading`, `confirmed`, `checked-in`, `cancelled`,
`reschedule-required`, `requested-readonly`, `in-queue-readonly`,
`in-consultation-readonly`, `completed-readonly`, `no-show-readonly`,
`queue-waiting`, `queue-called`, `queue-in-service-readonly`,
`queue-completed`, `queue-removed`, `delay-active`, `stale`, `offline`,
`conflict`, `error-recoverable`, `error-terminal`, `permission-denied`,
`submitting`, `success`, `cancel-confirmation`.

**Focus/result rule:** queue position/estimate and current delay are one polite
status region. After `checked_in`, ordinary cancel/reschedule is absent or
disabled with a textual reason. Cancellation success and reschedule success each
show status/reference/effective time/next step.

### 5.5 `F009-P0-CLN-TODAY-001` — Clinic `/today`

**Hierarchy:** facility/role/AAL/environment context → heading and freshness →
doctor and civil-date filters → delay/absence operational summary → worklist
count and rows → persistent result region.

**Controls:** doctor/date filters; refresh; named appointment-detail action;
only authorized schedule/delay/absence navigation or actions already backed by
the exact Feature 009 operations.

**State keys:** `loading`, `empty`, `worklist`, `delay-active`,
`absence-active`, `stale`, `offline`, `conflict`, `error-recoverable`,
`error-terminal`, `permission-denied`, `success`.

**Focus/result rule:** filter changes focus the worklist heading. The route does
not infer or create appointment/queue transitions locally. Compact rows retain
patient minimum projection, state, time, and all permitted actions.

### 5.6 `F009-P0-CLN-QUEUE-001` — Clinic `/queue`

**Hierarchy:** facility/role/AAL/environment context → heading, doctor and civil
date, freshness → current delay → queue status/count → ordered entries → action
region → persistent result region.

**Controls:** refresh; call only `waiting`; reorder only `waiting` with current
version, target position, and bounded non-empty restricted reason; complete only
`called`. No control produces queue `in_service`. Removed entries remain a
textual absence side-effect projection, not an operator removal action.

**State keys:** `loading`, `empty`, `waiting`, `called`,
`in-service-readonly`, `completed`, `removed`, `delay-active`, `stale`,
`offline`, `conflict`, `error-recoverable`, `error-terminal`,
`permission-denied`, `submitting`, `success`, `reorder-review`.

**Focus/result rule:** queue updates announce once after authoritative refresh.
Reorder conflict focuses the summary and refreshes the whole scoped queue; it
never applies a local optimistic order as authority. Successful row action
focuses the updated row or queue heading if the row leaves the active list.

### 5.7 `F009-P0-CLN-SCHEDULE-001` — Clinic `/schedule`

**Hierarchy:** facility/role/AAL/environment context → heading → doctor and
timezone/civil-date scope → schedule status/validity → weekly windows →
exceptions → delay/absence actions and affected-count review → persistent
result region.

**Controls:** create/update schedule; status selection limited to `active`,
`paused`, `retired`; weekly local-time window controls; create ordinary
`blocked`, `added`, `delay`, or `absence` exception under the canonical
operation; dedicated send-delay and declare-absence actions; restricted reason;
explicit confirmation for absence and terminal retirement. No draft status, RFC 5545 editor,
auto-coalescing, or UTC-recurring-hours control exists.

**State keys:** `loading`, `empty`, `active`, `paused`, `retired-readonly`,
`exception-list`, `delay-active`, `absence-review`, `overlap-conflict`,
`stale`, `offline`, `conflict`, `error-recoverable`, `error-terminal`,
`permission-denied`, `submitting`, `success`, `absence-confirmation`,
`retire-confirmation`.

**Focus/result rule:** labels expose IANA timezone, inclusive validity dates,
and half-open window semantics in accessible help. Validation/overlap errors
focus the summary and associate each message with its field. Delay makes clear
that the latest valid distinct declaration supersedes the prior overlay without
moving appointments, changing availability, or accumulating minutes.

### 5.8 `F009-P0-CLN-APPOINTMENT-001` — Clinic `/appointments/:id`

**Hierarchy:** facility/role/AAL/environment context → patient minimum/context →
heading/reference and textual appointment state → doctor/facility/time/fee/cash
details → queue/delay/reschedule projection → permitted actions → persistent
result region.

**Controls:** refresh; only currently authorized catalog-backed check-in,
cancel, or reschedule actions; appointment/queue navigation where authorized;
confirmation for cancellation. No encounter, prescription, general-chat,
no-show, or hidden state-producer control exists.

**State keys:** `loading`, `confirmed`, `checked-in`, `cancelled`,
`reschedule-required`, `requested-readonly`, `in-queue-readonly`,
`in-consultation-readonly`, `completed-readonly`, `no-show-readonly`,
`queue-waiting`, `queue-called`, `queue-in-service-readonly`,
`queue-completed`, `queue-removed`, `delay-active`, `stale`, `offline`,
`conflict`, `error-recoverable`, `error-terminal`, `permission-denied`,
`submitting`, `success`, `cancel-confirmation`.

**Focus/result rule:** permission and patient context are revalidated before
each action. A conflict focuses the summary and exposes the current server
state; it never overwrites or fabricates a transition.

## 6. P0 evidence acceptance checklist

For each applicable `<route-baseline-id>--<state-key>`, planning/tasks must
require evidence that:

- the correct route, state, synthetic fixture, locale, viewport, and commit are
  recorded;
- hierarchy, controls, state copy, confirmations, result region, and focus
  behavior match this document;
- `ar-EG` RTL and `en-EG` LTR have content/action parity;
- keyboard-only use, semantic names, live-region behavior, 200% text, 400%
  applicable web reflow, forced colors/high contrast, and reduced motion pass;
- compact/medium/wide structure follows Section 4.6 without hidden actions or
  horizontal page scrolling;
- no offline mutation, false freshness, false notification delivery, digital
  payment, out-of-scope route, or hidden state producer appears;
- captured artifacts contain only approved seeded-synthetic data.

These checks are functional engineering evidence. They do not by themselves
establish reference-device certification, UAT, automated pixel-identity, or
final project-wide visual-identity approval.

## 7. `OPEN-UX-001` closure assessment

The approved versioned baseline completes the Feature 009 information architecture, P0 route and
state composition inventory, stable test IDs, interaction/focus rules, and
responsive/RTL/LTR contract requested by the Product Owner. The Feature 009
Design Lead review and exact-set acceptance are recorded in Section 8, making
this sufficient visual-governance input for Feature 009 planning.

Candidate source and export evidence now exists:

- source: `visual-baselines/source/composition.html` at
  `SHIFAA-F009-P0-SOURCE@1.0.0-candidate`;
- source nodes: `<source-version>#<baseline-id>--<state-key>`;
- inventory: eight immutable baseline IDs, two locales, and two canonical
  viewports per route;
- references: 492 immutable PNG candidates, each mapped by route, locale,
  viewport, state, synthetic fixture, source node/version, and SHA-256 in
  `visual-baselines/reference-manifest.json`;
- manifest SHA-256:
  `3ac755cc03c263826d1a07d53e08716e8390857249dbda1eb936833265ac0a4c`;
- reproducibility: Edge `151.0.4129.93`, CDP device-metric viewport emulation,
  stabilized light/reduced-motion media, repository-pinned fonts, and a
  passing `validate-reference-baselines.ps1` result; two consecutive complete
  exports produced the same manifest digest.

Before recording approval, the manifest SHA-256 was recomputed and matched
`3ac755cc03c263826d1a07d53e08716e8390857249dbda1eb936833265ac0a4c`
exactly. The validator also confirmed all 492 referenced PNG hashes,
dimensions, mappings, eight baseline families, exact 18-operation boundary,
and canonical state taxonomy. The reference PNG set totals 29,237,789 bytes
(27.883 MiB; 29.238 MB).

Yousef Osama then separately approved the exact source version and manifest in
the Product Owner and Feature 009 Design Lead capacities. The canonical
Product Owner + Design Lead ownership and immutable-ID evidence requirement is
therefore **SATISFIED FOR FEATURE 009 AFFECTED UI**. `OPEN-UX-001` no longer
blocks Feature 009 planning.

This is a feature-scoped satisfaction record, not a global closure of
program-wide `OPEN-UX-001` for future UI features. `OPEN-UX-002` remains open
and separately governs the renderer/font matrix, numeric tolerance, masks, and
diff-review rule for later formal automated visual acceptance. The approved
Feature 009 baseline is versioned rather than permanent; a later approved
Polish phase may supersede its logo, branding, colors, typography, motion, and
compositions through normal versioned governance.

## 8. Approval record

| Signer | Role | Decision | Scope | Recorded at | Evidence |
|---|---|---|---|---|---|
| Yousef Osama | Product Owner | `APPROVED DIRECTION` | Feature 009 test-only functional P0 compositions; final visual identity deferred | 2026-09-10 | Direct instruction in the current Codex task |
| Yousef Osama | Product Owner | `APPROVED` | `SHIFAA-F009-P0-SOURCE@1.0.0-candidate`; manifest SHA-256 `3ac755cc03c263826d1a07d53e08716e8390857249dbda1eb936833265ac0a4c`; all eight `F009-P0-*` families | 2026-09-10 | Explicit Product Owner approval in the current Codex task after exact digest revalidation |
| Yousef Osama | Feature 009 Design Lead | `ROLE ASSIGNED — FEATURE 009 ONLY` | Review and approval of Feature 009 P0 source-of-truth compositions; no permanent project-wide assignment | 2026-09-10 | Explicit Product Owner governance assignment in the current Codex task |
| Yousef Osama | Feature 009 Design Lead | `APPROVED` | Same exact source version, manifest digest, compositions, responsive structure, Arabic/English parity, P0 states, and immutable references | 2026-09-10 | Separately recorded Design Lead approval in the current Codex task after exact digest revalidation |

This visual-baseline decision did not itself grant `PLAN_APPROVED`. A separate
Product Owner decision on 2026-09-10 subsequently granted `PLAN_APPROVED` for
planning only; implementation, task or Issue publication, commit, and push
remain unauthorized.
