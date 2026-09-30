-- Feature 010 C11 real-PostgreSQL API vectors. All synthetic fixture writes
-- and online calls are rolled back; online assertions execute as shifaa_api.
BEGIN;
SELECT pg_catalog.set_config('shifaa.environment','local',true);
SELECT pg_catalog.set_config('shifaa.test_now','2030-04-05T08:00:00Z',true);

INSERT INTO identity.people(id,user_id,display_name,profile_status) VALUES
 ('f0101000-0000-4000-8000-000000000001','f0101000-0000-4000-9000-000000000001','F010 C11 clinician','active'),
 ('f0101000-0000-4000-8000-000000000002','f0101000-0000-4000-9000-000000000002','F010 C11 patient','active'),
 ('f0101000-0000-4000-8000-000000000003','f0101000-0000-4000-9000-000000000003','F010 C11 alternate clinician','active'),
 ('f0101000-0000-4000-8000-000000000004','f0101000-0000-4000-9000-000000000004','F010 C11 guardian','active'),
 ('f0101000-0000-4000-8000-000000000005','f0101000-0000-4000-9000-000000000005','F010 C11 delegate','active');
INSERT INTO identity.patients(id,person_id,medical_record_number,record_status)
VALUES ('f0101000-0000-4000-8100-000000000001','f0101000-0000-4000-8000-000000000002','F010-C11-MRN-1','active');
INSERT INTO identity.facilities(id,facility_type,name_ar,name_en,facility_status,governorate_code,city,district,address_line,created_by_person_id)
VALUES ('f0101000-0000-4000-8200-000000000001','clinic','عيادة C11','F010 C11 clinic','active','C','Cairo','Test','Synthetic address','f0101000-0000-4000-8000-000000000001');
INSERT INTO identity.professional_licenses(id,person_id,profession,number_ciphertext,number_hash,issuer,expires_on,status) VALUES
 ('f0101000-0000-4000-8300-000000000001','f0101000-0000-4000-8000-000000000001','doctor',decode(repeat('1',16),'hex'),decode(repeat('e',64),'hex'),'F010 synthetic regulator','2035-12-31','verified'),
 ('f0101000-0000-4000-8300-000000000002','f0101000-0000-4000-8000-000000000003','doctor',decode(repeat('2',16),'hex'),decode(repeat('f',64),'hex'),'F010 synthetic regulator','2035-12-31','verified');
INSERT INTO identity.facility_memberships(facility_id,person_id,role_code,employment_license_id,valid_from,membership_status,created_by_person_id) VALUES
 ('f0101000-0000-4000-8200-000000000001','f0101000-0000-4000-8000-000000000001','doctor','f0101000-0000-4000-8300-000000000001','2020-01-01','active','f0101000-0000-4000-8000-000000000001'),
 ('f0101000-0000-4000-8200-000000000001','f0101000-0000-4000-8000-000000000003','doctor','f0101000-0000-4000-8300-000000000002','2020-01-01','active','f0101000-0000-4000-8000-000000000001');
