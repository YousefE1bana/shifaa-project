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

- `apps/admin/src/app/dashboard/AdminDashboard.tsx`: `72dac95edea359ba558947dae786bc64129c418798976152b60d0778c93e8216`
- `apps/admin/test/audit-admin-dashboard.test.ts`: `22f16d776adc5da37027842628ef579d0e8ca248ae2e70401508d7fa237c6d26`
- `tests/e2e/audit-admin-summary.spec.ts`: `75524b85fcc8d966f6493b959438c8b0a7532c6bc5b16ebabb791f72a59c876e`
- `packages/test-kit/src/audit-admin-privacy-fixtures.ts`: `69b215ad881b1be2a666bcc7dc8327cdcbdc08d85a1c98ffcdb60644f1f3b88d`
