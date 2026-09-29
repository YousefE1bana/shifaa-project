-- C17 vectors are appended to the C10 fixture in one disposable transaction.
-- The source encounter, participant, licensed clinicians, and private note are
-- seeded by feature-010-api.sql; online assertions still execute as shifaa_api.
DO $feature_010_c17_api_boundary$
BEGIN
  IF pg_catalog.to_regprocedure('clinical.create_referral_api_v1(uuid,jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('clinical.list_referrals_api_v1(text,uuid,integer,uuid,uuid,text,text,date)') IS NULL THEN
    RAISE EXCEPTION 'F010_C17_MISSING_API: locked create/list referral entrypoints';
  END IF;
  IF NOT pg_catalog.has_function_privilege('shifaa_api','clinical.create_referral_api_v1(uuid,jsonb)','EXECUTE')
     OR NOT pg_catalog.has_function_privilege('shifaa_api','clinical.list_referrals_api_v1(text,uuid,integer,uuid,uuid,text,text,date)','EXECUTE')
     OR pg_catalog.has_table_privilege('shifaa_api','clinical.referrals','SELECT,INSERT,UPDATE,DELETE')
     OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_proc procedure_row
       CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(procedure_row.proacl,pg_catalog.acldefault('f',procedure_row.proowner))) privilege
       WHERE procedure_row.oid IN (
         'clinical.create_referral_api_v1(uuid,jsonb)'::regprocedure,
         'clinical.list_referrals_api_v1(text,uuid,integer,uuid,uuid,text,text,date)'::regprocedure
       )
         AND privilege.grantee=0 AND privilege.privilege_type='EXECUTE'
     ) THEN
    RAISE EXCEPTION 'C17 execute grants are not narrow or the online role has direct referral table access';
  END IF;
END
$feature_010_c17_api_boundary$;

SET SESSION AUTHORIZATION shifaa_api;
DO $feature_010_c17_api_vectors$
DECLARE
  source_encounter_id constant uuid := 'f0101000-0000-4000-8800-000000000002';
  request jsonb := jsonb_build_object(
    'targetSpecialty','  cardiology  ',
    'targetFacilityId','f0101000-0000-4000-8200-000000000001',
    'targetDoctorId','f0101000-0000-4000-8000-000000000003',
    'reasonSummary','  C17 referral reason only; never a note body.  ',
    'encounterType','consultation'
  );
  created jsonb;
  replayed jsonb;
  source_projection jsonb;
  denied boolean;
  visible_count integer;
