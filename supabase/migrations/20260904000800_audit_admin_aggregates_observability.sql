BEGIN;

-- Feature 008 can replace the graduation audit baseline only while it is empty.
-- NO FORCE is transactional: a failed preflight rolls it back with every other
-- statement, while allowing the owner to see rows hidden by the legacy RLS policy.
DO $preflight_shape$
DECLARE
  actual_column_signature text[];
  relation_kind "char";
  row_security_enabled boolean;
  row_security_forced boolean;
BEGIN
  SELECT relation.relkind,relation.relrowsecurity,relation.relforcerowsecurity
  INTO relation_kind,row_security_enabled,row_security_forced
  FROM pg_catalog.pg_class AS relation
  WHERE relation.oid = pg_catalog.to_regclass('audit.events');

  IF relation_kind IS NULL THEN
    RAISE EXCEPTION 'F008_LEGACY_AUDIT_TABLE_MISSING'
      USING ERRCODE = '55000';
  END IF;

  IF relation_kind <> 'r' THEN
    RAISE EXCEPTION 'F008_LEGACY_AUDIT_SHAPE_UNSUPPORTED'
      USING ERRCODE = '55000';
  END IF;

  SELECT pg_catalog.array_agg(
    pg_catalog.format(
      '%s:%s:%s',
      attribute.attname,
      pg_catalog.format_type(attribute.atttypid,attribute.atttypmod),
      attribute.attnotnull
    )
    ORDER BY attribute.attnum
  )
  INTO actual_column_signature
  FROM pg_catalog.pg_attribute AS attribute
  WHERE attribute.attrelid = pg_catalog.to_regclass('audit.events')
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped;

  IF actual_column_signature IS DISTINCT FROM ARRAY[
    'id:uuid:t',
    'previous_hash:text:f',
    'event_hash:text:t',
    'actor_person_id:uuid:f',
    'purpose_code:text:f',
    'patient_id:uuid:f',
    'facility_id:uuid:f',
    'action:text:t',
    'resource_type:text:t',
    'resource_id:uuid:f',
    'outcome:text:t',
    'request_id:uuid:t',
    'occurred_at:timestamp with time zone:t',
    'metadata:jsonb:t'
  ]::text[] THEN
    RAISE EXCEPTION 'F008_LEGACY_AUDIT_SHAPE_UNSUPPORTED'
      USING ERRCODE = '55000';
  END IF;

  IF NOT row_security_enabled
     OR NOT row_security_forced
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_constraint AS constraint_row
       WHERE constraint_row.conrelid = pg_catalog.to_regclass('audit.events')
         AND constraint_row.contype = 'p'
         AND pg_catalog.pg_get_constraintdef(constraint_row.oid,false) = 'PRIMARY KEY (id)'
     ) THEN
    RAISE EXCEPTION 'F008_LEGACY_AUDIT_SHAPE_UNSUPPORTED'
      USING ERRCODE = '55000';
  END IF;
END
$preflight_shape$;

ALTER TABLE audit.events NO FORCE ROW LEVEL SECURITY;
LOCK TABLE audit.events IN ACCESS EXCLUSIVE MODE;

DO $preflight_rows$
BEGIN
  IF EXISTS (SELECT 1 FROM audit.events LIMIT 1) THEN
    RAISE EXCEPTION 'F008_LEGACY_AUDIT_EVENTS_NOT_EMPTY'
      USING ERRCODE = '55000',
        DETAIL = 'Feature 008 does not backfill or relabel legacy audit hashes.';
  END IF;
END
$preflight_rows$;

DROP TABLE audit.events;

