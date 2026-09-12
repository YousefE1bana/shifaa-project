# Feature 009 Implementation and Evidence Quickstart

> Planning artifact only. Do not execute implementation steps without separate authorization.

## 1. Preconditions

1. Work only in `D:\ECU\Gradution-Project\.worktrees\009-clinic-scheduling-appointments-queue` on `codex/009-clinic-scheduling-appointments-queue`.
2. Confirm `spec.md` remains `SPEC_APPROVED` and planning is approved; confirm separate implementation authorization exists before editing product code.
3. Revalidate the visual manifest SHA-256 is `3ac755cc03c263826d1a07d53e08716e8390857249dbda1eb936833265ac0a4c`, with 492 PNGs and 29,237,789 bytes. Never regenerate it implicitly.
4. Confirm the OpenAPI operation inventory is exactly 18 and the producerless state sets are unchanged.
5. Sync repository-owned skills using the documented repository command if the runtime copy is stale; do not commit machine-local skill roots.

## 2. Planned local stack sequence

1. Install with the repository-pinned pnpm/toolchain.
2. Start the existing Supabase/PostgreSQL local stack and synthetic mail/test adapter only.
3. Apply migrations from a clean database, then from the previous main schema as an upgrade.
4. Keep Feature 009 and production notification flags off while validating schema, RLS, constraints, generated clients, and tests.
5. Seed only deterministic synthetic facilities, licences, schedules, patients, appointments, queue scopes, and template fixtures.

## 3. Planned verification order

1. Static exact-operation and state taxonomy checks.
2. OpenAPI validation and generated-client parity.
3. Clean/upgrade migration and constraint checks.
4. Forced-RLS positive/negative matrices under actual runtime roles.
5. Pure recurrence/DST/availability/state/queue unit and property tests.
6. API idempotency/version/concurrency/audit/outbox integration tests.
7. Patient and clinic component/E2E states in Arabic and English at canonical viewports.
8. Keyboard, screen-reader, reflow, contrast/forced-color, target-size, and reduced-motion evidence.
9. Load, abuse, chaos/outbox, backup/restore, and migration activation evidence.
10. Full `pnpm verify` only after focused suites pass.

## 4. High-risk deterministic races

- two bookings for the same doctor interval;
- two reschedules to the same replacement while preserving both originals except the single winner;
- duplicate and concurrent check-in allocating exactly one queue entry/number;
- two waiting reorders with the same and stale queue versions;
- ordinary same-type exception boundary-touch versus positive overlap;
- same-key and distinct concurrent delay declarations producing one current overlay;
- absence racing check-in/reorder/cancel while preserving one atomic approved outcome;
- worker retry after domain commit producing no duplicate notification.

## 5. Evidence locations

Use the repository's existing evidence-manifest convention beneath the Feature 009 specification directory. Store structured test/command outputs, synthetic fixture identifiers, environment/tool versions, and screenshots without PHI. Map every UI capture to `contracts/ui-baseline-map.md` and the immutable reference manifest. The final storage of the approved 492-PNG set awaits the explicit persistence decision; do not move or rewrite it.

## 6. Stop conditions

Stop and reconcile before continuing if any artifact adds an operation/route/role/state producer; enables a payment other than `cash_on_arrival`; claims production SMS/template publication; changes a baseline byte; weakens forced RLS; introduces Feature 010 behavior; or cannot prove atomicity/default-deny under race.
