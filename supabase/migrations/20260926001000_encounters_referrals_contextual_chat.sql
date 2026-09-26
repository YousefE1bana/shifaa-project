BEGIN;

CREATE SCHEMA IF NOT EXISTS clinical;
CREATE SCHEMA IF NOT EXISTS trust;

CREATE TABLE IF NOT EXISTS clinical.encounters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_person_id uuid NOT NULL REFERENCES identity.people(id) ON DELETE RESTRICT,
  facility_id uuid NOT NULL REFERENCES identity.facilities(id) ON DELETE RESTRICT,
  appointment_id uuid REFERENCES clinical.appointments(id) ON DELETE RESTRICT,
  responsible_clinician_id uuid NOT NULL REFERENCES identity.people(id) ON DELETE RESTRICT,
  encounter_type text NOT NULL CHECK (btrim(encounter_type) <> ''),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed')),
  started_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  ended_at timestamptz,
  completion_summary text,
  condition_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  observation_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  order_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT encounters_completion_state_check CHECK (
    (status = 'open' AND ended_at IS NULL AND completion_summary IS NULL)
    OR
    (status = 'completed' AND ended_at IS NOT NULL AND completion_summary IS NOT NULL AND btrim(completion_summary) <> '')
  ),
  CONSTRAINT encounters_completion_after_start_check CHECK (ended_at IS NULL OR ended_at > started_at),
  CONSTRAINT encounters_id_patient_person_uq UNIQUE (id, patient_person_id)
);

COMMENT ON COLUMN clinical.encounters.appointment_id IS
  'Nullable in the general encounter model; the F010 createEncounter producer requires a linked appointment.';

CREATE TABLE IF NOT EXISTS clinical.encounter_participants (
  encounter_id uuid NOT NULL REFERENCES clinical.encounters(id) ON DELETE RESTRICT,
  person_id uuid NOT NULL REFERENCES identity.people(id) ON DELETE RESTRICT,
  role_code text NOT NULL CHECK (btrim(role_code) <> ''),
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT encounter_participants_pkey PRIMARY KEY (encounter_id, person_id, role_code, started_at),
  CONSTRAINT encounter_participants_interval_check CHECK (ended_at IS NULL OR ended_at > started_at)
);

CREATE TABLE IF NOT EXISTS clinical.clinical_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id uuid NOT NULL REFERENCES clinical.encounters(id) ON DELETE RESTRICT,
  author_person_id uuid NOT NULL REFERENCES identity.people(id) ON DELETE RESTRICT,
  note_type text NOT NULL CHECK (btrim(note_type) <> ''),
  body_ciphertext bytea NOT NULL CHECK (octet_length(body_ciphertext) > 0),
  visibility_code text NOT NULL CHECK (visibility_code IN ('private', 'patient_visible')),
  signed_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  supersedes_id uuid,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT clinical_notes_id_encounter_uq UNIQUE (id, encounter_id),
  CONSTRAINT clinical_notes_supersedes_same_encounter_fk
    FOREIGN KEY (supersedes_id, encounter_id)
    REFERENCES clinical.clinical_notes(id, encounter_id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS clinical.conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES identity.patients(id) ON DELETE RESTRICT,
  code_system text NOT NULL CHECK (btrim(code_system) <> ''),
  code text NOT NULL CHECK (btrim(code) <> ''),
  display_name_ar text NOT NULL CHECK (btrim(display_name_ar) <> ''),
  display_name_en text NOT NULL CHECK (btrim(display_name_en) <> ''),
  clinical_status text NOT NULL,
  verification_status text NOT NULL,
  onset_date date,
  abatement_date date,
  recorded_by_person_id uuid NOT NULL REFERENCES identity.people(id) ON DELETE RESTRICT,
  verified_by_person_id uuid REFERENCES identity.people(id) ON DELETE RESTRICT,
  pending_standardization boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT conditions_abatement_after_onset_check CHECK (
    abatement_date IS NULL OR onset_date IS NULL OR abatement_date >= onset_date
  )
);