INSERT INTO clinical.schedules(id,facility_id,doctor_person_id,timezone_name,valid_from,valid_to,slot_duration_minutes,fee_minor_units,currency_code,created_by_person_id,updated_by_person_id)
VALUES ('f0101000-0000-4000-8400-000000000001','f0101000-0000-4000-8200-000000000001','f0101000-0000-4000-8000-000000000001','Africa/Cairo','2030-04-01','2030-04-30',30,10000,'EGP','f0101000-0000-4000-8000-000000000001','f0101000-0000-4000-8000-000000000001');
INSERT INTO clinical.appointments(id,patient_person_id,facility_id,doctor_person_id,schedule_id,starts_at,ends_at,timezone_name,civil_date,local_start,fee_minor_units,currency_code,payment_method,status,created_by_person_id,updated_by_person_id) VALUES
 ('f0101000-0000-4000-8500-000000000001','f0101000-0000-4000-8000-000000000002','f0101000-0000-4000-8200-000000000001','f0101000-0000-4000-8000-000000000001','f0101000-0000-4000-8400-000000000001','2030-04-05T06:00:00Z','2030-04-05T06:30:00Z','Africa/Cairo','2030-04-05','08:00',10000,'EGP','cash_on_arrival','confirmed','f0101000-0000-4000-8000-000000000001','f0101000-0000-4000-8000-000000000001'),
 ('f0101000-0000-4000-8500-000000000002','f0101000-0000-4000-8000-000000000002','f0101000-0000-4000-8200-000000000001','f0101000-0000-4000-8000-000000000001','f0101000-0000-4000-8400-000000000001','2030-04-05T07:00:00Z','2030-04-05T07:30:00Z','Africa/Cairo','2030-04-05','09:00',10000,'EGP','cash_on_arrival','confirmed','f0101000-0000-4000-8000-000000000001','f0101000-0000-4000-8000-000000000001'),
 ('f0101000-0000-4000-8500-000000000003','f0101000-0000-4000-8000-000000000002','f0101000-0000-4000-8200-000000000001','f0101000-0000-4000-8000-000000000001','f0101000-0000-4000-8400-000000000001','2030-04-05T08:00:00Z','2030-04-05T08:30:00Z','Africa/Cairo','2030-04-05','10:00',10000,'EGP','cash_on_arrival','confirmed','f0101000-0000-4000-8000-000000000001','f0101000-0000-4000-8000-000000000001'),
 ('f0101000-0000-4000-8500-000000000004','f0101000-0000-4000-8000-000000000002','f0101000-0000-4000-8200-000000000001','f0101000-0000-4000-8000-000000000001','f0101000-0000-4000-8400-000000000001','2030-04-05T09:00:00Z','2030-04-05T09:30:00Z','Africa/Cairo','2030-04-05','11:00',10000,'EGP','cash_on_arrival','confirmed','f0101000-0000-4000-8000-000000000001','f0101000-0000-4000-8000-000000000001'),
 ('f0101000-0000-4000-8500-000000000005','f0101000-0000-4000-8000-000000000002','f0101000-0000-4000-8200-000000000001','f0101000-0000-4000-8000-000000000001','f0101000-0000-4000-8400-000000000001','2030-04-05T10:00:00Z','2030-04-05T10:30:00Z','Africa/Cairo','2030-04-05','12:00',10000,'EGP','cash_on_arrival','confirmed','f0101000-0000-4000-8000-000000000001','f0101000-0000-4000-8000-000000000001');
INSERT INTO clinical.queue_scopes(id,facility_id,doctor_person_id,civil_date,timezone_name) VALUES
 ('f0101000-0000-4000-8600-000000000001','f0101000-0000-4000-8200-000000000001','f0101000-0000-4000-8000-000000000001','2030-04-05','Africa/Cairo'),
 ('f0101000-0000-4000-8600-000000000002','f0101000-0000-4000-8200-000000000001','f0101000-0000-4000-8000-000000000003','2030-04-05','Africa/Cairo');
-- Seed valid queue scopes first; the one corrupted row for the fail-closed
-- vector is introduced only after appointment transition fixtures are ready.
INSERT INTO clinical.queue_entries(id,queue_scope_id,appointment_id,facility_id,doctor_person_id,civil_date,queue_number,waiting_order,state) VALUES
 ('f0101000-0000-4000-8700-000000000001','f0101000-0000-4000-8600-000000000001','f0101000-0000-4000-8500-000000000001','f0101000-0000-4000-8200-000000000001','f0101000-0000-4000-8000-000000000001','2030-04-05',1,1,'waiting'),
 ('f0101000-0000-4000-8700-000000000003','f0101000-0000-4000-8600-000000000001','f0101000-0000-4000-8500-000000000003','f0101000-0000-4000-8200-000000000001','f0101000-0000-4000-8000-000000000001','2030-04-05',3,4,'waiting'),
 ('f0101000-0000-4000-8700-000000000004','f0101000-0000-4000-8600-000000000001','f0101000-0000-4000-8500-000000000004','f0101000-0000-4000-8200-000000000001','f0101000-0000-4000-8000-000000000001','2030-04-05',4,2,'waiting'),
 ('f0101000-0000-4000-8700-000000000005','f0101000-0000-4000-8600-000000000001','f0101000-0000-4000-8500-000000000005','f0101000-0000-4000-8200-000000000001','f0101000-0000-4000-8000-000000000001','2030-04-05',5,3,'waiting');
