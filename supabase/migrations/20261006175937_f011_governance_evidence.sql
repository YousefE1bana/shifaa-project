-- Feature 011 K05: typed governance inputs, artifact-scoped approval snapshots,
-- and reciprocal clinical signature evidence. No online provisioning API is
-- created here; all newly added relations are offline-administered and denied
-- by default under forced RLS.

CREATE TABLE clinical.content_governance_authorities (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES identity.people(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('signClinicalContentRelease', 'listClinicalContent')),
  capacity text CHECK (capacity IS NULL OR capacity IN ('physician', 'pharmacist')),
  content_type text NOT NULL CHECK (pg_catalog.length(content_type) > 0),
  governed_content_key text NOT NULL CHECK (pg_catalog.length(governed_content_key) > 0),
  effective_scope_key text NOT NULL CHECK (pg_catalog.length(effective_scope_key) > 0),
  facility_id uuid REFERENCES identity.facilities(id) ON DELETE RESTRICT,
  issued_by uuid NOT NULL REFERENCES identity.people(id) ON DELETE RESTRICT,
  evidence_ref uuid NOT NULL,
  evidence_producer_id text NOT NULL CHECK (evidence_producer_id = 'f011.governance_provisioner'),
  evidence_verified_at timestamptz NOT NULL,
  source_identity text NOT NULL CHECK (pg_catalog.length(source_identity) > 0),
  source_evidence_identity text NOT NULL CHECK (pg_catalog.length(source_evidence_identity) > 0),
  source_evidence_version text,
  source_evidence_sha256 bytea CHECK (source_evidence_sha256 IS NULL OR pg_catalog.octet_length(source_evidence_sha256) = 32),
  status text NOT NULL CHECK (status IN ('active', 'revoked')),
  valid_from timestamptz NOT NULL,
  valid_until timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CHECK ((action = 'signClinicalContentRelease' AND capacity IN ('physician', 'pharmacist'))
      OR (action = 'listClinicalContent' AND capacity IS NULL)),
  CHECK (valid_until IS NULL OR valid_until > valid_from),
  CHECK (source_evidence_version IS NULL OR pg_catalog.length(source_evidence_version) > 0),
  CHECK (source_evidence_sha256 IS NULL OR source_evidence_version IS NOT NULL)
);
CREATE UNIQUE INDEX content_governance_authorities_active_scope_uq
  ON clinical.content_governance_authorities
    (person_id, action, content_type, governed_content_key, effective_scope_key,
     COALESCE(facility_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(capacity, ''))
  WHERE status = 'active';
CREATE INDEX content_governance_authorities_person_status_idx
  ON clinical.content_governance_authorities(person_id, status, valid_from, valid_until, id);

CREATE TABLE clinical.content_reviewer_designations (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES identity.people(id) ON DELETE RESTRICT,
  professional_license_id uuid NOT NULL REFERENCES identity.professional_licenses(id) ON DELETE RESTRICT,
  reviewer_capacity text NOT NULL CHECK (reviewer_capacity IN ('physician', 'pharmacist')),
  evidence_ref uuid NOT NULL,
  designated_by uuid NOT NULL REFERENCES identity.people(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('active', 'revoked')),
  valid_from timestamptz NOT NULL,
  valid_until timestamptz,
  source_identity text NOT NULL CHECK (pg_catalog.length(source_identity) > 0),
  source_evidence_identity text NOT NULL CHECK (pg_catalog.length(source_evidence_identity) > 0),
  source_evidence_version text,
  source_evidence_sha256 bytea CHECK (source_evidence_sha256 IS NULL OR pg_catalog.octet_length(source_evidence_sha256) = 32),
  evidence_producer_id text NOT NULL CHECK (evidence_producer_id = 'f011.governance_provisioner'),
  evidence_verified_at timestamptz NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CHECK (valid_until IS NULL OR valid_until > valid_from),
  CHECK (source_evidence_version IS NULL OR pg_catalog.length(source_evidence_version) > 0),
  CHECK (source_evidence_sha256 IS NULL OR source_evidence_version IS NOT NULL)
);
CREATE UNIQUE INDEX content_reviewer_designations_active_uq
  ON clinical.content_reviewer_designations(person_id, professional_license_id, reviewer_capacity)
  WHERE status = 'active';
CREATE INDEX content_reviewer_designations_license_idx
  ON clinical.content_reviewer_designations(professional_license_id, status, valid_from, valid_until, id);

CREATE TABLE clinical.content_admissibility_evidence (
  id uuid PRIMARY KEY,
  release_id uuid NOT NULL,
  artifact_version integer NOT NULL CHECK (artifact_version > 0),
  artifact_digest bytea NOT NULL CHECK (pg_catalog.octet_length(artifact_digest) = 32),
  content_type text NOT NULL CHECK (pg_catalog.length(content_type) > 0),
  governed_content_key text NOT NULL CHECK (pg_catalog.length(governed_content_key) > 0),
  effective_scope_key text NOT NULL CHECK (pg_catalog.length(effective_scope_key) > 0),
  policy_ref uuid NOT NULL,
  policy_version text NOT NULL CHECK (pg_catalog.length(policy_version) > 0),
  policy_sha256 bytea NOT NULL CHECK (pg_catalog.octet_length(policy_sha256) = 32),
  source_admission_ref uuid NOT NULL,
  category_admission_ref uuid NOT NULL,
  code_admission_ref uuid NOT NULL,
  test_vector_admission_ref uuid NOT NULL,
  source_identity text NOT NULL CHECK (pg_catalog.length(source_identity) > 0),
  source_evidence_identity text NOT NULL CHECK (pg_catalog.length(source_evidence_identity) > 0),
  source_evidence_version text CHECK (source_evidence_version IS NULL OR pg_catalog.length(source_evidence_version) > 0),
  source_evidence_sha256 bytea CHECK (source_evidence_sha256 IS NULL OR pg_catalog.octet_length(source_evidence_sha256) = 32),
  synthetic boolean NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'revoked')),
  valid_from timestamptz NOT NULL,
  valid_until timestamptz,
  version integer NOT NULL CHECK (version > 0),
  UNIQUE (id, release_id, artifact_version, artifact_digest),
  UNIQUE (source_identity, source_evidence_identity),
  CHECK (valid_until IS NULL OR valid_until > valid_from),
  CHECK (source_evidence_sha256 IS NULL OR source_evidence_version IS NOT NULL),
  FOREIGN KEY (release_id, artifact_version, artifact_digest)
    REFERENCES clinical.content_releases(id, artifact_version, artifact_digest) ON DELETE RESTRICT
);

