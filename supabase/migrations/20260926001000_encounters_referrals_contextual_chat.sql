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

  -- Serialize authority changes with creation. Appointment -> queue precede
  -- facility -> membership -> license -> people (UUID order) -> patient.
  -- Lock by identity, then recheck statuses after any concurrent updater commits.
  PERFORM 1 FROM identity.facilities f
    WHERE f.id=appointment_row.facility_id FOR SHARE;
  PERFORM 1 FROM identity.facility_memberships m
    WHERE m.facility_id=appointment_row.facility_id AND m.person_id=actor
      AND m.role_code='doctor' ORDER BY m.id FOR SHARE;
  PERFORM 1 FROM identity.professional_licenses l
    WHERE l.id IN (SELECT m.employment_license_id FROM identity.facility_memberships m
      WHERE m.facility_id=appointment_row.facility_id AND m.person_id=actor AND m.role_code='doctor')
    ORDER BY l.id FOR SHARE;
  PERFORM 1 FROM identity.people person
    WHERE person.id IN (actor,appointment_row.patient_person_id) ORDER BY person.id FOR SHARE;
  PERFORM 1 FROM identity.patients p
    WHERE p.person_id=appointment_row.patient_person_id FOR SHARE;

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
    JOIN identity.people clinician ON clinician.id=actor AND clinician.profile_status='active'
    JOIN identity.people subject ON subject.id=appointment_row.patient_person_id AND subject.profile_status='active'
    JOIN identity.patients p ON p.person_id=subject.id AND p.record_status='active'
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

-- C07 authorization helpers are private implementation details. They use
-- trusted request context and live source rows; no caller-supplied role,
-- facility, patient, purpose, or permission claim is accepted as an argument.
CREATE OR REPLACE FUNCTION clinical.feature_010_current_clinician_v1(
  p_person_id uuid,p_facility_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT p_person_id IS NOT NULL AND p_facility_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM identity.facilities f
    JOIN identity.facility_memberships m ON m.facility_id=f.id
      AND m.person_id=p_person_id AND m.role_code='doctor'
      AND m.membership_status='active' AND m.valid_from<=platform.context_now()
      AND (m.valid_until IS NULL OR m.valid_until>platform.context_now())
    JOIN identity.professional_licenses l ON l.id=m.employment_license_id
      AND l.person_id=p_person_id AND l.profession='doctor' AND l.status='verified'
      AND l.expires_on>=(platform.context_now() AT TIME ZONE 'UTC')::date
    JOIN identity.people person ON person.id=p_person_id AND person.profile_status='active'
    WHERE f.id=p_facility_id AND f.facility_status='active'
  )
$$;

CREATE OR REPLACE FUNCTION clinical.feature_010_family_authority_v1(
  p_patient_person_id uuid,p_actor_person_id uuid,p_relationship_type text,
  p_require_record boolean,p_require_appointment boolean
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT p_patient_person_id IS NOT NULL AND p_actor_person_id IS NOT NULL
    AND p_relationship_type IN ('guardianship','delegation')
    AND COALESCE(pg_catalog.cardinality(platform.context_purposes()),0)>0
    AND EXISTS (
      SELECT 1
      FROM identity.patients patient
      JOIN identity.care_relationships relation
        ON relation.subject_patient_id=patient.id
       AND relation.actor_person_id=p_actor_person_id
       AND relation.relationship_type=p_relationship_type
       AND relation.status='active'
       AND relation.valid_from<=platform.context_now()
       AND (relation.valid_until IS NULL OR relation.valid_until>platform.context_now())
       AND relation.purpose_code=ANY(platform.context_purposes())
      WHERE patient.person_id=p_patient_person_id AND patient.record_status='active'
        AND (
          (p_relationship_type='guardianship'
            AND relation.evidence_object_id IS NOT NULL
            AND relation.reviewed_by_person_id IS NOT NULL
            AND relation.reviewed_at IS NOT NULL
            AND relation.decision_reason_code IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM identity.private_evidence_objects evidence
              WHERE evidence.id=relation.evidence_object_id
                AND evidence.bucket_code='guardianship-evidence'
                AND evidence.owner_person_id=relation.actor_person_id
                AND evidence.resource_patient_id=relation.subject_patient_id
                AND evidence.scan_status='released'
            ))
          OR (p_relationship_type='delegation'
            AND relation.evidence_object_id IS NULL
            AND relation.invite_token_digest IS NULL
            AND relation.invite_consumed_at IS NOT NULL)
        )
        AND (NOT p_require_record OR EXISTS (
          SELECT 1 FROM identity.care_relationship_permissions permission
          WHERE permission.relationship_id=relation.id
            AND permission.permission_code='record.view' AND permission.revoked_at IS NULL
        ))
        AND (NOT p_require_appointment OR EXISTS (
          SELECT 1 FROM identity.care_relationship_permissions permission
          WHERE permission.relationship_id=relation.id
            AND permission.permission_code='appointment.manage' AND permission.revoked_at IS NULL
        ))
    )
