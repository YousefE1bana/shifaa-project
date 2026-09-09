BEGIN;

-- SEC-008: align persisted idempotency scope with the canonical Data/RLS
-- contract. Runtime callers keep their existing raw in-memory scope values;
-- only deterministic, domain-separated digests cross the storage boundary.
LOCK TABLE platform.idempotency_records IN ACCESS EXCLUSIVE MODE;

DROP POLICY IF EXISTS idempotency_principal_access ON platform.idempotency_records;

ALTER TABLE platform.idempotency_records
  ADD COLUMN principal_type text NOT NULL DEFAULT 'sha256-v1';

ALTER TABLE platform.idempotency_records RENAME COLUMN principal TO principal_hash;
ALTER TABLE platform.idempotency_records RENAME COLUMN route TO route_template;
ALTER TABLE platform.idempotency_records RENAME COLUMN idempotency_key TO key_hash;

DO $migration$
DECLARE
  crypto_schema name;
BEGIN
  SELECT namespace.nspname
  INTO crypto_schema
  FROM pg_catalog.pg_extension extension_row
  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = extension_row.extnamespace
  WHERE extension_row.extname = 'pgcrypto';

  IF crypto_schema IS NULL THEN
    RAISE EXCEPTION 'SEC008_PGCRYPTO_REQUIRED';
  END IF;

  EXECUTE pg_catalog.format(
    $sql$
      UPDATE platform.idempotency_records
      SET principal_hash = pg_catalog.encode(
            %1$I.digest(
              pg_catalog.convert_to(
                'shifaa:idempotency:principal:v1:' ||
                pg_catalog.octet_length(principal_hash)::text || ':' || principal_hash,
                'UTF8'
              ),
              'sha256'
            ),
            'hex'
          ),
          key_hash = pg_catalog.encode(
            %1$I.digest(
              pg_catalog.convert_to(
                'shifaa:idempotency:key:v1:' ||
                pg_catalog.octet_length(key_hash)::text || ':' || key_hash,
                'UTF8'
              ),
              'sha256'
            ),
            'hex'
          )
    $sql$,
    crypto_schema
  );
END
$migration$;

ALTER TABLE platform.idempotency_records
  DROP CONSTRAINT idempotency_records_principal_method_route_idempotency_key_key,
  ADD CONSTRAINT idempotency_records_principal_type_check
    CHECK (principal_type = 'sha256-v1'),
  ADD CONSTRAINT idempotency_records_principal_hash_check
    CHECK (principal_hash ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT idempotency_records_key_hash_check
    CHECK (key_hash ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT idempotency_records_scope_key
    UNIQUE (principal_type, principal_hash, method, route_template, key_hash);

CREATE POLICY idempotency_principal_access ON platform.idempotency_records TO shifaa_api
  USING (
    principal_type = 'sha256-v1'
    AND principal_hash = coalesce(current_setting('shifaa.principal_hash', true), '')
  )
  WITH CHECK (
    principal_type = 'sha256-v1'
    AND principal_hash = coalesce(current_setting('shifaa.principal_hash', true), '')
  );

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
  principal_hash_value text := nullif(current_setting('shifaa.principal_hash',true),'');
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

  IF principal_hash_value IS NULL
     OR principal_hash_value !~ '^[a-f0-9]{64}$'
     OR p_idempotency_key IS NULL
     OR p_idempotency_key !~ '^[a-f0-9]{64}$'
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
  WHERE expired.principal_type = 'sha256-v1'
    AND expired.principal_hash = principal_hash_value
    AND expired.method = 'POST'
    AND expired.route_template = '/v1/admin/audit/exports'
    AND expired.key_hash = p_idempotency_key
    AND expired.expires_at <= pg_catalog.statement_timestamp();

  INSERT INTO platform.idempotency_records(
    principal_type,principal_hash,method,route_template,key_hash,request_hash,state,expires_at
  ) VALUES (
    'sha256-v1',principal_hash_value,'POST','/v1/admin/audit/exports',p_idempotency_key,
    p_request_hash,'processing',pg_catalog.statement_timestamp() + INTERVAL '24 hours'
  )
  ON CONFLICT(principal_type,principal_hash,method,route_template,key_hash) DO NOTHING
  RETURNING id INTO inserted_idempotency_id;

  SELECT record.*
  INTO STRICT idempotency_row
  FROM platform.idempotency_records AS record
  WHERE record.principal_type = 'sha256-v1'
    AND record.principal_hash = principal_hash_value
    AND record.method = 'POST'
    AND record.route_template = '/v1/admin/audit/exports'
    AND record.key_hash = p_idempotency_key
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

REVOKE ALL ON FUNCTION audit.request_export_v1(text,text,date,date,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit.request_export_v1(text,text,date,date,uuid,text) TO shifaa_api;

COMMENT ON COLUMN platform.idempotency_records.principal_type IS
  'Versioned representation type for the persisted idempotency principal digest.';
COMMENT ON COLUMN platform.idempotency_records.principal_hash IS
  'Domain-separated SHA-256 digest; raw principal material must never be stored.';
COMMENT ON COLUMN platform.idempotency_records.key_hash IS
  'Domain-separated SHA-256 digest; raw Idempotency-Key material must never be stored.';

COMMIT;
