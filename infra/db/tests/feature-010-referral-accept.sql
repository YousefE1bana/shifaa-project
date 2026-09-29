-- C18 T052 vectors run after the C10/C17 fixture in one disposable transaction.
-- The fixture mutations run as owner; every acceptReferral call runs as shifaa_api.
DO $feature_010_c18_acceptance_fixture$
DECLARE
  source_encounter_id constant uuid := 'f0101000-0000-4000-8800-000000000002';
  patient_record_id constant uuid := 'f0101000-0000-4000-8100-000000000001';
  source_clinician_id constant uuid := 'f0101000-0000-4000-8000-000000000001';
  doctor_license_id constant uuid := 'f0101000-0000-4000-8300-000000000002';
  schedule_id constant uuid := 'f0101000-0000-4000-8400-000000000002';
  other_facility_schedule_id constant uuid := 'f0101000-0000-4000-8400-000000000003';
  other_facility_id constant uuid := 'f0101000-0000-4000-8200-000000000002';
BEGIN
  UPDATE identity.professional_licenses
  SET specialty_code='cardiology'
  WHERE id=doctor_license_id;
  UPDATE identity.professional_licenses
  SET specialty_code='neurology'
  WHERE id='f0101000-0000-4000-8300-000000000001';

  INSERT INTO identity.facilities(
    id,facility_type,name_ar,name_en,facility_status,governorate_code,city,district,address_line,created_by_person_id
  ) VALUES (
    other_facility_id,'clinic','عيادة C18 الثانية','F010 C18 second clinic','active','C','Cairo','Test','Synthetic second address',source_clinician_id
  );
  INSERT INTO identity.facility_memberships(
    facility_id,person_id,role_code,employment_license_id,valid_from,membership_status,created_by_person_id
  ) VALUES (
    other_facility_id,'f0101000-0000-4000-8000-000000000003','doctor',doctor_license_id,'2020-01-01','active',source_clinician_id
  );

  INSERT INTO clinical.schedules(
    id,facility_id,doctor_person_id,timezone_name,valid_from,valid_to,slot_duration_minutes,
    fee_minor_units,currency_code,created_by_person_id,updated_by_person_id
  ) VALUES
    (schedule_id,'f0101000-0000-4000-8200-000000000001','f0101000-0000-4000-8000-000000000003','Africa/Cairo','2030-04-01','2030-04-30',30,12500,'EGP',source_clinician_id,source_clinician_id),
    (other_facility_schedule_id,other_facility_id,'f0101000-0000-4000-8000-000000000003','Africa/Cairo','2030-04-01','2030-04-30',30,15000,'EGP',source_clinician_id,source_clinician_id);
  PERFORM pg_catalog.set_config('shifaa.schedule_initializing','true',true);
  INSERT INTO clinical.schedule_windows(schedule_id,iso_weekday,local_start,local_end) VALUES
    (schedule_id,5,'13:00','15:00'),
    (other_facility_schedule_id,5,'13:00','15:00');
  PERFORM pg_catalog.set_config('shifaa.schedule_initializing','false',true);
  PERFORM pg_catalog.set_config(
    'shifaa.test_c18_schedule_version',
    (SELECT version::text FROM clinical.schedules WHERE id=schedule_id),
    true
  );

  INSERT INTO clinical.referrals(
    id,source_encounter_id,patient_id,requester_person_id,target_specialty,
    target_facility_id,target_doctor_person_id,reason_summary,encounter_type
  ) VALUES
    ('f0101000-0000-4000-8a00-000000000001',source_encounter_id,patient_record_id,source_clinician_id,'cardiology','f0101000-0000-4000-8200-000000000001','f0101000-0000-4000-8000-000000000003','C18 PAT reason','consultation'),
    ('f0101000-0000-4000-8a00-000000000002',source_encounter_id,patient_record_id,source_clinician_id,'cardiology','f0101000-0000-4000-8200-000000000001','f0101000-0000-4000-8000-000000000003','C18 guardian reason','consultation'),
    ('f0101000-0000-4000-8a00-000000000003',source_encounter_id,patient_record_id,source_clinician_id,'cardiology','f0101000-0000-4000-8200-000000000001','f0101000-0000-4000-8000-000000000003','C18 delegate reason','consultation'),
    ('f0101000-0000-4000-8a00-000000000004',source_encounter_id,patient_record_id,source_clinician_id,'cardiology','f0101000-0000-4000-8200-000000000001','f0101000-0000-4000-8000-000000000003','C18 stale referral version','consultation'),
    ('f0101000-0000-4000-8a00-000000000005',source_encounter_id,patient_record_id,source_clinician_id,'cardiology','f0101000-0000-4000-8200-000000000001','f0101000-0000-4000-8000-000000000003','C18 wrong facility','consultation'),
    ('f0101000-0000-4000-8a00-000000000006',source_encounter_id,patient_record_id,source_clinician_id,'cardiology','f0101000-0000-4000-8200-000000000001','f0101000-0000-4000-8000-000000000003','C18 wrong doctor','consultation'),
    ('f0101000-0000-4000-8a00-000000000007',source_encounter_id,patient_record_id,source_clinician_id,'neurology','f0101000-0000-4000-8200-000000000001','f0101000-0000-4000-8000-000000000003','C18 wrong specialty','consultation'),
    ('f0101000-0000-4000-8a00-000000000008',source_encounter_id,patient_record_id,source_clinician_id,'cardiology','f0101000-0000-4000-8200-000000000001','f0101000-0000-4000-8000-000000000003','C18 stale availability version','consultation'),
    ('f0101000-0000-4000-8a00-000000000009',source_encounter_id,patient_record_id,source_clinician_id,'cardiology','f0101000-0000-4000-8200-000000000001','f0101000-0000-4000-8000-000000000003','C18 unavailable effective slot','consultation'),
    ('f0101000-0000-4000-8a00-00000000000a',source_encounter_id,patient_record_id,source_clinician_id,'cardiology','f0101000-0000-4000-8200-000000000001','f0101000-0000-4000-8000-000000000003','C18 client-owned pricing','consultation'),
    ('f0101000-0000-4000-8a00-00000000000b',source_encounter_id,patient_record_id,source_clinician_id,'cardiology','f0101000-0000-4000-8200-000000000001','f0101000-0000-4000-8000-000000000003','C18 unauthorized actor','consultation'),
    ('f0101000-0000-4000-8a00-00000000000c',source_encounter_id,patient_record_id,source_clinician_id,'cardiology','f0101000-0000-4000-8200-000000000001','f0101000-0000-4000-8000-000000000003','C18 ended guardianship','consultation'),
    ('f0101000-0000-4000-8a00-00000000000d',source_encounter_id,patient_record_id,source_clinician_id,'cardiology','f0101000-0000-4000-8200-000000000001','f0101000-0000-4000-8000-000000000003','C18 revoked delegation','consultation'),
    ('f0101000-0000-4000-8a00-00000000000e',source_encounter_id,patient_record_id,source_clinician_id,'cardiology','f0101000-0000-4000-8200-000000000001','f0101000-0000-4000-8000-000000000003','C18 inactive target membership','consultation'),
    ('f0101000-0000-4000-8a00-00000000000f',source_encounter_id,patient_record_id,source_clinician_id,'cardiology','f0101000-0000-4000-8200-000000000001','f0101000-0000-4000-8000-000000000003','C18 one-winner concurrency fixture','consultation'),
    ('f0101000-0000-4000-8a00-000000000010',source_encounter_id,patient_record_id,source_clinician_id,'cardiology',NULL,NULL,'C18 target resolved from selected slot','consultation'),
    ('f0101000-0000-4000-8a00-000000000011',source_encounter_id,patient_record_id,source_clinician_id,'cardiology',NULL,NULL,'C18 omitted encounter type preview',NULL),
    ('f0101000-0000-4000-8a00-000000000012',source_encounter_id,patient_record_id,source_clinician_id,'cardiology','f0101000-0000-4000-8200-000000000001','f0101000-0000-4000-8000-000000000003','C18 effective but booked slot','consultation'),
    ('f0101000-0000-4000-8a00-000000000013',source_encounter_id,patient_record_id,source_clinician_id,'cardiology','f0101000-0000-4000-8200-000000000001','f0101000-0000-4000-8000-000000000003','C18 expired delegate authority','consultation');
