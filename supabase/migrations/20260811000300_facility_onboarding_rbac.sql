BEGIN;
CREATE TABLE IF NOT EXISTS identity.facilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), facility_type text NOT NULL CHECK (facility_type IN ('clinic','pharmacy','hospital','laboratory')),
  name_ar text NOT NULL, name_en text NOT NULL, facility_status text NOT NULL DEFAULT 'draft' CHECK (facility_status IN ('draft','pending_review','active','suspended','rejected','closed')),
  governorate_code text NOT NULL, city text NOT NULL, district text NOT NULL, address_line text NOT NULL,
  created_by_person_id uuid NOT NULL REFERENCES identity.people(id), submitted_at timestamptz, reviewed_by_person_id uuid REFERENCES identity.people(id), reviewed_at timestamptz,
  decision_reason text, version integer NOT NULL DEFAULT 1 CHECK (version > 0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS facilities_creator_status_idx ON identity.facilities(created_by_person_id,facility_status,id);
CREATE INDEX IF NOT EXISTS facilities_worklist_idx ON identity.facilities(facility_status,created_at,id) WHERE facility_status IN ('pending_review','suspended');
CREATE TABLE IF NOT EXISTS identity.private_evidence_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_code text NOT NULL CHECK (bucket_code IN ('facility-license-evidence','professional-license-evidence')),
  object_key text NOT NULL UNIQUE, owner_person_id uuid NOT NULL REFERENCES identity.people(id), facility_id uuid REFERENCES identity.facilities(id),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'), mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','application/pdf')),
  size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760), scan_status text NOT NULL DEFAULT 'quarantined' CHECK (scan_status IN ('quarantined','released','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(), released_at timestamptz
);
CREATE INDEX IF NOT EXISTS evidence_owner_scan_idx ON identity.private_evidence_objects(owner_person_id,scan_status,created_at,id);
CREATE INDEX IF NOT EXISTS evidence_facility_scan_idx ON identity.private_evidence_objects(facility_id,scan_status,id) WHERE facility_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS identity.facility_licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), facility_id uuid NOT NULL REFERENCES identity.facilities(id), license_type text NOT NULL,
  number_ciphertext bytea NOT NULL, number_hash bytea NOT NULL, issuer text NOT NULL, issued_on date, expires_on date NOT NULL,
  licensed_activities text[] NOT NULL CHECK (cardinality(licensed_activities)>0), status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected','suspended','expired')),
  evidence_object_id uuid NOT NULL REFERENCES identity.private_evidence_objects(id), reviewed_by_person_id uuid REFERENCES identity.people(id), reviewed_at timestamptz, decision_reason text,
  version integer NOT NULL DEFAULT 1 CHECK(version>0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS facility_license_active_number_uq ON identity.facility_licenses(license_type,number_hash) WHERE status IN ('pending','verified','suspended');
CREATE INDEX IF NOT EXISTS facility_license_status_expiry_idx ON identity.facility_licenses(facility_id,status,expires_on,id);
CREATE TABLE IF NOT EXISTS identity.professional_licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), person_id uuid NOT NULL REFERENCES identity.people(id), profession text NOT NULL CHECK(profession IN ('doctor','pharmacist','nurse','lab_professional')),
  specialty_code text, number_ciphertext bytea NOT NULL, number_hash bytea NOT NULL, issuer text NOT NULL, expires_on date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','verified','rejected','suspended','expired')), evidence_object_id uuid REFERENCES identity.private_evidence_objects(id),
  reviewed_by_person_id uuid REFERENCES identity.people(id), reviewed_at timestamptz, decision_reason text, version integer NOT NULL DEFAULT 1 CHECK(version>0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE identity.professional_licenses ADD COLUMN IF NOT EXISTS masked_license_number text NOT NULL DEFAULT '••••0000';
CREATE UNIQUE INDEX IF NOT EXISTS professional_license_active_number_uq ON identity.professional_licenses(profession,number_hash) WHERE status IN ('pending','verified','suspended');
CREATE INDEX IF NOT EXISTS professional_license_person_status_idx ON identity.professional_licenses(person_id,status,expires_on,id);
CREATE TABLE IF NOT EXISTS identity.facility_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), facility_id uuid NOT NULL REFERENCES identity.facilities(id), person_id uuid NOT NULL REFERENCES identity.people(id),
  role_code text NOT NULL CHECK(role_code IN ('owner','doctor','pharmacist','nurse','lab_professional')), employment_license_id uuid REFERENCES identity.professional_licenses(id), invite_token_hash bytea, invite_expires_at timestamptz,
  valid_from timestamptz NOT NULL, valid_until timestamptz, membership_status text NOT NULL CHECK(membership_status IN ('invited','active','suspended','ended','expired','rejected')),
  created_by_person_id uuid NOT NULL REFERENCES identity.people(id), version integer NOT NULL DEFAULT 1 CHECK(version>0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS facility_membership_active_person_uq ON identity.facility_memberships(facility_id,person_id) WHERE membership_status IN ('invited','active','suspended');
CREATE INDEX IF NOT EXISTS facility_membership_facility_status_idx ON identity.facility_memberships(facility_id,membership_status,created_at,id);
CREATE INDEX IF NOT EXISTS facility_membership_person_status_idx ON identity.facility_memberships(person_id,membership_status,valid_from,valid_until);
CREATE TABLE IF NOT EXISTS identity.role_permissions (
  role_code text NOT NULL CHECK(role_code IN ('super_admin','support_admin','medical_reviewer','facility_approver','finance_reviewer')),
  action_code text NOT NULL, resource_code text NOT NULL, min_aal integer NOT NULL DEFAULT 1 CHECK(min_aal IN (1,2)), purpose_code text,
  required_profession text, patient_relationship_required boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(role_code,action_code,resource_code)
);
CREATE TABLE IF NOT EXISTS identity.admin_role_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), person_id uuid NOT NULL REFERENCES identity.people(id), role_code text NOT NULL CHECK(role_code IN ('super_admin','support_admin','medical_reviewer','facility_approver','finance_reviewer')),
  status text NOT NULL CHECK(status IN ('pending','active','rejected','revoked','expired')), valid_from timestamptz NOT NULL, valid_until timestamptz,
  proposed_by uuid NOT NULL REFERENCES identity.people(id), decided_by uuid REFERENCES identity.people(id), decision_reason text,
  version integer NOT NULL DEFAULT 1 CHECK(version>0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(proposed_by<>person_id), CHECK(decided_by IS NULL OR (decided_by<>proposed_by AND decided_by<>person_id))
);
CREATE UNIQUE INDEX IF NOT EXISTS admin_role_active_person_uq ON identity.admin_role_grants(person_id,role_code) WHERE status='active';
CREATE INDEX IF NOT EXISTS admin_role_status_idx ON identity.admin_role_grants(status,created_at,id);
CREATE TABLE IF NOT EXISTS identity.admin_role_revocation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), grant_id uuid NOT NULL REFERENCES identity.admin_role_grants(id), status text NOT NULL CHECK(status IN ('pending','approved','rejected','cancelled')),
  reason text NOT NULL, proposed_by uuid NOT NULL REFERENCES identity.people(id), decided_by uuid REFERENCES identity.people(id), decision_reason text,
  version integer NOT NULL DEFAULT 1 CHECK(version>0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), CHECK(decided_by IS NULL OR decided_by<>proposed_by)
);
CREATE UNIQUE INDEX IF NOT EXISTS admin_revocation_pending_uq ON identity.admin_role_revocation_requests(grant_id) WHERE status='pending';

