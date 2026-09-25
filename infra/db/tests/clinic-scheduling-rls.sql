BEGIN;

DO $catalog$
DECLARE item text; privileges text;
BEGIN
  FOREACH item IN ARRAY ARRAY['schedules','schedule_windows','schedule_exceptions','appointments','queue_scopes','queue_entries'] LOOP
    IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid=to_regclass('clinical.'||item)) THEN RAISE EXCEPTION 'clinical.% must enable and force RLS', item; END IF;
    SELECT string_agg(g.privilege_type, ',') INTO privileges FROM information_schema.role_table_grants g WHERE g.grantee IN ('public','shifaa_api','shifaa_worker') AND g.table_schema='clinical' AND g.table_name=item;
    IF privileges IS NOT NULL THEN RAISE EXCEPTION 'direct clinical table privilege on %: %',item,privileges; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('shifaa_api','shifaa_worker') AND (rolsuper OR rolbypassrls)) THEN RAISE EXCEPTION 'online roles must not bypass RLS'; END IF;
  FOREACH item IN ARRAY ARRAY['clinical.read_my_appointment_v1(uuid)','clinical.read_my_queue_position_v1(uuid)','clinical.create_schedule_v1(jsonb)','clinical.update_schedule_v1(uuid,integer,jsonb)','clinical.create_schedule_exception_v1(jsonb)','clinical.create_appointment_v1(jsonb)','clinical.reschedule_appointment_v1(uuid,integer,timestamptz,timestamptz,date,time,text)','clinical.cancel_appointment_v1(uuid,integer,text)','clinical.check_in_appointment_v1(uuid,integer)','clinical.call_queue_entry_v1(uuid,integer)','clinical.complete_queue_entry_v1(uuid,integer)','clinical.reorder_queue_entry_v1(uuid,integer,integer,integer,text)','clinical.send_doctor_delay_v1(uuid,uuid,date,integer,text)','clinical.declare_doctor_absence_v1(uuid,uuid,date,timestamptz,timestamptz,text)'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure(item) AND p.prosecdef AND EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,ARRAY[]::text[])) AS setting WHERE setting LIKE 'search_path=%')) THEN RAISE EXCEPTION 'fixed search path missing for %',item; END IF;
  END LOOP;
  IF has_function_privilege('public','clinical.create_schedule_v1(jsonb)','EXECUTE') OR has_function_privilege('public','clinical.assert_current_staff_scope_v1(uuid,uuid,date,text)','EXECUTE') THEN RAISE EXCEPTION 'PUBLIC can execute a clinical mutation/helper'; END IF;
END
$catalog$;

INSERT INTO identity.people(id,user_id,display_name,profile_status) VALUES
 ('f0090000-0000-4000-8a00-000000000001','f0090000-0000-4000-9a00-000000000001','F009 RLS owner','active'),('f0090000-0000-4000-8a00-000000000002','f0090000-0000-4000-9a00-000000000002','F009 RLS doctor','active'),('f0090000-0000-4000-8a00-000000000003','f0090000-0000-4000-9a00-000000000003','F009 RLS patient','active'),('f0090000-0000-4000-8a00-000000000004','f0090000-0000-4000-9a00-000000000004','F009 RLS guardian','active'),('f0090000-0000-4000-8a00-000000000005','f0090000-0000-4000-9a00-000000000005','F009 RLS unrelated','active');