CREATE TABLE IF NOT EXISTS clinical.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_encounter_id uuid NOT NULL REFERENCES clinical.encounters(id) ON DELETE RESTRICT,
  patient_id uuid NOT NULL REFERENCES identity.patients(id) ON DELETE RESTRICT,
  requester_person_id uuid NOT NULL REFERENCES identity.people(id) ON DELETE RESTRICT,
  target_specialty text NOT NULL CHECK (btrim(target_specialty) <> ''),
  target_facility_id uuid REFERENCES identity.facilities(id) ON DELETE RESTRICT,
  target_doctor_person_id uuid REFERENCES identity.people(id) ON DELETE RESTRICT,
  reason_summary text NOT NULL CHECK (btrim(reason_summary) <> ''),
  encounter_type text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  resulting_appointment_id uuid REFERENCES clinical.appointments(id) ON DELETE RESTRICT,
  accepted_field_codes text[],
  accepted_by_person_id uuid REFERENCES identity.people(id) ON DELETE RESTRICT,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT referrals_acceptance_fields_check CHECK (
    (
      status = 'pending'
      AND resulting_appointment_id IS NULL
      AND accepted_field_codes IS NULL
      AND accepted_by_person_id IS NULL
      AND accepted_at IS NULL
    )
    OR
    (
      status = 'accepted'
      AND resulting_appointment_id IS NOT NULL
      AND target_facility_id IS NOT NULL
      AND target_doctor_person_id IS NOT NULL
      AND accepted_field_codes IS NOT NULL
      AND accepted_field_codes IN (
        ARRAY['reason_summary']::text[],
        ARRAY['reason_summary', 'encounter_type']::text[]
      )
      AND (cardinality(accepted_field_codes) = 1 OR encounter_type IS NOT NULL)
      AND accepted_by_person_id IS NOT NULL
      AND accepted_at IS NOT NULL
    )
  )
);

CREATE TABLE IF NOT EXISTS trust.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  context_type text NOT NULL DEFAULT 'appointment' CHECK (context_type = 'appointment'),
  context_id uuid NOT NULL REFERENCES clinical.appointments(id) ON DELETE RESTRICT,
  sender_person_id uuid NOT NULL REFERENCES identity.people(id) ON DELETE RESTRICT,
  body_ciphertext bytea NOT NULL CHECK (octet_length(body_ciphertext) > 0),
  attachment jsonb,
  sent_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  edited_at timestamptz,
  deleted_at timestamptz,
  CONSTRAINT messages_attachment_null_check CHECK (attachment IS NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS encounters_open_appointment_uq
  ON clinical.encounters (appointment_id)
  WHERE status = 'open';
CREATE INDEX IF NOT EXISTS encounters_patient_facility_started_idx
  ON clinical.encounters (patient_person_id, facility_id, started_at DESC, id);
CREATE INDEX IF NOT EXISTS encounters_facility_started_idx
  ON clinical.encounters (facility_id, started_at DESC, id);
CREATE INDEX IF NOT EXISTS encounters_responsible_clinician_idx
  ON clinical.encounters (responsible_clinician_id, started_at DESC, id);
CREATE INDEX IF NOT EXISTS encounters_appointment_idx
  ON clinical.encounters (appointment_id)
  WHERE appointment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS encounter_participants_active_uq
  ON clinical.encounter_participants (encounter_id, person_id, role_code)
  WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS encounter_participants_person_interval_idx
  ON clinical.encounter_participants (person_id, encounter_id, started_at DESC);

CREATE INDEX IF NOT EXISTS clinical_notes_encounter_signed_idx
  ON clinical.clinical_notes (encounter_id, signed_at DESC, id);
CREATE INDEX IF NOT EXISTS clinical_notes_supersedes_idx
  ON clinical.clinical_notes (supersedes_id)
  WHERE supersedes_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS clinical_notes_author_idx
  ON clinical.clinical_notes (author_person_id, signed_at DESC, id);

CREATE INDEX IF NOT EXISTS conditions_patient_code_status_idx
  ON clinical.conditions (patient_id, code_system, code, clinical_status, verification_status);
CREATE INDEX IF NOT EXISTS conditions_recorder_idx
  ON clinical.conditions (recorded_by_person_id, created_at DESC, id);
CREATE INDEX IF NOT EXISTS conditions_verifier_idx
  ON clinical.conditions (verified_by_person_id, created_at DESC, id)
  WHERE verified_by_person_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS referrals_resulting_appointment_uq
  ON clinical.referrals (resulting_appointment_id)
  WHERE resulting_appointment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS referrals_source_patient_status_idx
  ON clinical.referrals (source_encounter_id, patient_id, status, created_at DESC, id);
CREATE INDEX IF NOT EXISTS referrals_patient_status_idx
  ON clinical.referrals (patient_id, status, created_at DESC, id);
CREATE INDEX IF NOT EXISTS referrals_target_facility_status_idx
  ON clinical.referrals (target_facility_id, status, created_at DESC, id)
  WHERE target_facility_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS referrals_target_doctor_status_idx
  ON clinical.referrals (target_doctor_person_id, status, created_at DESC, id)
  WHERE target_doctor_person_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS referrals_requester_idx
  ON clinical.referrals (requester_person_id, created_at DESC, id);

CREATE INDEX IF NOT EXISTS messages_context_cursor_idx
  ON trust.messages (context_type, context_id, sent_at, id);
CREATE INDEX IF NOT EXISTS messages_context_id_cursor_idx
  ON trust.messages (context_id, sent_at, id);
CREATE INDEX IF NOT EXISTS messages_sender_idx
  ON trust.messages (sender_person_id, sent_at DESC, id);

ALTER TABLE clinical.encounters ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical.encounters FORCE ROW LEVEL SECURITY;
ALTER TABLE clinical.encounter_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical.encounter_participants FORCE ROW LEVEL SECURITY;
ALTER TABLE clinical.clinical_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical.clinical_notes FORCE ROW LEVEL SECURITY;
ALTER TABLE clinical.conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical.conditions FORCE ROW LEVEL SECURITY;
ALTER TABLE clinical.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical.referrals FORCE ROW LEVEL SECURITY;
ALTER TABLE trust.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE trust.messages FORCE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE
  clinical.encounters,
  clinical.encounter_participants,
  clinical.clinical_notes,
  clinical.conditions,
  clinical.referrals,
  trust.messages
FROM PUBLIC;

DO $feature_010_default_deny$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY[
    'shifaa_api', 'shifaa_worker', 'anon', 'authenticated', 'service_role'
  ] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE clinical.encounters, clinical.encounter_participants, clinical.clinical_notes, clinical.conditions, clinical.referrals, trust.messages FROM %I',
        role_name
      );
    END IF;
  END LOOP;