CREATE TABLE clinical.content_artifact_admissibility_bindings (
  binding_id uuid PRIMARY KEY,
  binding_contract_id text NOT NULL CHECK
    (binding_contract_id = 'SHIFAA-F011-VERIFIED-EVIDENCE-BINDING/1'),
  release_id uuid NOT NULL,
  artifact_version integer NOT NULL CHECK (artifact_version > 0),
  artifact_digest bytea NOT NULL CHECK (pg_catalog.octet_length(artifact_digest) = 32),
  approval_id uuid NOT NULL,
  approval_version integer NOT NULL CHECK (approval_version > 0),
  content_type text NOT NULL CHECK (pg_catalog.length(content_type) > 0),
  governed_content_key text NOT NULL CHECK (pg_catalog.length(governed_content_key) > 0),
  effective_scope_key text NOT NULL CHECK (pg_catalog.length(effective_scope_key) > 0),
  policy_ref uuid NOT NULL,
  policy_version text NOT NULL CHECK (pg_catalog.length(policy_version) > 0),
  policy_sha256 bytea NOT NULL CHECK (pg_catalog.octet_length(policy_sha256) = 32),
  source_admission_ref uuid NOT NULL,
  category_admission_ref uuid NOT NULL,
  code_admission_ref uuid NOT NULL,
  test_vector_admission_ref uuid NOT NULL,
  source_identity text NOT NULL CHECK (pg_catalog.length(source_identity) > 0),
  source_evidence_identity text NOT NULL CHECK (pg_catalog.length(source_evidence_identity) > 0),
  source_evidence_version text CHECK (source_evidence_version IS NULL OR pg_catalog.length(source_evidence_version) > 0),
  source_evidence_sha256 bytea CHECK (source_evidence_sha256 IS NULL OR pg_catalog.octet_length(source_evidence_sha256) = 32),
  producer_id text NOT NULL CHECK (producer_id = 'f011.governance_provisioner'),
  verified_at timestamptz NOT NULL,
  synthetic boolean NOT NULL,
  approval_status text NOT NULL CHECK (approval_status IN ('active', 'revoked')),
  approval_valid_from timestamptz NOT NULL,
  approval_valid_until timestamptz,
  UNIQUE (release_id, artifact_version, artifact_digest, approval_id, approval_version),
  UNIQUE (source_identity, source_evidence_identity),
  CHECK (approval_valid_until IS NULL OR approval_valid_until > approval_valid_from),
  CHECK (source_evidence_sha256 IS NULL OR source_evidence_version IS NOT NULL),
  FOREIGN KEY (release_id, artifact_version, artifact_digest)
    REFERENCES clinical.content_releases(id, artifact_version, artifact_digest) ON DELETE RESTRICT,
  FOREIGN KEY (approval_id, release_id, artifact_version, artifact_digest)
    REFERENCES clinical.content_admissibility_evidence(id, release_id, artifact_version, artifact_digest)
    ON DELETE RESTRICT
);

