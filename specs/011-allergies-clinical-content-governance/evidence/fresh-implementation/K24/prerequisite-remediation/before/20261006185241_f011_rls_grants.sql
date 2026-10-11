-- Feature 011 K06: make the seven authenticated operations the only API
-- execution boundary. The non-login executor owns the narrow SECURITY DEFINER
-- functions and runs under forced RLS without BYPASSRLS.

DO $role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='shifaa_f011_executor') THEN
    EXECUTE 'CREATE ROLE shifaa_f011_executor NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS';
  END IF;
END
$role$;
ALTER ROLE shifaa_f011_executor NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOINHERIT NOREPLICATION NOBYPASSRLS;

GRANT USAGE,CREATE ON SCHEMA clinical,identity,audit,platform TO shifaa_f011_executor;
GRANT USAGE ON SCHEMA consent TO shifaa_f011_executor;

-- The executor can read current identity/governance predicates and the Feature
-- 011 state. Direct API access to the protected Feature 011 relations is
-- revoked; only the approved SECURITY DEFINER operations receive execution.
GRANT SELECT ON TABLE
  identity.people,identity.patients,identity.facilities,identity.professional_licenses,
  identity.facility_licenses,identity.facility_memberships,identity.private_evidence_objects,
  identity.admin_role_grants,identity.admin_role_revocation_requests,
  identity.care_relationships,identity.care_relationship_permissions,
  clinical.encounters,clinical.encounter_participants,
  clinical.allergy_heads,clinical.allergies,clinical.allergy_verification_support,
  clinical.allergy_verification_bindings,clinical.content_series,clinical.content_releases,
  clinical.content_material_bindings,clinical.content_governance_authorities,
  clinical.content_reviewer_designations,clinical.content_admissibility_evidence,
  clinical.content_artifact_admissibility_bindings,clinical.content_signature_bindings,
  clinical.mutation_receipts,clinical.mutation_commit_obligations,
  audit.signature_evidence,platform.idempotency_records,platform.outbox_events,
  consent.records
TO shifaa_f011_executor;
REVOKE ALL ON TABLE audit.events FROM shifaa_f011_executor;
GRANT SELECT (occurred_at,id,actor_person_id,request_id,resource_type,resource_id,resource_version,outcome)
  ON TABLE audit.events TO shifaa_f011_executor;
GRANT INSERT ON TABLE
  clinical.allergies,clinical.allergy_heads,
  clinical.allergy_verification_bindings,clinical.content_series,clinical.content_releases,
  clinical.content_material_bindings,clinical.content_signature_bindings,
  clinical.mutation_receipts,clinical.mutation_commit_obligations,
  audit.signature_evidence,platform.outbox_events
TO shifaa_f011_executor;
GRANT UPDATE (current_version,current_revision_id,updated_at) ON TABLE clinical.allergy_heads TO shifaa_f011_executor;
GRANT UPDATE (workflow_version,status,published_by_person_id,published_at)
  ON TABLE clinical.content_releases TO shifaa_f011_executor;
GRANT UPDATE ON TABLE platform.idempotency_records TO shifaa_f011_executor;
-- PostgreSQL requires UPDATE privilege to take row locks. These key-column
-- grants permit only the SELECT FOR SHARE/UPDATE locks used by the consumers.
GRANT UPDATE (id) ON TABLE
  identity.people,identity.patients,identity.facilities,identity.professional_licenses,
  identity.facility_licenses,identity.facility_memberships,identity.private_evidence_objects,
  identity.admin_role_grants,identity.admin_role_revocation_requests,
  identity.care_relationships,
  clinical.encounters,clinical.allergy_heads,clinical.allergies,
  clinical.allergy_verification_support,
  clinical.content_series,clinical.content_releases,clinical.content_governance_authorities,
  clinical.content_reviewer_designations,clinical.content_admissibility_evidence