END
$feature_010_default_deny$;

-- Feature 010 owns only the two encounter lifecycle edges. The legacy F009
-- marker remains bounded to F009 state transitions; it cannot open or finish
-- an encounter lifecycle. These markers are set only inside the corresponding
-- producer after current named-clinician authorization has been rechecked.
CREATE OR REPLACE FUNCTION clinical.appointment_transition_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  internal_transition text := current_setting('shifaa.clinic_internal_transition',true);
  allowed_f009 boolean;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'confirmed' THEN
      RAISE EXCEPTION 'Feature 009 create produces confirmed only' USING ERRCODE='42501';
    END IF;
  ELSE
    IF NEW.payment_method<>'cash_on_arrival' THEN
      RAISE EXCEPTION 'cash_on_arrival is the only payment method' USING ERRCODE='23514';
    END IF;

    IF internal_transition='f010_create_encounter' THEN
      IF OLD.status<>'checked_in' OR NEW.status<>'in_consultation' THEN
        RAISE EXCEPTION 'invalid Feature 010 encounter-create appointment transition' USING ERRCODE='42501';
      END IF;
    ELSIF internal_transition='f010_complete_encounter' THEN
      IF OLD.status<>'in_consultation' OR NEW.status<>'completed' THEN
        RAISE EXCEPTION 'invalid Feature 010 encounter-complete appointment transition' USING ERRCODE='42501';
      END IF;
    ELSE
      allowed_f009 :=
        (OLD.status='confirmed' AND NEW.status IN ('checked_in','cancelled','reschedule_required'))
        OR (OLD.status='reschedule_required' AND NEW.status IN ('confirmed','cancelled'))
        OR (internal_transition='allowed' AND (
          (OLD.status='checked_in' AND NEW.status='reschedule_required')
          OR OLD.status=NEW.status
        ));
      IF NOT allowed_f009 THEN
        RAISE EXCEPTION 'invalid Feature 009 appointment transition' USING ERRCODE='42501';
      END IF;
    END IF;
    NEW.version=OLD.version+1;
  END IF;
  NEW.updated_at=statement_timestamp();
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION clinical.queue_scope_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  appointment clinical.appointments%ROWTYPE;
  scope clinical.queue_scopes%ROWTYPE;
  internal_transition text := current_setting('shifaa.clinic_internal_transition',true);
  allowed_f009 boolean;