INSERT INTO identity.patients(id,person_id,medical_record_number,record_status) VALUES ('f0090000-0000-4000-8b00-000000000001','f0090000-0000-4000-8a00-000000000003','F009-RLS-MRN-A','active'),('f0090000-0000-4000-8b00-000000000002','f0090000-0000-4000-8a00-000000000005','F009-RLS-MRN-B','active');
SELECT pg_catalog.set_config('shifaa.person_id','f0090000-0000-4000-8a00-000000000003',true);
INSERT INTO identity.care_relationships(id,subject_patient_id,actor_person_id,relationship_type,status,valid_from,purpose_code,created_by_person_id,invite_token_digest,invite_expires_at) VALUES ('f0090000-0000-4000-8c00-000000000001','f0090000-0000-4000-8b00-000000000001','f0090000-0000-4000-8a00-000000000004','delegation','pending','2020-01-01','appointment.manage','f0090000-0000-4000-8a00-000000000003',decode(repeat('a',64),'hex'),'2099-12-31');
INSERT INTO identity.care_relationship_permissions(relationship_id,permission_code,created_by_person_id) VALUES ('f0090000-0000-4000-8c00-000000000001','appointment.manage','f0090000-0000-4000-8a00-000000000003');
SELECT pg_catalog.set_config('shifaa.person_id','f0090000-0000-4000-8a00-000000000004',true);
UPDATE identity.care_relationships SET status='active',invite_token_digest=NULL,invite_expires_at=NULL,invite_consumed_at=statement_timestamp() WHERE id='f0090000-0000-4000-8c00-000000000001';
INSERT INTO identity.facilities(id,facility_type,name_ar,name_en,facility_status,governorate_code,city,district,address_line,created_by_person_id) VALUES ('f0090000-0000-4000-8100-000000000003','clinic','عيادة RLS','F009 RLS clinic','active','C','Cairo','RLS','Synthetic RLS address','f0090000-0000-4000-8a00-000000000001');
INSERT INTO identity.professional_licenses(id,person_id,profession,number_ciphertext,number_hash,issuer,expires_on,status) VALUES ('f0090000-0000-4000-8d00-000000000001','f0090000-0000-4000-8a00-000000000002','doctor',decode(repeat('1',16),'hex'),decode(repeat('2',64),'hex'),'F009 RLS regulator','2099-12-31','verified');
INSERT INTO identity.facility_memberships(facility_id,person_id,role_code,employment_license_id,valid_from,membership_status,created_by_person_id) VALUES ('f0090000-0000-4000-8100-000000000003','f0090000-0000-4000-8a00-000000000001','owner',NULL,'2020-01-01','active','f0090000-0000-4000-8a00-000000000001'),('f0090000-0000-4000-8100-000000000003','f0090000-0000-4000-8a00-000000000002','doctor','f0090000-0000-4000-8d00-000000000001','2020-01-01','active','f0090000-0000-4000-8a00-000000000001');
INSERT INTO clinical.schedules(id,facility_id,doctor_person_id,timezone_name,valid_from,valid_to,slot_duration_minutes,fee_minor_units,currency_code,created_by_person_id,updated_by_person_id) VALUES ('f0090000-0000-4000-8200-000000000020','f0090000-0000-4000-8100-000000000003','f0090000-0000-4000-8a00-000000000002','Africa/Cairo','2030-01-01','2030-01-31',30,10000,'EGP','f0090000-0000-4000-8a00-000000000001','f0090000-0000-4000-8a00-000000000001');
INSERT INTO clinical.appointments(id,patient_person_id,facility_id,doctor_person_id,schedule_id,starts_at,ends_at,timezone_name,civil_date,local_start,fee_minor_units,currency_code,status,created_by_person_id,updated_by_person_id) VALUES ('f0090000-0000-4000-8300-000000000020','f0090000-0000-4000-8a00-000000000003','f0090000-0000-4000-8100-000000000003','f0090000-0000-4000-8a00-000000000002','f0090000-0000-4000-8200-000000000020','2030-01-07T07:00:00Z','2030-01-07T07:30:00Z','Africa/Cairo','2030-01-07','09:00',10000,'EGP','confirmed','f0090000-0000-4000-8a00-000000000003','f0090000-0000-4000-8a00-000000000003');

