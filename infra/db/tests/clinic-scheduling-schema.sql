BEGIN;
DO $assert$
DECLARE
  expected text[] := ARRAY['schedules','schedule_windows','schedule_exceptions','appointments','queue_scopes','queue_entries'];
  item text;
BEGIN
  FOREACH item IN ARRAY expected LOOP
    IF to_regclass('clinical.' || item) IS NULL THEN
      RAISE EXCEPTION 'missing clinical.%', item;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='schedules_valid_dates_check') THEN RAISE EXCEPTION 'missing schedule date guard'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='appointments_payment_method_check') THEN RAISE EXCEPTION 'missing cash-only guard'; END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='clinical' AND c.relname IN (SELECT unnest(expected)) AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)) THEN
    RAISE EXCEPTION 'clinical tables must have forced RLS';
  END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid='clinical.appointments'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%payment_method%cash_on_arrival%') = 0 THEN
    RAISE EXCEPTION 'cash_on_arrival is not a database invariant';
  END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid='clinical.appointments'::regclass AND contype='x') <> 1 THEN RAISE EXCEPTION 'appointment exclusion missing'; END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid='clinical.schedules'::regclass AND contype='x') <> 1 THEN RAISE EXCEPTION 'schedule exclusion missing'; END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid='clinical.schedule_windows'::regclass AND contype='x') <> 1 THEN RAISE EXCEPTION 'window exclusion missing'; END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid='clinical.schedule_exceptions'::regclass AND contype='x') <> 1 THEN RAISE EXCEPTION 'exception exclusion missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='clinical_queue_entries_waiting_order_uq') THEN RAISE EXCEPTION 'waiting order uniqueness missing'; END IF;
END
$assert$;

-- Synthetic constraint and transaction vectors.  Every expected failure is
-- caught inside this rollback-only fixture so a clean run leaves no history.
INSERT INTO identity.people(id,user_id,display_name,profile_status) VALUES
 ('f0090000-0000-4000-8000-000000000001','f0090000-0000-4000-9000-000000000001','F009 synthetic owner','active'),
 ('f0090000-0000-4000-8000-000000000002','f0090000-0000-4000-9000-000000000002','F009 synthetic doctor','active'),
 ('f0090000-0000-4000-8000-000000000003','f0090000-0000-4000-9000-000000000003','F009 synthetic patient','active');