$$;

CREATE OR REPLACE FUNCTION clinical.feature_010_current_encounter_clinician_v1(
  p_encounter_id uuid,p_require_responsible boolean DEFAULT false
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM clinical.encounters encounter
    JOIN clinical.appointments appointment
      ON appointment.id=encounter.appointment_id
     AND appointment.patient_person_id=encounter.patient_person_id
     AND appointment.facility_id=encounter.facility_id
    JOIN clinical.encounter_participants participant
      ON participant.encounter_id=encounter.id
     AND participant.person_id=platform.context_person_id()
     AND participant.started_at<=platform.context_now()
     AND participant.ended_at IS NULL
     AND (NOT p_require_responsible OR participant.role_code='responsible_clinician')
    WHERE encounter.id=p_encounter_id
      AND (NOT p_require_responsible OR encounter.responsible_clinician_id=platform.context_person_id())
      AND clinical.feature_010_current_clinician_v1(platform.context_person_id(),encounter.facility_id)
  )
$$;

CREATE OR REPLACE FUNCTION clinical.feature_010_authorize_v1(
  p_operation_id text,p_resource_id uuid
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  actor uuid := platform.context_person_id();
  actor_role text := platform.context_role();
  requested_action text := platform.context_action();
  current_purposes text[] := platform.context_purposes();
  current_aal integer := COALESCE(platform.context_aal(),0);
  encounter_row clinical.encounters%ROWTYPE;
  appointment_row clinical.appointments%ROWTYPE;
  referral_row clinical.referrals%ROWTYPE;
  target_appointment clinical.appointments%ROWTYPE;
  patient_self boolean;
BEGIN
  IF p_operation_id IS NULL OR p_resource_id IS NULL OR actor IS NULL OR actor_role IS NULL
     OR requested_action IS DISTINCT FROM p_operation_id
     OR COALESCE(pg_catalog.cardinality(current_purposes),0)<1
     OR p_operation_id NOT IN (
       'createEncounter','getEncounter','updateEncounter','signEncounterNote',
       'completeEncounter','createReferral','listReferrals','acceptReferral',
       'listContextMessages','sendContextMessage'
     ) THEN
    RETURN false;
  END IF;
  IF current_aal<1 THEN RETURN false; END IF;

  IF p_operation_id='createEncounter' THEN
    IF actor_role<>'CLN' OR current_aal<2 THEN RETURN false; END IF;
    SELECT * INTO appointment_row FROM clinical.appointments appointment
      WHERE appointment.id=p_resource_id;
    IF NOT FOUND OR appointment_row.status<>'checked_in'
       OR appointment_row.doctor_person_id<>actor
       OR NOT clinical.feature_010_current_clinician_v1(actor,appointment_row.facility_id)
       OR NOT EXISTS (
         SELECT 1 FROM identity.people patient
         JOIN identity.patients patient_record ON patient_record.person_id=patient.id
           AND patient_record.record_status='active'
         WHERE patient.id=appointment_row.patient_person_id AND patient.profile_status='active'
       )
       OR NOT EXISTS (
         SELECT 1 FROM clinical.queue_entries queue
         JOIN clinical.queue_scopes scope ON scope.id=queue.queue_scope_id
         WHERE queue.appointment_id=appointment_row.id AND queue.state='called'
           AND queue.facility_id=appointment_row.facility_id
           AND queue.doctor_person_id=appointment_row.doctor_person_id
           AND queue.civil_date=appointment_row.civil_date
           AND scope.facility_id=appointment_row.facility_id
           AND scope.doctor_person_id=appointment_row.doctor_person_id
           AND scope.civil_date=appointment_row.civil_date
           AND scope.timezone_name=appointment_row.timezone_name
       )
       OR EXISTS (SELECT 1 FROM clinical.encounters existing
          WHERE existing.appointment_id=appointment_row.id AND existing.status='open') THEN
      RETURN false;
    END IF;
    RETURN true;
  END IF;

  IF p_operation_id IN ('getEncounter','updateEncounter','signEncounterNote','completeEncounter','createReferral') THEN
    SELECT * INTO encounter_row FROM clinical.encounters encounter WHERE encounter.id=p_resource_id;
    IF NOT FOUND THEN RETURN false; END IF;
    SELECT EXISTS (
      SELECT 1 FROM identity.people patient
      JOIN identity.patients patient_record ON patient_record.person_id=patient.id
        AND patient_record.record_status='active'
      WHERE patient.id=encounter_row.patient_person_id AND patient.profile_status='active'
    ) INTO patient_self;
    IF NOT patient_self THEN RETURN false; END IF;

    IF p_operation_id='getEncounter' THEN
      IF actor_role='PAT' THEN
        RETURN encounter_row.patient_person_id=actor;
      ELSIF actor_role='GUA' THEN
        RETURN clinical.feature_010_family_authority_v1(
          encounter_row.patient_person_id,actor,'guardianship',true,false
        );
      ELSIF actor_role='DEL' THEN
        RETURN clinical.feature_010_family_authority_v1(
          encounter_row.patient_person_id,actor,'delegation',true,false
        );
      ELSIF actor_role='CLN' THEN
        RETURN clinical.feature_010_current_encounter_clinician_v1(p_resource_id,false);
      END IF;
      RETURN false;
    END IF;

    IF actor_role<>'CLN' OR current_aal<2 THEN RETURN false; END IF;
    IF p_operation_id='completeEncounter' THEN
      RETURN encounter_row.status='open'
        AND clinical.feature_010_current_encounter_clinician_v1(p_resource_id,true)
        AND EXISTS (
          SELECT 1 FROM clinical.appointments appointment
          JOIN clinical.queue_entries queue ON queue.appointment_id=appointment.id
          JOIN clinical.queue_scopes scope ON scope.id=queue.queue_scope_id
          WHERE appointment.id=encounter_row.appointment_id
            AND appointment.status='in_consultation'
            AND queue.state='in_service'
            AND queue.facility_id=appointment.facility_id
            AND queue.doctor_person_id=appointment.doctor_person_id
            AND queue.civil_date=appointment.civil_date
            AND scope.facility_id=appointment.facility_id
            AND scope.doctor_person_id=appointment.doctor_person_id
            AND scope.civil_date=appointment.civil_date
            AND scope.timezone_name=appointment.timezone_name
      );
    END IF;
    IF p_operation_id IN ('updateEncounter','signEncounterNote','createReferral') THEN
      SELECT * INTO appointment_row FROM clinical.appointments appointment
        WHERE appointment.id=encounter_row.appointment_id;
      IF NOT FOUND OR encounter_row.status<>'open'
         OR appointment_row.status<>'in_consultation' THEN RETURN false; END IF;
    END IF;
    RETURN clinical.feature_010_current_encounter_clinician_v1(p_resource_id,false);
  END IF;

  IF p_operation_id IN ('listReferrals','acceptReferral') THEN
    SELECT * INTO referral_row FROM clinical.referrals referral WHERE referral.id=p_resource_id;
    IF NOT FOUND THEN RETURN false; END IF;
    SELECT * INTO encounter_row FROM clinical.encounters encounter
      WHERE encounter.id=referral_row.source_encounter_id;
    IF NOT FOUND OR encounter_row.patient_person_id IS DISTINCT FROM (
      SELECT patient.person_id FROM identity.patients patient WHERE patient.id=referral_row.patient_id
    ) THEN RETURN false; END IF;

    SELECT EXISTS (SELECT 1 FROM identity.people patient
      JOIN identity.patients patient_record ON patient_record.person_id=patient.id
        AND patient_record.record_status='active'
      WHERE patient.id=encounter_row.patient_person_id AND patient.profile_status='active')
      AND encounter_row.patient_person_id=actor INTO patient_self;

    IF p_operation_id='acceptReferral' THEN
      IF current_aal<2 OR referral_row.status<>'pending' THEN RETURN false; END IF;
      IF actor_role='PAT' THEN RETURN patient_self; END IF;
      IF actor_role='GUA' THEN
        RETURN clinical.feature_010_family_authority_v1(encounter_row.patient_person_id,actor,'guardianship',false,false);
      ELSIF actor_role='DEL' THEN
        RETURN clinical.feature_010_family_authority_v1(encounter_row.patient_person_id,actor,'delegation',true,true);
      END IF;
      RETURN false;
    END IF;

    IF actor_role='PAT' THEN RETURN patient_self; END IF;
    IF actor_role='GUA' THEN
      RETURN clinical.feature_010_family_authority_v1(encounter_row.patient_person_id,actor,'guardianship',false,false);
    ELSIF actor_role='DEL' THEN
      RETURN clinical.feature_010_family_authority_v1(encounter_row.patient_person_id,actor,'delegation',true,true);
    ELSIF actor_role='CLN' THEN
      IF referral_row.status='accepted' AND referral_row.resulting_appointment_id IS NOT NULL THEN
        SELECT * INTO target_appointment FROM clinical.appointments appointment
          WHERE appointment.id=referral_row.resulting_appointment_id;
        IF FOUND AND target_appointment.patient_person_id=encounter_row.patient_person_id
           AND target_appointment.facility_id=referral_row.target_facility_id
           AND clinical.feature_010_current_clinician_v1(actor,referral_row.target_facility_id) THEN
          RETURN true;
        END IF;
      END IF;
      RETURN clinical.feature_010_current_encounter_clinician_v1(encounter_row.id,false);
    END IF;
    RETURN false;
  END IF;

  IF p_operation_id IN ('listContextMessages','sendContextMessage') THEN
    IF p_operation_id='sendContextMessage' AND current_aal<2 THEN RETURN false; END IF;
    SELECT * INTO appointment_row FROM clinical.appointments appointment
      WHERE appointment.id=p_resource_id;
    IF NOT FOUND OR appointment_row.status<>'in_consultation' THEN RETURN false; END IF;
    SELECT * INTO encounter_row FROM clinical.encounters encounter
      WHERE encounter.appointment_id=appointment_row.id AND encounter.status='open';
    IF NOT FOUND OR encounter_row.patient_person_id<>appointment_row.patient_person_id
       OR encounter_row.facility_id<>appointment_row.facility_id THEN RETURN false; END IF;
    IF actor_role='PAT' THEN
      RETURN actor=appointment_row.patient_person_id AND EXISTS (
        SELECT 1 FROM identity.patients patient
        WHERE patient.person_id=actor AND patient.record_status='active'
      );
    ELSIF actor_role='CLN' THEN
      RETURN EXISTS (
        SELECT 1 FROM clinical.encounter_participants participant
        WHERE participant.encounter_id=encounter_row.id
          AND participant.person_id=actor
          AND participant.started_at<=platform.context_now()
          AND participant.ended_at IS NULL
      ) AND clinical.feature_010_current_clinician_v1(actor,appointment_row.facility_id);
    END IF;
    RETURN false;
  END IF;
  RETURN false;
END
$$;

CREATE OR REPLACE FUNCTION clinical.feature_010_participant_row_visible_v1(
  p_encounter_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT clinical.feature_010_authorize_v1('getEncounter',p_encounter_id)
    OR EXISTS (
      SELECT 1 FROM clinical.encounters encounter
      WHERE encounter.id=p_encounter_id
        AND encounter.appointment_id IS NOT NULL
        AND clinical.feature_010_authorize_v1('listContextMessages',encounter.appointment_id)
    )
$$;

CREATE OR REPLACE FUNCTION clinical.feature_010_note_row_visible_v1(
  p_encounter_id uuid,p_visibility_code text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT (p_visibility_code='patient_visible' OR platform.context_role()='CLN')
    AND clinical.feature_010_authorize_v1('getEncounter',p_encounter_id)
$$;

CREATE OR REPLACE FUNCTION clinical.feature_010_condition_row_visible_v1(
  p_condition_id uuid,p_patient_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS (
    SELECT 1 FROM clinical.encounters encounter
    JOIN identity.patients patient ON patient.person_id=encounter.patient_person_id
      AND patient.record_status='active'
    WHERE p_condition_id=ANY(encounter.condition_ids)
      AND patient.id=p_patient_id
      AND clinical.feature_010_authorize_v1('getEncounter',encounter.id)
  )
$$;

-- These values are internal, currently authorized metadata envelopes. They are
-- not complete OpenAPI responses: later API handlers add only separately
-- authorized decrypted note/message bodies while preserving these boundaries.
CREATE OR REPLACE FUNCTION clinical.feature_010_get_encounter_projection_v1(
  p_encounter_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  projection jsonb;
BEGIN
  IF NOT clinical.feature_010_authorize_v1('getEncounter',p_encounter_id) THEN
    RETURN NULL;
  END IF;
  SELECT pg_catalog.jsonb_build_object(
    'id',encounter.id,
    'patientId',encounter.patient_person_id,
    'facilityId',encounter.facility_id,
    'appointmentId',encounter.appointment_id,
    'encounterType',encounter.encounter_type,
    'responsibleClinicianId',encounter.responsible_clinician_id,
    'status',encounter.status,
    'startedAt',encounter.started_at,
    'endedAt',encounter.ended_at,
    'version',encounter.version,
    'conditionIds',pg_catalog.to_jsonb(encounter.condition_ids),
    'observationIds',pg_catalog.to_jsonb(encounter.observation_ids),
    'orderIds',pg_catalog.to_jsonb(encounter.order_ids),
    'notes',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',note.id,'authorId',note.author_person_id,'noteType',note.note_type,
        'visibility',note.visibility_code,'signedAt',note.signed_at,'supersedesId',note.supersedes_id
      ) ORDER BY note.signed_at,note.id)
      FROM clinical.clinical_notes note
      WHERE note.encounter_id=encounter.id
        AND (note.visibility_code='patient_visible' OR platform.context_role()='CLN')
    ),'[]'::jsonb)
  ) INTO projection
  FROM clinical.encounters encounter
  WHERE encounter.id=p_encounter_id;
  RETURN projection;
END
$$;

CREATE OR REPLACE FUNCTION clinical.feature_010_referral_projection_v1(
  p_referral_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  referral clinical.referrals%ROWTYPE;
  source_encounter clinical.encounters%ROWTYPE;
  target_appointment clinical.appointments%ROWTYPE;
  projection jsonb;
  is_target_clinician boolean;
BEGIN
  IF NOT clinical.feature_010_authorize_v1('listReferrals',p_referral_id) THEN
    RETURN NULL;
  END IF;
  SELECT * INTO referral FROM clinical.referrals WHERE id=p_referral_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO source_encounter FROM clinical.encounters WHERE id=referral.source_encounter_id;
  is_target_clinician := platform.context_role()='CLN'
    AND referral.status='accepted'
    AND referral.resulting_appointment_id IS NOT NULL
    AND clinical.feature_010_current_clinician_v1(
      platform.context_person_id(),referral.target_facility_id
    );
  IF is_target_clinician THEN
    SELECT * INTO target_appointment FROM clinical.appointments
      WHERE id=referral.resulting_appointment_id;
    IF NOT FOUND OR target_appointment.patient_person_id<>source_encounter.patient_person_id
       OR target_appointment.facility_id<>referral.target_facility_id THEN
      RETURN NULL;
    END IF;
    projection := pg_catalog.jsonb_build_object(
      'id',referral.id,
      'status','accepted',
      'version',referral.version,
      'acceptedFieldCodes',pg_catalog.to_jsonb(referral.accepted_field_codes),
      'resultingAppointmentId',referral.resulting_appointment_id,
      'reasonSummary',referral.reason_summary
    );
    IF 'encounter_type'=ANY(referral.accepted_field_codes) THEN
      projection := projection || pg_catalog.jsonb_build_object('encounterType',referral.encounter_type);
    END IF;
    RETURN projection;
  END IF;
  projection := pg_catalog.jsonb_build_object(
    'id',referral.id,
    'sourceEncounterId',referral.source_encounter_id,
    'status',referral.status,
    'version',referral.version,
    'targetSpecialty',referral.target_specialty
  );
  IF referral.target_facility_id IS NOT NULL THEN
    projection := projection || pg_catalog.jsonb_build_object('targetFacilityId',referral.target_facility_id);
  END IF;
  IF referral.target_doctor_person_id IS NOT NULL THEN
    projection := projection || pg_catalog.jsonb_build_object('targetDoctorId',referral.target_doctor_person_id);
  END IF;
  IF referral.status='accepted' THEN
    SELECT * INTO target_appointment FROM clinical.appointments
      WHERE id=referral.resulting_appointment_id;
    IF NOT FOUND OR target_appointment.patient_person_id<>source_encounter.patient_person_id
       OR target_appointment.facility_id<>referral.target_facility_id THEN
      RETURN NULL;
    END IF;
    projection := projection || pg_catalog.jsonb_build_object(
      'targetFacilityId',referral.target_facility_id,
      'targetDoctorId',referral.target_doctor_person_id,
      'resultingAppointmentId',referral.resulting_appointment_id,
      'acceptedFieldCodes',pg_catalog.to_jsonb(referral.accepted_field_codes)
    );
  END IF;
  projection := projection || pg_catalog.jsonb_build_object('reasonSummary',referral.reason_summary);
  IF referral.encounter_type IS NOT NULL THEN
    projection := projection || pg_catalog.jsonb_build_object('encounterType',referral.encounter_type);
  END IF;
  RETURN projection;
END
$$;

CREATE OR REPLACE FUNCTION trust.feature_010_context_messages_projection_v1(
  p_appointment_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  projection jsonb;
BEGIN
  IF NOT clinical.feature_010_authorize_v1('listContextMessages',p_appointment_id) THEN
    RETURN NULL;
  END IF;
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',message.id,'contextType',message.context_type,'contextId',message.context_id,
    'senderPersonId',message.sender_person_id,'sentAt',message.sent_at
  ) ORDER BY message.sent_at,message.id),'[]'::jsonb)
  INTO projection
  FROM trust.messages message
  WHERE message.context_type='appointment' AND message.context_id=p_appointment_id
    AND message.deleted_at IS NULL;
  RETURN projection;