SELECT pg_catalog.set_config('shifaa.environment','local',true); SELECT pg_catalog.set_config('shifaa.test_now','2026-09-12T08:00:00Z',true); SET LOCAL ROLE shifaa_api;
SELECT pg_catalog.set_config('shifaa.person_id','f0090000-0000-4000-8a00-000000000003',true); SELECT pg_catalog.set_config('shifaa.actor_role','PAT',true); SELECT pg_catalog.set_config('shifaa.action','appointment.manage',true); SELECT pg_catalog.set_config('shifaa.aal','1',true); SELECT pg_catalog.set_config('shifaa.purposes','appointment.manage',true);
DO $subject$
DECLARE projection_count integer; before_count integer;
BEGIN
  SELECT count(*) INTO projection_count FROM clinical.read_my_appointment_v1('f0090000-0000-4000-8300-000000000020'); IF projection_count<>1 THEN RAISE EXCEPTION 'patient self minimum projection missing'; END IF;
  SELECT count(*) INTO before_count FROM clinical.appointments;
  PERFORM clinical.create_appointment_v1(jsonb_build_object('patient_person_id','f0090000-0000-4000-8b00-000000000002','facility_id','f0090000-0000-4000-8100-000000000003','doctor_person_id','f0090000-0000-4000-8a00-000000000002','schedule_id','f0090000-0000-4000-8200-000000000020','starts_at','2030-01-07T08:00:00Z','ends_at','2030-01-07T08:30:00Z','timezone_name','Africa/Cairo','civil_date','2030-01-07','local_start','10:00','payment_method','cash_on_arrival')); RAISE EXCEPTION 'wrong patient was allowed to book';
EXCEPTION WHEN SQLSTATE '42501' THEN IF (SELECT count(*) FROM clinical.appointments)<>before_count THEN RAISE EXCEPTION 'wrong patient had a side effect'; END IF; END
$subject$;
SELECT pg_catalog.set_config('shifaa.person_id','f0090000-0000-4000-8a00-000000000004',true);
DO $guardian$ DECLARE projection_count integer; BEGIN SELECT count(*) INTO projection_count FROM clinical.read_my_appointment_v1('f0090000-0000-4000-8300-000000000020'); IF projection_count<>1 THEN RAISE EXCEPTION 'active appointment.manage relationship did not project'; END IF; END $guardian$;

SELECT pg_catalog.set_config('shifaa.person_id','f0090000-0000-4000-8a00-000000000001',true); SELECT pg_catalog.set_config('shifaa.actor_role','CLN',true); SELECT pg_catalog.set_config('shifaa.action','schedule.manage',true); SELECT pg_catalog.set_config('shifaa.aal','2',true); SELECT pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);
RESET ROLE;
DO $staff$
DECLARE before_version integer; after_version integer; before_count integer;
BEGIN
  SELECT version INTO before_version FROM clinical.schedules WHERE id='f0090000-0000-4000-8200-000000000020'; PERFORM clinical.update_schedule_v1('f0090000-0000-4000-8200-000000000020',before_version,'{"valid_to":"2030-01-30"}'::jsonb); SELECT version INTO after_version FROM clinical.schedules WHERE id='f0090000-0000-4000-8200-000000000020'; IF after_version<>before_version+1 THEN RAISE EXCEPTION 'authorized staff update did not apply'; END IF;
  before_count:=(SELECT count(*) FROM clinical.appointments); PERFORM pg_catalog.set_config('shifaa.action','wrong.action',true); BEGIN PERFORM clinical.update_schedule_v1('f0090000-0000-4000-8200-000000000020',after_version,'{"valid_to":"2030-01-29"}'::jsonb); RAISE EXCEPTION 'wrong action accepted'; EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  PERFORM pg_catalog.set_config('shifaa.action','schedule.manage',true); PERFORM pg_catalog.set_config('shifaa.purposes','',true); BEGIN PERFORM clinical.update_schedule_v1('f0090000-0000-4000-8200-000000000020',after_version,'{"valid_to":"2030-01-28"}'::jsonb); RAISE EXCEPTION 'missing purpose accepted'; EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  PERFORM pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true); PERFORM pg_catalog.set_config('shifaa.aal','0',true); BEGIN PERFORM clinical.update_schedule_v1('f0090000-0000-4000-8200-000000000020',after_version,'{"valid_to":"2030-01-27"}'::jsonb); RAISE EXCEPTION 'insufficient AAL accepted'; EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  PERFORM pg_catalog.set_config('shifaa.aal','2',true); BEGIN PERFORM clinical.update_schedule_v1('f0090000-0000-4000-8200-000000000020',before_version,'{"valid_to":"2030-01-26"}'::jsonb); RAISE EXCEPTION 'stale schedule token accepted'; EXCEPTION WHEN SQLSTATE '40001' THEN NULL; END;
  IF (SELECT version FROM clinical.schedules WHERE id='f0090000-0000-4000-8200-000000000020')<>after_version OR (SELECT count(*) FROM clinical.appointments)<>before_count THEN RAISE EXCEPTION 'denied staff cell changed data'; END IF;
  UPDATE identity.facility_memberships SET membership_status='ended' WHERE facility_id='f0090000-0000-4000-8100-000000000003' AND person_id='f0090000-0000-4000-8a00-000000000001'; BEGIN PERFORM clinical.update_schedule_v1('f0090000-0000-4000-8200-000000000020',after_version,'{"valid_to":"2030-01-25"}'::jsonb); RAISE EXCEPTION 'inactive membership accepted'; EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END; UPDATE identity.facility_memberships SET membership_status='active' WHERE facility_id='f0090000-0000-4000-8100-000000000003' AND person_id='f0090000-0000-4000-8a00-000000000001';
  UPDATE identity.professional_licenses SET status='expired' WHERE id='f0090000-0000-4000-8d00-000000000001'; BEGIN PERFORM clinical.update_schedule_v1('f0090000-0000-4000-8200-000000000020',after_version,'{"valid_to":"2030-01-24"}'::jsonb); RAISE EXCEPTION 'expired licence accepted'; EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
