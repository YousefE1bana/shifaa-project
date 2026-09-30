-- C22 vectors run after the committed-in-test C11 encounter fixture and roll
-- back with that fixture. All message bodies here are opaque synthetic bytes.
DO $feature_010_c22_boundary$
DECLARE
  list_signature constant regprocedure :=
    'trust.list_context_messages_api_v1(uuid,timestamptz,uuid,integer)'::regprocedure;
  send_signature constant regprocedure :=
    'trust.send_context_message_api_v1(uuid,jsonb)'::regprocedure;
BEGIN
  IF NOT pg_catalog.has_function_privilege('shifaa_api',list_signature,'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('shifaa_api',send_signature,'EXECUTE')
     OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_proc procedure_row
       CROSS JOIN LATERAL pg_catalog.aclexplode(
         COALESCE(procedure_row.proacl,pg_catalog.acldefault('f',procedure_row.proowner))
       ) privilege
       WHERE procedure_row.oid IN (list_signature,send_signature)
         AND privilege.grantee=0 AND privilege.privilege_type='EXECUTE'
     ) THEN
    RAISE EXCEPTION 'C22 API execute grants are not narrow';
  END IF;
END
$feature_010_c22_boundary$;

-- Add a fresh active interval for the current alternate workforce record so
-- the C22 vectors can end it through the public encounter-update boundary.
INSERT INTO clinical.encounter_participants(encounter_id,person_id,role_code,started_at)
VALUES (
  'f0101000-0000-4000-8800-000000000002',
  'f0101000-0000-4000-8000-000000000003',
  'consulting_clinician',
  '2030-04-05T07:30:00Z'
);

CREATE FUNCTION platform.test_c22_fail_outbox_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.event_type='clinical.context_message.created.v1'
     AND pg_catalog.current_setting('shifaa.test_c22_fail_after_insert',true)='true' THEN
    RAISE EXCEPTION 'C22 injected post-insert outbox failure' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER test_c22_fail_outbox_v1
BEFORE INSERT ON platform.outbox_events
FOR EACH ROW EXECUTE FUNCTION platform.test_c22_fail_outbox_v1();

SET SESSION AUTHORIZATION shifaa_api;
DO $feature_010_c22_online_vectors$
DECLARE
  appointment_id constant uuid := 'f0101000-0000-4000-8500-000000000004';
  encounter_id constant uuid := 'f0101000-0000-4000-8800-000000000002';
  patient_id constant uuid := 'f0101000-0000-4000-8000-000000000002';
  clinician_id constant uuid := 'f0101000-0000-4000-8000-000000000001';
  ended_clinician_id constant uuid := 'f0101000-0000-4000-8000-000000000003';
  other_patient_id constant uuid := 'f0101000-0000-4000-8000-000000000006';
  ended_interval_start constant timestamptz := '2030-04-05T07:30:00Z';
  ciphertext_value text := pg_catalog.replace(pg_catalog.replace(
    pg_catalog.encode(pg_catalog.decode('01'||pg_catalog.repeat('d1',12)||pg_catalog.repeat('e2',16)||pg_catalog.repeat('f3',96),'hex'),'base64'),
    E'\n',''),E'\r','');
  request_value jsonb;
  patient_response jsonb;
  patient_replay jsonb;
  clinician_response jsonb;
  ended_clinician_response jsonb;
  interval_update_response jsonb;
  first_page jsonb;
  second_page jsonb;
  third_page jsonb;
  protected_message jsonb;
  cursor_sent_at timestamptz;
  cursor_id uuid;
  denied boolean;
