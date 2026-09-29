-- Feature 010 C10 real-PostgreSQL API vectors. All synthetic fixture writes
-- and online calls are rolled back; online assertions execute as shifaa_api.
BEGIN;
SELECT pg_catalog.set_config('shifaa.environment','local',true);
SELECT pg_catalog.set_config('shifaa.test_now','2030-04-05T08:00:00Z',true);

INSERT INTO identity.people(id,user_id,display_name,profile_status) VALUES
 ('f0101000-0000-4000-8000-000000000001','f0101000-0000-4000-9000-000000000001','F010 C10 clinician','active'),
 ('f0101000-0000-4000-8000-000000000002','f0101000-0000-4000-9000-000000000002','F010 C10 patient','active'),
 ('f0101000-0000-4000-8000-000000000003','f0101000-0000-4000-9000-000000000003','F010 C10 alternate clinician','active'),
 ('f0101000-0000-4000-8000-000000000004','f0101000-0000-4000-9000-000000000004','F010 C10 guardian','active'),
 ('f0101000-0000-4000-8000-000000000005','f0101000-0000-4000-9000-000000000005','F010 C10 delegate','active');
INSERT INTO identity.patients(id,person_id,medical_record_number,record_status)
VALUES ('f0101000-0000-4000-8100-000000000001','f0101000-0000-4000-8000-000000000002','F010-C10-MRN-1','active');
INSERT INTO identity.facilities(id,facility_type,name_ar,name_en,facility_status,governorate_code,city,district,address_line,created_by_person_id)
VALUES ('f0101000-0000-4000-8200-000000000001','clinic','عيادة C10','F010 C10 clinic','active','C','Cairo','Test','Synthetic address','f0101000-0000-4000-8000-000000000001');
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