BEGIN
  SELECT * INTO scope FROM clinical.queue_scopes WHERE id=NEW.queue_scope_id;
  SELECT * INTO appointment FROM clinical.appointments WHERE id=NEW.appointment_id;
  IF NOT FOUND OR NEW.facility_id<>scope.facility_id OR NEW.doctor_person_id<>scope.doctor_person_id
     OR NEW.civil_date<>scope.civil_date OR NEW.facility_id<>appointment.facility_id
     OR NEW.doctor_person_id<>appointment.doctor_person_id OR NEW.civil_date<>appointment.civil_date THEN
    RAISE EXCEPTION 'queue scope mismatch' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' AND NEW.state<>'waiting' THEN
    RAISE EXCEPTION 'check-in produces waiting only' USING ERRCODE='42501';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF internal_transition='f010_create_encounter' THEN
      IF OLD.state<>'called' OR NEW.state<>'in_service' THEN
        RAISE EXCEPTION 'invalid Feature 010 encounter-create queue transition' USING ERRCODE='42501';
      END IF;
    ELSIF internal_transition='f010_complete_encounter' THEN
      IF OLD.state<>'in_service' OR NEW.state<>'completed' THEN
        RAISE EXCEPTION 'invalid Feature 010 encounter-complete queue transition' USING ERRCODE='42501';
      END IF;
    ELSE
      allowed_f009 :=
        (OLD.state='waiting' AND NEW.state='called')
        OR (OLD.state='called' AND NEW.state='completed')
        OR (internal_transition='allowed' AND (
          (OLD.state IN ('waiting','called') AND NEW.state='removed')
          OR OLD.state=NEW.state
        ));
      IF NOT allowed_f009 THEN
        RAISE EXCEPTION 'invalid Feature 009 queue transition' USING ERRCODE='42501';
      END IF;
    END IF;
    NEW.version=OLD.version+1;
  END IF;
  NEW.updated_at=statement_timestamp();
  RETURN NEW;
END $$;