CREATE TABLE audit.events (
  id uuid NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  occurred_at timestamptz NOT NULL,
  partition_key date NOT NULL,
  chain_sequence bigint NOT NULL CHECK (chain_sequence > 0),
  chain_version smallint NOT NULL CHECK (chain_version = 1),
  request_id uuid NOT NULL,
  trace_id text NOT NULL CHECK (
    pg_catalog.octet_length(trace_id) BETWEEN 16 AND 64
    AND trace_id ~ '^[a-z0-9][a-z0-9._:-]*$'
  ),
  actor_user_id uuid,
  actor_person_id uuid REFERENCES identity.people(id),
  authentication_aal smallint CHECK (authentication_aal BETWEEN 1 AND 2),
  facility_id uuid,
  patient_id uuid REFERENCES identity.patients(id),
  purpose_code text CHECK (
    purpose_code IS NULL OR (
      pg_catalog.octet_length(purpose_code) BETWEEN 2 AND 64
      AND purpose_code ~ '^[a-z][a-z0-9._-]*$'
    )
  ),
  action_code text NOT NULL CHECK (
    pg_catalog.octet_length(action_code) BETWEEN 2 AND 64
    AND action_code ~ '^[a-z][a-z0-9._-]*$'
  ),
  resource_type text NOT NULL CHECK (
    pg_catalog.octet_length(resource_type) BETWEEN 2 AND 64
    AND resource_type ~ '^[a-z][a-z0-9._-]*$'
  ),
  resource_id uuid,
  resource_version integer CHECK (resource_version > 0),
  outcome text NOT NULL CHECK (outcome IN ('success','denied','failed')),
  reason_code text CHECK (
    reason_code IS NULL OR (
      pg_catalog.octet_length(reason_code) BETWEEN 2 AND 64
      AND reason_code ~ '^[a-z][a-z0-9._-]*$'
    )
  ),
  source_ip_prefix inet CHECK (
    source_ip_prefix IS NULL OR (
      source_ip_prefix = pg_catalog.network(source_ip_prefix)
      AND (
        (pg_catalog.family(source_ip_prefix) = 4 AND pg_catalog.masklen(source_ip_prefix) <= 24)
        OR (pg_catalog.family(source_ip_prefix) = 6 AND pg_catalog.masklen(source_ip_prefix) <= 64)
      )
    )
  ),
  user_agent_class text CHECK (
    user_agent_class IS NULL
    OR user_agent_class IN ('web','mobile','service','worker','system','unknown')
  ),
  previous_hash bytea NOT NULL CHECK (pg_catalog.octet_length(previous_hash) = 32),
  event_hash bytea NOT NULL CHECK (pg_catalog.octet_length(event_hash) = 32),
  PRIMARY KEY (occurred_at,id),
  CHECK (
    partition_key = pg_catalog.date_trunc('month', occurred_at AT TIME ZONE 'UTC')::date
  )
) PARTITION BY RANGE (occurred_at);

-- The three deterministic completed-month fixtures are joined by the current
-- and next UTC months required by the synthetic runtime profile.
DO $partitions$
DECLARE
  month_start date;
  month_end date;
  partition_name text;
BEGIN
  FOR month_start IN
    SELECT DISTINCT candidate.month_start
    FROM pg_catalog.unnest(ARRAY[
      DATE '2026-05-01',
      DATE '2026-06-01',
      DATE '2026-07-01',
      pg_catalog.date_trunc('month', pg_catalog.statement_timestamp() AT TIME ZONE 'UTC')::date,
      (pg_catalog.date_trunc('month', pg_catalog.statement_timestamp() AT TIME ZONE 'UTC') + INTERVAL '1 month')::date
    ]) AS candidate(month_start)
    ORDER BY candidate.month_start
  LOOP
    month_end := (month_start + INTERVAL '1 month')::date;
    partition_name := 'events_' || pg_catalog.to_char(month_start, 'YYYY_MM');

    EXECUTE pg_catalog.format(
      'CREATE TABLE audit.%I PARTITION OF audit.events FOR VALUES FROM (%L) TO (%L)',
      partition_name,
      month_start::text || ' 00:00:00+00',
      month_end::text || ' 00:00:00+00'
    );
    EXECUTE pg_catalog.format(
      'CREATE UNIQUE INDEX %I ON audit.%I(partition_key,chain_sequence)',
      partition_name || '_chain_uq',
      partition_name
    );
  END LOOP;
END
$partitions$;

