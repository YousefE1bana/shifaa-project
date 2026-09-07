# Feature 008 research and decisions

> **Status:** complete — no unresolved planning item
> **Authority:** SHIFAA v2.1.3 baseline, Feature 008 `SPEC_APPROVED`, OPEN-PRIV-001 package `1.0.0-approved`, pinned repository runtime

## R-01 — Preserve the exact seven-operation boundary

**Decision:** Implement only `getAdminSummary`, `listAuditEvents`, `getAuditEvent`, `createAuditExport`, `exportAuditPartition`, `healthLive`, and `healthReady` at the API Catalog method/path pairs. Export status/proof is observed through audit list/detail evidence; no list/get-export, dashboard drill-down, backup, job, replay, or public health operation is added.

**Rationale:** The frozen roadmap and API Catalog are canonical. The existing outbox operator replay capability remains an internal dependency and is not absorbed into Feature 008's public contract.

**Alternatives rejected:** adding a convenient export polling endpoint; reusing raw table access; inventing GraphQL/gRPC; importing operations from `security/sec-001-002-remediation`.

## R-02 — Approved policy with inactive metric inventory

**Decision:** Treat OPEN-PRIV-001 package `1.0.0-approved` as the policy authority. The executable configuration initially contains `metrics: []`; therefore `getAdminSummary` returns `legal-gate-disabled` with zero cells. Later activation requires a digest-bound approved metric entry and exact status mapping where used. The policy engine rejects every unknown metric, dimension, category, combination, linked-release group, protected unit, or count shape.

**Rationale:** Privacy approval closes the planning gate without turning an unspecified metric into product behavior. This preserves `k=11`, inclusive 0-10 suppression, distinct-subject counting, and the approved differencing protections.

**Alternatives rejected:** sample/demo metrics active by default; row/event counts; patient selectors; arbitrary dates; treating a role or DPO designation as a suppression bypass.

## R-03 — Server-side disclosure pipeline

**Decision:** Use a pure policy pipeline: validate signed/digest-bound configuration, authorize role projection, query only an allow-listed prepared aggregate, normalize the immutable completed-month snapshot, apply primary suppression, apply deterministic parent-total complementary suppression to fixed point, enforce linked-release consistency, then serialize. Response, cache metadata, logs, traces, accessibility text, and error detail are constructed only after suppression.

**Rationale:** RLS protects source rows but does not prevent inference from aggregates. Keeping disclosure logic server-side and ordered makes the package's 34 vectors deterministic across locale and retry.

**Alternatives rejected:** client-side aggregation/suppression; dynamic SQL from request dimensions; random noise; releasing total and sibling combinations that permit differencing; shared/public caching.

## R-04 — Replace only an empty legacy audit table

**Decision:** The graduation migration may replace the existing unpartitioned `audit.events` baseline only after a preflight proves it is empty. If any legacy row exists, migration fails with a stable operator-facing condition and leaves the table untouched. No row is assigned a fabricated `previous_hash`, sequence, or verified status. Production upgrade migration remains gated until an evidence-backed legacy chain-origin procedure exists.

**Rationale:** PostgreSQL cannot convert the existing table to range partitioning in place, and current historical hashes do not prove a canonical chain. The repository's clean synthetic stack is empty before tests and can safely establish the v1 format.

**Alternatives rejected:** silent backfill; declaring existing ad-hoc hashes verified; destructive production truncation; keeping an unpartitioned canonical table contrary to the roadmap.

## R-05 — Monthly UTC chain with no extra head table

**Decision:** Partition `audit.events` by completed UTC calendar month. A fixed-search-path insertion function derives `partition_key`, obtains a transaction-scoped advisory lock for that key, reads the prior sequence/hash, assigns the next sequence, hashes a canonical versioned JSON representation plus `previous_hash`, and inserts. The first event uses the documented genesis value. Unique `(partition_key, chain_sequence)` and immutable triggers prevent forks or repair-in-place.

**Rationale:** This provides one total order per partition without inventing an additional canonical table. UTC semantics satisfy `NFR-DATA-002`; monthly partitions align with allowed export ranges and the approved aggregate time grain.

**Alternatives rejected:** application-computed chain state; wall-clock ordering; cross-partition global chain; mutable head row; update-based chain repair.

## R-06 — Redacted audit projections, not raw metadata

**Decision:** `super_admin` plus current Feature 007 AAL2 plus an allow-listed purpose is required at API and forced-RLS layers. List/detail return fixed fields from the canonical audit contract and a bounded `evidence` object containing chain version/partition/sequence/hashes/verification state. Raw `metadata`, free text, full user-agent, full IP, payloads, and storage credentials are never selected into DTOs. Audit reads append their own minimum audit events without recursively exposing raw data.