INSERT INTO identity.role_permissions(role_code,action_code,resource_code,min_aal,purpose_code) VALUES
('super_admin','listAdminRoleGrants','admin_role_grant',1,NULL),('super_admin','proposeAdminRoleGrant','admin_role_grant',2,'role_governance'),
('super_admin','decideAdminRoleGrant','admin_role_grant',2,'role_governance'),('super_admin','proposeAdminRoleRevocation','admin_role_grant',2,'role_governance'),
('super_admin','decideAdminRoleRevocation','admin_role_grant',2,'role_governance'),('facility_approver','getProfessionalLicense','professional_license',1,NULL),
('facility_approver','listProfessionalLicenseCases','professional_license',2,'professional_license_review'),('facility_approver','reviewProfessionalLicense','professional_license',2,'professional_license_review'),
('facility_approver','listFacilityApprovalCases','facility',2,'facility_approval'),('facility_approver','reviewFacility','facility',2,'facility_approval'),
('facility_approver','createIdentityUpload','identity_verification',1,NULL),('facility_approver','getVerificationCase','identity_verification',1,NULL),
('facility_approver','listIdentityVerificationCases','identity_verification',2,'identity.review'),('facility_approver','reviewVerificationCase','identity_verification',2,'identity.review')
ON CONFLICT DO NOTHING;

ALTER TABLE platform.outbox_events DROP CONSTRAINT IF EXISTS outbox_events_event_type_check;
ALTER TABLE platform.outbox_events ADD CONSTRAINT outbox_events_event_type_check CHECK(event_type IN (
 'identity.verification.changed','identity.manual_review.requested','consent.changed',
 'facility.changed','professional_license.changed','membership.changed','admin_role.changed'
));

