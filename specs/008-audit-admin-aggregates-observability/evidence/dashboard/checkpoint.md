# Feature 008 dashboard checkpoint

Status: PASS for the synthetic graduation-engineering checkpoint. This is engineering evidence only; it does not claim pixel identity, formal UX approval, production data approval, or device certification.

## Executed evidence

- `corepack pnpm --filter @shifaa/admin test -- dashboard`: passed 3/3 component and policy-projection checks.
- `corepack pnpm --filter @shifaa/admin test -- audit-admin-dashboard`: passed 3/3 Arabic/English and accessibility checks.
- `corepack pnpm test:audit-admin:e2e -- summary`: passed 3/3 deterministic summary scenarios.
- Privacy decision vectors: 34/34 unique approved vectors retained, including inactive configuration, threshold, complementary-suppression, linked-release, locale, authorization, retry, snapshot, and side-channel classes.

## Independently demonstrable states

The `/dashboard` projection covers loading, empty, gated, suppressed, stale, offline, permission, recoverable error, and safe success. `metrics: []` produces the gated state with no cell. Suppressed cells contain no count, count range, cache validator, selector, or drill-down. Reconnect reloads from the server; offline state creates zero mutation effects.

## Bilingual and accessibility metadata

- Locales: `ar-EG` root RTL and `en-EG` root LTR with content/state parity.
- Evidence viewports: `768x1024` and `1440x900`; the responsive grid also stacks below 768 CSS px.
- Input: keyboard order and visible focus; controls are at least 44x44 CSS px.
- Semantics: named regions, visible non-color status text, polite screen reader announcement, and an assertive offline/stale warning.
- Reflow: 200% text and 400% zoom are supported by logical properties, wrapping, and a no-horizontal-page-scroll grid.
- System preferences: forced colors preserve the shared focus treatment and reduced motion has no decorative transition to suppress.

## SHA-256 bindings

- `apps/admin/src/app/dashboard/AdminDashboard.tsx`: `6cf91bad322fdc8cb825424c4694ca2f413714058f4c5f3a249752661fea066b`
- `apps/admin/test/audit-admin-dashboard.test.ts`: `1de679ff68f600d9a550d18ab6621c0e6e4cb9a99e7497abcabbf2c0ba761238`
- `tests/e2e/audit-admin-summary.spec.ts`: `75524b85fcc8d966f6493b959438c8b0a7532c6bc5b16ebabb791f72a59c876e`
- `packages/test-kit/src/audit-admin-privacy-fixtures.ts`: `69b215ad881b1be2a666bcc7dc8327cdcbdc08d85a1c98ffcdb60644f1f3b88d`
