BEGIN;

-- Synthetic-only C08 booking seam vectors. The expected RED on the F009-only
-- baseline occurs after the complete public createAppointment parity block.
INSERT INTO identity.people(id,user_id,display_name,profile_status) VALUES
  ('f0100000-0000-4000-8000-000000000001','f0100000-0000-4000-9000-000000000001','F010 synthetic owner','active'),
  ('f0100000-0000-4000-8000-000000000002','f0100000-0000-4000-9000-000000000002','F010 synthetic doctor','active'),
  ('f0100000-0000-4000-8000-000000000003','f0100000-0000-4000-9000-000000000003','F010 synthetic patient A','active'),
  ('f0100000-0000-4000-8000-000000000004','f0100000-0000-4000-9000-000000000004','F010 synthetic patient B','active');

INSERT INTO identity.patients(id,person_id,medical_record_number,record_status) VALUES
  ('f0100000-0000-4000-8900-000000000001','f0100000-0000-4000-8000-000000000003','F010-MRN-0001','active'),
  ('f0100000-0000-4000-8900-000000000002','f0100000-0000-4000-8000-000000000004','F010-MRN-0002','active');

INSERT INTO identity.facilities(id,facility_type,name_ar,name_en,facility_status,governorate_code,city,district,address_line,created_by_person_id)
VALUES ('f0100000-0000-4000-8100-000000000001','clinic','عيادة تجريبية','F010 synthetic clinic','active','C','Cairo','Test','Synthetic address','f0100000-0000-4000-8000-000000000001');

INSERT INTO identity.professional_licenses(id,person_id,profession,number_ciphertext,number_hash,issuer,expires_on,status)
VALUES ('f0100000-0000-4000-8a00-000000000001','f0100000-0000-4000-8000-000000000002','doctor',decode(repeat('1',16),'hex'),decode(repeat('2',64),'hex'),'F010 synthetic regulator','2035-12-31','verified');

INSERT INTO identity.facility_memberships(facility_id,person_id,role_code,employment_license_id,valid_from,membership_status,created_by_person_id) VALUES
  ('f0100000-0000-4000-8100-000000000001','f0100000-0000-4000-8000-000000000001','owner',NULL,'2020-01-01','active','f0100000-0000-4000-8000-000000000001'),
  ('f0100000-0000-4000-8100-000000000001','f0100000-0000-4000-8000-000000000002','doctor','f0100000-0000-4000-8a00-000000000001','2020-01-01','active','f0100000-0000-4000-8000-000000000001');

INSERT INTO clinical.schedules(id,facility_id,doctor_person_id,timezone_name,valid_from,valid_to,slot_duration_minutes,fee_minor_units,currency_code,created_by_person_id,updated_by_person_id)
VALUES ('f0100000-0000-4000-8200-000000000001','f0100000-0000-4000-8100-000000000001','f0100000-0000-4000-8000-000000000002','Africa/Cairo','2030-09-01','2030-09-30',30,12345,'EGP','f0100000-0000-4000-8000-000000000001','f0100000-0000-4000-8000-000000000001');

INSERT INTO clinical.schedule_windows(schedule_id,iso_weekday,local_start,local_end)
VALUES ('f0100000-0000-4000-8200-000000000001',7,'09:00','12:00');

INSERT INTO clinical.schedule_exceptions(schedule_id,facility_id,doctor_person_id,timezone_name,civil_date,starts_at,ends_at,exception_type,reason,created_by_person_id,updated_by_person_id)
VALUES (
  'f0100000-0000-4000-8200-000000000001',
  'f0100000-0000-4000-8100-000000000001',
  'f0100000-0000-4000-8000-000000000002',
  'Africa/Cairo',
  '2030-09-01',
  make_timestamptz(2030,9,1,9,30,0,'Africa/Cairo'),
  make_timestamptz(2030,9,1,10,0,0,'Africa/Cairo'),
  'blocked',
  'synthetic blocked slot',
  'f0100000-0000-4000-8000-000000000001',
  'f0100000-0000-4000-8000-000000000001'
);

SELECT pg_catalog.set_config('shifaa.person_id','f0100000-0000-4000-8000-000000000003',true);
SELECT pg_catalog.set_config('shifaa.environment','local',true);
SELECT pg_catalog.set_config('shifaa.test_now','2026-09-27T08:00:00Z',true);
SELECT pg_catalog.set_config('shifaa.action','clinic.scheduling',true);
SELECT pg_catalog.set_config('shifaa.aal','2',true);
SELECT pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);

