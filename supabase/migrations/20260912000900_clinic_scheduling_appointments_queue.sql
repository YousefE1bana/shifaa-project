BEGIN;

-- Feature 009 is additive and synthetic-only.  This preflight intentionally
-- fails closed when a prior object has the same name but an incompatible kind.
CREATE SCHEMA IF NOT EXISTS clinical;
CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $preflight$
DECLARE
  object_name text;
BEGIN
  FOREACH object_name IN ARRAY ARRAY['schedules','schedule_windows','schedule_exceptions','appointments','queue_scopes','queue_entries'] LOOP
    IF to_regclass('clinical.' || object_name) IS NOT NULL
       AND (SELECT relkind FROM pg_class WHERE oid=to_regclass('clinical.' || object_name)) <> 'r' THEN
      RAISE EXCEPTION 'F009_LEGACY_OBJECT_SHAPE_UNSUPPORTED: clinical.%', object_name USING ERRCODE='55000';
    END IF;
  END LOOP;
END
$preflight$;

CREATE TABLE clinical.schedules (
  id uuid PRIMARY KEY DEFAULT public.gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES identity.facilities(id),
  doctor_person_id uuid NOT NULL REFERENCES identity.people(id),
  timezone_name text NOT NULL,
  valid_from date NOT NULL,
  valid_to date NOT NULL,
  valid_dates daterange GENERATED ALWAYS AS (daterange(valid_from, valid_to + 1, '[)'::text)) STORED,
  slot_duration_minutes smallint NOT NULL CHECK (slot_duration_minutes BETWEEN 1 AND 1440),
  fee_minor_units bigint NOT NULL CHECK (fee_minor_units >= 0),
  currency_code char(3) NOT NULL DEFAULT 'EGP' CHECK (currency_code='EGP'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','retired')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  created_by_person_id uuid NOT NULL REFERENCES identity.people(id),
  updated_by_person_id uuid NOT NULL REFERENCES identity.people(id),
  CONSTRAINT schedules_valid_dates_check CHECK (valid_to >= valid_from)
);
COMMENT ON TABLE clinical.schedules IS 'retention_class=CLINICAL_SCHEDULING; synthetic-only while OPEN-TECH-002/003 and OPEN-PRODUCT-001 remain open';
COMMENT ON COLUMN clinical.schedules.valid_dates IS 'Inclusive civil validity represented as [valid_from, valid_to + 1)';
COMMENT ON COLUMN clinical.schedules.fee_minor_units IS 'Server-owned nonnegative EGP fee snapshot source for appointments';
COMMENT ON COLUMN clinical.schedules.currency_code IS 'Fixed server-owned currency; Feature 009 accepts EGP only';
CREATE INDEX clinical_schedules_scope_idx ON clinical.schedules(facility_id,doctor_person_id,status,valid_from,valid_to,id);
CREATE INDEX clinical_schedules_doctor_idx ON clinical.schedules(doctor_person_id,status,valid_from,valid_to,id);
ALTER TABLE clinical.schedules ADD CONSTRAINT schedules_active_validity_excl EXCLUDE USING gist
  (facility_id WITH =, doctor_person_id WITH =, valid_dates WITH &&) WHERE (status='active');

CREATE TABLE clinical.schedule_windows (
  id uuid PRIMARY KEY DEFAULT public.gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES clinical.schedules(id) ON DELETE CASCADE,
  iso_weekday smallint NOT NULL CHECK (iso_weekday BETWEEN 1 AND 7),
  local_start time(0) without time zone NOT NULL,
  local_end time(0) without time zone NOT NULL,
  start_second integer GENERATED ALWAYS AS (extract(epoch FROM local_start)::integer) STORED,
  end_second integer GENERATED ALWAYS AS (extract(epoch FROM local_end)::integer) STORED,
  local_span int4range GENERATED ALWAYS AS (int4range(extract(epoch FROM local_start)::integer, extract(epoch FROM local_end)::integer, '[)'::text)) STORED,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT schedule_windows_order_check CHECK (local_end > local_start),
  CONSTRAINT schedule_windows_positive_span_check CHECK (end_second > start_second),
  UNIQUE(schedule_id,iso_weekday,local_start,local_end)
);
COMMENT ON TABLE clinical.schedule_windows IS 'retention_class=CLINICAL_SCHEDULING; normalized ISO weekday wall-clock windows';
ALTER TABLE clinical.schedule_windows ADD CONSTRAINT schedule_windows_local_overlap_excl EXCLUDE USING gist
  (schedule_id WITH =, iso_weekday WITH =, local_span WITH &&);
CREATE INDEX clinical_schedule_windows_lookup_idx ON clinical.schedule_windows(schedule_id,iso_weekday,local_start,local_end,id);

CREATE TABLE clinical.schedule_exceptions (
  id uuid PRIMARY KEY DEFAULT public.gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES clinical.schedules(id),
  facility_id uuid NOT NULL REFERENCES identity.facilities(id),
  doctor_person_id uuid NOT NULL REFERENCES identity.people(id),
  timezone_name text NOT NULL,
  civil_date date NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  effective_range tstzrange GENERATED ALWAYS AS (tstzrange(starts_at,ends_at,'[)'::text)) STORED,
  exception_type text NOT NULL CHECK (exception_type IN ('blocked','added','delay','absence')),
  delay_minutes integer,
  reason text NOT NULL CHECK (octet_length(reason) BETWEEN 1 AND 512 AND reason !~ E'[\\r\\n\\t]'),
  superseded_at timestamptz,
  superseded_by_exception_id uuid REFERENCES clinical.schedule_exceptions(id),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by_person_id uuid NOT NULL REFERENCES identity.people(id),
  updated_by_person_id uuid NOT NULL REFERENCES identity.people(id),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT schedule_exceptions_range_check CHECK (ends_at > starts_at),
  CONSTRAINT schedule_exceptions_delay_check CHECK ((exception_type='delay' AND delay_minutes > 0) OR (exception_type<>'delay' AND delay_minutes IS NULL)),
  CONSTRAINT schedule_exceptions_supersession_check CHECK ((superseded_at IS NULL AND superseded_by_exception_id IS NULL) OR (exception_type='delay' AND superseded_at IS NOT NULL))
);
COMMENT ON TABLE clinical.schedule_exceptions IS 'retention_class=CLINICAL_SCHEDULING; reason restricted and excluded from public/event projections';
ALTER TABLE clinical.schedule_exceptions ADD CONSTRAINT schedule_exceptions_active_overlap_excl EXCLUDE USING gist
  (schedule_id WITH =, exception_type WITH =, effective_range WITH &&) WHERE (superseded_at IS NULL);
CREATE INDEX clinical_schedule_exceptions_scope_idx ON clinical.schedule_exceptions(facility_id,doctor_person_id,civil_date,exception_type,superseded_at,id);
CREATE INDEX clinical_schedule_exceptions_schedule_idx ON clinical.schedule_exceptions(schedule_id,civil_date,exception_type,starts_at,ends_at,id);

CREATE TABLE clinical.appointments (
  id uuid PRIMARY KEY DEFAULT public.gen_random_uuid(),
  patient_person_id uuid NOT NULL REFERENCES identity.people(id),
  facility_id uuid NOT NULL REFERENCES identity.facilities(id),
  doctor_person_id uuid NOT NULL REFERENCES identity.people(id),
  schedule_id uuid NOT NULL REFERENCES clinical.schedules(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  occupied_range tstzrange GENERATED ALWAYS AS (tstzrange(starts_at,ends_at,'[)'::text)) STORED,
  timezone_name text NOT NULL,
  civil_date date NOT NULL,
  local_start time(0) without time zone NOT NULL,
  fee_minor_units bigint NOT NULL CHECK (fee_minor_units >= 0),
  currency_code char(3) NOT NULL CHECK (currency_code='EGP'),
  payment_method text NOT NULL DEFAULT 'cash_on_arrival',
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('requested','confirmed','checked_in','in_queue','in_consultation','completed','cancelled','no_show','reschedule_required')),
  source_referral_id uuid,
  cancellation_reason text CHECK (cancellation_reason IS NULL OR (octet_length(cancellation_reason) BETWEEN 1 AND 512 AND cancellation_reason !~ E'[\\r\\n\\t]')),
  reschedule_reason text CHECK (reschedule_reason IS NULL OR (char_length(reschedule_reason) BETWEEN 1 AND 500 AND reschedule_reason !~ E'[\\r\\n\\t]')),
  cancelled_by_person_id uuid REFERENCES identity.people(id),
  cancelled_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by_person_id uuid NOT NULL REFERENCES identity.people(id),
  updated_by_person_id uuid NOT NULL REFERENCES identity.people(id),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT appointments_time_check CHECK (ends_at > starts_at),
  CONSTRAINT appointments_payment_method_check CHECK (payment_method='cash_on_arrival')
);
COMMENT ON TABLE clinical.appointments IS 'retention_class=CLINICAL_SCHEDULING; cash_on_arrival only; Feature 010 referral validation excluded';
COMMENT ON COLUMN clinical.appointments.reschedule_reason IS 'restricted input retained only for the reschedule mutation; excluded from responses, projections, audit, outbox, logs, and metrics';
ALTER TABLE clinical.appointments ADD CONSTRAINT appointments_occupied_excl EXCLUDE USING gist
  (doctor_person_id WITH =, occupied_range WITH &&) WHERE (status IN ('confirmed','checked_in','in_queue','in_consultation'));
CREATE INDEX clinical_appointments_patient_idx ON clinical.appointments(patient_person_id,status,starts_at DESC,id);
CREATE INDEX clinical_appointments_scope_idx ON clinical.appointments(facility_id,doctor_person_id,civil_date,status,starts_at,id);
CREATE INDEX clinical_appointments_doctor_upcoming_idx ON clinical.appointments(doctor_person_id,starts_at,id) WHERE status IN ('confirmed','checked_in','in_queue','in_consultation');
CREATE INDEX clinical_appointments_schedule_idx ON clinical.appointments(schedule_id,starts_at,id);
CREATE INDEX clinical_appointments_status_idx ON clinical.appointments(status,starts_at,id);

CREATE TABLE clinical.queue_scopes (
  id uuid PRIMARY KEY DEFAULT public.gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES identity.facilities(id),
  doctor_person_id uuid NOT NULL REFERENCES identity.people(id),
  civil_date date NOT NULL,
  timezone_name text NOT NULL,
  next_queue_number bigint NOT NULL DEFAULT 1 CHECK (next_queue_number > 0),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  current_delay_exception_id uuid REFERENCES clinical.schedule_exceptions(id),
  estimates_recalculated_at timestamptz,
  UNIQUE(facility_id,doctor_person_id,civil_date)
);
COMMENT ON TABLE clinical.queue_scopes IS 'retention_class=CLINICAL_SCHEDULING; serialized queue/delay/absence scope';
CREATE INDEX clinical_queue_scopes_doctor_date_idx ON clinical.queue_scopes(doctor_person_id,civil_date,id);

CREATE TABLE clinical.queue_entries (
  id uuid PRIMARY KEY DEFAULT public.gen_random_uuid(),
  queue_scope_id uuid NOT NULL REFERENCES clinical.queue_scopes(id),
  appointment_id uuid NOT NULL UNIQUE REFERENCES clinical.appointments(id),
  facility_id uuid NOT NULL REFERENCES identity.facilities(id),
  doctor_person_id uuid NOT NULL REFERENCES identity.people(id),
  civil_date date NOT NULL,
  queue_number bigint NOT NULL CHECK (queue_number > 0),
  waiting_order integer,
  state text NOT NULL DEFAULT 'waiting' CHECK (state IN ('waiting','called','in_service','completed','removed')),
  estimated_service_at timestamptz,
  estimate_version integer NOT NULL DEFAULT 1 CHECK (estimate_version > 0),
  reorder_reason text CHECK (reorder_reason IS NULL OR (octet_length(reorder_reason) BETWEEN 1 AND 512 AND reorder_reason !~ E'[\\r\\n\\t]')),
  reordered_by_person_id uuid REFERENCES identity.people(id),
  reordered_at timestamptz,
  called_at timestamptz,
  completed_at timestamptz,
  removed_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT queue_entries_waiting_order_check CHECK ((state='waiting' AND waiting_order IS NOT NULL) OR (state<>'waiting')),
  CONSTRAINT queue_entries_scope_guard CHECK (facility_id IS NOT NULL AND doctor_person_id IS NOT NULL AND civil_date IS NOT NULL)
);
COMMENT ON TABLE clinical.queue_entries IS 'retention_class=CLINICAL_SCHEDULING; patient identity is never a public queue projection';
CREATE UNIQUE INDEX clinical_queue_entries_scope_number_uq ON clinical.queue_entries(facility_id,doctor_person_id,civil_date,queue_number);
CREATE UNIQUE INDEX clinical_queue_entries_waiting_order_uq ON clinical.queue_entries(queue_scope_id,waiting_order) WHERE state='waiting';
CREATE INDEX clinical_queue_entries_read_idx ON clinical.queue_entries(queue_scope_id,state,waiting_order,queue_number,id);

CREATE OR REPLACE FUNCTION clinical.validate_schedule_timezone_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,clinical,identity AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name=NEW.timezone_name) THEN
    RAISE EXCEPTION 'invalid IANA timezone' USING ERRCODE='22023';
  END IF;
  IF NEW.valid_to < NEW.valid_from THEN RAISE EXCEPTION 'schedule validity is inverted' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' THEN
    IF OLD.status='retired' AND (NEW.status<>OLD.status OR NEW.valid_from<>OLD.valid_from OR NEW.valid_to<>OLD.valid_to OR NEW.timezone_name<>OLD.timezone_name) THEN
      RAISE EXCEPTION 'retired schedule is terminal' USING ERRCODE='55000';
    END IF;
    NEW.version=OLD.version+1;
  END IF;
  NEW.updated_at=statement_timestamp();
  RETURN NEW;
END $$;
CREATE TRIGGER schedules_guard BEFORE INSERT OR UPDATE ON clinical.schedules FOR EACH ROW EXECUTE FUNCTION clinical.validate_schedule_timezone_v1();

CREATE OR REPLACE FUNCTION clinical.schedule_window_parent_version_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,clinical AS $$
BEGIN
  UPDATE clinical.schedules SET version=version+1,updated_at=statement_timestamp(),updated_by_person_id=COALESCE(NULLIF(current_setting('shifaa.person_id',true),'')::uuid,updated_by_person_id)
   WHERE id=COALESCE(NEW.schedule_id,OLD.schedule_id);
  RETURN COALESCE(NEW,OLD);
END $$;
CREATE TRIGGER schedule_windows_parent_version AFTER INSERT OR UPDATE OR DELETE ON clinical.schedule_windows FOR EACH ROW EXECUTE FUNCTION clinical.schedule_window_parent_version_v1();

CREATE OR REPLACE FUNCTION clinical.exception_scope_guard_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,clinical AS $$
DECLARE parent clinical.schedules%ROWTYPE;
BEGIN
  SELECT * INTO parent FROM clinical.schedules WHERE id=NEW.schedule_id FOR KEY SHARE;
  IF NOT FOUND OR NEW.facility_id<>parent.facility_id OR NEW.doctor_person_id<>parent.doctor_person_id OR NEW.timezone_name<>parent.timezone_name THEN
    RAISE EXCEPTION 'exception schedule scope mismatch' USING ERRCODE='23514';
  END IF;
  IF NEW.exception_type='delay' AND NEW.delay_minutes IS NULL THEN RAISE EXCEPTION 'delay_minutes required' USING ERRCODE='23514'; END IF;
  NEW.updated_at=statement_timestamp();
  RETURN NEW;
END $$;
CREATE TRIGGER schedule_exceptions_scope_guard BEFORE INSERT OR UPDATE ON clinical.schedule_exceptions FOR EACH ROW EXECUTE FUNCTION clinical.exception_scope_guard_v1();

CREATE OR REPLACE FUNCTION clinical.appointment_transition_guard_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,clinical AS $$
DECLARE internal_transition text := current_setting('shifaa.clinic_internal_transition',true);
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'confirmed' THEN RAISE EXCEPTION 'Feature 009 create produces confirmed only' USING ERRCODE='42501'; END IF;
  ELSE
    IF NEW.payment_method<>'cash_on_arrival' THEN RAISE EXCEPTION 'cash_on_arrival is the only payment method' USING ERRCODE='23514'; END IF;
    IF internal_transition<>'allowed' AND NOT ((OLD.status='confirmed' AND NEW.status IN ('checked_in','cancelled','reschedule_required')) OR (OLD.status='reschedule_required' AND NEW.status IN ('confirmed','cancelled'))) THEN
      RAISE EXCEPTION 'invalid Feature 009 appointment transition' USING ERRCODE='42501';
    END IF;
    NEW.version=OLD.version+1;
  END IF;
  NEW.updated_at=statement_timestamp();
  RETURN NEW;
END $$;
CREATE TRIGGER appointments_transition_guard BEFORE INSERT OR UPDATE ON clinical.appointments FOR EACH ROW EXECUTE FUNCTION clinical.appointment_transition_guard_v1();

CREATE OR REPLACE FUNCTION clinical.queue_scope_guard_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,clinical AS $$
DECLARE appointment clinical.appointments%ROWTYPE; scope clinical.queue_scopes%ROWTYPE; internal_transition text := current_setting('shifaa.clinic_internal_transition',true);
BEGIN
  SELECT * INTO scope FROM clinical.queue_scopes WHERE id=NEW.queue_scope_id;
  SELECT * INTO appointment FROM clinical.appointments WHERE id=NEW.appointment_id;
  IF NOT FOUND OR NEW.facility_id<>scope.facility_id OR NEW.doctor_person_id<>scope.doctor_person_id OR NEW.civil_date<>scope.civil_date OR NEW.facility_id<>appointment.facility_id OR NEW.doctor_person_id<>appointment.doctor_person_id OR NEW.civil_date<>appointment.civil_date THEN
    RAISE EXCEPTION 'queue scope mismatch' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' AND NEW.state<>'waiting' THEN RAISE EXCEPTION 'check-in produces waiting only' USING ERRCODE='42501'; END IF;
  IF TG_OP='UPDATE' AND internal_transition<>'allowed' AND NOT ((OLD.state='waiting' AND NEW.state='called') OR (OLD.state='called' AND NEW.state='completed')) THEN
    RAISE EXCEPTION 'invalid Feature 009 queue transition' USING ERRCODE='42501';
  END IF;
  IF TG_OP='UPDATE' THEN NEW.version=OLD.version+1; END IF;
  NEW.updated_at=statement_timestamp();
  RETURN NEW;
END $$;
CREATE TRIGGER queue_entries_guard BEFORE INSERT OR UPDATE ON clinical.queue_entries FOR EACH ROW EXECUTE FUNCTION clinical.queue_scope_guard_v1();

-- The API role receives no direct table DML.  Domain writes must use the
-- non-owner API functions added in this migration/later adapters.
ALTER TABLE clinical.schedules ENABLE ROW LEVEL SECURITY; ALTER TABLE clinical.schedules FORCE ROW LEVEL SECURITY;
ALTER TABLE clinical.schedule_windows ENABLE ROW LEVEL SECURITY; ALTER TABLE clinical.schedule_windows FORCE ROW LEVEL SECURITY;
ALTER TABLE clinical.schedule_exceptions ENABLE ROW LEVEL SECURITY; ALTER TABLE clinical.schedule_exceptions FORCE ROW LEVEL SECURITY;
ALTER TABLE clinical.appointments ENABLE ROW LEVEL SECURITY; ALTER TABLE clinical.appointments FORCE ROW LEVEL SECURITY;
ALTER TABLE clinical.queue_scopes ENABLE ROW LEVEL SECURITY; ALTER TABLE clinical.queue_scopes FORCE ROW LEVEL SECURITY;
ALTER TABLE clinical.queue_entries ENABLE ROW LEVEL SECURITY; ALTER TABLE clinical.queue_entries FORCE ROW LEVEL SECURITY;
REVOKE ALL ON clinical.schedules,clinical.schedule_windows,clinical.schedule_exceptions,clinical.appointments,clinical.queue_scopes,clinical.queue_entries FROM PUBLIC,shifaa_api,shifaa_worker;
DO $service_role_table_guard$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    EXECUTE 'REVOKE ALL ON clinical.schedules,clinical.schedule_windows,clinical.schedule_exceptions,clinical.appointments,clinical.queue_scopes,clinical.queue_entries FROM service_role';
  END IF;
