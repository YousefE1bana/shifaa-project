-- Execute the installed scheduling definers as the Core API database session.
-- The owner seeds synthetic rows and independently checks transactional effects.
BEGIN;
INSERT INTO identity.people(id,user_id,display_name,profile_status) VALUES
 ('f0120000-0000-4000-8000-000000000041','f0120000-0000-4000-9000-000000000041','Synthetic owner','active'),
 ('f0120000-0000-4000-8000-000000000042','f0120000-0000-4000-9000-000000000042','Synthetic doctor','active'),
 ('f0120000-0000-4000-8000-000000000043','f0120000-0000-4000-9000-000000000043','Synthetic patient','active');
INSERT INTO identity.patients(id,person_id,medical_record_number,record_status)
VALUES ('f0120000-0000-4000-8900-000000000041','f0120000-0000-4000-8000-000000000043','F012-BOOKING-01','active');
INSERT INTO identity.facilities(id,facility_type,name_ar,name_en,facility_status,governorate_code,city,district,address_line,created_by_person_id)
VALUES ('f0120000-0000-4000-8100-000000000041','clinic','عيادة تجريبية','Synthetic clinic','active','C','Cairo','Test','Synthetic address','f0120000-0000-4000-8000-000000000041');
INSERT INTO identity.professional_licenses(id,person_id,profession,number_ciphertext,number_hash,issuer,expires_on,status)
VALUES ('f0120000-0000-4000-8a00-000000000041','f0120000-0000-4000-8000-000000000042','doctor',decode(repeat('1',16),'hex'),decode(repeat('2',64),'hex'),'Synthetic regulator','2035-12-31','verified');
INSERT INTO identity.facility_memberships(facility_id,person_id,role_code,employment_license_id,valid_from,membership_status,created_by_person_id)
VALUES
 ('f0120000-0000-4000-8100-000000000041','f0120000-0000-4000-8000-000000000041','owner',NULL,'2020-01-01','active','f0120000-0000-4000-8000-000000000041'),
 ('f0120000-0000-4000-8100-000000000041','f0120000-0000-4000-8000-000000000042','doctor','f0120000-0000-4000-8a00-000000000041','2020-01-01','active','f0120000-0000-4000-8000-000000000041');
INSERT INTO clinical.schedules(id,facility_id,doctor_person_id,timezone_name,valid_from,valid_to,slot_duration_minutes,fee_minor_units,currency_code,created_by_person_id,updated_by_person_id)
VALUES ('f0120000-0000-4000-8200-000000000041','f0120000-0000-4000-8100-000000000041','f0120000-0000-4000-8000-000000000042','Africa/Cairo','2026-09-01','2026-09-30',30,10000,'EGP','f0120000-0000-4000-8000-000000000041','f0120000-0000-4000-8000-000000000041');
INSERT INTO clinical.appointments(id,patient_person_id,facility_id,doctor_person_id,schedule_id,starts_at,ends_at,timezone_name,civil_date,local_start,fee_minor_units,currency_code,status,created_by_person_id,updated_by_person_id)
VALUES ('f0120000-0000-4000-8300-000000000041','f0120000-0000-4000-8000-000000000043','f0120000-0000-4000-8100-000000000041','f0120000-0000-4000-8000-000000000042','f0120000-0000-4000-8200-000000000041','2026-09-13T11:00:00Z','2026-09-13T11:30:00Z','Africa/Cairo','2026-09-13','14:00',10000,'EGP','confirmed','f0120000-0000-4000-8000-000000000043','f0120000-0000-4000-8000-000000000043');

SET SESSION AUTHORIZATION shifaa_api;
DO $api_writers$
DECLARE
  patient constant uuid := 'f0120000-0000-4000-8000-000000000043';
  facility constant uuid := 'f0120000-0000-4000-8100-000000000041';
  doctor constant uuid := 'f0120000-0000-4000-8000-000000000042';
  staff constant uuid := 'f0120000-0000-4000-8000-000000000041';
  seeded constant uuid := 'f0120000-0000-4000-8300-000000000041';
  booking jsonb := jsonb_build_object(
    'patient_person_id',patient,'facility_id',facility,'doctor_person_id',doctor,
    'schedule_id','f0120000-0000-4000-8200-000000000041','timezone_name','Africa/Cairo',
    'starts_at','2026-09-13T15:00:00Z','ends_at','2026-09-13T15:30:00Z',
    'civil_date','2026-09-13','local_start','18:00','payment_method','cash_on_arrival'
  );
  first_response jsonb;
  appointment_id uuid;
  first_entry jsonb;
  second_entry jsonb;
  queue_view jsonb;
  called jsonb;