CREATE TABLE clinical.content_signature_bindings (
  signature_evidence_id uuid PRIMARY KEY REFERENCES audit.signature_evidence(id) ON DELETE RESTRICT,
  binding_id uuid NOT NULL UNIQUE,
  binding_contract_id text NOT NULL CHECK
    (binding_contract_id = 'SHIFAA-F011-VERIFIED-EVIDENCE-BINDING/1'),
  evidence_ref uuid NOT NULL UNIQUE,
  producer_id text NOT NULL CHECK (producer_id = 'f011.signing_port'),
  verified_at timestamptz NOT NULL,
  source_identity text NOT NULL CHECK (pg_catalog.length(source_identity) > 0),
  source_evidence_identity text NOT NULL CHECK (pg_catalog.length(source_evidence_identity) > 0),
  source_evidence_version text CHECK (source_evidence_version IS NULL OR pg_catalog.length(source_evidence_version) > 0),
  source_evidence_sha256 bytea CHECK (source_evidence_sha256 IS NULL OR pg_catalog.octet_length(source_evidence_sha256) = 32),
  credential_id uuid NOT NULL REFERENCES identity.professional_licenses(id) ON DELETE RESTRICT,
  credential_version integer NOT NULL CHECK (credential_version > 0),
  credential_profession text NOT NULL CHECK (credential_profession IN ('doctor', 'pharmacist')),
  credential_status text NOT NULL CHECK (credential_status = 'verified'),
  credential_expires_on date NOT NULL,
  credential_issuer text NOT NULL CHECK (pg_catalog.length(credential_issuer) > 0),
  credential_evidence_object_id uuid REFERENCES identity.private_evidence_objects(id) ON DELETE RESTRICT,
  credential_reviewed_by uuid REFERENCES identity.people(id) ON DELETE RESTRICT,
  credential_reviewed_at timestamptz,
  designation_id uuid NOT NULL REFERENCES clinical.content_reviewer_designations(id) ON DELETE RESTRICT,
  designation_version integer NOT NULL CHECK (designation_version > 0),
  designation_evidence_ref uuid NOT NULL,
  designation_by uuid NOT NULL REFERENCES identity.people(id) ON DELETE RESTRICT,
  designation_status text NOT NULL CHECK (designation_status = 'active'),
  designation_valid_from timestamptz NOT NULL,
  designation_valid_until timestamptz,
  designation_source_identity text NOT NULL CHECK (pg_catalog.length(designation_source_identity) > 0),
  designation_source_evidence_identity text NOT NULL CHECK (pg_catalog.length(designation_source_evidence_identity) > 0),
  designation_source_evidence_version text CHECK (designation_source_evidence_version IS NULL OR pg_catalog.length(designation_source_evidence_version) > 0),
  designation_source_evidence_sha256 bytea CHECK (designation_source_evidence_sha256 IS NULL OR pg_catalog.octet_length(designation_source_evidence_sha256) = 32),
  designation_evidence_producer_id text NOT NULL CHECK (designation_evidence_producer_id = 'f011.governance_provisioner'),
  designation_evidence_verified_at timestamptz NOT NULL,
  signing_authority_id uuid NOT NULL REFERENCES clinical.content_governance_authorities(id) ON DELETE RESTRICT,
  signing_authority_version integer NOT NULL CHECK (signing_authority_version > 0),
  authority_action text NOT NULL CHECK (authority_action = 'signClinicalContentRelease'),
  authority_content_type text NOT NULL CHECK (pg_catalog.length(authority_content_type) > 0),
  authority_governed_content_key text NOT NULL CHECK (pg_catalog.length(authority_governed_content_key) > 0),
  authority_effective_scope_key text NOT NULL CHECK (pg_catalog.length(authority_effective_scope_key) > 0),
  authority_facility_id uuid REFERENCES identity.facilities(id) ON DELETE RESTRICT,
  authority_issued_by uuid NOT NULL REFERENCES identity.people(id) ON DELETE RESTRICT,
  authority_evidence_ref uuid NOT NULL,
  authority_status text NOT NULL CHECK (authority_status = 'active'),
  authority_valid_from timestamptz NOT NULL,
  authority_valid_until timestamptz,
  authority_source_identity text NOT NULL CHECK (pg_catalog.length(authority_source_identity) > 0),
  authority_source_evidence_identity text NOT NULL CHECK (pg_catalog.length(authority_source_evidence_identity) > 0),
  authority_source_evidence_version text CHECK (authority_source_evidence_version IS NULL OR pg_catalog.length(authority_source_evidence_version) > 0),
  authority_source_evidence_sha256 bytea CHECK (authority_source_evidence_sha256 IS NULL OR pg_catalog.octet_length(authority_source_evidence_sha256) = 32),
  authority_evidence_producer_id text NOT NULL CHECK (authority_evidence_producer_id = 'f011.governance_provisioner'),
  authority_evidence_verified_at timestamptz NOT NULL,
  UNIQUE (source_identity, source_evidence_identity),
  CHECK ((credential_reviewed_by IS NULL) = (credential_reviewed_at IS NULL)),
  CHECK (designation_valid_until IS NULL OR designation_valid_until > designation_valid_from),
  CHECK (authority_valid_until IS NULL OR authority_valid_until > authority_valid_from),
  CHECK (source_evidence_sha256 IS NULL OR source_evidence_version IS NOT NULL),
  CHECK (designation_source_evidence_sha256 IS NULL OR designation_source_evidence_version IS NOT NULL),
  CHECK (authority_source_evidence_sha256 IS NULL OR authority_source_evidence_version IS NOT NULL)
);