END
$staff$;

-- Runtime denial matrix: every context mismatch is denied before a domain,
-- audit, outbox, or idempotency effect, while the approved subject projection
-- remains deliberately minimum-shaped.
SELECT pg_catalog.set_config('shifaa.person_id','f0090000-0000-4000-8a00-000000000003',true);
SELECT pg_catalog.set_config('shifaa.actor_role','PAT',true);
SELECT pg_catalog.set_config('shifaa.action','appointment.manage',true);
SELECT pg_catalog.set_config('shifaa.aal','1',true);
SELECT pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);
DO $patient_matrix$
DECLARE before_appointments integer; before_audit integer; before_outbox integer; before_idempotency integer; projection jsonb; row_count integer;
BEGIN
  SELECT count(*) INTO before_appointments FROM clinical.appointments;
  SELECT count(*) INTO before_audit FROM audit.events;
  SELECT count(*) INTO before_outbox FROM platform.outbox_events;
  SELECT count(*) INTO before_idempotency FROM platform.idempotency_records;
  -- wrong facility, doctor, and civil date must not disclose whether a slot exists
  FOREACH projection IN ARRAY ARRAY[
    jsonb_build_object('facility_id','f0090000-0000-4000-8100-000000000099'),
    jsonb_build_object('doctor_person_id','f0090000-0000-4000-8a00-000000000099'),
    jsonb_build_object('civil_date','2030-02-01')
  ] LOOP
    BEGIN
      PERFORM clinical.create_appointment_v1(jsonb_build_object('patient_person_id','f0090000-0000-4000-8a00-000000000003','facility_id',COALESCE(projection->>'facility_id','f0090000-0000-4000-8100-000000000003'),'doctor_person_id',COALESCE(projection->>'doctor_person_id','f0090000-0000-4000-8a00-000000000002'),'schedule_id','f0090000-0000-4000-8200-000000000020','starts_at','2030-01-07T07:00:00Z','ends_at','2030-01-07T07:30:00Z','timezone_name','Africa/Cairo','civil_date',COALESCE(projection->>'civil_date','2030-01-07'),'local_start','09:00','payment_method','cash_on_arrival'));
      RAISE EXCEPTION 'scope mismatch was accepted: %',projection;
    EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
    END;
  END LOOP;
  -- missing/wrong action, insufficient AAL, and missing purpose are all deny-only
  PERFORM pg_catalog.set_config('shifaa.action','',true);
  BEGIN PERFORM clinical.create_appointment_v1(jsonb_build_object('patient_person_id','f0090000-0000-4000-8a00-000000000003','facility_id','f0090000-0000-4000-8100-000000000003','doctor_person_id','f0090000-0000-4000-8a00-000000000002','schedule_id','f0090000-0000-4000-8200-000000000020','starts_at','2030-01-07T07:00:00Z','ends_at','2030-01-07T07:30:00Z','timezone_name','Africa/Cairo','civil_date','2030-01-07','local_start','10:00','payment_method','cash_on_arrival')); RAISE EXCEPTION 'missing action accepted'; EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  PERFORM pg_catalog.set_config('shifaa.action','wrong.action',true);
  BEGIN PERFORM clinical.create_appointment_v1(jsonb_build_object('patient_person_id','f0090000-0000-4000-8a00-000000000003','facility_id','f0090000-0000-4000-8100-000000000003','doctor_person_id','f0090000-0000-4000-8a00-000000000002','schedule_id','f0090000-0000-4000-8200-000000000020','starts_at','2030-01-07T07:00:00Z','ends_at','2030-01-07T07:30:00Z','timezone_name','Africa/Cairo','civil_date','2030-01-07','local_start','10:00','payment_method','cash_on_arrival')); RAISE EXCEPTION 'wrong action accepted'; EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  PERFORM pg_catalog.set_config('shifaa.action','appointment.manage',true); PERFORM pg_catalog.set_config('shifaa.aal','0',true);
  BEGIN PERFORM clinical.create_appointment_v1(jsonb_build_object('patient_person_id','f0090000-0000-4000-8a00-000000000003','facility_id','f0090000-0000-4000-8100-000000000003','doctor_person_id','f0090000-0000-4000-8a00-000000000002','schedule_id','f0090000-0000-4000-8200-000000000020','starts_at','2030-01-07T07:00:00Z','ends_at','2030-01-07T07:30:00Z','timezone_name','Africa/Cairo','civil_date','2030-01-07','local_start','10:00','payment_method','cash_on_arrival')); RAISE EXCEPTION 'insufficient AAL accepted'; EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  PERFORM pg_catalog.set_config('shifaa.aal','1',true); PERFORM pg_catalog.set_config('shifaa.purposes','',true);
  BEGIN PERFORM clinical.create_appointment_v1(jsonb_build_object('patient_person_id','f0090000-0000-4000-8a00-000000000003','facility_id','f0090000-0000-4000-8100-000000000003','doctor_person_id','f0090000-0000-4000-8a00-000000000002','schedule_id','f0090000-0000-4000-8200-000000000020','starts_at','2030-01-07T07:00:00Z','ends_at','2030-01-07T07:30:00Z','timezone_name','Africa/Cairo','civil_date','2030-01-07','local_start','10:00','payment_method','cash_on_arrival')); RAISE EXCEPTION 'missing purpose accepted'; EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  IF (SELECT count(*) FROM clinical.appointments)<>before_appointments OR (SELECT count(*) FROM audit.events)<>before_audit OR (SELECT count(*) FROM platform.outbox_events)<>before_outbox OR (SELECT count(*) FROM platform.idempotency_records)<>before_idempotency THEN RAISE EXCEPTION 'patient denial changed effects'; END IF;
  PERFORM pg_catalog.set_config('shifaa.action','appointment.manage',true); PERFORM pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);
  SELECT count(*) INTO row_count FROM clinical.read_my_appointment_v1('f0090000-0000-4000-8300-000000000020');
  IF row_count<>1 THEN RAISE EXCEPTION 'approved minimum projection missing'; END IF;
  SELECT to_jsonb(projected) INTO projection FROM clinical.read_my_appointment_v1('f0090000-0000-4000-8300-000000000020') projected;
  IF projection ?| ARRAY['reason','contact','phone','token','patient_person_id','facility_id','doctor_person_id'] THEN RAISE EXCEPTION 'raw/private field leaked from minimum projection'; END IF;
