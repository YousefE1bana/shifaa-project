BEGIN;

ALTER TABLE identity.care_relationships DROP CONSTRAINT IF EXISTS care_relationships_status_check;
ALTER TABLE identity.care_relationships ADD CONSTRAINT care_relationships_status_check
  CHECK (status IN ('pending','active','suspended','rejected','revoked','expired'));
ALTER TABLE identity.care_relationships ADD COLUMN IF NOT EXISTS purpose_code text;
ALTER TABLE identity.care_relationships ADD COLUMN IF NOT EXISTS created_by_person_id uuid REFERENCES identity.people(id);
UPDATE identity.care_relationships SET created_by_person_id=actor_person_id WHERE created_by_person_id IS NULL;
ALTER TABLE identity.care_relationships ALTER COLUMN created_by_person_id SET NOT NULL;
ALTER TABLE identity.care_relationships ADD COLUMN IF NOT EXISTS evidence_object_id uuid;
ALTER TABLE identity.care_relationships ADD COLUMN IF NOT EXISTS invite_token_digest bytea;
ALTER TABLE identity.care_relationships ADD COLUMN IF NOT EXISTS invite_key_version integer;
ALTER TABLE identity.care_relationships ADD COLUMN IF NOT EXISTS invite_expires_at timestamptz;
ALTER TABLE identity.care_relationships ADD COLUMN IF NOT EXISTS invite_consumed_at timestamptz;
ALTER TABLE identity.care_relationships ADD COLUMN IF NOT EXISTS reviewed_by_person_id uuid REFERENCES identity.people(id);
ALTER TABLE identity.care_relationships ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE identity.care_relationships ADD COLUMN IF NOT EXISTS decision_reason_code text;
ALTER TABLE identity.care_relationships ADD COLUMN IF NOT EXISTS revoked_by_person_id uuid REFERENCES identity.people(id);
ALTER TABLE identity.care_relationships ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

ALTER TABLE identity.private_evidence_objects DROP CONSTRAINT IF EXISTS private_evidence_objects_bucket_code_check;
ALTER TABLE identity.private_evidence_objects ADD CONSTRAINT private_evidence_objects_bucket_code_check
  CHECK (bucket_code IN ('facility-license-evidence','professional-license-evidence','guardianship-evidence'));
ALTER TABLE identity.private_evidence_objects ADD COLUMN IF NOT EXISTS resource_patient_id uuid REFERENCES identity.patients(id);
ALTER TABLE identity.care_relationships DROP CONSTRAINT IF EXISTS care_relationships_evidence_object_id_fkey;
ALTER TABLE identity.care_relationships ADD CONSTRAINT care_relationships_evidence_object_id_fkey
  FOREIGN KEY(evidence_object_id) REFERENCES identity.private_evidence_objects(id);

