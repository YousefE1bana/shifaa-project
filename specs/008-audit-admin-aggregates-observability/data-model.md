# Feature 008 data model

> **Status:** planned, not implemented
> **Authority:** Feature 008 spec/plan, Data/RLS contract, OPEN-PRIV-001 package `1.0.0-approved`

## 1. Existing objects reused

- `platform.idempotency_records`: global non-null-principal request/result replay contract.
- `platform.outbox_events` and `platform.event_receipts`: ordered export work, leases, outcomes, retry, and deduplication.
- `platform.feature_flags`: environment-scoped gates and constraints. Aggregate enablement additionally requires an approved metric-config digest; the initial configuration is `metrics: []`.
- Existing transaction context, current grant, AAL, purpose, and non-owner `shifaa_api`/`shifaa_worker` roles.

No patient analytics store, admin job table, audit payload table, chain-head table, notification table, or statutory retention schedule is introduced.

## 2. `audit.events` v1

The existing empty graduation baseline table is replaced only after a migration preflight confirms `count(*) = 0`. A non-empty table aborts migration without alteration; existing hashes are never backfilled or called verified.

`audit.events` is range-partitioned by `occurred_at` at completed UTC calendar-month boundaries. Each child partition has the same immutable constraints and indexes.

| Column               | Type / nullability     | Constraint / meaning                                                                |
| -------------------- | ---------------------- | ----------------------------------------------------------------------------------- |
| `id`                 | `uuid not null`        | generated ID; unique with `occurred_at` under partitioned primary key               |
| `occurred_at`        | `timestamptz not null` | server transaction time in UTC; partition key                                       |
| `partition_key`      | `date not null`        | first UTC date of `occurred_at` month; check equals derived UTC month               |
| `chain_sequence`     | `bigint not null`      | starts 1 within `partition_key`; unique and contiguous through insertion function   |
| `chain_version`      | `smallint not null`    | exact supported value `1`                                                           |
| `request_id`         | `uuid not null`        | request correlation ID                                                              |
| `trace_id`           | `text not null`        | bounded lowercase trace identifier; not an actor/resource ID                        |
| `actor_user_id`      | `uuid null`            | internal Auth subject where an actor exists                                         |
| `actor_person_id`    | `uuid null`            | internal person where resolved                                                      |
| `authentication_aal` | `smallint null`        | null for system event; otherwise closed range 1-2                                   |
| `facility_id`        | `uuid null`            | minimum applicable context only                                                     |
| `patient_id`         | `uuid null`            | minimum applicable context only; never returned without authorized redaction policy |
| `purpose_code`       | `text null`            | stable allow-listed code, not free text                                             |
| `action_code`        | `text not null`        | stable allow-listed action code                                                     |
| `resource_type`      | `text not null`        | stable bounded type                                                                 |
| `resource_id`        | `uuid null`            | internal resource reference where required                                          |
| `resource_version`   | `integer null`         | positive when present                                                               |
| `outcome`            | `text not null`        | closed bounded outcome class                                                        |
| `reason_code`        | `text null`            | stable bounded code, never justification/free text                                  |
| `source_ip_prefix`   | `inet null`            | minimized prefix only; never full client IP in DTO/telemetry                        |
| `user_agent_class`   | `text null`            | closed coarse class, never full header                                              |
| `previous_hash`      | `bytea not null`       | 32-byte prior event hash or documented 32-byte genesis value                        |
| `event_hash`         | `bytea not null`       | 32-byte SHA-256 of canonical v1 representation including `previous_hash`            |

### Canonical hash insertion

Only `audit.append_event_v1(...)` may insert. It:

1. derives `partition_key` from server `occurred_at` in UTC;
2. takes `pg_advisory_xact_lock` on a stable namespace plus the partition key;
3. reads the highest v1 sequence/hash in that partition;
4. assigns the next sequence and prior/genesis hash;
5. constructs a schema-versioned, key-ordered canonical representation with explicit nulls and UTC RFC 3339 timestamps;
6. computes SHA-256 with the repository-discovered `pgcrypto` schema; and
7. inserts and returns only the new event ID/time/hash evidence.

Direct table insert/update/delete and caller-supplied hash/sequence are revoked. A BEFORE UPDATE/DELETE trigger rejects all mutation. Tests inject content/link/order tampering in isolated test copies; production history is never altered for testing.

### Indexes