END
$$;

-- RLS policies are intentionally independent from privileges. C07 grants no
-- domain-table access; entry functions above are the only API read path.
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

DROP POLICY IF EXISTS f010_c07_encounters_select ON clinical.encounters;
CREATE POLICY f010_c07_encounters_select ON clinical.encounters
  FOR SELECT TO shifaa_api
  USING (clinical.feature_010_authorize_v1('getEncounter',id));
DROP POLICY IF EXISTS f010_c07_participants_select ON clinical.encounter_participants;
CREATE POLICY f010_c07_participants_select ON clinical.encounter_participants
  FOR SELECT TO shifaa_api
  USING (clinical.feature_010_participant_row_visible_v1(encounter_id));
DROP POLICY IF EXISTS f010_c07_notes_select ON clinical.clinical_notes;
CREATE POLICY f010_c07_notes_select ON clinical.clinical_notes
  FOR SELECT TO shifaa_api
  USING (clinical.feature_010_note_row_visible_v1(encounter_id,visibility_code));
DROP POLICY IF EXISTS f010_c07_conditions_select ON clinical.conditions;
CREATE POLICY f010_c07_conditions_select ON clinical.conditions
  FOR SELECT TO shifaa_api
  USING (clinical.feature_010_condition_row_visible_v1(id,patient_id));
