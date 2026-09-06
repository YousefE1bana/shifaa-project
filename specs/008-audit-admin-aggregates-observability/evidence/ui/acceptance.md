# Feature 008 live UI and accessibility acceptance

Status: PASS for the supported synthetic graduation data only. Screenshots are informative rather than pixel-identical references; they do not authorize a production rollout or claim visual identity across browser engines.

## Runtime and scope

- Date: 2026-09-06 (Africa/Cairo).
- Runtime: the repository admin Next.js application on `127.0.0.1:3108`, exercised through Playwright CLI with synthetic route responses for the already approved Feature 008 operations.
- The local evidence switch is restricted to non-production builds and supplies only a synthetic UI session posture. Server-side role, AAL2, purpose, RLS, export, and integrity controls remain authoritative and were not bypassed.
- Evidence covered the dashboard and audit workspace in Arabic `ar-EG` RTL and English `en-EG` LTR at 768x1024 and 1440x900.

## Live state and privacy matrix

- Dashboard: gated, empty, suppressed, stale/offline, and error states were exercised. Suppressed and gated cells displayed no exact count, derived range, raw identifier, or drill-down affordance.
- Audit: purpose-required, success/list, redacted detail, export accepted, empty, stale/offline, error, and permission-denied states were exercised. Permission denial made zero audit API requests.
- Export acceptance exposed only the queued reference and explicitly directed the user to redacted audit evidence. No polling link, status endpoint, signed URL, object key, digest, or raw export metadata was added.
- A stale audit result remained visibly marked stale, retained only the already redacted event, and disabled export submission.
- Expected synthetic 500/503 responses produced browser network-error console entries. There were no JavaScript exceptions in successful states; the permission-denied state had zero console errors or warnings.

## Accessibility and interaction evidence

- Live keyboard traversal reached the 44px locale control, and Enter changed Arabic RTL to English LTR. All visible buttons in the audited desktop state met the 44px minimum target height.
- Opening an audit row moved focus to the rendered detail region (`tabindex=-1`); closing the detail restored focus to the invoking row.
- Browser accessibility snapshots exposed one page heading, named regions, labeled filters, list/listitem semantics, status and alert announcements, disabled control states, and the redacted detail heading in both directions.
- The semantic accessibility-tree pass is the recorded NVDA-targeted evidence. No audible NVDA session was available in this environment, so no claim about spoken phrasing or speech timing is made.
- At 640 CSS pixels (the 1280px layout's 200% text/reflow equivalent) and 320 CSS pixels (its 400% zoom/reflow equivalent), the English LTR audit workspace had no document-level horizontal overflow.
- Native forced colors and reduced motion were both active in the English desktop audit pass; content, focusable controls, borders, status text, and hierarchy remained perceivable.

## Captures

- `specs/008-audit-admin-aggregates-observability/evidence/ui/dashboard-ar-rtl-gated-768x1024.png`: `48455b3031d28f1252e44dd54e1fff1125efdecba414d05b6e37faf16c9aaee9`
- `specs/008-audit-admin-aggregates-observability/evidence/ui/dashboard-en-ltr-suppressed-1440x900.png`: `bc37b9567061405ce1adcc5905e8fff9575f1ce641cad71a414b333ca53de482`
- `specs/008-audit-admin-aggregates-observability/evidence/ui/audit-ar-rtl-export-768x1024.png`: `e0d3879eb9ef63804ebd52f95a2683aa5520bcfc2d5e3914c7e00fec616999d8`
- `specs/008-audit-admin-aggregates-observability/evidence/ui/audit-en-ltr-forced-colors-1440x900.png`: `6311255ceadac4fd2c026449d4e6bce537a9d9c0ceceeb8524e2e28e50a10d11`
- `specs/008-audit-admin-aggregates-observability/evidence/ui/audit-en-ltr-400-percent-reflow.png`: `aa1a46369d5391b7edf28caa0103c745b14c874923479538cb84060ee12a1be1`

## Implementation bindings

- `apps/admin/src/app/dashboard/AdminDashboard.tsx`: `6cf91bad322fdc8cb825424c4694ca2f413714058f4c5f3a249752661fea066b`
- `apps/admin/src/app/audit/AuditWorkspace.tsx`: `3f77b8e9d63f3f4c0e2e2928424c5632872fe6fd1d55c60f36b7c9cf34b2d29f`
- `apps/admin/test/audit-workspace.test.ts`: `d460f3013ad8642208adbd1b5b0b300ac05abacb9451b7fa5ac5cc0353eeb747`
- `apps/admin/test/audit-admin-dashboard.test.ts`: `1de679ff68f600d9a550d18ab6621c0e6e4cb9a99e7497abcabbf2c0ba761238`
- `packages/i18n/src/audit-admin.ts`: `cdfbeda92daf25b502c32de8b4a77093f15abdef3e4b542deae2d8aa4ed14a13`
