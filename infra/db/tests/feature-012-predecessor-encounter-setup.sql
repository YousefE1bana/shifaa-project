-- Fixture-only prerequisites for the real F010 encounter API, after K06.
BEGIN;
INSERT INTO clinical.appointments
  (id,patient_person_id,facility_id,doctor_person_id,schedule_id,starts_at,ends_at,timezone_name,
   civil_date,local_start,fee_minor_units,currency_code,status,created_by_person_id,updated_by_person_id)
VALUES ('f0120100-0000-4000-8500-000000000001','f0110000-0000-4000-8000-000000000001',
  'f0110000-0000-4000-8200-000000000001','f0110000-0000-4000-8000-000000000002',
  'f011c000-0000-4000-8600-000000000001','2026-10-06T11:00:00Z','2026-10-06T11:30:00Z',
  'Africa/Cairo','2026-10-06','14:00',0,'EGP','confirmed',
  'f0110000-0000-4000-8000-000000000002','f0110000-0000-4000-8000-000000000002');
INSERT INTO clinical.queue_scopes(id,facility_id,doctor_person_id,civil_date,timezone_name)
VALUES ('f0120100-0000-4000-8600-000000000001','f0110000-0000-4000-8200-000000000001',
  'f0110000-0000-4000-8000-000000000002','2026-10-06','Africa/Cairo');
INSERT INTO clinical.queue_entries
  (id,queue_scope_id,appointment_id,facility_id,doctor_person_id,civil_date,queue_number,waiting_order,state)
VALUES ('f0120100-0000-4000-8700-000000000001','f0120100-0000-4000-8600-000000000001',
  'f0120100-0000-4000-8500-000000000001','f0110000-0000-4000-8200-000000000001',
  'f0110000-0000-4000-8000-000000000002','2026-10-06',1,1,'waiting');
SELECT set_config('shifaa.clinic_internal_transition','allowed',true);
UPDATE clinical.appointments SET status='checked_in' WHERE id='f0120100-0000-4000-8500-000000000001';
UPDATE clinical.queue_entries SET state='called',waiting_order=NULL,called_at=now()
WHERE id='f0120100-0000-4000-8700-000000000001';
COMMIT;