ALTER TABLE audit.signature_evidence
  DROP CONSTRAINT signature_evidence_signer_role_check;
ALTER TABLE audit.signature_evidence
  ADD CONSTRAINT signature_evidence_signer_role_check CHECK (
    signer_role IN ('super_admin', 'support_admin', 'medical_reviewer', 'facility_approver', 'finance_reviewer')
    OR (resource_type = 'clinical.content_release' AND signer_role IN ('physician', 'pharmacist'))
  );

CREATE FUNCTION clinical.f011_guard_governance_version_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, clinical
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'governance evidence rows cannot be deleted';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.version <> OLD.version + 1 OR NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'governance evidence changes require an attributable version advance';
  END IF;
  RETURN NEW;
END
$function$;

CREATE FUNCTION clinical.f011_guard_admissibility_update_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, clinical
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'admissibility evidence cannot be deleted';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.release_id IS DISTINCT FROM OLD.release_id
     OR NEW.artifact_version IS DISTINCT FROM OLD.artifact_version
     OR NEW.artifact_digest IS DISTINCT FROM OLD.artifact_digest
     OR NEW.content_type IS DISTINCT FROM OLD.content_type
     OR NEW.governed_content_key IS DISTINCT FROM OLD.governed_content_key
     OR NEW.effective_scope_key IS DISTINCT FROM OLD.effective_scope_key
     OR NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'admissibility evidence target is immutable and changes require a version advance';
  END IF;
  RETURN NEW;
END
$function$;

CREATE FUNCTION clinical.f011_guard_admissibility_insert_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, clinical
AS $function$
DECLARE release_row clinical.content_releases%ROWTYPE;
  series_row clinical.content_series%ROWTYPE;
  series_identity uuid;