-- Place the expected red check after all synthetic fixture SQL has parsed and
-- executed; PostgreSQL rolls the fixture transaction back on this failure.
DO $feature_010_c10_api_boundary$
BEGIN
  IF pg_catalog.to_regprocedure('clinical.create_encounter_api_v1(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'F010 C10 RED: missing locked API mutation boundary clinical.create_encounter_api_v1(jsonb)';
  END IF;
END
$feature_010_c10_api_boundary$;

SET SESSION AUTHORIZATION shifaa_api;
DO $feature_010_c10_api_non_owner$
DECLARE
  request jsonb := jsonb_build_object(
    'appointmentId','f0101000-0000-4000-8500-000000000001',
    'patientId','f0101000-0000-4000-8000-000000000002',
    'encounterType','consultation'
  );
  created jsonb;
  replayed jsonb;
  projection jsonb;
  created_id uuid;
  denied boolean;
BEGIN
  IF session_user<>'shifaa_api' OR current_user<>'shifaa_api' THEN
    RAISE EXCEPTION 'C10 SQL vector did not execute as non-owner shifaa_api';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'C10 online role must be non-superuser and NOBYPASSRLS';
  END IF;
  IF NOT pg_catalog.has_function_privilege(current_user,'clinical.create_encounter_api_v1(jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'C10 online role lacks the narrow createEncounter API grant';
  END IF;
  BEGIN
    PERFORM count(*) FROM clinical.encounters;
    RAISE EXCEPTION 'C10 online role can directly read encounters';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000001',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','CLN',true);
  PERFORM pg_catalog.set_config('shifaa.action','createEncounter',true);
  PERFORM pg_catalog.set_config('shifaa.aal','2',true);
  PERFORM pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);
  PERFORM pg_catalog.set_config('shifaa.request_id','f0101000-0000-4000-9000-000000000001',true);
  PERFORM pg_catalog.set_config('shifaa.trace_id','f0101000-0000-4000-9000-000000000001',true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c10-create-success-0001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('a',64),true);
  SELECT clinical.create_encounter_api_v1(request) INTO created;
  created_id := (created->'encounter'->>'id')::uuid;
  PERFORM pg_catalog.set_config('shifaa.test_created_encounter_id',created_id::text,true);
  IF created->'encounter'->>'responsibleClinicianId'<>'f0101000-0000-4000-8000-000000000001'
     OR created->>'appointmentStatus'<>'in_consultation'
     OR created->>'queueStatus'<>'in_service' THEN
    RAISE EXCEPTION 'C10 createEncounter did not return its locked canonical response';
  END IF;
  SELECT clinical.create_encounter_api_v1(request) INTO replayed;
  IF replayed IS DISTINCT FROM created THEN RAISE EXCEPTION 'C10 same-key replay changed the stored response'; END IF;

  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c10-stale-after-success-0001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('c',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.create_encounter_api_v1(request);
  EXCEPTION WHEN serialization_failure THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C10 accepted a new key after the checked-in/called transition was consumed'; END IF;

  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c10-create-success-0001',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('b',64),true);
  denied := false;
  BEGIN
    PERFORM clinical.create_encounter_api_v1(request || jsonb_build_object('encounterType','follow_up'));
  EXCEPTION WHEN unique_violation THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C10 changed-body key reuse was accepted'; END IF;

  -- Missing queue, mismatched queue, invalid closed body, missing AAL/purpose,
  -- and an unrelated licensed clinician all fail inside the same transaction.
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('2',64),true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c10-missing-queue-0001',true);
  denied := false;
  BEGIN
    PERFORM clinical.create_encounter_api_v1(jsonb_build_object('appointmentId','f0101000-0000-4000-8500-000000000002','patientId','f0101000-0000-4000-8000-000000000002','encounterType','consultation'));
  EXCEPTION WHEN insufficient_privilege OR serialization_failure THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C10 encounter creation without a queue was accepted'; END IF;

  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('3',64),true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c10-mismatched-queue-0001',true);
  denied := false;
  BEGIN
    PERFORM clinical.create_encounter_api_v1(jsonb_build_object('appointmentId','f0101000-0000-4000-8500-000000000003','patientId','f0101000-0000-4000-8000-000000000002','encounterType','consultation'));
  EXCEPTION WHEN insufficient_privilege OR serialization_failure THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C10 mismatched queue scope was accepted'; END IF;

  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('4',64),true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c10-client-workforce-0001',true);
  denied := false;
  BEGIN
    PERFORM clinical.create_encounter_api_v1(request || jsonb_build_object('responsibleClinicianId','f0101000-0000-4000-8000-000000000001'));
  EXCEPTION WHEN invalid_parameter_value THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C10 accepted a client-supplied workforce identifier'; END IF;

  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('5',64),true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c10-low-aal-0001',true);
  PERFORM pg_catalog.set_config('shifaa.aal','1',true);
  denied := false;
  BEGIN
    PERFORM clinical.create_encounter_api_v1(jsonb_build_object('appointmentId','f0101000-0000-4000-8500-000000000005','patientId','f0101000-0000-4000-8000-000000000002','encounterType','consultation'));
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C10 createEncounter accepted below AAL2'; END IF;

  PERFORM pg_catalog.set_config('shifaa.aal','2',true);
  PERFORM pg_catalog.set_config('shifaa.purposes','',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('6',64),true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c10-no-purpose-0001',true);
  denied := false;
  BEGIN
    PERFORM clinical.create_encounter_api_v1(jsonb_build_object('appointmentId','f0101000-0000-4000-8500-000000000005','patientId','f0101000-0000-4000-8000-000000000002','encounterType','consultation'));
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C10 createEncounter accepted missing purpose'; END IF;

  PERFORM pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);
  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000003',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',pg_catalog.repeat('7',64),true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c10-unrelated-clinician-0001',true);
  denied := false;
  BEGIN
    PERFORM clinical.create_encounter_api_v1(jsonb_build_object('appointmentId','f0101000-0000-4000-8500-000000000005','patientId','f0101000-0000-4000-8000-000000000002','encounterType','consultation'));
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'C10 unrelated clinician created an encounter'; END IF;

  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000002',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','PAT',true);
  PERFORM pg_catalog.set_config('shifaa.action','getEncounter',true);
  PERFORM pg_catalog.set_config('shifaa.aal','1',true);
  projection := clinical.feature_010_get_encounter_projection_v1('f0101000-0000-4000-8800-000000000002');
  IF projection IS NULL
     OR jsonb_array_length(projection->'notes')<>1
     OR jsonb_array_length(projection->'participants')<>1
     OR projection->'participants'->0->>'personId'<>'f0101000-0000-4000-8000-000000000001'
     OR projection->'notes'->0->>'id'<>'f0101000-0000-4000-8900-000000000002'
     OR projection::text LIKE '%8900-000000000001%'
     OR projection::text LIKE '%body%' THEN
    RAISE EXCEPTION 'C10 subject role projection did not exclude private note metadata/body';
  END IF;
  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000001',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','CLN',true);
  projection := clinical.feature_010_get_encounter_projection_v1('f0101000-0000-4000-8800-000000000002');
  IF projection IS NULL OR jsonb_array_length(projection->'notes')<>2
     OR jsonb_array_length(projection->'participants')<>1
     OR projection->'participants'->0->>'personId'<>'f0101000-0000-4000-8000-000000000001'
     OR projection::text LIKE '%body%' THEN
    RAISE EXCEPTION 'C10 care-team projection did not remain metadata-only';
  END IF;
  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000004',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','GUA',true);
  projection := clinical.feature_010_get_encounter_projection_v1('f0101000-0000-4000-8800-000000000002');
  IF projection IS NULL OR jsonb_array_length(projection->'notes')<>1
     OR jsonb_array_length(projection->'participants')<>1
     OR projection->'participants'->0->>'personId'<>'f0101000-0000-4000-8000-000000000001'
     OR projection->'notes'->0->>'id'<>'f0101000-0000-4000-8900-000000000002'
     OR projection::text LIKE '%8900-000000000001%' OR projection::text LIKE '%body%' THEN
    RAISE EXCEPTION 'C10 guardian projection exposed private note metadata/body';
  END IF;
  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000005',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','DEL',true);
  projection := clinical.feature_010_get_encounter_projection_v1('f0101000-0000-4000-8800-000000000002');
  IF projection IS NULL OR jsonb_array_length(projection->'notes')<>1
     OR jsonb_array_length(projection->'participants')<>1
     OR projection->'participants'->0->>'personId'<>'f0101000-0000-4000-8000-000000000001'
     OR projection->'notes'->0->>'id'<>'f0101000-0000-4000-8900-000000000002'
     OR projection::text LIKE '%8900-000000000001%' OR projection::text LIKE '%body%' THEN
    RAISE EXCEPTION 'C10 delegate projection exposed private note metadata/body';
  END IF;
  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000003',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','CLN',true);
  projection := clinical.feature_010_get_encounter_projection_v1('f0101000-0000-4000-8800-000000000002');
  IF projection IS NOT NULL THEN RAISE EXCEPTION 'C10 unrelated clinician received encounter projection'; END IF;
  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000004',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','GUA',true);
  PERFORM pg_catalog.set_config('shifaa.purposes','',true);
  projection := clinical.feature_010_get_encounter_projection_v1('f0101000-0000-4000-8800-000000000002');
  IF projection IS NOT NULL THEN RAISE EXCEPTION 'C10 guardian projection did not fail closed without purpose'; END IF;
