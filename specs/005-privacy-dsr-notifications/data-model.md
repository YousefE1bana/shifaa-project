# Data Model: Privacy DSR and Notifications

**Feature:** `005-privacy-dsr-notifications`
**Migration strategy:** additive PostgreSQL/Supabase migration, forced RLS, private Storage, deterministic synthetic seeds, no automated deletion.

## 1. Shared conventions

- UUID v4 primary keys; `timestamptz`; `snake_case`; integer `version > 0`; bounded text and JSON.
- Online access uses existing `shifaa_api`, which is non-owner and has no `BYPASSRLS`. No `service_role` or owner-backed online path.
- All new/changed domain tables use `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`.
- Fixed-search-path helpers read transaction-local person, role/designation, AAL, purposes, request ID, and patient context, then query current rows.
- No user/service DELETE grants. Append-only events/audit/callback receipts have mutation-rejection triggers.
- Retention classes are recorded; durations/actions remain unknown until `OPEN-LEGAL-002` closes.

## 2. Identity governance designation

### `identity.governance_designations`

| Column                                                         | Type/rule                                               |
| -------------------------------------------------------------- | ------------------------------------------------------- | ------ | ------- | -------- |
| `id`                                                           | UUID PK                                                 |
| `person_id`                                                    | UUID FK `identity.people`, required                     |
| `designation_code`                                             | text check exactly `registered_dpo`                     |
| `status`                                                       | `pending                                                | active | revoked | expired` |
| `evidence_reference`                                           | bounded text, synthetic reference only                  |
| `registration_digest`                                          | lowercase SHA-256 hex; no document/body                 |
| `valid_from`, `valid_until`                                    | timestamptz; valid-until nullable and greater than from |
| `approved_by_person_id`, `approved_at`                         | required for active                                     |
| `revoked_by_person_id`, `revoked_at`, `revocation_reason_code` | all-or-none for revoked                                 |
| `version`, `created_at`, `updated_at`                          | optimistic version/timestamps                           |

Indexes/constraints: unique active `(person_id, designation_code)` partial index; current lookup `(person_id, designation_code, status, valid_from, valid_until)`; shape check for status/evidence fields. No 005 public operation manages designations; deterministic seeds create only synthetic evidence.

## 3. DSR aggregate

### `consent.data_subject_requests`

| Column                                                                                                                   | Type/rule                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------ | ------------------------- | ------------------ | ------- | --------- | ---------- |
| `id`                                                                                                                     | UUID PK                                                                                                                                     |
| `person_id`                                                                                                              | UUID FK `identity.people`; data subject                                                                                                     |
| `patient_id`                                                                                                             | UUID FK `identity.patients`; canonical subject context                                                                                      |
| `submitted_by_person_id`                                                                                                 | UUID FK person; patient or legal guardian                                                                                                   |
| `request_type`                                                                                                           | `access_export                                                                                                                              | correction                     | restriction  | erasure_pseudonymization` |
| `scope`                                                                                                                  | JSON object with only `data_category_codes[]`, optional `record_reference_codes[]`, optional bounded `correction_codes[]`; no free-form PHI |
| `contact_preference`                                                                                                     | `in_app                                                                                                                                     | sms`                           |
| `status`                                                                                                                 | canonical `submitted                                                                                                                        | identity_verification_required | under_review | approved                  | partially_approved | refused | fulfilled | cancelled` |
| `identity_verification_required`, `identity_verified_at`                                                                 | boolean/timestamp shape                                                                                                                     |
| `due_policy_code`                                                                                                        | `synthetic_dsr_due_v1` locally = exactly 17 calendar days; visible non-statutory label; production-disabled until approved                  |
| `submitted_at`, `due_at`                                                                                                 | required; due later than submitted                                                                                                          |
| `decision_code`, `decision_reason`, `included_scope`, `excluded_scope`, `decided_by_person_id`, `decided_at`             | required by decided states; bounded structured JSON/text                                                                                    |
| `fulfilment_action_codes`, `fulfilment_summary`, `evidence_object_id`, `subject_notice_code`, `released_at`, `closed_at` | required by fulfilled state; no export body                                                                                                 |
| `version`, `created_at`, `updated_at`                                                                                    | versioned aggregate                                                                                                                         |

