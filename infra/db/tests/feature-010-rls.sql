-- Feature 010 C07 live authorization matrix. Fixtures are created by the
-- disposable database administrator; every policy vector below runs as the
-- real, non-owner, NOBYPASSRLS shifaa_api identity.
BEGIN;
SELECT pg_catalog.set_config('shifaa.environment','local',true);
SELECT pg_catalog.set_config('shifaa.test_now','2026-09-27T09:00:00Z',true);

INSERT INTO identity.people(id,user_id,display_name,profile_status) VALUES
 ('f0100700-0000-4000-8000-000000000001','f0100700-0000-4000-9000-000000000001','F010 C07 source clinician','active'),
 ('f0100700-0000-4000-8000-000000000002','f0100700-0000-4000-9000-000000000002','F010 C07 patient','active'),
 ('f0100700-0000-4000-8000-000000000003','f0100700-0000-4000-9000-000000000003','F010 C07 guardian','active'),
 ('f0100700-0000-4000-8000-000000000004','f0100700-0000-4000-9000-000000000004','F010 C07 delegate','active'),
 ('f0100700-0000-4000-8000-000000000005','f0100700-0000-4000-9000-000000000005','F010 C07 target clinician','active'),
 ('f0100700-0000-4000-8000-000000000006','f0100700-0000-4000-9000-000000000006','F010 C07 ended clinician','active'),
 ('f0100700-0000-4000-8000-000000000007','f0100700-0000-4000-9000-000000000007','F010 C07 independent reviewer','active'),
 ('f0100700-0000-4000-8000-000000000008','f0100700-0000-4000-9000-000000000008','F010 C07 unrelated actor','active');
INSERT INTO identity.patients(id,person_id,medical_record_number,record_status)
VALUES ('f0100700-0000-4000-8100-000000000001','f0100700-0000-4000-8000-000000000002','F010-C07-MRN-1','active');
INSERT INTO identity.facilities(id,facility_type,name_ar,name_en,facility_status,governorate_code,city,district,address_line,created_by_person_id) VALUES
 ('f0100700-0000-4000-8200-000000000001','clinic','عيادة المصدر','F010 C07 source clinic','active','C','Cairo','Test','Synthetic source address','f0100700-0000-4000-8000-000000000001'),
 ('f0100700-0000-4000-8200-000000000002','clinic','عيادة الهدف','F010 C07 target clinic','active','C','Cairo','Test','Synthetic target address','f0100700-0000-4000-8000-000000000005');
INSERT INTO identity.professional_licenses(id,person_id,profession,number_ciphertext,number_hash,issuer,expires_on,status) VALUES
 ('f0100700-0000-4000-8300-000000000001','f0100700-0000-4000-8000-000000000001','doctor',decode(repeat('1',16),'hex'),decode(repeat('1',64),'hex'),'F010 synthetic regulator','2035-12-31','verified'),
 ('f0100700-0000-4000-8300-000000000002','f0100700-0000-4000-8000-000000000005','doctor',decode(repeat('2',16),'hex'),decode(repeat('2',64),'hex'),'F010 synthetic regulator','2035-12-31','verified'),
 ('f0100700-0000-4000-8300-000000000003','f0100700-0000-4000-8000-000000000006','doctor',decode(repeat('3',16),'hex'),decode(repeat('3',64),'hex'),'F010 synthetic regulator','2035-12-31','verified');
INSERT INTO identity.facility_memberships(facility_id,person_id,role_code,employment_license_id,valid_from,membership_status,created_by_person_id) VALUES
 ('f0100700-0000-4000-8200-000000000001','f0100700-0000-4000-8000-000000000001','doctor','f0100700-0000-4000-8300-000000000001','2020-01-01','active','f0100700-0000-4000-8000-000000000001'),
 ('f0100700-0000-4000-8200-000000000002','f0100700-0000-4000-8000-000000000005','doctor','f0100700-0000-4000-8300-000000000002','2020-01-01','active','f0100700-0000-4000-8000-000000000005'),
 ('f0100700-0000-4000-8200-000000000001','f0100700-0000-4000-8000-000000000006','doctor','f0100700-0000-4000-8300-000000000003','2020-01-01','active','f0100700-0000-4000-8000-000000000001');
INSERT INTO clinical.schedules(id,facility_id,doctor_person_id,timezone_name,valid_from,valid_to,slot_duration_minutes,fee_minor_units,currency_code,created_by_person_id,updated_by_person_id) VALUES
 ('f0100700-0000-4000-8400-000000000001','f0100700-0000-4000-8200-000000000001','f0100700-0000-4000-8000-000000000001','Africa/Cairo','2026-09-27','2026-10-27',30,10000,'EGP','f0100700-0000-4000-8000-000000000001','f0100700-0000-4000-8000-000000000001'),
 ('f0100700-0000-4000-8400-000000000002','f0100700-0000-4000-8200-000000000002','f0100700-0000-4000-8000-000000000005','Africa/Cairo','2026-09-27','2026-10-27',30,10000,'EGP','f0100700-0000-4000-8000-000000000005','f0100700-0000-4000-8000-000000000005');
