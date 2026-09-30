BEGIN;

DO $feature_010_lifecycle_preconditions$
BEGIN
  IF to_regclass('clinical.appointments') IS NULL
     OR to_regclass('clinical.queue_entries') IS NULL
     OR to_regclass('clinical.encounters') IS NULL
     OR to_regclass('clinical.encounter_participants') IS NULL THEN
    RAISE EXCEPTION 'Feature 009/010 lifecycle schemas were not applied';
  END IF;
END
$feature_010_lifecycle_preconditions$;

INSERT INTO identity.people(id,user_id,display_name,profile_status) VALUES
 ('f0100000-0000-4000-8000-000000000001','f0100000-0000-4000-9000-000000000001','F010 synthetic clinician','active'),
 ('f0100000-0000-4000-8000-000000000002','f0100000-0000-4000-9000-000000000002','F010 synthetic patient','active'),
 ('f0100000-0000-4000-8000-000000000003','f0100000-0000-4000-9000-000000000003','F010 synthetic alternate clinician','active');
INSERT INTO identity.patients(id,person_id,medical_record_number,record_status)
VALUES ('f0100000-0000-4000-8100-000000000001','f0100000-0000-4000-8000-000000000002','F010-MRN-0001','active');
INSERT INTO identity.facilities(id,facility_type,name_ar,name_en,facility_status,governorate_code,city,district,address_line,created_by_person_id)
VALUES ('f0100000-0000-4000-8200-000000000001','clinic','عيادة اختبارية','F010 synthetic clinic','active','C','Cairo','Test','Synthetic address','f0100000-0000-4000-8000-000000000001');
INSERT INTO identity.professional_licenses(id,person_id,profession,number_ciphertext,number_hash,issuer,expires_on,status) VALUES
 ('f0100000-0000-4000-8300-000000000001','f0100000-0000-4000-8000-000000000001','doctor',decode(repeat('1',16),'hex'),decode(repeat('2',64),'hex'),'F010 synthetic regulator','2035-12-31','verified'),
 ('f0100000-0000-4000-8300-000000000002','f0100000-0000-4000-8000-000000000003','doctor',decode(repeat('3',16),'hex'),decode(repeat('4',64),'hex'),'F010 synthetic regulator','2035-12-31','verified');
INSERT INTO identity.facility_memberships(facility_id,person_id,role_code,employment_license_id,valid_from,membership_status,created_by_person_id) VALUES
 ('f0100000-0000-4000-8200-000000000001','f0100000-0000-4000-8000-000000000001','doctor','f0100000-0000-4000-8300-000000000001','2020-01-01','active','f0100000-0000-4000-8000-000000000001'),
 ('f0100000-0000-4000-8200-000000000001','f0100000-0000-4000-8000-000000000003','doctor','f0100000-0000-4000-8300-000000000002','2020-01-01','active','f0100000-0000-4000-8000-000000000001');