TO shifaa_f011_executor;
GRANT UPDATE (relationship_id) ON TABLE identity.care_relationship_permissions TO shifaa_f011_executor;
GRANT UPDATE (encounter_id) ON TABLE clinical.encounter_participants TO shifaa_f011_executor;
GRANT UPDATE (binding_id) ON TABLE clinical.content_artifact_admissibility_bindings TO shifaa_f011_executor;
GRANT UPDATE (id) ON TABLE consent.records TO shifaa_f011_executor;

-- Forced-RLS relations get policies for the non-login executor only. The
-- idempotency, receipt, obligation, signature, and outbox policies remain
-- scoped to the current request principal and the Feature 011 event domain.
DO $policies$
DECLARE target record;
BEGIN
  FOR target IN SELECT * FROM (VALUES
    ('clinical','allergy_heads'),('clinical','allergies'),
    ('clinical','allergy_verification_support'),('clinical','allergy_verification_bindings'),
    ('clinical','content_series'),('clinical','content_releases'),
    ('clinical','content_material_bindings'),('clinical','content_governance_authorities'),
    ('clinical','content_reviewer_designations'),('clinical','content_admissibility_evidence'),
    ('clinical','content_artifact_admissibility_bindings'),('clinical','content_signature_bindings')
  ) AS relations(schema_name,table_name) LOOP
    EXECUTE pg_catalog.format('DROP POLICY IF EXISTS f011_executor_access ON %I.%I',target.schema_name,target.table_name);
    EXECUTE pg_catalog.format(
      'CREATE POLICY f011_executor_access ON %I.%I FOR ALL TO shifaa_f011_executor USING (true) WITH CHECK (true)',
      target.schema_name,target.table_name);
  END LOOP;
END
$policies$;

DO $read_policies$
DECLARE target record;
BEGIN
  FOR target IN SELECT * FROM (VALUES
    ('identity','people'),('identity','patients'),('identity','facilities'),
    ('identity','professional_licenses'),('identity','facility_licenses'),
    ('identity','facility_memberships'),('identity','private_evidence_objects'),
    ('identity','admin_role_grants'),('identity','admin_role_revocation_requests'),
    ('identity','care_relationships'),('identity','care_relationship_permissions'),
    ('clinical','encounters'),('clinical','encounter_participants'),('consent','records')
  ) AS relations(schema_name,table_name) LOOP
    EXECUTE pg_catalog.format('DROP POLICY IF EXISTS f011_executor_read ON %I.%I',target.schema_name,target.table_name);
    EXECUTE pg_catalog.format(
      'CREATE POLICY f011_executor_read ON %I.%I FOR SELECT TO shifaa_f011_executor USING (true)',
      target.schema_name,target.table_name);
  END LOOP;
END
$read_policies$;

-- Row-lock-only UPDATE policies are confined to the non-login executor.
-- Column grants permit SELECT FOR SHARE; WITH CHECK(false) rejects writes.
DO $lock_policies$
DECLARE target record;
BEGIN
  FOR target IN SELECT * FROM (VALUES
    ('identity','people'),('identity','patients'),('identity','facilities'),
    ('identity','professional_licenses'),('identity','facility_licenses'),
    ('identity','facility_memberships'),('identity','private_evidence_objects'),
    ('identity','admin_role_grants'),('identity','admin_role_revocation_requests'),
    ('identity','care_relationships'),('identity','care_relationship_permissions'),
    ('clinical','encounters'),('clinical','encounter_participants'),('consent','records')
  ) AS relations(schema_name,table_name) LOOP
    EXECUTE pg_catalog.format('DROP POLICY IF EXISTS f011_executor_lock_only ON %I.%I',target.schema_name,target.table_name);
    EXECUTE pg_catalog.format(
      'CREATE POLICY f011_executor_lock_only ON %I.%I FOR UPDATE TO shifaa_f011_executor USING (true) WITH CHECK (false)',
      target.schema_name,target.table_name);
  END LOOP;
END
$lock_policies$;