Indexes: subject page `(patient_id, submitted_at DESC, id)`; DPO worklist `(status, due_at, id)`; type/status `(request_type,status,due_at,id)`. State shape check prevents missing decision/fulfilment evidence. `erasure_pseudonymization` action codes `hard_delete|automated_pseudonymize` are rejected unless a separately approved policy flag exists; 005 never seeds it.

### `consent.data_subject_request_events`

| Column                                  | Type/rule                                                               |
| --------------------------------------- | ----------------------------------------------------------------------- | -------- | --- | ------ | ------- |
| `id`                                    | UUID PK                                                                 |
| `request_id`                            | UUID FK DSR                                                             |
| `aggregate_version`                     | integer >0; unique per request                                          |
| `actor_person_id`                       | UUID FK person, nullable only for worker/system event with `actor_type` |
| `actor_type`                            | `subject                                                                | guardian | dpo | worker | system` |
| `event_type`                            | closed DSR event set                                                    |
| `from_status`, `to_status`              | canonical status/null rules                                             |
| `reason_code`, `evidence_object_id`     | bounded/UUID nullable according to event                                |
| `minimum_metadata`                      | JSON object with allowed keys only; no scope/reason body/export/contact |
| `occurred_at`, `request_idempotency_id` | immutable evidence                                                      |

Unique `(request_id,aggregate_version)` and `(request_idempotency_id,event_type)`. Append only; subject/DPO reads are role-projected through API.

### `consent.dsr_assignments`

| Column                      | Type/rule                         |
| --------------------------- | --------------------------------- |
| `id`                        | UUID PK                           |
| `request_id`                | UUID FK DSR                       |
| `dpo_person_id`             | UUID FK person                    |
| `assigned_by_person_id`     | UUID FK person/system attribution |
| `assignment_reason_code`    | bounded code                      |
| `assigned_at`, `revoked_at` | timestamps                        |
| `version`                   | positive integer                  |

Unique active assignment per request and partial worklist index `(dpo_person_id,assigned_at,request_id) WHERE revoked_at IS NULL`. Assignment is necessary but never sufficient without active designation/AAL2/purpose.

### `consent.dsr_export_capabilities`

| Column                                       | Type/rule                                       |
| -------------------------------------------- | ----------------------------------------------- |
| `id`                                         | UUID PK                                         |
| `request_id`                                 | UUID FK DSR                                     |
| `evidence_object_id`                         | UUID FK private evidence object                 |
| `token_hmac`                                 | bytea unique; plaintext never stored            |
| `key_version`                                | positive integer                                |
| `issued_to_person_id`, `issued_by_person_id` | subject/authorized guardian and API attribution |
| `expires_at`, `used_at`, `revoked_at`        | timestamps; used/revoked mutually exclusive     |
| `version`, `created_at`                      | version/audit time                              |

At most one active unexpired capability per request/recipient. Local synthetic expiry is exactly 5 minutes after issue. The patient-app link submits consume mode to the same `downloadDsrExport` POST operation. Consumption is a single transaction that locks by HMAC, verifies current relationship/AAL2/request release/evidence scanner state, marks `used_at`, appends audit, then streams through the Core API. The response is `private, no-store`; no additional registered operation exists.

### Private evidence expansion

Expand the existing private-evidence bucket check with `dsr-export` and bind each object to the DSR/request subject. Required metadata: object key, SHA-256 digest, content type allow-list (`application/zip`, `application/json`, `application/pdf` as configured), bounded size, scan state `released`, release time. Create private Storage bucket `dsr-exports` only when `storage.buckets` exists. No public/list/user direct-read policy.

## 4. Notification governance

### `platform.notification_template_releases`