END
$patient_matrix$;

-- Expired and revoked relationship facts are tested independently.
SELECT pg_catalog.set_config('shifaa.person_id','f0090000-0000-4000-8a00-000000000003',true);
SET LOCAL session_replication_role='replica';
UPDATE identity.care_relationships SET valid_until='2020-01-02' WHERE id='f0090000-0000-4000-8c00-000000000001';
SET LOCAL session_replication_role='origin';
SELECT pg_catalog.set_config('shifaa.person_id','f0090000-0000-4000-8a00-000000000004',true);
SELECT pg_catalog.set_config('shifaa.action','appointment.manage',true); SELECT pg_catalog.set_config('shifaa.aal','1',true); SELECT pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);
DO $expired_relationship$
BEGIN
  BEGIN PERFORM clinical.create_appointment_v1(jsonb_build_object('patient_person_id','f0090000-0000-4000-8a00-000000000003','facility_id','f0090000-0000-4000-8100-000000000003','doctor_person_id','f0090000-0000-4000-8a00-000000000002','schedule_id','f0090000-0000-4000-8200-000000000020','starts_at','2030-01-07T07:00:00Z','ends_at','2030-01-07T07:30:00Z','timezone_name','Africa/Cairo','civil_date','2030-01-07','local_start','10:00','payment_method','cash_on_arrival')); RAISE EXCEPTION 'expired relationship accepted'; EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