INSERT INTO identity.patients(id,person_id,medical_record_number,record_status)
VALUES ('f0090000-0000-4000-8900-000000000001','f0090000-0000-4000-8000-000000000003','F009-MRN-0001','active');
INSERT INTO identity.facilities(id,facility_type,name_ar,name_en,facility_status,governorate_code,city,district,address_line,created_by_person_id)
VALUES ('f0090000-0000-4000-8100-000000000001','clinic','عيادة تجريبية','Synthetic clinic','active','C','Cairo','Test','Synthetic address','f0090000-0000-4000-8000-000000000001');
INSERT INTO identity.professional_licenses(id,person_id,profession,number_ciphertext,number_hash,issuer,expires_on,status)
VALUES ('f0090000-0000-4000-8a00-000000000001','f0090000-0000-4000-8000-000000000002','doctor',decode(repeat('1',16),'hex'),decode(repeat('2',64),'hex'),'F009 synthetic regulator','2035-12-31','verified');
INSERT INTO identity.facility_memberships(facility_id,person_id,role_code,employment_license_id,valid_from,membership_status,created_by_person_id)
VALUES ('f0090000-0000-4000-8100-000000000001','f0090000-0000-4000-8000-000000000001','owner',NULL,'2020-01-01','active','f0090000-0000-4000-8000-000000000001');
INSERT INTO identity.facility_memberships(facility_id,person_id,role_code,employment_license_id,valid_from,membership_status,created_by_person_id)
VALUES ('f0090000-0000-4000-8100-000000000001','f0090000-0000-4000-8000-000000000002','doctor','f0090000-0000-4000-8a00-000000000001','2020-01-01','active','f0090000-0000-4000-8000-000000000001');
INSERT INTO clinical.schedules(id,facility_id,doctor_person_id,timezone_name,valid_from,valid_to,slot_duration_minutes,fee_minor_units,currency_code,created_by_person_id,updated_by_person_id)
VALUES ('f0090000-0000-4000-8200-000000000001','f0090000-0000-4000-8100-000000000001','f0090000-0000-4000-8000-000000000002','Africa/Cairo','2026-09-01','2026-09-30',30,10000,'EGP','f0090000-0000-4000-8000-000000000001','f0090000-0000-4000-8000-000000000001');
INSERT INTO clinical.schedule_windows(schedule_id,iso_weekday,local_start,local_end) VALUES ('f0090000-0000-4000-8200-000000000001',7,'09:00','10:00');
INSERT INTO clinical.schedules(id,facility_id,doctor_person_id,timezone_name,valid_from,valid_to,slot_duration_minutes,fee_minor_units,currency_code,created_by_person_id,updated_by_person_id)
VALUES ('f0090000-0000-4000-8200-000000000005','f0090000-0000-4000-8100-000000000001','f0090000-0000-4000-8000-000000000002','America/New_York','2026-03-01','2026-03-31',60,10000,'EGP','f0090000-0000-4000-8000-000000000001','f0090000-0000-4000-8000-000000000001');
INSERT INTO clinical.schedule_windows(schedule_id,iso_weekday,local_start,local_end) VALUES ('f0090000-0000-4000-8200-000000000005',7,'01:00','04:00');
INSERT INTO clinical.schedules(id,facility_id,doctor_person_id,timezone_name,valid_from,valid_to,slot_duration_minutes,fee_minor_units,currency_code,created_by_person_id,updated_by_person_id)
VALUES ('f0090000-0000-4000-8200-000000000006','f0090000-0000-4000-8100-000000000001','f0090000-0000-4000-8000-000000000002','America/New_York','2026-11-01','2026-11-30',60,10000,'EGP','f0090000-0000-4000-8000-000000000001','f0090000-0000-4000-8000-000000000001');
INSERT INTO clinical.schedule_windows(schedule_id,iso_weekday,local_start,local_end) VALUES ('f0090000-0000-4000-8200-000000000006',7,'00:00','03:00');
DO $vectors$
BEGIN
  BEGIN
    INSERT INTO clinical.schedule_windows(schedule_id,iso_weekday,local_start,local_end) VALUES ('f0090000-0000-4000-8200-000000000001',7,'09:30','10:30');
    RAISE EXCEPTION 'overlapping weekly window was accepted';
  EXCEPTION WHEN exclusion_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO clinical.schedules(facility_id,doctor_person_id,timezone_name,valid_from,valid_to,slot_duration_minutes,fee_minor_units,currency_code,created_by_person_id,updated_by_person_id)
    VALUES ('f0090000-0000-4000-8100-000000000001','f0090000-0000-4000-8000-000000000002','Africa/Cairo','2026-09-15','2026-09-20',30,10000,'EGP','f0090000-0000-4000-8000-000000000001','f0090000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'overlapping active schedule was accepted';
  EXCEPTION WHEN exclusion_violation THEN NULL;
  END;
END
$vectors$;
INSERT INTO clinical.schedule_exceptions(schedule_id,facility_id,doctor_person_id,timezone_name,civil_date,starts_at,ends_at,exception_type,reason,created_by_person_id,updated_by_person_id)
VALUES ('f0090000-0000-4000-8200-000000000001','f0090000-0000-4000-8100-000000000001','f0090000-0000-4000-8000-000000000002','Africa/Cairo','2026-09-13','2026-09-13T06:00:00Z','2026-09-13T06:30:00Z','blocked','synthetic blocked','f0090000-0000-4000-8000-000000000001','f0090000-0000-4000-8000-000000000001');
DO $availability_vectors$
DECLARE slot_count integer; first_local time;
BEGIN
  SELECT count(*)::integer,min(availability.local_start) INTO slot_count,first_local FROM clinical.list_availability_v1('f0090000-0000-4000-8200-000000000001','2026-09-13') AS availability;
  IF slot_count<>1 OR first_local<>time '09:30' THEN RAISE EXCEPTION 'availability precedence/slot derivation failed: count %, local %',slot_count,first_local; END IF;
END
$availability_vectors$;
DO $dst_vectors$
DECLARE spring_count integer; spring_has_nonexistent boolean; fall_count integer; fall_has_earlier boolean;
BEGIN
  SELECT count(*)::integer,bool_or(local_start=time '02:00') INTO spring_count,spring_has_nonexistent FROM clinical.list_availability_v1('f0090000-0000-4000-8200-000000000005','2026-03-08');
  IF spring_count<>2 OR coalesce(spring_has_nonexistent,false) THEN RAISE EXCEPTION 'nonexistent DST local time was materialized'; END IF;
  SELECT count(*)::integer,bool_or(starts_at=(timestamptz '2026-11-01T05:00:00Z')) INTO fall_count,fall_has_earlier FROM clinical.list_availability_v1('f0090000-0000-4000-8200-000000000006','2026-11-01');
  IF fall_count<>3 OR NOT coalesce(fall_has_earlier,false) THEN RAISE EXCEPTION 'ambiguous DST time did not use earlier offset'; END IF;
END
$dst_vectors$;
DO $exception_vectors$
BEGIN
  BEGIN
    INSERT INTO clinical.schedule_exceptions(schedule_id,facility_id,doctor_person_id,timezone_name,civil_date,starts_at,ends_at,exception_type,reason,created_by_person_id,updated_by_person_id)
    VALUES ('f0090000-0000-4000-8200-000000000001','f0090000-0000-4000-8100-000000000001','f0090000-0000-4000-8000-000000000002','Africa/Cairo','2026-09-13','2026-09-13T06:15:00Z','2026-09-13T06:45:00Z','blocked','synthetic overlap','f0090000-0000-4000-8000-000000000001','f0090000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'overlapping exception was accepted';
  EXCEPTION WHEN exclusion_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO clinical.schedule_exceptions(schedule_id,facility_id,doctor_person_id,timezone_name,civil_date,starts_at,ends_at,exception_type,delay_minutes,reason,created_by_person_id,updated_by_person_id)
    VALUES ('f0090000-0000-4000-8200-000000000001','f0090000-0000-4000-8100-000000000001','f0090000-0000-4000-8000-000000000002','Africa/Cairo','2026-09-13','2026-09-13T12:00:00Z','2026-09-13T12:30:00Z','blocked',5,'delay bypass','f0090000-0000-4000-8000-000000000001','f0090000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'ordinary exception accepted delay_minutes';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END
$exception_vectors$;
INSERT INTO clinical.schedule_exceptions(schedule_id,facility_id,doctor_person_id,timezone_name,civil_date,starts_at,ends_at,exception_type,reason,created_by_person_id,updated_by_person_id)
VALUES ('f0090000-0000-4000-8200-000000000001','f0090000-0000-4000-8100-000000000001','f0090000-0000-4000-8000-000000000002','Africa/Cairo','2026-09-13','2026-09-13T07:00:00Z','2026-09-13T07:30:00Z','blocked','synthetic boundary touch','f0090000-0000-4000-8000-000000000001','f0090000-0000-4000-8000-000000000001');
INSERT INTO clinical.schedule_exceptions(schedule_id,facility_id,doctor_person_id,timezone_name,civil_date,starts_at,ends_at,exception_type,reason,created_by_person_id,updated_by_person_id)
VALUES ('f0090000-0000-4000-8200-000000000001','f0090000-0000-4000-8100-000000000001','f0090000-0000-4000-8000-000000000002','Africa/Cairo','2026-09-13','2026-09-13T06:00:00Z','2026-09-13T06:30:00Z','added','synthetic added precedence','f0090000-0000-4000-8000-000000000001','f0090000-0000-4000-8000-000000000001');
DO $precedence_vectors$
DECLARE slot_count integer;
BEGIN
  SELECT count(*)::integer INTO slot_count FROM clinical.list_availability_v1('f0090000-0000-4000-8200-000000000001','2026-09-13');
  IF slot_count<>1 THEN RAISE EXCEPTION 'blocked precedence did not suppress an added slot'; END IF;
END
$precedence_vectors$;
INSERT INTO clinical.schedule_exceptions(schedule_id,facility_id,doctor_person_id,timezone_name,civil_date,starts_at,ends_at,exception_type,reason,created_by_person_id,updated_by_person_id)
VALUES ('f0090000-0000-4000-8200-000000000001','f0090000-0000-4000-8100-000000000001','f0090000-0000-4000-8000-000000000002','Africa/Cairo','2026-09-13','2026-09-13T06:00:00Z','2026-09-13T06:30:00Z','absence','synthetic absence precedence','f0090000-0000-4000-8000-000000000001','f0090000-0000-4000-8000-000000000001');
DO $absence_precedence_vectors$
DECLARE slot_count integer;
BEGIN
  SELECT count(*)::integer INTO slot_count FROM clinical.list_availability_v1('f0090000-0000-4000-8200-000000000001','2026-09-13');
  IF slot_count<>1 THEN RAISE EXCEPTION 'absence precedence did not suppress an added slot'; END IF;
END
$absence_precedence_vectors$;
INSERT INTO clinical.appointments(id,patient_person_id,facility_id,doctor_person_id,schedule_id,starts_at,ends_at,timezone_name,civil_date,local_start,fee_minor_units,currency_code,status,created_by_person_id,updated_by_person_id)
VALUES ('f0090000-0000-4000-8300-000000000001','f0090000-0000-4000-8000-000000000003','f0090000-0000-4000-8100-000000000001','f0090000-0000-4000-8000-000000000002','f0090000-0000-4000-8200-000000000001','2026-09-13T11:00:00Z','2026-09-13T11:30:00Z','Africa/Cairo','2026-09-13','13:00',10000,'EGP','confirmed','f0090000-0000-4000-8000-000000000003','f0090000-0000-4000-8000-000000000003');
DO $appointment_vectors$
BEGIN
  BEGIN
    UPDATE clinical.appointments
    SET currency_code='USD'
    WHERE id='f0090000-0000-4000-8300-000000000001';
    RAISE EXCEPTION 'non-EGP appointment currency was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO clinical.appointments(patient_person_id,facility_id,doctor_person_id,schedule_id,starts_at,ends_at,timezone_name,civil_date,local_start,fee_minor_units,currency_code,payment_method,status,created_by_person_id,updated_by_person_id)
    VALUES ('f0090000-0000-4000-8000-000000000003','f0090000-0000-4000-8100-000000000001','f0090000-0000-4000-8000-000000000002','f0090000-0000-4000-8200-000000000001','2026-09-13T11:15:00Z','2026-09-13T11:45:00Z','Africa/Cairo','2026-09-13','13:15',10000,'EGP','cash_on_arrival','confirmed','f0090000-0000-4000-8000-000000000003','f0090000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'double booking was accepted';
  EXCEPTION WHEN exclusion_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO clinical.appointments(patient_person_id,facility_id,doctor_person_id,schedule_id,starts_at,ends_at,timezone_name,civil_date,local_start,fee_minor_units,currency_code,payment_method,status,created_by_person_id,updated_by_person_id)
    VALUES ('f0090000-0000-4000-8000-000000000003','f0090000-0000-4000-8100-000000000001','f0090000-0000-4000-8000-000000000002','f0090000-0000-4000-8200-000000000001','2026-09-13T12:00:00Z','2026-09-13T12:30:00Z','Africa/Cairo','2026-09-13','14:00',10000,'EGP','digital_wallet','requested','f0090000-0000-4000-8000-000000000003','f0090000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'producerless/payment state bypass was accepted';
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN NULL;
  END;
END
$appointment_vectors$;
SELECT pg_catalog.set_config('shifaa.person_id','f0090000-0000-4000-8000-000000000001',true);
SELECT pg_catalog.set_config('shifaa.environment','local',true);
SELECT pg_catalog.set_config('shifaa.test_now','2026-09-12T08:00:00Z',true);
SELECT pg_catalog.set_config('shifaa.action','clinic.scheduling',true);
SELECT pg_catalog.set_config('shifaa.aal','2',true);
SELECT pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);
DO $schedule_mutation_vectors$
DECLARE schedule_version integer; retired_id uuid; first_id uuid; replay_id uuid;
BEGIN
  SELECT version INTO schedule_version FROM clinical.schedules WHERE id='f0090000-0000-4000-8200-000000000001';
  PERFORM clinical.update_schedule_v1('f0090000-0000-4000-8200-000000000001',schedule_version,'{"valid_to":"2026-09-30"}'::jsonb);
  IF (SELECT version FROM clinical.schedules WHERE id='f0090000-0000-4000-8200-000000000001')<>schedule_version+1 THEN RAISE EXCEPTION 'schedule update did not advance version'; END IF;
  SELECT (clinical.create_schedule_v1(jsonb_build_object(
    'facility_id','f0090000-0000-4000-8100-000000000001','doctor_person_id','f0090000-0000-4000-8000-000000000002',
    'timezone_name','Africa/Cairo','valid_from','2026-10-01','valid_to','2026-10-05','slot_duration_minutes',30,'fee_minor_units',10000,
    'windows','[{"isoWeekday":1,"localStart":"09:00","localEnd":"10:00"}]'::jsonb
  )) ->> 'id')::uuid INTO retired_id;
  PERFORM clinical.update_schedule_v1(retired_id,1,'{"status":"retired"}'::jsonb);
  BEGIN
    PERFORM clinical.update_schedule_v1(retired_id,2,'{"status":"active"}'::jsonb);
    RAISE EXCEPTION 'retired schedule was reactivated';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','schedule-same-key',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',repeat('d',64),true);
  SELECT (clinical.create_schedule_v1(jsonb_build_object(
    'facility_id','f0090000-0000-4000-8100-000000000001','doctor_person_id','f0090000-0000-4000-8000-000000000002',
    'timezone_name','Africa/Cairo','valid_from','2027-01-01','valid_to','2027-01-05','slot_duration_minutes',30,'fee_minor_units',10000,
    'windows','[{"isoWeekday":1,"localStart":"09:00","localEnd":"10:00"}]'::jsonb,
    'idempotency_key','schedule-same-key','request_hash',repeat('d',64)
  )) ->> 'id')::uuid INTO first_id;
  SELECT (clinical.create_schedule_v1(jsonb_build_object(
    'facility_id','f0090000-0000-4000-8100-000000000001','doctor_person_id','f0090000-0000-4000-8000-000000000002',
    'timezone_name','Africa/Cairo','valid_from','2027-01-01','valid_to','2027-01-05','slot_duration_minutes',30,'fee_minor_units',10000,
    'windows','[{"isoWeekday":1,"localStart":"09:00","localEnd":"10:00"}]'::jsonb,
    'idempotency_key','schedule-same-key','request_hash',repeat('d',64)
  )) ->> 'id')::uuid INTO replay_id;
  IF first_id<>replay_id OR (SELECT count(*) FROM clinical.schedules WHERE id=first_id)<>1 THEN RAISE EXCEPTION 'idempotent schedule replay created a duplicate'; END IF;
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash','',true);
END
$schedule_mutation_vectors$;
SELECT pg_catalog.set_config('shifaa.person_id','f0090000-0000-4000-8000-000000000003',true);
DO $appointment_mutation_vectors$
DECLARE created_id uuid; replacement_status text; replacement_version integer; stored_reason text; public_projection jsonb;
BEGIN
  SELECT (clinical.create_appointment_v1(jsonb_build_object(
    'patient_person_id','f0090000-0000-4000-8000-000000000003','facility_id','f0090000-0000-4000-8100-000000000001',
    'doctor_person_id','f0090000-0000-4000-8000-000000000002','schedule_id','f0090000-0000-4000-8200-000000000001',
    'starts_at','2026-09-13T15:00:00Z','ends_at','2026-09-13T15:30:00Z','timezone_name','Africa/Cairo',
    'civil_date','2026-09-13','local_start','18:00',
    'payment_method','cash_on_arrival'
  )) ->> 'id')::uuid INTO created_id;
  PERFORM clinical.reschedule_appointment_v1(created_id,1,'2026-09-13T15:30:00Z','2026-09-13T16:00:00Z','2026-09-13','18:30','Feature009-reschedule-reason-sentinel');
  SELECT status,version,reschedule_reason INTO replacement_status,replacement_version,stored_reason FROM clinical.appointments WHERE id=created_id;
  public_projection:=clinical.project_appointment_v1(created_id);
  IF replacement_status<>'confirmed' OR replacement_version<>2 OR stored_reason<>'Feature009-reschedule-reason-sentinel' THEN RAISE EXCEPTION 'reschedule did not atomically replace same row and persist its reason'; END IF;
  IF public_projection ? 'rescheduleReason' OR public_projection ? 'reschedule_reason' OR public_projection ? 'reason' THEN RAISE EXCEPTION 'appointment projection disclosed the restricted reschedule reason'; END IF;
  IF EXISTS (
    SELECT 1 FROM audit.events AS event
    WHERE event.resource_id=created_id
      AND pg_catalog.to_jsonb(event)::text LIKE '%Feature009-reschedule-reason-sentinel%'
  ) OR EXISTS (
    SELECT 1 FROM platform.outbox_events AS event
    WHERE event.aggregate_id=created_id
      AND pg_catalog.to_jsonb(event)::text LIKE '%Feature009-reschedule-reason-sentinel%'
  ) THEN RAISE EXCEPTION 'reschedule reason leaked into audit or outbox'; END IF;
  FOREACH stored_reason IN ARRAY ARRAY[
    '',repeat('x',501),'line'||chr(10)||'break','carriage'||chr(13)||'return','tab'||chr(9)||'character'
  ] LOOP
    BEGIN
      PERFORM clinical.reschedule_appointment_v1(created_id,2,'2026-09-13T15:30:00Z','2026-09-13T16:00:00Z','2026-09-13','18:30',stored_reason);
      RAISE EXCEPTION 'invalid reschedule reason was accepted';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
  END LOOP;
  IF (SELECT reschedule_reason FROM clinical.appointments WHERE id=created_id)<>'Feature009-reschedule-reason-sentinel' THEN RAISE EXCEPTION 'rejected reschedule reason changed the stored reason'; END IF;
  BEGIN
    PERFORM clinical.reschedule_appointment_v1(created_id,2,'2026-09-13T11:00:00Z','2026-09-13T11:30:00Z','2026-09-13','14:00','Synthetic conflicting reschedule');
    RAISE EXCEPTION 'conflicting reschedule was accepted';
  EXCEPTION WHEN exclusion_violation THEN NULL;
  END;
  IF (SELECT starts_at FROM clinical.appointments WHERE id=created_id)<>timestamptz '2026-09-13T15:30:00Z' THEN RAISE EXCEPTION 'failed reschedule changed original slot'; END IF;
  PERFORM clinical.cancel_appointment_v1(created_id,2,'synthetic cancellation');
  IF (SELECT status FROM clinical.appointments WHERE id=created_id)<>'cancelled' THEN RAISE EXCEPTION 'cancel transition did not persist'; END IF;
END
$appointment_mutation_vectors$;
SELECT pg_catalog.set_config('shifaa.person_id','f0090000-0000-4000-8000-000000000001',true);
SELECT clinical.check_in_appointment_v1('f0090000-0000-4000-8300-000000000001',1);
DO $queue_vectors$
DECLARE appointment_status text; queue_state text; queue_number bigint;
BEGIN
  SELECT status INTO appointment_status FROM clinical.appointments WHERE id='f0090000-0000-4000-8300-000000000001';
  SELECT q.state,q.queue_number INTO queue_state,queue_number FROM clinical.queue_entries AS q WHERE q.appointment_id='f0090000-0000-4000-8300-000000000001';
  IF appointment_status<>'checked_in' OR queue_state<>'waiting' OR queue_number<>1 THEN RAISE EXCEPTION 'check-in transaction did not atomically allocate queue'; END IF;
  PERFORM clinical.call_queue_entry_v1((SELECT id FROM clinical.queue_entries WHERE appointment_id='f0090000-0000-4000-8300-000000000001'),1);
  PERFORM clinical.complete_queue_entry_v1((SELECT id FROM clinical.queue_entries WHERE appointment_id='f0090000-0000-4000-8300-000000000001'),2);
  SELECT state INTO queue_state FROM clinical.queue_entries WHERE appointment_id='f0090000-0000-4000-8300-000000000001';
  IF queue_state<>'completed' THEN RAISE EXCEPTION 'queue-only completion failed'; END IF;
END
$queue_vectors$;
INSERT INTO clinical.appointments(id,patient_person_id,facility_id,doctor_person_id,schedule_id,starts_at,ends_at,timezone_name,civil_date,local_start,fee_minor_units,currency_code,status,created_by_person_id,updated_by_person_id)
VALUES ('f0090000-0000-4000-8300-000000000002','f0090000-0000-4000-8000-000000000003','f0090000-0000-4000-8100-000000000001','f0090000-0000-4000-8000-000000000002','f0090000-0000-4000-8200-000000000001','2026-09-13T12:00:00Z','2026-09-13T12:30:00Z','Africa/Cairo','2026-09-13','14:00',10000,'EGP','confirmed','f0090000-0000-4000-8000-000000000003','f0090000-0000-4000-8000-000000000003');
SELECT clinical.check_in_appointment_v1('f0090000-0000-4000-8300-000000000002',1);
INSERT INTO clinical.appointments(id,patient_person_id,facility_id,doctor_person_id,schedule_id,starts_at,ends_at,timezone_name,civil_date,local_start,fee_minor_units,currency_code,status,created_by_person_id,updated_by_person_id)
VALUES ('f0090000-0000-4000-8300-000000000004','f0090000-0000-4000-8000-000000000003','f0090000-0000-4000-8100-000000000001','f0090000-0000-4000-8000-000000000002','f0090000-0000-4000-8200-000000000001','2026-09-13T13:00:00Z','2026-09-13T13:30:00Z','Africa/Cairo','2026-09-13','15:00',10000,'EGP','confirmed','f0090000-0000-4000-8000-000000000003','f0090000-0000-4000-8000-000000000003');
SELECT clinical.check_in_appointment_v1('f0090000-0000-4000-8300-000000000004',1);
DO $reorder_vectors$
DECLARE target_id uuid; displaced_order integer; target_order integer; queue_version integer;
BEGIN
  SELECT id INTO target_id FROM clinical.queue_entries WHERE appointment_id='f0090000-0000-4000-8300-000000000004';
  SELECT s.version INTO queue_version FROM clinical.queue_scopes s JOIN clinical.queue_entries q ON q.queue_scope_id=s.id WHERE q.id=target_id;
  PERFORM clinical.reorder_queue_entry_v1(target_id,1,queue_version,1,'synthetic priority');
  SELECT waiting_order INTO target_order FROM clinical.queue_entries WHERE appointment_id='f0090000-0000-4000-8300-000000000004';
  SELECT waiting_order INTO displaced_order FROM clinical.queue_entries WHERE appointment_id='f0090000-0000-4000-8300-000000000002';
  IF target_order<>1 OR displaced_order<>2 THEN RAISE EXCEPTION 'reorder did not atomically shift occupied position'; END IF;
END
$reorder_vectors$;
SELECT clinical.send_doctor_delay_v1('f0090000-0000-4000-8100-000000000001','f0090000-0000-4000-8000-000000000002','2026-09-13',10,'synthetic delay');
SELECT clinical.send_doctor_delay_v1('f0090000-0000-4000-8100-000000000001','f0090000-0000-4000-8000-000000000002','2026-09-13',20,'synthetic revised delay');
DO $delay_absence_vectors$
DECLARE active_delays integer; current_delay integer; affected integer; appointment_status text; queue_state text;
BEGIN
  SELECT count(*)::integer,max(delay_minutes) INTO active_delays,current_delay FROM clinical.schedule_exceptions WHERE exception_type='delay' AND superseded_at IS NULL;
  IF active_delays<>1 OR current_delay<>20 THEN RAISE EXCEPTION 'delay supersession accumulated or duplicated'; END IF;
  SELECT jsonb_array_length((clinical.declare_doctor_absence_v1('f0090000-0000-4000-8100-000000000001','f0090000-0000-4000-8000-000000000002','2026-09-13','2026-09-13T12:00:00Z','2026-09-13T12:30:00Z','synthetic absence')->'affectedAppointmentIds')) INTO affected;
  SELECT status INTO appointment_status FROM clinical.appointments WHERE id='f0090000-0000-4000-8300-000000000002';
  SELECT state INTO queue_state FROM clinical.queue_entries WHERE appointment_id='f0090000-0000-4000-8300-000000000002';
  IF affected<>1 OR appointment_status<>'reschedule_required' OR queue_state<>'removed' THEN RAISE EXCEPTION 'absence cascade was not atomic'; END IF;
END
$delay_absence_vectors$;
DO $atomic_effect_vectors$
DECLARE expected record; before_appointments integer; before_audit integer; before_outbox integer;
BEGIN
  -- Every successful domain path leaves its attributable audit receipt and
  -- aggregate-versioned outbox row in the same transaction.
  FOR expected IN SELECT * FROM (VALUES
    ('schedule.created','clinical.schedule.changed.v1',1),('schedule.updated','clinical.schedule.changed.v1',1),
    ('appointment.created','clinical.appointment.changed.v1',1),('appointment.rescheduled','clinical.appointment.changed.v1',1),
    ('appointment.cancelled','clinical.appointment.changed.v1',1),('appointment.checked_in','clinical.appointment.changed.v1',1),
    ('queue.entry.created','clinical.queue.changed.v1',1),('queue.entry.called','clinical.queue.changed.v1',1),('queue.entry.completed','clinical.queue.changed.v1',1),('queue.entry.reordered','clinical.queue.changed.v1',1),
    ('doctor.delay.declared','clinical.doctor_delay.declared.v1',2),('doctor.absence.declared','clinical.doctor_absence.declared.v1',1)
  ) AS required(action_code,event_type,min_count) LOOP
    IF (SELECT count(*) FROM audit.events WHERE action_code=expected.action_code) < expected.min_count
       OR (SELECT count(*) FROM platform.outbox_events WHERE event_type=expected.event_type) < expected.min_count THEN
      RAISE EXCEPTION 'atomic effect vector missing for %',expected.action_code;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM platform.outbox_events WHERE event_type IN ('clinical.appointment.changed.v1','clinical.queue.changed.v1','clinical.schedule.changed.v1','clinical.doctor_delay.declared.v1','clinical.doctor_absence.declared.v1') AND payload ?| ARRAY['reason','contact','phone','token','patient','clinicalDetails']) THEN
    RAISE EXCEPTION 'Feature 009 outbox payload is not minimum';
  END IF;
  SELECT count(*) INTO before_appointments FROM clinical.appointments;
  SELECT count(*) INTO before_audit FROM audit.events;
  SELECT count(*) INTO before_outbox FROM platform.outbox_events;
  BEGIN
    PERFORM pg_catalog.set_config('shifaa.person_id','f0090000-0000-4000-8000-000000000003',true);
    PERFORM clinical.create_appointment_v1(jsonb_build_object('patient_person_id','f0090000-0000-4000-8000-000000000003','facility_id','f0090000-0000-4000-8100-000000000001','doctor_person_id','f0090000-0000-4000-8000-000000000002','schedule_id','f0090000-0000-4000-8200-000000000001','starts_at','2026-09-13T14:00:00Z','ends_at','2026-09-13T14:30:00Z','timezone_name','Africa/Cairo','civil_date','2026-09-13','local_start','17:00','payment_method','cash_on_arrival'));
    RAISE EXCEPTION 'injected rollback boundary was not reached';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
  IF (SELECT count(*) FROM clinical.appointments)<>before_appointments OR (SELECT count(*) FROM audit.events)<>before_audit OR (SELECT count(*) FROM platform.outbox_events)<>before_outbox THEN
    RAISE EXCEPTION 'injected failure left a partial domain/audit/outbox effect';
  END IF;
END
$atomic_effect_vectors$;
DO $effect_vectors$
DECLARE idem_id uuid; idem_new boolean; idem_body jsonb; replay_id uuid; replay_new boolean; replay_body jsonb;
BEGIN
  SELECT record_id,is_new,response_body INTO idem_id,idem_new,idem_body
    FROM clinical.claim_idempotency_v1('POST','/v1/appointments','same-key',repeat('a',64));
  IF NOT idem_new OR idem_id IS NULL THEN RAISE EXCEPTION 'first idempotency claim was not stored'; END IF;
  UPDATE platform.idempotency_records SET state='completed',response_status=201,response_body='{"resource_id":"f0090000-0000-4000-8300-000000000001"}'::jsonb WHERE id=idem_id;
  SELECT record_id,is_new,response_body INTO replay_id,replay_new,replay_body
    FROM clinical.claim_idempotency_v1('POST','/v1/appointments','same-key',repeat('a',64));
  IF replay_id<>idem_id OR replay_new OR replay_body->>'resource_id' IS DISTINCT FROM 'f0090000-0000-4000-8300-000000000001' THEN RAISE EXCEPTION 'same-key replay was not canonical'; END IF;
  BEGIN
    PERFORM clinical.claim_idempotency_v1('POST','/v1/appointments','same-key',repeat('b',64));
    RAISE EXCEPTION 'changed-body idempotency key was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  IF (SELECT count(*) FROM audit.events WHERE action_code LIKE 'appointment.%') < 1 THEN RAISE EXCEPTION 'appointment mutation audit effect missing'; END IF;
  IF (SELECT count(*) FROM platform.outbox_events WHERE event_type='clinical.appointment.changed.v1') < 1 THEN RAISE EXCEPTION 'appointment outbox effect missing'; END IF;
  IF EXISTS (SELECT 1 FROM platform.outbox_events WHERE event_type IN ('clinical.appointment.changed.v1','clinical.queue.changed.v1','clinical.schedule.changed.v1','clinical.doctor_delay.declared.v1','clinical.doctor_absence.declared.v1') AND (payload ? 'reason' OR payload ? 'contact' OR payload ? 'phone' OR payload ? 'token')) THEN
    RAISE EXCEPTION 'sensitive fields leaked into Feature 009 outbox payload';
  END IF;
END
$effect_vectors$;
DO $context_vectors$
DECLARE own_rows integer; foreign_rows integer;
BEGIN
  IF (SELECT count(*) FROM clinical.read_my_appointment_v1('f0090000-0000-4000-8300-000000000001'))<>0 THEN RAISE EXCEPTION 'owner context saw another patient appointment'; END IF;
  PERFORM pg_catalog.set_config('shifaa.person_id','f0090000-0000-4000-8000-000000000003',true);
  SELECT count(*) INTO own_rows FROM clinical.read_my_appointment_v1('f0090000-0000-4000-8300-000000000001');
  PERFORM pg_catalog.set_config('shifaa.person_id','f0090000-0000-4000-8000-000000000001',true);
  SELECT count(*) INTO foreign_rows FROM clinical.read_my_appointment_v1('f0090000-0000-4000-8300-000000000001');
  IF own_rows<>1 OR foreign_rows<>0 THEN RAISE EXCEPTION 'current patient fact projection failed'; END IF;
END
$context_vectors$;
SET LOCAL ROLE shifaa_api;
DO $direct_sql_denial$
BEGIN
  BEGIN
    PERFORM 1 FROM clinical.appointments;
    RAISE EXCEPTION 'API role received direct clinical table access';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$direct_sql_denial$;
RESET ROLE;
ROLLBACK;