DROP POLICY IF EXISTS f010_c07_referrals_select ON clinical.referrals;
CREATE POLICY f010_c07_referrals_select ON clinical.referrals
  FOR SELECT TO shifaa_api
  USING (clinical.feature_010_authorize_v1('listReferrals',id));
DROP POLICY IF EXISTS f010_c07_messages_select ON trust.messages;
CREATE POLICY f010_c07_messages_select ON trust.messages
  FOR SELECT TO shifaa_api
  USING (context_type='appointment'
    AND clinical.feature_010_authorize_v1('listContextMessages',context_id));

REVOKE ALL ON FUNCTION clinical.feature_010_current_clinician_v1(uuid,uuid),
  clinical.feature_010_family_authority_v1(uuid,uuid,text,boolean,boolean),
  clinical.feature_010_current_encounter_clinician_v1(uuid,boolean),
  clinical.feature_010_participant_row_visible_v1(uuid),
  clinical.feature_010_note_row_visible_v1(uuid,text),
  clinical.feature_010_condition_row_visible_v1(uuid,uuid)
FROM PUBLIC;
REVOKE ALL ON FUNCTION clinical.feature_010_authorize_v1(text,uuid),
  clinical.feature_010_get_encounter_projection_v1(uuid),
  clinical.feature_010_referral_projection_v1(uuid),
  trust.feature_010_context_messages_projection_v1(uuid)