-- The API action IDs are the canonical operation action names. C05 has no
-- approved clinical-purpose code to bind here and therefore requires a
-- nonempty trusted purpose context without inventing one. Later mutation
-- checkpoints wrap these producers with idempotency, audit, and outbox writes
-- in the same transaction. These functions are deliberately not granted to
-- shifaa_api; C07 must bind the approved care purpose and independent current-
-- care RLS rules before any online grant.
CREATE OR REPLACE FUNCTION clinical.create_encounter_v1(p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  actor uuid := platform.context_person_id();
  requested_appointment_id uuid;
  requested_patient_id uuid;
  encounter_type_value text;
  appointment_row clinical.appointments%ROWTYPE;
  queue_row clinical.queue_entries%ROWTYPE;
  encounter_id uuid;
  started_at_value timestamptz := statement_timestamp();
  old_transition text := current_setting('shifaa.clinic_internal_transition',true);
  response_value jsonb;
  authorized boolean;
BEGIN
  IF p_input IS NULL OR jsonb_typeof(p_input)<>'object'
     OR NOT (p_input ?& ARRAY['appointmentId','patientId','encounterType']::text[])
     OR (p_input-ARRAY['appointmentId','patientId','encounterType']::text[])<>'{}'::jsonb
     OR NULLIF(p_input->>'appointmentId','') IS NULL
     OR NULLIF(p_input->>'patientId','') IS NULL
     OR NULLIF(btrim(p_input->>'encounterType'),'') IS NULL
     OR pg_catalog.octet_length(p_input->>'encounterType')>120 THEN
    RAISE EXCEPTION 'createEncounter request is invalid' USING ERRCODE='22023';
  END IF;
  BEGIN
    requested_appointment_id := (p_input->>'appointmentId')::uuid;
    requested_patient_id := (p_input->>'patientId')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'createEncounter identifiers are invalid' USING ERRCODE='22023';
  END;
  encounter_type_value := btrim(p_input->>'encounterType');

  IF actor IS NULL OR platform.context_role() IS DISTINCT FROM 'CLN'
     OR platform.context_action() IS DISTINCT FROM 'createEncounter'
     OR COALESCE(platform.context_aal(),0)<2
     OR COALESCE(pg_catalog.cardinality(platform.context_purposes()),0)<1 THEN
    RAISE EXCEPTION 'current treating-clinician context is required' USING ERRCODE='42501';
  END IF;

  -- Read immutable appointment scope before locking; all writes below then
  -- follow the stable appointment -> queue -> encounter order.
  SELECT * INTO appointment_row FROM clinical.appointments a WHERE a.id=requested_appointment_id;
  IF NOT FOUND OR appointment_row.patient_person_id<>requested_patient_id
     OR appointment_row.doctor_person_id<>actor THEN
    RAISE EXCEPTION 'current treating appointment scope denied' USING ERRCODE='42501';
  END IF;
  SELECT * INTO appointment_row FROM clinical.appointments a WHERE a.id=requested_appointment_id FOR UPDATE;
  IF NOT FOUND OR appointment_row.status<>'checked_in'
     OR appointment_row.patient_person_id<>requested_patient_id
     OR appointment_row.doctor_person_id<>actor THEN
    RAISE EXCEPTION 'appointment is no longer eligible for encounter creation' USING ERRCODE='40001';
  END IF;
  SELECT * INTO queue_row FROM clinical.queue_entries q
   WHERE q.appointment_id=requested_appointment_id FOR UPDATE;
  IF NOT FOUND OR queue_row.state<>'called'
     OR queue_row.facility_id<>appointment_row.facility_id
     OR queue_row.doctor_person_id<>appointment_row.doctor_person_id
     OR queue_row.civil_date<>appointment_row.civil_date
     OR NOT EXISTS (
       SELECT 1 FROM clinical.queue_scopes s
       WHERE s.id=queue_row.queue_scope_id
         AND s.facility_id=appointment_row.facility_id
         AND s.doctor_person_id=appointment_row.doctor_person_id
         AND s.civil_date=appointment_row.civil_date
         AND s.timezone_name=appointment_row.timezone_name
     ) THEN
    RAISE EXCEPTION 'matching called queue entry is required' USING ERRCODE='40001';
  END IF;
  IF EXISTS (SELECT 1 FROM clinical.encounters e WHERE e.appointment_id=requested_appointment_id AND e.status='open') THEN
    RAISE EXCEPTION 'appointment already has an open encounter' USING ERRCODE='40001';
  END IF;

  -- Recheck live clinical authority only after the appointment and matching
  -- queue are locked, so the scope used by the insert is current and stable.
  SELECT EXISTS (
    SELECT 1
    FROM identity.facilities f
    JOIN identity.facility_memberships m ON m.facility_id=f.id
      AND m.person_id=actor AND m.role_code='doctor' AND m.membership_status='active'
      AND m.valid_from<=platform.context_now()
      AND (m.valid_until IS NULL OR m.valid_until>platform.context_now())
    JOIN identity.professional_licenses l ON l.id=m.employment_license_id
      AND l.person_id=actor AND l.profession='doctor' AND l.status='verified'
      AND l.expires_on>=(platform.context_now() AT TIME ZONE 'UTC')::date
    JOIN identity.patients p ON p.person_id=appointment_row.patient_person_id
      AND p.record_status='active'
    WHERE f.id=appointment_row.facility_id AND f.facility_status='active'
  ) INTO authorized;
  IF NOT authorized THEN
    RAISE EXCEPTION 'current treating membership or licence scope denied' USING ERRCODE='42501';
  END IF;

  INSERT INTO clinical.encounters(
    patient_person_id,facility_id,appointment_id,responsible_clinician_id,
    encounter_type,status,started_at,version
  ) VALUES (
    appointment_row.patient_person_id,appointment_row.facility_id,appointment_row.id,
    appointment_row.doctor_person_id,encounter_type_value,'open',started_at_value,1
  ) RETURNING id INTO encounter_id;
  INSERT INTO clinical.encounter_participants(encounter_id,person_id,role_code,started_at)
  VALUES (encounter_id,appointment_row.doctor_person_id,'responsible_clinician',started_at_value);

  PERFORM pg_catalog.set_config('shifaa.clinic_internal_transition','f010_create_encounter',true);
  UPDATE clinical.appointments SET status='in_consultation',updated_by_person_id=actor WHERE id=requested_appointment_id;
  UPDATE clinical.queue_entries SET state='in_service' WHERE id=queue_row.id;
  PERFORM pg_catalog.set_config('shifaa.clinic_internal_transition',COALESCE(old_transition,''),true);

  response_value := pg_catalog.jsonb_build_object(
    'encounter',pg_catalog.jsonb_build_object(
      'id',encounter_id,'patientId',appointment_row.patient_person_id,
      'facilityId',appointment_row.facility_id,'appointmentId',requested_appointment_id,
      'encounterType',encounter_type_value,'responsibleClinicianId',appointment_row.doctor_person_id,
      'status','open','startedAt',started_at_value,'version',1,
      'conditionIds','[]'::jsonb,'observationIds','[]'::jsonb,'orderIds','[]'::jsonb,
      'participants',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'personId',appointment_row.doctor_person_id,'roleCode','responsible_clinician','startedAt',started_at_value
      ))
    ),
    'appointmentStatus','in_consultation','queueStatus','in_service','queueEntryId',queue_row.id
  );
  RETURN response_value;