BEGIN
  SELECT r.series_id INTO series_identity FROM clinical.content_releases r
  WHERE r.id = NEW.release_id AND r.artifact_version = NEW.artifact_version
    AND r.artifact_digest = NEW.artifact_digest;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'admissibility approval must target an exact stored artifact';
  END IF;
  SELECT * INTO series_row FROM clinical.content_series s WHERE s.id = series_identity FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'admissibility scope lineage is missing';
  END IF;
  SELECT * INTO release_row FROM clinical.content_releases r
  WHERE r.id = NEW.release_id AND r.series_id = series_identity
    AND r.artifact_version = NEW.artifact_version AND r.artifact_digest = NEW.artifact_digest
  FOR SHARE;
  IF NOT FOUND OR NEW.content_type IS DISTINCT FROM series_row.content_type
     OR NEW.governed_content_key IS DISTINCT FROM series_row.governed_content_key
     OR NEW.effective_scope_key IS DISTINCT FROM series_row.effective_scope_key THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'admissibility approval scope must match the exact artifact series';
  END IF;
  RETURN NEW;
END
$function$;

CREATE FUNCTION clinical.f011_guard_content_admissibility_binding_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, clinical
AS $function$
DECLARE approval clinical.content_admissibility_evidence%ROWTYPE;
  release_row clinical.content_releases%ROWTYPE;
  series_row clinical.content_series%ROWTYPE;
  series_identity uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'artifact admissibility bindings are immutable';
  END IF;
  SELECT r.series_id INTO series_identity FROM clinical.content_releases r
  WHERE r.id = NEW.release_id AND r.artifact_version = NEW.artifact_version
    AND r.artifact_digest = NEW.artifact_digest;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'artifact admission binding must target an exact stored artifact';
  END IF;
  SELECT * INTO series_row FROM clinical.content_series s WHERE s.id = series_identity FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'artifact admission scope lineage is missing';
  END IF;
  SELECT * INTO release_row FROM clinical.content_releases r
  WHERE r.id = NEW.release_id AND r.series_id = series_identity
    AND r.artifact_version = NEW.artifact_version AND r.artifact_digest = NEW.artifact_digest
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'artifact admission release disappeared';
  END IF;
  SELECT * INTO approval FROM clinical.content_admissibility_evidence a
  WHERE a.id = NEW.approval_id AND a.release_id = NEW.release_id
    AND a.artifact_version = NEW.artifact_version AND a.artifact_digest = NEW.artifact_digest
  FOR SHARE;
  IF NOT FOUND OR NEW.approval_version <> approval.version
     OR NEW.content_type IS DISTINCT FROM approval.content_type
     OR NEW.governed_content_key IS DISTINCT FROM approval.governed_content_key
     OR NEW.effective_scope_key IS DISTINCT FROM approval.effective_scope_key
     OR NEW.policy_ref IS DISTINCT FROM approval.policy_ref
     OR NEW.policy_version IS DISTINCT FROM approval.policy_version
     OR NEW.policy_sha256 IS DISTINCT FROM approval.policy_sha256
     OR NEW.source_admission_ref IS DISTINCT FROM approval.source_admission_ref
     OR NEW.category_admission_ref IS DISTINCT FROM approval.category_admission_ref
     OR NEW.code_admission_ref IS DISTINCT FROM approval.code_admission_ref
     OR NEW.test_vector_admission_ref IS DISTINCT FROM approval.test_vector_admission_ref
     OR NEW.source_identity IS DISTINCT FROM approval.source_identity
     OR NEW.source_evidence_identity IS DISTINCT FROM approval.source_evidence_identity
     OR NEW.source_evidence_version IS DISTINCT FROM approval.source_evidence_version
     OR NEW.source_evidence_sha256 IS DISTINCT FROM approval.source_evidence_sha256
     OR NEW.synthetic IS DISTINCT FROM approval.synthetic
     OR NEW.approval_status IS DISTINCT FROM approval.status
     OR NEW.approval_valid_from IS DISTINCT FROM approval.valid_from
     OR NEW.approval_valid_until IS DISTINCT FROM approval.valid_until THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'artifact admission snapshot does not match exact approval';
  END IF;
  IF NEW.content_type IS DISTINCT FROM series_row.content_type
     OR NEW.governed_content_key IS DISTINCT FROM series_row.governed_content_key
     OR NEW.effective_scope_key IS DISTINCT FROM series_row.effective_scope_key THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'artifact admission binding scope must match the exact artifact series';
  END IF;
  RETURN NEW;