FROM PUBLIC;

DO $feature_010_c07_execute_grants$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['shifaa_api','shifaa_worker','anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=role_name) THEN
      EXECUTE pg_catalog.format(
        'REVOKE ALL ON FUNCTION clinical.feature_010_current_clinician_v1(uuid,uuid), clinical.feature_010_family_authority_v1(uuid,uuid,text,boolean,boolean), clinical.feature_010_current_encounter_clinician_v1(uuid,boolean), clinical.feature_010_participant_row_visible_v1(uuid), clinical.feature_010_note_row_visible_v1(uuid,text), clinical.feature_010_condition_row_visible_v1(uuid,uuid), clinical.feature_010_authorize_v1(text,uuid), clinical.feature_010_get_encounter_projection_v1(uuid), clinical.feature_010_referral_projection_v1(uuid), trust.feature_010_context_messages_projection_v1(uuid) FROM %I',
        role_name
      );
    END IF;
  END LOOP;
  -- The online role needs schema name-resolution to call the one approved
  -- trust projection function. This grants no table access in trust.
  GRANT USAGE ON SCHEMA trust TO shifaa_api;
  GRANT EXECUTE ON FUNCTION clinical.feature_010_authorize_v1(text,uuid),
    clinical.feature_010_get_encounter_projection_v1(uuid),
    clinical.feature_010_referral_projection_v1(uuid),
    trust.feature_010_context_messages_projection_v1(uuid),
    clinical.feature_010_participant_row_visible_v1(uuid),
    clinical.feature_010_note_row_visible_v1(uuid,text),
    clinical.feature_010_condition_row_visible_v1(uuid,uuid)
  TO shifaa_api;
END
$feature_010_c07_execute_grants$;

-- C08: separate booking mechanics from an operation's idempotency, audit,
-- outbox, and canonical-response boundary. Feature 009 keeps those records in
-- its existing createAppointment wrapper; Feature 010 can compose the same
-- authoritative booking checks into its own transaction.
CREATE OR REPLACE FUNCTION clinical.book_appointment_internal_v1(
  p_input jsonb,
  p_expected_schedule_version integer DEFAULT NULL,
  p_expected_slot jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  actor uuid := platform.context_person_id();
  patient uuid := (p_input->>'patient_person_id')::uuid;
  schedule_id uuid := NULLIF(p_input->>'schedule_id','')::uuid;
  schedule_row clinical.schedules%ROWTYPE;
  starts_at_value timestamptz := (p_input->>'starts_at')::timestamptz;
  ends_at_value timestamptz := (p_input->>'ends_at')::timestamptz;
  civil_date_value date := (p_input->>'civil_date')::date;
  local_start_value time := (p_input->>'local_start')::time;
  appointment_id uuid;
BEGIN
  IF p_input IS NULL OR patient IS NULL
     OR (p_input->>'facility_id')::uuid IS NULL
     OR (p_input->>'doctor_person_id')::uuid IS NULL
     OR starts_at_value IS NULL OR ends_at_value IS NULL OR ends_at_value<=starts_at_value
     OR civil_date_value IS NULL OR local_start_value IS NULL THEN
    RAISE EXCEPTION 'invalid appointment request' USING ERRCODE='22023';
  END IF;
  IF p_expected_schedule_version IS NOT NULL AND p_expected_schedule_version<1 THEN
    RAISE EXCEPTION 'invalid expected schedule version' USING ERRCODE='22023';
  END IF;
  IF p_expected_slot IS NOT NULL AND pg_catalog.jsonb_typeof(p_expected_slot)<>'object' THEN
    RAISE EXCEPTION 'invalid selected appointment slot' USING ERRCODE='22023';
  END IF;

  -- Keep F009's schedule selection and lock order. F010 adds only the
  -- optional version and exact effective-slot predicates below.
  IF schedule_id IS NULL THEN
    SELECT * INTO schedule_row
    FROM clinical.schedules
    WHERE facility_id=(p_input->>'facility_id')::uuid
      AND doctor_person_id=(p_input->>'doctor_person_id')::uuid
      AND status='active'
      AND civil_date_value <@ valid_dates
    ORDER BY valid_from,id
    LIMIT 1
    FOR UPDATE;
  ELSE
    SELECT * INTO schedule_row
    FROM clinical.schedules
    WHERE id=schedule_id
    FOR UPDATE;
  END IF;

  IF NOT FOUND OR schedule_row.status<>'active'
     OR schedule_row.facility_id IS DISTINCT FROM (p_input->>'facility_id')::uuid
     OR schedule_row.doctor_person_id IS DISTINCT FROM (p_input->>'doctor_person_id')::uuid
     OR schedule_row.timezone_name IS DISTINCT FROM (p_input->>'timezone_name')
     OR NOT (civil_date_value <@ schedule_row.valid_dates)
     OR (starts_at_value AT TIME ZONE schedule_row.timezone_name)::date IS DISTINCT FROM civil_date_value
     OR (starts_at_value AT TIME ZONE schedule_row.timezone_name)::time IS DISTINCT FROM local_start_value THEN
    RAISE EXCEPTION 'appointment schedule scope denied' USING ERRCODE='42501';
  END IF;

  IF p_expected_schedule_version IS NOT NULL
     AND schedule_row.version IS DISTINCT FROM p_expected_schedule_version THEN
    RAISE EXCEPTION 'appointment schedule is stale or missing' USING ERRCODE='40001';
  END IF;

  IF p_expected_slot IS NOT NULL THEN
    IF (p_expected_slot->>'starts_at')::timestamptz IS DISTINCT FROM starts_at_value
       OR (p_expected_slot->>'ends_at')::timestamptz IS DISTINCT FROM ends_at_value
       OR p_expected_slot->>'timezone_name' IS DISTINCT FROM schedule_row.timezone_name
       OR (p_expected_slot->>'civil_date')::date IS DISTINCT FROM civil_date_value
       OR (p_expected_slot->>'local_start')::time IS DISTINCT FROM local_start_value
       OR NOT EXISTS (
         SELECT 1
         FROM clinical.list_availability_v1(schedule_row.id,civil_date_value) available
         WHERE available.starts_at=starts_at_value
           AND available.ends_at=ends_at_value
           AND available.timezone_name=schedule_row.timezone_name
           AND available.civil_date=civil_date_value
           AND available.local_start=local_start_value
       ) THEN
      RAISE EXCEPTION 'appointment selected slot is stale or unavailable' USING ERRCODE='40001';
    END IF;
  END IF;

  INSERT INTO clinical.appointments(
    patient_person_id,facility_id,doctor_person_id,schedule_id,starts_at,ends_at,
    timezone_name,civil_date,local_start,fee_minor_units,currency_code,
    payment_method,status,source_referral_id,created_by_person_id,updated_by_person_id
  ) VALUES (
    patient,schedule_row.facility_id,schedule_row.doctor_person_id,schedule_row.id,
    starts_at_value,ends_at_value,schedule_row.timezone_name,civil_date_value,local_start_value,
    schedule_row.fee_minor_units,'EGP','cash_on_arrival','confirmed',
    (p_input->>'source_referral_id')::uuid,actor,actor
  ) RETURNING id INTO appointment_id;

  RETURN appointment_id;
END
$$;

REVOKE ALL ON FUNCTION clinical.book_appointment_internal_v1(jsonb,integer,jsonb) FROM PUBLIC;

DO $feature_010_c08_internal_booking_privileges$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['shifaa_api','shifaa_worker','anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=role_name) THEN
      EXECUTE pg_catalog.format(
        'REVOKE ALL ON FUNCTION clinical.book_appointment_internal_v1(jsonb,integer,jsonb) FROM %I',
        role_name
      );
    END IF;
  END LOOP;
END
$feature_010_c08_internal_booking_privileges$;

-- The public F009 operation retains request validation, patient authorization,
-- idempotency, stable results, audit/outbox, and failure-injection ordering.
CREATE OR REPLACE FUNCTION clinical.create_appointment_v1(p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  appointment_id uuid;
  actor uuid := platform.context_person_id();
  patient uuid := (p_input->>'patient_person_id')::uuid;
  schedule_id uuid;
  result jsonb;
  idem_id uuid;
  idem_new boolean;
  idem_response jsonb;
BEGIN
  schedule_id:=NULLIF(p_input->>'schedule_id','')::uuid;
  IF p_input IS NULL OR patient IS NULL
     OR (p_input->>'facility_id')::uuid IS NULL
     OR (p_input->>'doctor_person_id')::uuid IS NULL
     OR (p_input->>'starts_at')::timestamptz IS NULL
     OR (p_input->>'ends_at')::timestamptz IS NULL
     OR (p_input->>'ends_at')::timestamptz<=(p_input->>'starts_at')::timestamptz
     OR (p_input->>'civil_date')::date IS NULL
     OR (p_input->>'local_start')::time IS NULL
     OR p_input->>'payment_method' IS DISTINCT FROM 'cash_on_arrival' THEN
    RAISE EXCEPTION 'invalid appointment request' USING ERRCODE='22023';
  END IF;
  IF p_input ? 'fee_minor_units' OR p_input ? 'feeMinorUnits'
     OR p_input ? 'currency_code' OR p_input ? 'currency' OR p_input ? 'currencyCode' THEN
    RAISE EXCEPTION 'appointment fee and currency are server-owned' USING ERRCODE='22023';
  END IF;

  PERFORM clinical.assert_current_patient_scope_v1(patient);
  SELECT record_id,is_new,response_body
  INTO idem_id,idem_new,idem_response
  FROM clinical.begin_mutation_v1('POST','/v1/appointments');
  IF NOT idem_new THEN RETURN idem_response; END IF;

  appointment_id:=clinical.book_appointment_internal_v1(p_input,NULL,NULL);
  result:=clinical.project_appointment_v1(appointment_id);
  IF result IS NULL THEN RAISE EXCEPTION 'appointment projection unavailable' USING ERRCODE='55000'; END IF;
  PERFORM clinical.record_mutation_effect_v2(
    'clinical.appointment.changed.v1','appointment.created','appointment',
    appointment_id,(result->>'version')::integer,(p_input->>'facility_id')::uuid,patient
  );
  PERFORM clinical.maybe_inject_failure_v1('create_appointment');
  PERFORM clinical.complete_mutation_v1(idem_id,201,'appointment',appointment_id,result);
  RETURN result;
END
$$;

COMMIT;