DROP POLICY IF EXISTS f011_executor_receipts ON clinical.mutation_receipts;
CREATE POLICY f011_executor_receipts ON clinical.mutation_receipts FOR ALL TO shifaa_f011_executor
  USING (actor_person_id=platform.context_person_id())
  WITH CHECK (actor_person_id=platform.context_person_id());
DROP POLICY IF EXISTS f011_executor_obligations ON clinical.mutation_commit_obligations;
CREATE POLICY f011_executor_obligations ON clinical.mutation_commit_obligations FOR ALL TO shifaa_f011_executor
  USING (actor_person_id=platform.context_person_id())
  WITH CHECK (actor_person_id=platform.context_person_id());
DROP POLICY IF EXISTS f011_executor_signature_evidence ON audit.signature_evidence;
CREATE POLICY f011_executor_signature_evidence ON audit.signature_evidence FOR ALL TO shifaa_f011_executor
  USING (resource_type='clinical.content_release')
  WITH CHECK (resource_type='clinical.content_release');
DROP POLICY IF EXISTS f011_executor_audit_events ON audit.events;
CREATE POLICY f011_executor_audit_events ON audit.events FOR SELECT TO shifaa_f011_executor
  USING (actor_person_id=platform.context_person_id()
    AND resource_type IN ('clinical.allergy_revision','clinical.content_release'));
DROP POLICY IF EXISTS f011_executor_outbox ON platform.outbox_events;
CREATE POLICY f011_executor_outbox ON platform.outbox_events FOR ALL TO shifaa_f011_executor
  USING (aggregate_type IN ('clinical.allergy_revision','clinical.content_release'))
  WITH CHECK (aggregate_type IN ('clinical.allergy_revision','clinical.content_release'));
DROP POLICY IF EXISTS f011_executor_idempotency ON platform.idempotency_records;
CREATE POLICY f011_executor_idempotency ON platform.idempotency_records FOR ALL TO shifaa_f011_executor
  USING (principal_type='sha256-v1' AND principal_hash=pg_catalog.encode(
    audit.sha256_v1(pg_catalog.convert_to(
      'shifaa:idempotency:principal:v1:' || pg_catalog.octet_length(platform.context_person_id()::text)::text
        || ':' || platform.context_person_id()::text,'UTF8')),'hex'))
  WITH CHECK (principal_type='sha256-v1' AND principal_hash=pg_catalog.encode(
    audit.sha256_v1(pg_catalog.convert_to(
      'shifaa:idempotency:principal:v1:' || pg_catalog.octet_length(platform.context_person_id()::text)::text
        || ':' || platform.context_person_id()::text,'UTF8')),'hex'));

REVOKE ALL ON TABLE
  clinical.allergy_heads,clinical.allergies,clinical.allergy_verification_support,
  clinical.allergy_verification_bindings,clinical.content_series,clinical.content_releases,
  clinical.content_material_bindings,clinical.content_governance_authorities,
  clinical.content_reviewer_designations,clinical.content_admissibility_evidence,
  clinical.content_artifact_admissibility_bindings,clinical.content_signature_bindings,
  clinical.mutation_receipts,clinical.mutation_commit_obligations
FROM PUBLIC,shifaa_api,shifaa_worker,service_role;
REVOKE ALL ON TABLE audit.signature_evidence FROM PUBLIC;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE audit.signature_evidence FROM shifaa_api;

-- Required trusted seams and existing current-context functions.
GRANT EXECUTE ON FUNCTION clinical.begin_mutation_v1(text,text),
  clinical.feature_010_current_encounter_clinician_v1(uuid,boolean),
  clinical.feature_010_family_authority_v1(uuid,uuid,text,boolean,boolean),
  platform.context_person_id(),platform.context_role(),platform.context_aal(),
  platform.context_purposes(),platform.context_action(),platform.context_now(),
  platform.context_environment(),audit.sha256_v1(bytea),
  audit.append_event_v1(uuid,text,text,text,text,uuid,uuid,smallint,uuid,uuid,text,uuid,integer,text,inet,text)