END $$;

CREATE OR REPLACE FUNCTION clinical.complete_encounter_v1(
  p_encounter_id uuid,p_expected_version integer,p_input jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  actor uuid := platform.context_person_id();
  encounter_row clinical.encounters%ROWTYPE;
  appointment_row clinical.appointments%ROWTYPE;
  queue_row clinical.queue_entries%ROWTYPE;
  completion_summary_value text;
  completed_at_value timestamptz;
  old_transition text := current_setting('shifaa.clinic_internal_transition',true);
  response_value jsonb;
  authorized boolean;
BEGIN
  IF p_encounter_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1
     OR p_input IS NULL OR jsonb_typeof(p_input)<>'object'
     OR NOT (p_input ?& ARRAY['summary','structuralConfirmation']::text[])
     OR (p_input-ARRAY['summary','structuralConfirmation']::text[])<>'{}'::jsonb
     OR NULLIF(btrim(p_input->>'summary'),'') IS NULL
     OR pg_catalog.octet_length(p_input->>'summary')>4000
     OR p_input->'structuralConfirmation'<>'true'::jsonb THEN
    RAISE EXCEPTION 'completeEncounter requires a nonblank responsible-clinician summary and explicit confirmation' USING ERRCODE='22023';
  END IF;
  completion_summary_value := btrim(p_input->>'summary');
  IF actor IS NULL OR platform.context_role() IS DISTINCT FROM 'CLN'
     OR platform.context_action() IS DISTINCT FROM 'completeEncounter'
     OR COALESCE(platform.context_aal(),0)<2
     OR COALESCE(pg_catalog.cardinality(platform.context_purposes()),0)<1 THEN
    RAISE EXCEPTION 'current responsible-clinician context is required' USING ERRCODE='42501';
  END IF;

  -- Appointment -> queue -> encounter is the common lock order for both
  -- lifecycle producers. The initial lookup is read-only and is rechecked
  -- after all three locks are held.
  SELECT * INTO encounter_row FROM clinical.encounters e WHERE e.id=p_encounter_id;
  IF NOT FOUND OR encounter_row.appointment_id IS NULL THEN
    RAISE EXCEPTION 'linked encounter was not found' USING ERRCODE='40001';
  END IF;
  SELECT * INTO appointment_row FROM clinical.appointments a
   WHERE a.id=encounter_row.appointment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'linked appointment was not found' USING ERRCODE='40001'; END IF;
  SELECT * INTO queue_row FROM clinical.queue_entries q
   WHERE q.appointment_id=appointment_row.id FOR UPDATE;
  SELECT * INTO encounter_row FROM clinical.encounters e WHERE e.id=p_encounter_id FOR UPDATE;
  IF NOT FOUND OR queue_row.id IS NULL OR encounter_row.appointment_id<>appointment_row.id
     OR encounter_row.patient_person_id<>appointment_row.patient_person_id
     OR encounter_row.facility_id<>appointment_row.facility_id
     OR encounter_row.responsible_clinician_id<>appointment_row.doctor_person_id
     OR encounter_row.responsible_clinician_id<>actor
     OR encounter_row.version<>p_expected_version
     OR encounter_row.status<>'open' OR appointment_row.status<>'in_consultation'
     OR queue_row.state<>'in_service'
     OR queue_row.facility_id<>appointment_row.facility_id
     OR queue_row.doctor_person_id<>appointment_row.doctor_person_id
     OR queue_row.civil_date<>appointment_row.civil_date
     OR NOT EXISTS (
       SELECT 1 FROM clinical.queue_scopes s
       WHERE s.id=queue_row.queue_scope_id
         AND s.facility_id=appointment_row.facility_id
         AND s.doctor_person_id=appointment_row.doctor_person_id
         AND s.civil_date=appointment_row.civil_date
         AND s.timezone_name=appointment_row.timezone_name
     )
     OR NOT EXISTS (
       SELECT 1 FROM clinical.encounter_participants p
       WHERE p.encounter_id=encounter_row.id
         AND p.person_id=actor AND p.role_code='responsible_clinician'
         AND p.ended_at IS NULL
     ) THEN
    RAISE EXCEPTION 'encounter completion state, version, queue, or responsible-clinician scope is stale' USING ERRCODE='40001';
  END IF;
  SELECT EXISTS (
    SELECT 1
    FROM identity.facilities f
    JOIN identity.facility_memberships m ON m.facility_id=f.id
      AND m.person_id=actor AND m.role_code='doctor' AND m.membership_status='active'
      AND m.valid_from<=platform.context_now()
      AND (m.valid_until IS NULL OR m.valid_until>platform.context_now())
    JOIN identity.professional_licenses l ON l.id=m.employment_license_id
      AND l.person_id=actor AND l.profession='doctor' AND l.status='verified'
      AND l.expires_on>=(platform.context_now() AT TIME ZONE 'UTC')::date
    WHERE f.id=appointment_row.facility_id AND f.facility_status='active'
  ) INTO authorized;
  IF NOT authorized THEN
    RAISE EXCEPTION 'current responsible-clinician membership or licence scope denied' USING ERRCODE='42501';
  END IF;

  completed_at_value := GREATEST(clock_timestamp(),encounter_row.started_at+interval '1 microsecond');
  UPDATE clinical.encounters SET status='completed',ended_at=completed_at_value,
    completion_summary=completion_summary_value,version=version+1,updated_at=completed_at_value
  WHERE id=encounter_row.id AND status='open' AND version=p_expected_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'encounter version changed' USING ERRCODE='40001'; END IF;

  PERFORM pg_catalog.set_config('shifaa.clinic_internal_transition','f010_complete_encounter',true);
  UPDATE clinical.appointments SET status='completed',updated_by_person_id=actor WHERE id=appointment_row.id;
  UPDATE clinical.queue_entries SET state='completed',completed_at=completed_at_value WHERE id=queue_row.id;
  PERFORM pg_catalog.set_config('shifaa.clinic_internal_transition',COALESCE(old_transition,''),true);

  response_value := pg_catalog.jsonb_build_object(
    'encounter',pg_catalog.jsonb_build_object(
      'id',encounter_row.id,'patientId',encounter_row.patient_person_id,
      'facilityId',encounter_row.facility_id,'appointmentId',appointment_row.id,
      'encounterType',encounter_row.encounter_type,
      'responsibleClinicianId',encounter_row.responsible_clinician_id,'status','completed',
      'startedAt',encounter_row.started_at,'endedAt',completed_at_value,
      'completionSummary',completion_summary_value,'version',encounter_row.version+1,
      'conditionIds',to_jsonb(encounter_row.condition_ids),
      'observationIds',to_jsonb(encounter_row.observation_ids),
      'orderIds',to_jsonb(encounter_row.order_ids)
    ),
    'appointmentId',appointment_row.id,'appointmentVersion',appointment_row.version+1,
    'appointmentStatus','completed','queueEntryId',queue_row.id,
    'queueVersion',queue_row.version+1,'queueStatus','completed','completedAt',completed_at_value
  );
  RETURN response_value;
END $$;

REVOKE ALL ON FUNCTION clinical.create_encounter_v1(jsonb),
  clinical.complete_encounter_v1(uuid,integer,jsonb) FROM PUBLIC;
DO $feature_010_producer_execute_deny$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['shifaa_api','shifaa_worker','anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format(
        'REVOKE ALL ON FUNCTION clinical.create_encounter_v1(jsonb), clinical.complete_encounter_v1(uuid,integer,jsonb) FROM %I',
        role_name
      );
    END IF;
  END LOOP;
END
$feature_010_producer_execute_deny$;

COMMENT ON FUNCTION clinical.create_encounter_v1(jsonb) IS
  'F010 producer: current CLN context required; API execute grant is deferred until C07 binds approved care purpose and RLS policy.';
COMMENT ON FUNCTION clinical.complete_encounter_v1(uuid,integer,jsonb) IS
  'F010 producer: current responsible CLN context required; API execute grant is deferred until C07 binds approved care purpose and RLS policy.';

-- C06 storage guards. Clinical ciphertext is supplied by the approved API
-- encryption adapter; this migration does not introduce cryptography or keys.
CREATE OR REPLACE FUNCTION clinical.reject_signed_note_mutation_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'signed clinical notes are append-only' USING ERRCODE='55000';
END $$;
REVOKE ALL ON FUNCTION clinical.reject_signed_note_mutation_v1() FROM PUBLIC;
DO $feature_010_note_guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='clinical.clinical_notes'::regclass
      AND tgname='clinical_notes_signed_immutable_guard'
  ) THEN
    CREATE TRIGGER clinical_notes_signed_immutable_guard
      BEFORE UPDATE OR DELETE ON clinical.clinical_notes
      FOR EACH ROW EXECUTE FUNCTION clinical.reject_signed_note_mutation_v1();
  END IF;