SELECT pg_catalog.set_config('shifaa.clinic_internal_transition','allowed',true);
UPDATE clinical.appointments SET status='checked_in' WHERE id IN (
 'f0101000-0000-4000-8500-000000000001','f0101000-0000-4000-8500-000000000002',
 'f0101000-0000-4000-8500-000000000003','f0101000-0000-4000-8500-000000000005'
);
UPDATE clinical.queue_entries SET state='called',waiting_order=NULL,called_at=statement_timestamp()
WHERE id IN ('f0101000-0000-4000-8700-000000000001','f0101000-0000-4000-8700-000000000003','f0101000-0000-4000-8700-000000000005');
ALTER TABLE clinical.appointments DISABLE TRIGGER USER;
ALTER TABLE clinical.queue_entries DISABLE TRIGGER USER;
UPDATE clinical.appointments SET status='in_consultation' WHERE id='f0101000-0000-4000-8500-000000000004';
UPDATE clinical.queue_entries SET state='in_service',waiting_order=NULL,called_at=statement_timestamp()
WHERE id='f0101000-0000-4000-8700-000000000004';
ALTER TABLE clinical.queue_entries ENABLE TRIGGER USER;
ALTER TABLE clinical.appointments ENABLE TRIGGER USER;
ALTER TABLE clinical.queue_entries DISABLE TRIGGER USER;
UPDATE clinical.queue_entries SET queue_scope_id='f0101000-0000-4000-8600-000000000002',doctor_person_id='f0101000-0000-4000-8000-000000000003'
WHERE id='f0101000-0000-4000-8700-000000000003';
ALTER TABLE clinical.queue_entries ENABLE TRIGGER USER;
INSERT INTO clinical.encounters(id,patient_person_id,facility_id,appointment_id,responsible_clinician_id,encounter_type,status,started_at)
VALUES ('f0101000-0000-4000-8800-000000000002','f0101000-0000-4000-8000-000000000002','f0101000-0000-4000-8200-000000000001','f0101000-0000-4000-8500-000000000004','f0101000-0000-4000-8000-000000000001','consultation','open','2030-04-05T07:00:00Z');
INSERT INTO clinical.encounter_participants(encounter_id,person_id,role_code,started_at)
VALUES ('f0101000-0000-4000-8800-000000000002','f0101000-0000-4000-8000-000000000001','responsible_clinician','2030-04-05T07:00:00Z');
-- The active interval deliberately keeps current-clinician authorization true
-- so C11's completed-state rejection is tested independently.
INSERT INTO clinical.encounters(id,patient_person_id,facility_id,appointment_id,responsible_clinician_id,encounter_type,status,started_at,ended_at,completion_summary)
VALUES ('f0101000-0000-4000-8800-000000000003','f0101000-0000-4000-8000-000000000002','f0101000-0000-4000-8200-000000000001','f0101000-0000-4000-8500-000000000004','f0101000-0000-4000-8000-000000000001','consultation','completed','2030-04-05T06:00:00Z','2030-04-05T06:30:00Z','Synthetic completed encounter');
INSERT INTO clinical.encounters(id,patient_person_id,facility_id,appointment_id,responsible_clinician_id,encounter_type,status,started_at)
VALUES ('f0101000-0000-4000-8800-000000000004','f0101000-0000-4000-8000-000000000002','f0101000-0000-4000-8200-000000000001','f0101000-0000-4000-8500-000000000005','f0101000-0000-4000-8000-000000000001','consultation','open','2030-04-05T07:00:00Z');
INSERT INTO clinical.encounter_participants(encounter_id,person_id,role_code,started_at)
VALUES ('f0101000-0000-4000-8800-000000000003','f0101000-0000-4000-8000-000000000001','responsible_clinician','2030-04-05T06:00:00Z');
INSERT INTO clinical.clinical_notes(id,encounter_id,author_person_id,note_type,body_ciphertext,visibility_code,signed_at) VALUES
 ('f0101000-0000-4000-8900-000000000001','f0101000-0000-4000-8800-000000000002','f0101000-0000-4000-8000-000000000001','assessment',decode('aabb','hex'),'private','2030-04-05T07:10:00Z'),
 ('f0101000-0000-4000-8900-000000000002','f0101000-0000-4000-8800-000000000002','f0101000-0000-4000-8000-000000000001','plan',decode('ccdd','hex'),'patient_visible','2030-04-05T07:15:00Z');

