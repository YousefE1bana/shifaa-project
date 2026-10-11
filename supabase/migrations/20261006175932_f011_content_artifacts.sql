-- Feature 011 K05: protected content artifacts and exact verified-material
-- bindings. Draft versions are lineage-relative, not globally allocated.

CREATE TABLE clinical.content_series (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  content_type text NOT NULL CHECK (pg_catalog.length(content_type) > 0),
  governed_content_key text NOT NULL CHECK (pg_catalog.length(governed_content_key) > 0),
  effective_scope_key text NOT NULL CHECK (pg_catalog.length(effective_scope_key) > 0),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  UNIQUE (content_type, governed_content_key, effective_scope_key)
);

CREATE TABLE clinical.content_releases (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  series_id uuid NOT NULL REFERENCES clinical.content_series(id) ON DELETE RESTRICT,
  artifact_version integer NOT NULL CHECK (artifact_version > 0),
  workflow_version integer NOT NULL CHECK (workflow_version > 0),
  source_display text NOT NULL CHECK (pg_catalog.length(source_display) > 0),
  source_reference text CHECK (source_reference IS NULL OR pg_catalog.length(source_reference) > 0),
  effective_at timestamptz NOT NULL,
  artifact_digest bytea NOT NULL CHECK (pg_catalog.octet_length(artifact_digest) = 32),
  body_contract_id text NOT NULL,
  body_key_ref text NOT NULL CHECK (pg_catalog.length(body_key_ref) > 0),
  body_nonce bytea NOT NULL CHECK (pg_catalog.octet_length(body_nonce) = 12),
  body_ciphertext bytea NOT NULL CHECK (pg_catalog.octet_length(body_ciphertext) > 0),
  body_auth_tag bytea NOT NULL CHECK (pg_catalog.octet_length(body_auth_tag) = 16),
  content_evidence_ref uuid NOT NULL,
  code_evidence_ref uuid NOT NULL,
  test_vector_evidence_ref uuid NOT NULL,
  content_sha256 bytea NOT NULL CHECK (pg_catalog.octet_length(content_sha256) = 32),
  code_sha256 bytea NOT NULL CHECK (pg_catalog.octet_length(code_sha256) = 32),
  test_vector_sha256 bytea NOT NULL CHECK (pg_catalog.octet_length(test_vector_sha256) = 32),
  is_initial boolean NOT NULL,
  supersedes_release_id uuid,
  status text NOT NULL CHECK (status IN ('draft', 'published')),
  created_by_person_id uuid NOT NULL REFERENCES identity.people(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  published_by_person_id uuid REFERENCES identity.people(id) ON DELETE RESTRICT,
  published_at timestamptz,
  synthetic boolean NOT NULL,
  UNIQUE (id, series_id),
  UNIQUE (id, artifact_version),
  UNIQUE (id, series_id, artifact_version),
  UNIQUE (id, artifact_version, artifact_digest),
  CHECK (body_contract_id = 'SHIFAA-F011-PROTECTED-BODY/1'),
  CHECK ((is_initial AND supersedes_release_id IS NULL)
      OR (NOT is_initial AND supersedes_release_id IS NOT NULL)),
  CHECK (supersedes_release_id IS NULL OR supersedes_release_id <> id),
  CHECK ((status = 'draft' AND published_by_person_id IS NULL AND published_at IS NULL)
      OR (status = 'published' AND published_by_person_id IS NOT NULL AND published_at IS NOT NULL)),
  CHECK (published_by_person_id IS NULL OR published_by_person_id <> created_by_person_id),
  FOREIGN KEY (supersedes_release_id, series_id)
    REFERENCES clinical.content_releases(id, series_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX content_releases_published_root_uq
  ON clinical.content_releases(series_id)
  WHERE status = 'published' AND is_initial AND supersedes_release_id IS NULL;
CREATE UNIQUE INDEX content_releases_published_successor_uq
  ON clinical.content_releases(supersedes_release_id)
  WHERE status = 'published' AND supersedes_release_id IS NOT NULL;
CREATE INDEX content_releases_series_status_idx
  ON clinical.content_releases(series_id, status, effective_at, id);
CREATE INDEX content_releases_predecessor_idx
  ON clinical.content_releases(supersedes_release_id) WHERE supersedes_release_id IS NOT NULL;

CREATE TABLE clinical.content_material_bindings (
  binding_id uuid PRIMARY KEY,
  release_id uuid NOT NULL,
  artifact_version integer NOT NULL CHECK (artifact_version > 0),
  material_kind text NOT NULL CHECK (material_kind IN ('content', 'code', 'test_vectors')),
  evidence_ref uuid NOT NULL,
  verified_sha256 bytea NOT NULL CHECK (pg_catalog.octet_length(verified_sha256) = 32),
  producer_id text NOT NULL CHECK (producer_id = 'f011.evidence_port'),
  verified_at timestamptz NOT NULL,
  binding_contract_id text NOT NULL CHECK
    (binding_contract_id = 'SHIFAA-F011-VERIFIED-EVIDENCE-BINDING/1'),
  UNIQUE (release_id, material_kind),
  UNIQUE (binding_id, release_id, artifact_version),
  FOREIGN KEY (release_id, artifact_version)
    REFERENCES clinical.content_releases(id, artifact_version) ON DELETE RESTRICT
);

CREATE FUNCTION clinical.f011_guard_content_release_update_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, clinical
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'content releases are immutable';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.series_id IS DISTINCT FROM OLD.series_id
     OR NEW.artifact_version IS DISTINCT FROM OLD.artifact_version
     OR NEW.source_display IS DISTINCT FROM OLD.source_display
     OR NEW.source_reference IS DISTINCT FROM OLD.source_reference
     OR NEW.effective_at IS DISTINCT FROM OLD.effective_at
     OR NEW.artifact_digest IS DISTINCT FROM OLD.artifact_digest
     OR NEW.body_contract_id IS DISTINCT FROM OLD.body_contract_id
     OR NEW.body_key_ref IS DISTINCT FROM OLD.body_key_ref
     OR NEW.body_nonce IS DISTINCT FROM OLD.body_nonce
     OR NEW.body_ciphertext IS DISTINCT FROM OLD.body_ciphertext
     OR NEW.body_auth_tag IS DISTINCT FROM OLD.body_auth_tag
     OR NEW.content_evidence_ref IS DISTINCT FROM OLD.content_evidence_ref
     OR NEW.code_evidence_ref IS DISTINCT FROM OLD.code_evidence_ref
     OR NEW.test_vector_evidence_ref IS DISTINCT FROM OLD.test_vector_evidence_ref
     OR NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256
     OR NEW.code_sha256 IS DISTINCT FROM OLD.code_sha256
     OR NEW.test_vector_sha256 IS DISTINCT FROM OLD.test_vector_sha256
     OR NEW.is_initial IS DISTINCT FROM OLD.is_initial
     OR NEW.supersedes_release_id IS DISTINCT FROM OLD.supersedes_release_id
     OR NEW.created_by_person_id IS DISTINCT FROM OLD.created_by_person_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.synthetic IS DISTINCT FROM OLD.synthetic
     OR OLD.status <> 'draft'
     OR NEW.workflow_version <> OLD.workflow_version + 1
     OR NEW.status NOT IN ('draft', 'published')
     OR (NEW.status = 'draft' AND (NEW.published_by_person_id IS NOT NULL OR NEW.published_at IS NOT NULL))
     OR (NEW.status = 'published' AND (NEW.published_by_person_id IS NULL OR NEW.published_at IS NULL
         OR NEW.published_by_person_id = NEW.created_by_person_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invalid content release workflow update';
  END IF;
  RETURN NEW;
END
$function$;

CREATE FUNCTION clinical.f011_guard_content_material_bindings_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, clinical
AS $function$
DECLARE bad boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM clinical.content_releases r
    LEFT JOIN clinical.content_material_bindings b ON b.release_id = r.id
    GROUP BY r.id, r.artifact_version, r.content_evidence_ref, r.content_sha256,
      r.code_evidence_ref, r.code_sha256, r.test_vector_evidence_ref, r.test_vector_sha256
    HAVING pg_catalog.count(b.binding_id) <> 3
      OR pg_catalog.count(*) FILTER (WHERE b.material_kind = 'content'
        AND b.artifact_version = r.artifact_version AND b.evidence_ref = r.content_evidence_ref
        AND b.verified_sha256 = r.content_sha256
        AND b.binding_contract_id = 'SHIFAA-F011-VERIFIED-EVIDENCE-BINDING/1'
        AND b.producer_id = 'f011.evidence_port') <> 1
      OR pg_catalog.count(*) FILTER (WHERE b.material_kind = 'code'
        AND b.artifact_version = r.artifact_version AND b.evidence_ref = r.code_evidence_ref
        AND b.verified_sha256 = r.code_sha256
        AND b.binding_contract_id = 'SHIFAA-F011-VERIFIED-EVIDENCE-BINDING/1'
        AND b.producer_id = 'f011.evidence_port') <> 1
      OR pg_catalog.count(*) FILTER (WHERE b.material_kind = 'test_vectors'
        AND b.artifact_version = r.artifact_version AND b.evidence_ref = r.test_vector_evidence_ref
        AND b.verified_sha256 = r.test_vector_sha256
        AND b.binding_contract_id = 'SHIFAA-F011-VERIFIED-EVIDENCE-BINDING/1'
        AND b.producer_id = 'f011.evidence_port') <> 1
  ) INTO bad;
  IF bad THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'content release material bindings are incomplete or mismatched';
  END IF;
  RETURN NULL;
END
$function$;

CREATE TRIGGER content_series_immutable_guard
BEFORE UPDATE OR DELETE ON clinical.content_series
FOR EACH ROW EXECUTE FUNCTION clinical.f011_reject_immutable_v1();
CREATE TRIGGER content_releases_workflow_guard
BEFORE UPDATE OR DELETE ON clinical.content_releases
FOR EACH ROW EXECUTE FUNCTION clinical.f011_guard_content_release_update_v1();
CREATE TRIGGER content_material_bindings_immutable_guard
BEFORE UPDATE OR DELETE ON clinical.content_material_bindings
FOR EACH ROW EXECUTE FUNCTION clinical.f011_reject_immutable_v1();

CREATE CONSTRAINT TRIGGER content_releases_materials_deferred
AFTER INSERT OR UPDATE OR DELETE ON clinical.content_releases
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION clinical.f011_guard_content_material_bindings_v1();
CREATE CONSTRAINT TRIGGER content_material_bindings_reciprocal_deferred
AFTER INSERT OR UPDATE OR DELETE ON clinical.content_material_bindings
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION clinical.f011_guard_content_material_bindings_v1();

ALTER TABLE clinical.content_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical.content_series FORCE ROW LEVEL SECURITY;
ALTER TABLE clinical.content_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical.content_releases FORCE ROW LEVEL SECURITY;
ALTER TABLE clinical.content_material_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical.content_material_bindings FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE clinical.content_series, clinical.content_releases,
  clinical.content_material_bindings FROM PUBLIC;
REVOKE ALL ON FUNCTION clinical.f011_guard_content_release_update_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION clinical.f011_guard_content_material_bindings_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION clinical.f011_reject_immutable_v1() FROM PUBLIC;

DO $revoke_roles$
DECLARE grantee name;
BEGIN
  FOREACH grantee IN ARRAY ARRAY['shifaa_api', 'shifaa_worker', 'anon', 'authenticated', 'service_role']::name[] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = grantee) THEN
      EXECUTE pg_catalog.format('REVOKE ALL ON TABLE clinical.content_series, clinical.content_releases, clinical.content_material_bindings FROM %I', grantee);
      EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION clinical.f011_guard_content_release_update_v1() FROM %I', grantee);
      EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION clinical.f011_guard_content_material_bindings_v1() FROM %I', grantee);
      EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION clinical.f011_reject_immutable_v1() FROM %I', grantee);
    END IF;
  END LOOP;
END
$revoke_roles$;
