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
      DATE '2026-08-01',
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
CREATE INDEX audit_events_id_idx
  ON audit.events(id);
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

  IF pg_catalog.to_regclass(
       'audit.events_' || pg_catalog.to_char(partition_key_value,'YYYY_MM')
     ) IS NULL THEN
    BEGIN
      EXECUTE pg_catalog.format(
        'CREATE TABLE audit.%I PARTITION OF audit.events FOR VALUES FROM (%L) TO (%L)',
        'events_' || pg_catalog.to_char(partition_key_value,'YYYY_MM'),
        partition_start_value,
        partition_end_value
      );
      EXECUTE pg_catalog.format(
        'ALTER TABLE audit.%I ENABLE ROW LEVEL SECURITY',
        'events_' || pg_catalog.to_char(partition_key_value,'YYYY_MM')
      );
      EXECUTE pg_catalog.format(
        'ALTER TABLE audit.%I FORCE ROW LEVEL SECURITY',
        'events_' || pg_catalog.to_char(partition_key_value,'YYYY_MM')
      );
      EXECUTE pg_catalog.format(
        'CREATE UNIQUE INDEX %I ON audit.%I(partition_key,chain_sequence)',
        'events_' || pg_catalog.to_char(partition_key_value,'YYYY_MM') || '_chain_uq',
        'events_' || pg_catalog.to_char(partition_key_value,'YYYY_MM')
      );
    EXCEPTION WHEN duplicate_table THEN
      NULL;
    END;
  END IF;

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