-- Use the existing care-relationship state transitions for representative
-- authority so the projection checks exercise live GUA/DEL authority.
INSERT INTO identity.private_evidence_objects(id,bucket_code,object_key,owner_person_id,resource_patient_id,sha256,mime_type,size_bytes,scan_status)
VALUES ('f0101000-0000-4000-8c00-000000000001','guardianship-evidence','f010-c10/guardian.pdf','f0101000-0000-4000-8000-000000000004','f0101000-0000-4000-8100-000000000001',pg_catalog.repeat('a',64),'application/pdf',32,'released');
SELECT pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000004',true);
SELECT pg_catalog.set_config('shifaa.actor_role','PAT',true);
SELECT pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);
INSERT INTO identity.care_relationships(id,subject_patient_id,actor_person_id,relationship_type,status,valid_from,purpose_code,created_by_person_id,evidence_object_id)
VALUES ('f0101000-0000-4000-8d00-000000000001','f0101000-0000-4000-8100-000000000001','f0101000-0000-4000-8000-000000000004','guardianship','pending','2020-01-01','appointment.scheduling','f0101000-0000-4000-8000-000000000004','f0101000-0000-4000-8c00-000000000001');
INSERT INTO identity.care_relationship_permissions(relationship_id,permission_code,created_by_person_id)
VALUES ('f0101000-0000-4000-8d00-000000000001','record.view','f0101000-0000-4000-8000-000000000004');
SELECT pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000001',true);
SELECT pg_catalog.set_config('shifaa.actor_role','ADM-SUPPORT',true);
SELECT pg_catalog.set_config('shifaa.aal','2',true);
SELECT pg_catalog.set_config('shifaa.purposes','guardianship_review',true);
UPDATE identity.care_relationships SET status='active',reviewed_by_person_id='f0101000-0000-4000-8000-000000000001',reviewed_at=statement_timestamp(),decision_reason_code='synthetic-approved'
WHERE id='f0101000-0000-4000-8d00-000000000001';
SELECT pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000002',true);
SELECT pg_catalog.set_config('shifaa.actor_role','PAT',true);
SELECT pg_catalog.set_config('shifaa.aal','2',true);
INSERT INTO identity.care_relationships(id,subject_patient_id,actor_person_id,relationship_type,status,valid_from,purpose_code,created_by_person_id,invite_token_digest,invite_key_version,invite_expires_at)
VALUES ('f0101000-0000-4000-8d00-000000000002','f0101000-0000-4000-8100-000000000001','f0101000-0000-4000-8000-000000000005','delegation','pending','2020-01-01','appointment.scheduling','f0101000-0000-4000-8000-000000000002',pg_catalog.decode(pg_catalog.repeat('b',64),'hex'),1,statement_timestamp()+interval '1 day');
INSERT INTO identity.care_relationship_permissions(relationship_id,permission_code,created_by_person_id) VALUES
 ('f0101000-0000-4000-8d00-000000000002','record.view','f0101000-0000-4000-8000-000000000002'),
 ('f0101000-0000-4000-8d00-000000000002','appointment.manage','f0101000-0000-4000-8000-000000000002');
SELECT pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000005',true);
SELECT pg_catalog.set_config('shifaa.actor_role','DEL',true);
UPDATE identity.care_relationships SET status='active',invite_token_digest=NULL,invite_key_version=NULL,invite_expires_at=NULL,invite_consumed_at=statement_timestamp()
WHERE id='f0101000-0000-4000-8d00-000000000002';


-- C11 extends the C10 synthetic encounter with one removable workforce
-- interval, two same-patient conditions, and one cross-patient condition.
INSERT INTO clinical.encounter_participants(encounter_id,person_id,role_code,started_at)
VALUES ('f0101000-0000-4000-8800-000000000002','f0101000-0000-4000-8000-000000000003','consulting_clinician','2030-04-05T07:05:00Z');
INSERT INTO clinical.conditions(id,patient_id,code_system,code,display_name_ar,display_name_en,clinical_status,verification_status,recorded_by_person_id,pending_standardization)
VALUES
 ('f0101000-0000-4000-8e00-000000000001','f0101000-0000-4000-8100-000000000001','http://snomed.info/sct','F010-C11-A','حالة اختبارية أ','Synthetic condition A','active','confirmed','f0101000-0000-4000-8000-000000000001',false),
 ('f0101000-0000-4000-8e00-000000000002','f0101000-0000-4000-8100-000000000001','http://snomed.info/sct','F010-C11-B','حالة اختبارية ب','Synthetic condition B','active','confirmed','f0101000-0000-4000-8000-000000000001',false);