BEGIN
  PERFORM set_config('shifaa.person_id',patient::text,true),
          set_config('shifaa.aal','2',true),
          set_config('shifaa.request_id','f0120000-0000-4000-9900-000000000041',true),
          set_config('shifaa.trace_id','t012-synthetic-scheduling',true),
          set_config('shifaa.action','appointment.manage',true),
          set_config('shifaa.purposes','appointment.scheduling',true),
          set_config('shifaa.idempotency_key','t012-book',true),
          set_config('shifaa.request_hash',repeat('a',64),true);
  first_response := clinical.create_appointment_v1(booking);
  appointment_id := (first_response->>'id')::uuid;
  IF appointment_id IS NULL OR (first_response->>'status') IS DISTINCT FROM 'confirmed'
     OR clinical.create_appointment_v1(booking) IS DISTINCT FROM first_response THEN
    RAISE EXCEPTION 'API booking or its canonical replay failed';
  END IF;

  PERFORM set_config('shifaa.idempotency_key','t012-reschedule',true);
  IF (clinical.reschedule_appointment_v1(
    appointment_id,1,'2026-09-13T15:30:00Z','2026-09-13T16:00:00Z',
    '2026-09-13','18:30','Synthetic reschedule'
  )->>'version')::integer IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'API reschedule did not advance the same appointment';
  END IF;

  PERFORM set_config('shifaa.person_id',staff::text,true),
          set_config('shifaa.idempotency_key','t012-first-check-in',true);
  first_entry := clinical.check_in_appointment_v1(appointment_id,2)->'queueEntry';
  PERFORM set_config('shifaa.idempotency_key','t012-second-check-in',true);
  second_entry := clinical.check_in_appointment_v1(seeded,1)->'queueEntry';
  IF (first_entry->>'queueNumber')::integer IS DISTINCT FROM 1
     OR (second_entry->>'queueNumber')::integer IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'API check-in did not yield two ordered queue entries';
  END IF;

  PERFORM set_config('shifaa.action','queue.manage',true),
          set_config('shifaa.purposes','queue.operation',true),
          set_config('shifaa.idempotency_key','t012-reorder',true);
  queue_view := clinical.read_queue_projection_v1(facility,doctor,'2026-09-13');
  queue_view := clinical.reorder_queue_entry_v1(
    (second_entry->>'id')::uuid,(second_entry->>'version')::integer,
    (queue_view->>'version')::integer,1,'Synthetic reorder'
  );
  IF (queue_view#>>'{entries,0,id}') IS DISTINCT FROM (second_entry->>'id')
     OR (queue_view#>>'{entries,1,id}') IS DISTINCT FROM (first_entry->>'id') THEN
    RAISE EXCEPTION 'API reorder did not displace the existing queue entry';
  END IF;

  PERFORM set_config('shifaa.idempotency_key','t012-call',true);
  called := clinical.call_queue_entry_v1(
    (second_entry->>'id')::uuid,(queue_view#>>'{entries,0,version}')::integer
  );
  PERFORM set_config('shifaa.idempotency_key','t012-complete',true);
  IF (clinical.complete_queue_entry_v1((called->>'id')::uuid,(called->>'version')::integer)
      ->>'state') IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'API queue-only completion failed';
  END IF;
  RAISE NOTICE 'API database role verified booking, replay, reschedule, check-in, reorder, call and completion';
END
$api_writers$;
RESET SESSION AUTHORIZATION;

DO $effects$
BEGIN
  IF (SELECT count(*) FROM clinical.appointments
      WHERE facility_id='f0120000-0000-4000-8100-000000000041' AND status='checked_in')<>2
     OR EXISTS (SELECT 1 FROM clinical.encounters
                WHERE facility_id='f0120000-0000-4000-8100-000000000041')
     OR (SELECT count(*) FROM platform.idempotency_records
         WHERE idempotency_key LIKE 't012-%' AND state='completed')<>7
     OR (SELECT count(*) FROM audit.events WHERE action_code IN (
           'appointment.created','appointment.rescheduled','appointment.checked_in',
           'queue.entry.created','queue.entry.reordered','queue.entry.called','queue.entry.completed'
         ))<>9
     OR (SELECT count(*) FROM platform.outbox_events
         WHERE event_type IN ('clinical.appointment.changed.v1','clinical.queue.changed.v1'))<>9 THEN
    RAISE EXCEPTION 'scheduling domain, audit, outbox or idempotency effects were incomplete';
  END IF;
  RAISE NOTICE 'owner verified checked-in appointments, no encounter, seven idempotency records and nine audit/outbox effects';
END
$effects$;
ROLLBACK;