CREATE OR REPLACE FUNCTION identity.facility_status_transition_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,identity AS $$
BEGIN
  IF NEW.facility_type<>OLD.facility_type THEN RAISE EXCEPTION 'facility type is immutable' USING ERRCODE='23514'; END IF;
  IF NEW.facility_status<>OLD.facility_status AND NOT ((OLD.facility_status='draft' AND NEW.facility_status='pending_review') OR (OLD.facility_status='pending_review' AND NEW.facility_status IN ('active','rejected')) OR (OLD.facility_status='active' AND NEW.facility_status='suspended') OR (OLD.facility_status='suspended' AND NEW.facility_status='pending_review') OR (OLD.facility_status='rejected' AND NEW.facility_status='draft')) THEN RAISE EXCEPTION 'invalid facility transition' USING ERRCODE='23514'; END IF;
  NEW.version=OLD.version+1; NEW.updated_at=now(); RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS facility_status_guard ON identity.facilities;
CREATE TRIGGER facility_status_guard BEFORE UPDATE ON identity.facilities FOR EACH ROW EXECUTE FUNCTION identity.facility_status_transition_guard();
CREATE OR REPLACE FUNCTION identity.admin_grant_direct_revoke_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,identity AS $$
BEGIN
  IF OLD.status='active' AND NEW.status='revoked' AND NOT EXISTS(
    SELECT 1 FROM identity.admin_role_revocation_requests r
    WHERE r.grant_id=OLD.id AND r.status='approved'
      AND r.decided_by=platform.context_person_id()
      AND r.proposed_by<>platform.context_person_id()
      AND OLD.person_id<>platform.context_person_id()
  ) THEN RAISE EXCEPTION 'approved independent revocation required' USING ERRCODE='42501'; END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS admin_grant_revoke_guard ON identity.admin_role_grants;
CREATE TRIGGER admin_grant_revoke_guard BEFORE UPDATE ON identity.admin_role_grants FOR EACH ROW EXECUTE FUNCTION identity.admin_grant_direct_revoke_guard();

CREATE OR REPLACE FUNCTION identity.admin_grant_attribution_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,identity,platform AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.proposed_by<>platform.context_person_id() OR NEW.status<>'pending' OR NEW.decided_by IS NOT NULL THEN
      RAISE EXCEPTION 'grant proposer attribution mismatch' USING ERRCODE='42501';
    END IF;
  ELSE
    IF (NEW.person_id,NEW.role_code,NEW.proposed_by) IS DISTINCT FROM (OLD.person_id,OLD.role_code,OLD.proposed_by) THEN
      RAISE EXCEPTION 'grant attribution is immutable' USING ERRCODE='42501';
    END IF;
    IF OLD.status='pending' AND NEW.status IN ('active','rejected') THEN
      IF NEW.decided_by IS DISTINCT FROM platform.context_person_id() OR NEW.decided_by IN (OLD.proposed_by,OLD.person_id) THEN
        RAISE EXCEPTION 'independent current grant decider required' USING ERRCODE='42501';
      END IF;
    ELSIF NEW.decided_by IS DISTINCT FROM OLD.decided_by THEN
      RAISE EXCEPTION 'grant decider attribution is immutable' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS admin_grant_attribution_guard ON identity.admin_role_grants;
CREATE TRIGGER admin_grant_attribution_guard BEFORE INSERT OR UPDATE ON identity.admin_role_grants FOR EACH ROW EXECUTE FUNCTION identity.admin_grant_attribution_guard();

CREATE OR REPLACE FUNCTION identity.admin_revocation_attribution_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,identity,platform AS $$
DECLARE target_person uuid;
BEGIN
  SELECT person_id INTO target_person FROM identity.admin_role_grants WHERE id=NEW.grant_id;
  IF TG_OP='INSERT' THEN
    IF NEW.proposed_by<>platform.context_person_id() OR NEW.status<>'pending' OR NEW.decided_by IS NOT NULL OR NEW.proposed_by=target_person THEN
      RAISE EXCEPTION 'revocation proposer attribution mismatch' USING ERRCODE='42501';
    END IF;
  ELSE
    IF (NEW.grant_id,NEW.proposed_by) IS DISTINCT FROM (OLD.grant_id,OLD.proposed_by) THEN
      RAISE EXCEPTION 'revocation attribution is immutable' USING ERRCODE='42501';
    END IF;
    IF OLD.status='pending' AND NEW.status IN ('approved','rejected') THEN
      IF NEW.decided_by IS DISTINCT FROM platform.context_person_id() OR NEW.decided_by IN (OLD.proposed_by,target_person) THEN
        RAISE EXCEPTION 'independent current revocation decider required' USING ERRCODE='42501';
      END IF;
    ELSIF NEW.decided_by IS DISTINCT FROM OLD.decided_by THEN
      RAISE EXCEPTION 'revocation decider attribution is immutable' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS admin_revocation_attribution_guard ON identity.admin_role_revocation_requests;
