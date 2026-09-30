-- C23 consumes the existing C22 body-free marker only as a context refresh
-- hint. The worker receives no event payload and no direct message access.
BEGIN;

INSERT INTO platform.feature_flags(code,environment,enabled,constraints)
VALUES
  ('feature_010.realtime_hints','local',false,'{"stage":"validate","external_transport":false}'::jsonb),
  ('feature_010.realtime_hints','ci',false,'{"stage":"validate","external_transport":false}'::jsonb),
  ('feature_010.realtime_hints','production',false,'{"stage":"validate","external_transport":false}'::jsonb)
ON CONFLICT(code,environment) DO UPDATE
SET enabled=false,constraints=EXCLUDED.constraints,
  version=platform.feature_flags.version+1,updated_at=statement_timestamp();

-- Freeze the existing C22 marker to its exact, body-free payload. Existing
-- canonical C22 rows satisfy this check; arbitrary extras cannot enter the
-- durable queue or be retained in retry/DLQ metadata.
ALTER TABLE platform.outbox_events
  DROP CONSTRAINT IF EXISTS outbox_c23_context_message_marker_shape_check;
ALTER TABLE platform.outbox_events
  ADD CONSTRAINT outbox_c23_context_message_marker_shape_check CHECK (
    event_type <> 'clinical.context_message.created.v1'
    OR (
      aggregate_type='context_message'
      AND payload=pg_catalog.jsonb_build_object(
        'aggregateId',aggregate_id,'version',aggregate_version
      )
    )
  );