END
$service_role_table_guard$;
GRANT USAGE ON SCHEMA clinical TO shifaa_api;

-- Minimum subject read helpers are SECURITY DEFINER with an empty effective
-- application search path and return no reason/contact/private scope fields.
CREATE OR REPLACE FUNCTION clinical.read_my_appointment_v1(p_appointment_id uuid)
RETURNS TABLE(id uuid,starts_at timestamptz,ends_at timestamptz,status text,version integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT a.id,a.starts_at,a.ends_at,a.status,a.version
  FROM clinical.appointments a
  WHERE a.id=p_appointment_id AND (a.patient_person_id=platform.context_person_id() OR EXISTS (
    SELECT 1 FROM identity.patients p
    WHERE p.person_id=a.patient_person_id AND platform.person_has_family_relationship(p.id,platform.context_person_id(),'appointment.manage')
  ))
$$;
CREATE OR REPLACE FUNCTION clinical.read_my_queue_position_v1(p_appointment_id uuid)
RETURNS TABLE(queue_number bigint,waiting_order integer,state text,estimated_service_at timestamptz,version integer,updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT q.queue_number,q.waiting_order,q.state,q.estimated_service_at,q.version,q.updated_at
  FROM clinical.queue_entries q WHERE q.appointment_id=p_appointment_id AND EXISTS (SELECT 1 FROM clinical.appointments a WHERE a.id=q.appointment_id AND (a.patient_person_id=platform.context_person_id() OR EXISTS (SELECT 1 FROM identity.patients p WHERE p.person_id=a.patient_person_id AND platform.person_has_family_relationship(p.id,platform.context_person_id(),'appointment.manage'))))
$$;
REVOKE ALL ON FUNCTION clinical.read_my_appointment_v1(uuid),clinical.read_my_queue_position_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION clinical.read_my_appointment_v1(uuid),clinical.read_my_queue_position_v1(uuid) TO shifaa_api;

-- Every privileged entry point resolves the live actor facts again.  The
-- caller cannot smuggle a facility, doctor, date, action, or purpose through
-- a stale token: the current membership, licensed doctor, AAL, and purpose
-- are checked inside the SECURITY DEFINER boundary.
CREATE OR REPLACE FUNCTION clinical.assert_current_staff_scope_v1(
  p_facility_id uuid,p_doctor_person_id uuid,p_civil_date date,p_action text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := platform.context_person_id(); allowed boolean;
BEGIN
  IF actor IS NULL OR p_facility_id IS NULL OR p_doctor_person_id IS NULL OR p_civil_date IS NULL
     OR p_action IS NULL OR platform.context_action() IS NULL
     OR platform.context_action() NOT IN ('clinic.scheduling','schedule.manage','appointment.manage','queue.manage','delay.manage','absence.manage')
     OR (platform.context_action() IS DISTINCT FROM 'clinic.scheduling' AND platform.context_action() IS DISTINCT FROM p_action)
     OR platform.context_aal()<1
     OR NOT (platform.context_purposes() && ARRAY['appointment.scheduling','queue.operation','appointment.discovery','scoped.notification']::text[])
  THEN RAISE EXCEPTION 'current clinic authorization facts are required' USING ERRCODE='42501'; END IF;
  SELECT EXISTS(
    SELECT 1
    FROM identity.facilities f
    JOIN identity.facility_memberships m ON m.facility_id=f.id
    JOIN identity.professional_licenses license ON license.person_id=p_doctor_person_id
      AND license.profession='doctor' AND license.status='verified' AND license.expires_on>=p_civil_date
    JOIN identity.facility_memberships doctor_membership ON doctor_membership.facility_id=f.id
      AND doctor_membership.person_id=p_doctor_person_id AND doctor_membership.role_code='doctor'
      AND doctor_membership.employment_license_id=license.id AND doctor_membership.membership_status='active'
      AND doctor_membership.valid_from<=platform.context_now()
      AND (doctor_membership.valid_until IS NULL OR doctor_membership.valid_until>platform.context_now())
    WHERE f.id=p_facility_id AND f.facility_status='active'
      AND m.person_id=actor AND m.membership_status='active'
      AND m.valid_from<=platform.context_now()
      AND (m.valid_until IS NULL OR m.valid_until>platform.context_now())
  ) INTO allowed;
  IF NOT allowed THEN RAISE EXCEPTION 'clinic facility, membership, or licence scope denied' USING ERRCODE='42501'; END IF;
END $$;

CREATE OR REPLACE FUNCTION clinical.assert_current_patient_scope_v1(p_patient_person_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := platform.context_person_id(); patient_id uuid;
BEGIN
  SELECT p.id INTO patient_id FROM identity.patients p WHERE p.person_id=p_patient_person_id AND p.record_status='active';
  IF actor IS NULL OR patient_id IS NULL
     OR platform.context_action() NOT IN ('clinic.scheduling','appointment.manage')
     OR platform.context_aal()<1
     OR NOT ('appointment.scheduling'=ANY(platform.context_purposes()))
     OR NOT (platform.person_is_patient_self(patient_id,actor) OR platform.person_has_family_relationship(patient_id,actor,'appointment.manage'))
  THEN RAISE EXCEPTION 'current patient relationship is required' USING ERRCODE='42501'; END IF;
END $$;

-- Failure injection is synthetic-only and exists solely to prove that each
-- operation rolls back its domain, audit, outbox, and idempotency effects as
-- one transaction. It is unreachable in production contexts.
CREATE OR REPLACE FUNCTION clinical.maybe_inject_failure_v1(p_operation text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF current_setting('shifaa.environment',true) IN ('local','ci')
     AND current_setting('shifaa.test_fail_operation',true)=p_operation
  THEN RAISE EXCEPTION 'synthetic injected failure for %',p_operation USING ERRCODE='P0001'; END IF;
END $$;

REVOKE ALL ON FUNCTION clinical.assert_current_staff_scope_v1(uuid,uuid,date,text),clinical.assert_current_patient_scope_v1(uuid),clinical.maybe_inject_failure_v1(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION clinical.assert_current_staff_scope_v1(uuid,uuid,date,text),clinical.assert_current_patient_scope_v1(uuid) TO shifaa_api;

-- Policies remain defense in depth for any explicitly granted projection; the
-- API still has no direct clinical table privileges and must use the narrow
-- functions above or the minimum subject helpers.
DROP POLICY IF EXISTS clinical_schedules_current_member ON clinical.schedules;
CREATE POLICY clinical_schedules_current_member ON clinical.schedules FOR SELECT TO shifaa_api USING (
  created_by_person_id=platform.context_person_id()
  OR EXISTS (SELECT 1 FROM identity.facility_memberships m WHERE m.facility_id=facility_id AND m.person_id=platform.context_person_id() AND m.membership_status='active' AND m.valid_from<=platform.context_now() AND (m.valid_until IS NULL OR m.valid_until>platform.context_now()))
);
DROP POLICY IF EXISTS clinical_appointments_subject_or_member ON clinical.appointments;
CREATE POLICY clinical_appointments_subject_or_member ON clinical.appointments FOR SELECT TO shifaa_api USING (
  patient_person_id=platform.context_person_id()
  OR EXISTS (SELECT 1 FROM identity.patients p WHERE p.person_id=patient_person_id AND platform.person_has_family_relationship(p.id,platform.context_person_id(),'appointment.manage'))
);
DROP POLICY IF EXISTS clinical_queue_entries_subject_or_member ON clinical.queue_entries;
CREATE POLICY clinical_queue_entries_subject_or_member ON clinical.queue_entries FOR SELECT TO shifaa_api USING (
  EXISTS (SELECT 1 FROM clinical.appointments a WHERE a.id=appointment_id AND (a.patient_person_id=platform.context_person_id() OR EXISTS (SELECT 1 FROM identity.patients p WHERE p.person_id=a.patient_person_id AND platform.person_has_family_relationship(p.id,platform.context_person_id(),'appointment.manage'))))
);

-- Fixed-shape database entry points.  Adapters may compose these functions in
-- a transaction; callers cannot write clinical tables directly.
CREATE OR REPLACE FUNCTION clinical.create_schedule_v1(p_input jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE schedule_id uuid; actor uuid := platform.context_person_id(); idem_id uuid; idem_new boolean; idem_response jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'authenticated actor required' USING ERRCODE='42501'; END IF;
  PERFORM clinical.assert_current_staff_scope_v1((p_input->>'facility_id')::uuid,(p_input->>'doctor_person_id')::uuid,(p_input->>'valid_from')::date,'schedule.manage');
  IF p_input ? 'idempotency_key' THEN
    SELECT record_id,is_new,response_body INTO idem_id,idem_new,idem_response
      FROM clinical.claim_idempotency_v1('POST','/v1/clinic/schedules',p_input->>'idempotency_key',p_input->>'request_hash');
    IF NOT idem_new THEN RETURN (idem_response->>'resource_id')::uuid; END IF;
  END IF;
  INSERT INTO clinical.schedules(facility_id,doctor_person_id,timezone_name,valid_from,valid_to,slot_duration_minutes,status,created_by_person_id,updated_by_person_id)
  VALUES ((p_input->>'facility_id')::uuid,(p_input->>'doctor_person_id')::uuid,p_input->>'timezone_name',(p_input->>'valid_from')::date,(p_input->>'valid_to')::date,COALESCE((p_input->>'slot_duration_minutes')::smallint,30),'active',actor,actor)
  RETURNING id INTO schedule_id;
  PERFORM clinical.record_mutation_effect_v1('clinical.schedule.changed.v1','schedule.created','schedule',schedule_id,1,(p_input->>'facility_id')::uuid);
  PERFORM clinical.maybe_inject_failure_v1('create_schedule');
  IF idem_id IS NOT NULL THEN
    UPDATE platform.idempotency_records SET state='completed',response_status=201,response_headers='{"cache-control":"private, no-store"}'::jsonb,
      response_body=pg_catalog.jsonb_build_object('resource_id',schedule_id),resource_type='schedule',resource_id=schedule_id,updated_at=platform.context_now()
      WHERE id=idem_id;
  END IF;
  RETURN schedule_id;
END $$;

CREATE OR REPLACE FUNCTION clinical.update_schedule_v1(p_schedule_id uuid,p_expected_version integer,p_input jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE schedule_id uuid; actor uuid := platform.context_person_id();
BEGIN
  IF p_input ? 'doctor_id' OR p_input ? 'doctorId' THEN
    RAISE EXCEPTION 'doctor reassignment is not supported' USING ERRCODE='22023';
  END IF;
  IF actor IS NULL THEN RAISE EXCEPTION 'authenticated actor required' USING ERRCODE='42501'; END IF;
  PERFORM clinical.assert_current_staff_scope_v1((SELECT facility_id FROM clinical.schedules WHERE id=p_schedule_id),(SELECT doctor_person_id FROM clinical.schedules WHERE id=p_schedule_id),COALESCE((p_input->>'valid_from')::date,(SELECT valid_from FROM clinical.schedules WHERE id=p_schedule_id)),'schedule.manage');
  UPDATE clinical.schedules
  SET timezone_name=COALESCE(p_input->>'timezone_name',timezone_name),
      valid_from=COALESCE((p_input->>'valid_from')::date,valid_from),
      valid_to=COALESCE((p_input->>'valid_to')::date,valid_to),
      slot_duration_minutes=COALESCE((p_input->>'slot_duration_minutes')::smallint,slot_duration_minutes),
      status=COALESCE(p_input->>'status',status),
      updated_by_person_id=actor
  WHERE id=p_schedule_id AND version=p_expected_version
  RETURNING id INTO schedule_id;
  IF schedule_id IS NULL THEN RAISE EXCEPTION 'schedule is stale or missing' USING ERRCODE='40001'; END IF;
  PERFORM clinical.record_mutation_effect_v1('clinical.schedule.changed.v1','schedule.updated','schedule',schedule_id,p_expected_version+1,NULL,NULL,NULL);
  PERFORM clinical.maybe_inject_failure_v1('update_schedule');
  RETURN schedule_id;
END $$;

CREATE OR REPLACE FUNCTION clinical.create_schedule_exception_v1(p_input jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE schedule_row clinical.schedules%ROWTYPE; exception_id uuid; exception_type text;
BEGIN
  IF p_input IS NULL OR (p_input->>'schedule_id') IS NULL OR (p_input->>'civil_date')::date IS NULL
     OR (p_input->>'starts_at')::timestamptz IS NULL OR (p_input->>'ends_at')::timestamptz IS NULL
     OR (p_input->>'reason') IS NULL OR octet_length(p_input->>'reason') NOT BETWEEN 1 AND 512
  THEN RAISE EXCEPTION 'invalid schedule exception request' USING ERRCODE='22023'; END IF;
  exception_type := p_input->>'exception_type';
  IF exception_type NOT IN ('blocked','added') THEN
    RAISE EXCEPTION 'ordinary exception type is invalid' USING ERRCODE='22023';
  END IF;
  SELECT * INTO schedule_row FROM clinical.schedules WHERE id=(p_input->>'schedule_id')::uuid FOR SHARE;
  IF NOT FOUND OR schedule_row.status<>'active'
     OR NOT ((p_input->>'civil_date')::date <@ schedule_row.valid_dates)
     OR (p_input->>'ends_at')::timestamptz <= (p_input->>'starts_at')::timestamptz
     OR ((p_input->>'starts_at')::timestamptz AT TIME ZONE schedule_row.timezone_name)::date IS DISTINCT FROM (p_input->>'civil_date')::date
  THEN RAISE EXCEPTION 'schedule exception scope denied' USING ERRCODE='42501'; END IF;
  PERFORM clinical.assert_current_staff_scope_v1(schedule_row.facility_id,schedule_row.doctor_person_id,(p_input->>'civil_date')::date,'schedule.manage');
  INSERT INTO clinical.schedule_exceptions(
    schedule_id,facility_id,doctor_person_id,timezone_name,civil_date,starts_at,ends_at,exception_type,reason,created_by_person_id,updated_by_person_id
  ) VALUES (
    schedule_row.id,schedule_row.facility_id,schedule_row.doctor_person_id,schedule_row.timezone_name,(p_input->>'civil_date')::date,
    (p_input->>'starts_at')::timestamptz,(p_input->>'ends_at')::timestamptz,exception_type,p_input->>'reason',platform.context_person_id(),platform.context_person_id()
  ) RETURNING id INTO exception_id;
  PERFORM clinical.record_mutation_effect_v1('clinical.schedule.changed.v1','schedule.exception.created','schedule_exception',exception_id,1,schedule_row.facility_id);
  PERFORM clinical.maybe_inject_failure_v1('create_schedule_exception');
  RETURN exception_id;
END $$;

CREATE OR REPLACE FUNCTION clinical.create_appointment_v1(p_input jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE appointment_id uuid; actor uuid := platform.context_person_id(); patient uuid := (p_input->>'patient_person_id')::uuid;
  schedule_row clinical.schedules%ROWTYPE; starts_at_value timestamptz := (p_input->>'starts_at')::timestamptz; ends_at_value timestamptz := (p_input->>'ends_at')::timestamptz;
BEGIN
  IF p_input IS NULL OR patient IS NULL OR (p_input->>'facility_id') IS NULL OR (p_input->>'doctor_person_id') IS NULL OR (p_input->>'schedule_id') IS NULL
     OR starts_at_value IS NULL OR ends_at_value IS NULL OR ends_at_value<=starts_at_value
     OR (p_input->>'civil_date')::date IS NULL OR (p_input->>'local_start')::time IS NULL
  THEN RAISE EXCEPTION 'invalid appointment request' USING ERRCODE='22023'; END IF;
  PERFORM clinical.assert_current_patient_scope_v1(patient);
  SELECT * INTO schedule_row FROM clinical.schedules WHERE id=(p_input->>'schedule_id')::uuid FOR SHARE;
  IF NOT FOUND OR schedule_row.status<>'active'
     OR schedule_row.facility_id IS DISTINCT FROM (p_input->>'facility_id')::uuid
     OR schedule_row.doctor_person_id IS DISTINCT FROM (p_input->>'doctor_person_id')::uuid
     OR NOT ((p_input->>'civil_date')::date <@ schedule_row.valid_dates)
     OR (starts_at_value AT TIME ZONE schedule_row.timezone_name)::date IS DISTINCT FROM (p_input->>'civil_date')::date
     OR (starts_at_value AT TIME ZONE schedule_row.timezone_name)::time IS DISTINCT FROM (p_input->>'local_start')::time
  THEN RAISE EXCEPTION 'appointment schedule scope denied' USING ERRCODE='42501'; END IF;
  INSERT INTO clinical.appointments(
    patient_person_id,facility_id,doctor_person_id,schedule_id,starts_at,ends_at,timezone_name,civil_date,local_start,
    fee_minor_units,currency_code,payment_method,status,created_by_person_id,updated_by_person_id
  ) VALUES (
    patient,(p_input->>'facility_id')::uuid,(p_input->>'doctor_person_id')::uuid,(p_input->>'schedule_id')::uuid,
    (p_input->>'starts_at')::timestamptz,(p_input->>'ends_at')::timestamptz,(p_input->>'timezone_name'),
    (p_input->>'civil_date')::date,(p_input->>'local_start')::time,
    (p_input->>'fee_minor_units')::bigint,(p_input->>'currency_code'),'cash_on_arrival','confirmed',actor,actor
  ) RETURNING id INTO appointment_id;
  PERFORM clinical.record_mutation_effect_v1('clinical.appointment.changed.v1','appointment.created','appointment',appointment_id,1,(p_input->>'facility_id')::uuid,patient);
  PERFORM clinical.maybe_inject_failure_v1('create_appointment');
  RETURN appointment_id;
END $$;

CREATE OR REPLACE FUNCTION clinical.reschedule_appointment_v1(
  p_appointment_id uuid,p_expected_version integer,p_starts_at timestamptz,p_ends_at timestamptz,
  p_civil_date date,p_local_start time,p_reason text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE appointment_id uuid; actor uuid := platform.context_person_id();
  original clinical.appointments%ROWTYPE; schedule_row clinical.schedules%ROWTYPE;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'authenticated actor required' USING ERRCODE='42501'; END IF;
  IF p_reason IS NULL OR char_length(p_reason) NOT BETWEEN 1 AND 500 OR p_reason ~ E'[\\r\\n\\t]' THEN
    RAISE EXCEPTION 'invalid reschedule reason' USING ERRCODE='22023';
  END IF;
  SELECT * INTO original FROM clinical.appointments WHERE id=p_appointment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'appointment is stale, unauthorized, or not reschedulable' USING ERRCODE='40001'; END IF;
  PERFORM clinical.assert_current_patient_scope_v1(original.patient_person_id);
  SELECT * INTO schedule_row FROM clinical.schedules WHERE id=original.schedule_id FOR SHARE;
  IF NOT FOUND OR schedule_row.status<>'active'
     OR NOT (p_civil_date <@ schedule_row.valid_dates)
     OR (p_starts_at AT TIME ZONE schedule_row.timezone_name)::date IS DISTINCT FROM p_civil_date
     OR (p_starts_at AT TIME ZONE schedule_row.timezone_name)::time IS DISTINCT FROM p_local_start
     OR p_ends_at<=p_starts_at
  THEN RAISE EXCEPTION 'appointment replacement scope denied' USING ERRCODE='42501'; END IF;
  PERFORM pg_catalog.set_config('shifaa.clinic_internal_transition','allowed',true);
  UPDATE clinical.appointments
  SET starts_at=p_starts_at,ends_at=p_ends_at,civil_date=p_civil_date,local_start=p_local_start,
      reschedule_reason=p_reason,
      status='confirmed',updated_by_person_id=actor
  WHERE id=p_appointment_id AND version=p_expected_version
    AND patient_person_id=actor AND status IN ('confirmed','reschedule_required')
    AND (status='reschedule_required' OR starts_at>platform.context_now());
  IF NOT FOUND THEN RAISE EXCEPTION 'appointment is stale, unauthorized, or not reschedulable' USING ERRCODE='40001'; END IF;
  SELECT id INTO appointment_id FROM clinical.appointments WHERE id=p_appointment_id;
  PERFORM clinical.record_mutation_effect_v1('clinical.appointment.changed.v1','appointment.rescheduled','appointment',appointment_id,p_expected_version+1,NULL,actor);
  PERFORM clinical.maybe_inject_failure_v1('reschedule_appointment');
  RETURN appointment_id;
END $$;

CREATE OR REPLACE FUNCTION clinical.list_availability_v1(p_schedule_id uuid,p_civil_date date)
RETURNS TABLE(starts_at timestamptz,ends_at timestamptz,timezone_name text,civil_date date,local_start time,delay_minutes integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  WITH schedule AS (
    SELECT s.* FROM clinical.schedules s WHERE s.id=p_schedule_id AND s.status='active' AND p_civil_date <@ s.valid_dates
  ), candidates AS (
    SELECT schedule.timezone_name,schedule.slot_duration_minutes,
      (p_civil_date::timestamp + (w.start_second + step)::double precision * interval '1 second') AS local_start_ts
    FROM schedule JOIN clinical.schedule_windows w ON w.schedule_id=schedule.id
    CROSS JOIN LATERAL generate_series(0,w.end_second-w.start_second-schedule.slot_duration_minutes*60,schedule.slot_duration_minutes*60) AS series(step)
    WHERE w.iso_weekday=extract(isodow FROM p_civil_date)::smallint
  ), resolved AS (
    SELECT candidates.*, make_timestamptz(extract(year FROM local_start_ts)::integer,extract(month FROM local_start_ts)::integer,extract(day FROM local_start_ts)::integer,extract(hour FROM local_start_ts)::integer,extract(minute FROM local_start_ts)::integer,extract(second FROM local_start_ts),timezone_name) AS start_utc_raw
    FROM candidates
  ), slots AS (
    SELECT CASE WHEN ((resolved.start_utc_raw - interval '1 hour') AT TIME ZONE resolved.timezone_name)=resolved.local_start_ts THEN resolved.start_utc_raw - interval '1 hour' ELSE resolved.start_utc_raw END AS start_utc,
      (CASE WHEN ((resolved.start_utc_raw - interval '1 hour') AT TIME ZONE resolved.timezone_name)=resolved.local_start_ts THEN resolved.start_utc_raw - interval '1 hour' ELSE resolved.start_utc_raw END + resolved.slot_duration_minutes * interval '1 minute') AS end_utc,resolved.timezone_name,p_civil_date,resolved.local_start_ts::time AS local_start
    FROM resolved
    WHERE (resolved.start_utc_raw AT TIME ZONE resolved.timezone_name)=resolved.local_start_ts
      AND NOT EXISTS (SELECT 1 FROM clinical.schedule_exceptions e WHERE e.schedule_id=p_schedule_id AND e.civil_date=p_civil_date AND e.exception_type IN ('absence','blocked') AND e.superseded_at IS NULL AND e.effective_range && tstzrange(CASE WHEN ((resolved.start_utc_raw - interval '1 hour') AT TIME ZONE resolved.timezone_name)=resolved.local_start_ts THEN resolved.start_utc_raw - interval '1 hour' ELSE resolved.start_utc_raw END,CASE WHEN ((resolved.start_utc_raw - interval '1 hour') AT TIME ZONE resolved.timezone_name)=resolved.local_start_ts THEN resolved.start_utc_raw - interval '1 hour' ELSE resolved.start_utc_raw END + resolved.slot_duration_minutes * interval '1 minute','[)'))
      AND NOT EXISTS (SELECT 1 FROM clinical.appointments a WHERE a.doctor_person_id=(SELECT doctor_person_id FROM schedule) AND a.occupied_range && tstzrange(CASE WHEN ((resolved.start_utc_raw - interval '1 hour') AT TIME ZONE resolved.timezone_name)=resolved.local_start_ts THEN resolved.start_utc_raw - interval '1 hour' ELSE resolved.start_utc_raw END,CASE WHEN ((resolved.start_utc_raw - interval '1 hour') AT TIME ZONE resolved.timezone_name)=resolved.local_start_ts THEN resolved.start_utc_raw - interval '1 hour' ELSE resolved.start_utc_raw END + resolved.slot_duration_minutes * interval '1 minute','[)') AND a.status IN ('confirmed','checked_in','in_queue','in_consultation'))
  ), added AS (
    SELECT e.starts_at,e.ends_at,e.timezone_name,e.civil_date,(e.starts_at AT TIME ZONE e.timezone_name)::time AS local_start
    FROM clinical.schedule_exceptions e WHERE e.schedule_id=p_schedule_id AND e.civil_date=p_civil_date AND e.exception_type='added' AND e.superseded_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM clinical.schedule_exceptions blocker WHERE blocker.schedule_id=e.schedule_id AND blocker.civil_date=e.civil_date AND blocker.exception_type IN ('absence','blocked') AND blocker.superseded_at IS NULL AND blocker.effective_range && e.effective_range)
      AND NOT EXISTS (SELECT 1 FROM clinical.appointments a WHERE a.doctor_person_id=(SELECT doctor_person_id FROM schedule) AND a.occupied_range && e.effective_range AND a.status IN ('confirmed','checked_in','in_queue','in_consultation'))
  ), effective AS (
    SELECT start_utc AS starts_at,end_utc AS ends_at,timezone_name,p_civil_date AS civil_date,local_start FROM slots
    UNION ALL SELECT starts_at,ends_at,timezone_name,civil_date,local_start FROM added
  )
  SELECT effective.starts_at,effective.ends_at,effective.timezone_name,effective.civil_date,effective.local_start,
    (SELECT e.delay_minutes FROM clinical.schedule_exceptions e WHERE e.schedule_id=p_schedule_id AND e.civil_date=p_civil_date AND e.exception_type='delay' AND e.superseded_at IS NULL ORDER BY e.created_at DESC LIMIT 1)
  FROM effective ORDER BY effective.starts_at
$$;

CREATE OR REPLACE FUNCTION clinical.cancel_appointment_v1(p_appointment_id uuid,p_expected_version integer,p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE appointment_id uuid;
BEGIN
  PERFORM clinical.assert_current_patient_scope_v1((SELECT a.patient_person_id FROM clinical.appointments a WHERE a.id=p_appointment_id));
  PERFORM pg_catalog.set_config('shifaa.clinic_internal_transition','allowed',true);
  UPDATE clinical.appointments SET status='cancelled',cancellation_reason=p_reason,cancelled_by_person_id=platform.context_person_id(),cancelled_at=statement_timestamp(),updated_by_person_id=platform.context_person_id()
  WHERE id=p_appointment_id AND version=p_expected_version AND status IN ('confirmed','reschedule_required') AND (starts_at>platform.context_now() OR status='reschedule_required')
  RETURNING id INTO appointment_id;
  IF appointment_id IS NULL THEN RAISE EXCEPTION 'appointment not cancellable or stale' USING ERRCODE='40001'; END IF;
  PERFORM clinical.record_mutation_effect_v1('clinical.appointment.changed.v1','appointment.cancelled','appointment',appointment_id,p_expected_version+1,NULL,platform.context_person_id(),'cancelled');
  PERFORM clinical.maybe_inject_failure_v1('cancel_appointment');
  RETURN appointment_id;
END $$;

CREATE OR REPLACE FUNCTION clinical.check_in_appointment_v1(p_appointment_id uuid,p_expected_version integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE appointment clinical.appointments%ROWTYPE; scope_id uuid; number_value bigint; entry_id uuid;
BEGIN
  SELECT * INTO appointment FROM clinical.appointments WHERE id=p_appointment_id AND version=p_expected_version FOR UPDATE;
  IF NOT FOUND OR appointment.status<>'confirmed' THEN RAISE EXCEPTION 'appointment is not check-in eligible' USING ERRCODE='40001'; END IF;
  IF platform.context_person_id() IS DISTINCT FROM appointment.patient_person_id THEN
    PERFORM clinical.assert_current_staff_scope_v1(appointment.facility_id,appointment.doctor_person_id,appointment.civil_date,'appointment.manage');
  ELSE
    PERFORM clinical.assert_current_patient_scope_v1(appointment.patient_person_id);
  END IF;
  INSERT INTO clinical.queue_scopes(facility_id,doctor_person_id,civil_date,timezone_name) VALUES(appointment.facility_id,appointment.doctor_person_id,appointment.civil_date,appointment.timezone_name)
    ON CONFLICT(facility_id,doctor_person_id,civil_date) DO NOTHING;
  SELECT id,next_queue_number INTO scope_id,number_value FROM clinical.queue_scopes WHERE facility_id=appointment.facility_id AND doctor_person_id=appointment.doctor_person_id AND civil_date=appointment.civil_date FOR UPDATE;
  UPDATE clinical.queue_scopes SET next_queue_number=next_queue_number+1,version=version+1 WHERE id=scope_id;
  PERFORM pg_catalog.set_config('shifaa.clinic_internal_transition','allowed',true);
  INSERT INTO clinical.queue_entries(queue_scope_id,appointment_id,facility_id,doctor_person_id,civil_date,queue_number,waiting_order,state) VALUES(scope_id,appointment.id,appointment.facility_id,appointment.doctor_person_id,appointment.civil_date,number_value,(SELECT count(*)::integer+1 FROM clinical.queue_entries WHERE queue_scope_id=scope_id AND state='waiting'),'waiting') RETURNING id INTO entry_id;
  UPDATE clinical.appointments SET status='checked_in',updated_by_person_id=platform.context_person_id() WHERE id=appointment.id;
  PERFORM clinical.record_mutation_effect_v1('clinical.appointment.changed.v1','appointment.checked_in','appointment',appointment.id,appointment.version+1,appointment.facility_id,appointment.patient_person_id);
  PERFORM clinical.record_mutation_effect_v1('clinical.queue.changed.v1','queue.entry.created','queue_entry',entry_id,1,appointment.facility_id,appointment.patient_person_id);
  PERFORM clinical.maybe_inject_failure_v1('check_in_appointment');
  RETURN entry_id;
END $$;

CREATE OR REPLACE FUNCTION clinical.call_queue_entry_v1(p_entry_id uuid,p_expected_version integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result_id uuid;
BEGIN
  PERFORM clinical.assert_current_staff_scope_v1((SELECT q.facility_id FROM clinical.queue_entries q WHERE q.id=p_entry_id),(SELECT q.doctor_person_id FROM clinical.queue_entries q WHERE q.id=p_entry_id),(SELECT q.civil_date FROM clinical.queue_entries q WHERE q.id=p_entry_id),'queue.manage');
  PERFORM pg_catalog.set_config('shifaa.clinic_internal_transition','allowed',true);
  UPDATE clinical.queue_entries SET state='called',waiting_order=NULL,called_at=statement_timestamp() WHERE id=p_entry_id AND version=p_expected_version AND state='waiting' RETURNING id INTO result_id;
  IF result_id IS NULL THEN RAISE EXCEPTION 'queue entry is not callable or stale' USING ERRCODE='40001'; END IF;
  PERFORM clinical.record_mutation_effect_v1('clinical.queue.changed.v1','queue.entry.called','queue_entry',result_id,p_expected_version+1);
  PERFORM clinical.maybe_inject_failure_v1('call_queue_entry');
  RETURN result_id;
END $$;

CREATE OR REPLACE FUNCTION clinical.complete_queue_entry_v1(p_entry_id uuid,p_expected_version integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result_id uuid;
BEGIN
  PERFORM clinical.assert_current_staff_scope_v1((SELECT q.facility_id FROM clinical.queue_entries q WHERE q.id=p_entry_id),(SELECT q.doctor_person_id FROM clinical.queue_entries q WHERE q.id=p_entry_id),(SELECT q.civil_date FROM clinical.queue_entries q WHERE q.id=p_entry_id),'queue.manage');
  PERFORM pg_catalog.set_config('shifaa.clinic_internal_transition','allowed',true);
  UPDATE clinical.queue_entries SET state='completed',completed_at=statement_timestamp() WHERE id=p_entry_id AND version=p_expected_version AND state='called' RETURNING id INTO result_id;
  IF result_id IS NULL THEN RAISE EXCEPTION 'queue entry is not completable or stale' USING ERRCODE='40001'; END IF;
  PERFORM clinical.record_mutation_effect_v1('clinical.queue.changed.v1','queue.entry.completed','queue_entry',result_id,p_expected_version+1);
  PERFORM clinical.maybe_inject_failure_v1('complete_queue_entry');
  RETURN result_id;
END $$;

CREATE OR REPLACE FUNCTION clinical.reorder_queue_entry_v1(p_entry_id uuid,p_expected_version integer,p_target_position integer,p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result_id uuid; scope_id uuid; old_position integer; max_position integer; row_item record; next_position integer := 1; resulting_version integer;
BEGIN
  IF p_target_position IS NULL OR p_target_position<1 OR p_reason IS NULL OR octet_length(p_reason) NOT BETWEEN 1 AND 512 THEN RAISE EXCEPTION 'invalid reorder request' USING ERRCODE='22023'; END IF;
  PERFORM clinical.assert_current_staff_scope_v1((SELECT q.facility_id FROM clinical.queue_entries q WHERE q.id=p_entry_id),(SELECT q.doctor_person_id FROM clinical.queue_entries q WHERE q.id=p_entry_id),(SELECT q.civil_date FROM clinical.queue_entries q WHERE q.id=p_entry_id),'queue.manage');
  PERFORM pg_catalog.set_config('shifaa.clinic_internal_transition','allowed',true);
  SELECT q.id,q.queue_scope_id,q.waiting_order INTO result_id,scope_id,old_position
  FROM clinical.queue_entries q WHERE q.id=p_entry_id AND q.version=p_expected_version AND q.state='waiting' FOR UPDATE;
  IF result_id IS NULL THEN RAISE EXCEPTION 'queue entry is not reorderable or stale' USING ERRCODE='40001'; END IF;
  PERFORM 1 FROM clinical.queue_scopes WHERE id=scope_id FOR UPDATE;
  SELECT count(*)::integer INTO max_position FROM clinical.queue_entries q WHERE q.queue_scope_id=scope_id AND q.state='waiting';
  IF p_target_position>max_position THEN RAISE EXCEPTION 'target position is outside waiting queue' USING ERRCODE='22023'; END IF;
  -- Move all waiting rows through a temporary, non-colliding range before
  -- assigning their final contiguous order.  This makes the reorder one
  -- atomic scope operation even when the target position is occupied.
  UPDATE clinical.queue_entries q SET waiting_order=1000000000+q.waiting_order
   WHERE q.queue_scope_id=scope_id AND q.state='waiting';
  FOR row_item IN
    SELECT q.id FROM clinical.queue_entries q
    WHERE q.queue_scope_id=scope_id AND q.state='waiting' AND q.id<>result_id
    ORDER BY CASE WHEN q.waiting_order-1000000000 < old_position AND old_position<=p_target_position THEN q.waiting_order-1000000000+1
                  WHEN q.waiting_order-1000000000 > old_position AND old_position>=p_target_position THEN q.waiting_order-1000000000-1
                  ELSE q.waiting_order-1000000000 END, q.id
  LOOP
    IF next_position=p_target_position THEN next_position := next_position+1; END IF;
    UPDATE clinical.queue_entries SET waiting_order=next_position WHERE id=row_item.id;
    next_position := next_position+1;
  END LOOP;
  UPDATE clinical.queue_entries SET waiting_order=p_target_position,reorder_reason=p_reason,reordered_by_person_id=platform.context_person_id(),reordered_at=statement_timestamp() WHERE id=result_id;
  SELECT version INTO resulting_version FROM clinical.queue_entries WHERE id=result_id;
  PERFORM clinical.record_mutation_effect_v1('clinical.queue.changed.v1','queue.entry.reordered','queue_entry',result_id,resulting_version);
  PERFORM clinical.maybe_inject_failure_v1('reorder_queue_entry');
  RETURN result_id;
END $$;

CREATE OR REPLACE FUNCTION clinical.send_doctor_delay_v1(p_schedule_id uuid,p_civil_date date,p_starts_at timestamptz,p_ends_at timestamptz,p_delay_minutes integer,p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE schedule_row clinical.schedules%ROWTYPE; scope_id uuid; prior_id uuid; new_id uuid;
  idem_id uuid; idem_new boolean; idem_response jsonb; idem_key text := NULLIF(current_setting('shifaa.idempotency_key',true),''); idem_hash text := NULLIF(current_setting('shifaa.request_hash',true),'');
BEGIN
  IF p_delay_minutes IS NULL OR p_delay_minutes<=0 OR p_reason IS NULL OR octet_length(p_reason) NOT BETWEEN 1 AND 512 THEN RAISE EXCEPTION 'invalid delay declaration' USING ERRCODE='22023'; END IF;
  SELECT * INTO schedule_row FROM clinical.schedules WHERE id=p_schedule_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'schedule not found' USING ERRCODE='P0002'; END IF;
  PERFORM clinical.assert_current_staff_scope_v1(schedule_row.facility_id,schedule_row.doctor_person_id,p_civil_date,'delay.manage');
  IF idem_key IS NOT NULL THEN
    SELECT record_id,is_new,response_body INTO idem_id,idem_new,idem_response FROM clinical.claim_idempotency_v1('POST','/v1/clinic/schedules/delay',idem_key,idem_hash);
    IF NOT idem_new THEN RETURN (idem_response->>'resource_id')::uuid; END IF;
  END IF;
  INSERT INTO clinical.queue_scopes(facility_id,doctor_person_id,civil_date,timezone_name) VALUES(schedule_row.facility_id,schedule_row.doctor_person_id,p_civil_date,schedule_row.timezone_name) ON CONFLICT DO NOTHING;
  SELECT id,current_delay_exception_id INTO scope_id,prior_id FROM clinical.queue_scopes WHERE facility_id=schedule_row.facility_id AND doctor_person_id=schedule_row.doctor_person_id AND civil_date=p_civil_date FOR UPDATE;
  IF prior_id IS NOT NULL THEN UPDATE clinical.schedule_exceptions SET superseded_at=statement_timestamp() WHERE id=prior_id AND superseded_at IS NULL; END IF;
  INSERT INTO clinical.schedule_exceptions(schedule_id,facility_id,doctor_person_id,timezone_name,civil_date,starts_at,ends_at,exception_type,delay_minutes,reason,created_by_person_id,updated_by_person_id)
    VALUES(p_schedule_id,schedule_row.facility_id,schedule_row.doctor_person_id,schedule_row.timezone_name,p_civil_date,p_starts_at,p_ends_at,'delay',p_delay_minutes,p_reason,platform.context_person_id(),platform.context_person_id()) RETURNING id INTO new_id;
  UPDATE clinical.queue_scopes SET current_delay_exception_id=new_id,version=version+1,estimates_recalculated_at=statement_timestamp() WHERE id=scope_id;
  PERFORM clinical.record_mutation_effect_v1('clinical.doctor_delay.declared.v1','doctor.delay.declared','schedule_exception',new_id,1,schedule_row.facility_id);
  PERFORM clinical.maybe_inject_failure_v1('send_doctor_delay');
  IF idem_id IS NOT NULL THEN
    UPDATE platform.idempotency_records SET state='completed',response_status=201,response_headers='{"cache-control":"private, no-store"}'::jsonb,
      response_body=pg_catalog.jsonb_build_object('resource_id',new_id),resource_type='schedule_exception',resource_id=new_id,updated_at=platform.context_now() WHERE id=idem_id;
  END IF;
  RETURN new_id;
END $$;

CREATE OR REPLACE FUNCTION clinical.declare_doctor_absence_v1(p_schedule_id uuid,p_civil_date date,p_starts_at timestamptz,p_ends_at timestamptz,p_reason text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE schedule_row clinical.schedules%ROWTYPE; exception_id uuid; affected integer;
BEGIN
  SELECT * INTO schedule_row FROM clinical.schedules WHERE id=p_schedule_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'schedule not found' USING ERRCODE='P0002'; END IF;
  PERFORM clinical.assert_current_staff_scope_v1(schedule_row.facility_id,schedule_row.doctor_person_id,p_civil_date,'absence.manage');
  INSERT INTO clinical.schedule_exceptions(schedule_id,facility_id,doctor_person_id,timezone_name,civil_date,starts_at,ends_at,exception_type,reason,created_by_person_id,updated_by_person_id)
    VALUES(p_schedule_id,schedule_row.facility_id,schedule_row.doctor_person_id,schedule_row.timezone_name,p_civil_date,p_starts_at,p_ends_at,'absence',p_reason,platform.context_person_id(),platform.context_person_id()) RETURNING id INTO exception_id;
  PERFORM pg_catalog.set_config('shifaa.clinic_internal_transition','allowed',true);
  UPDATE clinical.appointments SET status='reschedule_required',updated_by_person_id=platform.context_person_id()
    WHERE schedule_id=p_schedule_id AND status IN ('confirmed','checked_in') AND occupied_range && tstzrange(p_starts_at,p_ends_at,'[)');
  GET DIAGNOSTICS affected=ROW_COUNT;
  UPDATE clinical.queue_entries q SET state='removed',removed_at=statement_timestamp() WHERE q.appointment_id IN (SELECT a.id FROM clinical.appointments a WHERE a.schedule_id=p_schedule_id AND a.status='reschedule_required') AND q.state IN ('waiting','called');
  PERFORM clinical.record_mutation_effect_v1('clinical.doctor_absence.declared.v1','doctor.absence.declared','schedule_exception',exception_id,1,schedule_row.facility_id);
  PERFORM clinical.maybe_inject_failure_v1('declare_doctor_absence');
  RETURN affected;
END $$;

CREATE OR REPLACE FUNCTION clinical.claim_idempotency_v1(
  p_method text,p_route_template text,p_key text,p_request_hash text
)
RETURNS TABLE(record_id uuid,is_new boolean,response_body jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor text := platform.context_person_id()::text; principal_hash_value text; key_hash_value text;
  inserted_id uuid; existing platform.idempotency_records%ROWTYPE;
BEGIN
  IF actor IS NULL OR p_method IS NULL OR p_route_template IS NULL OR p_key IS NULL OR p_request_hash IS NULL OR p_request_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'invalid idempotency context' USING ERRCODE='22023';
  END IF;
  principal_hash_value := pg_catalog.encode(audit.sha256_v1(pg_catalog.convert_to('shifaa:idempotency:principal:v1:'||pg_catalog.octet_length(actor)||':'||actor,'UTF8')),'hex');
  key_hash_value := pg_catalog.encode(audit.sha256_v1(pg_catalog.convert_to('shifaa:idempotency:key:v1:'||pg_catalog.octet_length(p_key)||':'||p_key,'UTF8')),'hex');
  INSERT INTO platform.idempotency_records(principal_type,principal_hash,method,route_template,key_hash,request_hash,state,expires_at)
  VALUES ('sha256-v1',principal_hash_value,p_method,p_route_template,key_hash_value,p_request_hash,'processing',platform.context_now()+interval '24 hours')
  ON CONFLICT(principal_type,principal_hash,method,route_template,key_hash) DO NOTHING
  RETURNING id INTO inserted_id;
  SELECT record.* INTO STRICT existing FROM platform.idempotency_records record
   WHERE record.principal_type='sha256-v1' AND record.principal_hash=principal_hash_value
     AND record.method=p_method AND record.route_template=p_route_template AND record.key_hash=key_hash_value FOR UPDATE;
  IF existing.request_hash<>p_request_hash THEN RAISE EXCEPTION 'idempotency key reused with a changed body' USING ERRCODE='23505'; END IF;
  IF inserted_id IS NULL THEN
    IF existing.state='completed' THEN RETURN QUERY SELECT existing.id,false,existing.response_body; RETURN; END IF;
    RAISE EXCEPTION 'idempotency request is already in progress' USING ERRCODE='55000';
  END IF;
  RETURN QUERY SELECT existing.id,true,NULL::jsonb;
END $$;

CREATE OR REPLACE FUNCTION clinical.record_mutation_effect_v1(
  p_event_type text,p_action_code text,p_resource_type text,p_resource_id uuid,p_resource_version integer,
  p_facility_id uuid DEFAULT NULL,p_patient_id uuid DEFAULT NULL,p_reason_code text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE request_id uuid := public.gen_random_uuid(); audit_event_id uuid; patient_record_id uuid;
BEGIN
  IF p_resource_id IS NULL OR p_resource_version IS NULL OR p_resource_version<1 THEN RAISE EXCEPTION 'effect resource is invalid' USING ERRCODE='22023'; END IF;
  IF p_patient_id IS NOT NULL THEN SELECT p.id INTO patient_record_id FROM identity.patients p WHERE p.person_id=p_patient_id; END IF;
  SELECT appended.event_id INTO audit_event_id FROM audit.append_event_v1(
    request_id,request_id::text,p_action_code,p_resource_type,'success',
    p_actor_person_id=>platform.context_person_id(),p_authentication_aal=>nullif(platform.context_aal(),0)::smallint,
    p_facility_id=>p_facility_id,p_patient_id=>patient_record_id,p_resource_id=>p_resource_id,
    p_resource_version=>p_resource_version,p_reason_code=>p_reason_code,p_user_agent_class=>'service'
  ) AS appended;
  INSERT INTO platform.outbox_events(aggregate_type,aggregate_id,aggregate_version,event_type,payload)
  VALUES (p_resource_type,p_resource_id,p_resource_version,p_event_type,
    pg_catalog.jsonb_build_object('aggregateId',p_resource_id,'version',p_resource_version));
  RETURN audit_event_id;
END $$;

-- Contract correction: mutation functions return the approved OpenAPI DTO,
-- not an opaque UUID/count.  These projections are deliberately fixed-shape
-- SECURITY DEFINER seams.  They are called by the mutators while the same
-- transaction is still open, so the exact response that is persisted for a
-- replay is the response produced from the committed domain rows.
CREATE OR REPLACE FUNCTION clinical.project_schedule_v1(p_schedule_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT pg_catalog.jsonb_build_object(
    'id',s.id,
    'facilityId',s.facility_id,
    'doctorId',s.doctor_person_id,
    'timezone',s.timezone_name,
    'validFrom',s.valid_from,
    'validTo',s.valid_to,
    'slotDurationMinutes',s.slot_duration_minutes,
    'feeMinorUnits',s.fee_minor_units,
    'currency',s.currency_code,
    'status',s.status,
    'windows',COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'isoWeekday',w.iso_weekday,
          'localStart',w.local_start,
          'localEnd',w.local_end
        ) ORDER BY w.iso_weekday,w.local_start,w.local_end,w.id
      ) FROM clinical.schedule_windows w WHERE w.schedule_id=s.id
    ),'[]'::jsonb),
    'version',s.version
  )
  FROM clinical.schedules s
  WHERE s.id=p_schedule_id
$$;

CREATE OR REPLACE FUNCTION clinical.project_schedule_exception_v1(p_exception_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT pg_catalog.jsonb_build_object(
    'id',e.id,
    'scheduleId',e.schedule_id,
    'facilityId',e.facility_id,
    'doctorId',e.doctor_person_id,
    'type',e.exception_type,
    'startsAt',e.starts_at,
    'endsAt',e.ends_at,
    'civilDate',e.civil_date,
    'reason',e.reason,
    'version',e.version
  )
  FROM clinical.schedule_exceptions e
  WHERE e.id=p_exception_id AND e.exception_type IN ('blocked','added')
$$;

CREATE OR REPLACE FUNCTION clinical.project_appointment_v1(p_appointment_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT pg_catalog.jsonb_build_object(
    'id',a.id,
    'patientId',a.patient_person_id,
    'facilityId',a.facility_id,
    'doctorId',a.doctor_person_id,
    'startsAt',a.starts_at,
    'endsAt',a.ends_at,
    'timezone',a.timezone_name,
    'civilDate',a.civil_date,
    'status',a.status,
    'feeMinorUnits',a.fee_minor_units,
    'currency',a.currency_code,
    'paymentMethod',a.payment_method,
    'version',a.version
  )
  FROM clinical.appointments a
  WHERE a.id=p_appointment_id
$$;

CREATE OR REPLACE FUNCTION clinical.project_queue_entry_v1(p_entry_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'id',q.id,
    'appointmentId',q.appointment_id,
    'facilityId',q.facility_id,
    'doctorId',q.doctor_person_id,
    'civilDate',q.civil_date,
    'queueNumber',q.queue_number,
    'position',q.waiting_order,
    'estimatedServiceAt',q.estimated_service_at,
    'state',q.state,
    'version',q.version
  ))
  FROM clinical.queue_entries q
  WHERE q.id=p_entry_id
$$;

CREATE OR REPLACE FUNCTION clinical.project_queue_v1(
  p_facility_id uuid,p_doctor_person_id uuid,p_civil_date date
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT pg_catalog.jsonb_build_object(
    'facilityId',s.facility_id,
    'doctorId',s.doctor_person_id,
    'civilDate',s.civil_date,
    'version',s.version,
    'entries',COALESCE((
      SELECT pg_catalog.jsonb_agg(
        clinical.project_queue_entry_v1(q.id)
        ORDER BY CASE q.state WHEN 'waiting' THEN 0 WHEN 'called' THEN 1 WHEN 'in_service' THEN 2 ELSE 3 END,
          q.waiting_order NULLS LAST,q.queue_number,q.id
      ) FROM clinical.queue_entries q WHERE q.queue_scope_id=s.id
    ),'[]'::jsonb),
    'nextCursor',NULL::text
  ) || CASE WHEN delay.delay_minutes IS NULL THEN '{}'::jsonb
            ELSE pg_catalog.jsonb_build_object('delayMinutes',delay.delay_minutes) END
  FROM clinical.queue_scopes s
  LEFT JOIN LATERAL (
    SELECT e.delay_minutes
    FROM clinical.schedule_exceptions e
    WHERE e.id=s.current_delay_exception_id AND e.exception_type='delay' AND e.superseded_at IS NULL
  ) delay ON true
  WHERE s.facility_id=p_facility_id AND s.doctor_person_id=p_doctor_person_id AND s.civil_date=p_civil_date
$$;

CREATE OR REPLACE FUNCTION clinical.project_check_in_v1(p_appointment_id uuid,p_entry_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT pg_catalog.jsonb_build_object(
    'appointment',clinical.project_appointment_v1(p_appointment_id),
    'queueEntry',clinical.project_queue_entry_v1(p_entry_id)
  )
$$;

CREATE OR REPLACE FUNCTION clinical.project_delay_result_v1(
  p_delay_id uuid,p_outbox_event_id uuid
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'delayId',e.id,
    'facilityId',e.facility_id,
    'doctorId',e.doctor_person_id,
    'civilDate',e.civil_date,
    'delayMinutes',e.delay_minutes,
    'version',e.version,
    'affectedAppointmentIds',COALESCE((
      SELECT pg_catalog.jsonb_agg(a.id ORDER BY a.starts_at,a.id)
      FROM clinical.appointments a
      WHERE a.facility_id=e.facility_id AND a.doctor_person_id=e.doctor_person_id
        AND a.civil_date=e.civil_date
        AND a.status IN ('confirmed','checked_in','in_queue','in_consultation')
    ),'[]'::jsonb),
    'outboxEventIds',CASE WHEN p_outbox_event_id IS NULL THEN NULL ELSE pg_catalog.jsonb_build_array(p_outbox_event_id) END
  ))
  FROM clinical.schedule_exceptions e
  WHERE e.id=p_delay_id AND e.exception_type='delay'
$$;

CREATE OR REPLACE FUNCTION clinical.project_absence_result_v1(
  p_absence_id uuid,p_affected_appointment_ids uuid[],p_removed_queue_entry_ids uuid[]
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  SELECT pg_catalog.jsonb_build_object(
    'absenceId',e.id,
    'affectedAppointmentIds',COALESCE(to_jsonb(p_affected_appointment_ids),'[]'::jsonb),
    'removedQueueEntryIds',COALESCE(to_jsonb(p_removed_queue_entry_ids),'[]'::jsonb),
    'replacementSuggestions',COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'appointmentId',candidate.appointment_id,
          'slots',candidate.slots,
          'held',false
        ) ORDER BY candidate.appointment_id
      )
      FROM (
        SELECT a.id AS appointment_id,
          COALESCE((
            SELECT pg_catalog.jsonb_agg(
              CASE WHEN available.delay_minutes IS NULL THEN
                pg_catalog.jsonb_build_object(
                  'facilityId',s.facility_id,'doctorId',s.doctor_person_id,
                  'startsAt',available.starts_at,'endsAt',available.ends_at,
                  'timezone',available.timezone_name,'civilDate',available.civil_date
                )
              ELSE
                pg_catalog.jsonb_build_object(
                  'facilityId',s.facility_id,'doctorId',s.doctor_person_id,
                  'startsAt',available.starts_at,'endsAt',available.ends_at,
                  'timezone',available.timezone_name,'civilDate',available.civil_date,
                  'delayMinutes',available.delay_minutes
                ) END
              ORDER BY available.starts_at
            )
            FROM (
              SELECT av.*
              FROM pg_catalog.generate_series(
                GREATEST(s.valid_from,e.civil_date),
                LEAST(s.valid_to,e.civil_date + 30),
                interval '1 day'
              ) AS day_value
              CROSS JOIN LATERAL clinical.list_availability_v1(s.id,day_value::date) av
              WHERE av.starts_at>platform.context_now()
              ORDER BY av.starts_at
              LIMIT 3
            ) available
          ),'[]'::jsonb) AS slots
        FROM clinical.appointments a
        JOIN clinical.schedules s ON s.id=a.schedule_id
        WHERE a.id=ANY(p_affected_appointment_ids)
      ) candidate
    ),'[]'::jsonb)
  ) INTO result
  FROM clinical.schedule_exceptions e
  WHERE e.id=p_absence_id AND e.exception_type='absence';
  RETURN result;
END $$;

-- Mutation context and effect helpers keep idempotency, audit, ordered outbox,
-- and the canonical response in the same transaction.  Direct owner-only
-- fixture calls remain usable without an HTTP context; the API role is fail
-- closed when the required key/hash are absent.
CREATE OR REPLACE FUNCTION clinical.begin_mutation_v1(p_method text,p_route_template text)
RETURNS TABLE(record_id uuid,is_new boolean,response_body jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE idem_key text := NULLIF(current_setting('shifaa.idempotency_key',true),'');
  request_hash text := NULLIF(current_setting('shifaa.request_hash',true),'');
BEGIN
  IF (idem_key IS NULL) <> (request_hash IS NULL) THEN
    RAISE EXCEPTION 'complete idempotency context is required' USING ERRCODE='22023';
  END IF;
  IF idem_key IS NULL THEN
    IF session_user='shifaa_api' THEN
      RAISE EXCEPTION 'idempotency context is required' USING ERRCODE='22023';
    END IF;
    RETURN QUERY SELECT NULL::uuid,true,NULL::jsonb;
    RETURN;
  END IF;
  RETURN QUERY SELECT claim.record_id,claim.is_new,claim.response_body
    FROM clinical.claim_idempotency_v1(p_method,p_route_template,idem_key,request_hash) claim;
END $$;

CREATE OR REPLACE FUNCTION clinical.complete_mutation_v1(
  p_record_id uuid,p_response_status integer,p_resource_type text,p_resource_id uuid,p_response jsonb
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_record_id IS NULL THEN RETURN; END IF;
  IF p_response IS NULL OR p_resource_id IS NULL OR p_resource_type IS NULL
  THEN RAISE EXCEPTION 'canonical mutation response is incomplete' USING ERRCODE='22023'; END IF;
  UPDATE platform.idempotency_records
  SET state='completed',response_status=p_response_status,
      response_headers='{"cache-control":"private, no-store"}'::jsonb,
      response_body=p_response,resource_type=p_resource_type,resource_id=p_resource_id,
      updated_at=platform.context_now()
  WHERE id=p_record_id AND state='processing';
  IF NOT FOUND THEN RAISE EXCEPTION 'idempotency record is not claimable' USING ERRCODE='55000'; END IF;
END $$;

CREATE OR REPLACE FUNCTION clinical.record_mutation_effect_v2(
  p_event_type text,p_action_code text,p_resource_type text,p_resource_id uuid,p_resource_version integer,
  p_facility_id uuid DEFAULT NULL,p_patient_person_id uuid DEFAULT NULL
)
RETURNS TABLE(audit_event_id uuid,outbox_event_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE request_id uuid := COALESCE(NULLIF(current_setting('shifaa.request_id',true),'')::uuid,public.gen_random_uuid());
  trace_id text := NULLIF(current_setting('shifaa.trace_id',true),''); patient_record_id uuid;
BEGIN
  IF p_resource_id IS NULL OR p_resource_version IS NULL OR p_resource_version<1
     OR p_event_type IS NULL OR p_action_code IS NULL OR p_resource_type IS NULL
  THEN RAISE EXCEPTION 'effect resource is invalid' USING ERRCODE='22023'; END IF;
  trace_id := CASE WHEN trace_id IS NOT NULL AND octet_length(trace_id) BETWEEN 16 AND 64
                         AND trace_id ~ '^[a-z0-9][a-z0-9._:-]*$'
                   THEN trace_id ELSE request_id::text END;
  IF p_patient_person_id IS NOT NULL THEN
    SELECT p.id INTO patient_record_id FROM identity.patients p WHERE p.person_id=p_patient_person_id;
  END IF;
  SELECT appended.event_id INTO audit_event_id
  FROM audit.append_event_v1(
    request_id,trace_id,p_action_code,p_resource_type,'success',
    p_actor_person_id=>platform.context_person_id(),
    p_authentication_aal=>NULLIF(platform.context_aal(),0)::smallint,
    p_facility_id=>p_facility_id,p_patient_id=>patient_record_id,
    p_resource_id=>p_resource_id,p_resource_version=>p_resource_version,
    p_reason_code=>NULL,p_user_agent_class=>'service'
  ) appended;
  INSERT INTO platform.outbox_events(aggregate_type,aggregate_id,aggregate_version,event_type,payload)
  VALUES (p_resource_type,p_resource_id,p_resource_version,p_event_type,
    pg_catalog.jsonb_build_object('aggregateId',p_resource_id,'version',p_resource_version))
  RETURNING id INTO outbox_event_id;
  RETURN NEXT;
END $$;

-- Window rows are part of schedule creation, so they must not turn an initial
-- version 1 schedule into a partially incremented version before its first
-- canonical response.  Updates retain the normal parent-version trigger.
CREATE OR REPLACE FUNCTION clinical.schedule_window_parent_version_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,clinical AS $$
BEGIN
  IF current_setting('shifaa.schedule_initializing',true)='true' THEN RETURN COALESCE(NEW,OLD); END IF;
  UPDATE clinical.schedules SET version=version+1,updated_at=statement_timestamp(),
    updated_by_person_id=COALESCE(NULLIF(current_setting('shifaa.person_id',true),'')::uuid,updated_by_person_id)
  WHERE id=COALESCE(NEW.schedule_id,OLD.schedule_id);
  RETURN COALESCE(NEW,OLD);
END $$;

DROP FUNCTION clinical.create_schedule_v1(jsonb);
DROP FUNCTION clinical.update_schedule_v1(uuid,integer,jsonb);
DROP FUNCTION clinical.create_schedule_exception_v1(jsonb);
DROP FUNCTION clinical.create_appointment_v1(jsonb);
DROP FUNCTION clinical.reschedule_appointment_v1(uuid,integer,timestamptz,timestamptz,date,time,text);
DROP FUNCTION clinical.cancel_appointment_v1(uuid,integer,text);
DROP FUNCTION clinical.check_in_appointment_v1(uuid,integer);
DROP FUNCTION clinical.call_queue_entry_v1(uuid,integer);
DROP FUNCTION clinical.complete_queue_entry_v1(uuid,integer);
DROP FUNCTION clinical.reorder_queue_entry_v1(uuid,integer,integer,text);
DROP FUNCTION clinical.send_doctor_delay_v1(uuid,date,timestamptz,timestamptz,integer,text);
DROP FUNCTION clinical.declare_doctor_absence_v1(uuid,date,timestamptz,timestamptz,text);

CREATE FUNCTION clinical.create_schedule_v1(p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE schedule_id uuid; actor uuid := platform.context_person_id();
  idem_id uuid; idem_new boolean; idem_response jsonb; result jsonb; window_value jsonb;
BEGIN
  IF actor IS NULL OR p_input IS NULL OR (p_input->>'facility_id')::uuid IS NULL
     OR (p_input->>'doctor_person_id')::uuid IS NULL OR (p_input->>'timezone_name') IS NULL
     OR (p_input->>'valid_from')::date IS NULL OR (p_input->>'valid_to')::date IS NULL
     OR (p_input->>'slot_duration_minutes')::integer IS NULL OR jsonb_typeof(p_input->'windows')<>'array'
     OR jsonb_array_length(p_input->'windows')<1
     OR p_input->>'fee_minor_units' IS NULL
      OR p_input->>'fee_minor_units' !~ '^[0-9]+$'
  THEN RAISE EXCEPTION 'invalid schedule request' USING ERRCODE='22023'; END IF;
  IF p_input ? 'currency' OR p_input ? 'currency_code' OR p_input ? 'currencyCode' THEN
    RAISE EXCEPTION 'schedule currency is server-owned' USING ERRCODE='22023';
  END IF;
  PERFORM clinical.assert_current_staff_scope_v1((p_input->>'facility_id')::uuid,(p_input->>'doctor_person_id')::uuid,(p_input->>'valid_from')::date,'schedule.manage');
  SELECT record_id,is_new,response_body INTO idem_id,idem_new,idem_response
    FROM clinical.begin_mutation_v1('POST','/v1/clinics/{facilityId}/schedules');
  IF NOT idem_new THEN RETURN idem_response; END IF;
  INSERT INTO clinical.schedules(facility_id,doctor_person_id,timezone_name,valid_from,valid_to,slot_duration_minutes,fee_minor_units,currency_code,status,created_by_person_id,updated_by_person_id)
  VALUES ((p_input->>'facility_id')::uuid,(p_input->>'doctor_person_id')::uuid,p_input->>'timezone_name',
    (p_input->>'valid_from')::date,(p_input->>'valid_to')::date,(p_input->>'slot_duration_minutes')::smallint,
    (p_input->>'fee_minor_units')::bigint,'EGP',
    COALESCE(NULLIF(p_input->>'status',''),'active'),actor,actor)
  RETURNING id INTO schedule_id;
  PERFORM pg_catalog.set_config('shifaa.schedule_initializing','true',true);
  FOR window_value IN SELECT value FROM jsonb_array_elements(p_input->'windows') value LOOP
    IF (window_value->>'isoWeekday')::integer IS NULL OR (window_value->>'localStart')::time IS NULL
       OR (window_value->>'localEnd')::time IS NULL
    THEN RAISE EXCEPTION 'invalid schedule window' USING ERRCODE='22023'; END IF;
    INSERT INTO clinical.schedule_windows(schedule_id,iso_weekday,local_start,local_end)
    VALUES (schedule_id,(window_value->>'isoWeekday')::smallint,(window_value->>'localStart')::time,(window_value->>'localEnd')::time);
  END LOOP;
  PERFORM pg_catalog.set_config('shifaa.schedule_initializing','false',true);
  result := clinical.project_schedule_v1(schedule_id);
  IF result IS NULL THEN RAISE EXCEPTION 'schedule projection unavailable' USING ERRCODE='55000'; END IF;
  PERFORM clinical.record_mutation_effect_v2('clinical.schedule.changed.v1','schedule.created','schedule',schedule_id,(result->>'version')::integer,(result->>'facilityId')::uuid);
  PERFORM clinical.maybe_inject_failure_v1('create_schedule');
  PERFORM clinical.complete_mutation_v1(idem_id,201,'schedule',schedule_id,result);
  RETURN result;
END $$;

CREATE FUNCTION clinical.update_schedule_v1(p_schedule_id uuid,p_expected_version integer,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE schedule_row clinical.schedules%ROWTYPE; actor uuid := platform.context_person_id();
  idem_id uuid; idem_new boolean; idem_response jsonb; result jsonb; window_value jsonb;
BEGIN
  IF p_schedule_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1 OR p_input IS NULL
  THEN RAISE EXCEPTION 'invalid schedule update request' USING ERRCODE='22023'; END IF;
  IF p_input ? 'doctor_id' OR p_input ? 'doctorId' OR p_input ? 'currency' OR p_input ? 'currency_code' OR p_input ? 'currencyCode' THEN
    RAISE EXCEPTION 'doctor reassignment or currency mutation is not supported' USING ERRCODE='22023';
  END IF;
  IF p_input ? 'fee_minor_units' AND (p_input->>'fee_minor_units' !~ '^[0-9]+$') THEN
    RAISE EXCEPTION 'schedule fee must be a nonnegative integer' USING ERRCODE='22023';
  END IF;
  SELECT * INTO schedule_row FROM clinical.schedules WHERE id=p_schedule_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'schedule is stale or missing' USING ERRCODE='40001'; END IF;
  PERFORM clinical.assert_current_staff_scope_v1(schedule_row.facility_id,schedule_row.doctor_person_id,
    COALESCE((p_input->>'valid_from')::date,schedule_row.valid_from),'schedule.manage');
  SELECT record_id,is_new,response_body INTO idem_id,idem_new,idem_response
    FROM clinical.begin_mutation_v1('PATCH','/v1/clinics/{facilityId}/schedules/{scheduleId}');
  IF NOT idem_new THEN RETURN idem_response; END IF;
  UPDATE clinical.schedules
  SET timezone_name=COALESCE(p_input->>'timezone_name',timezone_name),
      valid_from=COALESCE((p_input->>'valid_from')::date,valid_from),
      valid_to=COALESCE((p_input->>'valid_to')::date,valid_to),
      slot_duration_minutes=COALESCE((p_input->>'slot_duration_minutes')::smallint,slot_duration_minutes),
      fee_minor_units=COALESCE((p_input->>'fee_minor_units')::bigint,fee_minor_units),
      status=COALESCE(p_input->>'status',status),updated_by_person_id=actor
  WHERE id=p_schedule_id AND version=p_expected_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'schedule is stale or missing' USING ERRCODE='40001'; END IF;
  IF p_input ? 'windows' THEN
    IF jsonb_typeof(p_input->'windows')<>'array' OR jsonb_array_length(p_input->'windows')<1
    THEN RAISE EXCEPTION 'invalid schedule windows' USING ERRCODE='22023'; END IF;
    DELETE FROM clinical.schedule_windows WHERE schedule_id=p_schedule_id;
    FOR window_value IN SELECT value FROM jsonb_array_elements(p_input->'windows') value LOOP
      INSERT INTO clinical.schedule_windows(schedule_id,iso_weekday,local_start,local_end)
      VALUES (p_schedule_id,(window_value->>'isoWeekday')::smallint,(window_value->>'localStart')::time,(window_value->>'localEnd')::time);
    END LOOP;
  END IF;
  result := clinical.project_schedule_v1(p_schedule_id);
  IF result IS NULL THEN RAISE EXCEPTION 'schedule projection unavailable' USING ERRCODE='55000'; END IF;
  PERFORM clinical.record_mutation_effect_v2('clinical.schedule.changed.v1','schedule.updated','schedule',p_schedule_id,(result->>'version')::integer,schedule_row.facility_id);
  PERFORM clinical.maybe_inject_failure_v1('update_schedule');
  PERFORM clinical.complete_mutation_v1(idem_id,200,'schedule',p_schedule_id,result);
  RETURN result;
END $$;

CREATE FUNCTION clinical.create_schedule_exception_v1(p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE schedule_row clinical.schedules%ROWTYPE; exception_id uuid; exception_type text; expected_version integer;
  idem_id uuid; idem_new boolean; idem_response jsonb; result jsonb;
BEGIN
  expected_version := NULLIF(p_input->>'expected_version','')::integer;
  IF p_input IS NULL OR (p_input->>'schedule_id')::uuid IS NULL OR expected_version IS NULL OR expected_version<1 OR (p_input->>'civil_date')::date IS NULL
     OR (p_input->>'starts_at')::timestamptz IS NULL OR (p_input->>'ends_at')::timestamptz IS NULL
     OR (p_input->>'reason') IS NULL OR octet_length(p_input->>'reason') NOT BETWEEN 1 AND 500
     OR (p_input->>'reason') ~ E'[\\r\\n\\t]'
  THEN RAISE EXCEPTION 'invalid schedule exception request' USING ERRCODE='22023'; END IF;
  exception_type := p_input->>'exception_type';
  IF exception_type NOT IN ('blocked','added') THEN RAISE EXCEPTION 'ordinary exception type is invalid' USING ERRCODE='22023'; END IF;
  IF p_input ? 'delay_minutes' OR p_input ? 'delayMinutes' THEN
    RAISE EXCEPTION 'delay declarations require send_doctor_delay_v1' USING ERRCODE='22023';
  END IF;
  SELECT * INTO schedule_row FROM clinical.schedules WHERE id=(p_input->>'schedule_id')::uuid FOR UPDATE;
  IF NOT FOUND OR schedule_row.status<>'active' OR NOT ((p_input->>'civil_date')::date <@ schedule_row.valid_dates)
     OR (p_input->>'ends_at')::timestamptz <= (p_input->>'starts_at')::timestamptz
     OR ((p_input->>'starts_at')::timestamptz AT TIME ZONE schedule_row.timezone_name)::date IS DISTINCT FROM (p_input->>'civil_date')::date
  THEN RAISE EXCEPTION 'schedule exception scope denied' USING ERRCODE='42501'; END IF;
  PERFORM clinical.assert_current_staff_scope_v1(schedule_row.facility_id,schedule_row.doctor_person_id,(p_input->>'civil_date')::date,'schedule.manage');
  IF schedule_row.version IS DISTINCT FROM expected_version THEN
    RAISE EXCEPTION 'schedule is stale or missing' USING ERRCODE='40001';
  END IF;
  SELECT record_id,is_new,response_body INTO idem_id,idem_new,idem_response
    FROM clinical.begin_mutation_v1('POST','/v1/clinics/{facilityId}/schedules/{scheduleId}/exceptions');
  IF NOT idem_new THEN RETURN idem_response; END IF;
  INSERT INTO clinical.schedule_exceptions(schedule_id,facility_id,doctor_person_id,timezone_name,civil_date,starts_at,ends_at,exception_type,reason,created_by_person_id,updated_by_person_id)
  VALUES (schedule_row.id,schedule_row.facility_id,schedule_row.doctor_person_id,schedule_row.timezone_name,(p_input->>'civil_date')::date,
    (p_input->>'starts_at')::timestamptz,(p_input->>'ends_at')::timestamptz,exception_type,p_input->>'reason',platform.context_person_id(),platform.context_person_id())
  RETURNING id INTO exception_id;
  UPDATE clinical.schedules
  SET version=version+1,updated_by_person_id=platform.context_person_id()
  WHERE id=schedule_row.id AND version=expected_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'schedule is stale or missing' USING ERRCODE='40001'; END IF;
  result := clinical.project_schedule_exception_v1(exception_id);
  IF result IS NULL THEN RAISE EXCEPTION 'schedule exception projection unavailable' USING ERRCODE='55000'; END IF;
  PERFORM clinical.record_mutation_effect_v2('clinical.schedule.changed.v1','schedule.exception.created','schedule_exception',exception_id,(result->>'version')::integer,schedule_row.facility_id);
  PERFORM clinical.maybe_inject_failure_v1('create_schedule_exception');
  PERFORM clinical.complete_mutation_v1(idem_id,201,'schedule_exception',exception_id,result);
  RETURN result;
END $$;

CREATE FUNCTION clinical.create_appointment_v1(p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE appointment_id uuid; actor uuid := platform.context_person_id(); patient uuid := (p_input->>'patient_person_id')::uuid; schedule_id uuid;
  schedule_row clinical.schedules%ROWTYPE; starts_at_value timestamptz := (p_input->>'starts_at')::timestamptz;
  ends_at_value timestamptz := (p_input->>'ends_at')::timestamptz; result jsonb;
  idem_id uuid; idem_new boolean; idem_response jsonb;
BEGIN
   schedule_id := NULLIF(p_input->>'schedule_id','')::uuid;
   IF p_input IS NULL OR patient IS NULL OR (p_input->>'facility_id')::uuid IS NULL OR (p_input->>'doctor_person_id')::uuid IS NULL
      OR starts_at_value IS NULL OR ends_at_value IS NULL OR ends_at_value<=starts_at_value
     OR (p_input->>'civil_date')::date IS NULL OR (p_input->>'local_start')::time IS NULL
     OR p_input->>'payment_method' IS DISTINCT FROM 'cash_on_arrival'
  THEN RAISE EXCEPTION 'invalid appointment request' USING ERRCODE='22023'; END IF;
  IF p_input ? 'fee_minor_units' OR p_input ? 'feeMinorUnits' OR p_input ? 'currency_code' OR p_input ? 'currency' OR p_input ? 'currencyCode' THEN
    RAISE EXCEPTION 'appointment fee and currency are server-owned' USING ERRCODE='22023';
  END IF;
  PERFORM clinical.assert_current_patient_scope_v1(patient);
  SELECT record_id,is_new,response_body INTO idem_id,idem_new,idem_response
    FROM clinical.begin_mutation_v1('POST','/v1/appointments');
  IF NOT idem_new THEN RETURN idem_response; END IF;
  -- The schedule fee and the exclusion-constraint slot acquisition are
  -- intentionally inside this one function transaction.  The API role never
  -- reads pricing directly and the appointment always snapshots this locked
  -- authoritative value.
   IF schedule_id IS NULL THEN
     SELECT * INTO schedule_row FROM clinical.schedules
     WHERE facility_id=(p_input->>'facility_id')::uuid
       AND doctor_person_id=(p_input->>'doctor_person_id')::uuid
       AND status='active' AND (p_input->>'civil_date')::date <@ valid_dates
     ORDER BY valid_from,id LIMIT 1 FOR UPDATE;
   ELSE
     SELECT * INTO schedule_row FROM clinical.schedules WHERE id=schedule_id FOR UPDATE;
   END IF;
  IF NOT FOUND OR schedule_row.status<>'active' OR schedule_row.facility_id IS DISTINCT FROM (p_input->>'facility_id')::uuid
     OR schedule_row.doctor_person_id IS DISTINCT FROM (p_input->>'doctor_person_id')::uuid
     OR schedule_row.timezone_name IS DISTINCT FROM (p_input->>'timezone_name')
     OR NOT ((p_input->>'civil_date')::date <@ schedule_row.valid_dates)
     OR (starts_at_value AT TIME ZONE schedule_row.timezone_name)::date IS DISTINCT FROM (p_input->>'civil_date')::date
     OR (starts_at_value AT TIME ZONE schedule_row.timezone_name)::time IS DISTINCT FROM (p_input->>'local_start')::time
  THEN RAISE EXCEPTION 'appointment schedule scope denied' USING ERRCODE='42501'; END IF;
  INSERT INTO clinical.appointments(patient_person_id,facility_id,doctor_person_id,schedule_id,starts_at,ends_at,timezone_name,civil_date,local_start,
    fee_minor_units,currency_code,payment_method,status,source_referral_id,created_by_person_id,updated_by_person_id)
  VALUES (patient,schedule_row.facility_id,schedule_row.doctor_person_id,schedule_row.id,starts_at_value,ends_at_value,schedule_row.timezone_name,
    (p_input->>'civil_date')::date,(p_input->>'local_start')::time,schedule_row.fee_minor_units,'EGP','cash_on_arrival','confirmed',
    (p_input->>'source_referral_id')::uuid,actor,actor)
  RETURNING id INTO appointment_id;
  result := clinical.project_appointment_v1(appointment_id);
  IF result IS NULL THEN RAISE EXCEPTION 'appointment projection unavailable' USING ERRCODE='55000'; END IF;
  PERFORM clinical.record_mutation_effect_v2('clinical.appointment.changed.v1','appointment.created','appointment',appointment_id,(result->>'version')::integer,schedule_row.facility_id,patient);
  PERFORM clinical.maybe_inject_failure_v1('create_appointment');
  PERFORM clinical.complete_mutation_v1(idem_id,201,'appointment',appointment_id,result);
  RETURN result;
END $$;

CREATE FUNCTION clinical.reschedule_appointment_v1(
  p_appointment_id uuid,p_expected_version integer,p_starts_at timestamptz,p_ends_at timestamptz,p_civil_date date,p_local_start time,p_reason text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE appointment_id uuid; actor uuid := platform.context_person_id(); original clinical.appointments%ROWTYPE; schedule_row clinical.schedules%ROWTYPE;
  result jsonb; idem_id uuid; idem_new boolean; idem_response jsonb;
BEGIN
  IF actor IS NULL OR p_appointment_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1 OR p_starts_at IS NULL OR p_ends_at IS NULL OR p_civil_date IS NULL OR p_local_start IS NULL
     OR p_reason IS NULL OR char_length(p_reason) NOT BETWEEN 1 AND 500 OR p_reason ~ E'[\\r\\n\\t]'
  THEN RAISE EXCEPTION 'invalid appointment replacement request' USING ERRCODE='22023'; END IF;
  SELECT * INTO original FROM clinical.appointments WHERE id=p_appointment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'appointment is stale, unauthorized, or not reschedulable' USING ERRCODE='40001'; END IF;
  IF actor=original.patient_person_id THEN PERFORM clinical.assert_current_patient_scope_v1(original.patient_person_id);
  ELSE PERFORM clinical.assert_current_staff_scope_v1(original.facility_id,original.doctor_person_id,original.civil_date,'appointment.manage'); END IF;
  SELECT * INTO schedule_row FROM clinical.schedules WHERE id=original.schedule_id FOR SHARE;
  IF NOT FOUND OR schedule_row.status<>'active' OR NOT (p_civil_date <@ schedule_row.valid_dates)
     OR (p_starts_at AT TIME ZONE schedule_row.timezone_name)::date IS DISTINCT FROM p_civil_date
     OR (p_starts_at AT TIME ZONE schedule_row.timezone_name)::time IS DISTINCT FROM p_local_start OR p_ends_at<=p_starts_at
  THEN RAISE EXCEPTION 'appointment replacement scope denied' USING ERRCODE='42501'; END IF;
  SELECT record_id,is_new,response_body INTO idem_id,idem_new,idem_response
    FROM clinical.begin_mutation_v1('POST','/v1/appointments/{appointmentId}/reschedule');
  IF NOT idem_new THEN RETURN idem_response; END IF;
  PERFORM pg_catalog.set_config('shifaa.clinic_internal_transition','allowed',true);
  UPDATE clinical.appointments SET starts_at=p_starts_at,ends_at=p_ends_at,civil_date=p_civil_date,local_start=p_local_start,
    reschedule_reason=p_reason,status='confirmed',updated_by_person_id=actor
  WHERE id=p_appointment_id AND version=p_expected_version AND status IN ('confirmed','reschedule_required')
    AND (status='reschedule_required' OR starts_at>platform.context_now());
  IF NOT FOUND THEN RAISE EXCEPTION 'appointment is stale, unauthorized, or not reschedulable' USING ERRCODE='40001'; END IF;
  appointment_id:=p_appointment_id; result:=clinical.project_appointment_v1(appointment_id);
  IF result IS NULL THEN RAISE EXCEPTION 'appointment projection unavailable' USING ERRCODE='55000'; END IF;
  PERFORM clinical.record_mutation_effect_v2('clinical.appointment.changed.v1','appointment.rescheduled','appointment',appointment_id,(result->>'version')::integer,original.facility_id,original.patient_person_id);
  PERFORM clinical.maybe_inject_failure_v1('reschedule_appointment');
  PERFORM clinical.complete_mutation_v1(idem_id,200,'appointment',appointment_id,result);
  RETURN result;
END $$;

CREATE FUNCTION clinical.cancel_appointment_v1(p_appointment_id uuid,p_expected_version integer,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE original clinical.appointments%ROWTYPE; result jsonb; idem_id uuid; idem_new boolean; idem_response jsonb;
BEGIN
  IF p_reason IS NULL OR octet_length(p_reason) NOT BETWEEN 1 AND 500 OR p_reason ~ E'[\\r\\n\\t]' THEN RAISE EXCEPTION 'invalid cancellation reason' USING ERRCODE='22023'; END IF;
  SELECT * INTO original FROM clinical.appointments WHERE id=p_appointment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'appointment not cancellable or stale' USING ERRCODE='40001'; END IF;
  IF platform.context_person_id()=original.patient_person_id THEN PERFORM clinical.assert_current_patient_scope_v1(original.patient_person_id);
  ELSE PERFORM clinical.assert_current_staff_scope_v1(original.facility_id,original.doctor_person_id,original.civil_date,'appointment.manage'); END IF;
  SELECT record_id,is_new,response_body INTO idem_id,idem_new,idem_response
    FROM clinical.begin_mutation_v1('POST','/v1/appointments/{appointmentId}/cancel');
  IF NOT idem_new THEN RETURN idem_response; END IF;
  PERFORM pg_catalog.set_config('shifaa.clinic_internal_transition','allowed',true);
  UPDATE clinical.appointments SET status='cancelled',cancellation_reason=p_reason,cancelled_by_person_id=platform.context_person_id(),cancelled_at=statement_timestamp(),updated_by_person_id=platform.context_person_id()
  WHERE id=p_appointment_id AND version=p_expected_version AND status IN ('confirmed','reschedule_required') AND (starts_at>platform.context_now() OR status='reschedule_required');
  IF NOT FOUND THEN RAISE EXCEPTION 'appointment not cancellable or stale' USING ERRCODE='40001'; END IF;
  result:=clinical.project_appointment_v1(p_appointment_id);
  PERFORM clinical.record_mutation_effect_v2('clinical.appointment.changed.v1','appointment.cancelled','appointment',p_appointment_id,(result->>'version')::integer,original.facility_id,original.patient_person_id);
  PERFORM clinical.maybe_inject_failure_v1('cancel_appointment');
  PERFORM clinical.complete_mutation_v1(idem_id,200,'appointment',p_appointment_id,result);
  RETURN result;
END $$;

CREATE FUNCTION clinical.check_in_appointment_v1(p_appointment_id uuid,p_expected_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE appointment clinical.appointments%ROWTYPE; scope_id uuid; number_value bigint; entry_id uuid; result jsonb;
  idem_id uuid; idem_new boolean; idem_response jsonb; effects record;
BEGIN
  SELECT * INTO appointment FROM clinical.appointments WHERE id=p_appointment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'appointment is not check-in eligible' USING ERRCODE='40001'; END IF;
  IF platform.context_person_id() IS DISTINCT FROM appointment.patient_person_id THEN PERFORM clinical.assert_current_staff_scope_v1(appointment.facility_id,appointment.doctor_person_id,appointment.civil_date,'appointment.manage');
  ELSE PERFORM clinical.assert_current_patient_scope_v1(appointment.patient_person_id); END IF;
  SELECT record_id,is_new,response_body INTO idem_id,idem_new,idem_response
    FROM clinical.begin_mutation_v1('POST','/v1/appointments/{appointmentId}/check-in');
  IF NOT idem_new THEN RETURN idem_response; END IF;
  IF appointment.version IS DISTINCT FROM p_expected_version OR appointment.status<>'confirmed' THEN
    RAISE EXCEPTION 'appointment is not check-in eligible' USING ERRCODE='40001';
  END IF;
  INSERT INTO clinical.queue_scopes(facility_id,doctor_person_id,civil_date,timezone_name)
  VALUES (appointment.facility_id,appointment.doctor_person_id,appointment.civil_date,appointment.timezone_name)
  ON CONFLICT(facility_id,doctor_person_id,civil_date) DO NOTHING;
  SELECT id,next_queue_number INTO scope_id,number_value FROM clinical.queue_scopes
  WHERE facility_id=appointment.facility_id AND doctor_person_id=appointment.doctor_person_id AND civil_date=appointment.civil_date FOR UPDATE;
  UPDATE clinical.queue_scopes SET next_queue_number=next_queue_number+1,version=version+1 WHERE id=scope_id;
  PERFORM pg_catalog.set_config('shifaa.clinic_internal_transition','allowed',true);
  INSERT INTO clinical.queue_entries(queue_scope_id,appointment_id,facility_id,doctor_person_id,civil_date,queue_number,waiting_order,state)
  VALUES (scope_id,appointment.id,appointment.facility_id,appointment.doctor_person_id,appointment.civil_date,number_value,
    (SELECT count(*)::integer+1 FROM clinical.queue_entries WHERE queue_scope_id=scope_id AND state='waiting'),'waiting') RETURNING id INTO entry_id;
  UPDATE clinical.appointments SET status='checked_in',updated_by_person_id=platform.context_person_id() WHERE id=appointment.id;
  PERFORM clinical.record_mutation_effect_v2('clinical.appointment.changed.v1','appointment.checked_in','appointment',appointment.id,((clinical.project_appointment_v1(appointment.id))->>'version')::integer,appointment.facility_id,appointment.patient_person_id);
  PERFORM clinical.record_mutation_effect_v2('clinical.queue.changed.v1','queue.entry.created','queue_entry',entry_id,1,appointment.facility_id,appointment.patient_person_id);
  result:=clinical.project_check_in_v1(appointment.id,entry_id);
  IF result IS NULL OR result->'appointment' IS NULL OR result->'queueEntry' IS NULL THEN RAISE EXCEPTION 'check-in projection unavailable' USING ERRCODE='55000'; END IF;
  PERFORM clinical.maybe_inject_failure_v1('check_in_appointment');
  PERFORM clinical.complete_mutation_v1(idem_id,200,'appointment',appointment.id,result);
  RETURN result;
END $$;

CREATE FUNCTION clinical.call_queue_entry_v1(p_entry_id uuid,p_expected_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE entry clinical.queue_entries%ROWTYPE; result jsonb; idem_id uuid; idem_new boolean; idem_response jsonb;
BEGIN
  SELECT * INTO entry FROM clinical.queue_entries WHERE id=p_entry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'queue entry is not callable or stale' USING ERRCODE='40001'; END IF;
  PERFORM clinical.assert_current_staff_scope_v1(entry.facility_id,entry.doctor_person_id,entry.civil_date,'queue.manage');
  SELECT record_id,is_new,response_body INTO idem_id,idem_new,idem_response FROM clinical.begin_mutation_v1('POST','/v1/queue-entries/{queueEntryId}/call');
  IF NOT idem_new THEN RETURN idem_response; END IF;
  PERFORM pg_catalog.set_config('shifaa.clinic_internal_transition','allowed',true);
  UPDATE clinical.queue_entries SET state='called',waiting_order=NULL,called_at=statement_timestamp()
  WHERE id=p_entry_id AND version=p_expected_version AND state='waiting';
  IF NOT FOUND THEN RAISE EXCEPTION 'queue entry is not callable or stale' USING ERRCODE='40001'; END IF;
  result:=clinical.project_queue_entry_v1(p_entry_id);
  PERFORM clinical.record_mutation_effect_v2('clinical.queue.changed.v1','queue.entry.called','queue_entry',p_entry_id,(result->>'version')::integer,entry.facility_id);
  PERFORM clinical.maybe_inject_failure_v1('call_queue_entry');
  PERFORM clinical.complete_mutation_v1(idem_id,200,'queue_entry',p_entry_id,result);
  RETURN result;
END $$;

CREATE FUNCTION clinical.complete_queue_entry_v1(p_entry_id uuid,p_expected_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE entry clinical.queue_entries%ROWTYPE; result jsonb; idem_id uuid; idem_new boolean; idem_response jsonb;
BEGIN
  SELECT * INTO entry FROM clinical.queue_entries WHERE id=p_entry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'queue entry is not completable or stale' USING ERRCODE='40001'; END IF;
  PERFORM clinical.assert_current_staff_scope_v1(entry.facility_id,entry.doctor_person_id,entry.civil_date,'queue.manage');
  SELECT record_id,is_new,response_body INTO idem_id,idem_new,idem_response FROM clinical.begin_mutation_v1('POST','/v1/queue-entries/{queueEntryId}/complete');
  IF NOT idem_new THEN RETURN idem_response; END IF;
  PERFORM pg_catalog.set_config('shifaa.clinic_internal_transition','allowed',true);
  UPDATE clinical.queue_entries SET state='completed',completed_at=statement_timestamp()
  WHERE id=p_entry_id AND version=p_expected_version AND state='called';
  IF NOT FOUND THEN RAISE EXCEPTION 'queue entry is not completable or stale' USING ERRCODE='40001'; END IF;
  result:=clinical.project_queue_entry_v1(p_entry_id);
  PERFORM clinical.record_mutation_effect_v2('clinical.queue.changed.v1','queue.entry.completed','queue_entry',p_entry_id,(result->>'version')::integer,entry.facility_id);
  PERFORM clinical.maybe_inject_failure_v1('complete_queue_entry');
  PERFORM clinical.complete_mutation_v1(idem_id,200,'queue_entry',p_entry_id,result);
  RETURN result;
END $$;

CREATE FUNCTION clinical.reorder_queue_entry_v1(p_entry_id uuid,p_expected_version integer,p_target_position integer,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE entry clinical.queue_entries%ROWTYPE; scope_id uuid; old_position integer; max_position integer; row_item record; next_position integer:=1; result jsonb; idem_id uuid; idem_new boolean; idem_response jsonb; scope_version integer;
BEGIN
  IF p_target_position IS NULL OR p_target_position<1 OR p_reason IS NULL OR octet_length(p_reason) NOT BETWEEN 1 AND 500 OR p_reason ~ E'[\\r\\n\\t]' THEN RAISE EXCEPTION 'invalid reorder request' USING ERRCODE='22023'; END IF;
  SELECT * INTO entry FROM clinical.queue_entries WHERE id=p_entry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'queue entry is not reorderable or stale' USING ERRCODE='40001'; END IF;
  PERFORM clinical.assert_current_staff_scope_v1(entry.facility_id,entry.doctor_person_id,entry.civil_date,'queue.manage');
  SELECT record_id,is_new,response_body INTO idem_id,idem_new,idem_response FROM clinical.begin_mutation_v1('POST','/v1/queue-entries/{queueEntryId}/reorder');
  IF NOT idem_new THEN RETURN idem_response; END IF;
  SELECT q.queue_scope_id,q.waiting_order INTO scope_id,old_position FROM clinical.queue_entries q WHERE q.id=p_entry_id AND q.version=p_expected_version AND q.state='waiting';
  IF scope_id IS NULL THEN RAISE EXCEPTION 'queue entry is not reorderable or stale' USING ERRCODE='40001'; END IF;
  SELECT version INTO scope_version FROM clinical.queue_scopes WHERE id=scope_id FOR UPDATE;
  SELECT count(*)::integer INTO max_position FROM clinical.queue_entries q WHERE q.queue_scope_id=scope_id AND q.state='waiting';
  IF p_target_position>max_position THEN RAISE EXCEPTION 'target position is outside waiting queue' USING ERRCODE='22023'; END IF;
  PERFORM pg_catalog.set_config('shifaa.clinic_internal_transition','allowed',true);
  UPDATE clinical.queue_entries q SET waiting_order=1000000000+q.waiting_order WHERE q.queue_scope_id=scope_id AND q.state='waiting';
  FOR row_item IN SELECT q.id FROM clinical.queue_entries q WHERE q.queue_scope_id=scope_id AND q.state='waiting' AND q.id<>p_entry_id
    ORDER BY CASE WHEN q.waiting_order-1000000000<old_position AND old_position<=p_target_position THEN q.waiting_order-1000000000+1 WHEN q.waiting_order-1000000000>old_position AND old_position>=p_target_position THEN q.waiting_order-1000000000-1 ELSE q.waiting_order-1000000000 END,q.id LOOP
    IF next_position=p_target_position THEN next_position:=next_position+1; END IF;
    UPDATE clinical.queue_entries SET waiting_order=next_position WHERE id=row_item.id; next_position:=next_position+1;
  END LOOP;
  UPDATE clinical.queue_entries SET waiting_order=p_target_position,reorder_reason=p_reason,reordered_by_person_id=platform.context_person_id(),reordered_at=statement_timestamp() WHERE id=p_entry_id;
  UPDATE clinical.queue_scopes SET version=version+1,estimates_recalculated_at=statement_timestamp() WHERE id=scope_id;
  SELECT clinical.project_queue_v1(entry.facility_id,entry.doctor_person_id,entry.civil_date) INTO result;
  IF result IS NULL THEN RAISE EXCEPTION 'queue projection unavailable' USING ERRCODE='55000'; END IF;
  PERFORM clinical.record_mutation_effect_v2('clinical.queue.changed.v1','queue.entry.reordered','queue_entry',p_entry_id,((clinical.project_queue_entry_v1(p_entry_id))->>'version')::integer,entry.facility_id);
  PERFORM clinical.maybe_inject_failure_v1('reorder_queue_entry');
  PERFORM clinical.complete_mutation_v1(idem_id,200,'queue_entry',p_entry_id,result);
  RETURN result;
END $$;

CREATE FUNCTION clinical.send_doctor_delay_v1(p_facility_id uuid,p_doctor_person_id uuid,p_civil_date date,p_delay_minutes integer,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE schedule_row clinical.schedules%ROWTYPE; scope_id uuid; prior_id uuid; new_id uuid; result jsonb; effect record; idem_id uuid; idem_new boolean; idem_response jsonb; local_start timestamptz; local_end timestamptz;
BEGIN
  IF p_facility_id IS NULL OR p_doctor_person_id IS NULL OR p_civil_date IS NULL OR p_delay_minutes IS NULL OR p_delay_minutes<1 OR p_reason IS NULL OR octet_length(p_reason) NOT BETWEEN 1 AND 500 OR p_reason ~ E'[\\r\\n\\t]' THEN RAISE EXCEPTION 'invalid delay declaration' USING ERRCODE='22023'; END IF;
  SELECT * INTO schedule_row FROM clinical.schedules
  WHERE facility_id=p_facility_id AND doctor_person_id=p_doctor_person_id AND status='active' AND p_civil_date <@ valid_dates
  ORDER BY valid_from,id LIMIT 1 FOR UPDATE;
  IF NOT FOUND OR schedule_row.status<>'active' OR NOT (p_civil_date <@ schedule_row.valid_dates) THEN RAISE EXCEPTION 'schedule not found' USING ERRCODE='P0002'; END IF;
  PERFORM clinical.assert_current_staff_scope_v1(schedule_row.facility_id,schedule_row.doctor_person_id,p_civil_date,'delay.manage');
  SELECT record_id,is_new,response_body INTO idem_id,idem_new,idem_response FROM clinical.begin_mutation_v1('POST','/v1/clinics/{facilityId}/doctors/{doctorId}/delay');
  IF NOT idem_new THEN RETURN idem_response; END IF;
  local_start:=pg_catalog.make_timestamptz(EXTRACT(year FROM p_civil_date)::integer,EXTRACT(month FROM p_civil_date)::integer,EXTRACT(day FROM p_civil_date)::integer,0,0,0,schedule_row.timezone_name);
  local_end:=local_start+interval '1 day';
  INSERT INTO clinical.queue_scopes(facility_id,doctor_person_id,civil_date,timezone_name) VALUES(schedule_row.facility_id,schedule_row.doctor_person_id,p_civil_date,schedule_row.timezone_name) ON CONFLICT DO NOTHING;
  SELECT id,current_delay_exception_id INTO scope_id,prior_id FROM clinical.queue_scopes WHERE facility_id=schedule_row.facility_id AND doctor_person_id=schedule_row.doctor_person_id AND civil_date=p_civil_date FOR UPDATE;
  IF prior_id IS NOT NULL THEN UPDATE clinical.schedule_exceptions SET superseded_at=statement_timestamp() WHERE id=prior_id AND superseded_at IS NULL; END IF;
  INSERT INTO clinical.schedule_exceptions(schedule_id,facility_id,doctor_person_id,timezone_name,civil_date,starts_at,ends_at,exception_type,delay_minutes,reason,created_by_person_id,updated_by_person_id)
  VALUES(schedule_row.id,schedule_row.facility_id,schedule_row.doctor_person_id,schedule_row.timezone_name,p_civil_date,local_start,local_end,'delay',p_delay_minutes,p_reason,platform.context_person_id(),platform.context_person_id()) RETURNING id INTO new_id;
  UPDATE clinical.queue_scopes SET current_delay_exception_id=new_id,version=version+1,estimates_recalculated_at=statement_timestamp() WHERE id=scope_id;
  SELECT * INTO effect FROM clinical.record_mutation_effect_v2('clinical.doctor_delay.declared.v1','doctor.delay.declared','schedule_exception',new_id,1,schedule_row.facility_id);
  result:=clinical.project_delay_result_v1(new_id,effect.outbox_event_id);
  IF result IS NULL THEN RAISE EXCEPTION 'delay projection unavailable' USING ERRCODE='55000'; END IF;
  PERFORM clinical.maybe_inject_failure_v1('send_doctor_delay');
  PERFORM clinical.complete_mutation_v1(idem_id,200,'schedule_exception',new_id,result);
  RETURN result;
END $$;

CREATE FUNCTION clinical.declare_doctor_absence_v1(p_facility_id uuid,p_doctor_person_id uuid,p_civil_date date,p_starts_at timestamptz,p_ends_at timestamptz,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE schedule_row clinical.schedules%ROWTYPE; exception_id uuid; affected_ids uuid[]; removed_ids uuid[]; result jsonb; item uuid; app_row clinical.appointments%ROWTYPE; q_row clinical.queue_entries%ROWTYPE; idem_id uuid; idem_new boolean; idem_response jsonb;
BEGIN
  IF p_facility_id IS NULL OR p_doctor_person_id IS NULL OR p_civil_date IS NULL OR p_starts_at IS NULL OR p_ends_at IS NULL OR p_ends_at<=p_starts_at OR p_reason IS NULL OR octet_length(p_reason) NOT BETWEEN 1 AND 500 OR p_reason ~ E'[\\r\\n\\t]' THEN RAISE EXCEPTION 'invalid absence declaration' USING ERRCODE='22023'; END IF;
  SELECT * INTO schedule_row FROM clinical.schedules
  WHERE facility_id=p_facility_id AND doctor_person_id=p_doctor_person_id AND status='active' AND p_civil_date <@ valid_dates
  ORDER BY valid_from,id LIMIT 1 FOR UPDATE;
  IF NOT FOUND OR schedule_row.status<>'active' OR NOT (p_civil_date <@ schedule_row.valid_dates)
  THEN RAISE EXCEPTION 'schedule not found' USING ERRCODE='P0002'; END IF;
  IF (p_starts_at AT TIME ZONE schedule_row.timezone_name)::date IS DISTINCT FROM p_civil_date OR (p_ends_at AT TIME ZONE schedule_row.timezone_name)::date NOT IN (p_civil_date,p_civil_date+1)
  THEN RAISE EXCEPTION 'absence interval is outside the civil date' USING ERRCODE='22023'; END IF;
  PERFORM clinical.assert_current_staff_scope_v1(schedule_row.facility_id,schedule_row.doctor_person_id,p_civil_date,'absence.manage');
  SELECT record_id,is_new,response_body INTO idem_id,idem_new,idem_response FROM clinical.begin_mutation_v1('POST','/v1/clinics/{facilityId}/doctors/{doctorId}/absence');
  IF NOT idem_new THEN RETURN idem_response; END IF;
  -- Lock the affected appointments before deriving queue membership. This
  -- serializes a concurrent check-in with the absence cascade: a check-in
  -- that wins first is included in removed_ids, while a losing check-in sees
  -- reschedule_required and cannot create a waiting entry afterward.
  SELECT COALESCE(array_agg(a.id ORDER BY a.starts_at,a.id),'{}'::uuid[]) INTO affected_ids
  FROM (
    SELECT candidate.id,candidate.starts_at FROM clinical.appointments candidate
    WHERE candidate.schedule_id=schedule_row.id AND candidate.status IN ('confirmed','checked_in')
      AND candidate.occupied_range && tstzrange(p_starts_at,p_ends_at,'[)')
    ORDER BY candidate.starts_at,candidate.id FOR UPDATE
  ) a;
  SELECT COALESCE(array_agg(q.id ORDER BY q.queue_number,q.id),'{}'::uuid[]) INTO removed_ids FROM clinical.queue_entries q
  WHERE q.appointment_id=ANY(affected_ids) AND q.state IN ('waiting','called');
  INSERT INTO clinical.schedule_exceptions(schedule_id,facility_id,doctor_person_id,timezone_name,civil_date,starts_at,ends_at,exception_type,reason,created_by_person_id,updated_by_person_id)
   VALUES(schedule_row.id,schedule_row.facility_id,schedule_row.doctor_person_id,schedule_row.timezone_name,p_civil_date,p_starts_at,p_ends_at,'absence',p_reason,platform.context_person_id(),platform.context_person_id()) RETURNING id INTO exception_id;
  PERFORM pg_catalog.set_config('shifaa.clinic_internal_transition','allowed',true);
  UPDATE clinical.appointments SET status='reschedule_required',updated_by_person_id=platform.context_person_id() WHERE id=ANY(affected_ids);
  UPDATE clinical.queue_entries SET state='removed',removed_at=statement_timestamp() WHERE id=ANY(removed_ids);
  PERFORM clinical.record_mutation_effect_v2('clinical.doctor_absence.declared.v1','doctor.absence.declared','schedule_exception',exception_id,1,schedule_row.facility_id);
  FOREACH item IN ARRAY affected_ids LOOP
    SELECT * INTO app_row FROM clinical.appointments WHERE id=item;
    PERFORM clinical.record_mutation_effect_v2('clinical.appointment.changed.v1','appointment.reschedule_required','appointment',item,app_row.version,schedule_row.facility_id,app_row.patient_person_id);
  END LOOP;
  FOREACH item IN ARRAY removed_ids LOOP
    SELECT * INTO q_row FROM clinical.queue_entries WHERE id=item;
    PERFORM clinical.record_mutation_effect_v2('clinical.queue.changed.v1','queue.entry.removed','queue_entry',item,q_row.version,schedule_row.facility_id);
  END LOOP;
  result:=clinical.project_absence_result_v1(exception_id,affected_ids,removed_ids);
  IF result IS NULL THEN RAISE EXCEPTION 'absence projection unavailable' USING ERRCODE='55000'; END IF;
  PERFORM clinical.maybe_inject_failure_v1('declare_doctor_absence');
  PERFORM clinical.complete_mutation_v1(idem_id,200,'schedule_exception',exception_id,result);
  RETURN result;
END $$;

-- T036/T037 fixed read functions. These are the only API-role seams for
-- discovery and private projections; callers never receive direct table
-- privileges and no patient/contact/reason fields are present in the public
-- result shapes.
CREATE OR REPLACE FUNCTION clinical.search_doctors_v1(
  p_specialty text DEFAULT NULL,p_facility_id uuid DEFAULT NULL,
  p_latitude double precision DEFAULT NULL,p_longitude double precision DEFAULT NULL,
  p_radius_m integer DEFAULT 25000,p_civil_date date DEFAULT NULL,
  p_cursor_distance double precision DEFAULT NULL,p_cursor_doctor uuid DEFAULT NULL,
  p_cursor_facility uuid DEFAULT NULL,p_limit integer DEFAULT 101
)
RETURNS TABLE(
  doctor_id uuid,doctor_display_name text,specialty text,professional_license_verified boolean,
  facility_id uuid,facility_display_name text,facility_verified boolean,
  fee_minor_units bigint,currency_code char(3),payment_method text,
  next_starts_at timestamptz,next_ends_at timestamptz,next_timezone text,next_civil_date date,next_local_start time,
  distance_m double precision,availability_version integer,updated_at timestamptz,stale boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE query_point public.geography(Point,4326); target_date date := COALESCE(p_civil_date,platform.context_now()::date);
BEGIN
  IF p_radius_m NOT BETWEEN 100 AND 100000 OR p_limit NOT BETWEEN 1 AND 101
     OR (p_latitude IS NULL)<>(p_longitude IS NULL)
     OR (p_latitude IS NOT NULL AND (p_latitude NOT BETWEEN -90 AND 90 OR p_longitude NOT BETWEEN -180 AND 180))
     OR (p_cursor_doctor IS NULL)<>(p_cursor_facility IS NULL)
     OR (p_cursor_doctor IS NOT NULL AND p_latitude IS NOT NULL AND p_cursor_distance IS NULL)
     OR (p_latitude IS NULL AND p_cursor_distance IS NOT NULL)
  THEN RAISE EXCEPTION 'invalid doctor discovery query' USING ERRCODE='22023'; END IF;
  IF p_latitude IS NOT NULL THEN
    query_point := public.ST_SetSRID(public.ST_MakePoint(p_longitude,p_latitude),4326)::public.geography;
  END IF;
  RETURN QUERY
  WITH candidates AS (
    SELECT DISTINCT ON (s.facility_id,s.doctor_person_id)
      s,person.display_name AS doctor_name,
      COALESCE(NULLIF(license.specialty_code,''),license.profession) AS specialty_name,
      facility.name_en AS facility_name,
      CASE WHEN query_point IS NULL THEN NULL ELSE public.ST_Distance(facility.location,query_point) END AS measured_distance
    FROM clinical.schedules s
    JOIN identity.people person ON person.id=s.doctor_person_id AND person.profile_status='active'
    JOIN identity.facilities facility ON facility.id=s.facility_id AND facility.facility_status='active'
    JOIN identity.professional_licenses license ON license.person_id=s.doctor_person_id
      AND license.profession='doctor' AND license.status='verified' AND license.expires_on>=target_date
    JOIN identity.facility_memberships membership ON membership.facility_id=s.facility_id
      AND membership.person_id=s.doctor_person_id AND membership.role_code='doctor'
      AND membership.employment_license_id=license.id AND membership.membership_status='active'
      AND membership.valid_from<=platform.context_now()
      AND (membership.valid_until IS NULL OR membership.valid_until>platform.context_now())
    WHERE s.status='active' AND target_date <@ s.valid_dates
      AND (p_facility_id IS NULL OR s.facility_id=p_facility_id)
      AND (p_specialty IS NULL OR license.profession ILIKE p_specialty OR license.specialty_code ILIKE p_specialty)
      AND (query_point IS NULL OR (facility.location IS NOT NULL AND public.ST_DWithin(facility.location,query_point,p_radius_m)))
    ORDER BY s.facility_id,s.doctor_person_id,s.valid_from,s.id
  )
  SELECT (c.s).doctor_person_id,c.doctor_name,c.specialty_name,true,
    (c.s).facility_id,c.facility_name,true,(c.s).fee_minor_units,'EGP'::char(3),'cash_on_arrival',
    available.starts_at,available.ends_at,available.timezone_name,available.civil_date,available.local_start,
    c.measured_distance,(c.s).version,(c.s).updated_at,false
  FROM candidates c
  LEFT JOIN LATERAL (
    SELECT av.starts_at,av.ends_at,av.timezone_name,av.civil_date,av.local_start
    FROM clinical.list_availability_v1((c.s).id,target_date) av
    WHERE av.starts_at>platform.context_now()
    ORDER BY av.starts_at LIMIT 1
  ) available ON true
  WHERE p_cursor_doctor IS NULL OR
    (COALESCE(c.measured_distance,'Infinity'::double precision),(c.s).doctor_person_id,(c.s).facility_id) >
    (COALESCE(p_cursor_distance,'Infinity'::double precision),p_cursor_doctor,p_cursor_facility)
  ORDER BY c.measured_distance NULLS LAST,(c.s).doctor_person_id,(c.s).facility_id
  LIMIT p_limit;
END $$;

CREATE OR REPLACE FUNCTION clinical.list_doctor_availability_v1(
  p_facility_id uuid,p_doctor_person_id uuid,p_from_date date,p_to_date date,
  p_cursor timestamptz DEFAULT NULL,p_limit integer DEFAULT 101
)
RETURNS TABLE(
  facility_id uuid,doctor_id uuid,starts_at timestamptz,ends_at timestamptz,timezone_name text,civil_date date,local_start time,
  delay_minutes integer,fee_minor_units bigint,currency_code char(3),payment_method text,schedule_version integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE schedule_row clinical.schedules%ROWTYPE; day_value date; returned integer := 0;
BEGIN
  IF p_facility_id IS NULL OR p_doctor_person_id IS NULL OR p_from_date IS NULL OR p_to_date IS NULL
     OR p_to_date<p_from_date OR p_to_date-p_from_date>31 OR p_limit NOT BETWEEN 1 AND 101
  THEN RAISE EXCEPTION 'invalid availability query' USING ERRCODE='22023'; END IF;
  SELECT s.* INTO schedule_row FROM clinical.schedules s
  WHERE s.facility_id=p_facility_id AND s.doctor_person_id=p_doctor_person_id AND s.status='active'
    AND s.valid_dates && daterange(p_from_date,p_to_date+1,'[)')
  ORDER BY s.valid_from,s.id LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  FOR day_value IN SELECT value::date FROM generate_series(GREATEST(p_from_date,schedule_row.valid_from),LEAST(p_to_date,schedule_row.valid_to),interval '1 day') value ORDER BY value LOOP
    FOR facility_id,doctor_id,starts_at,ends_at,timezone_name,civil_date,local_start,delay_minutes IN
      SELECT p_facility_id,p_doctor_person_id,av.starts_at,av.ends_at,av.timezone_name,av.civil_date,av.local_start,av.delay_minutes
      FROM clinical.list_availability_v1(schedule_row.id,day_value) av
      WHERE p_cursor IS NULL OR av.starts_at>p_cursor
      ORDER BY av.starts_at
    LOOP
      fee_minor_units:=schedule_row.fee_minor_units; currency_code:='EGP'; payment_method:='cash_on_arrival'; schedule_version:=schedule_row.version;
      returned:=returned+1; RETURN NEXT;
      IF returned>=p_limit THEN RETURN; END IF;
    END LOOP;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION clinical.read_schedule_public_pricing_v1(
  p_facility_id uuid,p_doctor_person_id uuid,p_from_date date,p_to_date date
)
RETURNS TABLE(fee_minor_units bigint,currency_code char(3),payment_method text,schedule_version integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT s.fee_minor_units,s.currency_code,'cash_on_arrival'::text,s.version
  FROM clinical.schedules s
  WHERE s.facility_id=p_facility_id AND s.doctor_person_id=p_doctor_person_id
    AND s.status='active' AND s.valid_dates && daterange(p_from_date,p_to_date+1,'[)')
  ORDER BY s.valid_from,s.id LIMIT 1
$$;

CREATE OR REPLACE FUNCTION clinical.read_appointment_projection_v1(p_appointment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE appointment_row clinical.appointments%ROWTYPE; actor uuid:=platform.context_person_id(); allowed boolean:=false;
BEGIN
  SELECT * INTO appointment_row FROM clinical.appointments WHERE id=p_appointment_id;
  IF NOT FOUND OR actor IS NULL THEN RETURN NULL; END IF;
  IF appointment_row.patient_person_id=actor THEN
    PERFORM clinical.assert_current_patient_scope_v1(actor); allowed:=true;
  ELSE
    SELECT EXISTS(SELECT 1 FROM identity.facility_memberships m WHERE m.facility_id=appointment_row.facility_id AND m.person_id=actor AND m.membership_status='active') INTO allowed;
  END IF;
  IF NOT allowed THEN RETURN NULL; END IF;
  RETURN clinical.project_appointment_v1(p_appointment_id);
END $$;

CREATE OR REPLACE FUNCTION clinical.list_appointments_v1(
  p_patient_id uuid DEFAULT NULL,p_facility_id uuid DEFAULT NULL,p_doctor_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL,p_civil_date date DEFAULT NULL,p_cursor timestamptz DEFAULT NULL,p_limit integer DEFAULT 101
)
RETURNS TABLE(response jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=platform.context_person_id();
BEGIN
  IF actor IS NULL OR p_limit NOT BETWEEN 1 AND 101 THEN RAISE EXCEPTION 'invalid appointment query' USING ERRCODE='22023'; END IF;
  RETURN QUERY
  SELECT clinical.project_appointment_v1(a.id)
  FROM clinical.appointments a
  WHERE (a.patient_person_id=actor OR EXISTS(SELECT 1 FROM identity.facility_memberships m WHERE m.facility_id=a.facility_id AND m.person_id=actor AND m.membership_status='active'))
    AND (p_patient_id IS NULL OR a.patient_person_id=p_patient_id)
    AND (p_facility_id IS NULL OR a.facility_id=p_facility_id)
    AND (p_doctor_id IS NULL OR a.doctor_person_id=p_doctor_id)
    AND (p_status IS NULL OR a.status=p_status)
    AND (p_civil_date IS NULL OR a.civil_date=p_civil_date)
    AND (p_cursor IS NULL OR a.starts_at<p_cursor)
  ORDER BY a.starts_at DESC,a.id DESC LIMIT p_limit;
END $$;

CREATE OR REPLACE FUNCTION clinical.read_queue_projection_v1(
  p_facility_id uuid,p_doctor_id uuid,p_civil_date date,
  p_cursor_state_rank integer DEFAULT NULL,p_cursor_waiting_order integer DEFAULT NULL,
  p_cursor_queue_number bigint DEFAULT NULL,p_cursor_entry_id uuid DEFAULT NULL,
  p_expected_version integer DEFAULT NULL,p_limit integer DEFAULT 101
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE allowed boolean; actor uuid:=platform.context_person_id(); scope_row clinical.queue_scopes%ROWTYPE;
  entries_json jsonb; current_delay integer;
BEGIN
  IF p_limit NOT BETWEEN 1 AND 101 OR
     (p_cursor_state_rank IS NULL)<>(p_cursor_queue_number IS NULL) OR
     (p_cursor_state_rank IS NULL)<>(p_cursor_entry_id IS NULL) OR
     (p_cursor_state_rank IS NOT NULL AND p_expected_version IS NULL) OR
     (p_cursor_state_rank IS NOT NULL AND p_cursor_state_rank NOT BETWEEN 0 AND 3)
  THEN RAISE EXCEPTION 'invalid queue cursor' USING ERRCODE='22023'; END IF;
  SELECT EXISTS(SELECT 1 FROM identity.facility_memberships m WHERE m.facility_id=p_facility_id AND m.person_id=actor AND m.membership_status='active') INTO allowed;
  IF NOT allowed THEN RETURN NULL; END IF;
  SELECT s.* INTO scope_row FROM clinical.queue_scopes s
  WHERE s.facility_id=p_facility_id AND s.doctor_person_id=p_doctor_id AND s.civil_date=p_civil_date;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF p_expected_version IS NOT NULL AND p_expected_version<>scope_row.version THEN
    RAISE EXCEPTION 'queue version changed during pagination' USING ERRCODE='40001';
  END IF;
  SELECT e.delay_minutes INTO current_delay FROM clinical.schedule_exceptions e
  WHERE e.id=scope_row.current_delay_exception_id AND e.exception_type='delay' AND e.superseded_at IS NULL;
  SELECT COALESCE(pg_catalog.jsonb_agg(clinical.project_queue_entry_v1(page.id)
    ORDER BY page.state_rank,page.waiting_order NULLS LAST,page.queue_number,page.id),'[]'::jsonb)
  INTO entries_json
  FROM (
    SELECT q.id,q.waiting_order,q.queue_number,
      CASE q.state WHEN 'waiting' THEN 0 WHEN 'called' THEN 1 WHEN 'in_service' THEN 2 ELSE 3 END AS state_rank
    FROM clinical.queue_entries q WHERE q.queue_scope_id=scope_row.id
      AND (p_cursor_state_rank IS NULL OR
        (CASE q.state WHEN 'waiting' THEN 0 WHEN 'called' THEN 1 WHEN 'in_service' THEN 2 ELSE 3 END,
         COALESCE(q.waiting_order::bigint,9223372036854775807::bigint),q.queue_number,q.id) >
        (p_cursor_state_rank,COALESCE(p_cursor_waiting_order::bigint,9223372036854775807::bigint),p_cursor_queue_number,p_cursor_entry_id))
    ORDER BY state_rank,q.waiting_order NULLS LAST,q.queue_number,q.id
    LIMIT p_limit
  ) page;
  RETURN pg_catalog.jsonb_build_object(
    'facilityId',scope_row.facility_id,'doctorId',scope_row.doctor_person_id,
    'civilDate',scope_row.civil_date,'version',scope_row.version,
    'entries',entries_json,'nextCursor',NULL::text
  ) || CASE WHEN current_delay IS NULL THEN '{}'::jsonb
           ELSE pg_catalog.jsonb_build_object('delayMinutes',current_delay) END;
END $$;

CREATE OR REPLACE FUNCTION clinical.read_queue_position_v1(p_appointment_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT pg_catalog.jsonb_build_object(
    'appointmentId',p_appointment_id,'state',q.state,'queueNumber',q.queue_number,
    'position',q.waiting_order,'estimatedServiceAt',q.estimated_service_at,
    'queueVersion',q.version,'updatedAt',q.updated_at,'stale',false
  )
  FROM clinical.read_my_queue_position_v1(p_appointment_id) q
$$;

REVOKE ALL ON FUNCTION clinical.create_schedule_v1(jsonb),clinical.update_schedule_v1(uuid,integer,jsonb),clinical.create_schedule_exception_v1(jsonb),clinical.create_appointment_v1(jsonb),clinical.reschedule_appointment_v1(uuid,integer,timestamptz,timestamptz,date,time,text),clinical.cancel_appointment_v1(uuid,integer,text),clinical.check_in_appointment_v1(uuid,integer),clinical.call_queue_entry_v1(uuid,integer),clinical.complete_queue_entry_v1(uuid,integer),clinical.reorder_queue_entry_v1(uuid,integer,integer,text),clinical.send_doctor_delay_v1(uuid,uuid,date,integer,text),clinical.declare_doctor_absence_v1(uuid,uuid,date,timestamptz,timestamptz,text),clinical.claim_idempotency_v1(text,text,text,text),clinical.record_mutation_effect_v1(text,text,text,uuid,integer,uuid,uuid,text),clinical.search_doctors_v1(text,uuid,double precision,double precision,integer,date,double precision,uuid,uuid,integer),clinical.list_doctor_availability_v1(uuid,uuid,date,date,timestamptz,integer),clinical.read_schedule_public_pricing_v1(uuid,uuid,date,date),clinical.read_appointment_projection_v1(uuid),clinical.list_appointments_v1(uuid,uuid,uuid,text,date,timestamptz,integer),clinical.read_queue_projection_v1(uuid,uuid,date,integer,integer,bigint,uuid,integer,integer),clinical.read_queue_position_v1(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION clinical.project_schedule_v1(uuid),clinical.project_schedule_exception_v1(uuid),clinical.project_appointment_v1(uuid),clinical.project_queue_entry_v1(uuid),clinical.project_queue_v1(uuid,uuid,date),clinical.project_check_in_v1(uuid,uuid),clinical.project_delay_result_v1(uuid,uuid),clinical.project_absence_result_v1(uuid,uuid[],uuid[]),clinical.begin_mutation_v1(text,text),clinical.complete_mutation_v1(uuid,integer,text,uuid,jsonb),clinical.record_mutation_effect_v2(text,text,text,uuid,integer,uuid,uuid),clinical.schedule_window_parent_version_v1() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION clinical.create_schedule_v1(jsonb),clinical.update_schedule_v1(uuid,integer,jsonb),clinical.create_schedule_exception_v1(jsonb),clinical.create_appointment_v1(jsonb),clinical.reschedule_appointment_v1(uuid,integer,timestamptz,timestamptz,date,time,text),clinical.list_availability_v1(uuid,date),clinical.cancel_appointment_v1(uuid,integer,text),clinical.check_in_appointment_v1(uuid,integer),clinical.call_queue_entry_v1(uuid,integer),clinical.complete_queue_entry_v1(uuid,integer),clinical.reorder_queue_entry_v1(uuid,integer,integer,text),clinical.send_doctor_delay_v1(uuid,uuid,date,integer,text),clinical.declare_doctor_absence_v1(uuid,uuid,date,timestamptz,timestamptz,text),clinical.search_doctors_v1(text,uuid,double precision,double precision,integer,date,double precision,uuid,uuid,integer),clinical.list_doctor_availability_v1(uuid,uuid,date,date,timestamptz,integer),clinical.read_schedule_public_pricing_v1(uuid,uuid,date,date),clinical.read_appointment_projection_v1(uuid),clinical.list_appointments_v1(uuid,uuid,uuid,text,date,timestamptz,integer),clinical.read_queue_projection_v1(uuid,uuid,date,integer,integer,bigint,uuid,integer,integer),clinical.read_queue_position_v1(uuid) TO shifaa_api;

-- Expand-phase flags: all are explicitly off; later activation is local/test
-- only and keeps mutation and dispatch kill switches independent.
INSERT INTO platform.feature_flags(code,environment,enabled,constraints)
SELECT code,environment,false,constraints::jsonb
FROM (VALUES
 ('clinic_scheduling.server','local','{"stage":"expand","safe_reads":true}'),
 ('clinic_scheduling.server','ci','{"stage":"expand","safe_reads":true}'),
 ('clinic_scheduling.server','production','{"stage":"expand","safe_reads":true}'),
 ('clinic_scheduling.mutations','local','{"stage":"validate","kill_switch":true}'),
 ('clinic_scheduling.mutations','ci','{"stage":"validate","kill_switch":true}'),
 ('clinic_scheduling.mutations','production','{"stage":"validate","kill_switch":true}'),
 ('clinic_scheduling.dispatch','local','{"stage":"validate","production_sms":false}'),
 ('clinic_scheduling.dispatch','ci','{"stage":"validate","production_sms":false}'),
 ('clinic_scheduling.dispatch','production','{"stage":"validate","production_sms":false,"OPEN-VENDOR-002":"retained"}')
) AS seed(code,environment,constraints)
ON CONFLICT(code,environment) DO UPDATE SET enabled=false,constraints=EXCLUDED.constraints,version=platform.feature_flags.version+1,updated_at=statement_timestamp();

ALTER TABLE platform.outbox_events DROP CONSTRAINT IF EXISTS outbox_events_event_type_check;
ALTER TABLE platform.outbox_events ADD CONSTRAINT outbox_events_event_type_check CHECK(event_type IN (
 'identity.verification.changed','identity.manual_review.requested','consent.changed','facility.changed','professional_license.changed','membership.changed','admin_role.changed',
 'relationship.guardianship.changed','relationship.guardianship.created','relationship.guardianship.active','relationship.guardianship.rejected','relationship.guardianship.revoked','relationship.delegation.changed','relationship.delegation.created','relationship.delegation.accepted','relationship.delegation.updated','relationship.delegation.revoked','emergency_contact.changed','emergency_contact.created','emergency_contact.confirmed','emergency_contact.declined','emergency_contact.revoked','sos.emergency_contact.requested','sos.emergency_contact.denied','sos.incident.created','sos.incident.accepted','sos.incident.closed','sos.share.created','sos.share.revoked','sos.share.viewed','privacy.dsr.submitted','privacy.dsr.status_changed','privacy.dsr.export_ready','privacy.dsr.export_consumed','privacy.dsr.identity_required','notification.template.drafted','notification.template.published','notification.delivery.requested','notification.delivery.receipt_recorded','notification.delivery.replay_requested',
 'clinical.schedule.changed.v1','clinical.appointment.changed.v1','clinical.queue.changed.v1','clinical.doctor_delay.declared.v1','clinical.doctor_absence.declared.v1'
));

-- Extend the existing aggregate-version uniqueness boundary to the six
-- Feature 009 event types so retries cannot enqueue a second effect.
DROP INDEX IF EXISTS platform.outbox_aggregate_version_uq;
CREATE UNIQUE INDEX outbox_aggregate_version_uq
  ON platform.outbox_events(aggregate_type,aggregate_id,aggregate_version)
  WHERE event_type IN (
    'privacy.dsr.submitted','privacy.dsr.status_changed','privacy.dsr.export_ready','privacy.dsr.export_consumed','privacy.dsr.identity_required',
    'notification.template.drafted','notification.template.published','notification.delivery.requested','notification.delivery.receipt_recorded','notification.delivery.replay_requested',
    'sos.incident.created','sos.incident.accepted','sos.incident.closed','sos.share.created','sos.share.revoked','sos.share.viewed','sos.emergency_contact.requested',
    'identity.factor.changed','identity.recovery.completed','identity.transition.submitted','identity.transition.decided','audit.export.requested',
    'clinical.schedule.changed.v1','clinical.appointment.changed.v1','clinical.queue.changed.v1','clinical.doctor_delay.declared.v1','clinical.doctor_absence.declared.v1'
  );

-- Feature 009 notification workers never receive clinical table privileges.
-- These fixed SECURITY DEFINER seams claim only the two notification event
-- families and project the minimum current recipient fields.  Reasons,
-- contact destinations, tokens, credentials, and arbitrary event payloads
-- remain inside the database boundary.
CREATE OR REPLACE FUNCTION platform.claim_next_clinic_scheduling_notification_event(
  p_worker_id text,p_lease_seconds integer DEFAULT 30
)
RETURNS TABLE(
  event_id uuid,event_type text,aggregate_id uuid,aggregate_version integer,
  attempt_count integer,lease_expires_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,platform AS $$
BEGIN
  IF platform.context_environment() NOT IN ('local','ci')
     OR NOT platform.feature_enabled('clinic_scheduling.dispatch',platform.context_environment())
     OR p_worker_id IS NULL OR p_worker_id !~ '^[a-zA-Z0-9._:-]{1,96}$'
     OR p_lease_seconds NOT BETWEEN 5 AND 300 THEN
    RETURN;
  END IF;
  RETURN QUERY
  WITH candidate AS MATERIALIZED (
    SELECT e.id,e.event_type,e.aggregate_id,e.aggregate_version
    FROM platform.outbox_events e
    WHERE e.event_type IN ('clinical.doctor_delay.declared.v1','clinical.doctor_absence.declared.v1')
      AND (e.state='pending' OR (e.state='processing' AND e.lease_expires_at<statement_timestamp()))
      AND e.available_at<=statement_timestamp()
      AND NOT EXISTS (
        SELECT 1 FROM platform.outbox_events earlier
        WHERE earlier.aggregate_type=e.aggregate_type AND earlier.aggregate_id=e.aggregate_id
          AND earlier.aggregate_version<e.aggregate_version
          AND earlier.event_type IN ('clinical.doctor_delay.declared.v1','clinical.doctor_absence.declared.v1')
          AND earlier.state NOT IN ('delivered','dead_letter')
      )
    ORDER BY e.available_at,e.created_at,e.id
    FOR UPDATE OF e SKIP LOCKED LIMIT 1
  ), claimed AS (
    UPDATE platform.outbox_events e
    SET state='processing',attempt_count=e.attempt_count+1,lease_owner=p_worker_id,
      lease_expires_at=statement_timestamp()+make_interval(secs=>p_lease_seconds),updated_at=statement_timestamp()
    FROM candidate c WHERE e.id=c.id
    RETURNING e.id,e.event_type,e.aggregate_id,e.aggregate_version,e.attempt_count,e.lease_expires_at
  )
  SELECT c.id,c.event_type,c.aggregate_id,c.aggregate_version,c.attempt_count,c.lease_expires_at
  FROM claimed c;
END $$;

CREATE OR REPLACE FUNCTION platform.clinic_scheduling_notification_recipients(
  p_event_id uuid,p_worker_id text
)
RETURNS TABLE(recipient_person_id uuid,locale text,field_values jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,platform,clinical,identity AS $$
DECLARE event_row platform.outbox_events%ROWTYPE; exception_row clinical.schedule_exceptions%ROWTYPE;
BEGIN
  IF platform.context_environment() NOT IN ('local','ci')
     OR NOT platform.feature_enabled('clinic_scheduling.dispatch',platform.context_environment())
     OR p_worker_id IS NULL OR p_worker_id !~ '^[a-zA-Z0-9._:-]{1,96}$' THEN RETURN; END IF;
  SELECT * INTO event_row FROM platform.outbox_events
  WHERE id=p_event_id AND event_type IN ('clinical.doctor_delay.declared.v1','clinical.doctor_absence.declared.v1')
    AND state='processing' AND lease_owner=p_worker_id AND lease_expires_at>statement_timestamp();
  IF NOT FOUND THEN RETURN; END IF;
  SELECT e.* INTO exception_row FROM clinical.schedule_exceptions e
  WHERE e.id=event_row.aggregate_id AND e.superseded_at IS NULL
    AND e.version=event_row.aggregate_version;
  IF NOT FOUND THEN RETURN; END IF;
  IF event_row.event_type='clinical.doctor_delay.declared.v1' AND exception_row.exception_type<>'delay' THEN RETURN; END IF;
  IF event_row.event_type='clinical.doctor_absence.declared.v1' AND exception_row.exception_type<>'absence' THEN RETURN; END IF;
  RETURN QUERY
  SELECT a.patient_person_id,patient.preferred_locale,
    CASE WHEN event_row.event_type='clinical.doctor_delay.declared.v1' THEN
      pg_catalog.jsonb_build_object(
        'action_reference', 'appointment',
        'appointment_reference', a.id::text,
        'delay_date_label', exception_row.civil_date::text,
        'delay_minutes_label', exception_row.delay_minutes::text,
        'doctor_display_name', doctor.display_name,
        'facility_display_name', facility.name_en
      )
    ELSE
      pg_catalog.jsonb_build_object(
        'affected_interval_label',
          pg_catalog.to_char(exception_row.starts_at AT TIME ZONE exception_row.timezone_name,'YYYY-MM-DD HH24:MI')||' - '||
          pg_catalog.to_char(exception_row.ends_at AT TIME ZONE exception_row.timezone_name,'YYYY-MM-DD HH24:MI'),
        'appointment_reference', a.id::text,
        'doctor_display_name', doctor.display_name,
        'facility_display_name', facility.name_en,
        'replacement_instruction', CASE WHEN patient.preferred_locale='ar-EG'
          THEN 'راجع شاشة الموعد لاختيار موعد بديل.' ELSE 'Use the appointment screen to choose a replacement.' END
      )
    END
  FROM clinical.appointments a
  JOIN identity.people patient ON patient.id=a.patient_person_id AND patient.profile_status='active'
  JOIN identity.people doctor ON doctor.id=a.doctor_person_id AND doctor.profile_status='active'
  JOIN identity.facilities facility ON facility.id=a.facility_id AND facility.facility_status='active'
  WHERE a.schedule_id=exception_row.schedule_id
    AND a.facility_id=exception_row.facility_id
    AND a.doctor_person_id=exception_row.doctor_person_id
    AND a.civil_date=exception_row.civil_date
    AND (
      (event_row.event_type='clinical.doctor_delay.declared.v1' AND a.status IN ('confirmed','checked_in'))
      OR (event_row.event_type='clinical.doctor_absence.declared.v1' AND a.status='reschedule_required'
          AND a.occupied_range && exception_row.effective_range)
    )
  ORDER BY a.starts_at,a.id;
END $$;

CREATE OR REPLACE FUNCTION platform.complete_clinic_scheduling_notification_event(
  p_event_id uuid,p_worker_id text,p_outcome text,p_safe_error_code text DEFAULT NULL,p_retry_at timestamptz DEFAULT NULL
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,platform AS $$
DECLARE changed integer; next_state text;
BEGIN
  IF p_outcome NOT IN ('delivered','retry','dead_letter') THEN
    RAISE EXCEPTION 'invalid clinic notification outcome' USING ERRCODE='22023';
  END IF;
  IF p_safe_error_code IS NOT NULL AND p_safe_error_code !~ '^[a-z0-9._-]{1,64}$' THEN
    RAISE EXCEPTION 'invalid clinic notification error code' USING ERRCODE='22023';
  END IF;
  IF p_outcome='retry' AND (p_retry_at IS NULL OR p_retry_at<=statement_timestamp()
     OR p_retry_at>statement_timestamp()+interval '1 day') THEN
    RAISE EXCEPTION 'invalid clinic notification retry time' USING ERRCODE='22023';
  END IF;
  IF p_outcome IN ('delivered','dead_letter') AND p_retry_at IS NOT NULL THEN
    RAISE EXCEPTION 'terminal clinic notification cannot carry retry time' USING ERRCODE='22023';
  END IF;
  next_state:=CASE p_outcome WHEN 'delivered' THEN 'delivered' WHEN 'retry' THEN 'pending' ELSE 'dead_letter' END;
  UPDATE platform.outbox_events e
  SET state=next_state,available_at=COALESCE(p_retry_at,e.available_at),last_error_code=p_safe_error_code,
    lease_owner=NULL,lease_expires_at=NULL,updated_at=statement_timestamp()
  WHERE e.id=p_event_id
    AND e.event_type IN ('clinical.doctor_delay.declared.v1','clinical.doctor_absence.declared.v1')
    AND e.state='processing' AND e.lease_owner=p_worker_id AND e.lease_expires_at>statement_timestamp();
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed=1 AND p_outcome IN ('delivered','dead_letter') THEN
    INSERT INTO platform.event_receipts(event_id,consumer,result_code)
    VALUES(p_event_id,'clinic-scheduling-notifications',p_outcome)
    ON CONFLICT(event_id,consumer) DO NOTHING;
  END IF;
  RETURN changed=1;
END $$;

-- Feature 009 uses the shared keyed synthetic receipt registry, but has its
-- own feature gate.  It must not call the Feature 006 SOS delivery seam:
-- clinic dispatch remains independently switchable in local/CI and is never
-- a production provider boundary.
CREATE OR REPLACE FUNCTION platform.deliver_clinic_scheduling_local_synthetic_message(
  p_provider_key text,p_destination_alias_digest text,p_rendered_digest text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,platform AS $$
DECLARE receipt platform.synthetic_message_receipts;
BEGIN
  IF platform.context_environment() NOT IN ('local','ci')
     OR NOT platform.feature_enabled('clinic_scheduling.dispatch',platform.context_environment()) THEN
    RAISE EXCEPTION 'clinic scheduling local synthetic messaging is disabled' USING ERRCODE='42501';
  END IF;
  IF p_provider_key !~ '^[a-f0-9]{64}$'
     OR p_destination_alias_digest !~ '^[a-f0-9]{64}$'
     OR p_rendered_digest !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'invalid clinic synthetic message digest' USING ERRCODE='22023';
  END IF;
  INSERT INTO platform.synthetic_message_receipts(
    provider_idempotency_key,destination_alias_digest,rendered_digest
  ) VALUES(p_provider_key,p_destination_alias_digest,p_rendered_digest)
  ON CONFLICT(provider_idempotency_key) DO NOTHING;
  SELECT * INTO receipt FROM platform.synthetic_message_receipts
  WHERE provider_idempotency_key=p_provider_key;
  IF receipt.destination_alias_digest<>p_destination_alias_digest
     OR receipt.rendered_digest<>p_rendered_digest THEN
    RAISE EXCEPTION 'clinic synthetic provider dedup payload mismatch' USING ERRCODE='23505';
  END IF;
  RETURN 'synthetic-receipt-'||substr(encode(public.digest(p_provider_key,'sha256'),'hex'),1,16);
END $$;

-- Feature 009 notifications are one-per-affected-appointment.  Preserve the
-- Feature 005 recipient/event uniqueness for every notification without an
-- appointment reference, while allowing distinct appointment projections for
-- one exception event and retaining replay dedup for the same appointment.
ALTER TABLE platform.notifications
  ADD COLUMN IF NOT EXISTS delivery_scope_key text NOT NULL DEFAULT ''
    CHECK (length(delivery_scope_key)<=128);
CREATE OR REPLACE FUNCTION platform.guard_notification_delivery_scope()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,platform AS $$
DECLARE source_type text;
BEGIN
  SELECT event_type INTO source_type FROM platform.outbox_events WHERE id=NEW.source_event_id;
  IF source_type IN ('clinical.doctor_delay.declared.v1','clinical.doctor_absence.declared.v1') THEN
    IF NEW.delivery_scope_key !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       OR NEW.delivery_scope_key<>COALESCE(NEW.field_values->>'appointment_reference','') THEN
      RAISE EXCEPTION 'invalid clinic notification delivery scope' USING ERRCODE='22023';
    END IF;
  ELSIF NEW.delivery_scope_key<>'' THEN
    RAISE EXCEPTION 'non-clinic notification delivery scope is not permitted' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notification_delivery_scope_guard ON platform.notifications;
CREATE TRIGGER notification_delivery_scope_guard
  BEFORE INSERT OR UPDATE OF delivery_scope_key,field_values,source_event_id ON platform.notifications
  FOR EACH ROW EXECUTE FUNCTION platform.guard_notification_delivery_scope();
REVOKE ALL ON FUNCTION platform.guard_notification_delivery_scope() FROM PUBLIC,shifaa_api,shifaa_worker;
DO $$
DECLARE constraint_name text;
BEGIN
  SELECT c.conname INTO constraint_name
  FROM pg_constraint c
  WHERE c.conrelid='platform.notifications'::regclass
    AND c.contype='u'
    AND pg_get_constraintdef(c.oid) LIKE '%template_release_id, source_event_id, recipient_type, recipient_person_id, channel%';
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE platform.notifications DROP CONSTRAINT %I',constraint_name);
  END IF;
END $$;
DROP INDEX IF EXISTS platform.notifications_patient_dedup_uq;
CREATE UNIQUE INDEX IF NOT EXISTS notifications_patient_dedup_uq
  ON platform.notifications(
    template_release_id,source_event_id,recipient_type,recipient_person_id,channel,delivery_scope_key
  );

REVOKE ALL ON FUNCTION platform.claim_next_clinic_scheduling_notification_event(text,integer),
  platform.clinic_scheduling_notification_recipients(uuid,text),
  platform.complete_clinic_scheduling_notification_event(uuid,text,text,text,timestamptz),
  platform.deliver_clinic_scheduling_local_synthetic_message(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.claim_next_clinic_scheduling_notification_event(text,integer),
  platform.clinic_scheduling_notification_recipients(uuid,text),
  platform.complete_clinic_scheduling_notification_event(uuid,text,text,text,timestamptz),
  platform.deliver_clinic_scheduling_local_synthetic_message(text,text,text) TO shifaa_worker;

COMMIT;