ALTER TABLE identity.care_relationships DROP CONSTRAINT IF EXISTS care_relationships_family_shape_check;
ALTER TABLE identity.care_relationships ADD CONSTRAINT care_relationships_family_shape_check CHECK (
  (relationship_type='self' AND status='active' AND purpose_code IS NULL AND evidence_object_id IS NULL AND invite_token_digest IS NULL)
  OR (relationship_type='guardianship' AND purpose_code IS NOT NULL AND evidence_object_id IS NOT NULL AND invite_token_digest IS NULL)
  OR (relationship_type='delegation' AND purpose_code IS NOT NULL AND evidence_object_id IS NULL)
);
ALTER TABLE identity.care_relationships DROP CONSTRAINT IF EXISTS care_relationships_invite_digest_check;
ALTER TABLE identity.care_relationships ADD CONSTRAINT care_relationships_invite_digest_check CHECK (
  invite_token_digest IS NULL OR octet_length(invite_token_digest)=32
);
ALTER TABLE identity.care_relationships DROP CONSTRAINT IF EXISTS care_relationships_review_shape_check;
ALTER TABLE identity.care_relationships ADD CONSTRAINT care_relationships_review_shape_check CHECK (
  reviewed_by_person_id IS NULL OR (reviewed_by_person_id<>actor_person_id AND reviewed_at IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS care_relationship_equivalent_current_uq
  ON identity.care_relationships(subject_patient_id,actor_person_id,relationship_type,purpose_code)
  WHERE relationship_type<>'self' AND status IN ('pending','active','suspended');
CREATE UNIQUE INDEX IF NOT EXISTS care_relationship_pending_invite_digest_uq
  ON identity.care_relationships(invite_token_digest) WHERE invite_token_digest IS NOT NULL AND status='pending';
CREATE INDEX IF NOT EXISTS care_relationship_actor_current_idx
  ON identity.care_relationships(actor_person_id,status,valid_until,created_at DESC,id);
CREATE INDEX IF NOT EXISTS care_relationship_patient_status_idx
  ON identity.care_relationships(subject_patient_id,status,created_at DESC,id);
CREATE INDEX IF NOT EXISTS guardianship_worklist_idx
  ON identity.care_relationships(status,created_at,id) WHERE relationship_type='guardianship';

CREATE TABLE IF NOT EXISTS identity.care_relationship_permissions (
  relationship_id uuid NOT NULL REFERENCES identity.care_relationships(id),
  permission_code text NOT NULL CHECK(permission_code IN (
    'profile.view','appointment.manage','record.view','medication.manage','sos.activate','sos.share','complaint.create','symptom_routing.use','consent.manage'
  )),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_person_id uuid NOT NULL REFERENCES identity.people(id),
  revoked_at timestamptz,
  revoked_by_person_id uuid REFERENCES identity.people(id),
  PRIMARY KEY(relationship_id,permission_code,created_at),
  CHECK((revoked_at IS NULL AND revoked_by_person_id IS NULL) OR (revoked_at IS NOT NULL AND revoked_by_person_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS care_relationship_permission_current_uq
  ON identity.care_relationship_permissions(relationship_id,permission_code) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS care_relationship_permission_action_idx
  ON identity.care_relationship_permissions(permission_code,relationship_id) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS identity.emergency_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_patient_id uuid NOT NULL REFERENCES identity.patients(id),
  created_by_person_id uuid NOT NULL REFERENCES identity.people(id),
  display_name_ciphertext bytea NOT NULL,
  display_name_nonce bytea NOT NULL CHECK(octet_length(display_name_nonce)=12),
  display_name_authentication_tag bytea NOT NULL CHECK(octet_length(display_name_authentication_tag)=16),
  display_name_key_version integer NOT NULL CHECK(display_name_key_version>0),
  phone_ciphertext bytea NOT NULL,
  phone_nonce bytea NOT NULL CHECK(octet_length(phone_nonce)=12),
  phone_authentication_tag bytea NOT NULL CHECK(octet_length(phone_authentication_tag)=16),
  phone_key_version integer NOT NULL CHECK(phone_key_version>0),
  masked_phone text NOT NULL,
  phone_blind_index bytea NOT NULL CHECK(octet_length(phone_blind_index)=32),
  preferred_locale text NOT NULL CHECK(preferred_locale IN ('ar-EG','en-EG')),
  location_precision text NOT NULL CHECK(location_precision IN ('none','coarse','exact')),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','declined','revoked','expired')),
  invite_token_digest bytea NOT NULL CHECK(octet_length(invite_token_digest)=32),
  invite_key_version integer NOT NULL CHECK(invite_key_version>0),
  invite_expires_at timestamptz NOT NULL,
  responded_at timestamptz,
  revoked_by_person_id uuid REFERENCES identity.people(id),
  revoked_at timestamptz,
  decision_reason_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  CHECK(invite_expires_at>created_at),
  CHECK((status IN ('confirmed','declined') AND responded_at IS NOT NULL) OR status NOT IN ('confirmed','declined')),
  CHECK((status='revoked' AND revoked_by_person_id IS NOT NULL AND revoked_at IS NOT NULL AND decision_reason_code IS NOT NULL) OR status<>'revoked')
);
CREATE UNIQUE INDEX IF NOT EXISTS emergency_contact_current_phone_uq
  ON identity.emergency_contacts(subject_patient_id,phone_blind_index) WHERE status IN ('pending','confirmed');
CREATE UNIQUE INDEX IF NOT EXISTS emergency_contact_pending_token_uq
  ON identity.emergency_contacts(invite_token_digest) WHERE status='pending';
CREATE INDEX IF NOT EXISTS emergency_contact_patient_status_idx
  ON identity.emergency_contacts(subject_patient_id,status,created_at DESC,id);

CREATE TABLE IF NOT EXISTS identity.relationship_authorization_uses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  relationship_id uuid NOT NULL REFERENCES identity.care_relationships(id),
  subject_patient_id uuid NOT NULL REFERENCES identity.patients(id),
  actor_person_id uuid NOT NULL REFERENCES identity.people(id),
  permission_code text NOT NULL CHECK(permission_code IN (
    'profile.view','appointment.manage','record.view','medication.manage','sos.activate','sos.share','complaint.create','symptom_routing.use','consent.manage'
  )),
  purpose_code text NOT NULL,
  outcome text NOT NULL CHECK(outcome IN ('allowed','denied')),
  denial_code text,
  relationship_version integer NOT NULL CHECK(relationship_version>0),
  request_id text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS relationship_use_relationship_time_idx
  ON identity.relationship_authorization_uses(relationship_id,occurred_at DESC,id);
CREATE INDEX IF NOT EXISTS relationship_use_request_idx ON identity.relationship_authorization_uses(request_id);

COMMENT ON TABLE identity.care_relationships IS 'retention_class=relationship-authority; no statutory duration asserted';
COMMENT ON TABLE identity.care_relationship_permissions IS 'retention_class=relationship-authority; versioned revocation, no hard delete';
COMMENT ON TABLE identity.emergency_contacts IS 'retention_class=emergency-contact-consent; encrypted contact details';
COMMENT ON TABLE identity.relationship_authorization_uses IS 'retention_class=audit-evidence; append-only minimum authorization use';

CREATE OR REPLACE FUNCTION platform.person_is_patient_self(p_patient_id uuid,p_person_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM identity.patients p WHERE p.id=p_patient_id AND p.person_id=p_person_id AND p.record_status='active')
$$;
CREATE OR REPLACE FUNCTION platform.person_has_family_relationship(p_patient_id uuid,p_person_id uuid,p_permission text DEFAULT NULL) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(
   SELECT 1 FROM identity.care_relationships r
   WHERE r.subject_patient_id=p_patient_id AND r.actor_person_id=p_person_id AND r.status='active'
     AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now())
     AND (r.relationship_type='self' OR r.purpose_code=ANY(platform.context_purposes()))
     AND (r.relationship_type='self' OR p_permission IS NULL OR EXISTS(
       SELECT 1 FROM identity.care_relationship_permissions rp
       WHERE rp.relationship_id=r.id AND rp.permission_code=p_permission AND rp.revoked_at IS NULL
     ))
 )
$$;
CREATE OR REPLACE FUNCTION platform.person_can_manage_emergency_contacts(p_patient_id uuid,p_person_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT platform.person_is_patient_self(p_patient_id,p_person_id) OR EXISTS(
   SELECT 1 FROM identity.care_relationships r
   WHERE r.subject_patient_id=p_patient_id AND r.actor_person_id=p_person_id
     AND r.relationship_type='guardianship' AND r.status='active'
     AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now())
     AND r.purpose_code=ANY(platform.context_purposes())
 )
$$;
CREATE OR REPLACE FUNCTION platform.family_review_context() RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT platform.context_role()='ADM-SUPPORT' AND platform.context_aal()>=2 AND 'guardianship_review'=ANY(platform.context_purposes())
$$;
REVOKE ALL ON FUNCTION platform.person_is_patient_self(uuid,uuid),platform.person_has_family_relationship(uuid,uuid,text),platform.person_can_manage_emergency_contacts(uuid,uuid),platform.family_review_context() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.person_is_patient_self(uuid,uuid),platform.person_has_family_relationship(uuid,uuid,text),platform.person_can_manage_emergency_contacts(uuid,uuid),platform.family_review_context() TO shifaa_api;

CREATE OR REPLACE FUNCTION identity.family_relationship_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,identity,platform AS $$
DECLARE evidence_ok boolean;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.relationship_type='self' THEN
      IF NEW.created_by_person_id IS NULL THEN NEW.created_by_person_id=NEW.actor_person_id; END IF;
      IF platform.context_person_id() IS NULL THEN RETURN NEW; END IF;
      RAISE EXCEPTION 'self relationship is onboarding-owned' USING ERRCODE='42501';
    END IF;
    IF NEW.created_by_person_id<>platform.context_person_id() THEN RAISE EXCEPTION 'relationship creator attribution mismatch' USING ERRCODE='42501'; END IF;
    IF NEW.relationship_type='guardianship' THEN
      SELECT EXISTS(SELECT 1 FROM identity.private_evidence_objects e WHERE e.id=NEW.evidence_object_id AND e.owner_person_id=NEW.actor_person_id AND e.resource_patient_id=NEW.subject_patient_id AND e.bucket_code='guardianship-evidence' AND e.scan_status='released') INTO evidence_ok;
      IF NEW.actor_person_id<>platform.context_person_id() OR NEW.status<>'pending' OR NOT evidence_ok THEN RAISE EXCEPTION 'released bound guardianship evidence required' USING ERRCODE='42501'; END IF;
    ELSIF NEW.relationship_type='delegation' THEN
      IF NOT platform.person_is_patient_self(NEW.subject_patient_id,platform.context_person_id()) OR NEW.status<>'pending' OR NEW.actor_person_id=platform.context_person_id() OR NEW.invite_token_digest IS NULL OR NEW.invite_expires_at<=now() THEN RAISE EXCEPTION 'valid named delegation invitation required' USING ERRCODE='42501'; END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.id<>OLD.id OR NEW.subject_patient_id<>OLD.subject_patient_id OR NEW.actor_person_id<>OLD.actor_person_id OR NEW.relationship_type<>OLD.relationship_type OR NEW.created_by_person_id<>OLD.created_by_person_id OR NEW.purpose_code IS DISTINCT FROM OLD.purpose_code OR NEW.evidence_object_id IS DISTINCT FROM OLD.evidence_object_id OR NEW.valid_from IS DISTINCT FROM OLD.valid_from THEN RAISE EXCEPTION 'relationship identity and authority scope are immutable' USING ERRCODE='23514'; END IF;
  IF NEW.valid_until IS DISTINCT FROM OLD.valid_until AND NOT (
    (OLD.relationship_type='delegation' AND OLD.status IN ('pending','active') AND NEW.status=OLD.status AND platform.context_person_id()=OLD.created_by_person_id) OR
    (OLD.relationship_type='guardianship' AND OLD.status='pending' AND NEW.status='active' AND platform.family_review_context())
  ) THEN RAISE EXCEPTION 'relationship validity change is not authorized' USING ERRCODE='42501'; END IF;
  IF (NEW.invite_token_digest IS DISTINCT FROM OLD.invite_token_digest OR NEW.invite_expires_at IS DISTINCT FROM OLD.invite_expires_at OR NEW.invite_consumed_at IS DISTINCT FROM OLD.invite_consumed_at) AND NOT (
    OLD.relationship_type='delegation' AND OLD.status='pending' AND NEW.status='active' AND platform.context_person_id()=OLD.actor_person_id AND NEW.invite_token_digest IS NULL AND NEW.invite_expires_at IS NULL AND OLD.invite_consumed_at IS NULL AND NEW.invite_consumed_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'invitation evidence is immutable' USING ERRCODE='23514'; END IF;
  IF NEW.status<>OLD.status THEN
    IF OLD.status IN ('rejected','revoked','expired') THEN RAISE EXCEPTION 'terminal relationship state' USING ERRCODE='23514'; END IF;
    IF OLD.relationship_type='guardianship' THEN
      IF NOT platform.family_review_context() OR platform.context_person_id() IN (OLD.actor_person_id,OLD.created_by_person_id) THEN RAISE EXCEPTION 'independent guardianship reviewer required' USING ERRCODE='42501'; END IF;
      IF NOT ((OLD.status='pending' AND NEW.status IN ('active','rejected','expired')) OR (OLD.status='active' AND NEW.status IN ('revoked','expired'))) THEN RAISE EXCEPTION 'invalid guardianship transition' USING ERRCODE='23514'; END IF;
      IF NEW.status IN ('active','rejected') AND (NEW.reviewed_by_person_id IS DISTINCT FROM platform.context_person_id() OR NEW.reviewed_at IS NULL OR NEW.decision_reason_code IS NULL) THEN RAISE EXCEPTION 'attributed guardianship decision required' USING ERRCODE='23514'; END IF;
    ELSIF OLD.relationship_type='delegation' THEN
      IF OLD.status='pending' AND NEW.status='active' AND platform.context_person_id()<>OLD.actor_person_id THEN RAISE EXCEPTION 'named delegate required' USING ERRCODE='42501'; END IF;
      IF NEW.status='revoked' AND platform.context_person_id()<>OLD.created_by_person_id THEN RAISE EXCEPTION 'delegator required' USING ERRCODE='42501'; END IF;
      IF NOT ((OLD.status='pending' AND NEW.status IN ('active','revoked','expired')) OR (OLD.status='active' AND NEW.status IN ('revoked','expired'))) THEN RAISE EXCEPTION 'invalid delegation transition' USING ERRCODE='23514'; END IF;
    END IF;
  END IF;
  NEW.version=OLD.version+1; NEW.updated_at=now(); RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS family_relationship_guard ON identity.care_relationships;
CREATE TRIGGER family_relationship_guard BEFORE INSERT OR UPDATE ON identity.care_relationships FOR EACH ROW EXECUTE FUNCTION identity.family_relationship_guard();

CREATE OR REPLACE FUNCTION identity.family_permission_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,identity,platform AS $$
DECLARE relation identity.care_relationships%ROWTYPE;
BEGIN
 SELECT * INTO relation FROM identity.care_relationships WHERE id=NEW.relationship_id;
 IF relation.relationship_type='self' OR (relation.relationship_type='delegation' AND NEW.permission_code='consent.manage') THEN RAISE EXCEPTION 'permission not allowed for relationship type' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' AND (NEW.created_by_person_id<>platform.context_person_id() OR relation.created_by_person_id<>platform.context_person_id() OR (relation.relationship_type='guardianship' AND relation.status<>'pending')) THEN RAISE EXCEPTION 'only the relationship creator may grant permissions before review' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND (NEW.relationship_id<>OLD.relationship_id OR NEW.permission_code<>OLD.permission_code OR NEW.created_by_person_id<>OLD.created_by_person_id OR NEW.created_at<>OLD.created_at OR OLD.revoked_at IS NOT NULL) THEN RAISE EXCEPTION 'permission evidence is immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND ((relation.relationship_type='guardianship' AND NOT platform.family_review_context()) OR (relation.relationship_type='delegation' AND relation.created_by_person_id<>platform.context_person_id())) THEN RAISE EXCEPTION 'permission revocation actor is not authorized' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS family_permission_guard ON identity.care_relationship_permissions;
CREATE TRIGGER family_permission_guard BEFORE INSERT OR UPDATE ON identity.care_relationship_permissions FOR EACH ROW EXECUTE FUNCTION identity.family_permission_guard();

CREATE OR REPLACE FUNCTION identity.emergency_contact_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,identity,platform AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.created_by_person_id<>platform.context_person_id() OR NEW.status<>'pending' OR NOT platform.person_can_manage_emergency_contacts(NEW.subject_patient_id,platform.context_person_id()) THEN RAISE EXCEPTION 'current patient or guardian required' USING ERRCODE='42501'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.id<>OLD.id OR NEW.subject_patient_id<>OLD.subject_patient_id OR NEW.created_by_person_id<>OLD.created_by_person_id OR NEW.invite_token_digest<>OLD.invite_token_digest OR NEW.display_name_ciphertext<>OLD.display_name_ciphertext OR NEW.display_name_nonce<>OLD.display_name_nonce OR NEW.display_name_authentication_tag<>OLD.display_name_authentication_tag OR NEW.display_name_key_version<>OLD.display_name_key_version OR NEW.phone_ciphertext<>OLD.phone_ciphertext OR NEW.phone_nonce<>OLD.phone_nonce OR NEW.phone_authentication_tag<>OLD.phone_authentication_tag OR NEW.phone_key_version<>OLD.phone_key_version OR NEW.masked_phone<>OLD.masked_phone OR NEW.phone_blind_index<>OLD.phone_blind_index OR NEW.preferred_locale<>OLD.preferred_locale OR NEW.location_precision<>OLD.location_precision THEN RAISE EXCEPTION 'contact identity and consent scope are immutable' USING ERRCODE='23514'; END IF;
 IF OLD.status IN ('declined','revoked','expired') AND NEW.status<>OLD.status THEN RAISE EXCEPTION 'terminal contact state' USING ERRCODE='23514'; END IF;
 IF NOT ((OLD.status='pending' AND NEW.status IN ('pending','confirmed','declined','revoked','expired')) OR (OLD.status='confirmed' AND NEW.status IN ('confirmed','revoked')) OR NEW.status=OLD.status) THEN RAISE EXCEPTION 'invalid contact transition' USING ERRCODE='23514'; END IF;
 IF NEW.status='revoked' AND (NEW.revoked_by_person_id IS DISTINCT FROM platform.context_person_id() OR NOT platform.person_can_manage_emergency_contacts(OLD.subject_patient_id,platform.context_person_id())) THEN RAISE EXCEPTION 'contact owner revocation required' USING ERRCODE='42501'; END IF;
 NEW.version=OLD.version+1; NEW.updated_at=now(); RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS emergency_contact_guard ON identity.emergency_contacts;
CREATE TRIGGER emergency_contact_guard BEFORE INSERT OR UPDATE ON identity.emergency_contacts FOR EACH ROW EXECUTE FUNCTION identity.emergency_contact_guard();

CREATE OR REPLACE FUNCTION platform.respond_emergency_contact_invite(
  p_token_digest bytea,
  p_decision text
) RETURNS TABLE(contact_id uuid,subject_patient_id uuid,status text,version integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,identity AS $$
BEGIN
  IF p_decision NOT IN ('confirmed','declined') OR octet_length(p_token_digest)<>32 THEN
    RAISE EXCEPTION 'invite unavailable' USING ERRCODE='22023';
  END IF;
  RETURN QUERY
    UPDATE identity.emergency_contacts c
       SET status=p_decision,responded_at=now()
     WHERE c.invite_token_digest=p_token_digest
       AND c.status='pending'
       AND c.invite_expires_at>now()
     RETURNING c.id,c.subject_patient_id,c.status,c.version;
END $$;
REVOKE ALL ON FUNCTION platform.respond_emergency_contact_invite(bytea,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.respond_emergency_contact_invite(bytea,text) TO shifaa_api;

DROP TRIGGER IF EXISTS relationship_authorization_uses_append_only ON identity.relationship_authorization_uses;
CREATE TRIGGER relationship_authorization_uses_append_only BEFORE UPDATE OR DELETE ON identity.relationship_authorization_uses FOR EACH ROW EXECUTE FUNCTION platform.reject_mutation();

GRANT SELECT,INSERT,UPDATE ON identity.care_relationships,identity.care_relationship_permissions,identity.emergency_contacts TO shifaa_api;
GRANT INSERT ON identity.relationship_authorization_uses TO shifaa_api;
REVOKE DELETE ON identity.care_relationships,identity.care_relationship_permissions,identity.emergency_contacts,identity.relationship_authorization_uses FROM PUBLIC,shifaa_api;
REVOKE SELECT,UPDATE ON identity.relationship_authorization_uses FROM PUBLIC,shifaa_api;
ALTER TABLE identity.care_relationship_permissions ENABLE ROW LEVEL SECURITY; ALTER TABLE identity.care_relationship_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE identity.emergency_contacts ENABLE ROW LEVEL SECURITY; ALTER TABLE identity.emergency_contacts FORCE ROW LEVEL SECURITY;
ALTER TABLE identity.relationship_authorization_uses ENABLE ROW LEVEL SECURITY; ALTER TABLE identity.relationship_authorization_uses FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS relationships_self_select ON identity.care_relationships;
DROP POLICY IF EXISTS family_relationships_select ON identity.care_relationships;
CREATE POLICY family_relationships_select ON identity.care_relationships FOR SELECT TO shifaa_api USING (
 actor_person_id=platform.context_person_id() OR created_by_person_id=platform.context_person_id() OR platform.person_is_patient_self(subject_patient_id,platform.context_person_id()) OR (relationship_type='guardianship' AND platform.family_review_context())
);
DROP POLICY IF EXISTS family_relationships_insert ON identity.care_relationships;
CREATE POLICY family_relationships_insert ON identity.care_relationships FOR INSERT TO shifaa_api WITH CHECK(created_by_person_id=platform.context_person_id());
DROP POLICY IF EXISTS family_relationships_update ON identity.care_relationships;
CREATE POLICY family_relationships_update ON identity.care_relationships FOR UPDATE TO shifaa_api USING(actor_person_id=platform.context_person_id() OR created_by_person_id=platform.context_person_id() OR (relationship_type='guardianship' AND platform.family_review_context())) WITH CHECK(actor_person_id=platform.context_person_id() OR created_by_person_id=platform.context_person_id() OR (relationship_type='guardianship' AND platform.family_review_context()));
DROP POLICY IF EXISTS family_permissions_select ON identity.care_relationship_permissions;
CREATE POLICY family_permissions_select ON identity.care_relationship_permissions FOR SELECT TO shifaa_api USING(EXISTS(SELECT 1 FROM identity.care_relationships r WHERE r.id=relationship_id AND (r.actor_person_id=platform.context_person_id() OR r.created_by_person_id=platform.context_person_id() OR (r.relationship_type='guardianship' AND platform.family_review_context()))));
DROP POLICY IF EXISTS family_permissions_insert ON identity.care_relationship_permissions;
CREATE POLICY family_permissions_insert ON identity.care_relationship_permissions FOR INSERT TO shifaa_api WITH CHECK(created_by_person_id=platform.context_person_id() AND EXISTS(SELECT 1 FROM identity.care_relationships r WHERE r.id=relationship_id AND r.created_by_person_id=platform.context_person_id()));
DROP POLICY IF EXISTS family_permissions_update ON identity.care_relationship_permissions;
CREATE POLICY family_permissions_update ON identity.care_relationship_permissions FOR UPDATE TO shifaa_api USING(created_by_person_id=platform.context_person_id() OR platform.family_review_context()) WITH CHECK(revoked_by_person_id=platform.context_person_id());
DROP POLICY IF EXISTS emergency_contacts_select ON identity.emergency_contacts;
CREATE POLICY emergency_contacts_select ON identity.emergency_contacts FOR SELECT TO shifaa_api USING(platform.person_can_manage_emergency_contacts(subject_patient_id,platform.context_person_id()));
DROP POLICY IF EXISTS emergency_contacts_insert ON identity.emergency_contacts;
CREATE POLICY emergency_contacts_insert ON identity.emergency_contacts FOR INSERT TO shifaa_api WITH CHECK(created_by_person_id=platform.context_person_id() AND platform.person_can_manage_emergency_contacts(subject_patient_id,platform.context_person_id()));
DROP POLICY IF EXISTS emergency_contacts_update ON identity.emergency_contacts;
CREATE POLICY emergency_contacts_update ON identity.emergency_contacts FOR UPDATE TO shifaa_api USING(platform.person_can_manage_emergency_contacts(subject_patient_id,platform.context_person_id())) WITH CHECK(platform.person_can_manage_emergency_contacts(subject_patient_id,platform.context_person_id()));
DROP POLICY IF EXISTS relationship_uses_insert ON identity.relationship_authorization_uses;
CREATE POLICY relationship_uses_insert ON identity.relationship_authorization_uses FOR INSERT TO shifaa_api WITH CHECK(actor_person_id=platform.context_person_id() AND platform.person_has_family_relationship(subject_patient_id,actor_person_id,permission_code));

DROP POLICY IF EXISTS evidence_owner_select ON identity.private_evidence_objects;
CREATE POLICY evidence_owner_select ON identity.private_evidence_objects FOR SELECT TO shifaa_api USING(
 owner_person_id=platform.context_person_id() OR
 (scan_status='released' AND platform.context_role()='ADM-FACILITY' AND platform.context_aal()>=2 AND ((bucket_code='facility-license-evidence' AND 'facility_approval'=ANY(platform.context_purposes())) OR (bucket_code='professional-license-evidence' AND 'professional_license_review'=ANY(platform.context_purposes())))) OR
 (scan_status='released' AND bucket_code='guardianship-evidence' AND platform.family_review_context())
);

ALTER TABLE platform.outbox_events DROP CONSTRAINT IF EXISTS outbox_events_event_type_check;
ALTER TABLE platform.outbox_events ADD CONSTRAINT outbox_events_event_type_check CHECK(event_type IN (
 'identity.verification.changed','identity.manual_review.requested','consent.changed','facility.changed','professional_license.changed','membership.changed','admin_role.changed',
  'relationship.guardianship.changed','relationship.guardianship.created','relationship.guardianship.active','relationship.guardianship.rejected','relationship.guardianship.revoked',
  'relationship.delegation.changed','relationship.delegation.created','relationship.delegation.accepted','relationship.delegation.updated','relationship.delegation.revoked',
  'emergency_contact.changed','emergency_contact.created','emergency_contact.confirmed','emergency_contact.declined','emergency_contact.revoked',
  'sos.emergency_contact.requested','sos.emergency_contact.denied'
));

INSERT INTO identity.role_permissions(role_code,action_code,resource_code,min_aal,purpose_code) VALUES
 ('support_admin','listGuardianshipCases','care_relationship',2,'guardianship_review'),
 ('support_admin','reviewGuardianship','care_relationship',2,'guardianship_review')
ON CONFLICT(role_code,action_code,resource_code) DO UPDATE SET min_aal=EXCLUDED.min_aal,purpose_code=EXCLUDED.purpose_code;

INSERT INTO consent.processing_inventory(process_code,owner_name,controller_name,purposes,data_categories,systems,retention_class,lawful_basis,approval_digest,status)
VALUES('family-care-synthetic','SHIFAA Product Owner','SHIFAA synthetic environment',ARRAY['family_authority','emergency_contact_consent'],ARRAY['relationship','contact','synthetic-evidence'],ARRAY['local-api','local-worker'],'relationship-authority','synthetic-engineering-only','family-004-synthetic-only','active')
ON CONFLICT(process_code) DO NOTHING;

INSERT INTO identity.people(id,user_id,display_name,nationality_code,preferred_locale,profile_status) VALUES
 ('40000000-0000-4000-8000-000000000001','40000000-0000-4000-9000-000000000001','Synthetic Self Patient','EG','ar-EG','active'),
 ('40000000-0000-4000-8000-000000000002','40000000-0000-4000-9000-000000000002','Synthetic Dependent','EG','ar-EG','active'),
 ('40000000-0000-4000-8000-000000000003','40000000-0000-4000-9000-000000000003','Synthetic Proposed Guardian','EG','ar-EG','active'),
 ('40000000-0000-4000-8000-000000000004','40000000-0000-4000-9000-000000000004','Synthetic Delegate','EG','en-EG','active'),
 ('40000000-0000-4000-8000-000000000005','40000000-0000-4000-9000-000000000005','Synthetic Unrelated Person','EG','en-EG','active'),
 ('40000000-0000-4000-8000-000000000006','40000000-0000-4000-9000-000000000006','Synthetic Support Reviewer','EG','ar-EG','active'),
 ('40000000-0000-4000-8000-000000000007','40000000-0000-4000-9000-000000000007','Synthetic Wrong Reviewer','EG','en-EG','active')
ON CONFLICT(id) DO NOTHING;
INSERT INTO identity.patients(id,person_id,medical_record_number) VALUES
 ('41000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','SYN-FAM-SELF-001'),
 ('41000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','SYN-FAM-DEP-001'),
 ('41000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000005','SYN-FAM-OTHER-001')
ON CONFLICT(id) DO NOTHING;
INSERT INTO identity.care_relationships(id,subject_patient_id,actor_person_id,relationship_type,status,valid_from,created_by_person_id) VALUES
 ('43000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','self','active','2026-01-01T00:00:00Z','40000000-0000-4000-8000-000000000001'),
 ('43000000-0000-4000-8000-000000000010','41000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','self','active','2026-01-01T00:00:00Z','40000000-0000-4000-8000-000000000002'),
 ('43000000-0000-4000-8000-000000000011','41000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000005','self','active','2026-01-01T00:00:00Z','40000000-0000-4000-8000-000000000005')
ON CONFLICT(id) DO NOTHING;
INSERT INTO identity.private_evidence_objects(id,bucket_code,object_key,owner_person_id,resource_patient_id,sha256,mime_type,size_bytes,scan_status,released_at) VALUES
 ('42000000-0000-4000-8000-000000000001','guardianship-evidence','synthetic/guardian/released','40000000-0000-4000-8000-000000000003','41000000-0000-4000-8000-000000000002',repeat('4',64),'application/pdf',1024,'released','2026-08-11T08:00:00Z'),
 ('42000000-0000-4000-8000-000000000002','guardianship-evidence','synthetic/guardian/quarantined','40000000-0000-4000-8000-000000000003','41000000-0000-4000-8000-000000000002',repeat('5',64),'application/pdf',1024,'quarantined',NULL),
 ('42000000-0000-4000-8000-000000000003','guardianship-evidence','synthetic/guardian/wrong-owner','40000000-0000-4000-8000-000000000005','41000000-0000-4000-8000-000000000002',repeat('6',64),'application/pdf',1024,'released','2026-08-11T08:00:00Z'),
 ('42000000-0000-4000-8000-000000000004','guardianship-evidence','synthetic/guardian/wrong-patient','40000000-0000-4000-8000-000000000003','41000000-0000-4000-8000-000000000003',repeat('7',64),'application/pdf',1024,'released','2026-08-11T08:00:00Z')
ON CONFLICT(id) DO NOTHING;

INSERT INTO identity.care_relationships(
 id,subject_patient_id,actor_person_id,relationship_type,status,valid_from,purpose_code,
 created_by_person_id,evidence_object_id,version
) VALUES (
 '43000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000002',
 '40000000-0000-4000-8000-000000000003','guardianship','pending','2026-08-11T09:00:00Z',
 'dependent_care','40000000-0000-4000-8000-000000000003',
 '42000000-0000-4000-8000-000000000001',1
) ON CONFLICT(id) DO NOTHING;
INSERT INTO identity.care_relationship_permissions(
 relationship_id,permission_code,created_by_person_id
) VALUES
 ('43000000-0000-4000-8000-000000000002','profile.view','40000000-0000-4000-8000-000000000003'),
 ('43000000-0000-4000-8000-000000000002','appointment.manage','40000000-0000-4000-8000-000000000003'),
 ('43000000-0000-4000-8000-000000000002','record.view','40000000-0000-4000-8000-000000000003')
ON CONFLICT DO NOTHING;

COMMIT;