END
$feature_010_c10_api_non_owner$;
RESET SESSION AUTHORIZATION;

DO $feature_010_c10_atomic_effects$
DECLARE
  expected_encounter_id uuid;
BEGIN
  expected_encounter_id := pg_catalog.current_setting('shifaa.test_created_encounter_id')::uuid;
  IF (SELECT count(*) FROM clinical.encounters WHERE appointment_id='f0101000-0000-4000-8500-000000000001' AND status='open')<>1
     OR (SELECT count(*) FROM clinical.encounter_participants WHERE encounter_participants.encounter_id=expected_encounter_id AND ended_at IS NULL)<>1
     OR (SELECT status FROM clinical.appointments WHERE id='f0101000-0000-4000-8500-000000000001')<>'in_consultation'
     OR (SELECT state FROM clinical.queue_entries WHERE appointment_id='f0101000-0000-4000-8500-000000000001')<>'in_service' THEN
    RAISE EXCEPTION 'C10 successful encounter did not commit the domain triple exactly once';
  END IF;
  IF (SELECT count(*) FROM platform.idempotency_records WHERE method='POST' AND route_template='/v1/encounters' AND resource_id=expected_encounter_id AND state='completed' AND response_body IS NOT NULL)<>1
     OR (SELECT count(*) FROM audit.events WHERE resource_type='encounter' AND action_code='encounter.created' AND resource_id=expected_encounter_id)<>1
     OR (SELECT count(*) FROM platform.outbox_events WHERE aggregate_type='encounter' AND event_type='clinical.encounter.opened.v1' AND aggregate_id=expected_encounter_id)<>1 THEN
    RAISE EXCEPTION 'C10 successful encounter must have exactly one stored response, audit and outbox effect';
  END IF;
  IF (SELECT count(*) FROM clinical.encounters WHERE appointment_id IN (
       'f0101000-0000-4000-8500-000000000002','f0101000-0000-4000-8500-000000000003','f0101000-0000-4000-8500-000000000005'
     ))<>0
     OR (SELECT count(*) FROM platform.idempotency_records WHERE method='POST' AND route_template='/v1/encounters')<>1
     OR (SELECT count(*) FROM audit.events WHERE resource_type='encounter' AND action_code='encounter.created')<>1
     OR (SELECT count(*) FROM platform.outbox_events WHERE aggregate_type='encounter' AND event_type='clinical.encounter.opened.v1')<>1 THEN
    RAISE EXCEPTION 'C10 replay or denied path left duplicate or partial domain/audit/outbox/idempotency effects';
  END IF;
END
$feature_010_c10_atomic_effects$;
ROLLBACK;