| Column                                           | Type/rule                                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------------ | --------- | -------- |
| `id`                                             | UUID PK                                                                        |
| `template_code`, `version`                       | bounded uppercase code; positive version; unique pair                          |
| `channel`                                        | exactly `sms` for 005                                                          |
| `arabic_subject/body`, `english_subject/body`    | subject nullable for SMS; bounded bodies, paired required                      |
| `allowed_recipient_types`                        | non-empty array subset of `patient` only for 005 templates                     |
| `allowed_field_schema`                           | JSON object: exact property names/types/required, `additionalProperties=false` |
| `placeholder_names`                              | sorted unique text array exactly matching both locale bodies                   |
| `content_digest`                                 | lowercase SHA-256 hex over canonical release                                   |
| `status`                                         | `draft                                                                         | published | retired` |
| `created_by_person_id`, `published_by_person_id` | creator/publisher; different when published                                    |
| `effective_at`, `retired_at`                     | publish lifecycle                                                              |
| `version_lock`, `created_at`, `updated_at`       | optimistic version/timestamps                                                  |

Indexes: list `(template_code,status,version DESC,id)` and effective lookup `(template_code,channel,status,effective_at DESC)`. Published content/schema/digest cannot update; retirement/new release is required.

## 5. Notification delivery

### `platform.notifications`

| Column                                                                 | Type/rule                                                 |
| ---------------------------------------------------------------------- | --------------------------------------------------------- | ------------- | --------- | ------ | ------------ |
| `id`                                                                   | UUID PK                                                   |
| `source_event_id`                                                      | UUID FK outbox event                                      |
| `template_release_id`                                                  | UUID FK published template release                        |
| `recipient_type`, `recipient_person_id`                                | closed/minimum recipient reference; no contact            |
| `locale`, `channel`                                                    | `ar-EG                                                    | en-EG`; `sms` |
| `field_values`                                                         | validated minimum JSON; never token/link/body/contact/PHI |
| `rendered_digest`                                                      | SHA-256 only; rendered full body is not persisted         |
| `status`                                                               | `pending                                                  | processing    | delivered | failed | dead_letter` |
| `provider_reference_hash`                                              | nullable digest only                                      |
| `attempt_count`, `next_attempt_at`, `delivered_at`, `dead_lettered_at` | delivery lifecycle                                        |
| `version`, `created_at`, `updated_at`                                  | optimistic version                                        |

Unique visible-delivery key `(template_release_id,source_event_id,recipient_type,recipient_person_id,channel)`. Index claim `(status,next_attempt_at,created_at,id)` and recipient status `(recipient_person_id,status,created_at DESC)`.

### `platform.notification_delivery_attempts`

| Column                                  | Type/rule                         |
| --------------------------------------- | --------------------------------- | --------- | ----------------- | ----------------- | ------- | ------------- | ------------- |
| `id`                                    | UUID PK                           |
| `notification_id`, `source_event_id`    | FKs                               |
| `attempt_number`                        | positive; unique per notification |
| `adapter_code`                          | `local-synthetic` only in 005     |
| `provider_idempotency_key`              | HMAC/digest; unique               |
| `outcome`                               | `accepted                         | delivered | transient_failure | permanent_failure | timeout | dead_lettered | deduplicated` |
| `safe_error_code`                       | bounded allow-list, nullable      |
| `started_at`, `finished_at`, `retry_at` | timestamps                        |
| `provider_receipt_hash`                 | nullable unique digest            |

No raw destination, rendered body, provider body, or signature. Attempts are append-only.

### `platform.provider_callback_receipts`

| Column                                      | Type/rule                             |
| ------------------------------------------- | ------------------------------------- | --------- | ------- |
| `id`                                        | UUID PK                               |
| `provider_code`                             | `local-synthetic`                     |
| `event_reference`, `receipt_reference_hash` | opaque bounded ID and HMAC/SHA digest |
| `nonce_hash`                                | unique HMAC                           |
| `request_digest`                            | SHA-256 canonical minimum callback    |
| `delivery_status`                           | `accepted                             | delivered | failed` |
| `provider_occurred_at`, `received_at`       | bounded timestamp-window evidence     |

Unique `(provider_code,receipt_reference_hash)` and nonce. Append-only. The local fixture uses HMAC-SHA-256 over the canonical minimum body plus signed provider timestamp and accepts only ±5 minutes of clock skew. Invalid signature/timestamp never reaches this table; a minimal rejection audit/metric contains no callback fields.

### Existing outbox/event receipt expansion