BEGIN
  IF session_user<>'shifaa_api' OR current_user<>'shifaa_api'
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'C22 assertions must run with the non-owner, non-BYPASSRLS online role';
  END IF;
  IF pg_catalog.has_table_privilege(current_user,'trust.messages','SELECT,INSERT,UPDATE,DELETE')
     OR pg_catalog.has_table_privilege(current_user,'clinical.appointments','SELECT,INSERT,UPDATE,DELETE')
     OR pg_catalog.has_table_privilege(current_user,'clinical.encounters','SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'C22 online role has direct message or lifecycle table privileges';
  END IF;

  PERFORM pg_catalog.set_config('shifaa.environment','local',true);
  PERFORM pg_catalog.set_config('shifaa.test_now','2030-04-05T08:00:00Z',true);
  PERFORM pg_catalog.set_config('shifaa.person_id',patient_id::text,true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','PAT',true);
  PERFORM pg_catalog.set_config('shifaa.aal','2',true);
  PERFORM pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);
  PERFORM pg_catalog.set_config('shifaa.action','sendContextMessage',true);
  PERFORM pg_catalog.set_config('shifaa.request_id','f0101000-0000-4000-9000-000000000041',true);
  PERFORM pg_catalog.set_config('shifaa.trace_id','f0101000-0000-4000-9000-000000000041',true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c22-patient-send-0001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('a',64),true);
  request_value := pg_catalog.jsonb_build_object('bodyCiphertext',ciphertext_value);
  SELECT trust.send_context_message_api_v1(appointment_id,request_value) INTO patient_response;
  SELECT trust.send_context_message_api_v1(appointment_id,request_value) INTO patient_replay;
  IF patient_response IS DISTINCT FROM patient_replay
     OR patient_response::text IS DISTINCT FROM patient_replay::text
     OR patient_response->>'contextType'<>'appointment'
     OR patient_response->>'contextId'<>appointment_id::text
     OR patient_response->>'senderId'<>patient_id::text
     OR patient_response->>'bodyCiphertext'<>ciphertext_value
     OR patient_response ? 'body' THEN
    RAISE EXCEPTION 'C22 PAT canonical same-key replay was not protected and byte-stable';
  END IF;

  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('b',64),true);
  denied := false;
  BEGIN
    PERFORM trust.send_context_message_api_v1(appointment_id,request_value);
  EXCEPTION WHEN unique_violation THEN denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'C22 changed-body key reuse did not return idempotency conflict';
  END IF;

  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c22-attachment-null-01',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('c',64),true);
  denied := false;
  BEGIN
    PERFORM trust.send_context_message_api_v1(appointment_id,
      request_value||pg_catalog.jsonb_build_object('attachment',NULL));
  EXCEPTION WHEN invalid_parameter_value THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C22 SQL boundary accepted an explicit null attachment'; END IF;

  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c22-bad-cipher-01',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('d',64),true);
  denied := false;
  BEGIN
    PERFORM trust.send_context_message_api_v1(appointment_id,
      pg_catalog.jsonb_build_object('bodyCiphertext','AQ=='));
  EXCEPTION WHEN invalid_parameter_value THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C22 accepted an undersized ciphertext envelope'; END IF;

  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c22-low-aal-01',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('e',64),true);
  PERFORM pg_catalog.set_config('shifaa.aal','1',true);
  denied := false;
  BEGIN
    PERFORM trust.send_context_message_api_v1(appointment_id,request_value);
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C22 accepted a send without AAL2'; END IF;

  PERFORM pg_catalog.set_config('shifaa.aal','2',true);
  PERFORM pg_catalog.set_config('shifaa.person_id',clinician_id::text,true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','CLN',true);
  PERFORM pg_catalog.set_config('shifaa.action','sendContextMessage',true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c22-clinician-send-01',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('f',64),true);
  SELECT trust.send_context_message_api_v1(appointment_id,request_value) INTO clinician_response;
  IF clinician_response->>'senderId'<>clinician_id::text THEN
    RAISE EXCEPTION 'C22 current responsible CLN could not send a protected message';
  END IF;

  PERFORM pg_catalog.set_config('shifaa.person_id',ended_clinician_id::text,true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','CLN',true);
  PERFORM pg_catalog.set_config('shifaa.action','sendContextMessage',true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c22-active-cln-send-01',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('4',64),true);
  SELECT trust.send_context_message_api_v1(appointment_id,request_value) INTO ended_clinician_response;
  IF ended_clinician_response->>'senderId'<>ended_clinician_id::text THEN
    RAISE EXCEPTION 'C22 currently active non-responsible CLN could not send';
  END IF;

  PERFORM pg_catalog.set_config('shifaa.action','listContextMessages',true);
  SELECT projection INTO first_page
  FROM trust.list_context_messages_api_v1(appointment_id,NULL,NULL,1);
  cursor_sent_at := (first_page->>'sentAt')::timestamptz;
  cursor_id := (first_page->>'id')::uuid;
  PERFORM pg_catalog.set_config('shifaa.test_c22_ended_cursor_sent_at',cursor_sent_at::text,true);
  PERFORM pg_catalog.set_config('shifaa.test_c22_ended_cursor_id',cursor_id::text,true);

  PERFORM pg_catalog.set_config('shifaa.person_id',clinician_id::text,true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','CLN',true);
  PERFORM pg_catalog.set_config('shifaa.action','updateEncounter',true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c22-end-participant-01',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('5',64),true);
  SELECT clinical.update_encounter_api_v1(encounter_id,5,
    pg_catalog.jsonb_build_object('participantIntervalsEnd',pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'personId',ended_clinician_id,
        'roleCode','consulting_clinician',
        'startedAt',ended_interval_start
      )
    ))) INTO interval_update_response;
  IF (interval_update_response->>'version')::integer<>6 THEN
    RAISE EXCEPTION 'C22 fixture participant-ending update did not advance encounter version';
  END IF;

  PERFORM pg_catalog.set_config('shifaa.person_id',ended_clinician_id::text,true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','CLN',true);
  PERFORM pg_catalog.set_config('shifaa.action','listContextMessages',true);
  denied := false;
  BEGIN
    PERFORM trust.list_context_messages_api_v1(
      appointment_id,
      pg_catalog.current_setting('shifaa.test_c22_ended_cursor_sent_at')::timestamptz,
      pg_catalog.current_setting('shifaa.test_c22_ended_cursor_id')::uuid,
      10
    );
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C22 ended participant retained a later-page history read'; END IF;

  PERFORM pg_catalog.set_config('shifaa.action','sendContextMessage',true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c22-active-cln-send-01',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('4',64),true);
  denied := false;
  BEGIN
    PERFORM trust.send_context_message_api_v1(appointment_id,request_value);
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C22 exact send replay succeeded after participant interval ended'; END IF;

  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c22-ended-cln-send-02',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('6',64),true);
  denied := false;
  BEGIN
    PERFORM trust.send_context_message_api_v1(appointment_id,request_value);
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C22 ended participant sent a new message'; END IF;

  PERFORM pg_catalog.set_config('shifaa.person_id',patient_id::text,true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','PAT',true);
  PERFORM pg_catalog.set_config('shifaa.action','listContextMessages',true);
  SELECT projection INTO first_page
  FROM trust.list_context_messages_api_v1(appointment_id,NULL,NULL,1);
  IF first_page IS NULL
     OR first_page->>'id' NOT IN (patient_response->>'id',clinician_response->>'id',ended_clinician_response->>'id') THEN
    RAISE EXCEPTION 'C22 newest message page did not use descending sentAt/id ordering';
  END IF;
  cursor_sent_at := (first_page->>'sentAt')::timestamptz;
  cursor_id := (first_page->>'id')::uuid;
  SELECT projection INTO second_page
  FROM trust.list_context_messages_api_v1(appointment_id,cursor_sent_at,cursor_id,1);
  IF second_page IS NULL OR second_page->>'id'=first_page->>'id'
     OR second_page->>'id' NOT IN (patient_response->>'id',clinician_response->>'id',ended_clinician_response->>'id')
     OR ((second_page->>'sentAt')::timestamptz,(second_page->>'id')::uuid)>=
        ((first_page->>'sentAt')::timestamptz,(first_page->>'id')::uuid) THEN
    RAISE EXCEPTION 'C22 stable tuple cursor did not return the previous message';
  END IF;
  SELECT projection INTO third_page
  FROM trust.list_context_messages_api_v1(
    appointment_id,(second_page->>'sentAt')::timestamptz,(second_page->>'id')::uuid,1
  );
  IF third_page IS NULL
     OR third_page->>'id' NOT IN (patient_response->>'id',clinician_response->>'id',ended_clinician_response->>'id')
     OR third_page->>'id' IN (first_page->>'id',second_page->>'id')
     OR ((third_page->>'sentAt')::timestamptz,(third_page->>'id')::uuid)>=
        ((second_page->>'sentAt')::timestamptz,(second_page->>'id')::uuid) THEN
    RAISE EXCEPTION 'C22 stable tuple cursor did not preserve the third message';
  END IF;
  IF EXISTS (
    SELECT 1 FROM trust.list_context_messages_api_v1(
      appointment_id,'1900-01-01T00:00:00Z','f0101000-0000-4000-9000-000000000001',2
    )
  ) THEN
    RAISE EXCEPTION 'C22 stale cursor returned messages older than its stable tuple';
  END IF;

  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c22-foreign-pat-01',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('1',64),true);
  PERFORM pg_catalog.set_config('shifaa.person_id',other_patient_id::text,true);
  denied := false;
  BEGIN
    PERFORM trust.list_context_messages_api_v1(appointment_id,NULL,NULL,10);
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C22 cross-patient history read was allowed'; END IF;

  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000004',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','GUA',true);
  denied := false;
  BEGIN
    PERFORM trust.list_context_messages_api_v1(appointment_id,NULL,NULL,10);
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C22 guardian history read was allowed'; END IF;

  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000005',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','DEL',true);
  denied := false;
  BEGIN
    PERFORM trust.list_context_messages_api_v1(appointment_id,NULL,NULL,10);
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C22 delegate history read was allowed'; END IF;

  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000003',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','CLN',true);
  denied := false;
  BEGIN
    PERFORM trust.send_context_message_api_v1(appointment_id,
      pg_catalog.jsonb_build_object('bodyCiphertext',ciphertext_value));
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C22 ended CLN participant could send a message'; END IF;

  -- Persist a valid cursor and protected response across distinct request
  -- transactions in this fixture transaction. The harness later revokes CLN
  -- membership between page/replay calls before rolling everything back.
  PERFORM pg_catalog.set_config('shifaa.person_id',clinician_id::text,true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','CLN',true);
  PERFORM pg_catalog.set_config('shifaa.action','listContextMessages',true);
  SELECT projection INTO first_page
  FROM trust.list_context_messages_api_v1(appointment_id,NULL,NULL,1);
  cursor_sent_at := (first_page->>'sentAt')::timestamptz;
  cursor_id := (first_page->>'id')::uuid;
  PERFORM pg_catalog.set_config('shifaa.test_c22_cursor_sent_at',cursor_sent_at::text,true);
  PERFORM pg_catalog.set_config('shifaa.test_c22_cursor_id',cursor_id::text,true);
  PERFORM pg_catalog.set_config('shifaa.test_c22_patient_response',patient_response::text,true);
  PERFORM pg_catalog.set_config('shifaa.test_c22_clinician_response',clinician_response::text,true);
  PERFORM pg_catalog.set_config('shifaa.test_c22_active_cln_response',ended_clinician_response::text,true);
END
$feature_010_c22_online_vectors$;

DO $feature_010_c22_post_insert_failure$
DECLARE
  appointment_id constant uuid := 'f0101000-0000-4000-8500-000000000004';
  patient_id constant uuid := 'f0101000-0000-4000-8000-000000000002';
  ciphertext_value text := pg_catalog.replace(pg_catalog.replace(
    pg_catalog.encode(pg_catalog.decode('01'||pg_catalog.repeat('d1',12)||pg_catalog.repeat('e2',16)||pg_catalog.repeat('f3',96),'hex'),'base64'),
    E'\n',''),E'\r','');
  denied boolean := false;
BEGIN
  PERFORM pg_catalog.set_config('shifaa.person_id',patient_id::text,true);
  PERFORM pg_catalog.set_config('shifaa.environment','local',true);
  PERFORM pg_catalog.set_config('shifaa.test_now','2030-04-05T08:00:00Z',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','PAT',true);
  PERFORM pg_catalog.set_config('shifaa.action','sendContextMessage',true);
  PERFORM pg_catalog.set_config('shifaa.aal','2',true);
  PERFORM pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c22-injected-post-insert-failure',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('7',64),true);
  PERFORM pg_catalog.set_config('shifaa.test_c22_fail_after_insert','true',true);
  BEGIN
    PERFORM trust.send_context_message_api_v1(appointment_id,
      pg_catalog.jsonb_build_object('bodyCiphertext',ciphertext_value));
  EXCEPTION WHEN check_violation THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C22 injected post-insert outbox failure did not surface'; END IF;
END
$feature_010_c22_post_insert_failure$;
RESET SESSION AUTHORIZATION;
DROP TRIGGER test_c22_fail_outbox_v1 ON platform.outbox_events;
DROP FUNCTION platform.test_c22_fail_outbox_v1();

UPDATE identity.facility_memberships
SET membership_status='suspended'
WHERE facility_id='f0101000-0000-4000-8200-000000000001'
  AND person_id='f0101000-0000-4000-8000-000000000001' AND role_code='doctor';
SET SESSION AUTHORIZATION shifaa_api;
DO $feature_010_c22_replay_authority$
DECLARE
  appointment_id constant uuid := 'f0101000-0000-4000-8500-000000000004';
  clinician_id constant uuid := 'f0101000-0000-4000-8000-000000000001';
  patient_response jsonb := pg_catalog.current_setting('shifaa.test_c22_patient_response')::jsonb;
  clinician_response jsonb := pg_catalog.current_setting('shifaa.test_c22_clinician_response')::jsonb;
  denied boolean;
BEGIN
  PERFORM pg_catalog.set_config('shifaa.person_id',clinician_id::text,true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','CLN',true);
  PERFORM pg_catalog.set_config('shifaa.action','listContextMessages',true);
  denied := false;
  BEGIN
    PERFORM trust.list_context_messages_api_v1(
      appointment_id,
      pg_catalog.current_setting('shifaa.test_c22_cursor_sent_at')::timestamptz,
      pg_catalog.current_setting('shifaa.test_c22_cursor_id')::uuid,
      10
    );
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C22 next page succeeded after live clinician membership revocation'; END IF;

  PERFORM pg_catalog.set_config('shifaa.action','sendContextMessage',true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c22-clinician-send-01',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('f',64),true);
  denied := false;
  BEGIN
    PERFORM trust.send_context_message_api_v1(appointment_id,
      pg_catalog.jsonb_build_object('bodyCiphertext',clinician_response->>'bodyCiphertext'));
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C22 exact send replay succeeded after live clinician revocation'; END IF;

  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000002',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','PAT',true);
  PERFORM pg_catalog.set_config('shifaa.action','listContextMessages',true);
  IF NOT EXISTS (SELECT 1 FROM trust.list_context_messages_api_v1(appointment_id,NULL,NULL,10)) THEN
    RAISE EXCEPTION 'C22 PAT lost access when only CLN workforce authority was revoked';
  END IF;
  IF patient_response->>'id' IS NULL THEN RAISE EXCEPTION 'C22 protected PAT response is missing'; END IF;
END
$feature_010_c22_replay_authority$;
RESET SESSION AUTHORIZATION;

UPDATE identity.facility_memberships
SET membership_status='active'
WHERE facility_id='f0101000-0000-4000-8200-000000000001'
  AND person_id='f0101000-0000-4000-8000-000000000001' AND role_code='doctor';
SET SESSION AUTHORIZATION shifaa_api;
DO $feature_010_c22_completion_cutoff$
DECLARE
  appointment_id constant uuid := 'f0101000-0000-4000-8500-000000000004';
  encounter_id constant uuid := 'f0101000-0000-4000-8800-000000000002';
  clinician_id constant uuid := 'f0101000-0000-4000-8000-000000000001';
  patient_id constant uuid := 'f0101000-0000-4000-8000-000000000002';
  ciphertext_value text := pg_catalog.replace(pg_catalog.replace(
    pg_catalog.encode(pg_catalog.decode('01'||pg_catalog.repeat('d1',12)||pg_catalog.repeat('e2',16)||pg_catalog.repeat('f3',96),'hex'),'base64'),
    E'\n',''),E'\r','');
  denied boolean;
BEGIN
  PERFORM pg_catalog.set_config('shifaa.person_id',clinician_id::text,true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','CLN',true);
  PERFORM pg_catalog.set_config('shifaa.action','completeEncounter',true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c22-complete-context-01',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('2',64),true);
  PERFORM clinical.complete_encounter_api_v1(encounter_id,6,
    pg_catalog.jsonb_build_object('summary','C22 SQL completion cutoff fixture','structuralConfirmation',true));

  PERFORM pg_catalog.set_config('shifaa.person_id',patient_id::text,true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','PAT',true);
  PERFORM pg_catalog.set_config('shifaa.action','listContextMessages',true);
  denied := false;
  BEGIN
    PERFORM trust.list_context_messages_api_v1(appointment_id,NULL,NULL,10);
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C22 completed encounter retained message history access'; END IF;

  PERFORM pg_catalog.set_config('shifaa.action','sendContextMessage',true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c22-after-completion-01',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('3',64),true);
  denied := false;
  BEGIN
    PERFORM trust.send_context_message_api_v1(appointment_id,
      pg_catalog.jsonb_build_object('bodyCiphertext',ciphertext_value));
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C22 completed encounter accepted a new message'; END IF;
END
$feature_010_c22_completion_cutoff$;
RESET SESSION AUTHORIZATION;

DO $feature_010_c22_atomic_effects$
DECLARE
  appointment_id constant uuid := 'f0101000-0000-4000-8500-000000000004';
  patient_response jsonb := pg_catalog.current_setting('shifaa.test_c22_patient_response')::jsonb;
  ciphertext_value text := patient_response->>'bodyCiphertext';
  protected_message jsonb;
BEGIN
  SELECT response_body INTO protected_message
  FROM platform.idempotency_records
  WHERE method='POST'
    AND route_template='/v1/contexts/{contextType}/{contextId}/messages'
    AND resource_id=(patient_response->>'id')::uuid
    AND state='completed';
  IF protected_message IS DISTINCT FROM patient_response
     OR protected_message ? 'body'
     OR protected_message->>'bodyCiphertext' IS DISTINCT FROM ciphertext_value THEN
    RAISE EXCEPTION 'C22 stored canonical response is not ciphertext-only';
  END IF;
  IF (SELECT count(*) FROM trust.messages
      WHERE context_id=appointment_id AND deleted_at IS NULL)<>3
     OR (SELECT count(*) FROM trust.messages
      WHERE context_id=appointment_id AND attachment IS NULL)<>3
     OR (SELECT count(*) FROM platform.idempotency_records
      WHERE method='POST' AND route_template='/v1/contexts/{contextType}/{contextId}/messages'
        AND state='completed' AND resource_type='context_message')<>3
     OR (SELECT count(*) FROM audit.events
      WHERE resource_type='context_message' AND action_code='context_message.created')<>3
     OR (SELECT count(*) FROM platform.outbox_events
      WHERE aggregate_type='context_message' AND event_type='clinical.context_message.created.v1')<>3 THEN
    RAISE EXCEPTION 'C22 successful sends did not write exactly one message, idempotency, audit, and outbox effect';
  END IF;
  IF EXISTS (
    SELECT 1 FROM platform.outbox_events event
    WHERE event.aggregate_type='context_message'
      AND event.event_type='clinical.context_message.created.v1'
      AND ((event.payload ? 'body' OR event.payload ? 'bodyCiphertext')
        OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(event.payload))<>2
        OR event.payload->>'aggregateId'<>event.aggregate_id::text
        OR (event.payload->>'version')::integer<>1)
  ) OR EXISTS (
    SELECT 1 FROM audit.events event
    WHERE event.resource_type='context_message'
      AND event.action_code='context_message.created'
      AND pg_catalog.strpos(pg_catalog.to_jsonb(event)::text,ciphertext_value)>0
  ) OR EXISTS (
    SELECT 1 FROM platform.outbox_events event
    WHERE event.aggregate_type='context_message'
      AND event.event_type='clinical.context_message.created.v1'
      AND pg_catalog.strpos(pg_catalog.to_jsonb(event)::text,ciphertext_value)>0
  ) OR EXISTS (
    SELECT 1 FROM platform.idempotency_records record
    WHERE record.method='POST'
      AND record.route_template='/v1/contexts/{contextType}/{contextId}/messages'
      AND record.resource_id=(patient_response->>'id')::uuid
      AND pg_catalog.strpos((pg_catalog.to_jsonb(record)-'response_body')::text,ciphertext_value)>0
  ) THEN
    RAISE EXCEPTION 'C22 audit, outbox, or idempotency metadata contains message ciphertext';
  END IF;
  IF EXISTS (
    SELECT 1 FROM platform.idempotency_records
    WHERE method='POST'
      AND route_template='/v1/contexts/{contextType}/{contextId}/messages'
      AND key_hash IN (
        pg_catalog.encode(audit.sha256_v1(pg_catalog.convert_to('shifaa:idempotency:key:v1:'||pg_catalog.octet_length('f010-c22-attachment-null-01')||':f010-c22-attachment-null-01','UTF8')),'hex'),
        pg_catalog.encode(audit.sha256_v1(pg_catalog.convert_to('shifaa:idempotency:key:v1:'||pg_catalog.octet_length('f010-c22-bad-cipher-01')||':f010-c22-bad-cipher-01','UTF8')),'hex'),
        pg_catalog.encode(audit.sha256_v1(pg_catalog.convert_to('shifaa:idempotency:key:v1:'||pg_catalog.octet_length('f010-c22-low-aal-01')||':f010-c22-low-aal-01','UTF8')),'hex'),
        pg_catalog.encode(audit.sha256_v1(pg_catalog.convert_to('shifaa:idempotency:key:v1:'||pg_catalog.octet_length('f010-c22-after-completion-01')||':f010-c22-after-completion-01','UTF8')),'hex'),
        pg_catalog.encode(audit.sha256_v1(pg_catalog.convert_to('shifaa:idempotency:key:v1:'||pg_catalog.octet_length('f010-c22-ended-cln-send-02')||':f010-c22-ended-cln-send-02','UTF8')),'hex'),
        pg_catalog.encode(audit.sha256_v1(pg_catalog.convert_to('shifaa:idempotency:key:v1:'||pg_catalog.octet_length('f010-c22-injected-post-insert-failure')||':f010-c22-injected-post-insert-failure','UTF8')),'hex')
      )
  ) THEN
    RAISE EXCEPTION 'C22 rejected/unauthorized requests left idempotency records';
  END IF;
END
$feature_010_c22_atomic_effects$;
