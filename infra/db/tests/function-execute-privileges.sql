\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE expected_shifaa_api_functions (
  function_identity text PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO expected_shifaa_api_functions(function_identity) VALUES
  ('audit.current_admin_summary_context_v1()'),
  ('audit.current_super_admin_context_v1(text)'),
  ('audit.health_integrity_v1()'),
  ('audit.read_chain_verification_v1(date)'),
  ('audit.read_event_v1(uuid)'),
  ('audit.read_events_v1(uuid,text,text,uuid,timestamp with time zone,timestamp with time zone,text,timestamp with time zone,uuid,integer)'),
  ('audit.read_export_batch_v1(uuid)'),
  ('audit.read_export_work_v1(uuid,text)'),
  ('audit.readiness_v1()'),
  ('audit.record_admin_read_v1(uuid,text,text,uuid)'),
  ('audit.request_export_v1(text,text,date,date,uuid,text)'),
  ('identity.transition_eligible_on(date,date)'),
  ('platform.accept_sos_prearrival(uuid,uuid,integer,text)'),
  ('platform.append_discovery_sos_effect_v1(uuid,text,uuid,integer,uuid)'),
  ('platform.append_facility_governance_audit_v1(uuid,text,uuid,uuid)'),
  ('platform.append_family_authorization_audit_v1(uuid,text,uuid,uuid,integer)'),
  ('platform.append_family_invitation_audit_v1(uuid,text,uuid,uuid)'),
  ('platform.append_family_mutation_audit_v1(uuid,text,uuid,uuid,uuid,integer)'),
  ('platform.append_identity_audit_effect_v1(uuid,text,text,uuid,integer,text)'),
  ('platform.append_notification_receipt_audit_v1(uuid,uuid)'),
  ('platform.append_privacy_effect_audit_v1(uuid,text,uuid,uuid,integer)'),
  ('platform.authorize_recovery_proof_grant(bytea)'),
  ('platform.case_owner_is_other(uuid,uuid)'),
  ('platform.close_sos_incident(uuid,integer,text)'),
  ('platform.consume_emergency_share(bytea,uuid)'),
  ('platform.context_aal()'),
  ('platform.context_action()'),
  ('platform.context_case_id()'),
  ('platform.context_environment()'),
  ('platform.context_factor_amr_at()'),
  ('platform.context_now()'),
  ('platform.context_patient_id()'),
  ('platform.context_person_id()'),
  ('platform.context_purposes()'),
  ('platform.context_role()'),
  ('platform.context_session_id()'),
  ('platform.create_emergency_share_record(uuid,uuid,bytea,text[],timestamp with time zone)'),
  ('platform.create_sos_incident_record(uuid,uuid,double precision,double precision,text,text,text,integer,text)'),
  ('platform.decide_dependent_transition(uuid,integer,text,text,text)'),
  ('platform.dpo_can_review_dsr(uuid,uuid)'),
  ('platform.dsr_subject_person_id(uuid,uuid)'),
  ('platform.family_review_context()'),
  ('platform.feature_enabled(text,text)'),
  ('platform.find_sos_match(double precision,double precision,integer,text,timestamp with time zone)'),
  ('platform.get_discovery_capacity(uuid)'),
  ('platform.get_discovery_facility(uuid)'),
  ('platform.hospital_member_authorized(uuid,uuid,boolean)'),
  ('platform.identity_assigned_to_reviewer(uuid,uuid)'),
  ('platform.person_can_activate_sos(uuid,uuid)'),
  ('platform.person_can_manage_dsr(uuid,uuid)'),
  ('platform.person_can_manage_emergency_contacts(uuid,uuid)'),
  ('platform.person_can_revoke_share(uuid,uuid)'),
  ('platform.person_can_share_incident(uuid,uuid)'),
  ('platform.person_can_share_sos(uuid,uuid)'),
  ('platform.person_has_family_relationship(uuid,uuid,text)'),
  ('platform.person_is_active_dpo(uuid)'),
  ('platform.person_is_active_facility_member(uuid,uuid)'),
  ('platform.person_is_patient_self(uuid,uuid)'),
  ('platform.person_matches_auth_user(uuid,uuid)'),
  ('platform.person_owns_facility(uuid,uuid)'),
  ('platform.person_requires_mandatory_mfa(uuid)'),
  ('platform.processing_inventory_active(text)'),
  ('platform.register_identity_onboarding(uuid,text,text)'),
  ('platform.resolve_person_id(uuid)'),
  ('platform.respond_emergency_contact_invite(bytea,text)'),
  ('platform.revoke_emergency_share(uuid,integer)'),
  ('platform.search_discovery_facilities(double precision,double precision,integer,text,text,text,double precision,uuid,integer)'),
  ('platform.sos_contact_delivery_status(uuid)'),
  ('platform.submit_dependent_transition(uuid,uuid,integer)');

INSERT INTO expected_shifaa_api_functions(function_identity)
SELECT 'platform.auth_session_is_current(uuid,uuid)'
WHERE pg_catalog.to_regprocedure('platform.auth_session_is_current(uuid,uuid)') IS NOT NULL;

DO $test$
DECLARE
  unexpected_api text[];
  missing_api text[];
  unexpected_public text[];
BEGIN
  SELECT pg_catalog.array_agg(p.oid::pg_catalog.regprocedure::text ORDER BY p.oid::pg_catalog.regprocedure::text)
  INTO unexpected_api
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('audit','identity','platform')
    AND pg_catalog.has_function_privilege('shifaa_api',p.oid,'EXECUTE')
    AND NOT EXISTS (
      SELECT 1 FROM expected_shifaa_api_functions expected
      WHERE expected.function_identity=p.oid::pg_catalog.regprocedure::text
    );

  IF unexpected_api IS NOT NULL THEN
    RAISE EXCEPTION 'shifaa_api has unexpected function EXECUTE privileges: %',unexpected_api;
  END IF;

  SELECT pg_catalog.array_agg(expected.function_identity ORDER BY expected.function_identity)
  INTO missing_api
  FROM expected_shifaa_api_functions expected
  WHERE pg_catalog.to_regprocedure(expected.function_identity) IS NULL
     OR NOT pg_catalog.has_function_privilege(
       'shifaa_api',
       pg_catalog.to_regprocedure(expected.function_identity),
       'EXECUTE'
     );

  IF missing_api IS NOT NULL THEN
    RAISE EXCEPTION 'shifaa_api is missing required function EXECUTE privileges: %',missing_api;
  END IF;

  SELECT pg_catalog.array_agg(p.oid::pg_catalog.regprocedure::text ORDER BY p.oid::pg_catalog.regprocedure::text)
  INTO unexpected_public
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('audit','identity','platform')
    AND pg_catalog.has_function_privilege('public',p.oid,'EXECUTE');

  IF unexpected_public IS NOT NULL THEN
    RAISE EXCEPTION 'PUBLIC has unexpected function EXECUTE privileges: %',unexpected_public;
  END IF;
END
$test$;

ROLLBACK;