END $expired_relationship$;
SELECT pg_catalog.set_config('shifaa.person_id','f0090000-0000-4000-8a00-000000000003',true);
SET LOCAL session_replication_role='replica';
UPDATE identity.care_relationships SET valid_until=NULL,status='revoked' WHERE id='f0090000-0000-4000-8c00-000000000001';
SET LOCAL session_replication_role='origin';
SELECT pg_catalog.set_config('shifaa.person_id','f0090000-0000-4000-8a00-000000000004',true);
DO $revoked_relationship$
BEGIN
  BEGIN PERFORM clinical.create_appointment_v1(jsonb_build_object('patient_person_id','f0090000-0000-4000-8a00-000000000003','facility_id','f0090000-0000-4000-8100-000000000003','doctor_person_id','f0090000-0000-4000-8a00-000000000002','schedule_id','f0090000-0000-4000-8200-000000000020','starts_at','2030-01-07T07:00:00Z','ends_at','2030-01-07T07:30:00Z','timezone_name','Africa/Cairo','civil_date','2030-01-07','local_start','10:00','payment_method','cash_on_arrival')); RAISE EXCEPTION 'revoked relationship accepted'; EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
END $revoked_relationship$;

SET LOCAL ROLE shifaa_api;
DO $api_denials$ BEGIN BEGIN PERFORM 1 FROM clinical.appointments; RAISE EXCEPTION 'API direct SELECT was allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $api_denials$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $service_direct_denial$
BEGIN
  BEGIN PERFORM 1 FROM clinical.appointments; RAISE EXCEPTION 'service role direct SELECT was allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $service_direct_denial$;
RESET ROLE;
DO $role_catalog$ BEGIN IF has_table_privilege('public','clinical.appointments','SELECT') OR has_table_privilege('shifaa_worker','clinical.appointments','SELECT') THEN RAISE EXCEPTION 'public/worker direct table privilege exists'; END IF; END $role_catalog$;
SET LOCAL ROLE shifaa_worker;
DO $worker$ BEGIN BEGIN PERFORM 1 FROM clinical.appointments; RAISE EXCEPTION 'worker direct SELECT was allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $worker$;
RESET ROLE;
ROLLBACK;