CREATE TRIGGER admin_revocation_attribution_guard BEFORE INSERT OR UPDATE ON identity.admin_role_revocation_requests FOR EACH ROW EXECUTE FUNCTION identity.admin_revocation_attribution_guard();

CREATE OR REPLACE FUNCTION identity.facility_membership_license_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,identity AS $$
BEGIN
  IF NEW.role_code='owner' THEN
    IF NEW.employment_license_id IS NOT NULL THEN RAISE EXCEPTION 'owner membership cannot use professional license' USING ERRCODE='23514'; END IF;
  ELSIF NOT EXISTS(
    SELECT 1 FROM identity.professional_licenses l WHERE l.id=NEW.employment_license_id
      AND l.person_id=NEW.person_id AND l.profession=NEW.role_code
      AND l.status='verified' AND l.expires_on>=current_date
  ) THEN RAISE EXCEPTION 'membership professional license invalid' USING ERRCODE='23514';
  END IF;
  IF NEW.membership_status='invited' AND (NEW.invite_token_hash IS NULL OR NEW.invite_expires_at IS NULL) THEN
    RAISE EXCEPTION 'invited membership requires expiring token' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS facility_membership_license_guard ON identity.facility_memberships;
CREATE TRIGGER facility_membership_license_guard BEFORE INSERT OR UPDATE ON identity.facility_memberships FOR EACH ROW EXECUTE FUNCTION identity.facility_membership_license_guard();