INSERT INTO identity.people(id,user_id,display_name,profile_status)
VALUES ('f0101000-0000-4000-8000-000000000006','f0101000-0000-4000-9000-000000000006','F010 C11 other patient','active');
INSERT INTO identity.patients(id,person_id,medical_record_number,record_status)
VALUES ('f0101000-0000-4000-8100-000000000002','f0101000-0000-4000-8000-000000000006','F010-C11-MRN-2','active');
INSERT INTO clinical.conditions(id,patient_id,code_system,code,display_name_ar,display_name_en,clinical_status,verification_status,recorded_by_person_id,pending_standardization)
VALUES ('f0101000-0000-4000-8e00-000000000003','f0101000-0000-4000-8100-000000000002','http://snomed.info/sct','F010-C11-X','حالة اختبارية أخرى','Other synthetic condition','active','confirmed','f0101000-0000-4000-8000-000000000001',false);

DO $feature_010_c11_boundary$
BEGIN
  IF pg_catalog.to_regprocedure('clinical.update_encounter_api_v1(uuid,integer,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'F010 C11 RED: missing locked API mutation boundary clinical.update_encounter_api_v1(uuid,integer,jsonb)';
  END IF;
END
$feature_010_c11_boundary$;

SET SESSION AUTHORIZATION shifaa_api;
DO $feature_010_c11_non_owner$
DECLARE
  encounter_id constant uuid := 'f0101000-0000-4000-8800-000000000002';
  request jsonb;
  result jsonb;
  replay jsonb;
  before_version integer := 3;
  denied boolean;
  error_code text;
  hidden_statuses text[];
BEGIN
  IF session_user<>'shifaa_api' OR current_user<>'shifaa_api'
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'C11 assertions must run with the non-owner, non-BYPASSRLS online role';
  END IF;
  IF NOT pg_catalog.has_function_privilege(current_user,'clinical.update_encounter_api_v1(uuid,integer,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'C11 online role lacks the narrow updateEncounter API grant';
  END IF;
  BEGIN
    PERFORM count(*) FROM clinical.encounters;
    RAISE EXCEPTION 'C11 online role can directly read encounters';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000001',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','CLN',true);
  PERFORM pg_catalog.set_config('shifaa.action','updateEncounter',true);
  PERFORM pg_catalog.set_config('shifaa.aal','2',true);
  PERFORM pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);
  PERFORM pg_catalog.set_config('shifaa.request_id','f0101000-0000-4000-9000-000000000011',true);
  PERFORM pg_catalog.set_config('shifaa.trace_id','f0101000-0000-4000-9000-000000000011',true);

  -- A licensed clinician who has no participant interval for this open
  -- encounter must not distinguish it from an absent encounter by PATCH.
  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000003',true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c26-update-absent',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('a',64),true);
  error_code := NULL;
  BEGIN
    PERFORM clinical.update_encounter_api_v1(
      'f0101000-0000-4000-8800-000000000099',1,jsonb_build_object('conditionIds','[]'::jsonb)
    );
  EXCEPTION
    WHEN SQLSTATE 'P0002' THEN error_code := 'P0002';
    WHEN SQLSTATE '42501' THEN error_code := '42501';
    WHEN SQLSTATE '55000' THEN error_code := '55000';
  END;
  hidden_statuses := ARRAY[CASE error_code WHEN 'P0002' THEN '404' WHEN '42501' THEN '403' WHEN '55000' THEN '409' ELSE 'other' END]::text[];
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c26-update-open-foreign',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('b',64),true);
  error_code := NULL;
  BEGIN
    PERFORM clinical.update_encounter_api_v1(
      'f0101000-0000-4000-8800-000000000004',1,jsonb_build_object('conditionIds','[]'::jsonb)
    );
  EXCEPTION
    WHEN SQLSTATE 'P0002' THEN error_code := 'P0002';
    WHEN SQLSTATE '42501' THEN error_code := '42501';
    WHEN SQLSTATE '55000' THEN error_code := '55000';
  END;
  hidden_statuses := pg_catalog.array_append(hidden_statuses,
    CASE error_code WHEN 'P0002' THEN '404' WHEN '42501' THEN '403' WHEN '55000' THEN '409' ELSE 'other' END);
  IF hidden_statuses IS DISTINCT FROM ARRAY['404','404']::text[] THEN
    RAISE EXCEPTION 'C26 absent and foreign open encounter PATCH must share hidden 404; observed %',hidden_statuses;
  END IF;

  -- Same-patient reference arrays accept both empty (0) and populated (n)
  -- values. The second request uses a fresh key because every call is a
  -- separately versioned PATCH mutation.
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c11-empty-0001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('1',64),true);
  request := jsonb_build_object('conditionIds','[]'::jsonb,'observationIds','[]'::jsonb,'orderIds','[]'::jsonb);
  SELECT clinical.update_encounter_api_v1(encounter_id,1,request) INTO result;
  IF result IS NULL OR (result->>'version')::integer<>2 THEN
    RAISE EXCEPTION 'C11 accepted zero-reference arrays without incrementing encounter version';
  END IF;

  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c11-references-0001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('2',64),true);
  request := jsonb_build_object('conditionIds',jsonb_build_array('f0101000-0000-4000-8e00-000000000001','f0101000-0000-4000-8e00-000000000002'));
  SELECT clinical.update_encounter_api_v1(encounter_id,2,request) INTO result;
  IF result IS NULL OR (result->>'version')::integer<>3 THEN
    RAISE EXCEPTION 'C11 did not persist valid same-patient 0..n condition references';
  END IF;
  before_version := (result->>'version')::integer;

  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000002',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','PAT',true);
  PERFORM pg_catalog.set_config('shifaa.action','updateEncounter',true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c11-unauthorized-0001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('b',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.update_encounter_api_v1(encounter_id,before_version,jsonb_build_object('conditionIds','[]'::jsonb));
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C11 patient actor updated a clinic encounter'; END IF;

  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000001',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','CLN',true);
  PERFORM pg_catalog.set_config('shifaa.aal','1',true);
  PERFORM pg_catalog.set_config('shifaa.action','updateEncounter',true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c11-low-aal-0001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('c',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.update_encounter_api_v1(encounter_id,before_version,jsonb_build_object('conditionIds','[]'::jsonb));
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C11 updateEncounter accepted below AAL2'; END IF;
  PERFORM pg_catalog.set_config('shifaa.aal','2',true);

  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c11-completed-0001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('f',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.update_encounter_api_v1('f0101000-0000-4000-8800-000000000003',1,jsonb_build_object('conditionIds','[]'::jsonb));
  EXCEPTION WHEN SQLSTATE '55000' THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C11 accepted update of a completed encounter or returned the wrong SQLSTATE'; END IF;

  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c11-observation-ref-0001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('d',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.update_encounter_api_v1(encounter_id,before_version,jsonb_build_object('observationIds',jsonb_build_array('f0101000-0000-4000-8f00-000000000001')));
  EXCEPTION WHEN SQLSTATE '22023' THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C11 accepted a non-empty observation reference without an approved source'; END IF;

  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c11-order-ref-0001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('e',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.update_encounter_api_v1(encounter_id,before_version,jsonb_build_object('orderIds',jsonb_build_array('f0101000-0000-4000-8f00-000000000002')));
  EXCEPTION WHEN SQLSTATE '22023' THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C11 accepted a non-empty order reference without an approved source'; END IF;

  -- Invalid and cross-patient references, stale If-Match, client participant
  -- addition, and responsible interval end all deny without state changes.
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c11-cross-patient-0001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('3',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.update_encounter_api_v1(encounter_id,before_version,jsonb_build_object('conditionIds',jsonb_build_array('f0101000-0000-4000-8e00-000000000003')));
  EXCEPTION WHEN insufficient_privilege OR invalid_parameter_value OR foreign_key_violation THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C11 accepted a cross-patient condition reference'; END IF;

  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c11-invalid-reference-0001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('4',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.update_encounter_api_v1(encounter_id,before_version,jsonb_build_object('conditionIds',jsonb_build_array('f0101000-0000-4000-8e00-000000000099')));
  EXCEPTION WHEN insufficient_privilege OR invalid_parameter_value OR foreign_key_violation THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C11 accepted a nonexistent condition reference'; END IF;

  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c11-stale-0001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('5',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.update_encounter_api_v1(encounter_id,before_version-1,jsonb_build_object('conditionIds','[]'::jsonb));
  EXCEPTION WHEN serialization_failure THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C11 accepted stale If-Match version'; END IF;

  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c11-add-participant-0001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('6',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.update_encounter_api_v1(encounter_id,before_version,jsonb_build_object('participants',jsonb_build_array(jsonb_build_object('personId','f0101000-0000-4000-8000-000000000003'))));
  EXCEPTION WHEN invalid_parameter_value OR insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C11 accepted participant-add request'; END IF;

  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c11-end-responsible-0001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('7',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.update_encounter_api_v1(encounter_id,before_version,jsonb_build_object('participantIntervalsEnd',jsonb_build_array(jsonb_build_object('personId','f0101000-0000-4000-8000-000000000001','roleCode','responsible_clinician','startedAt','2030-04-05T07:00:00Z'))));
  EXCEPTION WHEN insufficient_privilege OR invalid_parameter_value THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C11 ended the responsible clinician interval while encounter remained open'; END IF;


  -- Closing the active non-responsible interval immediately revokes both
  -- context read and send authorization in the same transaction.
  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000003',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','CLN',true);
  PERFORM pg_catalog.set_config('shifaa.aal','2',true);
  PERFORM pg_catalog.set_config('shifaa.action','listContextMessages',true);
  IF NOT clinical.feature_010_authorize_v1('listContextMessages','f0101000-0000-4000-8500-000000000004') THEN
    RAISE EXCEPTION 'C11 active non-responsible interval lacked listContextMessages authorization before end';
  END IF;
  PERFORM pg_catalog.set_config('shifaa.action','sendContextMessage',true);
  IF NOT clinical.feature_010_authorize_v1('sendContextMessage','f0101000-0000-4000-8500-000000000004') THEN
    RAISE EXCEPTION 'C11 active non-responsible interval lacked sendContextMessage authorization before end';
  END IF;

  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000001',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','CLN',true);
  PERFORM pg_catalog.set_config('shifaa.action','updateEncounter',true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c11-end-participant-0001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('8',64),true);
  request := jsonb_build_object('participantIntervalsEnd',jsonb_build_array(jsonb_build_object(
    'personId','f0101000-0000-4000-8000-000000000003','roleCode','consulting_clinician','startedAt','2030-04-05T07:05:00Z')));
  SELECT clinical.update_encounter_api_v1(encounter_id,before_version,request) INTO result;
  IF result IS NULL OR (result->>'version')::integer<>before_version+1 THEN
    RAISE EXCEPTION 'C11 did not end active non-responsible interval under the expected If-Match';
  END IF;
  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000003',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','CLN',true);
  PERFORM pg_catalog.set_config('shifaa.action','listContextMessages',true);
  IF clinical.feature_010_authorize_v1('listContextMessages','f0101000-0000-4000-8500-000000000004') THEN
    RAISE EXCEPTION 'C11 ended participant retained listContextMessages authorization';
  END IF;
  PERFORM pg_catalog.set_config('shifaa.action','sendContextMessage',true);
  IF clinical.feature_010_authorize_v1('sendContextMessage','f0101000-0000-4000-8500-000000000004') THEN
    RAISE EXCEPTION 'C11 ended participant retained sendContextMessage authorization';
  END IF;

  -- The API returns the completed canonical result on same-key/same-body
  -- replay; changed-body key reuse must conflict. Assert object equality and
  -- byte-stable jsonb serialization as visible to callers.
  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000001',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','CLN',true);
  PERFORM pg_catalog.set_config('shifaa.action','updateEncounter',true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c11-replay-0001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('9',64),true);
  request := jsonb_build_object('observationIds','[]'::jsonb);
  SELECT clinical.update_encounter_api_v1(encounter_id,before_version+1,request) INTO result;
  SELECT clinical.update_encounter_api_v1(encounter_id,before_version+1,request) INTO replay;
  IF result IS DISTINCT FROM replay OR result::text IS DISTINCT FROM replay::text THEN
    RAISE EXCEPTION 'C11 same-key/body replay was not byte-stable canonical response';
  END IF;
  PERFORM pg_catalog.set_config('shifaa.test_c11_response',result::text,true);

  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('a',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.update_encounter_api_v1(encounter_id,before_version+2,jsonb_build_object('conditionIds','[]'::jsonb));
  EXCEPTION WHEN unique_violation THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C11 accepted changed-body reuse of a completed idempotency key'; END IF;
END
$feature_010_c11_non_owner$;
RESET SESSION AUTHORIZATION;

DO $feature_010_c11_atomic_effects$
DECLARE target_encounter_id constant uuid := 'f0101000-0000-4000-8800-000000000002';
BEGIN
  IF (SELECT status FROM clinical.encounters WHERE id='f0101000-0000-4000-8800-000000000003')<>'completed'
     OR (SELECT version FROM clinical.encounters WHERE id='f0101000-0000-4000-8800-000000000003')<>1
     OR (SELECT cardinality(condition_ids) FROM clinical.encounters WHERE id='f0101000-0000-4000-8800-000000000003')<>0
     OR EXISTS (SELECT 1 FROM platform.idempotency_records
       WHERE method='PATCH' AND route_template='/v1/encounters/{encounterId}'
         AND key_hash=pg_catalog.encode(audit.sha256_v1(pg_catalog.convert_to(
           'shifaa:idempotency:key:v1:'||pg_catalog.octet_length('f010-c11-completed-0001')||':f010-c11-completed-0001','UTF8')),'hex'))
     OR EXISTS (SELECT 1 FROM audit.events WHERE resource_type='encounter' AND action_code='encounter.updated' AND resource_id='f0101000-0000-4000-8800-000000000003')
     OR EXISTS (SELECT 1 FROM platform.outbox_events WHERE aggregate_type='encounter' AND event_type='clinical.encounter.updated.v1' AND aggregate_id='f0101000-0000-4000-8800-000000000003') THEN
    RAISE EXCEPTION 'C11 completed encounter rejection left state, idempotency, audit, or outbox effects';
  END IF;
  IF (SELECT version FROM clinical.encounters WHERE id=target_encounter_id)<>5
     OR (SELECT condition_ids @> ARRAY['f0101000-0000-4000-8e00-000000000001'::uuid,'f0101000-0000-4000-8e00-000000000002'::uuid] AND cardinality(condition_ids)=2 FROM clinical.encounters WHERE id=target_encounter_id) IS DISTINCT FROM true
     OR (SELECT participant.ended_at FROM clinical.encounter_participants participant WHERE participant.encounter_id=target_encounter_id AND participant.person_id='f0101000-0000-4000-8000-000000000003') IS NULL THEN
    RAISE EXCEPTION 'C11 success did not commit condition facts, interval end, and version exactly once';
  END IF;
  IF (SELECT count(*) FROM platform.idempotency_records
      WHERE method='PATCH' AND route_template='/v1/encounters/{encounterId}'
        AND key_hash=pg_catalog.encode(audit.sha256_v1(pg_catalog.convert_to(
          'shifaa:idempotency:key:v1:'||pg_catalog.octet_length('f010-c11-replay-0001')||':f010-c11-replay-0001','UTF8')),'hex')
        AND resource_id=target_encounter_id AND state='completed' AND response_body IS NOT NULL
        AND response_body::text=pg_catalog.current_setting('shifaa.test_c11_response'))<>1
     OR (SELECT count(*) FROM audit.events WHERE resource_type='encounter' AND action_code='encounter.updated' AND resource_id=target_encounter_id)<>4
     OR (SELECT count(*) FROM platform.outbox_events WHERE aggregate_type='encounter' AND event_type='clinical.encounter.updated.v1' AND aggregate_id=target_encounter_id)<>4 THEN
    RAISE EXCEPTION 'C11 expected exactly-once completed response and one audit/outbox per four successful mutations';
  END IF;
  IF (SELECT count(*) FROM platform.idempotency_records WHERE method='PATCH' AND route_template='/v1/encounters/{encounterId}' AND state='completed')<>4
     OR (SELECT count(*) FROM audit.events WHERE resource_type='encounter' AND action_code='encounter.updated' AND resource_id=target_encounter_id)<>(SELECT count(*) FROM platform.outbox_events WHERE aggregate_type='encounter' AND event_type='clinical.encounter.updated.v1' AND aggregate_id=target_encounter_id) THEN
    RAISE EXCEPTION 'C11 replay/denial left duplicate effects or audit/outbox imbalance';
  END IF;
END
$feature_010_c11_atomic_effects$;
ROLLBACK;