END
$function$;

CREATE FUNCTION clinical.f011_guard_content_signature_binding_insert_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, clinical, audit, identity
AS $function$
DECLARE signature_row audit.signature_evidence%ROWTYPE;
  release_row clinical.content_releases%ROWTYPE;
  series_row clinical.content_series%ROWTYPE;
  credential_row identity.professional_licenses%ROWTYPE;
  authority_row clinical.content_governance_authorities%ROWTYPE;
  designation_row clinical.content_reviewer_designations%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'clinical signature basis is immutable';
  END IF;
  SELECT * INTO signature_row FROM audit.signature_evidence s
  WHERE s.id = NEW.signature_evidence_id;
  IF NOT FOUND OR signature_row.resource_type <> 'clinical.content_release'
     OR signature_row.signer_role NOT IN ('physician', 'pharmacist') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'typed clinical signature basis requires a clinical release decision';
  END IF;
  SELECT * INTO release_row FROM clinical.content_releases r WHERE r.id = signature_row.resource_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'clinical signature must target a stored release';
  END IF;
  SELECT * INTO series_row FROM clinical.content_series s WHERE s.id = release_row.series_id;
  IF NOT FOUND OR signature_row.resource_version IS DISTINCT FROM release_row.artifact_version
     OR signature_row.artifact_digest IS DISTINCT FROM release_row.artifact_digest THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'clinical signature artifact tuple does not match the stored release';
  END IF;

  SELECT * INTO credential_row FROM identity.professional_licenses l
  WHERE l.id = NEW.credential_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'signature credential is missing';
  END IF;
  SELECT * INTO authority_row FROM clinical.content_governance_authorities a
  WHERE a.id = NEW.signing_authority_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'signature authority is missing';
  END IF;
  SELECT * INTO designation_row FROM clinical.content_reviewer_designations d
  WHERE d.id = NEW.designation_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'reviewer designation is missing';
  END IF;

  IF credential_row.person_id IS DISTINCT FROM signature_row.signer_person_id
     OR credential_row.profession IS DISTINCT FROM (CASE signature_row.signer_role
       WHEN 'physician' THEN 'doctor' ELSE 'pharmacist' END)
     OR NEW.credential_version IS DISTINCT FROM credential_row.version
     OR NEW.credential_profession IS DISTINCT FROM credential_row.profession
     OR NEW.credential_status IS DISTINCT FROM credential_row.status
     OR NEW.credential_expires_on IS DISTINCT FROM credential_row.expires_on
     OR NEW.credential_issuer IS DISTINCT FROM credential_row.issuer
     OR NEW.credential_evidence_object_id IS DISTINCT FROM credential_row.evidence_object_id
     OR NEW.credential_reviewed_by IS DISTINCT FROM credential_row.reviewed_by_person_id
     OR NEW.credential_reviewed_at IS DISTINCT FROM credential_row.reviewed_at
     OR designation_row.person_id IS DISTINCT FROM signature_row.signer_person_id
     OR designation_row.professional_license_id IS DISTINCT FROM credential_row.id
     OR designation_row.reviewer_capacity IS DISTINCT FROM signature_row.signer_role
     OR NEW.designation_version IS DISTINCT FROM designation_row.version
     OR NEW.designation_evidence_ref IS DISTINCT FROM designation_row.evidence_ref
     OR NEW.designation_by IS DISTINCT FROM designation_row.designated_by
     OR NEW.designation_status IS DISTINCT FROM designation_row.status
     OR NEW.designation_valid_from IS DISTINCT FROM designation_row.valid_from
     OR NEW.designation_valid_until IS DISTINCT FROM designation_row.valid_until
     OR NEW.designation_source_identity IS DISTINCT FROM designation_row.source_identity
     OR NEW.designation_source_evidence_identity IS DISTINCT FROM designation_row.source_evidence_identity
     OR NEW.designation_source_evidence_version IS DISTINCT FROM designation_row.source_evidence_version
     OR NEW.designation_source_evidence_sha256 IS DISTINCT FROM designation_row.source_evidence_sha256
     OR NEW.designation_evidence_producer_id IS DISTINCT FROM designation_row.evidence_producer_id
     OR NEW.designation_evidence_verified_at IS DISTINCT FROM designation_row.evidence_verified_at
     OR authority_row.person_id IS DISTINCT FROM signature_row.signer_person_id
     OR authority_row.action <> 'signClinicalContentRelease'
     OR authority_row.capacity IS DISTINCT FROM signature_row.signer_role
     OR authority_row.content_type IS DISTINCT FROM series_row.content_type
     OR authority_row.governed_content_key IS DISTINCT FROM series_row.governed_content_key
     OR authority_row.effective_scope_key IS DISTINCT FROM series_row.effective_scope_key
     OR NEW.signing_authority_version IS DISTINCT FROM authority_row.version
     OR NEW.authority_action IS DISTINCT FROM authority_row.action
     OR NEW.authority_content_type IS DISTINCT FROM authority_row.content_type
     OR NEW.authority_governed_content_key IS DISTINCT FROM authority_row.governed_content_key
     OR NEW.authority_effective_scope_key IS DISTINCT FROM authority_row.effective_scope_key
     OR NEW.authority_facility_id IS DISTINCT FROM authority_row.facility_id
     OR NEW.authority_issued_by IS DISTINCT FROM authority_row.issued_by
     OR NEW.authority_evidence_ref IS DISTINCT FROM authority_row.evidence_ref
     OR NEW.authority_status IS DISTINCT FROM authority_row.status
     OR NEW.authority_valid_from IS DISTINCT FROM authority_row.valid_from
     OR NEW.authority_valid_until IS DISTINCT FROM authority_row.valid_until
     OR NEW.authority_source_identity IS DISTINCT FROM authority_row.source_identity
     OR NEW.authority_source_evidence_identity IS DISTINCT FROM authority_row.source_evidence_identity
     OR NEW.authority_source_evidence_version IS DISTINCT FROM authority_row.source_evidence_version
     OR NEW.authority_source_evidence_sha256 IS DISTINCT FROM authority_row.source_evidence_sha256
     OR NEW.authority_evidence_producer_id IS DISTINCT FROM authority_row.evidence_producer_id
     OR NEW.authority_evidence_verified_at IS DISTINCT FROM authority_row.evidence_verified_at THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'signature basis differs from its exact locked credential, designation, or authority row';
  END IF;
  RETURN NEW;