INSERT INTO clinical.appointments(id,patient_person_id,facility_id,doctor_person_id,schedule_id,starts_at,ends_at,timezone_name,civil_date,local_start,fee_minor_units,currency_code,payment_method,status,created_by_person_id,updated_by_person_id) VALUES
 ('f0100700-0000-4000-8500-000000000001','f0100700-0000-4000-8000-000000000002','f0100700-0000-4000-8200-000000000001','f0100700-0000-4000-8000-000000000001','f0100700-0000-4000-8400-000000000001','2026-09-27T10:00:00Z','2026-09-27T10:30:00Z','Africa/Cairo','2026-09-27','12:00',10000,'EGP','cash_on_arrival','confirmed','f0100700-0000-4000-8000-000000000001','f0100700-0000-4000-8000-000000000001'),
 ('f0100700-0000-4000-8500-000000000002','f0100700-0000-4000-8000-000000000002','f0100700-0000-4000-8200-000000000001','f0100700-0000-4000-8000-000000000001','f0100700-0000-4000-8400-000000000001','2026-09-27T11:00:00Z','2026-09-27T11:30:00Z','Africa/Cairo','2026-09-27','13:00',10000,'EGP','cash_on_arrival','confirmed','f0100700-0000-4000-8000-000000000001','f0100700-0000-4000-8000-000000000001'),
 ('f0100700-0000-4000-8500-000000000004','f0100700-0000-4000-8000-000000000002','f0100700-0000-4000-8200-000000000001','f0100700-0000-4000-8000-000000000001','f0100700-0000-4000-8400-000000000001','2026-09-27T13:00:00Z','2026-09-27T13:30:00Z','Africa/Cairo','2026-09-27','15:00',10000,'EGP','cash_on_arrival','confirmed','f0100700-0000-4000-8000-000000000001','f0100700-0000-4000-8000-000000000001'),
 ('f0100700-0000-4000-8500-000000000003','f0100700-0000-4000-8000-000000000002','f0100700-0000-4000-8200-000000000002','f0100700-0000-4000-8000-000000000005','f0100700-0000-4000-8400-000000000002','2026-09-27T12:00:00Z','2026-09-27T12:30:00Z','Africa/Cairo','2026-09-27','14:00',10000,'EGP','cash_on_arrival','confirmed','f0100700-0000-4000-8000-000000000005','f0100700-0000-4000-8000-000000000005');
ALTER TABLE clinical.appointments DISABLE TRIGGER USER;
UPDATE clinical.appointments SET status='in_consultation' WHERE id='f0100700-0000-4000-8500-000000000001';
UPDATE clinical.appointments SET status='checked_in' WHERE id='f0100700-0000-4000-8500-000000000002';
UPDATE clinical.appointments SET status='completed' WHERE id='f0100700-0000-4000-8500-000000000004';
ALTER TABLE clinical.appointments ENABLE TRIGGER USER;
INSERT INTO clinical.queue_scopes(id,facility_id,doctor_person_id,civil_date,timezone_name) VALUES
 ('f0100700-0000-4000-8600-000000000001','f0100700-0000-4000-8200-000000000001','f0100700-0000-4000-8000-000000000001','2026-09-27','Africa/Cairo');
INSERT INTO clinical.queue_entries(id,queue_scope_id,appointment_id,facility_id,doctor_person_id,civil_date,queue_number,waiting_order,state) VALUES
 ('f0100700-0000-4000-8700-000000000001','f0100700-0000-4000-8600-000000000001','f0100700-0000-4000-8500-000000000002','f0100700-0000-4000-8200-000000000001','f0100700-0000-4000-8000-000000000001','2026-09-27',1,1,'waiting'),
 ('f0100700-0000-4000-8700-000000000002','f0100700-0000-4000-8600-000000000001','f0100700-0000-4000-8500-000000000001','f0100700-0000-4000-8200-000000000001','f0100700-0000-4000-8000-000000000001','2026-09-27',2,2,'waiting');
ALTER TABLE clinical.queue_entries DISABLE TRIGGER USER;
UPDATE clinical.queue_entries SET state=CASE WHEN appointment_id='f0100700-0000-4000-8500-000000000001' THEN 'in_service' ELSE 'called' END,waiting_order=NULL,called_at=statement_timestamp();
ALTER TABLE clinical.queue_entries ENABLE TRIGGER USER;
INSERT INTO clinical.encounters(id,patient_person_id,facility_id,appointment_id,responsible_clinician_id,encounter_type,status) VALUES
 ('f0100700-0000-4000-8800-000000000001','f0100700-0000-4000-8000-000000000002','f0100700-0000-4000-8200-000000000001','f0100700-0000-4000-8500-000000000001','f0100700-0000-4000-8000-000000000001','consultation','open');
INSERT INTO clinical.encounters(id,patient_person_id,facility_id,appointment_id,responsible_clinician_id,encounter_type,status,started_at,ended_at,completion_summary)
VALUES ('f0100700-0000-4000-8800-000000000002','f0100700-0000-4000-8000-000000000002','f0100700-0000-4000-8200-000000000001','f0100700-0000-4000-8500-000000000004','f0100700-0000-4000-8000-000000000001','consultation','completed','2026-09-27T08:00:00Z','2026-09-27T08:30:00Z','Synthetic completed encounter');
INSERT INTO clinical.encounters(id,patient_person_id,facility_id,appointment_id,responsible_clinician_id,encounter_type,status)
VALUES ('f0100700-0000-4000-8800-000000000003','f0100700-0000-4000-8000-000000000002','f0100700-0000-4000-8200-000000000002','f0100700-0000-4000-8500-000000000003','f0100700-0000-4000-8000-000000000005','consultation','open');
INSERT INTO clinical.encounter_participants(encounter_id,person_id,role_code,started_at) VALUES
 ('f0100700-0000-4000-8800-000000000001','f0100700-0000-4000-8000-000000000001','responsible_clinician','2026-09-27T08:00:00Z'),
 ('f0100700-0000-4000-8800-000000000002','f0100700-0000-4000-8000-000000000001','responsible_clinician','2026-09-27T08:00:00Z'),
 ('f0100700-0000-4000-8800-000000000003','f0100700-0000-4000-8000-000000000005','responsible_clinician','2026-09-27T08:00:00Z');
INSERT INTO clinical.encounter_participants(encounter_id,person_id,role_code,started_at,ended_at) VALUES
 ('f0100700-0000-4000-8800-000000000001','f0100700-0000-4000-8000-000000000006','consultant','2026-09-27T08:00:00Z','2026-09-27T08:30:00Z');
