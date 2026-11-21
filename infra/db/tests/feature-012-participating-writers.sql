\set ON_ERROR_STOP on
\set VERBOSITY verbose

-- T012 catalog baseline for a freshly migrated disposable database only.
-- Capture access paths before installing T013. Review the result against the
-- source inventory; catalog access is not an assertion that a writer is admitted.
BEGIN READ ONLY;
SET LOCAL search_path = pg_catalog;

WITH relations(oid) AS (
  VALUES
    ('clinical.allergy_heads'::regclass),
    ('clinical.allergies'::regclass),
    ('clinical.content_series'::regclass),
    ('clinical.content_releases'::regclass),
    ('clinical.content_material_bindings'::regclass),
    ('clinical.content_signature_bindings'::regclass),
    ('clinical.content_governance_authorities'::regclass),
    ('clinical.content_reviewer_designations'::regclass),
    ('clinical.content_admissibility_evidence'::regclass),
    ('clinical.encounters'::regclass),
    ('clinical.encounter_participants'::regclass),
    ('clinical.appointments'::regclass),
    ('clinical.queue_entries'::regclass),
    ('identity.people'::regclass),
    ('identity.patients'::regclass),
    ('identity.care_relationships'::regclass),
    ('identity.care_relationship_permissions'::regclass),
    ('identity.facilities'::regclass),
    ('identity.facility_memberships'::regclass),
    ('identity.professional_licenses'::regclass),
    ('identity.facility_licenses'::regclass),
    ('identity.private_evidence_objects'::regclass),
    ('identity.admin_role_grants'::regclass),
    ('identity.admin_role_revocation_requests'::regclass),
    ('identity.continuity_cases'::regclass),
    ('consent.records'::regclass),
    ('platform.f012_source_admission'::regclass),
    ('clinical.safety_source_generations'::regclass)
),
targets AS (
  SELECT c.* FROM relations r JOIN pg_class c ON c.oid = r.oid
),
table_writes AS (
  SELECT c.oid, r.rolname, r.rolcanlogin, r.rolbypassrls, r.rolsuper,
         has_schema_privilege(r.oid, c.relnamespace, 'USAGE') AS schema_usage,
         has_any_column_privilege(r.oid, c.oid, 'INSERT') AS can_insert,
         has_any_column_privilege(r.oid, c.oid, 'UPDATE') AS can_update,
         has_table_privilege(r.oid, c.oid, 'DELETE') AS can_delete,
         has_table_privilege(r.oid, c.oid, 'TRUNCATE') AS can_truncate,
         pg_has_role(r.oid, c.relowner, 'MEMBER') AS member_of_owner
  FROM targets c CROSS JOIN pg_roles r
),
trigger_functions AS (
  SELECT DISTINCT t.tgfoid AS oid
  FROM pg_trigger t JOIN targets c ON c.oid = t.tgrelid
  WHERE NOT t.tgisinternal
),
known_routines(oid) AS (
  VALUES
    ('clinical.create_allergy_api_v1(uuid,jsonb)'::regprocedure),
    ('clinical.verify_allergy_api_v1(uuid,integer,jsonb)'::regprocedure),
    ('clinical.create_clinical_content_release_api_v1(text,jsonb)'::regprocedure),
    ('clinical.sign_clinical_content_release_api_v1(uuid,integer,jsonb)'::regprocedure),
    ('clinical.publish_clinical_content_release_api_v1(uuid,integer,jsonb)'::regprocedure),
    ('clinical.f011_release_current_eligibility_v1(uuid)'::regprocedure),
    ('clinical.create_encounter_v1(jsonb)'::regprocedure),
    ('clinical.create_encounter_api_v1(jsonb)'::regprocedure),
    ('clinical.update_encounter_api_v1(uuid,integer,jsonb)'::regprocedure),
    ('clinical.complete_encounter_v1(uuid,integer,jsonb)'::regprocedure),
    ('clinical.complete_encounter_api_v1(uuid,integer,jsonb)'::regprocedure),
    ('platform.register_identity_onboarding(uuid,text,text)'::regprocedure),
    ('platform.submit_dependent_transition(uuid,uuid,integer)'::regprocedure),
    ('platform.decide_dependent_transition(uuid,integer,text,text,text)'::regprocedure)
),
routines AS (
  SELECT p.*
  FROM pg_proc p
  WHERE p.oid IN (SELECT oid FROM known_routines UNION SELECT oid FROM trigger_functions)
),
catalog AS (
  SELECT
    'relation' AS kind,
    c.oid::regclass::text AS object_name,
    jsonb_build_object('owner', pg_get_userbyid(c.relowner), 'rls', c.relrowsecurity,
                       'forceRls', c.relforcerowsecurity) AS detail
  FROM targets c
  UNION ALL
  SELECT 'role-dml', w.oid::regclass::text, to_jsonb(w) - 'oid'
  FROM table_writes w
  WHERE can_insert OR can_update OR can_delete OR can_truncate OR member_of_owner
  UNION ALL
  SELECT 'trigger', t.tgrelid::regclass::text,
         jsonb_build_object('name', t.tgname, 'enabled', t.tgenabled,
                            'function', t.tgfoid::regprocedure::text)
  FROM pg_trigger t JOIN targets c ON c.oid = t.tgrelid
  WHERE NOT t.tgisinternal
  UNION ALL
  SELECT 'routine', p.oid::regprocedure::text,
         jsonb_build_object('owner', pg_get_userbyid(p.proowner), 'securityDefiner', p.prosecdef,
                            'settings', p.proconfig, 'executeRoles', (
           SELECT jsonb_agg(r.rolname ORDER BY r.rolname)
           FROM pg_roles r
           WHERE has_schema_privilege(r.oid, p.pronamespace, 'USAGE')
             AND has_function_privilege(r.oid, p.oid, 'EXECUTE')
         ))
  FROM routines p
)
SELECT kind, object_name, detail
FROM catalog
ORDER BY kind, object_name, detail;
ROLLBACK;