END
$function$;

CREATE FUNCTION clinical.f011_guard_content_signature_bindings_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, clinical, audit
AS $function$
DECLARE bad boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM audit.signature_evidence s
    LEFT JOIN clinical.content_signature_bindings b ON b.signature_evidence_id = s.id
    LEFT JOIN clinical.content_releases r ON r.id = s.resource_id
    WHERE s.resource_type = 'clinical.content_release'
      AND (b.signature_evidence_id IS NULL OR r.id IS NULL
        OR s.signer_role NOT IN ('physician', 'pharmacist')
        OR s.resource_version IS DISTINCT FROM r.artifact_version
        OR s.artifact_digest IS DISTINCT FROM r.artifact_digest)
  ) OR EXISTS (
    SELECT 1
    FROM clinical.content_signature_bindings b
    LEFT JOIN audit.signature_evidence s ON s.id = b.signature_evidence_id
    LEFT JOIN clinical.content_releases r ON r.id = s.resource_id
    WHERE s.id IS NULL OR s.resource_type <> 'clinical.content_release'
       OR r.id IS NULL OR s.signer_role NOT IN ('physician', 'pharmacist')
       OR s.resource_version IS DISTINCT FROM r.artifact_version
       OR s.artifact_digest IS DISTINCT FROM r.artifact_digest
  ) INTO bad;
  IF bad THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'clinical signature evidence and typed basis are incomplete or mismatched';
  END IF;
  RETURN NULL;
END
$function$;

