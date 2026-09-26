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

COMMIT;