TO shifaa_f011_executor;

-- Transfer ownership to the fixed-path non-login executor after granting the
-- minimal temporary schema CREATE needed by ALTER FUNCTION OWNER.
ALTER FUNCTION clinical.f011_assert_exact_keys_v1(jsonb,text[]) OWNER TO shifaa_f011_executor;
ALTER FUNCTION clinical.f011_assert_response_context_v1(text,text,uuid,integer) OWNER TO shifaa_f011_executor;
ALTER FUNCTION clinical.f011_decode_envelope_v1(jsonb,text) OWNER TO shifaa_f011_executor;
ALTER FUNCTION clinical.f011_record_mutation_effect_v1(uuid,uuid,text,text,uuid,integer,smallint,text,uuid,uuid,uuid) OWNER TO shifaa_f011_executor;
ALTER FUNCTION clinical.f011_allergy_current_authority_v1(uuid,text,uuid,uuid) OWNER TO shifaa_f011_executor;
ALTER FUNCTION clinical.f011_lock_clinician_scope_v1(uuid,uuid,uuid) OWNER TO shifaa_f011_executor;
ALTER FUNCTION clinical.list_allergies_api_v1(uuid,jsonb) OWNER TO shifaa_f011_executor;
ALTER FUNCTION clinical.create_allergy_api_v1(uuid,jsonb) OWNER TO shifaa_f011_executor;
ALTER FUNCTION clinical.verify_allergy_api_v1(uuid,integer,jsonb) OWNER TO shifaa_f011_executor;
ALTER FUNCTION clinical.f011_frame_text_v1(text) OWNER TO shifaa_f011_executor;
ALTER FUNCTION clinical.f011_frame_nullable_text_v1(text) OWNER TO shifaa_f011_executor;
ALTER FUNCTION clinical.f011_artifact_canonical_bytes_v1(jsonb) OWNER TO shifaa_f011_executor;
ALTER FUNCTION clinical.f011_lock_medical_reviewer_v1(uuid) OWNER TO shifaa_f011_executor;
ALTER FUNCTION clinical.create_clinical_content_release_api_v1(text,jsonb) OWNER TO shifaa_f011_executor;
ALTER FUNCTION clinical.sign_clinical_content_release_api_v1(uuid,integer,jsonb) OWNER TO shifaa_f011_executor;
ALTER FUNCTION clinical.f011_release_current_eligibility_v1(uuid) OWNER TO shifaa_f011_executor;
ALTER FUNCTION clinical.f011_lock_publication_current_basis_v1(uuid,uuid,integer,bytea,uuid,uuid) OWNER TO shifaa_f011_executor;
ALTER FUNCTION clinical.f011_lock_clinic_content_scope_v1(uuid,uuid) OWNER TO shifaa_f011_executor;
ALTER FUNCTION clinical.publish_clinical_content_release_api_v1(uuid,integer,jsonb) OWNER TO shifaa_f011_executor;
ALTER FUNCTION clinical.list_clinical_content_api_v1(text,jsonb) OWNER TO shifaa_f011_executor;