INSERT INTO clinical.clinical_notes(id,encounter_id,author_person_id,note_type,body_ciphertext,visibility_code,signed_at) VALUES
 ('f0100700-0000-4000-8900-000000000001','f0100700-0000-4000-8800-000000000001','f0100700-0000-4000-8000-000000000001','assessment',decode('aabb','hex'),'private','2026-09-27T08:20:00Z'),
 ('f0100700-0000-4000-8900-000000000002','f0100700-0000-4000-8800-000000000001','f0100700-0000-4000-8000-000000000001','plan',decode('ccdd','hex'),'patient_visible','2026-09-27T08:25:00Z');
INSERT INTO clinical.referrals(id,source_encounter_id,patient_id,requester_person_id,target_specialty,target_facility_id,target_doctor_person_id,reason_summary,encounter_type,status) VALUES
 ('f0100700-0000-4000-8a00-000000000001','f0100700-0000-4000-8800-000000000001','f0100700-0000-4000-8100-000000000001','f0100700-0000-4000-8000-000000000001','cardiology','f0100700-0000-4000-8200-000000000002','f0100700-0000-4000-8000-000000000005','synthetic pending referral summary','consultation','pending');
INSERT INTO clinical.referrals(id,source_encounter_id,patient_id,requester_person_id,target_specialty,target_facility_id,target_doctor_person_id,reason_summary,encounter_type,status,resulting_appointment_id,accepted_field_codes,accepted_by_person_id,accepted_at) VALUES
 ('f0100700-0000-4000-8a00-000000000002','f0100700-0000-4000-8800-000000000001','f0100700-0000-4000-8100-000000000001','f0100700-0000-4000-8000-000000000001','cardiology','f0100700-0000-4000-8200-000000000002','f0100700-0000-4000-8000-000000000005','synthetic accepted referral summary','consultation','accepted','f0100700-0000-4000-8500-000000000003',ARRAY['reason_summary','encounter_type'],'f0100700-0000-4000-8000-000000000002','2026-09-27T08:40:00Z');
INSERT INTO clinical.referrals(id,source_encounter_id,patient_id,requester_person_id,target_specialty,reason_summary,status)
VALUES ('f0100700-0000-4000-8a00-000000000003','f0100700-0000-4000-8800-000000000002','f0100700-0000-4000-8100-000000000001','f0100700-0000-4000-8000-000000000001','cardiology','synthetic completed-source referral','pending');
INSERT INTO trust.messages(id,context_type,context_id,sender_person_id,body_ciphertext,sent_at) VALUES
 ('f0100700-0000-4000-8b00-000000000001','appointment','f0100700-0000-4000-8500-000000000001','f0100700-0000-4000-8000-000000000001',decode('eeff','hex'),'2026-09-27T08:45:00Z');

-- Seed one currently approved guardianship and one accepted delegation through
-- their existing authority transitions so these vectors use live source rows.
INSERT INTO identity.private_evidence_objects(id,bucket_code,object_key,owner_person_id,resource_patient_id,sha256,mime_type,size_bytes,scan_status)
VALUES ('f0100700-0000-4000-8c00-000000000001','guardianship-evidence','f010-c07/guardian.pdf','f0100700-0000-4000-8000-000000000003','f0100700-0000-4000-8100-000000000001',repeat('a',64),'application/pdf',32,'released');
SELECT pg_catalog.set_config('shifaa.person_id','f0100700-0000-4000-8000-000000000003',true);
SELECT pg_catalog.set_config('shifaa.actor_role','PAT',true);
SELECT pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);
INSERT INTO identity.care_relationships(id,subject_patient_id,actor_person_id,relationship_type,status,purpose_code,created_by_person_id,evidence_object_id)
VALUES ('f0100700-0000-4000-8d00-000000000001','f0100700-0000-4000-8100-000000000001','f0100700-0000-4000-8000-000000000003','guardianship','pending','appointment.scheduling','f0100700-0000-4000-8000-000000000003','f0100700-0000-4000-8c00-000000000001');
INSERT INTO identity.care_relationship_permissions(relationship_id,permission_code,created_by_person_id)
VALUES ('f0100700-0000-4000-8d00-000000000001','record.view','f0100700-0000-4000-8000-000000000003');
SELECT pg_catalog.set_config('shifaa.person_id','f0100700-0000-4000-8000-000000000007',true);
SELECT pg_catalog.set_config('shifaa.actor_role','ADM-SUPPORT',true);
SELECT pg_catalog.set_config('shifaa.aal','2',true);
SELECT pg_catalog.set_config('shifaa.purposes','guardianship_review',true);
UPDATE identity.care_relationships SET status='active',reviewed_by_person_id='f0100700-0000-4000-8000-000000000007',reviewed_at=statement_timestamp(),decision_reason_code='synthetic-approved'
WHERE id='f0100700-0000-4000-8d00-000000000001';
SELECT pg_catalog.set_config('shifaa.person_id','f0100700-0000-4000-8000-000000000002',true);
SELECT pg_catalog.set_config('shifaa.actor_role','PAT',true);
SELECT pg_catalog.set_config('shifaa.aal','2',true);
INSERT INTO identity.care_relationships(id,subject_patient_id,actor_person_id,relationship_type,status,purpose_code,created_by_person_id,invite_token_digest,invite_key_version,invite_expires_at)
VALUES ('f0100700-0000-4000-8d00-000000000002','f0100700-0000-4000-8100-000000000001','f0100700-0000-4000-8000-000000000004','delegation','pending','appointment.scheduling','f0100700-0000-4000-8000-000000000002',decode(repeat('b',64),'hex'),1,'2026-09-28T00:00:00Z');
INSERT INTO identity.care_relationship_permissions(relationship_id,permission_code,created_by_person_id) VALUES
 ('f0100700-0000-4000-8d00-000000000002','record.view','f0100700-0000-4000-8000-000000000002'),
 ('f0100700-0000-4000-8d00-000000000002','appointment.manage','f0100700-0000-4000-8000-000000000002');
SELECT pg_catalog.set_config('shifaa.person_id','f0100700-0000-4000-8000-000000000004',true);
SELECT pg_catalog.set_config('shifaa.actor_role','DEL',true);
UPDATE identity.care_relationships SET status='active',invite_token_digest=NULL,invite_key_version=NULL,invite_expires_at=NULL,invite_consumed_at=statement_timestamp()
WHERE id='f0100700-0000-4000-8d00-000000000002';