INSERT INTO clinical.schedules(id,facility_id,doctor_person_id,timezone_name,valid_from,valid_to,slot_duration_minutes,fee_minor_units,currency_code,created_by_person_id,updated_by_person_id)
VALUES ('f0100000-0000-4000-8400-000000000001','f0100000-0000-4000-8200-000000000001','f0100000-0000-4000-8000-000000000001','Africa/Cairo','2030-04-01','2030-04-30',30,10000,'EGP','f0100000-0000-4000-8000-000000000001','f0100000-0000-4000-8000-000000000001');
INSERT INTO clinical.appointments(id,patient_person_id,facility_id,doctor_person_id,schedule_id,starts_at,ends_at,timezone_name,civil_date,local_start,fee_minor_units,currency_code,payment_method,status,created_by_person_id,updated_by_person_id) VALUES
 ('f0100000-0000-4000-8500-000000000001','f0100000-0000-4000-8000-000000000002','f0100000-0000-4000-8200-000000000001','f0100000-0000-4000-8000-000000000001','f0100000-0000-4000-8400-000000000001','2030-04-05T06:00:00Z','2030-04-05T06:30:00Z','Africa/Cairo','2030-04-05','08:00',10000,'EGP','cash_on_arrival','confirmed','f0100000-0000-4000-8000-000000000001','f0100000-0000-4000-8000-000000000001'),
 ('f0100000-0000-4000-8500-000000000002','f0100000-0000-4000-8000-000000000002','f0100000-0000-4000-8200-000000000001','f0100000-0000-4000-8000-000000000001','f0100000-0000-4000-8400-000000000001','2030-04-05T07:00:00Z','2030-04-05T07:30:00Z','Africa/Cairo','2030-04-05','09:00',10000,'EGP','cash_on_arrival','confirmed','f0100000-0000-4000-8000-000000000001','f0100000-0000-4000-8000-000000000001'),
 ('f0100000-0000-4000-8500-000000000003','f0100000-0000-4000-8000-000000000002','f0100000-0000-4000-8200-000000000001','f0100000-0000-4000-8000-000000000001','f0100000-0000-4000-8400-000000000001','2030-04-05T08:00:00Z','2030-04-05T08:30:00Z','Africa/Cairo','2030-04-05','10:00',10000,'EGP','cash_on_arrival','confirmed','f0100000-0000-4000-8000-000000000001','f0100000-0000-4000-8000-000000000001'),
 ('f0100000-0000-4000-8500-000000000004','f0100000-0000-4000-8000-000000000002','f0100000-0000-4000-8200-000000000001','f0100000-0000-4000-8000-000000000001','f0100000-0000-4000-8400-000000000001','2030-04-05T09:00:00Z','2030-04-05T09:30:00Z','Africa/Cairo','2030-04-05','11:00',10000,'EGP','cash_on_arrival','confirmed','f0100000-0000-4000-8000-000000000001','f0100000-0000-4000-8000-000000000001');

INSERT INTO clinical.queue_scopes(id,facility_id,doctor_person_id,civil_date,timezone_name) VALUES
 ('f0100000-0000-4000-8600-000000000001','f0100000-0000-4000-8200-000000000001','f0100000-0000-4000-8000-000000000001','2030-04-05','Africa/Cairo'),
 ('f0100000-0000-4000-8600-000000000002','f0100000-0000-4000-8200-000000000001','f0100000-0000-4000-8000-000000000003','2030-04-06','Africa/Cairo');
INSERT INTO clinical.queue_entries(id,queue_scope_id,appointment_id,facility_id,doctor_person_id,civil_date,queue_number,waiting_order,state) VALUES
 ('f0100000-0000-4000-8700-000000000001','f0100000-0000-4000-8600-000000000001','f0100000-0000-4000-8500-000000000001','f0100000-0000-4000-8200-000000000001','f0100000-0000-4000-8000-000000000001','2030-04-05',1,1,'waiting'),
 ('f0100000-0000-4000-8700-000000000002','f0100000-0000-4000-8600-000000000001','f0100000-0000-4000-8500-000000000004','f0100000-0000-4000-8200-000000000001','f0100000-0000-4000-8000-000000000001','2030-04-05',4,2,'waiting');
SELECT pg_catalog.set_config('shifaa.clinic_internal_transition','allowed',true);
UPDATE clinical.appointments SET status='checked_in' WHERE id IN (
 'f0100000-0000-4000-8500-000000000001','f0100000-0000-4000-8500-000000000002',
 'f0100000-0000-4000-8500-000000000003','f0100000-0000-4000-8500-000000000004'
);
UPDATE clinical.queue_entries SET state='called',waiting_order=NULL,called_at=statement_timestamp();
ALTER TABLE clinical.queue_entries DISABLE TRIGGER queue_entries_guard;
INSERT INTO clinical.queue_entries(id,queue_scope_id,appointment_id,facility_id,doctor_person_id,civil_date,queue_number,state)
VALUES ('f0100000-0000-4000-8700-000000000003','f0100000-0000-4000-8600-000000000002','f0100000-0000-4000-8500-000000000003','f0100000-0000-4000-8200-000000000001','f0100000-0000-4000-8000-000000000001','2030-04-05',3,'called');
ALTER TABLE clinical.queue_entries ENABLE TRIGGER queue_entries_guard;