-- Narrow compatibility boundaries for approved Feature 004/005 effects.
-- They expose neither the audit table nor the generic append primitive.
CREATE OR REPLACE FUNCTION platform.append_family_mutation_audit_v1(
  p_request_id uuid,p_action_code text,p_actor_person_id uuid,p_patient_id uuid,
  p_resource_id uuid,p_resource_version integer
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $function$
BEGIN
  IF session_user <> 'shifaa_api'
     OR platform.context_person_id() IS DISTINCT FROM p_actor_person_id
     OR p_request_id IS NULL OR p_patient_id IS NULL OR p_resource_id IS NULL
     OR p_resource_version IS NULL OR p_resource_version < 1
     OR p_action_code NOT IN (
       'relationship.guardianship.created','relationship.guardianship.approved',
       'relationship.guardianship.active',
       'relationship.guardianship.rejected','relationship.guardianship.revoked',
       'relationship.delegation.created',
       'relationship.delegation.accepted','relationship.delegation.updated',
       'relationship.delegation.revoked','emergency_contact.created',
       'emergency_contact.confirmed','emergency_contact.declined',
       'emergency_contact.revoked'
     ) THEN
    RAISE EXCEPTION 'F008_FAMILY_MUTATION_AUDIT_DENIED' USING ERRCODE = '42501';
  END IF;
  PERFORM audit.append_event_v1(
    p_request_id,p_request_id::text,p_action_code,'family-care','success',
    p_actor_person_id => p_actor_person_id,
    p_authentication_aal => nullif(platform.context_aal(),0)::smallint,
    p_patient_id => p_patient_id,p_purpose_code => (platform.context_purposes())[1],
    p_resource_id => p_resource_id,p_resource_version => p_resource_version,
    p_user_agent_class => 'web'
  );
END
$function$;

CREATE OR REPLACE FUNCTION platform.append_privacy_effect_audit_v1(
  p_request_id uuid,p_action_code text,p_actor_person_id uuid,
  p_resource_id uuid,p_resource_version integer
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $function$
BEGIN
  IF session_user <> 'shifaa_api'
     OR platform.context_person_id() IS DISTINCT FROM p_actor_person_id
     OR p_request_id IS NULL OR p_resource_id IS NULL
     OR p_resource_version IS NULL OR p_resource_version < 1
     OR p_action_code NOT IN (
       'privacy.dsr.submitted','privacy.dsr.identity_required',
       'privacy.dsr.export_consumed','privacy.dsr.status_changed',
       'notification.template.drafted','notification.template.published',
       'notification.delivery.replay_requested'
     ) THEN
    RAISE EXCEPTION 'F008_PRIVACY_AUDIT_DENIED' USING ERRCODE = '42501';
  END IF;
  PERFORM audit.append_event_v1(
    p_request_id,p_request_id::text,p_action_code,'privacy-dsr-notifications','success',
    p_actor_person_id => p_actor_person_id,
    p_authentication_aal => nullif(platform.context_aal(),0)::smallint,
    p_purpose_code => (platform.context_purposes())[1],p_resource_id => p_resource_id,
    p_resource_version => p_resource_version,p_user_agent_class => 'web'
  );
END
$function$;

CREATE OR REPLACE FUNCTION platform.append_family_invitation_audit_v1(
  p_request_id uuid,p_action_code text,p_patient_id uuid,p_resource_id uuid
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE
  resource_version_value integer;
BEGIN
  IF session_user <> 'shifaa_api' OR p_request_id IS NULL OR p_patient_id IS NULL
     OR p_resource_id IS NULL
     OR p_action_code NOT IN ('emergency_contact.confirmed','emergency_contact.declined') THEN
    RAISE EXCEPTION 'F008_FAMILY_INVITATION_AUDIT_DENIED' USING ERRCODE = '42501';
  END IF;
  SELECT contact.version INTO resource_version_value
  FROM identity.emergency_contacts AS contact
  WHERE contact.id = p_resource_id AND contact.subject_patient_id = p_patient_id
    AND contact.status = pg_catalog.substring(
      p_action_code,pg_catalog.length('emergency_contact.') + 1
    );
  IF resource_version_value IS NULL THEN
    RAISE EXCEPTION 'F008_FAMILY_INVITATION_AUDIT_RESOURCE_DENIED' USING ERRCODE = '42501';
  END IF;
  PERFORM audit.append_event_v1(
    p_request_id,p_request_id::text,p_action_code,'family-care','success',
    p_patient_id => p_patient_id,p_resource_id => p_resource_id,
    p_resource_version => resource_version_value,p_user_agent_class => 'web'
  );
END
$function$;

CREATE OR REPLACE FUNCTION platform.append_notification_receipt_audit_v1(
  p_request_id uuid,p_resource_id uuid
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $function$
BEGIN
  IF session_user <> 'shifaa_api' OR p_request_id IS NULL OR p_resource_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM platform.provider_callback_receipts AS receipt
       WHERE receipt.id = p_resource_id
     ) THEN
    RAISE EXCEPTION 'F008_NOTIFICATION_RECEIPT_AUDIT_DENIED' USING ERRCODE = '42501';
  END IF;
  PERFORM audit.append_event_v1(
    p_request_id,p_request_id::text,'notification.delivery.receipt_recorded',
    'provider-receipt','success',p_resource_id => p_resource_id,
    p_resource_version => 1,p_user_agent_class => 'service'
  );
END
$function$;

-- Preserve the existing public emergency-share operation after replacing the
-- empty legacy audit table. Its audit writes now enter the canonical chain and
-- deliberately omit the former free-form metadata payload.
CREATE OR REPLACE FUNCTION platform.consume_emergency_share(
  p_token_digest bytea,p_request_id uuid
) RETURNS TABLE(
  outcome text,denial_code text,share_id uuid,incident_id uuid,expires_at timestamptz,
  scope_fields text[],blood_group text,unavailable_fields text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  link platform.emergency_share_links;
  incident platform.sos_incidents;
  patient_blood text;
  available text[] := ARRAY[]::text[];
  unavailable text[];
BEGIN
  IF platform.context_environment() NOT IN ('local','ci')
     OR NOT platform.feature_enabled('sos.share',platform.context_environment()) THEN
    PERFORM audit.append_event_v1(
      p_request_id,p_request_id::text,'sos.share.view','emergency-share','denied',
      p_reason_code => 'share-disabled',p_user_agent_class => 'web'
    );
    RETURN QUERY SELECT 'denied'::text,'emergency-share-expired'::text,NULL::uuid,NULL::uuid,NULL::timestamptz,NULL::text[],NULL::text,NULL::text[];
    RETURN;
  END IF;
  IF pg_catalog.octet_length(p_token_digest) = 32 THEN
    SELECT * INTO link
    FROM platform.emergency_share_links AS candidate
    WHERE candidate.token_digest = p_token_digest
    FOR UPDATE;
  END IF;
  IF link.id IS NULL OR link.used_at IS NOT NULL OR link.revoked_at IS NOT NULL
     OR link.expires_at <= pg_catalog.statement_timestamp() THEN
    PERFORM audit.append_event_v1(
      p_request_id,p_request_id::text,'sos.share.view','emergency-share','denied',
      p_reason_code => 'emergency-share-expired',p_user_agent_class => 'web'
    );
    RETURN QUERY SELECT 'denied'::text,'emergency-share-expired'::text,NULL::uuid,NULL::uuid,NULL::timestamptz,NULL::text[],NULL::text,NULL::text[];
    RETURN;
  END IF;
  SELECT * INTO incident
  FROM platform.sos_incidents AS candidate
  WHERE candidate.id = link.incident_id;
  IF incident.id IS NULL OR incident.status = 'closed' THEN
    PERFORM audit.append_event_v1(
      p_request_id,p_request_id::text,'sos.share.view','emergency-share','denied',
      p_patient_id => incident.patient_id,p_resource_id => link.id,
      p_reason_code => 'incident-closed',p_user_agent_class => 'web'
    );
    RETURN QUERY SELECT 'denied'::text,'emergency-share-expired'::text,NULL::uuid,NULL::uuid,NULL::timestamptz,NULL::text[],NULL::text,NULL::text[];
    RETURN;
  END IF;
  SELECT patient.blood_group INTO patient_blood
  FROM identity.patients AS patient
  WHERE patient.id = incident.patient_id;
  IF 'blood_group' = ANY(link.scope_fields) AND patient_blood IS NOT NULL THEN
    available := ARRAY['blood_group'];
  END IF;
  SELECT ARRAY(
    SELECT field
    FROM pg_catalog.unnest(link.scope_fields) AS field
    WHERE NOT field = ANY(available)
    ORDER BY field
  ) INTO unavailable;
  UPDATE platform.emergency_share_links
  SET access_count = 1,used_at = pg_catalog.statement_timestamp()
  WHERE id = link.id;
  PERFORM audit.append_event_v1(
    p_request_id,p_request_id::text,'sos.share.view','emergency-share','success',
    p_patient_id => incident.patient_id,p_resource_id => link.id,
    p_user_agent_class => 'web'
  );
  RETURN QUERY SELECT
    'success'::text,NULL::text,link.id,link.incident_id,link.expires_at,link.scope_fields,
    CASE WHEN 'blood_group' = ANY(available) THEN patient_blood ELSE NULL END,unavailable;
END
$function$;

-- Feature 006 mutations previously wrote the legacy audit shape directly.
-- Keep those already-approved operations compatible without granting the API
-- either direct audit-table access or the generic canonical append primitive.
CREATE OR REPLACE FUNCTION platform.append_discovery_sos_effect_v1(
  p_request_id uuid,
  p_action_code text,
  p_resource_id uuid,
  p_resource_version integer,
  p_facility_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  actor_person_id_value uuid := platform.context_person_id();
  patient_id_value uuid;
  matched_facility_id_value uuid;
  incident_status_value text;
BEGIN
  IF SESSION_USER <> 'shifaa_api'
     OR actor_person_id_value IS NULL
     OR p_request_id IS NULL
     OR p_resource_id IS NULL
     OR p_resource_version IS NULL
     OR p_resource_version < 1 THEN
    RAISE EXCEPTION 'F008_DISCOVERY_SOS_AUDIT_CONTEXT_DENIED'
      USING ERRCODE = '42501';
  END IF;

  IF p_action_code IN (
    'sos.incident.created','sos.incident.accepted','sos.incident.closed'
  ) THEN
    SELECT incident.patient_id,incident.matched_facility_id,incident.status
    INTO patient_id_value,matched_facility_id_value,incident_status_value
    FROM platform.sos_incidents AS incident
    WHERE incident.id = p_resource_id
      AND incident.version = p_resource_version;
  ELSIF p_action_code IN ('sos.share.created','sos.share.revoked') THEN
    SELECT incident.patient_id,incident.matched_facility_id,incident.status
    INTO patient_id_value,matched_facility_id_value,incident_status_value
    FROM platform.emergency_share_links AS share
    JOIN platform.sos_incidents AS incident ON incident.id = share.incident_id
    WHERE share.id = p_resource_id
      AND share.version = p_resource_version
      AND (
        (p_action_code = 'sos.share.created' AND share.revoked_at IS NULL)
        OR (p_action_code = 'sos.share.revoked' AND share.revoked_at IS NOT NULL)
      );
  ELSE
    RAISE EXCEPTION 'F008_DISCOVERY_SOS_AUDIT_ACTION_DENIED'
      USING ERRCODE = '42501';
  END IF;

  IF patient_id_value IS NULL
     OR (p_facility_id IS NOT NULL AND p_facility_id IS DISTINCT FROM matched_facility_id_value)
     OR (p_action_code = 'sos.incident.accepted' AND incident_status_value <> 'accepted')
     OR (p_action_code = 'sos.incident.closed' AND incident_status_value <> 'closed')
     OR (
       p_action_code = 'sos.incident.created'
       AND (
         patient_id_value IS DISTINCT FROM platform.context_patient_id()
         OR NOT platform.person_can_activate_sos(patient_id_value,actor_person_id_value)
       )
     )
     OR (
       p_action_code IN ('sos.share.created','sos.share.revoked')
       AND (
         patient_id_value IS DISTINCT FROM platform.context_patient_id()
         OR NOT platform.person_can_share_sos(patient_id_value,actor_person_id_value)
       )
     )
     OR (
       p_action_code = 'sos.incident.accepted'
       AND NOT platform.hospital_member_authorized(
         matched_facility_id_value,actor_person_id_value,true
       )
     )
     OR (
       p_action_code = 'sos.incident.closed'
       AND NOT (
         (
           patient_id_value = platform.context_patient_id()
           AND platform.person_can_activate_sos(patient_id_value,actor_person_id_value)
         )
         OR platform.hospital_member_authorized(
           matched_facility_id_value,actor_person_id_value,true
         )
       )
     ) THEN
    RAISE EXCEPTION 'F008_DISCOVERY_SOS_AUDIT_RESOURCE_DENIED'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO platform.outbox_events(
    aggregate_type,aggregate_id,aggregate_version,event_type,payload
  ) VALUES (
    'discovery-sos',p_resource_id,p_resource_version,p_action_code,
    pg_catalog.jsonb_build_object(
      'request_id',p_request_id,
      'resource_id',p_resource_id
    )
  );

  -- Keep the globally serialized chain append as the final database effect in
  -- this function so unrelated outbox work never extends the chain lock.
  PERFORM audit.append_event_v1(
    p_request_id,
    p_request_id::text,
    p_action_code,
    'discovery-sos',
    'success',
    p_actor_person_id => actor_person_id_value,
    p_authentication_aal => platform.context_aal()::smallint,
    p_facility_id => p_facility_id,
    p_patient_id => patient_id_value,
    p_purpose_code => (platform.context_purposes())[1],
    p_resource_id => p_resource_id,
    p_resource_version => p_resource_version,
    p_user_agent_class => 'web'
  );
END
$function$;

-- Features 001 and 007 previously wrote the legacy audit shape directly.
-- Preserve only their approved identity actions through a narrow boundary;
-- callers never receive direct table access or the generic append primitive.
CREATE OR REPLACE FUNCTION platform.append_identity_audit_effect_v1(
  p_request_id uuid,
  p_action_code text,
  p_resource_type text,
  p_resource_id uuid DEFAULT NULL,
  p_resource_version integer DEFAULT NULL,
  p_outcome text DEFAULT 'allowed'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  actor_person_id_value uuid := platform.context_person_id();
  canonical_outcome_value text;
  purpose_code_value text;
BEGIN
  IF SESSION_USER <> 'shifaa_api'
     OR actor_person_id_value IS NULL
     OR p_request_id IS NULL
     OR p_action_code IS NULL
     OR p_resource_type IS NULL THEN
    RAISE EXCEPTION 'F008_IDENTITY_AUDIT_CONTEXT_DENIED'
      USING ERRCODE = '42501';
  END IF;

  IF NOT (
    (p_action_code = 'identity.registration.created' AND p_resource_type = 'person' AND p_resource_id IS NOT NULL)
    OR (p_action_code = 'auth.otp.verified' AND p_resource_type = 'session' AND p_resource_id IS NULL)
    OR (p_action_code = 'identity.profile.updated' AND p_resource_type = 'person' AND p_resource_id IS NOT NULL)
    OR (p_action_code IN ('identity.proof.created','identity.review.decided','identity.provider.callback') AND p_resource_type = 'verification_case' AND p_resource_id IS NOT NULL)
    OR (p_action_code IN ('consent.decision.recorded','consent.withdrawn') AND p_resource_type = 'consent' AND p_resource_id IS NOT NULL)
    OR (p_action_code IN ('identity.session.refreshed','identity.session.logged_out','identity.factor.enrollment_started','identity.factor.verified') AND p_resource_type = 'native-session' AND p_resource_id IS NULL)
    OR (p_action_code = 'identity.factor.removed' AND p_resource_type = 'native-factor' AND p_resource_id IS NULL)
    OR (p_action_code IN ('identity.recovery.enrollment_completed','identity.recovery.completed','identity.transition.submitted','identity.transition.decided') AND p_resource_type = 'continuity-case' AND p_resource_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'F008_IDENTITY_AUDIT_ACTION_DENIED'
      USING ERRCODE = '42501';
  END IF;

  canonical_outcome_value := CASE p_outcome
    WHEN 'allowed' THEN 'success'
    WHEN 'succeeded' THEN 'success'
    WHEN 'denied' THEN 'denied'
    WHEN 'failed' THEN 'failed'
    ELSE NULL
  END;
  IF canonical_outcome_value IS NULL THEN
    RAISE EXCEPTION 'F008_IDENTITY_AUDIT_OUTCOME_DENIED'
      USING ERRCODE = '42501';
  END IF;

  IF p_action_code IN ('consent.decision.recorded','consent.withdrawn') THEN
    SELECT consent_row.purpose_code
    INTO purpose_code_value
    FROM consent.records AS consent_row
    WHERE consent_row.id = p_resource_id
      AND consent_row.person_id = actor_person_id_value;

    IF purpose_code_value IS NULL THEN
      RAISE EXCEPTION 'F008_IDENTITY_AUDIT_RESOURCE_DENIED'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  PERFORM audit.append_event_v1(
    p_request_id,p_request_id::text,p_action_code,p_resource_type,canonical_outcome_value,
    p_actor_person_id => actor_person_id_value,
    p_authentication_aal => CASE
      WHEN platform.context_aal() = 0 THEN NULL
      ELSE platform.context_aal()::smallint
    END,
    p_purpose_code => purpose_code_value,
    p_resource_id => p_resource_id,
    p_resource_version => p_resource_version,
    p_user_agent_class => 'web'
  );
END
$function$;

-- Feature 003 facility-governance mutations previously wrote the retired
-- audit shape directly. Validate the persisted effect at a narrow boundary
-- and derive all integrity inputs before entering the canonical chain.
CREATE OR REPLACE FUNCTION platform.append_facility_governance_audit_v1(
  p_request_id uuid,
  p_action_code text,
  p_resource_id uuid,
  p_facility_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  actor_person_id_value uuid := platform.context_person_id();
  actor_role_value text := pg_catalog.current_setting('shifaa.actor_role',true);
  purpose_code_value text := (platform.context_purposes())[1];
  resource_version_value integer;
  resolved_facility_id_value uuid;
  effect_authorized boolean := false;
BEGIN
  IF SESSION_USER <> 'shifaa_api'
     OR actor_person_id_value IS NULL
     OR p_request_id IS NULL
     OR p_action_code IS NULL
     OR p_resource_id IS NULL THEN
    RAISE EXCEPTION 'F008_FACILITY_AUDIT_CONTEXT_DENIED'
      USING ERRCODE = '42501';
  END IF;

  IF p_action_code IN (
    'facility.created','facility.updated','facility.evidence_uploaded',
    'facility.submitted','facility.active','facility.rejected','facility.suspended'
  ) THEN
    SELECT facility.version,facility.id,
      CASE
        WHEN p_action_code = 'facility.created' THEN
          facility.created_by_person_id = actor_person_id_value
          AND facility.version = 1
          AND facility.facility_status = 'draft'
        WHEN p_action_code IN (
          'facility.updated','facility.evidence_uploaded','facility.submitted'
        ) THEN
          facility.created_by_person_id = actor_person_id_value
          AND (
            p_action_code <> 'facility.submitted'
            OR facility.facility_status = 'pending_review'
          )
        ELSE
          actor_role_value = 'ADM-FACILITY'
          AND platform.context_aal() = 2
          AND purpose_code_value = 'facility_approval'
          AND facility.created_by_person_id <> actor_person_id_value
          AND facility.facility_status = pg_catalog.substring(
            p_action_code,pg_catalog.length('facility.') + 1
          )
      END
    INTO resource_version_value,resolved_facility_id_value,effect_authorized
    FROM identity.facilities AS facility
    WHERE facility.id = p_resource_id;
  ELSIF p_action_code IN (
    'professional_license.created','professional_license.evidence_uploaded',
    'professional_license.verified','professional_license.rejected',
    'professional_license.suspended'
  ) THEN
    SELECT license.version,NULL::uuid,
      CASE
        WHEN p_action_code = 'professional_license.created' THEN
          license.person_id = actor_person_id_value
          AND license.version = 1
          AND license.status = 'pending'
        WHEN p_action_code = 'professional_license.evidence_uploaded' THEN
          license.person_id = actor_person_id_value
        ELSE
          actor_role_value = 'ADM-FACILITY'
          AND platform.context_aal() = 2
          AND purpose_code_value = 'professional_license_review'
          AND license.person_id <> actor_person_id_value
          AND license.status = pg_catalog.substring(
            p_action_code,pg_catalog.length('professional_license.') + 1
          )
      END
    INTO resource_version_value,resolved_facility_id_value,effect_authorized
    FROM identity.professional_licenses AS license
    WHERE license.id = p_resource_id;
  ELSIF p_action_code IN (
    'membership.invited','membership.accepted','membership.updated','membership.ended'
  ) THEN
    SELECT membership.version,membership.facility_id,
      CASE
        WHEN p_action_code = 'membership.accepted' THEN
          membership.person_id = actor_person_id_value
          AND membership.membership_status = 'active'
        ELSE
          facility.created_by_person_id = actor_person_id_value
          AND (
            p_action_code NOT IN ('membership.invited','membership.ended')
            OR membership.membership_status = CASE p_action_code
              WHEN 'membership.invited' THEN 'invited'
              ELSE 'ended'
            END
          )
      END
    INTO resource_version_value,resolved_facility_id_value,effect_authorized
    FROM identity.facility_memberships AS membership
    JOIN identity.facilities AS facility ON facility.id = membership.facility_id
    WHERE membership.id = p_resource_id;
  ELSIF p_action_code IN ('admin_role.grant_proposed','admin_role.grant_decided') THEN
    SELECT grant_row.version,NULL::uuid,
      actor_role_value = 'ADM-SUPER'
      AND platform.context_aal() = 2
      AND purpose_code_value = 'role_governance'
      AND CASE p_action_code
        WHEN 'admin_role.grant_proposed' THEN
          grant_row.proposed_by = actor_person_id_value
          AND grant_row.status = 'pending'
        ELSE
          grant_row.decided_by = actor_person_id_value
          AND grant_row.status IN ('active','rejected')
      END
    INTO resource_version_value,resolved_facility_id_value,effect_authorized
    FROM identity.admin_role_grants AS grant_row
    WHERE grant_row.id = p_resource_id;
  ELSIF p_action_code IN (
    'admin_role.revocation_proposed','admin_role.revocation_decided'
  ) THEN
    SELECT revocation.version,NULL::uuid,
      actor_role_value = 'ADM-SUPER'
      AND platform.context_aal() = 2
      AND purpose_code_value = 'role_governance'
      AND CASE p_action_code
        WHEN 'admin_role.revocation_proposed' THEN
          revocation.proposed_by = actor_person_id_value
          AND revocation.status = 'pending'
        ELSE
          revocation.decided_by = actor_person_id_value
          AND revocation.status IN ('approved','rejected')
      END
    INTO resource_version_value,resolved_facility_id_value,effect_authorized
    FROM identity.admin_role_revocation_requests AS revocation
    WHERE revocation.id = p_resource_id;
  ELSE
    RAISE EXCEPTION 'F008_FACILITY_AUDIT_ACTION_DENIED'
      USING ERRCODE = '42501';
  END IF;

  IF resource_version_value IS NULL
     OR p_facility_id IS DISTINCT FROM resolved_facility_id_value
     OR NOT coalesce(effect_authorized,false) THEN
    RAISE EXCEPTION 'F008_FACILITY_AUDIT_RESOURCE_DENIED'
      USING ERRCODE = '42501';
  END IF;

  PERFORM audit.append_event_v1(
    p_request_id,p_request_id::text,p_action_code,'facility-governance','success',
    p_actor_person_id => actor_person_id_value,
    p_authentication_aal => CASE
      WHEN platform.context_aal() = 0 THEN NULL
      ELSE platform.context_aal()::smallint
    END,
    p_facility_id => resolved_facility_id_value,
    p_purpose_code => purpose_code_value,
    p_resource_id => p_resource_id,
    p_resource_version => resource_version_value,
    p_user_agent_class => 'web'
  );
END
$function$;

-- Feature 004 dependent-transition reads record an authorization use after
-- inserting the immutable relationship-use row. Validate that exact effect
-- before appending it to the canonical chain.
CREATE OR REPLACE FUNCTION platform.append_family_authorization_audit_v1(
  p_request_id uuid,
  p_action_code text,
  p_patient_id uuid,
  p_relationship_id uuid,
  p_relationship_version integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  actor_person_id_value uuid := platform.context_person_id();
  purpose_code_value text;
BEGIN
  IF SESSION_USER <> 'shifaa_api'
     OR actor_person_id_value IS NULL
     OR p_request_id IS NULL
     OR p_patient_id IS NULL
     OR p_relationship_id IS NULL
     OR p_relationship_version IS NULL
     OR p_relationship_version < 1
     OR p_action_code NOT IN (
       'relationship.self.used','relationship.guardianship.used','relationship.delegation.used'
     ) THEN
    RAISE EXCEPTION 'F008_FAMILY_AUDIT_CONTEXT_DENIED'
      USING ERRCODE = '42501';
  END IF;

  SELECT authorization_use.purpose_code
  INTO purpose_code_value
  FROM identity.relationship_authorization_uses AS authorization_use
  JOIN identity.care_relationships AS relationship
    ON relationship.id = authorization_use.relationship_id
  WHERE authorization_use.request_id = p_request_id::text
    AND authorization_use.relationship_id = p_relationship_id
    AND authorization_use.subject_patient_id = p_patient_id
    AND authorization_use.actor_person_id = actor_person_id_value
    AND authorization_use.relationship_version = p_relationship_version
    AND authorization_use.outcome = 'allowed'
    AND p_action_code = 'relationship.' || relationship.relationship_type || '.used';

  IF purpose_code_value IS NULL THEN
    RAISE EXCEPTION 'F008_FAMILY_AUDIT_RESOURCE_DENIED'
      USING ERRCODE = '42501';
  END IF;

  PERFORM audit.append_event_v1(
    p_request_id,p_request_id::text,p_action_code,'family-care','success',
    p_actor_person_id => actor_person_id_value,
    p_authentication_aal => CASE
      WHEN platform.context_aal() = 0 THEN NULL
      ELSE platform.context_aal()::smallint
    END,
    p_patient_id => p_patient_id,
    p_purpose_code => purpose_code_value,
    p_resource_id => p_relationship_id,
    p_resource_version => p_relationship_version,
    p_user_agent_class => 'web'
  );
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

-- T009: independently killable synthetic graduation gates. The approved
-- aggregate policy is recorded, but its empty metric list activates nothing.
INSERT INTO platform.feature_flags(
  code,environment,enabled,constraints,approved_by_person_id
)
SELECT flag.code,environment.environment,flag.local_enabled,flag.constraints,NULL
FROM (VALUES
  (
    'admin.aggregates',
    false,
    pg_catalog.jsonb_build_object(
      'policyId','OPEN-PRIV-001',
      'policyVersion','1.0.0-approved',
      'packageSha256','38855c7319b6bcd06b491bf4213a277303a6d6e2c1ebe7499b65fdfa4ae15039',
      'minimumDistinctSubjects',11,
      'suppressedInclusive',pg_catalog.jsonb_build_array(0,10),
      'metrics','[]'::jsonb,
      'syntheticOnly',true
    )
  ),
  (
    'audit.read',
    true,
    '{"requiredRole":"super_admin","minimumAal":2,"requiredPurpose":"security.audit.review","syntheticOnly":true}'::jsonb
  ),
  (
    'audit.export',
    true,
    '{"requiredRole":"super_admin","minimumAal":2,"requiredPurpose":"security.audit.review","eventType":"audit.export.requested","maximumCompletedMonths":3,"syntheticOnly":true}'::jsonb
  ),
  (
    'health.exposure',
    true,
    '{"privateNetworkOnly":true,"serviceAuthRequired":true,"syntheticOnly":true}'::jsonb
  )
) AS flag(code,local_enabled,constraints)
CROSS JOIN (VALUES ('local'),('ci'),('production')) AS environment(environment)
ON CONFLICT(code,environment) DO UPDATE
SET enabled = EXCLUDED.enabled,
    constraints = EXCLUDED.constraints,
    approved_by_person_id = EXCLUDED.approved_by_person_id,
    version = platform.feature_flags.version + 1,
    updated_at = pg_catalog.statement_timestamp();

UPDATE platform.feature_flags
SET enabled = false,
    constraints = constraints || '{"productionGate":"disabled-pending-governance"}'::jsonb,
    version = version + 1,
    updated_at = pg_catalog.statement_timestamp()
WHERE code IN ('admin.aggregates','audit.read','audit.export','health.exposure')
  AND environment = 'production';

INSERT INTO consent.processing_inventory(
  process_code,owner_name,controller_name,processor_names,purposes,data_categories,
  systems,recipients,countries,retention_class,lawful_basis,approval_digest,status
) VALUES (
  'audit-evidence-export-synthetic',
  'SHIFAA Product Owner',
  'SHIFAA synthetic environment',
  ARRAY[]::text[],
  ARRAY['security.audit.review'],
  ARRAY['security_audit_metadata','export_integrity_evidence'],
  ARRAY['local-api','local-worker','local-postgres','local-write-once-simulator'],
  ARRAY['authorized-super-admin','internal-export-worker'],
  ARRAY['EG'],
  'SECURITY_AUDIT',
  'synthetic-engineering-only',
  '38855c7319b6bcd06b491bf4213a277303a6d6e2c1ebe7499b65fdfa4ae15039',
  'active'
)
ON CONFLICT(process_code) DO UPDATE
SET purposes = EXCLUDED.purposes,
    data_categories = EXCLUDED.data_categories,
    systems = EXCLUDED.systems,
    recipients = EXCLUDED.recipients,
    retention_class = EXCLUDED.retention_class,
    lawful_basis = EXCLUDED.lawful_basis,
    approval_digest = EXCLUDED.approval_digest,
    status = EXCLUDED.status,
    version = consent.processing_inventory.version + 1,
    updated_at = pg_catalog.statement_timestamp();

ALTER TABLE platform.outbox_events
  DROP CONSTRAINT IF EXISTS outbox_events_event_type_check;
ALTER TABLE platform.outbox_events
  ADD CONSTRAINT outbox_events_event_type_check CHECK(event_type IN (
    'identity.verification.changed','identity.manual_review.requested','consent.changed','facility.changed','professional_license.changed','membership.changed','admin_role.changed',
    'relationship.guardianship.changed','relationship.guardianship.created','relationship.guardianship.active','relationship.guardianship.rejected','relationship.guardianship.revoked',
    'relationship.delegation.changed','relationship.delegation.created','relationship.delegation.accepted','relationship.delegation.updated','relationship.delegation.revoked',
    'emergency_contact.changed','emergency_contact.created','emergency_contact.confirmed','emergency_contact.declined','emergency_contact.revoked',
    'sos.emergency_contact.requested','sos.emergency_contact.denied','sos.incident.created','sos.incident.accepted','sos.incident.closed','sos.share.created','sos.share.revoked','sos.share.viewed',
    'privacy.dsr.submitted','privacy.dsr.status_changed','privacy.dsr.export_ready','privacy.dsr.export_consumed','privacy.dsr.identity_required',
    'notification.template.drafted','notification.template.published','notification.delivery.requested','notification.delivery.receipt_recorded','notification.delivery.replay_requested',
    'identity.factor.changed','identity.recovery.completed','identity.transition.submitted','identity.transition.decided',
    'audit.export.requested'
  ));

DROP INDEX IF EXISTS platform.outbox_aggregate_version_uq;
CREATE UNIQUE INDEX outbox_aggregate_version_uq
  ON platform.outbox_events(aggregate_type,aggregate_id,aggregate_version)
  WHERE event_type IN (
    'privacy.dsr.submitted','privacy.dsr.status_changed','privacy.dsr.export_ready','privacy.dsr.export_consumed','privacy.dsr.identity_required',
    'notification.template.drafted','notification.template.published','notification.delivery.requested','notification.delivery.receipt_recorded','notification.delivery.replay_requested',
    'sos.incident.created','sos.incident.accepted','sos.incident.closed','sos.share.created','sos.share.revoked','sos.share.viewed','sos.emergency_contact.requested',
    'identity.factor.changed','identity.recovery.completed','identity.transition.submitted','identity.transition.decided',
    'audit.export.requested'
  );

INSERT INTO identity.role_permissions(
  role_code,action_code,resource_code,min_aal,purpose_code
) VALUES
  ('super_admin','getAdminSummary','admin_summary',1,NULL),
  ('support_admin','getAdminSummary','admin_summary',1,NULL),
  ('medical_reviewer','getAdminSummary','admin_summary',1,NULL),
  ('facility_approver','getAdminSummary','admin_summary',1,NULL),
  ('finance_reviewer','getAdminSummary','admin_summary',1,NULL),
  ('super_admin','listAuditEvents','audit_event',2,'security.audit.review'),
  ('super_admin','getAuditEvent','audit_event',2,'security.audit.review'),
  ('super_admin','createAuditExport','audit_export',2,'security.audit.review')
ON CONFLICT(role_code,action_code,resource_code) DO UPDATE
SET min_aal = EXCLUDED.min_aal,
    purpose_code = EXCLUDED.purpose_code;

-- T010: current database facts, not a claimed JWT role or DPO designation,
-- authorize general audit access.
CREATE OR REPLACE FUNCTION audit.current_super_admin_context_v1(p_required_purpose text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT
    session_user = 'shifaa_api'
    AND p_required_purpose = 'security.audit.review'
    AND platform.context_person_id() IS NOT NULL
    AND platform.context_aal() >= 2
    AND p_required_purpose = ANY(platform.context_purposes())
    AND EXISTS (
      SELECT 1
      FROM identity.admin_role_grants AS grant_row
      WHERE grant_row.person_id = platform.context_person_id()
        AND grant_row.role_code = 'super_admin'
        AND grant_row.status = 'active'
        AND grant_row.valid_from <= pg_catalog.statement_timestamp()
        AND (
          grant_row.valid_until IS NULL
          OR grant_row.valid_until > pg_catalog.statement_timestamp()
        )
    )
$function$;

CREATE OR REPLACE FUNCTION audit.current_admin_summary_context_v1()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT
    session_user = 'shifaa_api'
    AND platform.context_person_id() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM identity.admin_role_grants AS grant_row
      JOIN identity.role_permissions AS permission
        ON permission.role_code = grant_row.role_code
       AND permission.action_code = 'getAdminSummary'
       AND permission.resource_code = 'admin_summary'
      WHERE grant_row.person_id = platform.context_person_id()
        AND grant_row.status = 'active'
        AND grant_row.valid_from <= pg_catalog.statement_timestamp()
        AND (grant_row.valid_until IS NULL OR grant_row.valid_until > pg_catalog.statement_timestamp())
        AND platform.context_aal() >= permission.min_aal
    )
$function$;

-- Page and detail reads validate the immutable row plus both adjacent links.
-- Full-partition verification remains the authority for export and restore;
-- recomputing an entire completed partition for every bounded page would make
-- read latency grow linearly with retained history.
CREATE OR REPLACE FUNCTION audit.event_integrity_v1(
  p_occurred_at timestamptz,
  p_event_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT coalesce(
    event.partition_key = pg_catalog.date_trunc(
      'month',event.occurred_at AT TIME ZONE 'UTC'
    )::date
    AND event.chain_version = 1
    AND event.event_hash = audit.sha256_v1(pg_catalog.convert_to(
      audit.canonical_event_v1(
        event.occurred_at,event.partition_key,event.chain_sequence,
        event.request_id,event.trace_id,event.actor_user_id,event.actor_person_id,
        event.authentication_aal,event.facility_id,event.patient_id,event.purpose_code,
        event.action_code,event.resource_type,event.resource_id,event.resource_version,
        event.outcome,event.reason_code,event.source_ip_prefix,event.user_agent_class,
        event.previous_hash
      ),
      'UTF8'
    ))
    AND CASE
      WHEN event.chain_sequence = 1 THEN
        event.previous_hash = pg_catalog.decode(pg_catalog.repeat('00',32),'hex')
        AND previous.id IS NULL
      ELSE previous.event_hash = event.previous_hash
    END
    AND (following.id IS NULL OR following.previous_hash = event.event_hash),
    false
  )
  FROM audit.events AS event
  LEFT JOIN audit.events AS previous
    ON previous.partition_key = event.partition_key
   AND previous.chain_sequence = event.chain_sequence - 1
   AND previous.occurred_at >= event.partition_key::timestamp AT TIME ZONE 'UTC'
   AND previous.occurred_at < (event.partition_key + INTERVAL '1 month')::timestamp AT TIME ZONE 'UTC'
  LEFT JOIN audit.events AS following
    ON following.partition_key = event.partition_key
   AND following.chain_sequence = event.chain_sequence + 1
   AND following.occurred_at >= event.partition_key::timestamp AT TIME ZONE 'UTC'
   AND following.occurred_at < (event.partition_key + INTERVAL '1 month')::timestamp AT TIME ZONE 'UTC'
  WHERE event.occurred_at = p_occurred_at
    AND event.id = p_event_id
$function$;

CREATE OR REPLACE FUNCTION audit.read_events_v1(
  p_actor_person_id uuid,
  p_action_code text,
  p_resource_type text,
  p_resource_id uuid,
  p_time_from timestamptz,
  p_time_to timestamptz,
  p_outcome text,
  p_after_occurred_at timestamptz,
  p_after_event_id uuid,
  p_limit integer
)
RETURNS TABLE(
  event_id uuid,
  occurred_at timestamptz,
  request_id uuid,
  trace_id text,
  actor_person_id uuid,
  auth_aal smallint,
  facility_id uuid,
  patient_id uuid,
  purpose_code text,
  action_code text,
  resource_type text,
  resource_id uuid,
  resource_version integer,
  outcome text,
  reason_code text,
  source_ip_prefix text,
  user_agent_class text,
  chain_version smallint,
  partition_key date,
  chain_sequence bigint,
  previous_hash text,
  event_hash text,
  chain_verification text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  WITH page AS MATERIALIZED (
    SELECT event.*
    FROM audit.events AS event
    WHERE audit.current_super_admin_context_v1('security.audit.review')
      AND platform.feature_enabled('audit.read',platform.context_environment())
      AND (p_actor_person_id IS NULL OR event.actor_person_id = p_actor_person_id)
      AND (p_action_code IS NULL OR event.action_code = p_action_code)
      AND (p_resource_type IS NULL OR event.resource_type = p_resource_type)
      AND (p_resource_id IS NULL OR event.resource_id = p_resource_id)
      AND (p_time_from IS NULL OR event.occurred_at >= p_time_from)
      AND (p_time_to IS NULL OR event.occurred_at < p_time_to)
      AND (p_outcome IS NULL OR event.outcome = p_outcome)
      AND (
        p_after_occurred_at IS NULL
        OR (event.occurred_at,event.id) < (p_after_occurred_at,p_after_event_id)
      )
    ORDER BY event.occurred_at DESC,event.id DESC
    LIMIT least(greatest(coalesce(p_limit,1),1),101)
  ), verifications AS MATERIALIZED (
    SELECT event.occurred_at,event.id,
      audit.event_integrity_v1(event.occurred_at,event.id) AS valid
    FROM page AS event
  )
  SELECT
    event.id,event.occurred_at,event.request_id,event.trace_id,event.actor_person_id,
    event.authentication_aal,event.facility_id,event.patient_id,event.purpose_code,
    event.action_code,event.resource_type,event.resource_id,event.resource_version,
    event.outcome,event.reason_code,event.source_ip_prefix::text,event.user_agent_class,
    event.chain_version,event.partition_key,event.chain_sequence,
    pg_catalog.encode(event.previous_hash,'hex'),pg_catalog.encode(event.event_hash,'hex'),
    CASE WHEN verification.valid THEN 'verified' ELSE 'failed' END
  FROM page AS event
  JOIN verifications AS verification USING(occurred_at,id)
  ORDER BY event.occurred_at DESC,event.id DESC
$function$;

CREATE OR REPLACE FUNCTION audit.read_event_v1(p_event_id uuid)
RETURNS TABLE(
  event_id uuid,
  occurred_at timestamptz,
  request_id uuid,
  trace_id text,
  actor_person_id uuid,
  auth_aal smallint,
  facility_id uuid,
  patient_id uuid,
  purpose_code text,
  action_code text,
  resource_type text,
  resource_id uuid,
  resource_version integer,
  outcome text,
  reason_code text,
  source_ip_prefix text,
  user_agent_class text,
  chain_version smallint,
  partition_key date,
  chain_sequence bigint,
  previous_hash text,
  event_hash text,
  chain_verification text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT
    event.id,event.occurred_at,event.request_id,event.trace_id,event.actor_person_id,
    event.authentication_aal,event.facility_id,event.patient_id,event.purpose_code,
    event.action_code,event.resource_type,event.resource_id,event.resource_version,
    event.outcome,event.reason_code,event.source_ip_prefix::text,event.user_agent_class,
    event.chain_version,event.partition_key,event.chain_sequence,
    pg_catalog.encode(event.previous_hash,'hex'),pg_catalog.encode(event.event_hash,'hex'),
    CASE WHEN verification.valid THEN 'verified' ELSE 'failed' END
  FROM audit.events AS event
  CROSS JOIN LATERAL (
    SELECT audit.event_integrity_v1(event.occurred_at,event.id) AS valid
  ) AS verification
  WHERE event.id = p_event_id
    AND audit.current_super_admin_context_v1('security.audit.review')
    AND platform.feature_enabled('audit.read',platform.context_environment())
  ORDER BY event.occurred_at DESC
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION audit.read_chain_verification_v1(p_partition_key date)
RETURNS TABLE(valid boolean,checked_count bigint,first_invalid_sequence bigint,failure_code text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT verification.*
  FROM audit.verify_event_chain_v1(p_partition_key) AS verification
  WHERE audit.current_super_admin_context_v1('security.audit.review')
    AND platform.feature_enabled('audit.read',platform.context_environment())
$function$;

CREATE OR REPLACE FUNCTION audit.read_export_batch_v1(p_export_batch_id uuid)
RETURNS TABLE(
  export_batch_id uuid,status text,partition_start date,partition_end_exclusive date,
  object_digest text,exported_at timestamptz,failure_code text,version integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT batch.id,batch.status,batch.partition_start,batch.partition_end_exclusive,
    CASE WHEN batch.object_digest IS NULL THEN NULL ELSE pg_catalog.encode(batch.object_digest,'hex') END,
    batch.exported_at,batch.failure_code,batch.version
  FROM audit.export_batches AS batch
  WHERE batch.id = p_export_batch_id
    AND audit.current_super_admin_context_v1('security.audit.review')
    AND batch.requested_by_person_id = platform.context_person_id()
$function$;

CREATE OR REPLACE FUNCTION audit.record_admin_read_v1(
  p_request_id uuid,p_trace_id text,p_action_code text,p_resource_id uuid DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $function$
BEGIN
  IF session_user <> 'shifaa_api'
     OR NOT audit.current_super_admin_context_v1('security.audit.review')
     OR NOT platform.feature_enabled('audit.read',platform.context_environment())
     OR p_request_id IS NULL OR p_trace_id IS NULL
     OR p_action_code NOT IN ('audit.events.listed','audit.event.read')
     OR (p_action_code = 'audit.event.read' AND p_resource_id IS NULL)
     OR (p_action_code = 'audit.events.listed' AND p_resource_id IS NOT NULL) THEN
    RAISE EXCEPTION 'F008_AUDIT_READ_EVIDENCE_DENIED' USING ERRCODE = '42501';
  END IF;
  PERFORM audit.append_event_v1(
    p_request_id,p_trace_id,p_action_code,
    CASE WHEN p_action_code = 'audit.event.read' THEN 'audit_event' ELSE 'audit_event_collection' END,
    'success',p_actor_person_id => platform.context_person_id(),
    p_authentication_aal => 2,p_purpose_code => 'security.audit.review',
    p_resource_id => p_resource_id,p_user_agent_class => 'web'
  );
END
$function$;

CREATE OR REPLACE FUNCTION audit.readiness_v1()
RETURNS TABLE(database_status text,outbox_status text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT
    'ready'::text,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM platform.outbox_events AS event
        WHERE event.event_type = 'audit.export.requested'
          AND event.state = 'dead_letter'
      ) THEN 'integrity_failed'
      WHEN EXISTS (
        SELECT 1 FROM platform.outbox_events AS event
        WHERE event.event_type = 'audit.export.requested'
          AND event.aggregate_type = 'audit-export'
          AND (
            (event.state = 'pending' AND event.available_at <= pg_catalog.statement_timestamp())
            OR (
              event.state = 'processing'
              AND event.lease_expires_at <= pg_catalog.statement_timestamp()
            )
          )
      ) THEN 'backlogged'
      ELSE 'ready'
    END
  WHERE session_user = 'shifaa_api'
$function$;

CREATE OR REPLACE FUNCTION audit.health_integrity_v1()
RETURNS TABLE(audit_integrity text,export_proof text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
  SELECT
    CASE WHEN EXISTS (
      SELECT 1
      FROM (SELECT DISTINCT event.partition_key FROM audit.events AS event) AS partition
      CROSS JOIN LATERAL audit.verify_event_chain_v1(partition.partition_key) AS verification
      WHERE NOT verification.valid
    ) THEN 'failed' ELSE 'ready' END,
    CASE WHEN EXISTS (
      SELECT 1 FROM audit.export_batches AS batch
      WHERE batch.status = 'proven'
        AND (batch.object_digest IS NULL OR pg_catalog.octet_length(batch.object_digest) <> 32
          OR batch.retention_proof IS NULL OR batch.exported_at IS NULL)
    ) THEN 'failed' ELSE 'ready' END
  WHERE session_user = 'shifaa_api'
    AND platform.feature_enabled('health.exposure',platform.context_environment())
$function$;

CREATE OR REPLACE FUNCTION audit.read_export_work_v1(
  p_export_batch_id uuid,p_worker_id text
)
RETURNS TABLE(
  export_batch_id uuid,status text,partition_start date,partition_end_exclusive date,
  object_key text,object_digest text,retention_proof jsonb,exported_at timestamptz,
  events jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
  SELECT batch.id,batch.status,batch.partition_start,batch.partition_end_exclusive,
    batch.object_key,
    CASE WHEN batch.object_digest IS NULL THEN NULL ELSE pg_catalog.encode(batch.object_digest,'hex') END,
    batch.retention_proof,batch.exported_at,
    coalesce((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'occurredAt',event.occurred_at,'partitionKey',event.partition_key,
        'chainSequence',event.chain_sequence,'requestId',event.request_id,
        'traceId',event.trace_id,'actorUserId',event.actor_user_id,
        'actorPersonId',event.actor_person_id,'authenticationAal',event.authentication_aal,
        'facilityId',event.facility_id,'patientId',event.patient_id,
        'purposeCode',event.purpose_code,'actionCode',event.action_code,
        'resourceType',event.resource_type,'resourceId',event.resource_id,
        'resourceVersion',event.resource_version,'outcome',event.outcome,
        'reasonCode',event.reason_code,'sourceIpPrefix',event.source_ip_prefix,
        'userAgentClass',event.user_agent_class,
        'previousHash',pg_catalog.encode(event.previous_hash,'hex'),
        'eventHash',pg_catalog.encode(event.event_hash,'hex')
      ) ORDER BY event.occurred_at,event.chain_sequence,event.id)
      FROM audit.events AS event
      WHERE event.occurred_at >= batch.partition_start::timestamp AT TIME ZONE 'UTC'
        AND event.occurred_at < batch.partition_end_exclusive::timestamp AT TIME ZONE 'UTC'
    ),'[]'::jsonb)
  FROM audit.export_batches AS batch
  WHERE batch.id = p_export_batch_id
    AND session_user = 'shifaa_api'
    AND nullif(current_setting('shifaa.service_principal',true),'') = 'service:audit-export-worker'
    AND nullif(current_setting('shifaa.worker_id',true),'') = p_worker_id
    AND p_worker_id = batch.lease_owner
    AND batch.lease_expires_at > pg_catalog.statement_timestamp()
    AND batch.status IN ('claimed','proven')
$function$;

CREATE OR REPLACE FUNCTION audit.exact_export_worker_context_v1(p_worker_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
  SELECT
    session_user = 'shifaa_worker'
    AND p_worker_id IS NOT NULL
    AND pg_catalog.octet_length(p_worker_id) BETWEEN 8 AND 64
    AND p_worker_id ~ '^[a-z0-9][a-z0-9._-]*$'
    AND p_worker_id = nullif(current_setting('shifaa.worker_id',true),'')
$function$;

CREATE OR REPLACE FUNCTION audit.worker_claims_export_v1(p_export_batch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM audit.export_batches AS batch
    WHERE batch.id = p_export_batch_id
      AND batch.status = 'claimed'
      AND batch.lease_expires_at > pg_catalog.statement_timestamp()
      AND audit.exact_export_worker_context_v1(batch.lease_owner)
  )
$function$;

CREATE OR REPLACE FUNCTION audit.request_export_v1(
  p_idempotency_key text,
  p_request_hash text,
  p_partition_start date,
  p_partition_end_exclusive date,
  p_request_id uuid,
  p_trace_id text
)
RETURNS TABLE(
  export_batch_id uuid,
  status text,
  partition_start date,
  partition_end_exclusive date,
  accepted_at timestamptz,
  idempotency_state text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  principal_value text := nullif(current_setting('shifaa.principal',true),'');
  actor_person_id_value uuid := platform.context_person_id();
  idempotency_row platform.idempotency_records%ROWTYPE;
  inserted_idempotency_id uuid;
  batch_row audit.export_batches%ROWTYPE;
  maximum_completed_months integer;
BEGIN
  IF NOT audit.current_super_admin_context_v1('security.audit.review')
     OR NOT platform.feature_enabled('audit.export',platform.context_environment()) THEN
    RAISE EXCEPTION 'F008_AUDIT_EXPORT_DENIED' USING ERRCODE = '42501';
  END IF;

  IF principal_value IS NULL
     OR p_idempotency_key IS NULL
     OR pg_catalog.octet_length(p_idempotency_key) NOT BETWEEN 16 AND 128
     OR p_request_hash IS NULL
     OR p_request_hash !~ '^[a-f0-9]{64}$'
     OR p_request_id IS NULL
     OR p_trace_id IS NULL THEN
    RAISE EXCEPTION 'F008_AUDIT_EXPORT_REQUEST_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT CASE
      WHEN flag.constraints->>'maximumCompletedMonths' ~ '^[1-9][0-9]*$'
      THEN (flag.constraints->>'maximumCompletedMonths')::integer
      ELSE NULL
    END
  INTO maximum_completed_months
  FROM platform.feature_flags AS flag
  WHERE flag.code = 'audit.export'
    AND flag.environment = platform.context_environment()
    AND flag.enabled;

  IF maximum_completed_months IS NULL
     OR p_partition_start IS NULL
     OR p_partition_end_exclusive IS NULL
     OR p_partition_start <> pg_catalog.date_trunc('month',p_partition_start)::date
     OR p_partition_end_exclusive <> pg_catalog.date_trunc('month',p_partition_end_exclusive)::date
     OR p_partition_start >= p_partition_end_exclusive
     OR p_partition_end_exclusive > pg_catalog.date_trunc(
          'month',pg_catalog.statement_timestamp() AT TIME ZONE 'UTC'
        )::date
     OR p_partition_end_exclusive > (
          p_partition_start + maximum_completed_months * INTERVAL '1 month'
        )::date THEN
    RAISE EXCEPTION 'F008_AUDIT_EXPORT_RANGE_INVALID' USING ERRCODE = '22023';
  END IF;

  DELETE FROM platform.idempotency_records AS expired
  WHERE expired.principal = principal_value
    AND expired.method = 'POST'
    AND expired.route = '/v1/admin/audit/exports'
    AND expired.idempotency_key = p_idempotency_key
    AND expired.expires_at <= pg_catalog.statement_timestamp();

  INSERT INTO platform.idempotency_records(
    principal,method,route,idempotency_key,request_hash,state,expires_at
  ) VALUES (
    principal_value,'POST','/v1/admin/audit/exports',p_idempotency_key,
    p_request_hash,'processing',pg_catalog.statement_timestamp() + INTERVAL '24 hours'
  )
  ON CONFLICT(principal,method,route,idempotency_key) DO NOTHING
  RETURNING id INTO inserted_idempotency_id;

  SELECT record.*
  INTO STRICT idempotency_row
  FROM platform.idempotency_records AS record
  WHERE record.principal = principal_value
    AND record.method = 'POST'
    AND record.route = '/v1/admin/audit/exports'
    AND record.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF idempotency_row.request_hash <> p_request_hash THEN
    RAISE EXCEPTION 'F008_IDEMPOTENCY_KEY_REUSED' USING ERRCODE = '23505';
  END IF;

  IF inserted_idempotency_id IS NULL THEN
    IF idempotency_row.state = 'completed' THEN
      RETURN QUERY SELECT
        (idempotency_row.response_body->>'export_batch_id')::uuid,
        idempotency_row.response_body->>'status',
        (idempotency_row.response_body->>'partition_start')::date,
        (idempotency_row.response_body->>'partition_end_exclusive')::date,
        (idempotency_row.response_body->>'accepted_at')::timestamptz,
        'replayed'::text;
      RETURN;
    END IF;
    RAISE EXCEPTION 'F008_IDEMPOTENCY_IN_PROGRESS' USING ERRCODE = '55000';
  END IF;

  INSERT INTO audit.export_batches(
    requested_by_person_id,purpose_code,partition_start,partition_end_exclusive,status
  ) VALUES (
    actor_person_id_value,'security.audit.review',p_partition_start,
    p_partition_end_exclusive,'queued'
  )
  RETURNING * INTO batch_row;

  PERFORM audit.append_event_v1(
    p_request_id,p_trace_id,'audit.export.requested','audit_export','success',
    NULL::uuid,actor_person_id_value,2::smallint,NULL::uuid,NULL::uuid,
    'security.audit.review',batch_row.id,batch_row.version,
    NULL::text,NULL::inet,'service'
  );

  INSERT INTO platform.outbox_events(
    aggregate_type,aggregate_id,aggregate_version,event_type,payload
  ) VALUES (
    'audit-export',batch_row.id,batch_row.version,'audit.export.requested',
    pg_catalog.jsonb_build_object('exportBatchId',batch_row.id)
  );

  UPDATE platform.idempotency_records AS record
  SET state = 'completed',
      response_status = 202,
      response_headers = '{"cache-control":"private, no-store"}'::jsonb,
      response_body = pg_catalog.jsonb_build_object(
        'export_batch_id',batch_row.id,
        'status',batch_row.status,
        'partition_start',batch_row.partition_start,
        'partition_end_exclusive',batch_row.partition_end_exclusive,
        'accepted_at',batch_row.created_at
      ),
      resource_type = 'audit_export',
      resource_id = batch_row.id,
      updated_at = pg_catalog.statement_timestamp()
  WHERE record.id = idempotency_row.id;

  RETURN QUERY SELECT
    batch_row.id,batch_row.status,batch_row.partition_start,
    batch_row.partition_end_exclusive,batch_row.created_at,'created'::text;
END
$function$;

CREATE OR REPLACE FUNCTION audit.claim_export_v1(
  p_worker_id text,
  p_lease_seconds integer,
  p_request_id uuid,
  p_trace_id text
)
RETURNS TABLE(
  event_id uuid,
  export_batch_id uuid,
  partition_start date,
  partition_end_exclusive date,
  object_key text,
  aggregate_version integer,
  attempt_count integer,
  lease_owner text,
  lease_expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  event_id_value uuid;
  batch_id_value uuid;
  batch_row audit.export_batches%ROWTYPE;
BEGIN
  IF NOT audit.exact_export_worker_context_v1(p_worker_id)
     OR NOT platform.feature_enabled('audit.export',platform.context_environment()) THEN
    RAISE EXCEPTION 'F008_EXPORT_WORKER_DENIED' USING ERRCODE = '42501';
  END IF;
  IF p_lease_seconds NOT BETWEEN 1 AND 300 THEN
    RAISE EXCEPTION 'F008_EXPORT_LEASE_INVALID' USING ERRCODE = '22023';
  END IF;
  IF p_request_id IS NULL OR p_trace_id IS NULL THEN
    RAISE EXCEPTION 'F008_EXPORT_CORRELATION_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT event.id,batch.id
  INTO event_id_value,batch_id_value
  FROM platform.outbox_events AS event
  JOIN audit.export_batches AS batch
    ON batch.id = event.aggregate_id
   AND event.aggregate_type = 'audit-export'
  WHERE event.event_type = 'audit.export.requested'
    AND event.available_at <= pg_catalog.statement_timestamp()
    AND (
      (event.state = 'pending' AND batch.status IN ('queued','retryable'))
      OR (
        event.state = 'processing'
        AND event.lease_expires_at <= pg_catalog.statement_timestamp()
        AND batch.status = 'claimed'
        AND batch.lease_expires_at <= pg_catalog.statement_timestamp()
      )
    )
  ORDER BY event.available_at,event.created_at,event.id
  FOR UPDATE OF event,batch SKIP LOCKED
  LIMIT 1;

  IF event_id_value IS NULL THEN
    RETURN;
  END IF;

  UPDATE audit.export_batches AS batch
  SET status = 'claimed',
      object_key = coalesce(
        batch.object_key,
        'audit-exports/' || pg_catalog.encode(
          audit.sha256_v1(pg_catalog.convert_to(batch.id::text,'UTF8')),'hex'
        ) || '.jsonl'
      ),
      failure_code = NULL,
      lease_owner = p_worker_id,
      lease_expires_at = pg_catalog.statement_timestamp()
        + pg_catalog.make_interval(secs => p_lease_seconds),
      attempt_count = batch.attempt_count + 1,
      updated_at = pg_catalog.statement_timestamp(),
      version = batch.version + 1
  WHERE batch.id = batch_id_value
  RETURNING batch.* INTO batch_row;

  UPDATE platform.outbox_events AS event
  SET state = 'processing',
      attempt_count = event.attempt_count + 1,
      lease_owner = p_worker_id,
      lease_expires_at = batch_row.lease_expires_at,
      last_error_code = NULL,
      updated_at = pg_catalog.statement_timestamp()
  WHERE event.id = event_id_value;

  PERFORM audit.append_event_v1(
    p_request_id,p_trace_id,'audit.export.claimed','audit_export','success',
    p_resource_id => batch_row.id,p_resource_version => batch_row.version,
    p_user_agent_class => 'worker'
  );

  RETURN QUERY SELECT
    event_id_value,batch_row.id,batch_row.partition_start,batch_row.partition_end_exclusive,
    batch_row.object_key,batch_row.version,batch_row.attempt_count,batch_row.lease_owner,
    batch_row.lease_expires_at;
END
$function$;

CREATE OR REPLACE FUNCTION audit.complete_export_v1(
  p_export_batch_id uuid,
  p_worker_id text,
  p_outcome text,
  p_object_digest bytea,
  p_retention_proof jsonb,
  p_failure_code text,
  p_retry_at timestamptz,
  p_request_id uuid,
  p_trace_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  event_id_value uuid;
  changed_count integer;
BEGIN
  IF NOT audit.exact_export_worker_context_v1(p_worker_id) THEN
    RAISE EXCEPTION 'F008_EXPORT_WORKER_DENIED' USING ERRCODE = '42501';
  END IF;
  IF p_outcome NOT IN ('proven','retryable','dead_letter') THEN
    RAISE EXCEPTION 'F008_EXPORT_OUTCOME_INVALID' USING ERRCODE = '22023';
  END IF;
  IF p_request_id IS NULL OR p_trace_id IS NULL THEN
    RAISE EXCEPTION 'F008_EXPORT_CORRELATION_INVALID' USING ERRCODE = '22023';
  END IF;
  IF p_outcome = 'proven' AND (
    p_object_digest IS NULL OR pg_catalog.octet_length(p_object_digest) <> 32
    OR p_retention_proof IS NULL OR p_failure_code IS NOT NULL OR p_retry_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'F008_EXPORT_PROOF_INVALID' USING ERRCODE = '22023';
  END IF;
  IF p_outcome = 'retryable' AND (
    p_failure_code IS NULL OR p_retry_at IS NULL
    OR p_retry_at <= pg_catalog.statement_timestamp()
    OR p_object_digest IS NOT NULL OR p_retention_proof IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'F008_EXPORT_RETRY_INVALID' USING ERRCODE = '22023';
  END IF;
  IF p_outcome = 'dead_letter' AND (
    p_failure_code IS NULL OR p_retry_at IS NOT NULL
    OR p_object_digest IS NOT NULL OR p_retention_proof IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'F008_EXPORT_DEAD_LETTER_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT event.id
  INTO event_id_value
  FROM platform.outbox_events AS event
  JOIN audit.export_batches AS batch ON batch.id = event.aggregate_id
  WHERE batch.id = p_export_batch_id
    AND batch.status = 'claimed'
    AND batch.lease_owner = p_worker_id
    AND batch.lease_expires_at > pg_catalog.statement_timestamp()
    AND event.event_type = 'audit.export.requested'
    AND event.state = 'processing'
    AND event.lease_owner = p_worker_id
    AND event.lease_expires_at > pg_catalog.statement_timestamp()
  FOR UPDATE OF event,batch;

  IF event_id_value IS NULL THEN
    RETURN false;
  END IF;

  UPDATE audit.export_batches AS batch
  SET status = p_outcome,
      object_digest = CASE WHEN p_outcome = 'proven' THEN p_object_digest ELSE NULL END,
      retention_proof = CASE WHEN p_outcome = 'proven' THEN p_retention_proof ELSE NULL END,
      exported_at = CASE WHEN p_outcome = 'proven' THEN pg_catalog.statement_timestamp() ELSE NULL END,
      failure_code = CASE WHEN p_outcome = 'proven' THEN NULL ELSE p_failure_code END,
      lease_owner = NULL,
      lease_expires_at = NULL,
      updated_at = pg_catalog.statement_timestamp(),
      version = batch.version + 1
  WHERE batch.id = p_export_batch_id;

  UPDATE platform.outbox_events AS event
  SET state = CASE
        WHEN p_outcome = 'proven' THEN 'delivered'
        WHEN p_outcome = 'retryable' THEN 'pending'
        ELSE 'dead_letter'
      END,
      available_at = CASE WHEN p_outcome = 'retryable' THEN p_retry_at ELSE event.available_at END,
      last_error_code = CASE WHEN p_outcome = 'proven' THEN NULL ELSE p_failure_code END,
      lease_owner = NULL,
      lease_expires_at = NULL,
      updated_at = pg_catalog.statement_timestamp()
  WHERE event.id = event_id_value;

  GET DIAGNOSTICS changed_count = ROW_COUNT;
  IF changed_count = 1 AND p_outcome IN ('proven','dead_letter') THEN
    INSERT INTO platform.event_receipts(event_id,consumer,result_code)
    VALUES(event_id_value,'audit-export-worker',p_outcome)
    ON CONFLICT(event_id,consumer) DO NOTHING;
  END IF;
  IF changed_count = 1 THEN
    PERFORM audit.append_event_v1(
      p_request_id,p_trace_id,
      CASE p_outcome
        WHEN 'proven' THEN 'audit.export.proven'
        WHEN 'retryable' THEN 'audit.export.retryable'
        ELSE 'audit.export.dead_lettered'
      END,
      'audit_export',CASE WHEN p_outcome = 'proven' THEN 'success' ELSE 'failed' END,
      p_resource_id => p_export_batch_id,p_reason_code => p_failure_code,
      p_user_agent_class => 'worker'
    );
  END IF;
  RETURN changed_count = 1;
END
$function$;

ALTER TABLE audit.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.events FORCE ROW LEVEL SECURITY;
ALTER TABLE audit.signature_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.signature_evidence FORCE ROW LEVEL SECURITY;
ALTER TABLE audit.export_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.export_batches FORCE ROW LEVEL SECURITY;

DO $audit_partition_rls$
DECLARE
  partition_name text;
BEGIN
  FOR partition_name IN
    SELECT child.oid::regclass::text
    FROM pg_catalog.pg_inherits AS inheritance
    JOIN pg_catalog.pg_class AS child ON child.oid = inheritance.inhrelid
    WHERE inheritance.inhparent = 'audit.events'::regclass
  LOOP
    EXECUTE pg_catalog.format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY',partition_name);
    EXECUTE pg_catalog.format('ALTER TABLE %s FORCE ROW LEVEL SECURITY',partition_name);
  END LOOP;
END
$audit_partition_rls$;

CREATE POLICY audit_events_super_admin_select_v1
ON audit.events FOR SELECT TO shifaa_api
USING (audit.current_super_admin_context_v1('security.audit.review'));
CREATE POLICY audit_signature_super_admin_select_v1
ON audit.signature_evidence FOR SELECT TO shifaa_api
USING (audit.current_super_admin_context_v1('security.audit.review'));
CREATE POLICY audit_export_super_admin_select_v1
ON audit.export_batches FOR SELECT TO shifaa_api
USING (
  audit.current_super_admin_context_v1('security.audit.review')
  AND requested_by_person_id = platform.context_person_id()
);
CREATE POLICY audit_export_super_admin_insert_v1
ON audit.export_batches FOR INSERT TO shifaa_api
WITH CHECK (
  audit.current_super_admin_context_v1('security.audit.review')
  AND requested_by_person_id = platform.context_person_id()
  AND status = 'queued'
);
CREATE POLICY audit_export_exact_worker_select_v1
ON audit.export_batches FOR SELECT TO shifaa_worker
USING (
  audit.exact_export_worker_context_v1(lease_owner)
  AND id = nullif(current_setting('shifaa.export_batch_id',true),'')::uuid
  AND status = 'claimed'
);

DROP POLICY IF EXISTS outbox_worker_select ON platform.outbox_events;
CREATE POLICY outbox_worker_select
ON platform.outbox_events FOR SELECT TO shifaa_worker
USING (
  event_type IN (
    'privacy.dsr.status_changed','privacy.dsr.export_ready','notification.delivery.requested','notification.delivery.replay_requested',
    'sos.emergency_contact.requested','identity.factor.changed','identity.recovery.completed',
    'identity.transition.submitted','identity.transition.decided'
  )
  OR (
    event_type = 'audit.export.requested'
    AND aggregate_type = 'audit-export'
    AND payload = pg_catalog.jsonb_build_object('exportBatchId',aggregate_id)
    AND audit.worker_claims_export_v1(aggregate_id)
  )
);

DROP POLICY IF EXISTS outbox_worker_lease_update ON platform.outbox_events;
CREATE POLICY outbox_worker_lease_update
ON platform.outbox_events FOR UPDATE TO shifaa_worker
USING (
  event_type IN (
    'privacy.dsr.status_changed','privacy.dsr.export_ready','notification.delivery.requested','notification.delivery.replay_requested',
    'sos.emergency_contact.requested','identity.factor.changed','identity.recovery.completed',
    'identity.transition.submitted','identity.transition.decided'
  )
  OR (
    event_type = 'audit.export.requested'
    AND aggregate_type = 'audit-export'
    AND audit.worker_claims_export_v1(aggregate_id)
  )
)
WITH CHECK (
  event_type IN (
    'privacy.dsr.status_changed','privacy.dsr.export_ready','notification.delivery.requested','notification.delivery.replay_requested',
    'sos.emergency_contact.requested','identity.factor.changed','identity.recovery.completed',
    'identity.transition.submitted','identity.transition.decided'
  )
  OR (
    event_type = 'audit.export.requested'
    AND aggregate_type = 'audit-export'
    AND payload = pg_catalog.jsonb_build_object('exportBatchId',aggregate_id)
  )
);

REVOKE ALL ON SCHEMA audit FROM PUBLIC;
GRANT USAGE ON SCHEMA audit TO shifaa_api,shifaa_worker;
REVOKE ALL ON ALL TABLES IN SCHEMA audit FROM PUBLIC,shifaa_api,shifaa_worker;

REVOKE ALL ON FUNCTION audit.current_super_admin_context_v1(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION audit.current_admin_summary_context_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION audit.event_integrity_v1(timestamptz,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION audit.read_events_v1(uuid,text,text,uuid,timestamptz,timestamptz,text,timestamptz,uuid,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION audit.read_event_v1(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION audit.read_chain_verification_v1(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION audit.read_export_batch_v1(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION audit.readiness_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION audit.health_integrity_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION audit.read_export_work_v1(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION audit.record_admin_read_v1(uuid,text,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION audit.exact_export_worker_context_v1(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION audit.worker_claims_export_v1(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION audit.request_export_v1(text,text,date,date,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION audit.claim_export_v1(text,integer,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION audit.complete_export_v1(uuid,text,text,bytea,jsonb,text,timestamptz,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit.current_super_admin_context_v1(text) TO shifaa_api;
GRANT EXECUTE ON FUNCTION audit.current_admin_summary_context_v1() TO shifaa_api;
GRANT EXECUTE ON FUNCTION audit.read_events_v1(uuid,text,text,uuid,timestamptz,timestamptz,text,timestamptz,uuid,integer) TO shifaa_api;
GRANT EXECUTE ON FUNCTION audit.read_event_v1(uuid) TO shifaa_api;
GRANT EXECUTE ON FUNCTION audit.read_chain_verification_v1(date) TO shifaa_api;
GRANT EXECUTE ON FUNCTION audit.read_export_batch_v1(uuid) TO shifaa_api;
GRANT EXECUTE ON FUNCTION audit.readiness_v1() TO shifaa_api;
GRANT EXECUTE ON FUNCTION audit.health_integrity_v1() TO shifaa_api;
GRANT EXECUTE ON FUNCTION audit.read_export_work_v1(uuid,text) TO shifaa_api;
GRANT EXECUTE ON FUNCTION audit.record_admin_read_v1(uuid,text,text,uuid) TO shifaa_api;
GRANT EXECUTE ON FUNCTION audit.exact_export_worker_context_v1(text) TO shifaa_worker;
GRANT EXECUTE ON FUNCTION audit.worker_claims_export_v1(uuid) TO shifaa_worker;
GRANT EXECUTE ON FUNCTION audit.request_export_v1(text,text,date,date,uuid,text) TO shifaa_api;
GRANT EXECUTE ON FUNCTION platform.append_discovery_sos_effect_v1(uuid,text,uuid,integer,uuid) TO shifaa_api;
GRANT EXECUTE ON FUNCTION platform.append_identity_audit_effect_v1(uuid,text,text,uuid,integer,text) TO shifaa_api;
GRANT EXECUTE ON FUNCTION platform.append_family_authorization_audit_v1(uuid,text,uuid,uuid,integer) TO shifaa_api;
GRANT EXECUTE ON FUNCTION platform.append_facility_governance_audit_v1(uuid,text,uuid,uuid) TO shifaa_api;
GRANT EXECUTE ON FUNCTION platform.append_family_mutation_audit_v1(uuid,text,uuid,uuid,uuid,integer) TO shifaa_api;
GRANT EXECUTE ON FUNCTION platform.append_family_invitation_audit_v1(uuid,text,uuid,uuid) TO shifaa_api;
GRANT EXECUTE ON FUNCTION platform.append_privacy_effect_audit_v1(uuid,text,uuid,uuid,integer) TO shifaa_api;
GRANT EXECUTE ON FUNCTION platform.append_notification_receipt_audit_v1(uuid,uuid) TO shifaa_api;
GRANT EXECUTE ON FUNCTION audit.claim_export_v1(text,integer,uuid,text) TO shifaa_worker;
GRANT EXECUTE ON FUNCTION audit.complete_export_v1(uuid,text,text,bytea,jsonb,text,timestamptz,uuid,text) TO shifaa_worker;

DO $optional_roles$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = role_name) THEN
      EXECUTE pg_catalog.format(
        'REVOKE ALL ON audit.events,audit.signature_evidence,audit.export_batches FROM %I',
        role_name
      );
    END IF;
  END LOOP;
END
$optional_roles$;

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
REVOKE ALL ON FUNCTION platform.append_discovery_sos_effect_v1(uuid,text,uuid,integer,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.append_identity_audit_effect_v1(uuid,text,text,uuid,integer,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.append_family_authorization_audit_v1(uuid,text,uuid,uuid,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.append_facility_governance_audit_v1(uuid,text,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.append_family_mutation_audit_v1(uuid,text,uuid,uuid,uuid,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.append_family_invitation_audit_v1(uuid,text,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.append_privacy_effect_audit_v1(uuid,text,uuid,uuid,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.append_notification_receipt_audit_v1(uuid,uuid) FROM PUBLIC;

COMMIT;
