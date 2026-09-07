# Audit, admin aggregates, and observability — Feature 008

This runbook covers the seeded-synthetic Feature 008 graduation runtime only. It does not authorize production PHI, processors, legal retention, WORM storage, disaster recovery, DPO approval, rollout, pixel identity, reference devices, or UAT. PostgreSQL is authoritative for audit sequence/state; object bytes are accepted only after digest and retention-proof verification.

The invariant for every procedure is:

> Preserve append-only evidence and fail closed. Never repair, renumber, overwrite, backfill, disclose, or bless an ambiguous audit chain, export object, proof, authorization state, or suppressed aggregate.

## Exact operation and gate inventory

Feature 008 has exactly seven operations:

- `getAdminSummary`
- `listAuditEvents`
- `getAuditEvent`
- `createAuditExport`
- `exportAuditPartition`
- `healthLive`
- `healthReady`

There is no export status/polling, aggregate selector/drill-down/export, backup, job, retry, notification, public-health, DPO, or general-admin audit operation. `admin.aggregates`, `audit.read`, `audit.export`, and `health.exposure` are independent kill switches. All production variants remain disabled. Canonical `metrics: []` means no aggregate cell is active; do not add a metric or status mapping during incident response.

`listAuditEvents`, `getAuditEvent`, and `createAuditExport` require a current `super_admin`, AAL2, and `security.audit.review`. Internal export and health operations require exact service authentication on the private boundary. Do not use `service_role`, table owner, superuser, `BYPASSRLS`, direct table grants, or ad hoc SQL as an online shortcut.

## Clean local verification

Use synthetic data only. The reset command destroys and recreates the repository's local Compose PostgreSQL volume.

```powershell
corepack pnpm db:reset
corepack pnpm db:test
corepack pnpm db:rls-test
corepack pnpm test:audit-admin:stack
corepack pnpm test:audit-admin:e2e
```

The migration must fail closed when legacy `audit.events` is non-empty. Never delete or rewrite legacy audit rows to force migration success. A compatibility failure requires reviewed roll-forward/reconciliation work.

## Readiness and privacy-safe triage

`healthLive` proves only that the process can answer; it must remain independent of database state. `healthReady` may return only the closed readiness state and reason codes: database unavailable, outbox backlog, audit-integrity failure, or export-proof failure. It must not expose dependency names/details, row counts, identifiers, hashes, cursors, object keys, SQL errors, hosts, or credentials.

Start with bounded telemetry labels and a newly assigned incident correlation ID. Permitted labels are the closed operation/outcome/reason/route/method/status/worker-state sets. Never paste actor/person/patient/facility/resource IDs, raw metadata, free text, suppressed/released counts, tokens, signed URLs, hashes, cursors, request bodies, object credentials, or clinical values into logs, traces, metrics, tickets, or evidence.

## Audit-chain failure

1. Disable `audit.read` and `audit.export` for the affected synthetic environment; keep `admin.aggregates` disabled.
2. Preserve the database snapshot, partition boundaries, application revision, request/trace correlation window, and external incident evidence without exporting raw event metadata.
3. Run `corepack pnpm test:audit-admin:db` against an isolated synthetic copy. Verify every event's canonical bytes, sequence, genesis/prior link, and terminal hash.
4. Treat content, order, link, or digest mismatch as a failed chain. Do not update/delete events, resequence rows, substitute a terminal hash, or mark readiness healthy.
5. Restore only through the verified path below or deploy a reviewed forward fix. Re-enable reads before exports only after the entire affected partition verifies.

## Export claim, replay, and proof failure

Workers must claim through the fixed-search-path database function with ordered `FOR UPDATE SKIP LOCKED` semantics. Two workers must never own the same batch. Retries are bounded; permanent schema/auth/integrity failures dead-letter. Operator replay appends a new attempt and never mutates the original request/evidence.

For an object/proof mismatch:

1. Disable `audit.export` and stop new claims without deleting queued/outbox/receipt rows.
2. Preserve the deterministic object key, expected database digest, returned adapter digest/proof state, worker receipt/lease state, and incident correlation ID in the authorized environment. Do not copy object bytes, keys, or hashes into ordinary telemetry/tickets.
3. Re-run `corepack pnpm test:audit-admin:stack` and `corepack pnpm test:audit-admin:restore` on isolated synthetic evidence.
4. Accept an identical replay only when the stored bytes, digest, full proof, range, authorization, and state all match. Changed or ambiguous values remain rejected.
5. Do not overwrite the object, trust caller-supplied integrity fields, force completion, delete the dead letter, or grant broader worker access.

## Outbox backlog and dead letter

Only `audit.export.requested` is added to the outbox allow-list, with payload `{ exportBatchId }`. Inspect closed aggregate worker state and safe error code only. Preserve aggregate-version ordering, receipt deduplication, lease ownership/expiry, bounded backoff, and one successful completion. A duplicate delivery must have zero duplicate audit, object, outbox, or completion effects.

Disable `audit.export` if backlog age crosses the readiness threshold, ownership becomes ambiguous, duplicate successful claims appear, or proof verification fails. Re-enable only after exact service authorization, the oldest eligible event, every lease, and object proof are consistent.

## Synthetic restore exercise

The repository exercise uses a local logical PostgreSQL backup and local synthetic immutable-object copy:

```powershell
corepack pnpm test:audit-admin:restore
```

The recorded synthetic limits are RPO at most 15 minutes and RTO at most 60 minutes. Admission stays closed unless the database snapshot is complete, every restored UTC partition chain verifies, and every export object's bytes, digest, and complete retention proof match. Corrupted or incomplete restore evidence fails closed. This exercise does not demonstrate production topology, encrypted backup/key custody, WORM certification, scheduled quarterly execution, or production DR readiness.

## Performance and release evidence

The approved synthetic profile is 250,000 events across three completed UTC months, 50 test-only aggregate cells, 20 warmed database connections, and 25 concurrent export requests/workers. Read p95 must remain at most 400 ms and mutation p95 at most 800 ms:

```powershell
corepack pnpm test:audit-admin:performance
node tools/verify-feature-008-evidence.mjs --all
```

The test-only aggregate fixture does not activate runtime metrics. Before any release-stage decision, verify exact route parity, `metrics: []`, the SHA-bound manifest, forced RLS/grants, full security/privacy evidence, and every retained `OPEN-*` gate. Production enablement requires a separate approved configuration and the outstanding legal, retention, platform, UX/reference-device, and UAT evidence; this runbook cannot supply or waive it.