GRANT SELECT,INSERT,UPDATE ON identity.facilities,identity.private_evidence_objects,identity.facility_licenses,identity.professional_licenses,identity.facility_memberships,identity.admin_role_grants,identity.admin_role_revocation_requests TO shifaa_api;
GRANT SELECT ON identity.role_permissions TO shifaa_api;
REVOKE DELETE ON identity.facilities,identity.private_evidence_objects,identity.facility_licenses,identity.professional_licenses,identity.facility_memberships,identity.role_permissions,identity.admin_role_grants,identity.admin_role_revocation_requests FROM PUBLIC,shifaa_api;
ALTER TABLE identity.facilities ENABLE ROW LEVEL SECURITY; ALTER TABLE identity.facilities FORCE ROW LEVEL SECURITY;
ALTER TABLE identity.private_evidence_objects ENABLE ROW LEVEL SECURITY; ALTER TABLE identity.private_evidence_objects FORCE ROW LEVEL SECURITY;
ALTER TABLE identity.facility_licenses ENABLE ROW LEVEL SECURITY; ALTER TABLE identity.facility_licenses FORCE ROW LEVEL SECURITY;
ALTER TABLE identity.professional_licenses ENABLE ROW LEVEL SECURITY; ALTER TABLE identity.professional_licenses FORCE ROW LEVEL SECURITY;
ALTER TABLE identity.facility_memberships ENABLE ROW LEVEL SECURITY; ALTER TABLE identity.facility_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE identity.role_permissions ENABLE ROW LEVEL SECURITY; ALTER TABLE identity.role_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE identity.admin_role_grants ENABLE ROW LEVEL SECURITY; ALTER TABLE identity.admin_role_grants FORCE ROW LEVEL SECURITY;
ALTER TABLE identity.admin_role_revocation_requests ENABLE ROW LEVEL SECURITY; ALTER TABLE identity.admin_role_revocation_requests FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION platform.person_owns_facility(p_facility_id uuid,p_person_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM identity.facilities f WHERE f.id=p_facility_id AND f.created_by_person_id=p_person_id)
$$;
CREATE OR REPLACE FUNCTION platform.person_is_active_facility_member(p_facility_id uuid,p_person_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM identity.facility_memberships m WHERE m.facility_id=p_facility_id AND m.person_id=p_person_id AND m.membership_status='active' AND m.valid_from<=now() AND (m.valid_until IS NULL OR m.valid_until>now()))
$$;
REVOKE ALL ON FUNCTION platform.person_owns_facility(uuid,uuid),platform.person_is_active_facility_member(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.person_owns_facility(uuid,uuid),platform.person_is_active_facility_member(uuid,uuid) TO shifaa_api;

CREATE POLICY facilities_select ON identity.facilities FOR SELECT TO shifaa_api USING (
 created_by_person_id=platform.context_person_id() OR platform.person_is_active_facility_member(id,platform.context_person_id()) OR
 (platform.context_role()='ADM-FACILITY' AND platform.context_aal()>=2 AND 'facility_approval'=ANY(platform.context_purposes()))
);
CREATE POLICY facilities_insert ON identity.facilities FOR INSERT TO shifaa_api WITH CHECK(created_by_person_id=platform.context_person_id() AND facility_status='draft');
CREATE POLICY facilities_update ON identity.facilities FOR UPDATE TO shifaa_api USING(created_by_person_id=platform.context_person_id() OR (platform.context_role()='ADM-FACILITY' AND platform.context_aal()>=2 AND 'facility_approval'=ANY(platform.context_purposes()))) WITH CHECK(created_by_person_id=platform.context_person_id() OR (platform.context_role()='ADM-FACILITY' AND platform.context_aal()>=2 AND 'facility_approval'=ANY(platform.context_purposes())));
CREATE POLICY evidence_owner_select ON identity.private_evidence_objects FOR SELECT TO shifaa_api USING(owner_person_id=platform.context_person_id() OR (scan_status='released' AND platform.context_role()='ADM-FACILITY' AND platform.context_aal()>=2 AND ((bucket_code='facility-license-evidence' AND 'facility_approval'=ANY(platform.context_purposes())) OR (bucket_code='professional-license-evidence' AND 'professional_license_review'=ANY(platform.context_purposes())))));
CREATE POLICY evidence_owner_insert ON identity.private_evidence_objects FOR INSERT TO shifaa_api WITH CHECK(owner_person_id=platform.context_person_id() AND scan_status='quarantined');
CREATE POLICY facility_license_owner_review ON identity.facility_licenses TO shifaa_api USING(platform.person_owns_facility(facility_id,platform.context_person_id()) OR (platform.context_role()='ADM-FACILITY' AND platform.context_aal()>=2 AND 'facility_approval'=ANY(platform.context_purposes()))) WITH CHECK((platform.person_owns_facility(facility_id,platform.context_person_id()) AND status='pending') OR (platform.context_role()='ADM-FACILITY' AND platform.context_aal()>=2 AND 'facility_approval'=ANY(platform.context_purposes())));
CREATE POLICY professional_license_subject_review ON identity.professional_licenses TO shifaa_api USING(person_id=platform.context_person_id() OR (platform.context_role()='ADM-FACILITY' AND platform.context_aal()>=2 AND 'professional_license_review'=ANY(platform.context_purposes()))) WITH CHECK((person_id=platform.context_person_id() AND status='pending') OR (platform.context_role()='ADM-FACILITY' AND platform.context_aal()>=2 AND 'professional_license_review'=ANY(platform.context_purposes())));
CREATE POLICY membership_owner_subject ON identity.facility_memberships TO shifaa_api USING(person_id=platform.context_person_id() OR platform.person_owns_facility(facility_id,platform.context_person_id())) WITH CHECK(platform.person_owns_facility(facility_id,platform.context_person_id()) OR (person_id=platform.context_person_id() AND membership_status='active'));
CREATE POLICY role_permissions_super_read ON identity.role_permissions FOR SELECT TO shifaa_api USING(platform.context_role()='ADM-SUPER');
CREATE POLICY admin_grants_super ON identity.admin_role_grants TO shifaa_api USING(platform.context_role()='ADM-SUPER' AND platform.context_aal()>=2 AND 'role_governance'=ANY(platform.context_purposes())) WITH CHECK(platform.context_role()='ADM-SUPER' AND platform.context_aal()>=2 AND 'role_governance'=ANY(platform.context_purposes()));
CREATE POLICY admin_revocations_super ON identity.admin_role_revocation_requests TO shifaa_api USING(platform.context_role()='ADM-SUPER' AND platform.context_aal()>=2 AND 'role_governance'=ANY(platform.context_purposes())) WITH CHECK(platform.context_role()='ADM-SUPER' AND platform.context_aal()>=2 AND 'role_governance'=ANY(platform.context_purposes()));

DO $$ BEGIN
 IF to_regclass('storage.buckets') IS NOT NULL THEN
  EXECUTE $sql$INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES ('facility-license-evidence','facility-license-evidence',false,10485760,ARRAY['image/jpeg','image/png','application/pdf']),('professional-license-evidence','professional-license-evidence',false,10485760,ARRAY['image/jpeg','image/png','application/pdf']) ON CONFLICT(id) DO UPDATE SET public=false$sql$;
 END IF;
END $$;
COMMIT;
