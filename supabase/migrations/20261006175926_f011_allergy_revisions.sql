-- Feature 011 K05: typed, immutable allergy revisions and one-use provenance.
-- This migration deliberately stores protected envelopes only; SQL never sees
-- allergy facts or verification-reason plaintext.

CREATE TABLE clinical.allergy_heads (
  id uuid PRIMARY KEY,
  patient_id uuid NOT NULL REFERENCES identity.patients(id) ON DELETE RESTRICT,
  current_revision_id uuid NOT NULL,
  current_version integer NOT NULL CHECK (current_version > 0),
  corrects_allergy_id uuid,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  UNIQUE (id, patient_id),
  CHECK (corrects_allergy_id IS NULL OR corrects_allergy_id <> id),
  FOREIGN KEY (corrects_allergy_id, patient_id)
    REFERENCES clinical.allergy_heads(id, patient_id) ON DELETE RESTRICT
);

CREATE TABLE clinical.allergies (
  id uuid PRIMARY KEY,
  allergy_id uuid NOT NULL,
  patient_id uuid NOT NULL REFERENCES identity.patients(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  supersedes_id uuid,
  verification_status text NOT NULL CHECK (verification_status IN
    ('self_reported', 'clinician_confirmed', 'refuted', 'entered_in_error')),
  facts_contract_id text NOT NULL,
  facts_key_ref text NOT NULL CHECK (pg_catalog.length(facts_key_ref) > 0),
  facts_nonce bytea NOT NULL CHECK (pg_catalog.octet_length(facts_nonce) = 12),
  facts_ciphertext bytea NOT NULL CHECK (pg_catalog.octet_length(facts_ciphertext) > 0),
  facts_auth_tag bytea NOT NULL CHECK (pg_catalog.octet_length(facts_auth_tag) = 16),
  original_recorder_person_id uuid NOT NULL REFERENCES identity.people(id) ON DELETE RESTRICT,
  original_recorded_at timestamptz NOT NULL,
  action_actor_person_id uuid NOT NULL REFERENCES identity.people(id) ON DELETE RESTRICT,
  facility_id uuid REFERENCES identity.facilities(id) ON DELETE RESTRICT,
  encounter_id uuid REFERENCES clinical.encounters(id) ON DELETE RESTRICT,
  reason_contract_id text,
  reason_key_ref text,
  reason_nonce bytea,
  reason_ciphertext bytea,
  reason_auth_tag bytea,
  verification_evidence_ref uuid,
  corrects_allergy_id uuid,
  recorded_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  UNIQUE (id, allergy_id, patient_id),
  UNIQUE (id, allergy_id, patient_id, version),
  UNIQUE (allergy_id, version),
  CHECK (facts_contract_id = 'SHIFAA-F011-ALLERGY-PROTECTED/1'),
  CHECK (version <> 1 OR (verification_status = 'self_reported'
    AND supersedes_id IS NULL AND reason_contract_id IS NULL AND reason_key_ref IS NULL
    AND reason_nonce IS NULL AND reason_ciphertext IS NULL AND reason_auth_tag IS NULL
    AND verification_evidence_ref IS NULL)),
  CHECK (version = 1 OR (supersedes_id IS NOT NULL
    AND reason_contract_id = 'SHIFAA-F011-ALLERGY-PROTECTED/1'
    AND reason_key_ref IS NOT NULL AND pg_catalog.length(reason_key_ref) > 0
    AND reason_nonce IS NOT NULL AND pg_catalog.octet_length(reason_nonce) = 12
    AND reason_ciphertext IS NOT NULL AND pg_catalog.octet_length(reason_ciphertext) > 0
    AND reason_auth_tag IS NOT NULL AND pg_catalog.octet_length(reason_auth_tag) = 16
    AND verification_evidence_ref IS NOT NULL)),
  CHECK (corrects_allergy_id IS NULL OR corrects_allergy_id <> allergy_id),
  FOREIGN KEY (allergy_id, patient_id)
    REFERENCES clinical.allergy_heads(id, patient_id) ON DELETE RESTRICT,
  FOREIGN KEY (corrects_allergy_id, patient_id)
    REFERENCES clinical.allergy_heads(id, patient_id) ON DELETE RESTRICT,
  FOREIGN KEY (supersedes_id, allergy_id, patient_id)
    REFERENCES clinical.allergies(id, allergy_id, patient_id) ON DELETE RESTRICT
);

ALTER TABLE clinical.allergy_heads
  ADD CONSTRAINT allergy_heads_current_revision_fk
  FOREIGN KEY (current_revision_id, id, patient_id, current_version)
  REFERENCES clinical.allergies(id, allergy_id, patient_id, version)
  ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE clinical.allergy_verification_support (
  id uuid PRIMARY KEY,
  patient_id uuid NOT NULL REFERENCES identity.patients(id) ON DELETE RESTRICT,
  allergy_id uuid NOT NULL,
  previous_revision_id uuid NOT NULL,
  previous_version integer NOT NULL CHECK (previous_version > 0),
  target_status text NOT NULL CHECK (target_status IN
    ('clinician_confirmed', 'refuted', 'entered_in_error')),
  attestor_person_id uuid NOT NULL REFERENCES identity.people(id) ON DELETE RESTRICT,
  source_identity text NOT NULL CHECK (pg_catalog.length(source_identity) > 0),
  source_evidence_identity uuid NOT NULL UNIQUE,
  producer_id text NOT NULL CHECK (producer_id = 'f011.allergy_evidence_boundary'),
  recorded_at timestamptz NOT NULL,
  synthetic boolean NOT NULL,
  CHECK (source_evidence_identity = id),
  CHECK (source_identity IN ('governed.internal_clinician_provenance',
    'synthetic.internal_clinician_provenance')),
  FOREIGN KEY (allergy_id, patient_id)
    REFERENCES clinical.allergy_heads(id, patient_id) ON DELETE RESTRICT,
  FOREIGN KEY (previous_revision_id, allergy_id, patient_id, previous_version)
    REFERENCES clinical.allergies(id, allergy_id, patient_id, version) ON DELETE RESTRICT
);

CREATE TABLE clinical.allergy_verification_bindings (
  revision_id uuid PRIMARY KEY,
  binding_id uuid NOT NULL UNIQUE,
  binding_contract_id text NOT NULL CHECK
    (binding_contract_id = 'SHIFAA-F011-VERIFIED-EVIDENCE-BINDING/1'),
  evidence_ref uuid NOT NULL UNIQUE,
  producer_id text NOT NULL CHECK (producer_id = 'f011.allergy_evidence_boundary'),
  verified_at timestamptz NOT NULL,
  FOREIGN KEY (revision_id) REFERENCES clinical.allergies(id) ON DELETE RESTRICT,
  FOREIGN KEY (evidence_ref) REFERENCES clinical.allergy_verification_support(id) ON DELETE RESTRICT
);

CREATE INDEX allergy_heads_patient_idx ON clinical.allergy_heads(patient_id, id);
CREATE INDEX allergies_assertion_version_idx ON clinical.allergies(allergy_id, version);
CREATE INDEX allergies_patient_recorded_idx ON clinical.allergies(patient_id, recorded_at DESC, id DESC);
CREATE INDEX allergy_support_predecessor_idx
  ON clinical.allergy_verification_support(allergy_id, previous_version, id);

CREATE FUNCTION clinical.f011_reject_immutable_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, clinical
AS $function$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'feature 011 evidence rows are immutable';
END
$function$;

CREATE FUNCTION clinical.f011_guard_allergy_head_update_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, clinical
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'allergy heads cannot be deleted';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.patient_id IS DISTINCT FROM OLD.patient_id
     OR NEW.corrects_allergy_id IS DISTINCT FROM OLD.corrects_allergy_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.current_version <> OLD.current_version + 1
     OR NEW.updated_at < OLD.updated_at
     OR NOT EXISTS (
       SELECT 1 FROM clinical.allergies a
       WHERE a.id = NEW.current_revision_id AND a.allergy_id = NEW.id
         AND a.patient_id = NEW.patient_id AND a.version = NEW.current_version
         AND a.supersedes_id = OLD.current_revision_id
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invalid allergy head advancement';
  END IF;
  RETURN NEW;
END
$function$;

CREATE FUNCTION clinical.f011_guard_allergy_verification_binding_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, clinical
AS $function$
DECLARE
  bad boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM clinical.allergies a
    LEFT JOIN clinical.allergy_verification_bindings b ON b.revision_id = a.id
    LEFT JOIN clinical.allergy_verification_support s ON s.id = b.evidence_ref
    WHERE (a.version = 1 AND (b.revision_id IS NOT NULL OR a.verification_evidence_ref IS NOT NULL))
       OR (a.version > 1 AND (
         b.revision_id IS NULL OR s.id IS NULL
         OR a.verification_evidence_ref IS DISTINCT FROM s.id
         OR s.allergy_id IS DISTINCT FROM a.allergy_id
         OR s.patient_id IS DISTINCT FROM a.patient_id
         OR s.previous_revision_id IS DISTINCT FROM a.supersedes_id
         OR s.previous_version <> a.version - 1
         OR s.target_status IS DISTINCT FROM a.verification_status
         OR s.attestor_person_id IS DISTINCT FROM a.action_actor_person_id
         OR s.source_evidence_identity IS DISTINCT FROM b.evidence_ref
         OR b.binding_contract_id <> 'SHIFAA-F011-VERIFIED-EVIDENCE-BINDING/1'
         OR b.producer_id <> s.producer_id
       ))
  ) OR EXISTS (
    SELECT 1
    FROM clinical.allergies a
    LEFT JOIN clinical.allergies p
      ON p.id = a.supersedes_id AND p.allergy_id = a.allergy_id AND p.patient_id = a.patient_id
    WHERE (a.version = 1 AND (a.supersedes_id IS NOT NULL OR a.verification_status <> 'self_reported'))
       OR (a.version > 1 AND (
         p.id IS NULL OR p.version <> a.version - 1
         OR p.original_recorder_person_id IS DISTINCT FROM a.original_recorder_person_id
         OR p.original_recorded_at IS DISTINCT FROM a.original_recorded_at
         OR p.corrects_allergy_id IS DISTINCT FROM a.corrects_allergy_id
         OR p.verification_status = 'entered_in_error'
         OR a.verification_status = p.verification_status
         OR NOT (
           (p.verification_status = 'self_reported'
             AND a.verification_status IN ('clinician_confirmed', 'refuted', 'entered_in_error'))
           OR (p.verification_status = 'clinician_confirmed'
             AND a.verification_status IN ('refuted', 'entered_in_error'))
           OR (p.verification_status = 'refuted'
             AND a.verification_status IN ('clinician_confirmed', 'entered_in_error'))
         )
       ))
  ) OR EXISTS (
    SELECT 1
    FROM clinical.allergy_heads h
    LEFT JOIN clinical.allergies initial_revision
      ON initial_revision.allergy_id = h.id AND initial_revision.patient_id = h.patient_id
     AND initial_revision.version = 1
    LEFT JOIN clinical.allergy_heads corrected ON corrected.id = h.corrects_allergy_id
      AND corrected.patient_id = h.patient_id
    LEFT JOIN clinical.allergies corrected_current
      ON corrected_current.id = corrected.current_revision_id
     AND corrected_current.allergy_id = corrected.id
     AND corrected_current.patient_id = corrected.patient_id
     AND corrected_current.version = corrected.current_version
    WHERE initial_revision.id IS NULL
       OR initial_revision.corrects_allergy_id IS DISTINCT FROM h.corrects_allergy_id
       OR (h.corrects_allergy_id IS NOT NULL AND (
         corrected.id IS NULL OR corrected_current.verification_status <> 'entered_in_error'
       ))
  ) OR EXISTS (
    SELECT 1
    FROM clinical.allergy_heads h
    WHERE h.current_version IS DISTINCT FROM (
      SELECT pg_catalog.max(a.version)
      FROM clinical.allergies a
      WHERE a.allergy_id = h.id AND a.patient_id = h.patient_id
    )
  ) INTO bad;
  IF bad THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'allergy verification support binding is incomplete or mismatched';
  END IF;
  RETURN NULL;
END
$function$;

CREATE TRIGGER allergy_heads_update_guard
BEFORE UPDATE OR DELETE ON clinical.allergy_heads
FOR EACH ROW EXECUTE FUNCTION clinical.f011_guard_allergy_head_update_v1();

CREATE TRIGGER allergies_immutable_guard
BEFORE UPDATE OR DELETE ON clinical.allergies
FOR EACH ROW EXECUTE FUNCTION clinical.f011_reject_immutable_v1();
CREATE TRIGGER allergy_support_immutable_guard
BEFORE UPDATE OR DELETE ON clinical.allergy_verification_support
FOR EACH ROW EXECUTE FUNCTION clinical.f011_reject_immutable_v1();
CREATE TRIGGER allergy_binding_immutable_guard
BEFORE UPDATE OR DELETE ON clinical.allergy_verification_bindings
FOR EACH ROW EXECUTE FUNCTION clinical.f011_reject_immutable_v1();

CREATE CONSTRAINT TRIGGER allergy_revisions_reciprocal_deferred
AFTER INSERT OR UPDATE OR DELETE ON clinical.allergies
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION clinical.f011_guard_allergy_verification_binding_v1();
CREATE CONSTRAINT TRIGGER allergy_support_reciprocal_deferred
AFTER INSERT OR UPDATE OR DELETE ON clinical.allergy_verification_support
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION clinical.f011_guard_allergy_verification_binding_v1();
CREATE CONSTRAINT TRIGGER allergy_bindings_reciprocal_deferred
AFTER INSERT OR UPDATE OR DELETE ON clinical.allergy_verification_bindings
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION clinical.f011_guard_allergy_verification_binding_v1();
CREATE CONSTRAINT TRIGGER allergy_heads_lineage_deferred
AFTER INSERT OR UPDATE OR DELETE ON clinical.allergy_heads
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION clinical.f011_guard_allergy_verification_binding_v1();

ALTER TABLE clinical.allergy_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical.allergy_heads FORCE ROW LEVEL SECURITY;
ALTER TABLE clinical.allergies ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical.allergies FORCE ROW LEVEL SECURITY;
ALTER TABLE clinical.allergy_verification_support ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical.allergy_verification_support FORCE ROW LEVEL SECURITY;
ALTER TABLE clinical.allergy_verification_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical.allergy_verification_bindings FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE clinical.allergy_heads, clinical.allergies,
  clinical.allergy_verification_support, clinical.allergy_verification_bindings FROM PUBLIC;
REVOKE ALL ON FUNCTION clinical.f011_reject_immutable_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION clinical.f011_guard_allergy_head_update_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION clinical.f011_guard_allergy_verification_binding_v1() FROM PUBLIC;

DO $revoke_roles$
DECLARE grantee name;
BEGIN
  FOREACH grantee IN ARRAY ARRAY['shifaa_api', 'shifaa_worker', 'anon', 'authenticated', 'service_role']::name[] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = grantee) THEN
      EXECUTE pg_catalog.format('REVOKE ALL ON TABLE clinical.allergy_heads, clinical.allergies, clinical.allergy_verification_support, clinical.allergy_verification_bindings FROM %I', grantee);
      EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION clinical.f011_reject_immutable_v1() FROM %I', grantee);
      EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION clinical.f011_guard_allergy_head_update_v1() FROM %I', grantee);
      EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION clinical.f011_guard_allergy_verification_binding_v1() FROM %I', grantee);
    END IF;
  END LOOP;
END
$revoke_roles$;
