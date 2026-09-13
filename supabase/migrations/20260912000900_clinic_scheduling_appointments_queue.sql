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
  currency_code char(3) NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  payment_method text NOT NULL DEFAULT 'cash_on_arrival',
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('requested','confirmed','checked_in','in_queue','in_consultation','completed','cancelled','no_show','reschedule_required')),
  source_referral_id uuid,
  cancellation_reason text CHECK (cancellation_reason IS NULL OR (octet_length(cancellation_reason) BETWEEN 1 AND 512 AND cancellation_reason !~ E'[\\r\\n\\t]')),
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
  p_civil_date date,p_local_start time
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE appointment_id uuid; actor uuid := platform.context_person_id();
  original clinical.appointments%ROWTYPE; schedule_row clinical.schedules%ROWTYPE;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'authenticated actor required' USING ERRCODE='42501'; END IF;
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

REVOKE ALL ON FUNCTION clinical.create_schedule_v1(jsonb),clinical.update_schedule_v1(uuid,integer,jsonb),clinical.create_schedule_exception_v1(jsonb),clinical.create_appointment_v1(jsonb),clinical.reschedule_appointment_v1(uuid,integer,timestamptz,timestamptz,date,time),clinical.list_availability_v1(uuid,date),clinical.cancel_appointment_v1(uuid,integer,text),clinical.check_in_appointment_v1(uuid,integer),clinical.call_queue_entry_v1(uuid,integer),clinical.complete_queue_entry_v1(uuid,integer),clinical.reorder_queue_entry_v1(uuid,integer,integer,text),clinical.send_doctor_delay_v1(uuid,date,timestamptz,timestamptz,integer,text),clinical.declare_doctor_absence_v1(uuid,date,timestamptz,timestamptz,text),clinical.claim_idempotency_v1(text,text,text,text),clinical.record_mutation_effect_v1(text,text,text,uuid,integer,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION clinical.create_schedule_v1(jsonb),clinical.update_schedule_v1(uuid,integer,jsonb),clinical.create_schedule_exception_v1(jsonb),clinical.create_appointment_v1(jsonb),clinical.reschedule_appointment_v1(uuid,integer,timestamptz,timestamptz,date,time),clinical.list_availability_v1(uuid,date),clinical.cancel_appointment_v1(uuid,integer,text),clinical.check_in_appointment_v1(uuid,integer),clinical.call_queue_entry_v1(uuid,integer),clinical.complete_queue_entry_v1(uuid,integer),clinical.reorder_queue_entry_v1(uuid,integer,integer,text),clinical.send_doctor_delay_v1(uuid,date,timestamptz,timestamptz,integer,text),clinical.declare_doctor_absence_v1(uuid,date,timestamptz,timestamptz,text) TO shifaa_api;

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

COMMIT;