- partitioned primary key `(occurred_at, id)`;
- unique per child `(partition_key, chain_sequence)`;
- `(occurred_at desc, id desc)` for cursor ordering;
- `(actor_person_id, occurred_at desc, id desc)` where actor exists;
- `(action_code, occurred_at desc, id desc)`;
- `(resource_type, resource_id, occurred_at desc, id desc)` where resource ID exists;
- `(facility_id, occurred_at desc, id desc)` and `(patient_id, occurred_at desc, id desc)` where present;
- `(outcome, occurred_at desc, id desc)`.

Opaque cursor encodes the last authorized `(occurred_at,id)` plus a server signature; it is never a raw SQL fragment or telemetry label.

## 3. `audit.signature_evidence`

| Column                    | Type / nullability     | Constraint / meaning                                          |
| ------------------------- | ---------------------- | ------------------------------------------------------------- |
| `id`                      | `uuid not null`        | primary key                                                   |
| `resource_type`           | `text not null`        | bounded governed resource type                                |
| `resource_id`             | `uuid not null`        | governed resource                                             |
| `resource_version`        | `integer not null`     | positive signed version                                       |
| `signer_person_id`        | `uuid not null`        | internal signer person                                        |
| `signer_role`             | `text not null`        | approved closed role code                                     |
| `decision`                | `text not null`        | approved closed decision code                                 |
| `artifact_digest`         | `bytea not null`       | 32-byte digest; no signature secret                           |
| `signed_at`               | `timestamptz not null` | UTC server-recorded signing time                              |
| `audit_event_id`          | `uuid not null`        | event reference resolved through an immutable lookup function |
| `audit_event_occurred_at` | `timestamptz not null` | composite reference partition key                             |

Primary key `id`; unique `(resource_type,resource_id,resource_version,signer_role)` where canonical governance permits one role decision. Composite FK `(audit_event_occurred_at,audit_event_id)` references the partitioned audit key. The table is append-only with no API update/delete grant. Cryptographic signature material stays in the external KMS-backed evidence port; only the digest is stored.

## 4. `audit.export_batches`

| Column                    | Type / nullability     | Constraint / meaning                                                |
| ------------------------- | ---------------------- | ------------------------------------------------------------------- |
| `id`                      | `uuid not null`        | primary key and export aggregate ID                                 |
| `requested_by_person_id`  | `uuid not null`        | current authorized `super_admin`                                    |
| `purpose_code`            | `text not null`        | approved audit-export purpose                                       |
| `partition_start`         | `date not null`        | first UTC day of a completed month                                  |
| `partition_end_exclusive` | `date not null`        | later first UTC month boundary; bounded approved range              |
| `status`                  | `text not null`        | `queued`, `claimed`, `retryable`, `dead_letter`, `proven`           |
| `object_key`              | `text null`            | non-semantic deterministic private key; present after export starts |
| `object_digest`           | `bytea null`           | 32-byte digest; required only for `proven`                          |
| `retention_proof`         | `jsonb null`           | closed non-secret provider proof schema; required only for `proven` |
| `exported_at`             | `timestamptz null`     | required only for `proven`                                          |
| `failure_code`            | `text null`            | bounded non-secret class for retry/dead-letter; no provider detail  |
| `lease_owner`             | `text null`            | bounded worker instance pseudonym                                   |
| `lease_expires_at`        | `timestamptz null`     | present only while claimed                                          |
| `attempt_count`           | `integer not null`     | starts 0, bounded positive progression                              |
| `created_at`,`updated_at` | `timestamptz not null` | UTC server timestamps                                               |
| `version`                 | `integer not null`     | starts 1 and increments on catalogued worker state changes          |

Checks require `partition_start < partition_end_exclusive`, month-aligned completed UTC bounds, a configured maximum partition span, coherent lease/failure/proof fields, and no overwrite after `proven`. Unique `(partition_start, partition_end_exclusive, object_key)` applies when the object key exists. Claim index `(status, lease_expires_at, created_at, id)` supports ordered `SKIP LOCKED` work.

### Observable transitions

| From                  | To            | Actor/guard                                                                         | Effects                                                        |
| --------------------- | ------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| none                  | `queued`      | `super_admin`, current AAL2, allowed purpose, valid range, idempotency              | batch + audit + outbox + stored response in one DB transaction |
| `queued`/`retryable`  | `claimed`     | `shifaa_worker`, unexpired ordering predecessor absent                              | lease/attempt increment only                                   |
| `claimed`             | `proven`      | service-auth `exportAuditPartition`; immutable object bytes, digest, proof verified | proof fields + audit event; terminal                           |
| `claimed`             | `retryable`   | transient adapter error; attempt budget remains                                     | bounded failure code and next outbox availability              |
| `claimed`/`retryable` | `dead_letter` | permanent/auth/schema/proof failure or exhausted budget                             | immutable original; alert and receipt                          |
| `dead_letter`         | `claimed`     | existing authorized operator replay with purpose/AAL2                               | new receipt/attempt; original request unchanged                |