-- Existing Feature 011 trigger/deferred guards also execute as the same
-- non-owner under forced RLS. Their bodies qualify application objects, so an
-- empty search_path does not change their object resolution.
ALTER FUNCTION clinical.f011_reject_immutable_v1() OWNER TO shifaa_f011_executor;
ALTER FUNCTION clinical.f011_reject_immutable_v1() SET search_path = '';
ALTER FUNCTION clinical.f011_guard_allergy_head_update_v1() OWNER TO shifaa_f011_executor;
ALTER FUNCTION clinical.f011_guard_allergy_head_update_v1() SET search_path = '';
ALTER FUNCTION clinical.f011_guard_allergy_verification_binding_v1() OWNER TO shifaa_f011_executor;
ALTER FUNCTION clinical.f011_guard_allergy_verification_binding_v1() SET search_path = '';
ALTER FUNCTION clinical.f011_guard_content_release_update_v1() OWNER TO shifaa_f011_executor;
ALTER FUNCTION clinical.f011_guard_content_release_update_v1() SET search_path = '';
ALTER FUNCTION clinical.f011_guard_content_material_bindings_v1() OWNER TO shifaa_f011_executor;
ALTER FUNCTION clinical.f011_guard_content_material_bindings_v1() SET search_path = '';
ALTER FUNCTION clinical.f011_guard_governance_version_v1() OWNER TO shifaa_f011_executor;
ALTER FUNCTION clinical.f011_guard_governance_version_v1() SET search_path = '';
ALTER FUNCTION clinical.f011_guard_admissibility_update_v1() OWNER TO shifaa_f011_executor;
ALTER FUNCTION clinical.f011_guard_admissibility_update_v1() SET search_path = '';
ALTER FUNCTION clinical.f011_guard_admissibility_insert_v1() OWNER TO shifaa_f011_executor;
ALTER FUNCTION clinical.f011_guard_admissibility_insert_v1() SET search_path = '';
ALTER FUNCTION clinical.f011_guard_content_admissibility_binding_v1() OWNER TO shifaa_f011_executor;
ALTER FUNCTION clinical.f011_guard_content_admissibility_binding_v1() SET search_path = '';
ALTER FUNCTION clinical.f011_guard_content_signature_binding_insert_v1() OWNER TO shifaa_f011_executor;
ALTER FUNCTION clinical.f011_guard_content_signature_binding_insert_v1() SET search_path = '';
ALTER FUNCTION clinical.f011_guard_content_signature_bindings_v1() OWNER TO shifaa_f011_executor;
ALTER FUNCTION clinical.f011_guard_content_signature_bindings_v1() SET search_path = '';
ALTER FUNCTION clinical.f011_require_mutation_commit_v1() OWNER TO shifaa_f011_executor;
ALTER FUNCTION clinical.f011_require_mutation_commit_v1() SET search_path = '';
REVOKE CREATE ON SCHEMA clinical,identity,audit,platform,consent FROM shifaa_f011_executor;

REVOKE ALL ON FUNCTION
  clinical.f011_reject_immutable_v1(),
  clinical.f011_guard_allergy_head_update_v1(),
  clinical.f011_guard_allergy_verification_binding_v1(),
  clinical.f011_guard_content_release_update_v1(),
  clinical.f011_guard_content_material_bindings_v1(),
  clinical.f011_guard_governance_version_v1(),
  clinical.f011_guard_admissibility_update_v1(),
  clinical.f011_guard_admissibility_insert_v1(),
  clinical.f011_guard_content_admissibility_binding_v1(),
  clinical.f011_guard_content_signature_binding_insert_v1(),
  clinical.f011_guard_content_signature_bindings_v1(),
  clinical.f011_require_mutation_commit_v1()
FROM PUBLIC,shifaa_api,shifaa_worker,service_role;
-- Native Supabase roles are optional in the supported standalone PostgreSQL
-- baseline. Revoke them when present; do not invent runtime roles here.
DO $guard_optional_roles$
DECLARE grantee name; guard record;
BEGIN
  FOREACH grantee IN ARRAY ARRAY['anon','authenticated']::name[] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=grantee) THEN
      FOR guard IN
        SELECT p.oid::regprocedure AS signature
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='clinical' AND p.proname IN (
          'f011_reject_immutable_v1','f011_guard_allergy_head_update_v1',
          'f011_guard_allergy_verification_binding_v1','f011_guard_content_release_update_v1',
          'f011_guard_content_material_bindings_v1','f011_guard_governance_version_v1',
          'f011_guard_admissibility_update_v1','f011_guard_admissibility_insert_v1',
          'f011_guard_content_admissibility_binding_v1',
          'f011_guard_content_signature_binding_insert_v1',
          'f011_guard_content_signature_bindings_v1','f011_require_mutation_commit_v1')
      LOOP
        EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM %I',guard.signature,grantee);
      END LOOP;
    END IF;
  END LOOP;
