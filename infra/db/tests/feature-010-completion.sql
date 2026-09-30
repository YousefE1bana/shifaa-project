-- C13 vectors appended to the complete C11 API fixture in an isolated
-- PostgreSQL transaction. The C05 producer remains the only triple writer.
DO $feature_010_c13_boundary$
BEGIN
  IF pg_catalog.to_regprocedure('clinical.complete_encounter_api_v1(uuid,integer,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'F010_C13_MISSING_API: clinical.complete_encounter_api_v1(uuid,integer,jsonb)';
  END IF;
  IF NOT pg_catalog.has_function_privilege('shifaa_api','clinical.complete_encounter_api_v1(uuid,integer,jsonb)','EXECUTE')
     OR pg_catalog.has_function_privilege('shifaa_api','clinical.complete_encounter_v1(uuid,integer,jsonb)','EXECUTE')
     OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_proc procedure_row
       CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(procedure_row.proacl,pg_catalog.acldefault('f',procedure_row.proowner))) privilege
       WHERE procedure_row.oid='clinical.complete_encounter_api_v1(uuid,integer,jsonb)'::regprocedure
         AND privilege.grantee=0 AND privilege.privilege_type='EXECUTE'
     ) THEN
    RAISE EXCEPTION 'C13 execute grants are not narrow';
  END IF;
END
$feature_010_c13_boundary$;

SET SESSION AUTHORIZATION shifaa_api;
DO $feature_010_c13_online_vectors$
DECLARE
  encounter_id constant uuid := 'f0101000-0000-4000-8800-000000000002';
  appointment_id constant uuid := 'f0101000-0000-4000-8500-000000000004';
  queue_id constant uuid := 'f0101000-0000-4000-8700-000000000004';
  request jsonb := jsonb_build_object(
    'summary','  C13 zero-reference encounter completion  ',
    'structuralConfirmation',true
  );
  result jsonb;
  replay jsonb;
  denied boolean;