SELECT pg_catalog.set_config('shifaa.environment','local',true);
SELECT pg_catalog.set_config('shifaa.person_id','f0100000-0000-4000-8000-000000000001',true);
SELECT pg_catalog.set_config('shifaa.actor_role','CLN',true);
SELECT pg_catalog.set_config('shifaa.action','createEncounter',true);
SELECT pg_catalog.set_config('shifaa.aal','2',true);
SELECT pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);

DO $feature_010_create_lifecycle_vectors$
DECLARE
  created_encounter_id uuid;
  opened jsonb;
  fixture_appointment uuid := 'f0100000-0000-4000-8500-000000000001';
  request jsonb;
  appointment_status text;
  queue_state text;
  participant_count integer;
  completion_version integer;
  changed_rows integer;
BEGIN
  request := jsonb_build_object(
    'appointmentId',fixture_appointment,
    'patientId','f0100000-0000-4000-8000-000000000002',
    'encounterType','consultation'
  );
  PERFORM pg_catalog.set_config('shifaa.person_id','f0100000-0000-4000-8000-000000000003',true);
  BEGIN
    EXECUTE 'SELECT clinical.create_encounter_v1($1)' USING request;
    RAISE EXCEPTION 'non-treating clinician created an encounter';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_catalog.set_config('shifaa.person_id','f0100000-0000-4000-8000-000000000001',true);
  PERFORM pg_catalog.set_config('shifaa.aal','',true);
  BEGIN
    EXECUTE 'SELECT clinical.create_encounter_v1($1)' USING request;
    RAISE EXCEPTION 'createEncounter accepted missing AAL';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_catalog.set_config('shifaa.aal','2',true);
  PERFORM pg_catalog.set_config('shifaa.purposes','',true);
  BEGIN
    EXECUTE 'SELECT clinical.create_encounter_v1($1)' USING request;
    RAISE EXCEPTION 'createEncounter accepted missing purpose';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);
  -- A live membership/patient row cannot authorize an inactive person.
  UPDATE identity.people SET profile_status='suspended' WHERE id='f0100000-0000-4000-8000-000000000001';
  BEGIN
    PERFORM clinical.create_encounter_v1(request);
    RAISE EXCEPTION 'inactive clinician profile created an encounter';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE identity.people SET profile_status='active' WHERE id='f0100000-0000-4000-8000-000000000001';
  UPDATE identity.people SET profile_status='suspended' WHERE id='f0100000-0000-4000-8000-000000000002';
  BEGIN
    PERFORM clinical.create_encounter_v1(request);
    RAISE EXCEPTION 'inactive patient profile created an encounter';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE identity.people SET profile_status='active' WHERE id='f0100000-0000-4000-8000-000000000002';
  IF (SELECT status FROM clinical.appointments WHERE id=fixture_appointment)<>'checked_in'
     OR (SELECT state FROM clinical.queue_entries WHERE appointment_id=fixture_appointment)<>'called'
     OR EXISTS (SELECT 1 FROM clinical.encounters WHERE appointment_id=fixture_appointment) THEN
    RAISE EXCEPTION 'unauthorized createEncounter left partial effects';
  END IF;
  BEGIN
    EXECUTE 'SELECT clinical.create_encounter_v1($1)' INTO opened USING request;
  EXCEPTION WHEN undefined_function THEN
    RAISE EXCEPTION 'missing F010 createEncounter producer guard: clinical.create_encounter_v1(jsonb)' USING ERRCODE='P0001';
  END;
  IF opened IS NULL THEN RAISE EXCEPTION 'createEncounter returned no encounter id'; END IF;
  SELECT e.id INTO created_encounter_id FROM clinical.encounters e WHERE e.appointment_id=fixture_appointment AND e.status='open';
  SELECT status INTO appointment_status FROM clinical.appointments WHERE id=fixture_appointment;
  SELECT q.state INTO queue_state FROM clinical.queue_entries q WHERE q.appointment_id=fixture_appointment;
  SELECT count(*)::integer INTO participant_count FROM clinical.encounter_participants p
   WHERE p.encounter_id=created_encounter_id AND p.person_id='f0100000-0000-4000-8000-000000000001' AND p.role_code='responsible_clinician' AND p.ended_at IS NULL;
  IF created_encounter_id IS DISTINCT FROM (opened->'encounter'->>'id')::uuid
     OR appointment_status<>'in_consultation' OR queue_state<>'in_service' OR participant_count<>1 THEN
    RAISE EXCEPTION 'createEncounter did not atomically open the encounter, establish the responsible interval, and advance both predecessors';
  END IF;

  BEGIN
    EXECUTE 'SELECT clinical.create_encounter_v1($1)' INTO opened USING request;
    RAISE EXCEPTION 'duplicate open encounter was accepted';
  EXCEPTION WHEN SQLSTATE '40001' THEN NULL;
  END;
  IF (SELECT count(*) FROM clinical.encounters WHERE appointment_id=fixture_appointment AND status='open')<>1 THEN
    RAISE EXCEPTION 'duplicate create changed the open encounter count';
  END IF;

  BEGIN
    EXECUTE 'SELECT clinical.create_encounter_v1($1)' USING request || jsonb_build_object('responsibleClinicianId','f0100000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'client workforce id was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;

  request := jsonb_build_object(
    'appointmentId','f0100000-0000-4000-8500-000000000002',
    'patientId','f0100000-0000-4000-8000-000000000002',
    'encounterType','consultation'
  );
  BEGIN
    EXECUTE 'SELECT clinical.create_encounter_v1($1)' USING request;
    RAISE EXCEPTION 'createEncounter accepted an appointment with no queue entry';
  EXCEPTION WHEN SQLSTATE '40001' THEN NULL;
  END;
  IF (SELECT status FROM clinical.appointments WHERE id='f0100000-0000-4000-8500-000000000002')<>'checked_in'
     OR EXISTS (SELECT 1 FROM clinical.encounters WHERE appointment_id='f0100000-0000-4000-8500-000000000002') THEN
    RAISE EXCEPTION 'missing-queue rejection left partial effects';
  END IF;

  request := jsonb_build_object(
    'appointmentId','f0100000-0000-4000-8500-000000000003',
    'patientId','f0100000-0000-4000-8000-000000000002',
    'encounterType','consultation'
  );
  BEGIN
    EXECUTE 'SELECT clinical.create_encounter_v1($1)' USING request;
    RAISE EXCEPTION 'createEncounter accepted a mismatched queue scope';
  EXCEPTION WHEN SQLSTATE '40001' THEN NULL;
  END;
  IF (SELECT status FROM clinical.appointments WHERE id='f0100000-0000-4000-8500-000000000003')<>'checked_in'
     OR (SELECT state FROM clinical.queue_entries WHERE appointment_id='f0100000-0000-4000-8500-000000000003')<>'called'
     OR EXISTS (SELECT 1 FROM clinical.encounters WHERE appointment_id='f0100000-0000-4000-8500-000000000003') THEN
    RAISE EXCEPTION 'mismatched-queue rejection left partial effects';
  END IF;
  -- Convert the intentionally malformed scope into a valid called fixture
  -- after its mismatch rollback vector has been proven.
  EXECUTE 'ALTER TABLE clinical.queue_entries DISABLE TRIGGER queue_entries_guard';
  UPDATE clinical.queue_entries SET queue_scope_id='f0100000-0000-4000-8600-000000000001'
    WHERE id='f0100000-0000-4000-8700-000000000003';
  EXECUTE 'ALTER TABLE clinical.queue_entries ENABLE TRIGGER queue_entries_guard';
  IF (SELECT q.state FROM clinical.queue_entries q WHERE q.id='f0100000-0000-4000-8700-000000000003')<>'called' THEN
    RAISE EXCEPTION 'called queue guard fixture has state %',
      (SELECT q.state FROM clinical.queue_entries q WHERE q.id='f0100000-0000-4000-8700-000000000003');
  END IF;

  -- The legacy broad marker cannot perform an F010 transition. This valid
  -- waiting target is exercised before createEncounter consumes it.
  PERFORM pg_catalog.set_config('shifaa.clinic_internal_transition','allowed',true);
  BEGIN
    UPDATE clinical.appointments SET status='in_consultation'
      WHERE id='f0100000-0000-4000-8500-000000000004';
    GET DIAGNOSTICS changed_rows=ROW_COUNT;
    IF changed_rows=0 THEN RAISE EXCEPTION 'appointment marker vector did not match its fixture'; END IF;
    RAISE EXCEPTION 'F009 internal transition marker produced an F010 appointment transition';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE clinical.queue_entries SET state='in_service'
      WHERE id='f0100000-0000-4000-8700-000000000003' AND state='called';
    GET DIAGNOSTICS changed_rows=ROW_COUNT;
    IF changed_rows=0 THEN RAISE EXCEPTION 'queue marker vector did not match a called fixture row'; END IF;
    RAISE EXCEPTION 'F009 internal transition marker produced an F010 queue transition';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  request := jsonb_build_object(
    'appointmentId','f0100000-0000-4000-8500-000000000004',
    'patientId','f0100000-0000-4000-8000-000000000002',
    'encounterType','consultation'
  );
  EXECUTE 'SELECT clinical.create_encounter_v1($1)' INTO opened USING request;
  IF opened IS NULL OR opened->'encounter'->>'id' IS NULL THEN
    RAISE EXCEPTION 'second valid createEncounter returned no encounter result';
  END IF;

  PERFORM pg_catalog.set_config('shifaa.action','completeEncounter',true);
  PERFORM pg_catalog.set_config('shifaa.aal','',true);
  BEGIN
    EXECUTE 'SELECT clinical.complete_encounter_v1($1,$2,$3)' USING
      (SELECT e.id FROM clinical.encounters e WHERE e.appointment_id='f0100000-0000-4000-8500-000000000004'),
      1,jsonb_build_object('summary','Consultation completed','structuralConfirmation',true);
    RAISE EXCEPTION 'completeEncounter accepted missing AAL';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_catalog.set_config('shifaa.aal','2',true);
  PERFORM pg_catalog.set_config('shifaa.purposes','',true);
  BEGIN
    EXECUTE 'SELECT clinical.complete_encounter_v1($1,$2,$3)' USING
      (SELECT e.id FROM clinical.encounters e WHERE e.appointment_id='f0100000-0000-4000-8500-000000000004'),
      1,jsonb_build_object('summary','Consultation completed','structuralConfirmation',true);
    RAISE EXCEPTION 'completeEncounter accepted missing purpose';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);
  -- A live membership/patient row cannot authorize an inactive person.
  UPDATE identity.people SET profile_status='suspended' WHERE id='f0100000-0000-4000-8000-000000000001';
  BEGIN
    PERFORM clinical.create_encounter_v1(request);
    RAISE EXCEPTION 'inactive clinician profile created an encounter';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE identity.people SET profile_status='active' WHERE id='f0100000-0000-4000-8000-000000000001';
  UPDATE identity.people SET profile_status='suspended' WHERE id='f0100000-0000-4000-8000-000000000002';
  BEGIN
    PERFORM clinical.create_encounter_v1(request);
    RAISE EXCEPTION 'inactive patient profile created an encounter';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE identity.people SET profile_status='active' WHERE id='f0100000-0000-4000-8000-000000000002';
  IF (SELECT status FROM clinical.encounters WHERE appointment_id='f0100000-0000-4000-8500-000000000004')<>'open'
     OR (SELECT status FROM clinical.appointments WHERE id='f0100000-0000-4000-8500-000000000004')<>'in_consultation'
     OR (SELECT state FROM clinical.queue_entries WHERE appointment_id='f0100000-0000-4000-8500-000000000004')<>'in_service'
     OR (SELECT version FROM clinical.encounters WHERE appointment_id='f0100000-0000-4000-8500-000000000004')<>1 THEN
    RAISE EXCEPTION 'missing completion authorization context left partial effects';
  END IF;
  EXECUTE 'SELECT clinical.complete_encounter_v1($1,$2,$3)' INTO opened
    USING created_encounter_id,1,jsonb_build_object('summary','Consultation completed','structuralConfirmation',true);
  IF (opened->'encounter'->>'id')::uuid IS DISTINCT FROM created_encounter_id THEN
    RAISE EXCEPTION 'completeEncounter returned a different encounter id';
  END IF;
  SELECT e.version INTO completion_version FROM clinical.encounters e WHERE e.id=created_encounter_id;
  IF (SELECT e.status FROM clinical.encounters e WHERE e.id=created_encounter_id)<>'completed'
     OR (SELECT status FROM clinical.appointments WHERE id=fixture_appointment)<>'completed'
     OR (SELECT state FROM clinical.queue_entries WHERE appointment_id=fixture_appointment)<>'completed'
     OR (SELECT cardinality(e.condition_ids)+cardinality(e.observation_ids)+cardinality(e.order_ids) FROM clinical.encounters e WHERE e.id=created_encounter_id)<>0
     OR completion_version<>2 THEN
    RAISE EXCEPTION 'completion did not atomically complete the zero-reference lifecycle';
  END IF;

  request := jsonb_build_object(
    'summary','   ',
    'structuralConfirmation',true
  );
  BEGIN
    EXECUTE 'SELECT clinical.complete_encounter_v1($1,$2,$3)' USING (SELECT e.id FROM clinical.encounters e WHERE e.appointment_id='f0100000-0000-4000-8500-000000000004'),1,request;
    RAISE EXCEPTION 'blank responsible-clinician summary was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  IF (SELECT status FROM clinical.encounters WHERE appointment_id='f0100000-0000-4000-8500-000000000004')<>'open'
     OR (SELECT status FROM clinical.appointments WHERE id='f0100000-0000-4000-8500-000000000004')<>'in_consultation'
     OR (SELECT state FROM clinical.queue_entries WHERE appointment_id='f0100000-0000-4000-8500-000000000004')<>'in_service' THEN
    RAISE EXCEPTION 'blank-summary rejection left partial completion effects';
  END IF;

  request := jsonb_build_object('summary','Consultation completed','structuralConfirmation',false);
  BEGIN
    EXECUTE 'SELECT clinical.complete_encounter_v1($1,$2,$3)' USING (SELECT e.id FROM clinical.encounters e WHERE e.appointment_id='f0100000-0000-4000-8500-000000000004'),1,request;
    RAISE EXCEPTION 'completion without explicit confirmation was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;

  request := jsonb_build_object('summary','Consultation completed','structuralConfirmation',true);
  BEGIN
    EXECUTE 'SELECT clinical.complete_encounter_v1($1,$2,$3)' USING (SELECT e.id FROM clinical.encounters e WHERE e.appointment_id='f0100000-0000-4000-8500-000000000004'),99,request;
    RAISE EXCEPTION 'stale encounter version was accepted';
  EXCEPTION WHEN SQLSTATE '40001' THEN NULL;
  END;
  IF (SELECT status FROM clinical.encounters WHERE appointment_id='f0100000-0000-4000-8500-000000000004')<>'open'
     OR (SELECT status FROM clinical.appointments WHERE id='f0100000-0000-4000-8500-000000000004')<>'in_consultation'
     OR (SELECT state FROM clinical.queue_entries WHERE appointment_id='f0100000-0000-4000-8500-000000000004')<>'in_service'
     OR (SELECT version FROM clinical.encounters WHERE appointment_id='f0100000-0000-4000-8500-000000000004')<>1 THEN
    RAISE EXCEPTION 'invalid or stale completion changed encounter/appointment/queue state';
  END IF;
END
$feature_010_create_lifecycle_vectors$;

DO $feature_010_producer_only_vectors$
DECLARE changed_rows integer;
BEGIN
  PERFORM pg_catalog.set_config('shifaa.clinic_internal_transition','allowed',true);
  BEGIN
    UPDATE clinical.appointments SET status='in_consultation' WHERE id='f0100000-0000-4000-8500-000000000002';
    GET DIAGNOSTICS changed_rows=ROW_COUNT;
    IF changed_rows=0 THEN RAISE EXCEPTION 'appointment marker vector did not match its fixture'; END IF;
    RAISE EXCEPTION 'F009 internal transition marker produced an F010 appointment transition';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE clinical.queue_entries SET state='in_service' WHERE id='f0100000-0000-4000-8700-000000000003' AND state='called';
    GET DIAGNOSTICS changed_rows=ROW_COUNT;
    IF changed_rows=0 THEN RAISE EXCEPTION 'queue marker vector did not match its fixture row'; END IF;
    RAISE EXCEPTION 'F009 internal transition marker produced an F010 queue transition';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$feature_010_producer_only_vectors$;

ROLLBACK;