BEGIN
  IF session_user<>'shifaa_api' OR current_user<>'shifaa_api'
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'C17 assertions must run with non-owner, non-BYPASSRLS shifaa_api';
  END IF;
  IF pg_catalog.has_table_privilege(current_user,'clinical.referrals','SELECT,INSERT,UPDATE,DELETE')
     OR pg_catalog.has_table_privilege(current_user,'clinical.encounters','SELECT,INSERT,UPDATE,DELETE')
     OR pg_catalog.has_table_privilege(current_user,'clinical.encounter_participants','SELECT,INSERT,UPDATE,DELETE')
     OR pg_catalog.has_table_privilege(current_user,'clinical.clinical_notes','SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'C17 online role has direct clinical table privileges';
  END IF;

  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000001',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','CLN',true);
  PERFORM pg_catalog.set_config('shifaa.action','createReferral',true);
  PERFORM pg_catalog.set_config('shifaa.aal','2',true);
  PERFORM pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);
  PERFORM pg_catalog.set_config('shifaa.request_id','f0101000-0000-4000-9000-000000000041',true);
  PERFORM pg_catalog.set_config('shifaa.trace_id','f0101000-0000-4000-9000-000000000041',true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c17-create-referral-001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('1',64),true);
  SELECT clinical.create_referral_api_v1(source_encounter_id,request) INTO created;
  IF created->>'sourceEncounterId'<>source_encounter_id::text
     OR created->>'status'<>'pending'
     OR created->>'version'<>'1'
     OR created->>'targetSpecialty'<>'cardiology'
     OR created->>'reasonSummary'<>'C17 referral reason only; never a note body.'
     OR created->>'encounterType'<>'consultation'
     OR created->>'targetFacilityId'<>'f0101000-0000-4000-8200-000000000001'
     OR created->>'targetDoctorId'<>'f0101000-0000-4000-8000-000000000003'
     OR created ? 'appointmentId' OR created ? 'resultingAppointmentId'
     OR created ? 'notes' OR created ? 'privateNoteMetadata' OR created ? 'bodyCiphertext'
     OR created::text LIKE '%8900-000000000001%' OR created::text LIKE '%body_ciphertext%' THEN
    RAISE EXCEPTION 'C17 createReferral returned an invalid or overbroad pending source projection: %',created;
  END IF;
  PERFORM pg_catalog.set_config('shifaa.test_c17_response',created::text,true);
  PERFORM pg_catalog.set_config('shifaa.test_c17_referral_id',created->>'id',true);

  SELECT clinical.create_referral_api_v1(source_encounter_id,request) INTO replayed;
  IF replayed IS DISTINCT FROM created OR replayed::text IS DISTINCT FROM created::text THEN
    RAISE EXCEPTION 'C17 exact same-key/body replay changed the canonical stored response';
  END IF;

  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('2',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.create_referral_api_v1(
      source_encounter_id,request || jsonb_build_object('reasonSummary','Changed reason with same key')
    );
  EXCEPTION WHEN unique_violation THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C17 accepted changed-body idempotency-key reuse'; END IF;

  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c17-required-fields-001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('3',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.create_referral_api_v1(source_encounter_id,jsonb_build_object('reasonSummary','Missing specialty'));
  EXCEPTION WHEN invalid_parameter_value THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C17 accepted a request missing targetSpecialty'; END IF;

  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c17-encounter-type-mismatch-001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('4',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.create_referral_api_v1(
      source_encounter_id,request || jsonb_build_object('encounterType','follow_up')
    );
  EXCEPTION WHEN invalid_parameter_value THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C17 accepted an encounterType different from the locked source'; END IF;

  PERFORM pg_catalog.set_config('shifaa.actor_role','CLN',true);
  PERFORM pg_catalog.set_config('shifaa.action','listReferrals',true);
  SELECT count(*),(pg_catalog.array_agg(result.projection))[1]
    INTO visible_count,source_projection
  FROM clinical.list_referrals_api_v1(NULL,NULL,101,NULL,NULL,NULL,NULL,NULL) result
  WHERE result.referral_id=(created->>'id')::uuid;
  IF visible_count<>1 OR source_projection->>'id' IS DISTINCT FROM created->>'id'
     OR source_projection->>'status'<>'pending'
     OR source_projection ? 'appointmentId' OR source_projection ? 'notes'
     OR source_projection ? 'privateNoteMetadata' OR source_projection ? 'bodyCiphertext' THEN
    RAISE EXCEPTION 'C17 source clinician list did not return only the pending source projection';
  END IF;

  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000003',true);
  SELECT count(*) INTO visible_count
  FROM clinical.list_referrals_api_v1(NULL,NULL,101,NULL,NULL,NULL,NULL,NULL) result
  WHERE result.referral_id=(created->>'id')::uuid;
  IF visible_count<>0 THEN RAISE EXCEPTION 'C17 target clinician saw a pending referral'; END IF;

  PERFORM pg_catalog.set_config('shifaa.action','createReferral',true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c17-unrelated-clinician-001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('9',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.create_referral_api_v1(source_encounter_id,request);
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C17 unrelated target clinician created a referral for the source encounter'; END IF;

  -- Complete the source encounter through its existing C13 boundary so the
  -- stale-state vector also verifies that C17 does not bypass encounter state.
  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000001',true);
  PERFORM pg_catalog.set_config('shifaa.action','completeEncounter',true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c17-complete-source-001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('5',64),true);
  PERFORM clinical.complete_encounter_api_v1(
    source_encounter_id,1,jsonb_build_object('summary','C17 stale source setup','structuralConfirmation',true)
  );
  PERFORM pg_catalog.set_config('shifaa.action','createReferral',true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c17-stale-source-001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('6',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.create_referral_api_v1(source_encounter_id,request);
  EXCEPTION WHEN SQLSTATE '55000' THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C17 accepted a referral after source encounter completion'; END IF;

  PERFORM pg_catalog.set_config('shifaa.action','listReferrals',true);
  PERFORM pg_catalog.set_config('shifaa.purposes','',true);
  denied := false;
  BEGIN
    PERFORM count(*) FROM clinical.list_referrals_api_v1(NULL,NULL,101,NULL,NULL,NULL,NULL,NULL);
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C17 listReferrals accepted missing purpose'; END IF;

  PERFORM pg_catalog.set_config('shifaa.action','createReferral',true);
  PERFORM pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);
  PERFORM pg_catalog.set_config('shifaa.aal','1',true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c17-low-aal-001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('7',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.create_referral_api_v1(source_encounter_id,request);
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C17 createReferral accepted below AAL2'; END IF;

  PERFORM pg_catalog.set_config('shifaa.aal','2',true);
  PERFORM pg_catalog.set_config('shifaa.purposes','',true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c17-no-purpose-001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('8',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.create_referral_api_v1(source_encounter_id,request);
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C17 createReferral accepted missing purpose'; END IF;
END
$feature_010_c17_api_vectors$;
RESET SESSION AUTHORIZATION;

DO $feature_010_c17_atomic_effects$
DECLARE
  expected_source_encounter_id constant uuid := 'f0101000-0000-4000-8800-000000000002';
  referral_id uuid := pg_catalog.current_setting('shifaa.test_c17_referral_id')::uuid;
  stored_response jsonb := pg_catalog.current_setting('shifaa.test_c17_response')::jsonb;
  expected_key_hash text := pg_catalog.encode(audit.sha256_v1(pg_catalog.convert_to(
    'shifaa:idempotency:key:v1:'||pg_catalog.octet_length('f010-c17-create-referral-001')||':f010-c17-create-referral-001','UTF8')),'hex');
BEGIN
  IF (SELECT count(*) FROM clinical.referrals referral WHERE referral.id=referral_id AND referral.source_encounter_id=expected_source_encounter_id
      AND status='pending' AND resulting_appointment_id IS NULL AND encounter_type='consultation')<>1 THEN
    RAISE EXCEPTION 'C17 pending referral storage or required NULL appointment invariant failed';
  END IF;
  IF (SELECT count(*) FROM audit.events WHERE resource_type='referral'
      AND action_code='referral.pending' AND resource_id=referral_id)<>1
     OR (SELECT count(*) FROM platform.outbox_events WHERE aggregate_type='referral'
      AND event_type='clinical.referral.pending.v1' AND aggregate_id=referral_id
      AND payload=pg_catalog.jsonb_build_object('aggregateId',referral_id,'version',1))<>1 THEN
    RAISE EXCEPTION 'C17 success must write exactly one referral audit event and PHI-free outbox event';
  END IF;
  IF (SELECT count(*) FROM platform.idempotency_records record
      WHERE record.method='POST'
        AND record.route_template='/v1/encounters/{encounterId}/referrals'
        AND record.key_hash=expected_key_hash AND record.state='completed'
        AND record.response_status=201 AND record.resource_type='referral'
        AND record.resource_id=referral_id AND record.response_body=stored_response)<>1 THEN
    RAISE EXCEPTION 'C17 success must store exactly one canonical idempotency response';
  END IF;
  IF (SELECT count(*) FROM clinical.referrals referral WHERE referral.source_encounter_id=expected_source_encounter_id)<>1
     OR (SELECT count(*) FROM audit.events WHERE resource_type='referral' AND action_code='referral.pending')<>1
     OR (SELECT count(*) FROM platform.outbox_events WHERE aggregate_type='referral' AND event_type='clinical.referral.pending.v1')<>1
     OR (SELECT count(*) FROM platform.idempotency_records WHERE method='POST' AND route_template='/v1/encounters/{encounterId}/referrals')<>1 THEN
    RAISE EXCEPTION 'C17 replay or rejected requests left duplicate or partial referral/audit/outbox/idempotency effects';
  END IF;
END
$feature_010_c17_atomic_effects$;
