BEGIN;
-- Synthetic, durable truth set used by the logical dump/restore runner. No
-- production identifiers or patient content are admitted to this fixture.
SELECT pg_catalog.set_config('shifaa.person_id','f0090000-0000-4000-8800-000000000001',true);
SELECT pg_catalog.set_config('shifaa.environment','local',true);
SELECT pg_catalog.set_config('shifaa.test_now','2026-09-12T08:00:00Z',true);
INSERT INTO identity.people(id,user_id,display_name,profile_status) VALUES
 ('f0090000-0000-4000-8800-000000000001','f0090000-0000-4000-9800-000000000001','F009 restore owner','active'),
 ('f0090000-0000-4000-8800-000000000002','f0090000-0000-4000-9800-000000000002','F009 restore doctor','active'),
 ('f0090000-0000-4000-8800-000000000003','f0090000-0000-4000-9800-000000000003','F009 restore patient','active');
INSERT INTO identity.patients(id,person_id,medical_record_number,record_status)
VALUES ('f0090000-0000-4000-8900-000000000002','f0090000-0000-4000-8800-000000000003','F009-RESTORE-MRN','active');
INSERT INTO identity.facilities(id,facility_type,name_ar,name_en,facility_status,governorate_code,city,district,address_line,created_by_person_id)
VALUES ('f0090000-0000-4000-8100-000000000002','clinic','عيادة استعادة','F009 restore clinic','draft','C','Cairo','Restore','Synthetic restore address','f0090000-0000-4000-8800-000000000001');
INSERT INTO clinical.schedules(id,facility_id,doctor_person_id,timezone_name,valid_from,valid_to,slot_duration_minutes,created_by_person_id,updated_by_person_id)
VALUES ('f0090000-0000-4000-8200-000000000010','f0090000-0000-4000-8100-000000000002','f0090000-0000-4000-8800-000000000002','Africa/Cairo','2026-09-01','2026-09-30',30,'f0090000-0000-4000-8800-000000000001','f0090000-0000-4000-8800-000000000001');
INSERT INTO clinical.schedule_windows(schedule_id,iso_weekday,local_start,local_end)
VALUES ('f0090000-0000-4000-8200-000000000010',7,'09:00','10:00');
INSERT INTO clinical.schedule_exceptions(schedule_id,facility_id,doctor_person_id,timezone_name,civil_date,starts_at,ends_at,exception_type,reason,created_by_person_id,updated_by_person_id)
VALUES ('f0090000-0000-4000-8200-000000000010','f0090000-0000-4000-8100-000000000002','f0090000-0000-4000-8800-000000000002','Africa/Cairo','2026-09-13','2026-09-13T06:00:00Z','2026-09-13T06:30:00Z','blocked','restore fixture block','f0090000-0000-4000-8800-000000000001','f0090000-0000-4000-8800-000000000001');
INSERT INTO clinical.appointments(id,patient_person_id,facility_id,doctor_person_id,schedule_id,starts_at,ends_at,timezone_name,civil_date,local_start,fee_minor_units,currency_code,status,created_by_person_id,updated_by_person_id)
VALUES ('f0090000-0000-4000-8300-000000000010','f0090000-0000-4000-8800-000000000003','f0090000-0000-4000-8100-000000000002','f0090000-0000-4000-8800-000000000002','f0090000-0000-4000-8200-000000000010','2026-09-13T07:00:00Z','2026-09-13T07:30:00Z','Africa/Cairo','2026-09-13','09:00',10000,'EGP','confirmed','f0090000-0000-4000-8800-000000000003','f0090000-0000-4000-8800-000000000003');
INSERT INTO clinical.queue_scopes(id,facility_id,doctor_person_id,civil_date,timezone_name,next_queue_number)
VALUES ('f0090000-0000-4000-8400-000000000010','f0090000-0000-4000-8100-000000000002','f0090000-0000-4000-8800-000000000002','2026-09-13','Africa/Cairo',2);
INSERT INTO clinical.queue_entries(id,queue_scope_id,appointment_id,facility_id,doctor_person_id,civil_date,queue_number,waiting_order,state)
VALUES ('f0090000-0000-4000-8500-000000000010','f0090000-0000-4000-8400-000000000010','f0090000-0000-4000-8300-000000000010','f0090000-0000-4000-8100-000000000002','f0090000-0000-4000-8800-000000000002','2026-09-13',1,1,'waiting');
SELECT clinical.record_mutation_effect_v1('clinical.schedule.changed.v1','schedule.restore.seed','schedule','f0090000-0000-4000-8200-000000000010',2,'f0090000-0000-4000-8100-000000000002');
DO $idempotency_seed$
DECLARE claimed_id uuid;
BEGIN
  SELECT record_id INTO claimed_id FROM clinical.claim_idempotency_v1('POST','/v1/clinic/restore','restore-key',repeat('c',64));
  UPDATE platform.idempotency_records SET state='completed',response_status=201,response_body='{"resource_id":"f0090000-0000-4000-8300-000000000010"}'::jsonb,resource_type='appointment',resource_id='f0090000-0000-4000-8300-000000000010' WHERE id=claimed_id;
END
$idempotency_seed$;
DO $restore_truth$
BEGIN
  IF (SELECT version FROM clinical.schedules WHERE id='f0090000-0000-4000-8200-000000000010')<>2 THEN RAISE EXCEPTION 'restored schedule version mismatch'; END IF;
  IF NOT EXISTS (SELECT 1 FROM clinical.schedule_exceptions WHERE schedule_id='f0090000-0000-4000-8200-000000000010' AND exception_type='blocked') THEN RAISE EXCEPTION 'restored exception missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM clinical.queue_entries WHERE appointment_id='f0090000-0000-4000-8300-000000000010' AND queue_number=1 AND waiting_order=1) THEN RAISE EXCEPTION 'restored queue order mismatch'; END IF;
  IF NOT EXISTS (SELECT 1 FROM audit.events WHERE resource_id='f0090000-0000-4000-8200-000000000010' AND action_code='schedule.restore.seed') THEN RAISE EXCEPTION 'restored audit event missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM platform.outbox_events WHERE aggregate_id='f0090000-0000-4000-8200-000000000010' AND event_type='clinical.schedule.changed.v1' AND aggregate_version=2) THEN RAISE EXCEPTION 'restored outbox event missing'; END IF;
  IF (SELECT count(*) FROM platform.idempotency_records WHERE method='POST' AND route_template='/v1/clinic/restore' AND state='completed')<>1 THEN RAISE EXCEPTION 'restored idempotency record missing'; END IF;
END
$restore_truth$;
COMMIT;