CREATE OR REPLACE FUNCTION platform.claim_next_feature_010_realtime_hint_event(
  p_worker_id text,p_lease_seconds integer DEFAULT 30
)
RETURNS TABLE(
  event_id uuid,event_type text,aggregate_type text,aggregate_id uuid,
  aggregate_version integer,context_id uuid,attempt_count integer,lease_expires_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,platform,trust AS $$
BEGIN
  IF platform.context_environment() NOT IN ('local','ci')
     OR NOT platform.feature_enabled('feature_010.realtime_hints',platform.context_environment())
     OR p_worker_id IS NULL OR p_worker_id !~ '^[a-zA-Z0-9._:-]{1,96}$'
     OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 5 AND 300 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH candidate AS MATERIALIZED (
    SELECT e.id
    FROM platform.outbox_events e
    WHERE e.event_type='clinical.context_message.created.v1'
      AND e.aggregate_type='context_message'
      AND (e.state='pending' OR (e.state='processing' AND e.lease_expires_at<statement_timestamp()))
      AND e.available_at<=statement_timestamp()
      AND (
        e.aggregate_version=1
        OR EXISTS (
          SELECT 1 FROM platform.outbox_events previous
          WHERE previous.event_type='clinical.context_message.created.v1'
            AND previous.aggregate_type=e.aggregate_type
            AND previous.aggregate_id=e.aggregate_id
            AND previous.aggregate_version=e.aggregate_version-1
            AND previous.state IN ('delivered','dead_letter')
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM platform.outbox_events earlier
        WHERE earlier.event_type='clinical.context_message.created.v1'
          AND earlier.aggregate_type=e.aggregate_type
          AND earlier.aggregate_id=e.aggregate_id
          AND earlier.aggregate_version<e.aggregate_version
          AND earlier.state NOT IN ('delivered','dead_letter')
      )
    ORDER BY e.available_at,e.created_at,e.id
    FOR UPDATE OF e SKIP LOCKED
    LIMIT 1
  ), claimed AS (
    UPDATE platform.outbox_events e
    SET state='processing',attempt_count=e.attempt_count+1,
      lease_owner=p_worker_id,
      lease_expires_at=statement_timestamp()+pg_catalog.make_interval(secs=>p_lease_seconds),
      updated_at=statement_timestamp()
    FROM candidate c
    WHERE e.id=c.id
    RETURNING e.id,e.event_type,e.aggregate_type,e.aggregate_id,
      e.aggregate_version,e.attempt_count,e.lease_expires_at
  )
  SELECT c.id,c.event_type,c.aggregate_type,c.aggregate_id,c.aggregate_version,
    message.context_id,c.attempt_count,c.lease_expires_at
  FROM claimed c
  LEFT JOIN trust.messages message
    ON message.id=c.aggregate_id AND message.context_type='appointment';
END $$;

CREATE OR REPLACE FUNCTION platform.complete_feature_010_realtime_hint_event(
  p_event_id uuid,p_worker_id text,p_outcome text,
  p_safe_error_code text DEFAULT NULL,p_retry_at timestamptz DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,platform AS $$
DECLARE changed integer; next_state text; current_attempt integer;
BEGIN
  IF p_event_id IS NULL OR p_worker_id IS NULL
     OR p_worker_id !~ '^[a-zA-Z0-9._:-]{1,96}$'
     OR p_outcome IS NULL OR p_outcome NOT IN ('delivered','retry','dead_letter') THEN
    RAISE EXCEPTION 'invalid Feature 010 realtime completion' USING ERRCODE='22023';
  END IF;

  IF platform.context_environment() NOT IN ('local','ci')
     OR NOT platform.feature_enabled('feature_010.realtime_hints',platform.context_environment()) THEN
    RETURN false;
  END IF;

  IF p_safe_error_code IS NOT NULL AND p_safe_error_code NOT IN (
       'f010_hint_publish_failed','f010_hint_projection_invalid','f010_hint_retries_exhausted'
     ) THEN
    RAISE EXCEPTION 'invalid Feature 010 realtime error code' USING ERRCODE='22023';
  END IF;
  IF p_outcome='delivered' AND (p_safe_error_code IS NOT NULL OR p_retry_at IS NOT NULL) THEN
    RAISE EXCEPTION 'invalid Feature 010 realtime delivered metadata' USING ERRCODE='22023';
  ELSIF p_outcome='retry' AND (
      p_safe_error_code IS DISTINCT FROM 'f010_hint_publish_failed'
      OR p_retry_at IS NULL OR p_retry_at<=statement_timestamp()
      OR p_retry_at>statement_timestamp()+interval '1 day'
    ) THEN
    RAISE EXCEPTION 'invalid Feature 010 realtime retry metadata' USING ERRCODE='22023';
  ELSIF p_outcome='dead_letter' AND (
      p_retry_at IS NOT NULL
      OR p_safe_error_code IS NULL
      OR p_safe_error_code NOT IN ('f010_hint_projection_invalid','f010_hint_retries_exhausted')
    ) THEN
    RAISE EXCEPTION 'invalid Feature 010 realtime DLQ metadata' USING ERRCODE='22023';
  END IF;

  SELECT e.attempt_count INTO current_attempt
  FROM platform.outbox_events e
  WHERE e.id=p_event_id
    AND e.event_type='clinical.context_message.created.v1'
    AND e.state='processing' AND e.lease_owner=p_worker_id
    AND e.lease_expires_at>statement_timestamp()
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_outcome='retry' AND current_attempt>=6 THEN
    RAISE EXCEPTION 'Feature 010 realtime retry limit exhausted' USING ERRCODE='22023';
  ELSIF p_outcome='dead_letter' AND p_safe_error_code='f010_hint_retries_exhausted'
        AND current_attempt<6 THEN
    RAISE EXCEPTION 'Feature 010 realtime retry limit not exhausted' USING ERRCODE='22023';
  END IF;

  next_state:=CASE p_outcome WHEN 'delivered' THEN 'delivered' WHEN 'retry' THEN 'pending' ELSE 'dead_letter' END;
  UPDATE platform.outbox_events e
  SET state=next_state,available_at=COALESCE(p_retry_at,e.available_at),
    last_error_code=p_safe_error_code,lease_owner=NULL,lease_expires_at=NULL,
    updated_at=statement_timestamp()
  WHERE e.id=p_event_id AND e.event_type='clinical.context_message.created.v1'
    AND e.state='processing' AND e.lease_owner=p_worker_id
    AND e.lease_expires_at>statement_timestamp();
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed=1 AND p_outcome IN ('delivered','dead_letter') THEN
    INSERT INTO platform.event_receipts(event_id,consumer,result_code)
    VALUES(p_event_id,'feature-010-realtime-hints',p_outcome)
    ON CONFLICT(event_id,consumer) DO NOTHING;
  END IF;
  RETURN changed=1;
END $$;

REVOKE ALL ON FUNCTION platform.claim_next_feature_010_realtime_hint_event(text,integer),
  platform.complete_feature_010_realtime_hint_event(uuid,text,text,text,timestamptz)
  FROM PUBLIC;
DO $feature_010_c23_execute_grants$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['shifaa_worker','shifaa_api','anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=role_name) THEN
      EXECUTE pg_catalog.format(
        'REVOKE ALL ON FUNCTION platform.claim_next_feature_010_realtime_hint_event(text,integer), platform.complete_feature_010_realtime_hint_event(uuid,text,text,text,timestamptz) FROM %I',
        role_name
      );
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='shifaa_worker') THEN
    GRANT EXECUTE ON FUNCTION platform.claim_next_feature_010_realtime_hint_event(text,integer),
      platform.complete_feature_010_realtime_hint_event(uuid,text,text,text,timestamptz)
      TO shifaa_worker;
    REVOKE ALL ON trust.messages FROM shifaa_worker;
  END IF;
END
$feature_010_c23_execute_grants$;

COMMENT ON FUNCTION platform.claim_next_feature_010_realtime_hint_event(text,integer) IS
  'C23 body-free refresh-hint claim: returns event identity, aggregate ordering and appointment context only; worker role receives no payload or message ciphertext.';
COMMENT ON FUNCTION platform.complete_feature_010_realtime_hint_event(uuid,text,text,text,timestamptz) IS
  'C23 fenced receipt completion with a closed safe-error-code allowlist; local/CI only and production-disabled.';

COMMIT;