END
$feature_010_note_guard$;

-- Validate only structural links and the already approved disclosure shape.
-- Actor authorization, target reads, and acceptance transactions remain in
-- their later checkpoints.
CREATE OR REPLACE FUNCTION clinical.guard_referral_storage_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  source_patient_person_id uuid;
  source_encounter_type text;
  referral_patient_person_id uuid;
  appointment_patient_person_id uuid;
  appointment_facility_id uuid;
  appointment_doctor_person_id uuid;
BEGIN
  IF TG_OP='UPDATE' AND OLD.status='accepted' AND (
    NEW.status IS DISTINCT FROM OLD.status
    OR NEW.source_encounter_id IS DISTINCT FROM OLD.source_encounter_id
    OR NEW.patient_id IS DISTINCT FROM OLD.patient_id
    OR NEW.reason_summary IS DISTINCT FROM OLD.reason_summary
    OR NEW.encounter_type IS DISTINCT FROM OLD.encounter_type
    OR NEW.accepted_field_codes IS DISTINCT FROM OLD.accepted_field_codes
    OR NEW.resulting_appointment_id IS DISTINCT FROM OLD.resulting_appointment_id
    OR NEW.accepted_by_person_id IS DISTINCT FROM OLD.accepted_by_person_id
    OR NEW.accepted_at IS DISTINCT FROM OLD.accepted_at
    OR NEW.target_specialty IS DISTINCT FROM OLD.target_specialty
    OR NEW.target_facility_id IS DISTINCT FROM OLD.target_facility_id
    OR NEW.target_doctor_person_id IS DISTINCT FROM OLD.target_doctor_person_id
  ) THEN
    RAISE EXCEPTION 'accepted referral linkage and disclosure are immutable' USING ERRCODE='55000';
  END IF;

  SELECT e.patient_person_id,e.encounter_type
    INTO source_patient_person_id,source_encounter_type
    FROM clinical.encounters e WHERE e.id=NEW.source_encounter_id;
  SELECT p.person_id INTO referral_patient_person_id
    FROM identity.patients p WHERE p.id=NEW.patient_id;
  IF source_patient_person_id IS NULL OR referral_patient_person_id IS NULL
     OR source_patient_person_id<>referral_patient_person_id
     OR (NEW.encounter_type IS NOT NULL
       AND NEW.encounter_type IS DISTINCT FROM source_encounter_type) THEN
    RAISE EXCEPTION 'referral source encounter, patient, or selected encounter type is inconsistent'
      USING ERRCODE='23514';
  END IF;

  IF NEW.status='accepted' THEN
    SELECT a.patient_person_id,a.facility_id,a.doctor_person_id
      INTO appointment_patient_person_id,appointment_facility_id,appointment_doctor_person_id
      FROM clinical.appointments a WHERE a.id=NEW.resulting_appointment_id;
    IF appointment_patient_person_id IS NULL
       OR appointment_patient_person_id<>referral_patient_person_id
       OR appointment_facility_id IS DISTINCT FROM NEW.target_facility_id
       OR appointment_doctor_person_id IS DISTINCT FROM NEW.target_doctor_person_id THEN
      RAISE EXCEPTION 'accepted referral appointment link is inconsistent'
        USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION clinical.guard_referral_storage_v1() FROM PUBLIC;
DO $feature_010_referral_guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='clinical.referrals'::regclass
      AND tgname='referrals_storage_integrity_guard'
  ) THEN
    CREATE TRIGGER referrals_storage_integrity_guard
      BEFORE INSERT OR UPDATE ON clinical.referrals
      FOR EACH ROW EXECUTE FUNCTION clinical.guard_referral_storage_v1();
  END IF;
END
$feature_010_referral_guard$;

COMMIT;