END
$guard_optional_roles$;

REVOKE ALL ON FUNCTION clinical.f011_assert_exact_keys_v1(jsonb,text[]),
  clinical.f011_assert_response_context_v1(text,text,uuid,integer),
  clinical.f011_decode_envelope_v1(jsonb,text),
  clinical.f011_record_mutation_effect_v1(uuid,uuid,text,text,uuid,integer,smallint,text,uuid,uuid,uuid),
  clinical.f011_allergy_current_authority_v1(uuid,text,uuid,uuid),
  clinical.f011_lock_clinician_scope_v1(uuid,uuid,uuid),
  clinical.feature_010_family_authority_v1(uuid,uuid,text,boolean,boolean),
  clinical.f011_frame_text_v1(text),clinical.f011_frame_nullable_text_v1(text),
  clinical.f011_artifact_canonical_bytes_v1(jsonb),clinical.f011_lock_medical_reviewer_v1(uuid),
  clinical.f011_release_current_eligibility_v1(uuid),
  clinical.f011_lock_publication_current_basis_v1(uuid,uuid,integer,bytea,uuid,uuid),
  clinical.f011_lock_clinic_content_scope_v1(uuid,uuid)
FROM PUBLIC,shifaa_api,shifaa_worker,service_role;
REVOKE ALL ON FUNCTION clinical.list_allergies_api_v1(uuid,jsonb),
  clinical.create_allergy_api_v1(uuid,jsonb),clinical.verify_allergy_api_v1(uuid,integer,jsonb),
  clinical.list_clinical_content_api_v1(text,jsonb),clinical.create_clinical_content_release_api_v1(text,jsonb),
  clinical.sign_clinical_content_release_api_v1(uuid,integer,jsonb),
  clinical.publish_clinical_content_release_api_v1(uuid,integer,jsonb)
FROM PUBLIC,shifaa_api,shifaa_worker,service_role;
GRANT EXECUTE ON FUNCTION clinical.f011_assert_exact_keys_v1(jsonb,text[]),
  clinical.f011_assert_response_context_v1(text,text,uuid,integer),
  clinical.f011_decode_envelope_v1(jsonb,text),
  clinical.f011_record_mutation_effect_v1(uuid,uuid,text,text,uuid,integer,smallint,text,uuid,uuid,uuid),
  clinical.f011_allergy_current_authority_v1(uuid,text,uuid,uuid),
  clinical.f011_lock_clinician_scope_v1(uuid,uuid,uuid),
  clinical.feature_010_family_authority_v1(uuid,uuid,text,boolean,boolean),
  clinical.f011_frame_text_v1(text),clinical.f011_frame_nullable_text_v1(text),
  clinical.f011_artifact_canonical_bytes_v1(jsonb),clinical.f011_lock_medical_reviewer_v1(uuid),
  clinical.f011_release_current_eligibility_v1(uuid),
  clinical.f011_lock_publication_current_basis_v1(uuid,uuid,integer,bytea,uuid,uuid),
  clinical.f011_lock_clinic_content_scope_v1(uuid,uuid)
TO shifaa_f011_executor;
GRANT EXECUTE ON FUNCTION clinical.list_allergies_api_v1(uuid,jsonb),
  clinical.create_allergy_api_v1(uuid,jsonb),clinical.verify_allergy_api_v1(uuid,integer,jsonb),
  clinical.list_clinical_content_api_v1(text,jsonb),clinical.create_clinical_content_release_api_v1(text,jsonb),
  clinical.sign_clinical_content_release_api_v1(uuid,integer,jsonb),
  clinical.publish_clinical_content_release_api_v1(uuid,integer,jsonb)
TO shifaa_api;

-- Explicitly sever any inherited broad grants accidentally present on this
-- role surface; role membership is never granted to the executor.
REVOKE shifaa_f011_executor FROM shifaa_api,shifaa_worker,service_role;