BEGIN
  IF session_user<>'shifaa_api' OR current_user<>'shifaa_api'
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'C13 assertions must run with the non-owner, non-BYPASSRLS online role';
  END IF;
  IF pg_catalog.has_table_privilege(current_user,'clinical.encounters','SELECT,INSERT,UPDATE,DELETE')
     OR pg_catalog.has_table_privilege(current_user,'clinical.appointments','SELECT,INSERT,UPDATE,DELETE')
     OR pg_catalog.has_table_privilege(current_user,'clinical.queue_entries','SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'C13 online role has direct lifecycle table privileges';
  END IF;

  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000001',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','CLN',true);
  PERFORM pg_catalog.set_config('shifaa.action','updateEncounter',true);
  PERFORM pg_catalog.set_config('shifaa.aal','2',true);
  PERFORM pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);
  PERFORM pg_catalog.set_config('shifaa.request_id','f0101000-0000-4000-9000-000000000031',true);
  PERFORM pg_catalog.set_config('shifaa.trace_id','f0101000-0000-4000-9000-000000000031',true);

  -- C11 leaves two valid condition references on version 5. Clear every
  -- optional reference through its approved API, then complete version 6.
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c13-clear-optional-refs',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('c',64),true);
  SELECT clinical.update_encounter_api_v1(encounter_id,5,
    jsonb_build_object('conditionIds','[]'::jsonb,'observationIds','[]'::jsonb,'orderIds','[]'::jsonb))
    INTO result;
  IF (result->>'version')::integer<>6
     OR pg_catalog.jsonb_array_length(result->'conditionIds')<>0
     OR pg_catalog.jsonb_array_length(result->'observationIds')<>0
     OR pg_catalog.jsonb_array_length(result->'orderIds')<>0 THEN
    RAISE EXCEPTION 'C13 fixture did not reach zero optional references at encounter version 6';
  END IF;

  PERFORM pg_catalog.set_config('shifaa.action','completeEncounter',true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c13-stale-version',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('a',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.complete_encounter_api_v1(encounter_id,5,request);
  EXCEPTION WHEN serialization_failure THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C13 accepted a stale encounter If-Match version'; END IF;

  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c13-invalid-summary-type',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('b',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.complete_encounter_api_v1(encounter_id,6,
      jsonb_build_object('summary',123,'structuralConfirmation',true));
  EXCEPTION WHEN invalid_parameter_value THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C13 accepted a non-string completion summary'; END IF;

  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c13-invalid-confirmation',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('d',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.complete_encounter_api_v1(encounter_id,6,
      jsonb_build_object('summary','Valid type but confirmation omitted','structuralConfirmation',false));
  EXCEPTION WHEN invalid_parameter_value THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C13 accepted false structural confirmation'; END IF;

  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000003',true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c13-unrelated-clinician',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('e',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.complete_encounter_api_v1(encounter_id,6,request);
  EXCEPTION WHEN no_data_found THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C13 accepted a non-responsible clinician'; END IF;

  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000001',true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c13-complete-key-001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('1',64),true);
  SELECT clinical.complete_encounter_api_v1(encounter_id,6,request) INTO result;
  IF result->'encounter'->>'status'<>'completed'
     OR result->'encounter'->>'version'<>'7'
     OR result->'encounter'->>'completionSummary'<>'C13 zero-reference encounter completion'
     OR pg_catalog.jsonb_array_length(result->'encounter'->'conditionIds')<>0
     OR pg_catalog.jsonb_array_length(result->'encounter'->'observationIds')<>0
     OR pg_catalog.jsonb_array_length(result->'encounter'->'orderIds')<>0
     OR result->>'appointmentId'<>appointment_id::text
     OR result->>'appointmentStatus'<>'completed'
     OR result->>'queueStatus'<>'completed'
     OR result->>'queueEntryId'<>queue_id::text
     OR (result->>'appointmentVersion')::integer<2
     OR (result->>'queueVersion')::integer<2 THEN
    RAISE EXCEPTION 'C13 completion omitted a linked lifecycle result or zero-reference encounter result';
  END IF;
  PERFORM pg_catalog.set_config('shifaa.test_c13_response',result::text,true);

  -- The completed response is replayed even though the supplied If-Match is
  -- now ahead of the current encounter version; body hash is independent.
  SELECT clinical.complete_encounter_api_v1(encounter_id,99,request) INTO replay;
  IF result IS DISTINCT FROM replay OR result::text IS DISTINCT FROM replay::text THEN
    RAISE EXCEPTION 'C13 exact post-completion replay did not return the stored canonical response';
  END IF;

  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('2',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.complete_encounter_api_v1(encounter_id,99,
      jsonb_build_object('summary','Changed body with same key','structuralConfirmation',true));
  EXCEPTION WHEN unique_violation THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C13 accepted changed-body idempotency-key reuse'; END IF;

END
$feature_010_c13_online_vectors$;
RESET SESSION AUTHORIZATION;

-- Revoke live membership under the fixture owner between calls. A changed
-- body must still conflict first; exact replay must then reauthorize and deny.
UPDATE identity.facility_memberships SET membership_status='suspended'
WHERE facility_id='f0101000-0000-4000-8200-000000000001'
  AND person_id='f0101000-0000-4000-8000-000000000001' AND role_code='doctor';
SET SESSION AUTHORIZATION shifaa_api;
DO $feature_010_c13_replay_authority$
DECLARE
  encounter_id constant uuid := 'f0101000-0000-4000-8800-000000000002';
  denied boolean;
BEGIN
  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000001',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','CLN',true);
  PERFORM pg_catalog.set_config('shifaa.action','completeEncounter',true);
  PERFORM pg_catalog.set_config('shifaa.aal','2',true);
  PERFORM pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c13-complete-key-001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('2',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.complete_encounter_api_v1(encounter_id,99,
      jsonb_build_object('summary','Changed body with revoked authority','structuralConfirmation',true));
  EXCEPTION WHEN unique_violation THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C13 checked revoked authority before changed-body conflict'; END IF;

  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('1',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.complete_encounter_api_v1(encounter_id,99,
      jsonb_build_object('summary','  C13 zero-reference encounter completion  ','structuralConfirmation',true));
  EXCEPTION WHEN no_data_found THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C13 replay succeeded after current clinician membership was revoked'; END IF;
END
$feature_010_c13_replay_authority$;
RESET SESSION AUTHORIZATION;
UPDATE identity.facility_memberships SET membership_status='active'
WHERE facility_id='f0101000-0000-4000-8200-000000000001'
  AND person_id='f0101000-0000-4000-8000-000000000001' AND role_code='doctor';

SET SESSION AUTHORIZATION shifaa_api;
DO $feature_010_c13_chat_cutoff$
DECLARE
  appointment_id constant uuid := 'f0101000-0000-4000-8500-000000000004';
  encounter_id constant uuid := 'f0101000-0000-4000-8800-000000000002';
  request jsonb := jsonb_build_object('summary','C13 zero-reference encounter completion','structuralConfirmation',true);
  denied boolean := false;
BEGIN
  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000001',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','CLN',true);
  PERFORM pg_catalog.set_config('shifaa.aal','2',true);
  PERFORM pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);
  PERFORM pg_catalog.set_config('shifaa.action','listContextMessages',true);
  IF clinical.feature_010_authorize_v1('listContextMessages',appointment_id) THEN
    RAISE EXCEPTION 'C13 completion did not immediately deny chat context reads';
  END IF;
  PERFORM pg_catalog.set_config('shifaa.action','sendContextMessage',true);
  IF clinical.feature_010_authorize_v1('sendContextMessage',appointment_id) THEN
    RAISE EXCEPTION 'C13 completion did not immediately deny chat sends';
  END IF;

  PERFORM pg_catalog.set_config('shifaa.action','completeEncounter',true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c13-already-completed',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('f',64),true);
  BEGIN
    PERFORM clinical.complete_encounter_api_v1(encounter_id,7,request);
  EXCEPTION WHEN object_not_in_prerequisite_state THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C13 accepted a new completion request after lifecycle completion'; END IF;
END
$feature_010_c13_chat_cutoff$;
RESET SESSION AUTHORIZATION;

DO $feature_010_c13_atomic_effects$
DECLARE
  encounter_id constant uuid := 'f0101000-0000-4000-8800-000000000002';
  appointment_id constant uuid := 'f0101000-0000-4000-8500-000000000004';
  queue_id constant uuid := 'f0101000-0000-4000-8700-000000000004';
  expected_key_hash text := pg_catalog.encode(audit.sha256_v1(pg_catalog.convert_to(
    'shifaa:idempotency:key:v1:'||pg_catalog.octet_length('f010-c13-complete-key-001')||':f010-c13-complete-key-001','UTF8')),'hex');
  stored_response jsonb;
BEGIN
  SELECT record.response_body INTO stored_response
  FROM platform.idempotency_records record
  WHERE method='POST' AND route_template='/v1/encounters/{encounterId}/complete'
    AND record.key_hash=expected_key_hash;
  IF stored_response IS DISTINCT FROM pg_catalog.current_setting('shifaa.test_c13_response')::jsonb
     OR (SELECT status FROM clinical.encounters WHERE id=encounter_id)<>'completed'
     OR (SELECT version FROM clinical.encounters WHERE id=encounter_id)<>7
     OR (SELECT completion_summary FROM clinical.encounters WHERE id=encounter_id)<>'C13 zero-reference encounter completion'
     OR (SELECT cardinality(condition_ids) FROM clinical.encounters WHERE id=encounter_id)<>0
     OR (SELECT cardinality(observation_ids) FROM clinical.encounters WHERE id=encounter_id)<>0
     OR (SELECT cardinality(order_ids) FROM clinical.encounters WHERE id=encounter_id)<>0
     OR (SELECT status FROM clinical.appointments WHERE id=appointment_id)<>'completed'
     OR (SELECT version FROM clinical.appointments WHERE id=appointment_id)<>(stored_response->>'appointmentVersion')::integer
     OR (SELECT state FROM clinical.queue_entries WHERE id=queue_id)<>'completed'
     OR (SELECT version FROM clinical.queue_entries WHERE id=queue_id)<>(stored_response->>'queueVersion')::integer THEN
    RAISE EXCEPTION 'C13 lifecycle triple and stored canonical response are inconsistent';
  END IF;
  IF (SELECT count(*) FROM platform.idempotency_records
      WHERE method='POST' AND route_template='/v1/encounters/{encounterId}/complete'
        AND state='completed' AND resource_id=encounter_id)<>1
     OR (SELECT count(*) FROM audit.events WHERE resource_type='encounter'
       AND action_code='encounter.completed' AND resource_id=encounter_id)<>1
     OR (SELECT count(*) FROM platform.outbox_events WHERE aggregate_type='encounter'
       AND event_type='clinical.encounter.completed.v1' AND aggregate_id=encounter_id)<>1 THEN
    RAISE EXCEPTION 'C13 replay or rejected calls left duplicate or partial idempotency/audit/outbox effects';
  END IF;
  IF EXISTS (SELECT 1 FROM platform.idempotency_records
      WHERE method='POST' AND route_template='/v1/encounters/{encounterId}/complete'
        AND key_hash IN (
          pg_catalog.encode(audit.sha256_v1(pg_catalog.convert_to('shifaa:idempotency:key:v1:'||pg_catalog.octet_length('f010-c13-stale-version')||':f010-c13-stale-version','UTF8')),'hex'),
          pg_catalog.encode(audit.sha256_v1(pg_catalog.convert_to('shifaa:idempotency:key:v1:'||pg_catalog.octet_length('f010-c13-invalid-summary-type')||':f010-c13-invalid-summary-type','UTF8')),'hex'),
          pg_catalog.encode(audit.sha256_v1(pg_catalog.convert_to('shifaa:idempotency:key:v1:'||pg_catalog.octet_length('f010-c13-invalid-confirmation')||':f010-c13-invalid-confirmation','UTF8')),'hex'),
          pg_catalog.encode(audit.sha256_v1(pg_catalog.convert_to('shifaa:idempotency:key:v1:'||pg_catalog.octet_length('f010-c13-unrelated-clinician')||':f010-c13-unrelated-clinician','UTF8')),'hex'),
          pg_catalog.encode(audit.sha256_v1(pg_catalog.convert_to('shifaa:idempotency:key:v1:'||pg_catalog.octet_length('f010-c13-already-completed')||':f010-c13-already-completed','UTF8')),'hex')
        )) THEN
    RAISE EXCEPTION 'C13 stale, invalid, unauthorized, or already-completed request left an idempotency record';
  END IF;
END
$feature_010_c13_atomic_effects$;