-- The F010 message table CHECK constraint only permits appointment context,
-- so a non-appointment fixture row cannot exist. Assert C07 also pins the RLS
-- policy to that resource type.
DO $feature_010_message_policy_shape$
DECLARE
  message_policy text;
BEGIN
  SELECT pg_catalog.lower(pg_catalog.regexp_replace(qual,'[[:space:]]','','g'))
    INTO message_policy
  FROM pg_catalog.pg_policies
  WHERE schemaname='trust' AND tablename='messages'
    AND policyname='f010_c07_messages_select';
  IF message_policy IS NULL
     OR pg_catalog.strpos(message_policy,'context_type=''appointment''')=0 THEN
    RAISE EXCEPTION 'F010 C07 messages policy must require appointment context';
  END IF;
END
$feature_010_message_policy_shape$;

SET SESSION AUTHORIZATION shifaa_api;
DO $feature_010_rls_matrix$
DECLARE
  effective_role pg_roles%ROWTYPE;
  op record;
  actual boolean;
  projection jsonb;
BEGIN
  IF session_user<>'shifaa_api' OR current_user<>'shifaa_api' THEN
    RAISE EXCEPTION 'F010 C07 test must execute with session_user=current_user=shifaa_api';
  END IF;
  SELECT * INTO effective_role FROM pg_catalog.pg_roles WHERE rolname=current_user;
  IF NOT FOUND OR effective_role.rolsuper OR effective_role.rolbypassrls THEN
    RAISE EXCEPTION 'F010 C07 online role must be non-superuser and NOBYPASSRLS';
  END IF;
  IF pg_catalog.to_regprocedure('clinical.feature_010_authorize_v1(text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'F010 C07 RED: missing current-authority authorization boundary clinical.feature_010_authorize_v1(text,uuid)';
  END IF;

  -- Direct online table access stays denied; approved data crosses the narrow
  -- projection functions only.
  BEGIN
    PERFORM count(*) FROM clinical.encounters;
    RAISE EXCEPTION 'F010 C07 direct encounter table access was granted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM count(*) FROM clinical.encounter_participants;
    RAISE EXCEPTION 'F010 C07 direct participant table access was granted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM count(*) FROM clinical.clinical_notes;
    RAISE EXCEPTION 'F010 C07 direct note table access was granted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM count(*) FROM clinical.conditions;
    RAISE EXCEPTION 'F010 C07 direct condition table access was granted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM count(*) FROM clinical.referrals;
    RAISE EXCEPTION 'F010 C07 direct referral table access was granted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM count(*) FROM trust.messages;
    RAISE EXCEPTION 'F010 C07 direct message table access was granted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE clinical.encounters SET version=version+1 WHERE id='f0100700-0000-4000-8800-000000000001';
    RAISE EXCEPTION 'F010 C07 direct encounter update was granted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM clinical.clinical_notes WHERE id='f0100700-0000-4000-8900-000000000002';
    RAISE EXCEPTION 'F010 C07 direct note delete was granted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Each listed value is an existing OpenAPI operationId. The resource id
  -- follows that operation's canonical resource (appointment, encounter, or
  -- referral); this checkpoint proves authorization only, not later writes.
  FOR op IN SELECT * FROM (VALUES
    ('createEncounter','f0100700-0000-4000-8500-000000000002'::uuid,true),
    ('getEncounter','f0100700-0000-4000-8800-000000000001'::uuid,true),
    ('updateEncounter','f0100700-0000-4000-8800-000000000001'::uuid,true),
    ('signEncounterNote','f0100700-0000-4000-8800-000000000001'::uuid,true),
    ('completeEncounter','f0100700-0000-4000-8800-000000000001'::uuid,true),
    ('createReferral','f0100700-0000-4000-8800-000000000001'::uuid,true),
    ('listReferrals','f0100700-0000-4000-8a00-000000000001'::uuid,true),
    ('acceptReferral','f0100700-0000-4000-8a00-000000000001'::uuid,false),
    ('listContextMessages','f0100700-0000-4000-8500-000000000001'::uuid,true),
    ('sendContextMessage','f0100700-0000-4000-8500-000000000001'::uuid,true)
  ) v(operation_id,resource_id,allowed) LOOP
    PERFORM pg_catalog.set_config('shifaa.person_id','f0100700-0000-4000-8000-000000000001',true);
    PERFORM pg_catalog.set_config('shifaa.actor_role','CLN',true);
    PERFORM pg_catalog.set_config('shifaa.action',op.operation_id,true);
    PERFORM pg_catalog.set_config('shifaa.aal','2',true);
    PERFORM pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);
    actual := clinical.feature_010_authorize_v1(op.operation_id,op.resource_id);
    IF actual IS DISTINCT FROM op.allowed THEN RAISE EXCEPTION 'F010 C07 CLN matrix mismatch for %: expected %, got %',op.operation_id,op.allowed,actual; END IF;
  END LOOP;

  FOR op IN SELECT * FROM (VALUES
    ('createEncounter','f0100700-0000-4000-8500-000000000002'::uuid,false),
    ('getEncounter','f0100700-0000-4000-8800-000000000001'::uuid,true),
    ('updateEncounter','f0100700-0000-4000-8800-000000000001'::uuid,false),
    ('signEncounterNote','f0100700-0000-4000-8800-000000000001'::uuid,false),
    ('completeEncounter','f0100700-0000-4000-8800-000000000001'::uuid,false),
    ('createReferral','f0100700-0000-4000-8800-000000000001'::uuid,false),
    ('listReferrals','f0100700-0000-4000-8a00-000000000001'::uuid,true),
    ('acceptReferral','f0100700-0000-4000-8a00-000000000001'::uuid,true),
    ('listContextMessages','f0100700-0000-4000-8500-000000000001'::uuid,true),
    ('sendContextMessage','f0100700-0000-4000-8500-000000000001'::uuid,true)
  ) v(operation_id,resource_id,allowed) LOOP
    PERFORM pg_catalog.set_config('shifaa.person_id','f0100700-0000-4000-8000-000000000002',true);
    PERFORM pg_catalog.set_config('shifaa.actor_role','PAT',true);
    PERFORM pg_catalog.set_config('shifaa.action',op.operation_id,true);
    PERFORM pg_catalog.set_config('shifaa.aal','2',true);
    PERFORM pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);
    actual := clinical.feature_010_authorize_v1(op.operation_id,op.resource_id);
    IF actual IS DISTINCT FROM op.allowed THEN RAISE EXCEPTION 'F010 C07 PAT matrix mismatch for %: expected %, got %',op.operation_id,op.allowed,actual; END IF;
  END LOOP;

  FOR op IN SELECT * FROM (VALUES
    ('createEncounter','f0100700-0000-4000-8500-000000000002'::uuid,false),
    ('getEncounter','f0100700-0000-4000-8800-000000000001'::uuid,true),
    ('updateEncounter','f0100700-0000-4000-8800-000000000001'::uuid,false),
    ('signEncounterNote','f0100700-0000-4000-8800-000000000001'::uuid,false),
    ('completeEncounter','f0100700-0000-4000-8800-000000000001'::uuid,false),
    ('createReferral','f0100700-0000-4000-8800-000000000001'::uuid,false),
    ('listReferrals','f0100700-0000-4000-8a00-000000000001'::uuid,true),
    ('acceptReferral','f0100700-0000-4000-8a00-000000000001'::uuid,true),
    ('listContextMessages','f0100700-0000-4000-8500-000000000001'::uuid,false),
    ('sendContextMessage','f0100700-0000-4000-8500-000000000001'::uuid,false)
  ) v(operation_id,resource_id,allowed) LOOP
    PERFORM pg_catalog.set_config('shifaa.person_id','f0100700-0000-4000-8000-000000000003',true);
    PERFORM pg_catalog.set_config('shifaa.actor_role','GUA',true);
    PERFORM pg_catalog.set_config('shifaa.action',op.operation_id,true);
    PERFORM pg_catalog.set_config('shifaa.aal','2',true);
    PERFORM pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);
    actual := clinical.feature_010_authorize_v1(op.operation_id,op.resource_id);
    IF actual IS DISTINCT FROM op.allowed THEN RAISE EXCEPTION 'F010 C07 GUA matrix mismatch for %: expected %, got %',op.operation_id,op.allowed,actual; END IF;
  END LOOP;
  PERFORM pg_catalog.set_config('shifaa.actor_role','DEL',true);
  PERFORM pg_catalog.set_config('shifaa.action','listReferrals',true);
  IF clinical.feature_010_authorize_v1('listReferrals','f0100700-0000-4000-8a00-000000000001') THEN
    RAISE EXCEPTION 'F010 C07 treated guardianship as delegation';
  END IF;
  PERFORM pg_catalog.set_config('shifaa.action','listReferrals',true);
  PERFORM pg_catalog.set_config('shifaa.person_id','f0100700-0000-4000-8000-000000000004',true);
  projection := clinical.feature_010_referral_projection_v1('f0100700-0000-4000-8a00-000000000001');
  IF projection IS NULL OR projection->>'status'<>'pending'
     OR projection - ARRAY['id','sourceEncounterId','status','version','targetSpecialty','targetFacilityId','targetDoctorId','reasonSummary','encounterType']::text[]<>'{}'::jsonb THEN
    RAISE EXCEPTION 'F010 C07 DEL pending preview projection exceeded approved fields';
  END IF;

  FOR op IN SELECT * FROM (VALUES
    ('createEncounter','f0100700-0000-4000-8500-000000000002'::uuid,false),
    ('getEncounter','f0100700-0000-4000-8800-000000000001'::uuid,true),
    ('updateEncounter','f0100700-0000-4000-8800-000000000001'::uuid,false),
    ('signEncounterNote','f0100700-0000-4000-8800-000000000001'::uuid,false),
    ('completeEncounter','f0100700-0000-4000-8800-000000000001'::uuid,false),
    ('createReferral','f0100700-0000-4000-8800-000000000001'::uuid,false),
    ('listReferrals','f0100700-0000-4000-8a00-000000000001'::uuid,true),
    ('acceptReferral','f0100700-0000-4000-8a00-000000000001'::uuid,true),
    ('listContextMessages','f0100700-0000-4000-8500-000000000001'::uuid,false),
    ('sendContextMessage','f0100700-0000-4000-8500-000000000001'::uuid,false)
  ) v(operation_id,resource_id,allowed) LOOP
    PERFORM pg_catalog.set_config('shifaa.person_id','f0100700-0000-4000-8000-000000000004',true);
    PERFORM pg_catalog.set_config('shifaa.actor_role','DEL',true);
    PERFORM pg_catalog.set_config('shifaa.action',op.operation_id,true);
    PERFORM pg_catalog.set_config('shifaa.aal','2',true);
    PERFORM pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);
    actual := clinical.feature_010_authorize_v1(op.operation_id,op.resource_id);
    IF actual IS DISTINCT FROM op.allowed THEN RAISE EXCEPTION 'F010 C07 DEL matrix mismatch for %: expected %, got %',op.operation_id,op.allowed,actual; END IF;
  END LOOP;
  PERFORM pg_catalog.set_config('shifaa.actor_role','GUA',true);
  PERFORM pg_catalog.set_config('shifaa.action','listReferrals',true);
  IF clinical.feature_010_authorize_v1('listReferrals','f0100700-0000-4000-8a00-000000000001') THEN
    RAISE EXCEPTION 'F010 C07 treated delegation as guardianship';
  END IF;
  PERFORM pg_catalog.set_config('shifaa.action','listReferrals',true);
  PERFORM pg_catalog.set_config('shifaa.person_id','f0100700-0000-4000-8000-000000000003',true);
  projection := clinical.feature_010_referral_projection_v1('f0100700-0000-4000-8a00-000000000001');
  IF projection IS NULL OR projection->>'status'<>'pending'
     OR projection - ARRAY['id','sourceEncounterId','status','version','targetSpecialty','targetFacilityId','targetDoctorId','reasonSummary','encounterType']::text[]<>'{}'::jsonb THEN
    RAISE EXCEPTION 'F010 C07 GUA pending preview projection exceeded approved fields';
  END IF;

  -- A target clinician can see only an accepted referral linked to its
  -- current target facility. The pending source referral denies.
  PERFORM pg_catalog.set_config('shifaa.person_id','f0100700-0000-4000-8000-000000000005',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','CLN',true);
  PERFORM pg_catalog.set_config('shifaa.action','listReferrals',true);
  PERFORM pg_catalog.set_config('shifaa.aal','1',true);
  PERFORM pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);
  IF clinical.feature_010_authorize_v1('listReferrals','f0100700-0000-4000-8a00-000000000001')
     OR NOT clinical.feature_010_authorize_v1('listReferrals','f0100700-0000-4000-8a00-000000000002') THEN
    RAISE EXCEPTION 'F010 C07 target pending/accepted referral boundary failed';
  END IF;
  PERFORM pg_catalog.set_config('shifaa.action','getEncounter',true);
  IF NOT clinical.feature_010_authorize_v1('getEncounter','f0100700-0000-4000-8800-000000000003') THEN
    RAISE EXCEPTION 'F010 C07 target clinician lost its own facility encounter';
  END IF;
  PERFORM pg_catalog.set_config('shifaa.person_id','f0100700-0000-4000-8000-000000000001',true);
  IF clinical.feature_010_authorize_v1('getEncounter','f0100700-0000-4000-8800-000000000003') THEN
    RAISE EXCEPTION 'F010 C07 source clinician crossed into another facility';
  END IF;

  -- Missing purpose, low AAL, wrong action/facility and an ended interval
  -- independently deny the same currently valid actor/resource.
  PERFORM pg_catalog.set_config('shifaa.person_id','f0100700-0000-4000-8000-000000000001',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','CLN',true);
  PERFORM pg_catalog.set_config('shifaa.action','getEncounter',true);
  PERFORM pg_catalog.set_config('shifaa.aal','1',true);
  PERFORM pg_catalog.set_config('shifaa.purposes','',true);
  IF clinical.feature_010_authorize_v1('getEncounter','f0100700-0000-4000-8800-000000000001') THEN RAISE EXCEPTION 'F010 C07 accepted missing purpose'; END IF;
  PERFORM pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);
  PERFORM pg_catalog.set_config('shifaa.action','updateEncounter',true);
  IF clinical.feature_010_authorize_v1('getEncounter','f0100700-0000-4000-8800-000000000001') THEN RAISE EXCEPTION 'F010 C07 accepted mismatched action context'; END IF;
  PERFORM pg_catalog.set_config('shifaa.action','getEncounter',true);
  PERFORM pg_catalog.set_config('shifaa.person_id','',true);
  IF clinical.feature_010_authorize_v1('getEncounter','f0100700-0000-4000-8800-000000000001') THEN RAISE EXCEPTION 'F010 C07 accepted missing actor context'; END IF;
  PERFORM pg_catalog.set_config('shifaa.person_id','f0100700-0000-4000-8000-000000000001',true);
  PERFORM pg_catalog.set_config('shifaa.aal','1',true);
  PERFORM pg_catalog.set_config('shifaa.action','createEncounter',true);
  IF clinical.feature_010_authorize_v1('createEncounter','f0100700-0000-4000-8500-000000000002') THEN RAISE EXCEPTION 'F010 C07 accepted low AAL for a mutation'; END IF;
  PERFORM pg_catalog.set_config('shifaa.aal','2',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','',true);
  IF clinical.feature_010_authorize_v1('createEncounter','f0100700-0000-4000-8500-000000000002') THEN
    RAISE EXCEPTION 'F010 C07 accepted createEncounter without actor role';
  END IF;
  PERFORM pg_catalog.set_config('shifaa.action','updateEncounter',true);
  IF clinical.feature_010_authorize_v1('updateEncounter','f0100700-0000-4000-8800-000000000001') THEN
    RAISE EXCEPTION 'F010 C07 accepted updateEncounter without actor role';
  END IF;
  PERFORM pg_catalog.set_config('shifaa.actor_role','CLN',true);
  PERFORM pg_catalog.set_config('shifaa.action','getEncounter',true);
  PERFORM pg_catalog.set_config('shifaa.person_id','f0100700-0000-4000-8000-000000000006',true);
  PERFORM pg_catalog.set_config('shifaa.action','listContextMessages',true);
  IF clinical.feature_010_authorize_v1('listContextMessages','f0100700-0000-4000-8500-000000000001') THEN
    RAISE EXCEPTION 'F010 C07 ended workforce interval retained chat access';
  END IF;
  PERFORM pg_catalog.set_config('shifaa.action','sendContextMessage',true);
  IF clinical.feature_010_authorize_v1('sendContextMessage','f0100700-0000-4000-8500-000000000001') THEN RAISE EXCEPTION 'F010 C07 ended workforce interval retained send access'; END IF;
  PERFORM pg_catalog.set_config('shifaa.person_id','f0100700-0000-4000-8000-000000000002',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','PAT',true);
  PERFORM pg_catalog.set_config('shifaa.aal','1',true);
  PERFORM pg_catalog.set_config('shifaa.action','listContextMessages',true);
  IF clinical.feature_010_authorize_v1('listContextMessages','f0100700-0000-4000-8500-000000000004') THEN
    RAISE EXCEPTION 'F010 C07 completed context retained chat access';
  END IF;
  PERFORM pg_catalog.set_config('shifaa.action','sendContextMessage',true);
  IF clinical.feature_010_authorize_v1('sendContextMessage','f0100700-0000-4000-8500-000000000004') THEN RAISE EXCEPTION 'F010 C07 completed context retained send access'; END IF;
  PERFORM pg_catalog.set_config('shifaa.person_id','f0100700-0000-4000-8000-000000000008',true);
  PERFORM pg_catalog.set_config('shifaa.action','getEncounter',true);
  IF clinical.feature_010_authorize_v1('getEncounter','f0100700-0000-4000-8800-000000000001')
     OR clinical.feature_010_authorize_v1('listReferrals','f0100700-0000-4000-8a00-000000000001') THEN
    RAISE EXCEPTION 'F010 C07 unrelated subject received clinical access';
  END IF;
  PERFORM pg_catalog.set_config('shifaa.person_id','f0100700-0000-4000-8000-000000000001',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','CLN',true);
  IF NOT clinical.feature_010_authorize_v1('getEncounter','f0100700-0000-4000-8800-000000000002') THEN
    RAISE EXCEPTION 'F010 C07 current treating clinician lost completed-history read';
  END IF;
  PERFORM pg_catalog.set_config('shifaa.action','listReferrals',true);
  IF NOT clinical.feature_010_authorize_v1('listReferrals','f0100700-0000-4000-8a00-000000000003') THEN
    RAISE EXCEPTION 'F010 C07 current source clinician lost completed referral tracking';
  END IF;

  -- Patient projection excludes private note rows and all ciphertext. A target
  -- projection is null for pending referrals and contains only accepted fields.
  PERFORM pg_catalog.set_config('shifaa.person_id','f0100700-0000-4000-8000-000000000002',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','PAT',true);
  PERFORM pg_catalog.set_config('shifaa.action','getEncounter',true);
  PERFORM pg_catalog.set_config('shifaa.aal','1',true);
  PERFORM pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);
  projection := clinical.feature_010_get_encounter_projection_v1('f0100700-0000-4000-8800-000000000001');
  IF projection IS NULL OR projection::text LIKE '%f0100700-0000-4000-8900-000000000001%'
     OR projection::text LIKE '%body_ciphertext%' OR projection::text LIKE '%completionSummary%' THEN
    RAISE EXCEPTION 'F010 C07 patient encounter projection disclosed a private note or protected field';
  END IF;
  IF projection::text NOT LIKE '%f0100700-0000-4000-8900-000000000002%' THEN
    RAISE EXCEPTION 'F010 C07 patient-visible note metadata missing from projection';
  END IF;
  PERFORM pg_catalog.set_config('shifaa.person_id','f0100700-0000-4000-8000-000000000005',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','CLN',true);
  PERFORM pg_catalog.set_config('shifaa.action','listReferrals',true);
  projection := clinical.feature_010_referral_projection_v1('f0100700-0000-4000-8a00-000000000001');
  IF projection IS NOT NULL THEN RAISE EXCEPTION 'F010 C07 target received pending referral projection'; END IF;
  projection := clinical.feature_010_referral_projection_v1('f0100700-0000-4000-8a00-000000000002');
  IF projection IS NULL OR projection->>'reasonSummary'<>'synthetic accepted referral summary'
     OR projection->>'encounterType'<>'consultation'
     OR projection->>'version'<>'1'
     OR projection->>'resultingAppointmentId'<>'f0100700-0000-4000-8500-000000000003'
     OR projection->'acceptedFieldCodes'<>'["reason_summary","encounter_type"]'::jsonb
     OR projection - ARRAY['id','status','version','acceptedFieldCodes','resultingAppointmentId','reasonSummary','encounterType']::text[]<>'{}'::jsonb THEN
    RAISE EXCEPTION 'F010 C07 target accepted referral projection exceeded selected fields';
  END IF;

  PERFORM pg_catalog.set_config('shifaa.person_id','f0100700-0000-4000-8000-000000000002',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','PAT',true);
  projection := clinical.feature_010_referral_projection_v1('f0100700-0000-4000-8a00-000000000002');
  IF projection IS NULL OR projection->>'status'<>'accepted'
     OR projection->>'sourceEncounterId'<>'f0100700-0000-4000-8800-000000000001'
     OR projection->>'version'<>'1'
     OR projection->>'resultingAppointmentId'<>'f0100700-0000-4000-8500-000000000003'
     OR projection->>'targetFacilityId'<>'f0100700-0000-4000-8200-000000000002'
     OR projection->>'targetDoctorId'<>'f0100700-0000-4000-8000-000000000005'
     OR projection->'acceptedFieldCodes'<>'["reason_summary","encounter_type"]'::jsonb
     OR projection - ARRAY['id','sourceEncounterId','status','version','targetSpecialty','targetFacilityId','targetDoctorId','reasonSummary','encounterType','acceptedFieldCodes','resultingAppointmentId']::text[]<>'{}'::jsonb THEN
    RAISE EXCEPTION 'F010 C07 patient accepted-referral linked target projection missing';
  END IF;

  PERFORM pg_catalog.set_config('shifaa.action','listReferrals',true);
  projection := clinical.feature_010_referral_projection_v1('f0100700-0000-4000-8a00-000000000001');
  IF projection IS NULL OR projection->>'status'<>'pending'
     OR projection->>'sourceEncounterId'<>'f0100700-0000-4000-8800-000000000001'
     OR projection->>'version'<>'1'
     OR projection->>'targetSpecialty'<>'cardiology'
     OR projection->>'reasonSummary'<>'synthetic pending referral summary'
     OR projection - ARRAY['id','sourceEncounterId','status','version','targetSpecialty','targetFacilityId','targetDoctorId','reasonSummary','encounterType']::text[]<>'{}'::jsonb THEN
    RAISE EXCEPTION 'F010 C07 PAT pending preview projection exceeded approved fields';
  END IF;

  PERFORM pg_catalog.set_config('shifaa.person_id','f0100700-0000-4000-8000-000000000002',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','PAT',true);
  PERFORM pg_catalog.set_config('shifaa.action','listContextMessages',true);
  projection := trust.feature_010_context_messages_projection_v1('f0100700-0000-4000-8500-000000000001');
  IF projection IS NULL OR pg_catalog.jsonb_array_length(projection)<>1
     OR projection->0->>'id'<>'f0100700-0000-4000-8b00-000000000001'
     OR projection::text LIKE '%body_ciphertext%' OR projection::text LIKE '%eeff%' THEN
    RAISE EXCEPTION 'F010 C07 message projection disclosed ciphertext or omitted valid history';
  END IF;
END
$feature_010_rls_matrix$;

-- Revoke active representative authority as the normal reviewer/delegator,
-- then prove the next online request rechecks it immediately.
RESET SESSION AUTHORIZATION;
-- Reuse the workforce row after its ended-interval denial vector above to
-- prove that a future-start, otherwise active interval is not yet authority.
UPDATE clinical.encounter_participants
SET started_at='2026-09-27T10:00:00Z',ended_at=NULL
WHERE encounter_id='f0100700-0000-4000-8800-000000000001'
  AND person_id='f0100700-0000-4000-8000-000000000006';
SELECT pg_catalog.set_config('shifaa.person_id','f0100700-0000-4000-8000-000000000007',true);
SELECT pg_catalog.set_config('shifaa.actor_role','ADM-SUPPORT',true);
SELECT pg_catalog.set_config('shifaa.aal','2',true);
SELECT pg_catalog.set_config('shifaa.purposes','guardianship_review',true);
UPDATE identity.care_relationships SET status='revoked',revoked_by_person_id='f0100700-0000-4000-8000-000000000007',revoked_at=statement_timestamp(),reviewed_by_person_id='f0100700-0000-4000-8000-000000000007',reviewed_at=statement_timestamp(),decision_reason_code='synthetic-revocation'
WHERE id='f0100700-0000-4000-8d00-000000000001';
SELECT pg_catalog.set_config('shifaa.person_id','f0100700-0000-4000-8000-000000000002',true);
SELECT pg_catalog.set_config('shifaa.actor_role','PAT',true);
UPDATE identity.care_relationship_permissions SET revoked_at=statement_timestamp(),revoked_by_person_id='f0100700-0000-4000-8000-000000000002'
WHERE relationship_id='f0100700-0000-4000-8d00-000000000002' AND permission_code='appointment.manage' AND revoked_at IS NULL;
SET SESSION AUTHORIZATION shifaa_api;
DO $feature_010_live_revocation$
BEGIN
  PERFORM pg_catalog.set_config('shifaa.aal','2',true);
  PERFORM pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);
  PERFORM pg_catalog.set_config('shifaa.action','getEncounter',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','GUA',true);
  PERFORM pg_catalog.set_config('shifaa.person_id','f0100700-0000-4000-8000-000000000003',true);
  IF clinical.feature_010_authorize_v1('getEncounter','f0100700-0000-4000-8800-000000000001') THEN
    RAISE EXCEPTION 'F010 C07 revoked guardianship retained record authority';
  END IF;
  PERFORM pg_catalog.set_config('shifaa.action','listReferrals',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','DEL',true);
  PERFORM pg_catalog.set_config('shifaa.person_id','f0100700-0000-4000-8000-000000000004',true);
  IF clinical.feature_010_authorize_v1('listReferrals','f0100700-0000-4000-8a00-000000000001') THEN
    RAISE EXCEPTION 'F010 C07 revoked delegation permission retained referral authority';
  END IF;
  PERFORM pg_catalog.set_config('shifaa.aal','1',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','CLN',true);
  PERFORM pg_catalog.set_config('shifaa.person_id','f0100700-0000-4000-8000-000000000006',true);
  PERFORM pg_catalog.set_config('shifaa.action','getEncounter',true);
  IF clinical.feature_010_authorize_v1('getEncounter','f0100700-0000-4000-8800-000000000001') THEN
    RAISE EXCEPTION 'F010 C07 future-start workforce interval retained encounter authority';
  END IF;
  PERFORM pg_catalog.set_config('shifaa.action','listContextMessages',true);
  IF clinical.feature_010_authorize_v1('listContextMessages','f0100700-0000-4000-8500-000000000001') THEN
    RAISE EXCEPTION 'F010 C07 future-start workforce interval retained chat history access';
  END IF;
  PERFORM pg_catalog.set_config('shifaa.action','sendContextMessage',true);
  IF clinical.feature_010_authorize_v1('sendContextMessage','f0100700-0000-4000-8500-000000000001') THEN
    RAISE EXCEPTION 'F010 C07 future-start workforce interval retained send access';
  END IF;
END
$feature_010_live_revocation$;

RESET SESSION AUTHORIZATION;
UPDATE identity.facility_memberships
SET membership_status='ended'
WHERE facility_id='f0100700-0000-4000-8200-000000000002'
  AND person_id='f0100700-0000-4000-8000-000000000005'
  AND membership_status='active';
SET SESSION AUTHORIZATION shifaa_api;
DO $feature_010_live_membership_revocation$
BEGIN
  PERFORM pg_catalog.set_config('shifaa.aal','1',true);
  PERFORM pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);
  PERFORM pg_catalog.set_config('shifaa.action','getEncounter',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','CLN',true);
  PERFORM pg_catalog.set_config('shifaa.person_id','f0100700-0000-4000-8000-000000000005',true);
  IF clinical.feature_010_authorize_v1('getEncounter','f0100700-0000-4000-8800-000000000003') THEN
    RAISE EXCEPTION 'F010 C07 revoked facility membership retained encounter authority';
  END IF;
  PERFORM pg_catalog.set_config('shifaa.action','listReferrals',true);
  IF clinical.feature_010_authorize_v1('listReferrals','f0100700-0000-4000-8a00-000000000002') THEN
    RAISE EXCEPTION 'F010 C07 revoked facility membership retained target referral authority';
  END IF;
END
$feature_010_live_membership_revocation$;
RESET SESSION AUTHORIZATION;
ROLLBACK;