CREATE TRIGGER content_governance_authorities_version_guard
BEFORE UPDATE OR DELETE ON clinical.content_governance_authorities
FOR EACH ROW EXECUTE FUNCTION clinical.f011_guard_governance_version_v1();
CREATE TRIGGER content_reviewer_designations_version_guard
BEFORE UPDATE OR DELETE ON clinical.content_reviewer_designations
FOR EACH ROW EXECUTE FUNCTION clinical.f011_guard_governance_version_v1();
CREATE TRIGGER content_admissibility_evidence_version_guard
BEFORE UPDATE OR DELETE ON clinical.content_admissibility_evidence
FOR EACH ROW EXECUTE FUNCTION clinical.f011_guard_admissibility_update_v1();
CREATE TRIGGER content_admissibility_evidence_scope_guard
BEFORE INSERT ON clinical.content_admissibility_evidence
FOR EACH ROW EXECUTE FUNCTION clinical.f011_guard_admissibility_insert_v1();
CREATE TRIGGER content_artifact_admissibility_binding_guard
BEFORE INSERT OR UPDATE OR DELETE ON clinical.content_artifact_admissibility_bindings
FOR EACH ROW EXECUTE FUNCTION clinical.f011_guard_content_admissibility_binding_v1();
CREATE TRIGGER content_signature_binding_snapshot_guard
BEFORE INSERT OR UPDATE OR DELETE ON clinical.content_signature_bindings
FOR EACH ROW EXECUTE FUNCTION clinical.f011_guard_content_signature_binding_insert_v1();
CREATE TRIGGER content_signature_bindings_immutable_guard
BEFORE UPDATE OR DELETE ON clinical.content_signature_bindings
FOR EACH ROW EXECUTE FUNCTION clinical.f011_reject_immutable_v1();

CREATE CONSTRAINT TRIGGER content_signatures_sidecar_deferred
AFTER INSERT OR UPDATE OR DELETE ON clinical.content_signature_bindings
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION clinical.f011_guard_content_signature_bindings_v1();
CREATE CONSTRAINT TRIGGER content_signatures_audit_deferred
AFTER INSERT OR UPDATE OR DELETE ON audit.signature_evidence
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION clinical.f011_guard_content_signature_bindings_v1();

ALTER TABLE clinical.content_governance_authorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical.content_governance_authorities FORCE ROW LEVEL SECURITY;
ALTER TABLE clinical.content_reviewer_designations ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical.content_reviewer_designations FORCE ROW LEVEL SECURITY;
ALTER TABLE clinical.content_admissibility_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical.content_admissibility_evidence FORCE ROW LEVEL SECURITY;
ALTER TABLE clinical.content_artifact_admissibility_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical.content_artifact_admissibility_bindings FORCE ROW LEVEL SECURITY;
ALTER TABLE clinical.content_signature_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical.content_signature_bindings FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE clinical.content_governance_authorities,
  clinical.content_reviewer_designations, clinical.content_admissibility_evidence,
  clinical.content_artifact_admissibility_bindings, clinical.content_signature_bindings FROM PUBLIC;
REVOKE ALL ON FUNCTION clinical.f011_guard_governance_version_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION clinical.f011_guard_admissibility_update_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION clinical.f011_guard_admissibility_insert_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION clinical.f011_guard_content_admissibility_binding_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION clinical.f011_guard_content_signature_binding_insert_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION clinical.f011_guard_content_signature_bindings_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION clinical.f011_reject_immutable_v1() FROM PUBLIC;

DO $revoke_roles$
DECLARE grantee name;
BEGIN
  FOREACH grantee IN ARRAY ARRAY['shifaa_api', 'shifaa_worker', 'anon', 'authenticated', 'service_role']::name[] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = grantee) THEN
      EXECUTE pg_catalog.format('REVOKE ALL ON TABLE clinical.content_governance_authorities, clinical.content_reviewer_designations, clinical.content_admissibility_evidence, clinical.content_artifact_admissibility_bindings, clinical.content_signature_bindings FROM %I', grantee);
      EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION clinical.f011_guard_governance_version_v1() FROM %I', grantee);
      EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION clinical.f011_guard_admissibility_update_v1() FROM %I', grantee);
      EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION clinical.f011_guard_admissibility_insert_v1() FROM %I', grantee);
      EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION clinical.f011_guard_content_admissibility_binding_v1() FROM %I', grantee);
      EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION clinical.f011_guard_content_signature_binding_insert_v1() FROM %I', grantee);
      EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION clinical.f011_guard_content_signature_bindings_v1() FROM %I', grantee);
      EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION clinical.f011_reject_immutable_v1() FROM %I', grantee);
    END IF;
  END LOOP;
END
$revoke_roles$;