**Rationale:** The Data/RLS matrix explicitly grants only redacted API access and grants DPO no general audit role.

**Alternatives rejected:** general DPO access; raw JSON projection; masking only in the UI; relying solely on JWT role claims; direct PostgREST/table access.

## R-07 — Transactional export acceptance and idempotent object proof

**Decision:** `createAuditExport` atomically creates a queued `audit.export_batches` row, audit event, `audit.export.requested` outbox event, and completed idempotency response. The worker claims the minimum event in order. `exportAuditPartition` streams a canonical, manifest-prefixed export to a deterministic non-semantic create-if-absent object key, verifies the returned digest and retention proof, then records the proven result and audit evidence. Identical retries compare existing bytes/digest; mismatches fail and alert.

**Rationale:** PostgreSQL and object storage cannot share one transaction. The outbox plus deterministic object key makes the boundary recoverable without claiming atomic external storage.

**Alternatives rejected:** external write before database commit; signed URLs in outbox or audit; overwritable objects; user-selected arbitrary partitions; claiming production WORM from a local simulator.

## R-08 — Reuse the existing outbox and operator replay foundation

**Decision:** Extend the closed outbox event set with only `audit.export.requested`, payload `{ exportBatchId }`. Reuse existing aggregate-version uniqueness, receipts, `FOR UPDATE SKIP LOCKED` leases, bounded backoff, dead-letter classification, and governed operator replay. The original export request and audit chain remain immutable; replay is a new receipt/attempt, not a rewrite.

**Rationale:** Feature 005/007 already provide the ordered worker and DLQ mechanics. A second job table or queue would duplicate authority.

**Alternatives rejected:** in-process fire-and-forget export; client-side retries; new admin job/retry endpoints; payloads containing ranges, actors, credentials, or event data.

## R-09 — Health is bounded, private, and honest

**Decision:** `healthLive` checks only process/event-loop liveness. `healthReady` performs bounded database connectivity plus outbox-integrity/lag checks and returns `ready`, `degraded`, or `not_ready` with closed reason codes, observation time, and no dependency detail. Both remain private-network, service-authenticated inventory operations. Unsafe audit-chain or required outbox state makes readiness fail; liveness stays independent.

**Rationale:** A single health endpoint either lies about dependency safety or restarts healthy processes during dependency outages. Low-cardinality reasons are observable without leaking topology.

**Alternatives rejected:** public unauthenticated diagnostics; SQL/error strings; hostnames; credentials; raw queue payloads; liveness depending on database availability.

## R-10 — Shared observability extends the existing package

**Decision:** Extend `packages/observability` with default-deny field redaction, request/trace correlation, bounded operation/outcome/reason/policy-version labels, and sentinel tests. API, worker, object adapter, and health use the same context. Actor/person/patient/facility/resource IDs, raw counts, hashes, cursor values, arbitrary action strings, free text, signed links, and payloads are not metric labels.

**Rationale:** `NFR-OBS-001` requires correlation and prohibited-field controls; the roadmap says Feature 008 establishes the foundation but cannot close observability for future features.

**Alternatives rejected:** logging whole request/response bodies; dynamic labels; audit table as the metrics backend; claiming final cross-feature observability closure.

## R-11 — Existing admin application and design system only

**Decision:** Realize `/dashboard` and `/audit` in `apps/admin`, using the shared generated client, Feature 007 step-up shell, design-system tokens/primitives, and `ar-EG`/`en-EG` catalogs. Tables become labeled stacked rows below 768. Export status/proof is represented from audit events. There is no offline mutation queue, decorative motion, hover-only meaning, or pixel-identity claim.

**Rationale:** The UI Contract fixes the route inventory, Arabic-first parity, accessibility evidence, and informative-only screenshot boundary while OPEN-UX-001/002 remain.

**Alternatives rejected:** a separate observability app; direct database dashboard; client-only purpose/AAL enforcement; app-local tokens; English-first placeholder copy.

## R-12 — Verification topology and release boundaries

**Decision:** Use both clean standalone Compose PostgreSQL and the existing application test topology, with synthetic data only. Validate 250,000 events/three partitions, 20 warmed connections, 25 concurrent export workers, redaction sentinels, all 34 privacy vectors, forced RLS, API/client parity, AR/EN accessibility, p95 targets, and a database/object/proof restore tabletop. Production adapters and flags remain off.

**Rationale:** These fixtures are large enough to exercise partition/cursor/index/concurrency behavior while remaining deterministic on the graduation environment. Formal reference-device, production retention/WORM, legal, and UAT claims remain governed by their open gates.

**Alternatives rejected:** production-like PHI; unbounded load; performance claims without topology; treating a local object-lock simulator as regulatory evidence.