Add `aggregate_version` and lease metadata if absent, preserving existing rows with deterministic backfill. Extend event-type check with the closed 005 source/template/delivery events. Preserve existing unique receipt behavior, and add a replay-attempt table/reference rather than changing original events. Per-aggregate claim selects only the next version; gaps are postponed.

Retry schedule index maps attempt `1..5` to `1 minute`, `5 minutes`, `30 minutes`, `2 hours`, `12 hours`, plus jitter bounded to ±10%; tests use a deterministic seed and non-test environments use cryptographically random bounded jitter. Permanent schema/auth failures dead-letter immediately.

## 6. Processing inventory and flags

Seed active synthetic-only inventory rows:

- `privacy-dsr-intake-synthetic`
- `privacy-dsr-export-synthetic`
- `privacy-notification-render-synthetic`
- `privacy-provider-receipt-synthetic`

Each row names only local API/worker/private Storage/local adapter systems, Egypt synthetic environment, minimum data categories/recipients, retention class, `synthetic-engineering-only` basis, and a deterministic approval digest. Missing/inactive rows block before sensitive input acceptance.

Flags seed enabled only for local/test cohorts: DSR, DPO, template governance, local delivery, callback, replay. Production messaging and automated erasure flags do not exist or remain false with no activation operation in 005.

## 7. State transitions and functions

`consent.transition_dsr(request_id, expected_version, target_status, decision/evidence fields)` locks the row and permits only:

- `submitted → identity_verification_required|under_review|cancelled`
- `identity_verification_required → under_review`
- `under_review → approved|partially_approved|refused`
- `approved|partially_approved → fulfilled`

The function validates current DPO context for admin transitions, assignment, reason/evidence shape, version, identity gate, processing inventory, and retention gate. It writes the next event in the same transaction. All other transitions raise a stable conflict mapping.

`platform.publish_notification_template(release_id, expected_version, approval_digest)` locks the draft, verifies independent current support publisher/AAL2/purpose, exact digest/schema/locale pair/effective time/inventory, and publishes atomically.

Worker functions claim/release/complete/dead-letter under a worker-specific transaction context and preserve aggregate order. Replay verifies operator AAL2/purpose/version/dead-letter state, appends a replay attempt/new event reference, and keeps the original immutable.

## 8. RLS matrix

| Resource                      | Patient                         | Guardian                                      | Delegate/facility/admin | Assigned DPO                                                                       | Support author/publisher                                 | Worker/operator                    |
| ----------------------------- | ------------------------------- | --------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------- |
| DSR                           | own minimum                     | subject with active approved `consent.manage` | deny                    | assigned + active designation + AAL2 + purpose minimum                             | deny                                                     | function-only minimum              |
| DSR events                    | own released/history projection | same subject scope                            | deny                    | assigned minimum                                                                   | deny                                                     | append/function only               |
| assignment                    | deny direct                     | deny                                          | deny                    | own active assignment read as predicate                                            | deny                                                     | system function only               |
| export capability/object      | issue/use through API only      | current subject scope AAL2                    | deny                    | released evidence metadata only if assigned action needs it                        | deny                                                     | approved export job only           |
| template release              | deny                            | deny                                          | deny                    | deny unless separately authorized support actor (designation alone grants nothing) | permission + purpose; publish requires AAL2/independence | render minimum published row       |
| notification/attempt/callback | deny raw tables                 | deny                                          | deny                    | deny                                                                               | minimum governance status only through API               | function-scoped claim/write/replay |

Negative SQL tests execute as `shifaa_api`, assert `relrowsecurity` and `relforcerowsecurity`, and independently remove each current-state predicate. Owner-role success is not accepted as RLS evidence.

## 9. Migration validation and rollback

1. Apply on a fresh synthetic database and on the existing 004 schema.
2. Validate old event checks/backfills before new `NOT NULL`/unique constraints.
3. Assert grants, owners, `rolbypassrls=false`, policy predicates, fixed function `search_path`, and absence of user deletes.
4. Seed deterministic synthetic people/patient/guardian/DPO/support/operator, assignments, requests, exports, templates, events, notifications, callbacks, and failure vectors.
5. Validate private bucket and direct-access denial when Storage exists.
6. After data exists, rollback is flag disable plus forward correction. No destructive down migration or retention automation is supplied.