All other transitions fail closed. The API does not expose a new export-list/status operation.

## 5. Aggregate configuration contract

The approved policy is configuration, not a database analytics table. A versioned checked-in configuration is loaded through the existing feature-flag/config port and validated against its canonical SHA-256 before use.

```yaml
policyId: OPEN-PRIV-001
policyVersion: 1.0.0-approved
minimumDistinctSubjects: 11
suppressedInclusive: [0, 10]
metrics: []
```

A later metric entry must provide all fields required by the approved package: stable metric ID, purpose, authorized role projection, authoritative source, protected unit, distinct-subject key, completed-month time field, permitted dimension set/combination, closed category set and status mapping where applicable, threshold at least 11, parent equations, complete linked-release group, immutable snapshot/version behavior, owner approvals, approval artifact/digest, effective/retired times, and test-vector reference. Missing/unknown/mismatched fields mean inactive/rejected. No runtime request supplies SQL, source table, subject key, category, or dimension.

Aggregate result cells contain only an approved metric ID, completed month, approved dimension labels, disclosure state (`released` or `suppressed`), released distinct-subject count when and only when allowed, bounded suppression reason class, policy version, and snapshot time/version. Suppressed cells never contain an exact count, range, cache validator derived from the count, or drill-down link.

## 6. RLS and grants

All three audit tables use `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`. Helpers are stable/security-definer only where necessary, schema-qualify every object, fix `search_path`, return booleans/minimum rows, and are revoked from `PUBLIC`, `anon`, and `authenticated`.

| Context                                                                                      | `audit.events`                                                    | `audit.signature_evidence`                                 | `audit.export_batches`                             |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------- |
| current `super_admin`, AAL2, allowed purpose                                                 | redacted projection through repository/API; no raw metadata       | authorized minimum evidence only                           | insert/read minimum own authorized export evidence |
| any other admin, DPO-only, patient, guardian, delegate, workforce, stale/missing purpose/AAL | zero rows                                                         | zero rows                                                  | zero rows/effects                                  |
| `shifaa_api`                                                                                 | execute append/read functions only under current context          | execute minimum governed append/read functions             | execute request/transition functions; no delete    |
| `shifaa_worker`                                                                              | export stream only for exact claimed batch/range through function | none unless proof function returns minimum linked evidence | claim/transition exact work only                   |
| migration owner                                                                              | time-bound migration/repair only with external evidence           | same                                                       | same                                               |

Online code never uses table owner, superuser, `service_role`, or `BYPASSRLS`. Direct selects/inserts/updates/deletes and cross-range worker attempts are negative-tested.

## 7. Outbox, retention, encryption, and restore

- Extend the existing event-type constraint with `audit.export.requested`; payload is exactly `{ "exportBatchId": "<uuid>" }`.
- Aggregate type is `audit-export`, aggregate ID is the batch ID, and aggregate version matches the batch version. Existing unique receipt and ordering rules apply.
- Audit rows, signature evidence, and export metadata use `SECURITY_AUDIT`. Statutory duration/deletion remains unset under `OPEN-LEGAL-002`; no purge is added.
- Database volumes/backups and private objects are encrypted. Object keys contain no person/facility/purpose/range semantics. Credentials and signed URLs are never persisted in these tables.
- Restore validation checks database consistency, every partition chain, object bytes against recorded digest, retention proof presence/validity, and outbox/export state. A mismatch makes readiness not-ready and triggers the incident runbook; it is never auto-repaired.

## 8. Migration and rollback

1. Assert repository baseline shape and empty `audit.events`; abort safely otherwise.
2. Create required schemas/extensions through discovered extension schema and build v1 partitioned `audit.events` plus current/next UTC month partitions for synthetic testing.
3. Add canonical append/verify/redacted-read functions, immutable triggers, grants, and forced RLS.
4. Add `audit.signature_evidence` and `audit.export_batches`, state functions, constraints, indexes, grants, and forced RLS.
5. Extend outbox allow-list/worker policies and feature-flag rows with aggregates disabled and `metrics: []`.
6. Add processing-inventory entries by existing retention class only; seed synthetic fixtures after migration, never production data.
7. Validate fresh and upgrade-fail-closed paths, direct grants, chain vectors, export proof, and rollback boundary.

Before the first v1 event on a clean synthetic stack, validated rollback may drop the new empty structures and restore the prior empty definition. After any event/export exists, disable routes/claims and roll forward; never delete, rewrite, or renumber evidence.