DO $f009_public_booking_parity$
DECLARE
  booking_request jsonb;
  changed_request jsonb;
  booked_result jsonb;
  replay_result jsonb;
  booked_id uuid;
  schedule_row clinical.schedules%ROWTYPE;
  starts_at_value timestamptz;
  ends_at_value timestamptz;
  error_state text;
  error_text text;
  booked_count integer;
  effect_count integer;
  audit_count integer;
  outbox_count integer;
  availability_count integer;
BEGIN
  SELECT * INTO STRICT schedule_row
  FROM clinical.schedules
  WHERE id='f0100000-0000-4000-8200-000000000001';

  IF extract(isodow FROM date '2030-09-01')::integer<>7 THEN
    RAISE EXCEPTION 'C08 fixture date is not the expected Sunday';
  END IF;

  SELECT count(*)::integer INTO availability_count
  FROM clinical.list_availability_v1(schedule_row.id,'2030-09-01');
  IF availability_count<>5 OR EXISTS (
    SELECT 1 FROM clinical.list_availability_v1(schedule_row.id,'2030-09-01') slot
    WHERE slot.local_start=time '09:30'
  ) THEN
    RAISE EXCEPTION 'F009 effective availability did not remove the synthetic blocked slot';
  END IF;

  SELECT slot.starts_at,slot.ends_at INTO STRICT starts_at_value,ends_at_value
  FROM clinical.list_availability_v1(schedule_row.id,'2030-09-01') slot
  WHERE slot.local_start=time '09:00';

  booking_request:=jsonb_build_object(
    'patient_person_id','f0100000-0000-4000-8000-000000000003',
    'facility_id',schedule_row.facility_id,
    'doctor_person_id',schedule_row.doctor_person_id,
    'starts_at',starts_at_value,
    'ends_at',ends_at_value,
    'timezone_name',schedule_row.timezone_name,
    'civil_date','2030-09-01',
    'local_start','09:00',
    'payment_method','cash_on_arrival'
  );

  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c08-public-booking',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',repeat('a',64),true);
  booked_result:=clinical.create_appointment_v1(booking_request);
  booked_id:=(booked_result->>'id')::uuid;

  IF booked_id IS NULL
     OR booked_result->>'status' IS DISTINCT FROM 'confirmed'
     OR booked_result->>'feeMinorUnits' IS DISTINCT FROM '12345'
     OR booked_result->>'currency' IS DISTINCT FROM 'EGP'
     OR booked_result->>'paymentMethod' IS DISTINCT FROM 'cash_on_arrival'
     OR booked_result->>'patientId' IS DISTINCT FROM 'f0100000-0000-4000-8000-000000000003'
     OR (SELECT fee_minor_units FROM clinical.appointments WHERE id=booked_id)<>12345
     OR (SELECT currency_code FROM clinical.appointments WHERE id=booked_id)<>'EGP'
     OR (SELECT payment_method FROM clinical.appointments WHERE id=booked_id)<>'cash_on_arrival' THEN
    RAISE EXCEPTION 'F009 public createAppointment result lost server pricing or canonical result fields';
  END IF;

  replay_result:=clinical.create_appointment_v1(booking_request);
  IF replay_result IS DISTINCT FROM booked_result THEN
    RAISE EXCEPTION 'F009 same-key replay did not return the canonical appointment result';
  END IF;

  SELECT count(*)::integer INTO booked_count FROM clinical.appointments WHERE id=booked_id;
  SELECT count(*)::integer INTO effect_count
  FROM platform.idempotency_records
  WHERE route_template='/v1/appointments'
    AND resource_id=booked_id
    AND state='completed'
    AND response_status=201
    AND response_body=booked_result;
  SELECT count(*)::integer INTO audit_count
  FROM audit.events
  WHERE resource_id=booked_id AND action_code='appointment.created';
  SELECT count(*)::integer INTO outbox_count
  FROM platform.outbox_events
  WHERE aggregate_id=booked_id AND event_type='clinical.appointment.changed.v1';
  IF booked_count<>1 OR effect_count<>1 OR audit_count<>1 OR outbox_count<>1 THEN
    RAISE EXCEPTION 'F009 public booking replay duplicated appointment, canonical response, audit, or outbox effect';
  END IF;

  changed_request:=booking_request || jsonb_build_object(
    'starts_at',make_timestamptz(2030,9,1,10,0,0,'Africa/Cairo'),
    'ends_at',make_timestamptz(2030,9,1,10,30,0,'Africa/Cairo'),
    'local_start','10:00'
  );
  PERFORM pg_catalog.set_config('shifaa.request_hash',repeat('b',64),true);
  BEGIN
    PERFORM clinical.create_appointment_v1(changed_request);
    RAISE EXCEPTION 'F009 changed-body idempotency key was accepted';
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS error_state=RETURNED_SQLSTATE,error_text=MESSAGE_TEXT;
    IF error_state<>'23505' OR error_text<>'idempotency key reused with a changed body' THEN
      RAISE EXCEPTION 'F009 changed-body problem semantics changed: %, %',error_state,error_text;
    END IF;
  END;

  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c08-invalid-fee',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',repeat('c',64),true);
  BEGIN
    PERFORM clinical.create_appointment_v1(booking_request || jsonb_build_object('fee_minor_units',1));
    RAISE EXCEPTION 'F009 client-supplied fee was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    GET STACKED DIAGNOSTICS error_state=RETURNED_SQLSTATE,error_text=MESSAGE_TEXT;
    IF error_state<>'22023' OR error_text<>'appointment fee and currency are server-owned' THEN
      RAISE EXCEPTION 'F009 fee problem semantics changed: %, %',error_state,error_text;
    END IF;
  END;

  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c08-invalid-payment',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',repeat('d',64),true);
  BEGIN
    PERFORM clinical.create_appointment_v1(booking_request || jsonb_build_object('payment_method','digital_wallet'));
    RAISE EXCEPTION 'F009 unsupported payment method was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    GET STACKED DIAGNOSTICS error_state=RETURNED_SQLSTATE,error_text=MESSAGE_TEXT;
    IF error_state<>'22023' OR error_text<>'invalid appointment request' THEN
      RAISE EXCEPTION 'F009 request problem semantics changed: %, %',error_state,error_text;
    END IF;
  END;

  PERFORM pg_catalog.set_config('shifaa.person_id','f0100000-0000-4000-8000-000000000004',true);
  PERFORM pg_catalog.set_config('shifaa.idempotency_key','f010-c08-slot-conflict',true);
  PERFORM pg_catalog.set_config('shifaa.request_hash',repeat('e',64),true);
  BEGIN
    PERFORM clinical.create_appointment_v1(
      booking_request || jsonb_build_object('patient_person_id','f0100000-0000-4000-8000-000000000004')
    );
    RAISE EXCEPTION 'F009 overlapping appointment was accepted';
  EXCEPTION WHEN exclusion_violation THEN
    GET STACKED DIAGNOSTICS error_state=RETURNED_SQLSTATE;
    IF error_state<>'23P01' THEN RAISE EXCEPTION 'F009 slot-conflict problem SQLSTATE changed: %',error_state; END IF;
  END;

  IF (SELECT count(*) FROM clinical.appointments WHERE starts_at=starts_at_value)<>1 THEN
    RAISE EXCEPTION 'F009 slot conflict left a second appointment';
  END IF;
