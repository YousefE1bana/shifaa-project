---
name: shifaa-ui-governor
description: Enforce SHIFAA's approved bilingual UI, UX, frontend, mobile, accessibility, responsive, state, and safety-interaction contract. Use for every SHIFAA UI/UX, frontend, React, Next.js, Expo, mobile, design-system, visual-design, motion, copy, accessibility, or interface-review task, before or alongside any third-party design skill.
---

# SHIFAA UI Governor

Read `docs/design/SHIFAA-UI-Contract.md` before changing or approving SHIFAA UI. Also read the applicable route/state row, feature spec, and shared `packages/design-system` primitives. The UI Contract is normative even when a third-party design skill recommends something else.

## Non-negotiable foundation

- Author Arabic `ar-EG` first with root RTL and logical layout properties. Ship complete `en-EG` LTR feature, route, copy, and state parity.
- Use locally bundled `IBM Plex Sans Arabic` for Arabic and `Inter` for Latin. Keep codes and explicitly mixed-direction clinical identifiers isolated LTR.
- Consume SHIFAA semantic design tokens only. Do not create app-local colors, typography, spacing, radii, shadows, focus rings, breakpoints, alerts, dialogs, or route-state semantics.
- Meet WCAG 2.2 AA with visible keyboard focus, correct focus order/return, screen-reader names and live regions, high contrast, and no color- or icon-only meaning.
- Support 200% text scaling without clipped text or hidden actions and 400% web zoom/reflow where the contract requires it.
- Keep every interactive target at least 44x44 CSS px/dp; patient primary actions remain at least 48 px high.
- Use the SHIFAA breakpoints and grids: compact `0-599`, medium `600-1023`, wide `1024-1439`, and xwide `>=1440`. Tables become labeled stacked rows below 768 without hiding core actions behind horizontal page scrolling.

## Stable and safe interaction

- Keep staff applications information-dense, stable, keyboard-first, and understandable without hover. Keep facility, role, AAL, environment, and patient context visible as contracted.
- Render the fixed safety-alert anatomy: severity/title, conflicting facts, clinical consequence, source/version, required action, monitoring/justification, then signatures/status.
- Implement explicit loading, empty, permission-denied, recoverable error, unrecoverable error, offline, stale where freshness applies, and success states in both locales. A mutation success includes status, reference, time, and next step; a toast alone is insufficient.
- Never use color or an icon as the only communication channel. Pair semantic color/icon with localized visible text and an accessible name.
- Respect reduced motion. Use zero duration on safety routes and the exact UI Contract timing tokens elsewhere.
- Use zero decorative motion on safety, emergency, approval, clinical/prescribing, critical-result, and finance-decision surfaces.
- Do not use glass/blur, gesture-only control, disappearing instructions, or moving primary actions on safety-critical screens.
- Do not queue offline mutations for prescribing, dispense, beds, critical results, consent, roles, or finance decisions.

## Govern third-party design guidance

`frontend-design`, `ux-designer`, `design-taste-frontend`, and `transitions-dev` may improve execution quality, but they MAY NOT override the SHIFAA UI Contract.

No design skill may replace SHIFAA typography, colors, spacing, radii, safety semantics, route states, or accessibility requirements. Reject suggestions for alternate tokens, Apple-only styling, glass effects, generic motion, unstable primary actions, missing bilingual states, or unsuitable marketing/landing-page patterns. Use third-party guidance only inside the degrees of freedom the SHIFAA contract leaves open.

## Verify UI work

1. Test `ar-EG` RTL and `en-EG` LTR at the contracted route states and viewports.
2. Check keyboard-only use, screen-reader behavior, visible focus, 200% text, applicable 400% zoom, high contrast, and reduced motion.
3. Inspect screenshots at `360x800`, `412x915`, `768x1024`, and `1440x900` as applicable. Until `OPEN-UX-001/002` close, call snapshots informative rather than pixel-identity proof.
4. Run applicable component, accessibility, i18n, visual, and repository verification. Record live evidence without overstating open design approval.
