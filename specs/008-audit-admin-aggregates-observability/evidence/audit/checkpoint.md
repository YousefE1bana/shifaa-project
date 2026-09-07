# Feature 008 audit investigation and export checkpoint

Status: PASS for the synthetic graduation-engineering checkpoint. This is independently repeatable engineering evidence only; it does not claim production authorization, production retention, formal device certification, or human accessibility approval.

## Executed evidence

- `corepack pnpm --filter @shifaa/admin test -- audit-workspace audit-export`: passed 5/5 focused component and projection checks.
- `corepack pnpm test:audit-admin:e2e -- audit export`: passed 6/6 deterministic audit/export scenarios covering AC-03 through AC-08.
- Authorization matrix: 18/18 unique fixtures exercised. Only the current `super_admin` with AAL2 age at most 300 seconds and purpose `security.audit.review` may read redacted audit evidence or request an export. DPO-only and all other roles remain denied.

## Audit investigation checkpoint

- AC-03: denied actors receive no row or export effect; the sole authorized fixture receives the fixed projection.
- AC-04: list filters are server-bound, pages are limited to 100 entries, continuation uses an opaque cursor, detail uses immutable chain evidence, and unexpected/raw fields fail closed.
- The allowlist excludes raw metadata, subject identifiers, clinical payloads, tokens, signed URLs, object credentials, and free text.
- Arabic `ar-EG`/RTL and English `en-EG`/LTR use identical actions and states. Keyboard order, focus entry/return, screen reader live regions, non-color integrity text, 44x44 targets, reflow at 200% text/400% zoom, forced colors, and reduced motion metadata are asserted for `768x1024` and `1440x900`.

## Export checkpoint

- AC-05: concurrent identical requests collapse to one stored effect; changed-body reuse returns `409 idempotency-key-reused`.
- AC-06: queued/proven presentation is accepted only from verified canonical chain evidence; failed integrity is rendered as failure.
- AC-07: retrying, failed, dead-letter, and proven states are mapped only from catalogued audit action codes. The client has no polling operation.
- Offline range submission is rejected before any call, proving zero offline export effects. The UI neither invents a status endpoint nor treats a toast as durable success.

## SHA-256 bindings

- `apps/admin/src/app/AdminAuditSession.tsx`: `1cd28d0c5eb06bd49921e52c3c94cd8ea123741a271eec499990101abdffc294`
- `apps/admin/src/app/audit/AuditWorkspace.tsx`: `73899d9459292912440faadfcb0acc843e06328d68e1e04e5b017ecda8d4838a`
- `apps/admin/test/audit-workspace.test.ts`: `25d56e02e13856d9dcadf9701286991b708a56b6e061548e9704b23fc1d0f941`
- `apps/admin/test/audit-export.test.ts`: `f1ab230c4f2137448200cb7ace3a752c8ba016209da2a2eed7a53e0f0676a131`
- `tests/e2e/audit-admin-events.spec.ts`: `c79dfadc7339e883bd87cc72e967791b264e910cb23f7b883fe7e130dc564cef`
- `tests/e2e/audit-export.spec.ts`: `222dbf386786d258fbca15cdc9051356c617a0372f58800c7c638c019dc8b544`
- `packages/test-kit/src/audit-admin-fixtures.ts`: `89a7aaa6c9a00dc355c57f018311fb23500bcb24b35816e2eaf8544adbcb2828`