CREATE INDEX audit_events_cursor_idx
  ON audit.events(occurred_at DESC,id DESC);
CREATE INDEX audit_events_actor_idx
  ON audit.events(actor_person_id,occurred_at DESC,id DESC)
  WHERE actor_person_id IS NOT NULL;
CREATE INDEX audit_events_action_idx
  ON audit.events(action_code,occurred_at DESC,id DESC);
CREATE INDEX audit_events_resource_idx
  ON audit.events(resource_type,resource_id,occurred_at DESC,id DESC)
  WHERE resource_id IS NOT NULL;
CREATE INDEX audit_events_facility_idx
  ON audit.events(facility_id,occurred_at DESC,id DESC)
  WHERE facility_id IS NOT NULL;
CREATE INDEX audit_events_patient_idx
  ON audit.events(patient_id,occurred_at DESC,id DESC)
  WHERE patient_id IS NOT NULL;
CREATE INDEX audit_events_outcome_idx
  ON audit.events(outcome,occurred_at DESC,id DESC);

CREATE TABLE audit.signature_evidence (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  resource_type text NOT NULL CHECK (
    pg_catalog.octet_length(resource_type) BETWEEN 2 AND 64
    AND resource_type ~ '^[a-z][a-z0-9._-]*$'
  ),
  resource_id uuid NOT NULL,
  resource_version integer NOT NULL CHECK (resource_version > 0),
  signer_person_id uuid NOT NULL REFERENCES identity.people(id),
  signer_role text NOT NULL CHECK (signer_role IN (
    'super_admin','support_admin','medical_reviewer','facility_approver','finance_reviewer'
  )),
  decision text NOT NULL CHECK (decision IN ('approved','rejected')),
  artifact_digest bytea NOT NULL CHECK (pg_catalog.octet_length(artifact_digest) = 32),
  signed_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  audit_event_id uuid NOT NULL,
  audit_event_occurred_at timestamptz NOT NULL,
  UNIQUE (resource_type,resource_id,resource_version,signer_role),
  FOREIGN KEY (audit_event_occurred_at,audit_event_id)
    REFERENCES audit.events(occurred_at,id)
);

CREATE INDEX audit_signature_event_fk_idx
  ON audit.signature_evidence(audit_event_occurred_at,audit_event_id);
CREATE INDEX audit_signature_signer_idx
  ON audit.signature_evidence(signer_person_id,signed_at DESC,id);