END
$f009_public_booking_parity$;

DO $f009_booking_parity_complete$
BEGIN
  RAISE NOTICE 'F009_BOOKING_PARITY_PASS: authoritative fee/EGP/cash, public result and problem semantics, same-key replay and changed-body conflict, effective availability and exclusion';
END
$f009_booking_parity_complete$;

DO $internal_booking_primitive_required$
BEGIN
  IF pg_catalog.to_regprocedure('clinical.book_appointment_internal_v1(jsonb,integer,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'F010_INTERNAL_BOOKING_PRIMITIVE_MISSING: clinical.book_appointment_internal_v1(jsonb,integer,jsonb)';
  END IF;
END
$internal_booking_primitive_required$;

DO $f010_internal_booking_vectors$
DECLARE
  schedule_row clinical.schedules%ROWTYPE;
  appointment_input jsonb;
  mismatched_input jsonb;
  expected_slot jsonb;
  appointment_id uuid;
  before_appointments integer;
  before_idempotency integer;
  before_audit integer;
  before_outbox integer;
  error_state text;
  error_text text;
  slot_10_start timestamptz;
  slot_10_end timestamptz;
BEGIN
  SELECT * INTO STRICT schedule_row
  FROM clinical.schedules
  WHERE id='f0100000-0000-4000-8200-000000000001';

  SELECT slot.starts_at,slot.ends_at INTO STRICT slot_10_start,slot_10_end
  FROM clinical.list_availability_v1(schedule_row.id,'2030-09-01') slot
  WHERE slot.local_start=time '10:00';
  appointment_input:=jsonb_build_object(
    'patient_person_id','f0100000-0000-4000-8000-000000000003',
    'facility_id',schedule_row.facility_id,
    'doctor_person_id',schedule_row.doctor_person_id,
    'schedule_id',schedule_row.id,
    'starts_at',slot_10_start,
    'ends_at',slot_10_end,
    'timezone_name',schedule_row.timezone_name,
    'civil_date','2030-09-01',
    'local_start','10:00'
  );
  expected_slot:=jsonb_build_object(
    'starts_at',slot_10_start,
    'ends_at',slot_10_end,
    'timezone_name',schedule_row.timezone_name,
    'civil_date','2030-09-01',
    'local_start','10:00'
  );

  SELECT count(*)::integer INTO before_appointments FROM clinical.appointments;
  SELECT count(*)::integer INTO before_idempotency FROM platform.idempotency_records;
  SELECT count(*)::integer INTO before_audit FROM audit.events;
  SELECT count(*)::integer INTO before_outbox FROM platform.outbox_events;
  appointment_id:=clinical.book_appointment_internal_v1(appointment_input,schedule_row.version,expected_slot);

  IF appointment_id IS NULL
     OR (SELECT fee_minor_units FROM clinical.appointments WHERE id=appointment_id)<>12345
     OR (SELECT currency_code FROM clinical.appointments WHERE id=appointment_id)<>'EGP'
     OR (SELECT payment_method FROM clinical.appointments WHERE id=appointment_id)<>'cash_on_arrival'
     OR (SELECT status FROM clinical.appointments WHERE id=appointment_id)<>'confirmed'
     OR (SELECT count(*) FROM clinical.appointments)<>before_appointments+1
     OR (SELECT count(*) FROM platform.idempotency_records)<>before_idempotency
     OR (SELECT count(*) FROM audit.events)<>before_audit
     OR (SELECT count(*) FROM platform.outbox_events)<>before_outbox THEN
    RAISE EXCEPTION 'F010 booking primitive changed server pricing or wrote an operation-level effect';
  END IF;

  mismatched_input:=appointment_input || jsonb_build_object(
    'starts_at',make_timestamptz(2030,9,1,10,30,0,'Africa/Cairo'),
    'ends_at',make_timestamptz(2030,9,1,11,0,0,'Africa/Cairo'),
    'local_start','10:30'
  );
  BEGIN
    PERFORM clinical.book_appointment_internal_v1(mismatched_input,schedule_row.version,expected_slot);
    RAISE EXCEPTION 'F010 booking primitive accepted a tuple different from the selected slot';
  EXCEPTION WHEN serialization_failure THEN
    GET STACKED DIAGNOSTICS error_state=RETURNED_SQLSTATE,error_text=MESSAGE_TEXT;
    IF error_state<>'40001' OR error_text<>'appointment selected slot is stale or unavailable' THEN
      RAISE EXCEPTION 'F010 exact-slot conflict semantics changed: %, %',error_state,error_text;
    END IF;
  END;

  BEGIN
    PERFORM clinical.book_appointment_internal_v1(appointment_input,schedule_row.version+1,expected_slot);
    RAISE EXCEPTION 'F010 booking primitive accepted a stale schedule version';
  EXCEPTION WHEN serialization_failure THEN
    GET STACKED DIAGNOSTICS error_state=RETURNED_SQLSTATE,error_text=MESSAGE_TEXT;
    IF error_state<>'40001' OR error_text<>'appointment schedule is stale or missing' THEN
      RAISE EXCEPTION 'F010 schedule-version conflict semantics changed: %, %',error_state,error_text;
    END IF;
  END;

  appointment_input:=jsonb_set(appointment_input,'{starts_at}',to_jsonb(make_timestamptz(2030,9,1,9,30,0,'Africa/Cairo')));
  appointment_input:=jsonb_set(appointment_input,'{ends_at}',to_jsonb(make_timestamptz(2030,9,1,10,0,0,'Africa/Cairo')));
  appointment_input:=jsonb_set(appointment_input,'{local_start}',to_jsonb('09:30'::text));
  BEGIN
    PERFORM clinical.book_appointment_internal_v1(appointment_input,schedule_row.version,appointment_input - 'patient_person_id' - 'facility_id' - 'doctor_person_id' - 'schedule_id');
    RAISE EXCEPTION 'F010 booking primitive accepted a blocked effective slot';
  EXCEPTION WHEN serialization_failure THEN
    GET STACKED DIAGNOSTICS error_state=RETURNED_SQLSTATE,error_text=MESSAGE_TEXT;
    IF error_state<>'40001' OR error_text<>'appointment selected slot is stale or unavailable' THEN
      RAISE EXCEPTION 'F010 unavailable-slot conflict semantics changed: %, %',error_state,error_text;
    END IF;
  END;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc proc
    CROSS JOIN LATERAL pg_catalog.aclexplode(proc.proacl) acl
    WHERE proc.oid=pg_catalog.to_regprocedure('clinical.book_appointment_internal_v1(jsonb,integer,jsonb)')
      AND acl.grantee=0
      AND acl.privilege_type='EXECUTE'
  ) OR has_function_privilege('shifaa_api','clinical.book_appointment_internal_v1(jsonb,integer,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'F010 internal booking primitive is directly executable by PUBLIC or the online API role';
  END IF;
END
$f010_internal_booking_vectors$;

COMMIT;
