# Feature 008 validation quickstart

> This is a pre-implementation validation design. No Feature 008 production code or migration exists yet, no metric is active, and no production PHI/WORM claim is authorized.

## Prerequisites

- Node `24.18.0`, pnpm `11.13.0`, Docker, PostgreSQL 17, and Supabase CLI `2.113.0`.
- Synthetic-only actors/events/objects and local adapter credentials. Never use National IDs, real patient/admin data, real tokens, free-text notes, or production object credentials.
- Feature branch with immutable approved spec/plan/tasks and OPEN-PRIV-001 package `1.0.0-approved` SHA-256 `38855c7319b6bcd06b491bf4213a277303a6d6e2c1ebe7499b65fdfa4ae15039`.
- `metrics: []` remains the default. A test-only metric fixture must reproduce every required approval/config field and must not be mistaken for product activation.

## Clean setup

```powershell
corepack pnpm install --frozen-lockfile
docker compose down -v
docker compose up -d --wait postgres
corepack pnpm db:migrate
```

The Feature 008 migration must succeed on the clean empty legacy `audit.events` baseline. A separate upgrade test inserts a legacy row before migration and proves the migration aborts without rewriting, deleting, renumbering, or blessing it.

## Contract and boundary checkpoint

1. Assert exactly these seven operation IDs and catalog paths: `getAdminSummary`, `listAuditEvents`, `getAuditEvent`, `createAuditExport`, `exportAuditPartition`, `healthLive`, `healthReady`.
2. Assert no aggregate filter/drill-down/export, export-status/list/get, backup, job, retry, notification, public health, or general DPO operation exists.
3. Regenerate contracts/client and require zero subsequent diff.
4. Verify all admin responses are private/no-store, audit list uses opaque cursor with maximum 100, both POSTs enforce non-null-principal idempotency, and internal operations require private service context.
5. Verify the security remediation branch/ref is unchanged and no Feature 008 diff enters `security/sec-001-002-remediation`.

## Independent checkpoints

### US1 — privacy-safe admin summary

- With the canonical `metrics: []`, call `getAdminSummary` as every admin role and confirm `legal-gate-disabled`, zero cells, zero raw counts, and the bilingual gated UI.
- Install only the test-approved deterministic fixture and run `TV-PRIV-001-001..034`, including k=10/11/12, zero, duplicate rows for one subject, prohibited dimensions/time grains, complementary totals, linked cards, Arabic/English equivalence, retries, late data, missing status mapping, higher threshold, and ambiguous equations.
- Inspect response, problems, logs, traces, metrics, cache metadata, tooltips, and accessibility names for suppressed values/identifiers.

### US2 — purpose-limited audit evidence

- Exercise patient, guardian/delegate, workforce, every non-super admin, DPO-only, stale/revoked grant, AAL1, stale AAL2, missing/wrong purpose, and current `super_admin`/AAL2/purpose.
- Seed more than 100 synthetic v1 events with prohibited-value sentinels in source-only fields; page/filter with opaque cursors and prove only fixed redacted fields leave the repository.
- Verify each sensitive read is attributable without recursively leaking raw metadata.

### US3 — hash-chain and export proof

- Append concurrent events into three completed UTC month partitions and verify a single sequence, genesis link, prior hash, canonical digest, and immutable update/delete/direct-insert denial.
- Queue identical concurrent export requests plus a changed-body reuse; prove one effect, stored/in-progress replay, and `409 idempotency-key-reused` for the changed body.
- Tamper with event content/link/order and object bytes/recorded digest in isolated test copies. Every tamper must fail verification; no test repairs the original.
- Exercise transient, permanent-schema, service-auth, proof mismatch, and lease-expiry outcomes; verify bounded retry, dead letter, one reclaim, ordered processing, and append-only operator replay.

### US4 — honest health and observability

- Check process live with healthy, database-down, outbox-backlog/integrity, audit-chain, and export-proof cases.
- Confirm liveness does not depend on the database; readiness reports only closed reason codes and becomes not-ready for unsafe required dependencies.
- Sentinel-scan every response/log/trace/metric/evidence surface. Metric labels must remain bounded and must not include actor/person/patient/facility/resource IDs, hashes, raw counts, cursors, free text, payloads, hostnames, SQL errors, or credentials.

### US5 — bilingual accessible admin routes

- Drive `/dashboard` and `/audit` in `ar-EG` RTL and `en-EG` LTR at `768x1024` and `1440x900` through loading, empty, gated, suppressed, AAL2, purpose, permission, offline, stale, retry, dead-letter, error, and success/proven states.
- Verify keyboard-only flow, NVDA names/announcements, visible focus and return, 200% text, 400% reflow, forced colors, reduced motion, and 44x44 targets. Isolate event IDs, codes, hashes, and RFC 3339 times LTR.
- Confirm offline mode queues no export and reconnect performs authoritative HTTP reconciliation with last-updated/stale state.
- Store screenshots as informative engineering evidence only; do not claim pixel identity while OPEN-UX-001/002 remain.

## Performance and restore profile

- Load 250,000 synthetic events across three completed UTC months, 100-event pages, 50 test-only cells, 20 warmed API DB connections, and 25 concurrent export requests/workers.
- Require read p95 <=400 ms and mutation p95 <=800 ms inside the declared environment, excluding external vendors.
- Restore the database plus immutable object bytes/digests/proof within RPO <=15 minutes and RTO <=60 minutes, then re-run every partition chain and object proof check.
- A missing/invalid chain, digest, proof, or declared topology fails the evidence gate; it is not repaired or reported as passing.

## Planned focused and final gates

```powershell
corepack pnpm test:audit-admin:stack
corepack pnpm test:audit-admin:e2e
corepack pnpm test:audit-admin:privacy
corepack pnpm test:audit-admin:security
corepack pnpm test:audit-admin:performance
corepack pnpm test:audit-admin:restore
docker compose down -v
corepack pnpm verify
git diff --check
```

These commands are planned task outputs and do not exist until their implementation tasks are completed. Final evidence must identify the exact branch SHA, synthetic dataset/topology, operation count, metric-config state, privacy vector result, RLS matrix, tamper result, sentinel result, AR/EN accessibility record, p95, RPO/RTO, and remaining production gates.