CREATE TABLE audit.export_batches (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  requested_by_person_id uuid NOT NULL REFERENCES identity.people(id),
  purpose_code text NOT NULL CHECK (
    pg_catalog.octet_length(purpose_code) BETWEEN 2 AND 64
    AND purpose_code ~ '^[a-z][a-z0-9._-]*$'
  ),
  partition_start date NOT NULL,
  partition_end_exclusive date NOT NULL,
  status text NOT NULL CHECK (status IN ('queued','claimed','retryable','dead_letter','proven')),
  object_key text CHECK (
    object_key IS NULL OR (
      pg_catalog.octet_length(object_key) BETWEEN 8 AND 255
      AND object_key ~ '^[a-z0-9][a-z0-9/_.-]*$'
    )
  ),
  object_digest bytea CHECK (
    object_digest IS NULL OR pg_catalog.octet_length(object_digest) = 32
  ),
  retention_proof jsonb,
  exported_at timestamptz,
  failure_code text CHECK (
    failure_code IS NULL OR (
      pg_catalog.octet_length(failure_code) BETWEEN 2 AND 64
      AND failure_code ~ '^[a-z][a-z0-9._-]*$'
    )
  ),
  lease_owner text CHECK (
    lease_owner IS NULL OR (
      pg_catalog.octet_length(lease_owner) BETWEEN 8 AND 64
      AND lease_owner ~ '^[a-z0-9][a-z0-9._-]*$'
    )
  ),
  lease_expires_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  CHECK (partition_start < partition_end_exclusive),
  CHECK (partition_start = pg_catalog.date_trunc('month', partition_start)::date),
  CHECK (partition_end_exclusive = pg_catalog.date_trunc('month', partition_end_exclusive)::date),
  CHECK (
    partition_end_exclusive
      <= pg_catalog.date_trunc('month', created_at AT TIME ZONE 'UTC')::date
  ),
  CHECK (updated_at >= created_at),
  CHECK (
    retention_proof IS NULL OR (
      pg_catalog.jsonb_typeof(retention_proof) = 'object'
      AND retention_proof ?& ARRAY['proof_version','proof_class','verified_at']
      AND retention_proof - ARRAY['proof_version','proof_class','verified_at'] = '{}'::jsonb
      AND retention_proof->'proof_version' = '1'::jsonb
      AND retention_proof->>'proof_class' = 'synthetic_write_once'
      AND retention_proof->>'verified_at'
        ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?Z$'
    )
  ),
  CHECK (
    (status = 'queued'
      AND object_key IS NULL AND object_digest IS NULL AND retention_proof IS NULL
      AND exported_at IS NULL AND failure_code IS NULL
      AND lease_owner IS NULL AND lease_expires_at IS NULL)
    OR
    (status = 'claimed'
      AND object_key IS NOT NULL AND object_digest IS NULL AND retention_proof IS NULL
      AND exported_at IS NULL AND failure_code IS NULL
      AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR
    (status = 'retryable'
      AND object_key IS NOT NULL AND object_digest IS NULL AND retention_proof IS NULL
      AND exported_at IS NULL AND failure_code IS NOT NULL
      AND lease_owner IS NULL AND lease_expires_at IS NULL)
    OR
    (status = 'dead_letter'
      AND object_key IS NOT NULL AND object_digest IS NULL AND retention_proof IS NULL
      AND exported_at IS NULL AND failure_code IS NOT NULL
      AND lease_owner IS NULL AND lease_expires_at IS NULL)
    OR
    (status = 'proven'
      AND object_key IS NOT NULL AND object_digest IS NOT NULL AND retention_proof IS NOT NULL
      AND exported_at IS NOT NULL AND failure_code IS NULL
      AND lease_owner IS NULL AND lease_expires_at IS NULL)
  )
);

CREATE UNIQUE INDEX audit_export_object_range_uq
  ON audit.export_batches(partition_start,partition_end_exclusive,object_key)
  WHERE object_key IS NOT NULL;
CREATE INDEX audit_export_claim_idx
  ON audit.export_batches(status,lease_expires_at,created_at,id);
CREATE INDEX audit_export_requester_idx
  ON audit.export_batches(requested_by_person_id,created_at DESC,id);

COMMENT ON TABLE audit.events IS
  'retention_class=SECURITY_AUDIT; statutory duration/action OPEN-LEGAL-002; append-only hash-chain evidence; database volume and backup encryption required';
COMMENT ON TABLE audit.signature_evidence IS
  'retention_class=SECURITY_AUDIT; statutory duration/action OPEN-LEGAL-002; append-only digest evidence; plaintext signature material prohibited; database volume and backup encryption required';
COMMENT ON TABLE audit.export_batches IS
  'retention_class=SECURITY_AUDIT; statutory duration/action OPEN-LEGAL-002; immutable request and terminal proof; database volume and backup encryption required';
COMMENT ON COLUMN audit.export_batches.object_key IS
  'Non-semantic private-object reference only; encrypted write-once object required; credentials and signed URLs prohibited.';
COMMENT ON COLUMN audit.export_batches.retention_proof IS
  'Closed synthetic write-once proof only; no production WORM compliance claim.';

CREATE OR REPLACE FUNCTION audit.reject_append_only_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
BEGIN
  RAISE EXCEPTION 'F008_APPEND_ONLY_%', TG_TABLE_NAME
    USING ERRCODE = '55000';
END
$function$;

CREATE TRIGGER audit_events_append_only_v1
BEFORE UPDATE OR DELETE ON audit.events
FOR EACH ROW EXECUTE FUNCTION audit.reject_append_only_v1();

CREATE TRIGGER audit_signature_evidence_append_only_v1
BEFORE UPDATE OR DELETE ON audit.signature_evidence
FOR EACH ROW EXECUTE FUNCTION audit.reject_append_only_v1();

CREATE OR REPLACE FUNCTION audit.guard_export_batch_mutation_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'F008_EXPORT_DELETE_DENIED' USING ERRCODE = '55000';
  END IF;

  IF OLD.status = 'proven' THEN
    RAISE EXCEPTION 'F008_EXPORT_PROOF_IMMUTABLE' USING ERRCODE = '55000';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.requested_by_person_id IS DISTINCT FROM OLD.requested_by_person_id
     OR NEW.purpose_code IS DISTINCT FROM OLD.purpose_code
     OR NEW.partition_start IS DISTINCT FROM OLD.partition_start
     OR NEW.partition_end_exclusive IS DISTINCT FROM OLD.partition_end_exclusive
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR (OLD.object_key IS NOT NULL AND NEW.object_key IS DISTINCT FROM OLD.object_key)
     OR (OLD.object_digest IS NOT NULL AND NEW.object_digest IS DISTINCT FROM OLD.object_digest)
     OR (OLD.retention_proof IS NOT NULL AND NEW.retention_proof IS DISTINCT FROM OLD.retention_proof)
     OR (OLD.exported_at IS NOT NULL AND NEW.exported_at IS DISTINCT FROM OLD.exported_at) THEN
    RAISE EXCEPTION 'F008_EXPORT_ORIGINAL_IMMUTABLE' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END
$function$;

CREATE TRIGGER audit_export_batches_mutation_guard_v1
BEFORE UPDATE OR DELETE ON audit.export_batches
FOR EACH ROW EXECUTE FUNCTION audit.guard_export_batch_mutation_v1();

CREATE OR REPLACE FUNCTION audit.sha256_v1(p_payload bytea)
RETURNS bytea
LANGUAGE plpgsql
STABLE
STRICT
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
DECLARE
  extension_schema name;
  payload_digest bytea;
BEGIN
  SELECT namespace.nspname
  INTO extension_schema
  FROM pg_catalog.pg_extension AS extension
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = extension.extnamespace
  WHERE extension.extname = 'pgcrypto';

  IF extension_schema IS NULL THEN
    RAISE EXCEPTION 'F008_PGCRYPTO_UNAVAILABLE' USING ERRCODE = '55000';
  END IF;

  EXECUTE pg_catalog.format(
    'SELECT %I.digest($1,''sha256'')',
    extension_schema
  ) INTO payload_digest USING p_payload;

  RETURN payload_digest;
END
$function$;

CREATE OR REPLACE FUNCTION audit.canonical_event_v1(
  p_occurred_at timestamptz,
  p_partition_key date,
  p_chain_sequence bigint,
  p_request_id uuid,
  p_trace_id text,
  p_actor_user_id uuid,
  p_actor_person_id uuid,
  p_authentication_aal smallint,
  p_facility_id uuid,
  p_patient_id uuid,
  p_purpose_code text,
  p_action_code text,
  p_resource_type text,
  p_resource_id uuid,
  p_resource_version integer,
  p_outcome text,
  p_reason_code text,
  p_source_ip_prefix inet,
  p_user_agent_class text,
  p_previous_hash bytea
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'action_code',p_action_code,
    'actor_person_id',p_actor_person_id,
    'actor_user_id',p_actor_user_id,
    'authentication_aal',p_authentication_aal,
    'chain_sequence',p_chain_sequence,
    'chain_version',1,
    'facility_id',p_facility_id,
    'occurred_at',pg_catalog.to_char(
      p_occurred_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'outcome',p_outcome,
    'partition_key',p_partition_key,
    'patient_id',p_patient_id,
    'previous_hash',pg_catalog.encode(p_previous_hash,'hex'),
    'purpose_code',p_purpose_code,
    'reason_code',p_reason_code,
    'request_id',p_request_id,
    'resource_id',p_resource_id,
    'resource_type',p_resource_type,
    'resource_version',p_resource_version,
    'source_ip_prefix',p_source_ip_prefix::text,
    'trace_id',p_trace_id,
    'user_agent_class',p_user_agent_class
  )::text
$function$;

CREATE OR REPLACE FUNCTION audit.append_event_v1(
  p_request_id uuid,
  p_trace_id text,
  p_action_code text,
  p_resource_type text,
  p_outcome text,
  p_actor_user_id uuid DEFAULT NULL,
  p_actor_person_id uuid DEFAULT NULL,
  p_authentication_aal smallint DEFAULT NULL,
  p_facility_id uuid DEFAULT NULL,
  p_patient_id uuid DEFAULT NULL,
  p_purpose_code text DEFAULT NULL,
  p_resource_id uuid DEFAULT NULL,
  p_resource_version integer DEFAULT NULL,
  p_reason_code text DEFAULT NULL,
  p_source_ip_prefix inet DEFAULT NULL,
  p_user_agent_class text DEFAULT NULL
)
RETURNS TABLE(event_id uuid,event_occurred_at timestamptz,event_hash bytea)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  occurred_at_value timestamptz := platform.context_now();
  partition_key_value date;
  partition_start_value timestamptz;
  partition_end_value timestamptz;
  chain_sequence_value bigint;
  previous_hash_value bytea;
  event_hash_value bytea;
  event_id_value uuid;
BEGIN
  partition_key_value := pg_catalog.date_trunc(
    'month', occurred_at_value AT TIME ZONE 'UTC'
  )::date;
  partition_start_value := partition_key_value::timestamp AT TIME ZONE 'UTC';
  partition_end_value := (partition_key_value + INTERVAL '1 month')::timestamp AT TIME ZONE 'UTC';

  PERFORM pg_catalog.pg_advisory_xact_lock(
    8008,
    partition_key_value - DATE '2000-01-01'
  );

  SELECT event.chain_sequence,event.event_hash
  INTO chain_sequence_value,previous_hash_value
  FROM audit.events AS event
  WHERE event.occurred_at >= partition_start_value
    AND event.occurred_at < partition_end_value
    AND event.partition_key = partition_key_value
  ORDER BY event.chain_sequence DESC
  LIMIT 1;

  IF chain_sequence_value IS NULL THEN
    chain_sequence_value := 1;
    previous_hash_value := pg_catalog.decode(pg_catalog.repeat('00',32),'hex');
  ELSE
    chain_sequence_value := chain_sequence_value + 1;
  END IF;

  event_hash_value := audit.sha256_v1(pg_catalog.convert_to(
    audit.canonical_event_v1(
      occurred_at_value,partition_key_value,chain_sequence_value,
      p_request_id,p_trace_id,p_actor_user_id,p_actor_person_id,
      p_authentication_aal,p_facility_id,p_patient_id,p_purpose_code,
      p_action_code,p_resource_type,p_resource_id,p_resource_version,
      p_outcome,p_reason_code,p_source_ip_prefix,p_user_agent_class,
      previous_hash_value
    ),
    'UTF8'
  ));

  INSERT INTO audit.events AS inserted (
    occurred_at,partition_key,chain_sequence,chain_version,request_id,trace_id,
    actor_user_id,actor_person_id,authentication_aal,facility_id,patient_id,
    purpose_code,action_code,resource_type,resource_id,resource_version,outcome,
    reason_code,source_ip_prefix,user_agent_class,previous_hash,event_hash
  ) VALUES (
    occurred_at_value,partition_key_value,chain_sequence_value,1,p_request_id,p_trace_id,
    p_actor_user_id,p_actor_person_id,p_authentication_aal,p_facility_id,p_patient_id,
    p_purpose_code,p_action_code,p_resource_type,p_resource_id,p_resource_version,p_outcome,
    p_reason_code,p_source_ip_prefix,p_user_agent_class,previous_hash_value,event_hash_value
  )
  RETURNING inserted.id INTO event_id_value;

  RETURN QUERY SELECT event_id_value,occurred_at_value,event_hash_value;
END
$function$;

CREATE OR REPLACE FUNCTION audit.verify_event_chain_v1(p_partition_key date)
RETURNS TABLE(
  valid boolean,
  checked_count bigint,
  first_invalid_sequence bigint,
  failure_code text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  event_row record;
  expected_sequence bigint := 1;
  expected_previous_hash bytea := pg_catalog.decode(pg_catalog.repeat('00',32),'hex');
  expected_event_hash bytea;
  partition_start_value timestamptz;
  partition_end_value timestamptz;
BEGIN
  IF p_partition_key IS NULL
     OR p_partition_key <> pg_catalog.date_trunc('month',p_partition_key)::date THEN
    RAISE EXCEPTION 'F008_PARTITION_KEY_INVALID' USING ERRCODE = '22023';
  END IF;

  valid := false;
  checked_count := 0;
  first_invalid_sequence := NULL;
  failure_code := NULL;
  partition_start_value := p_partition_key::timestamp AT TIME ZONE 'UTC';
  partition_end_value := (p_partition_key + INTERVAL '1 month')::timestamp AT TIME ZONE 'UTC';

  FOR event_row IN
    SELECT event.*
    FROM audit.events AS event
    WHERE event.occurred_at >= partition_start_value
      AND event.occurred_at < partition_end_value
    ORDER BY event.chain_sequence,event.occurred_at,event.id
  LOOP
    checked_count := checked_count + 1;

    IF event_row.partition_key <> p_partition_key THEN
      first_invalid_sequence := event_row.chain_sequence;
      failure_code := 'partition_mismatch';
      RETURN NEXT;
      RETURN;
    END IF;

    IF event_row.chain_version <> 1 THEN
      first_invalid_sequence := event_row.chain_sequence;
      failure_code := 'unsupported_chain_version';
      RETURN NEXT;
      RETURN;
    END IF;

    IF event_row.chain_sequence <> expected_sequence THEN
      first_invalid_sequence := event_row.chain_sequence;
      failure_code := 'sequence_gap';
      RETURN NEXT;
      RETURN;
    END IF;

    IF event_row.previous_hash <> expected_previous_hash THEN
      first_invalid_sequence := event_row.chain_sequence;
      failure_code := 'previous_hash_mismatch';
      RETURN NEXT;
      RETURN;
    END IF;

    expected_event_hash := audit.sha256_v1(pg_catalog.convert_to(
      audit.canonical_event_v1(
        event_row.occurred_at,event_row.partition_key,event_row.chain_sequence,
        event_row.request_id,event_row.trace_id,event_row.actor_user_id,
        event_row.actor_person_id,event_row.authentication_aal,event_row.facility_id,
        event_row.patient_id,event_row.purpose_code,event_row.action_code,
        event_row.resource_type,event_row.resource_id,event_row.resource_version,
        event_row.outcome,event_row.reason_code,event_row.source_ip_prefix,
        event_row.user_agent_class,event_row.previous_hash
      ),
      'UTF8'
    ));

    IF event_row.event_hash <> expected_event_hash THEN
      first_invalid_sequence := event_row.chain_sequence;
      failure_code := 'event_hash_mismatch';
      RETURN NEXT;
      RETURN;
    END IF;

    expected_previous_hash := event_row.event_hash;
    expected_sequence := expected_sequence + 1;
  END LOOP;

  valid := true;
  RETURN NEXT;
END
$function$;

REVOKE ALL ON FUNCTION audit.reject_append_only_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION audit.guard_export_batch_mutation_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION audit.sha256_v1(bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION audit.canonical_event_v1(
  timestamptz,date,bigint,uuid,text,uuid,uuid,smallint,uuid,uuid,text,text,text,
  uuid,integer,text,text,inet,text,bytea
) FROM PUBLIC;
REVOKE ALL ON FUNCTION audit.append_event_v1(
  uuid,text,text,text,text,uuid,uuid,smallint,uuid,uuid,text,uuid,integer,text,inet,text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION audit.verify_event_chain_v1(date) FROM PUBLIC;

COMMIT;
