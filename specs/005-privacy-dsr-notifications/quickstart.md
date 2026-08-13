# Quickstart: Privacy DSR and Notifications

This runbook exercises only seeded-synthetic 005 behavior. It does not contact a real provider, delete/pseudonymize production data, or claim legal/DPO/regulator/vendor approval.

## 1. Preconditions

```powershell
git status --short --branch
pnpm install --frozen-lockfile
docker compose down -v
pnpm verify
```

Do not run `pnpm db:reset` immediately before `pnpm verify`; both migrate. Restore the known pnpm audit normalization side effect in `pnpm-workspace.yaml` before evaluating feature diffs.

Expected: branch `codex/005-privacy-dsr-notifications`, only deliberate 005 changes, and verification exit 0.

## 2. Start local services

```powershell
pnpm supabase:start
pnpm dev:supabase:api
pnpm dev:patient:web
pnpm dev:admin:web
```

Use deterministic synthetic accounts/IDs from `packages/test-kit`. Confirm production messaging and erasure automation are disabled in startup output.

## 3. Automated feature gates

The `test:privacy:*` scripts below are planned 005 commands and are registered by T031. Before that task is implemented, use the baseline `pnpm verify` gate instead of treating these names as already available.

```powershell
pnpm test:privacy:stack
pnpm test:privacy:e2e
pnpm test:privacy:security
pnpm test:privacy:performance
pnpm contracts:check
pnpm architecture:check
pnpm secrets:check
pnpm dependencies:check
```

Expected: DSR state/idempotency, forced RLS, private Storage, template governance, worker retry/DLQ/dedup, signed callback, redaction, and performance suites pass.

## 4. Patient live acceptance

At `/privacy`, `/privacy/consents`, and `/privacy/requests` in Arabic RTL then English LTR:

1. Submit each supported request type and inspect status, history, submitted time, and labeled due date.
2. Exercise identity-verification-required and prove review/decision remains blocked.
3. Exercise loading, empty, permission, offline, stale/conflict, failure, and success states.
4. Complete an approved synthetic access/export request, issue the bounded download capability, inspect `Cache-Control: private, no-store`, consume it once, then prove replay/expiry/foreign access denial.
5. Prove valid guardian `consent.manage`; deny delegate, inactive guardian, unrelated patient, and facility staff.
6. Confirm erasure copy does not promise deletion and the unapproved automation path remains blocked.

## 5. Admin/DPO live acceptance

At `/privacy-requests`:

1. Prove missing designation, assignment, AAL2, and purpose independently deny the worklist/action.
2. Prove the assigned DPO projection excludes identity/contact/export/message bodies and gains no general admin/audit route.
3. Approve, partially approve, refuse, and fulfil synthetic requests with required reasons/evidence/current versions.
4. Trigger a stale version and invalid transition; confirm no partial write.

At `/notification-templates`:

1. Create a paired Arabic/English draft with exact recipient and field schemas.
2. Reject missing locale, prohibited field, placeholder mismatch, and changed digest.
3. Reject creator self-publication; publish with a different AAL2 support actor.

## 6. Worker/provider acceptance

Use the deterministic fixture controls to prove:

- success and one visible delivery;
- transient retries at 1m, 5m, 30m, 2h, 12h plus bounded deterministic jitter;
- permanent/exhausted dead letter;
- aggregate ordering gap postponement;
- receipt and delivery replay deduplication;
- valid signed callback once and bad signature/stale timestamp/nonce replay rejection;
- authorized dead-letter replay appends a new attempt and preserves the original event.

Inspect outbox/provider/log snapshots for prohibited sentinel fields.

## 7. Accessibility and visual evidence

Test compact `360×800` and `412×915`, tablet `768`, and desktop `1440×900` as applicable:

- Arabic RTL and English LTR;
- keyboard-only, visible focus, programmatic labels/errors/status announcements;
- 200% text and 400% web reflow without two-axis scrolling;
- high contrast and reduced motion;
- loading, empty, permission, offline, stale/conflict, export ready/expired, failure, and success.

Save and visually inspect screenshots under `specs/005-privacy-dsr-notifications/evidence/live/`. Record commit, seed digest, locale, viewport, state, keyboard/a11y outcome, and screenshot path in `evidence/live-qa.md`.

## 8. Final gate

```powershell
docker compose down -v
pnpm verify
git diff --check
git status --short
```

Then run final SpecKit analysis/convergence and quality guards, update evidence/tasks only from fresh results, push only the feature branch, open a ready PR, and wait for all six required checks. Stop for Yousef Osama to squash-merge.