END
$feature_010_c18_acceptance_fixture$;

DO $feature_010_c18_acceptance_boundary$
BEGIN
  IF pg_catalog.to_regprocedure('clinical.accept_referral_api_v1(uuid,integer,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'F010_C18_MISSING_API: clinical.accept_referral_api_v1(uuid,integer,jsonb)';
  END IF;
  IF NOT pg_catalog.has_function_privilege('shifaa_api','clinical.accept_referral_api_v1(uuid,integer,jsonb)','EXECUTE')
     OR pg_catalog.has_table_privilege('shifaa_api','clinical.referrals','SELECT,INSERT,UPDATE,DELETE')
     OR pg_catalog.has_table_privilege('shifaa_api','clinical.appointments','SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'C18 acceptance API must have one narrow execute grant and no direct clinical table access';
  END IF;
END
$feature_010_c18_acceptance_boundary$;

SET SESSION AUTHORIZATION shifaa_api;
DO $feature_010_c18_acceptance_vectors$
DECLARE
  pat_response jsonb;
  guardian_response jsonb;
  delegate_response jsonb;
  replayed jsonb;
  slot_1300 jsonb;
  slot_1330 jsonb;
  slot_1400 jsonb;
  slot_1430 jsonb;
  slot_other_facility jsonb;
  slot_unavailable jsonb;
  availability_version integer;
  denied boolean;
  target_projection jsonb;
  list_projection jsonb;
  visible_count integer;
  hidden_error_text text;
  absent_error_text text;
  expected_reason_only jsonb := pg_catalog.jsonb_build_array('reason_summary');
  expected_reason_and_type jsonb := pg_catalog.jsonb_build_array('reason_summary','encounter_type');
BEGIN
  IF session_user<>'shifaa_api' OR current_user<>'shifaa_api'
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'C18 acceptance assertions must run with non-owner, non-BYPASSRLS shifaa_api';
  END IF;
  IF pg_catalog.has_table_privilege(current_user,'clinical.referrals','SELECT,INSERT,UPDATE,DELETE')
     OR pg_catalog.has_table_privilege(current_user,'clinical.appointments','SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'C18 API role has direct referral or appointment table privileges';
  END IF;

  availability_version := pg_catalog.current_setting('shifaa.test_c18_schedule_version')::integer;
  slot_1300 := pg_catalog.jsonb_build_object(
    'facilityId','f0101000-0000-4000-8200-000000000001',
    'doctorId','f0101000-0000-4000-8000-000000000003',
    'startsAt','2030-04-05T11:00:00Z','endsAt','2030-04-05T11:30:00Z',
    'timezone','Africa/Cairo','civilDate','2030-04-05','availabilityVersion',availability_version
  );
  slot_1330 := slot_1300 || pg_catalog.jsonb_build_object(
    'startsAt','2030-04-05T11:30:00Z','endsAt','2030-04-05T12:00:00Z'
  );
  slot_1400 := slot_1300 || pg_catalog.jsonb_build_object(
    'startsAt','2030-04-05T12:00:00Z','endsAt','2030-04-05T12:30:00Z'
  );
  slot_1430 := slot_1300 || pg_catalog.jsonb_build_object(
    'startsAt','2030-04-05T12:30:00Z','endsAt','2030-04-05T13:00:00Z'
  );
  slot_other_facility := slot_1300 || pg_catalog.jsonb_build_object(
    'facilityId','f0101000-0000-4000-8200-000000000002'
  );
  slot_unavailable := slot_1300 || pg_catalog.jsonb_build_object(
    'startsAt','2030-04-05T13:00:00Z','endsAt','2030-04-05T13:30:00Z'
  );

  PERFORM pg_catalog.set_config('shifaa.environment','local',true);
  PERFORM pg_catalog.set_config('shifaa.test_now','2030-04-05T08:00:00Z',true);
  PERFORM pg_catalog.set_config('shifaa.action','acceptReferral',true);
  PERFORM pg_catalog.set_config('shifaa.aal','2',true);
  PERFORM pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);
  PERFORM pg_catalog.set_config('shifaa.request_id','f0101000-0000-4000-9000-000000000071',true);
  PERFORM pg_catalog.set_config('shifaa.trace_id','f0101000-0000-4000-9000-000000000071',true);
  PERFORM pg_catalog.set_config('shifaa.action','listReferrals',true);
  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000003',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','CLN',true);
  target_projection := clinical.feature_010_referral_projection_v1('f0101000-0000-4000-8a00-000000000001');
  IF target_projection IS NOT NULL THEN
    RAISE EXCEPTION 'C18 target clinician saw a pending referral before acceptance';
  END IF;
  PERFORM pg_catalog.set_config('shifaa.action','acceptReferral',true);
  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000002',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','PAT',true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c18-accept-pat-001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('a',64),true);
  pat_response := clinical.accept_referral_api_v1(
    'f0101000-0000-4000-8a00-000000000001',1,
    pg_catalog.jsonb_build_object('authorizedFieldCodes',expected_reason_and_type,'targetSlot',slot_1300)
  );
  IF pat_response->'referral'->>'status'<>'accepted'
     OR pat_response->'referral'->>'version'<>'2'
     OR pat_response->'referral'->>'reasonSummary'<>'C18 PAT reason'
     OR pat_response->'referral'->>'encounterType'<>'consultation'
     OR pat_response->'referral'->'acceptedFieldCodes' IS DISTINCT FROM expected_reason_and_type
     OR pat_response->'appointment'->>'sourceReferralId'<>'f0101000-0000-4000-8a00-000000000001'
     OR pat_response->'appointment'->>'facilityId'<>'f0101000-0000-4000-8200-000000000001'
     OR pat_response->'appointment'->>'doctorId'<>'f0101000-0000-4000-8000-000000000003'
     OR pat_response->'appointment'->>'feeMinorUnits'<>'12500'
     OR pat_response->'appointment'->>'currency'<>'EGP'
     OR pat_response->'appointment'->>'paymentMethod'<>'cash_on_arrival'
     OR pat_response::text LIKE '%8900-000000000001%'
     OR pat_response::text LIKE '%private_note%' THEN
    RAISE EXCEPTION 'C18 PAT acceptance response did not preserve the exact two-field disclosure and server-owned booking projection: %',pat_response;
  END IF;
  PERFORM pg_catalog.set_config('shifaa.action','listReferrals',true);
  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000003',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','CLN',true);
  target_projection := clinical.feature_010_referral_projection_v1('f0101000-0000-4000-8a00-000000000001');
  IF target_projection IS NULL
     OR target_projection->>'reasonSummary'<>'C18 PAT reason'
     OR target_projection->>'encounterType'<>'consultation'
     OR target_projection ? 'sourceEncounterId'
     OR target_projection ? 'targetFacilityId' THEN
    RAISE EXCEPTION 'C18 target clinician did not receive only the selected accepted projection: %',target_projection;
  END IF;
  SELECT count(*),(pg_catalog.array_agg(result.projection))[1]
    INTO visible_count,list_projection
  FROM clinical.list_referrals_api_v1(NULL,NULL,101,NULL,NULL,NULL,NULL,NULL) result
  WHERE result.referral_id='f0101000-0000-4000-8a00-000000000001';
  IF visible_count<>1
     OR list_projection IS DISTINCT FROM pg_catalog.jsonb_build_object(
       'id','f0101000-0000-4000-8a00-000000000001',
       'status','accepted',
       'version',2,
       'acceptedFieldCodes',expected_reason_and_type,
       'resultingAppointmentId',target_projection->'resultingAppointmentId',
       'reasonSummary','C18 PAT reason',
       'encounterType','consultation'
     ) THEN
    RAISE EXCEPTION 'C19 listReferrals target projection exceeded the two accepted fields: %',list_projection;
  END IF;
  PERFORM pg_catalog.set_config('shifaa.action','acceptReferral',true);
  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000002',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','PAT',true);
  SELECT clinical.accept_referral_api_v1(
    'f0101000-0000-4000-8a00-000000000001',1,
    pg_catalog.jsonb_build_object('authorizedFieldCodes',expected_reason_and_type,'targetSlot',slot_1300)
  ) INTO replayed;
  IF replayed IS DISTINCT FROM pat_response THEN
    RAISE EXCEPTION 'C18 identical idempotency replay changed its canonical accepted response';
  END IF;

  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c18-stale-accepted-001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('d',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.accept_referral_api_v1(
      'f0101000-0000-4000-8a00-000000000001',1,
      pg_catalog.jsonb_build_object('authorizedFieldCodes',expected_reason_and_type,'targetSlot',slot_1300)
    );
  EXCEPTION WHEN serialization_failure THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C18 accepted a referral already completed at a newer version'; END IF;

  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000004',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','GUA',true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c18-accept-gua-001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('b',64),true);
  guardian_response := clinical.accept_referral_api_v1(
    'f0101000-0000-4000-8a00-000000000002',1,
    pg_catalog.jsonb_build_object('authorizedFieldCodes',expected_reason_only,'targetSlot',slot_1330)
  );
  IF guardian_response->'referral'->'acceptedFieldCodes' IS DISTINCT FROM expected_reason_only
     OR guardian_response->'referral' ? 'encounterType'
     OR guardian_response->'appointment'->>'feeMinorUnits'<>'12500' THEN
    RAISE EXCEPTION 'C18 current approved GUA acceptance exposed more than its one selected field or lost booking data';
  END IF;

  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000005',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','DEL',true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c18-accept-del-001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('c',64),true);
  delegate_response := clinical.accept_referral_api_v1(
    'f0101000-0000-4000-8a00-000000000003',1,
    pg_catalog.jsonb_build_object('authorizedFieldCodes',expected_reason_and_type,'targetSlot',slot_1400)
  );
  IF delegate_response->'referral'->'acceptedFieldCodes' IS DISTINCT FROM expected_reason_and_type
     OR delegate_response->'appointment'->>'paymentMethod'<>'cash_on_arrival' THEN
    RAISE EXCEPTION 'C18 current delegated acceptance did not honor the approved two-field disclosure and server payment method';
  END IF;

  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000002',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','PAT',true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c18-stale-referral-001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('d',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.accept_referral_api_v1(
      'f0101000-0000-4000-8a00-000000000004',2,
      pg_catalog.jsonb_build_object('authorizedFieldCodes',expected_reason_only,'targetSlot',slot_1400)
    );
  EXCEPTION WHEN serialization_failure THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C18 accepted a stale referral If-Match version'; END IF;

  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c18-wrong-facility-001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('e',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.accept_referral_api_v1(
      'f0101000-0000-4000-8a00-000000000005',1,
      pg_catalog.jsonb_build_object('authorizedFieldCodes',expected_reason_only,'targetSlot',slot_other_facility)
    );
  EXCEPTION WHEN invalid_parameter_value THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C18 accepted a slot from a facility outside the referral target'; END IF;

  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c18-wrong-doctor-001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('f',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.accept_referral_api_v1(
      'f0101000-0000-4000-8a00-000000000006',1,
      pg_catalog.jsonb_build_object('authorizedFieldCodes',expected_reason_only,'targetSlot',
        slot_1300 || pg_catalog.jsonb_build_object('doctorId','f0101000-0000-4000-8000-000000000001'))
    );
  EXCEPTION WHEN invalid_parameter_value THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C18 accepted a doctor outside the referral target'; END IF;

  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c18-wrong-specialty-001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('0',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.accept_referral_api_v1(
      'f0101000-0000-4000-8a00-000000000007',1,
      pg_catalog.jsonb_build_object('authorizedFieldCodes',expected_reason_only,'targetSlot',slot_1400)
    );
  EXCEPTION WHEN invalid_parameter_value THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C18 trusted a requested specialty that does not match the current licensed doctor'; END IF;

  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c18-stale-availability-001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('1',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.accept_referral_api_v1(
      'f0101000-0000-4000-8a00-000000000008',1,
      pg_catalog.jsonb_build_object('authorizedFieldCodes',expected_reason_only,'targetSlot',
        slot_1400 || pg_catalog.jsonb_build_object('availabilityVersion',availability_version+1))
    );
  EXCEPTION WHEN serialization_failure THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C18 accepted a stale target schedule availability version'; END IF;

  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c18-unavailable-slot-001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('2',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.accept_referral_api_v1(
      'f0101000-0000-4000-8a00-000000000009',1,
      pg_catalog.jsonb_build_object('authorizedFieldCodes',expected_reason_only,'targetSlot',slot_unavailable)
    );
  EXCEPTION WHEN serialization_failure OR exclusion_violation THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C18 accepted a slot absent from effective live availability'; END IF;

  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c18-booked-slot-001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('b',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.accept_referral_api_v1(
      'f0101000-0000-4000-8a00-000000000012',1,
      pg_catalog.jsonb_build_object('authorizedFieldCodes',expected_reason_only,'targetSlot',slot_1300)
    );
  EXCEPTION WHEN serialization_failure OR exclusion_violation THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C18 accepted an effective slot already booked by another referral'; END IF;

  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c18-absent-preview-field-001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('c',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.accept_referral_api_v1(
      'f0101000-0000-4000-8a00-000000000011',1,
      pg_catalog.jsonb_build_object('authorizedFieldCodes',expected_reason_and_type,'targetSlot',slot_1430)
    );
  EXCEPTION WHEN invalid_parameter_value THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C18 accepted encounter_type absent from the pending referral preview'; END IF;

  PERFORM pg_catalog.set_config('shifaa.action','listReferrals',true);
  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000003',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','CLN',true);
  IF clinical.feature_010_referral_projection_v1('f0101000-0000-4000-8a00-00000000000a') IS NOT NULL
     OR clinical.feature_010_referral_projection_v1('f0101000-0000-4000-8a00-000000000011') IS NOT NULL
     OR clinical.feature_010_referral_projection_v1('f0101000-0000-4000-8a00-000000000012') IS NOT NULL THEN
    RAISE EXCEPTION 'C18 exposed a target projection after failed acceptance';
  END IF;
  PERFORM pg_catalog.set_config('shifaa.action','acceptReferral',true);
  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000002',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','PAT',true);

  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c18-client-pricing-001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('3',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.accept_referral_api_v1(
      'f0101000-0000-4000-8a00-00000000000a',1,
      pg_catalog.jsonb_build_object('authorizedFieldCodes',expected_reason_only,'targetSlot',slot_unavailable,
        'feeMinorUnits',1,'currency','USD','paymentMethod','prepaid')
    );
  EXCEPTION WHEN invalid_parameter_value THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C18 accepted client-supplied fee, currency, or payment fields'; END IF;

  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c18-overdisclosure-001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('4',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.accept_referral_api_v1(
      'f0101000-0000-4000-8a00-00000000000a',1,
      pg_catalog.jsonb_build_object('authorizedFieldCodes',pg_catalog.jsonb_build_array('reason_summary','encounter_type','private_note'),'targetSlot',slot_unavailable)
    );
  EXCEPTION WHEN invalid_parameter_value THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C18 accepted more than the two contracted disclosure fields'; END IF;

  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000001',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','CLN',true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c18-unauthorized-actor-001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('5',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.accept_referral_api_v1(
      'f0101000-0000-4000-8a00-00000000000b',1,
      pg_catalog.jsonb_build_object('authorizedFieldCodes',expected_reason_only,'targetSlot',slot_1400)
    );
  EXCEPTION WHEN no_data_found THEN
    denied := true;
    GET STACKED DIAGNOSTICS hidden_error_text=MESSAGE_TEXT;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C18 accepted a treating clinician instead of the subject or current representative'; END IF;
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c18-absent-referral-001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('5',64),true);
  BEGIN
    PERFORM clinical.accept_referral_api_v1(
      'f0101000-0000-4000-8a00-000000000099',1,
      pg_catalog.jsonb_build_object('authorizedFieldCodes',expected_reason_only,'targetSlot',slot_1400)
    );
  EXCEPTION WHEN no_data_found THEN
    GET STACKED DIAGNOSTICS absent_error_text=MESSAGE_TEXT;
  END;
  IF absent_error_text IS DISTINCT FROM hidden_error_text THEN
    RAISE EXCEPTION 'C18 hidden and absent referrals have distinguishable acceptance denials';
  END IF;

  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000002',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','PAT',true);
  PERFORM pg_catalog.set_config('shifaa.aal','1',true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c18-low-aal-001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('6',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.accept_referral_api_v1(
      'f0101000-0000-4000-8a00-00000000000b',1,
      pg_catalog.jsonb_build_object('authorizedFieldCodes',expected_reason_only,'targetSlot',slot_1400)
    );
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C18 accepted below AAL2'; END IF;
  PERFORM pg_catalog.set_config('shifaa.aal','2',true);
  PERFORM pg_catalog.set_config('shifaa.purposes','',true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c18-no-purpose-001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('7',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.accept_referral_api_v1(
      'f0101000-0000-4000-8a00-00000000000b',1,
      pg_catalog.jsonb_build_object('authorizedFieldCodes',expected_reason_only,'targetSlot',slot_1400)
    );
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C18 accepted without a current purpose'; END IF;

  PERFORM pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);
  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000002',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','PAT',true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c18-accept-pat-001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('b',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.accept_referral_api_v1(
      'f0101000-0000-4000-8a00-000000000001',1,
      pg_catalog.jsonb_build_object('authorizedFieldCodes',expected_reason_only,'targetSlot',slot_1300)
    );
  EXCEPTION WHEN unique_violation THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C18 accepted changed-body reuse of a completed idempotency key'; END IF;

  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c18-unconstrained-target-001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('e',64),true);
  SELECT clinical.accept_referral_api_v1(
    'f0101000-0000-4000-8a00-000000000010',1,
    pg_catalog.jsonb_build_object('authorizedFieldCodes',expected_reason_only,'targetSlot',slot_1430)
  ) INTO replayed;
  IF replayed->'referral'->>'targetFacilityId'<>'f0101000-0000-4000-8200-000000000001'
     OR replayed->'referral'->>'targetDoctorId'<>'f0101000-0000-4000-8000-000000000003'
     OR replayed->'referral' ? 'encounterType' THEN
    RAISE EXCEPTION 'C18 did not persist authoritative selected target fields or omitted disclosure: %',replayed;
  END IF;
  PERFORM pg_catalog.set_config('shifaa.action','listReferrals',true);
  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000003',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','CLN',true);
  target_projection := clinical.feature_010_referral_projection_v1('f0101000-0000-4000-8a00-000000000010');
  IF target_projection IS NULL
     OR target_projection->>'reasonSummary'<>'C18 target resolved from selected slot'
     OR target_projection ? 'encounterType' THEN
    RAISE EXCEPTION 'C18 target projection did not remain within the selected reason-only disclosure: %',target_projection;
  END IF;
END
$feature_010_c18_acceptance_vectors$;
RESET SESSION AUTHORIZATION;

-- The delegator can set a validity end while the relationship remains active.
-- Acceptance must use that end at mutation time, then the fixture restores the
-- relationship so the separate permission-revocation vector stays isolated.
SELECT pg_catalog.set_config('shifaa.environment','local',true);
SELECT pg_catalog.set_config('shifaa.test_now','2030-04-05T08:00:00Z',true);
SELECT pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000002',true);
SELECT pg_catalog.set_config('shifaa.actor_role','PAT',true);
SELECT pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);
UPDATE identity.care_relationships
SET valid_until='2030-04-05T07:00:00Z'
WHERE id='f0101000-0000-4000-8d00-000000000002';

SET SESSION AUTHORIZATION shifaa_api;
DO $feature_010_c18_expired_authority_vector$
DECLARE
  denied boolean := false;
  visible_count integer;
BEGIN
  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000005',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','DEL',true);
  PERFORM pg_catalog.set_config('shifaa.action','listReferrals',true);
  PERFORM pg_catalog.set_config('shifaa.aal','2',true);
  PERFORM pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);
  SELECT count(*) INTO visible_count
  FROM clinical.list_referrals_api_v1(NULL,NULL,101,NULL,NULL,NULL,NULL,NULL) result
  WHERE result.referral_id='f0101000-0000-4000-8a00-000000000001';
  IF visible_count<>0 THEN RAISE EXCEPTION 'C19 expired DEL authority still listed referrals'; END IF;
  PERFORM pg_catalog.set_config('shifaa.action','acceptReferral',true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c18-expired-del-001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('7',64),true);
  BEGIN
    PERFORM clinical.accept_referral_api_v1(
      'f0101000-0000-4000-8a00-000000000013',1,
      pg_catalog.jsonb_build_object(
        'authorizedFieldCodes',pg_catalog.jsonb_build_array('reason_summary'),
        'targetSlot',pg_catalog.jsonb_build_object(
          'facilityId','f0101000-0000-4000-8200-000000000001',
          'doctorId','f0101000-0000-4000-8000-000000000003',
          'startsAt','2030-04-05T12:30:00Z','endsAt','2030-04-05T13:00:00Z',
          'timezone','Africa/Cairo','civilDate','2030-04-05','availabilityVersion',1
        )
      )
    );
  EXCEPTION WHEN no_data_found THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C18 accepted a delegate after valid_until expired'; END IF;
END
$feature_010_c18_expired_authority_vector$;
RESET SESSION AUTHORIZATION;
SELECT pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000002',true);
SELECT pg_catalog.set_config('shifaa.actor_role','PAT',true);
UPDATE identity.care_relationships
SET valid_until=NULL
WHERE id='f0101000-0000-4000-8d00-000000000002';

-- Revocation after a successful acceptance must immediately remove family
-- authority, and an inactive target membership must not authorize booking.
SELECT pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000001',true);
SELECT pg_catalog.set_config('shifaa.actor_role','ADM-SUPPORT',true);
SELECT pg_catalog.set_config('shifaa.aal','2',true);
SELECT pg_catalog.set_config('shifaa.purposes','guardianship_review',true);
UPDATE identity.care_relationships
SET status='revoked',reviewed_by_person_id='f0101000-0000-4000-8000-000000000001',
    reviewed_at='2030-04-05T08:00:00Z',decision_reason_code='synthetic-review'
WHERE id='f0101000-0000-4000-8d00-000000000001';
SELECT pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000002',true);
SELECT pg_catalog.set_config('shifaa.actor_role','PAT',true);
SELECT pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);
UPDATE identity.care_relationship_permissions
SET revoked_at='2030-04-05T08:00:00Z',revoked_by_person_id='f0101000-0000-4000-8000-000000000002'
WHERE relationship_id='f0101000-0000-4000-8d00-000000000002'
  AND permission_code='appointment.manage' AND revoked_at IS NULL;
UPDATE identity.facility_memberships
SET membership_status='ended'
WHERE facility_id='f0101000-0000-4000-8200-000000000001'
  AND person_id='f0101000-0000-4000-8000-000000000003';

SET SESSION AUTHORIZATION shifaa_api;
DO $feature_010_c18_live_authority_vectors$
DECLARE
  slot_value jsonb := pg_catalog.jsonb_build_object(
    'facilityId','f0101000-0000-4000-8200-000000000001',
    'doctorId','f0101000-0000-4000-8000-000000000003',
    'startsAt','2030-04-05T12:30:00Z','endsAt','2030-04-05T13:00:00Z',
    'timezone','Africa/Cairo','civilDate','2030-04-05','availabilityVersion',1
  );
  request_value jsonb := pg_catalog.jsonb_build_object(
    'authorizedFieldCodes',pg_catalog.jsonb_build_array('reason_summary'),'targetSlot',slot_value
  );
  denied boolean;
BEGIN
  PERFORM pg_catalog.set_config('shifaa.environment','local',true);
  PERFORM pg_catalog.set_config('shifaa.test_now','2030-04-05T08:00:00Z',true);
  PERFORM pg_catalog.set_config('shifaa.action','acceptReferral',true);
  PERFORM pg_catalog.set_config('shifaa.aal','2',true);
  PERFORM pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);
  PERFORM pg_catalog.set_config('shifaa.request_id','f0101000-0000-4000-9000-000000000072',true);
  PERFORM pg_catalog.set_config('shifaa.trace_id','f0101000-0000-4000-9000-000000000072',true);
  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000004',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','GUA',true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c18-ended-gua-001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('8',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.accept_referral_api_v1('f0101000-0000-4000-8a00-00000000000c',1,request_value);
  EXCEPTION WHEN no_data_found THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C18 accepted a guardian whose authority ended after setup'; END IF;

  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000005',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','DEL',true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c18-revoked-del-001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('9',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.accept_referral_api_v1('f0101000-0000-4000-8a00-00000000000d',1,request_value);
  EXCEPTION WHEN no_data_found THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C18 accepted a delegate after appointment.manage was revoked'; END IF;

  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000002',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','PAT',true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c18-inactive-target-001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('a',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.accept_referral_api_v1('f0101000-0000-4000-8a00-00000000000e',1,request_value);
  EXCEPTION WHEN insufficient_privilege OR serialization_failure OR exclusion_violation THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C18 booked with a target doctor whose live facility membership is inactive'; END IF;

END
$feature_010_c18_live_authority_vectors$;
RESET SESSION AUTHORIZATION;

DO $feature_010_c18_exactly_once_effects$
BEGIN
  IF (SELECT count(*) FROM clinical.referrals WHERE id IN (
      'f0101000-0000-4000-8a00-000000000001','f0101000-0000-4000-8a00-000000000002','f0101000-0000-4000-8a00-000000000003','f0101000-0000-4000-8a00-000000000010'
    ) AND status='accepted' AND version=2 AND resulting_appointment_id IS NOT NULL
      AND accepted_field_codes IS NOT NULL AND accepted_by_person_id IS NOT NULL AND accepted_at IS NOT NULL)<>4
     OR (SELECT count(*) FROM clinical.appointments WHERE source_referral_id IN (
      'f0101000-0000-4000-8a00-000000000001','f0101000-0000-4000-8a00-000000000002','f0101000-0000-4000-8a00-000000000003','f0101000-0000-4000-8a00-000000000010'
    ) AND facility_id='f0101000-0000-4000-8200-000000000001'
      AND doctor_person_id='f0101000-0000-4000-8000-000000000003'
      AND fee_minor_units=12500 AND currency_code='EGP' AND payment_method='cash_on_arrival')<>4
     OR (SELECT count(*) FROM audit.events WHERE resource_type='referral' AND action_code='referral.accepted'
      AND resource_id IN ('f0101000-0000-4000-8a00-000000000001','f0101000-0000-4000-8a00-000000000002','f0101000-0000-4000-8a00-000000000003','f0101000-0000-4000-8a00-000000000010'))<>4
     OR (SELECT count(*) FROM platform.outbox_events WHERE aggregate_type='referral'
      AND event_type='clinical.referral.accepted.v1'
      AND aggregate_id IN ('f0101000-0000-4000-8a00-000000000001','f0101000-0000-4000-8a00-000000000002','f0101000-0000-4000-8a00-000000000003','f0101000-0000-4000-8a00-000000000010'))<>4
     OR (SELECT count(*) FROM platform.idempotency_records WHERE method='POST'
      AND route_template='/v1/referrals/{referralId}/accept' AND state='completed'
      AND response_status=200 AND resource_type='referral'
      AND resource_id IN ('f0101000-0000-4000-8a00-000000000001','f0101000-0000-4000-8a00-000000000002','f0101000-0000-4000-8a00-000000000003','f0101000-0000-4000-8a00-000000000010'))<>4 THEN
    RAISE EXCEPTION 'C18 success must commit exactly one accepted referral/appointment/idempotency/audit/outbox set per authorized actor';
  END IF;
  IF (SELECT count(*) FROM clinical.appointments WHERE source_referral_id IS NOT NULL)<>4
     OR (SELECT count(*) FROM audit.events WHERE resource_type='referral' AND action_code='referral.accepted')<>4
     OR (SELECT count(*) FROM platform.outbox_events WHERE aggregate_type='referral' AND event_type='clinical.referral.accepted.v1')<>4
     OR (SELECT count(*) FROM platform.idempotency_records WHERE method='POST' AND route_template='/v1/referrals/{referralId}/accept')<>4 THEN
    RAISE EXCEPTION 'C18 replay or failure vectors left duplicate or partial acceptance effects';
  END IF;
  IF (SELECT count(*) FROM clinical.referrals WHERE id IN (
        'f0101000-0000-4000-8a00-000000000004','f0101000-0000-4000-8a00-000000000005',
        'f0101000-0000-4000-8a00-000000000006','f0101000-0000-4000-8a00-000000000007',
        'f0101000-0000-4000-8a00-000000000008','f0101000-0000-4000-8a00-000000000009',
        'f0101000-0000-4000-8a00-00000000000a','f0101000-0000-4000-8a00-00000000000b',
        'f0101000-0000-4000-8a00-00000000000c','f0101000-0000-4000-8a00-00000000000d',
        'f0101000-0000-4000-8a00-00000000000e','f0101000-0000-4000-8a00-00000000000f',
        'f0101000-0000-4000-8a00-000000000011','f0101000-0000-4000-8a00-000000000012',
        'f0101000-0000-4000-8a00-000000000013'
      ) AND status='pending' AND resulting_appointment_id IS NULL
        AND accepted_field_codes IS NULL AND accepted_by_person_id IS NULL AND accepted_at IS NULL)<>15 THEN
    RAISE EXCEPTION 'C18 negative, revoked-authority, and concurrency fixture referrals were partially accepted';
  END IF;
END
$feature_010_c18_exactly_once_effects$;
