\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION platform.context_person_id() RETURNS uuid
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT nullif(current_setting('shifaa.person_id', true), '')::uuid
$$;
CREATE OR REPLACE FUNCTION platform.context_role() RETURNS text
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT nullif(current_setting('shifaa.actor_role', true), '')
$$;
CREATE OR REPLACE FUNCTION platform.context_aal() RETURNS integer
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT coalesce(nullif(current_setting('shifaa.aal', true), '')::integer, 0)
$$;
CREATE OR REPLACE FUNCTION platform.context_purposes() RETURNS text[]
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT coalesce(string_to_array(nullif(current_setting('shifaa.purposes', true), ''), ','), ARRAY[]::text[])
$$;

CREATE OR REPLACE FUNCTION platform.case_owner_is_other(p_identity_id uuid, p_actor_person_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT EXISTS (
    SELECT 1 FROM identity.identities own
    WHERE own.id = p_identity_id AND own.person_id <> p_actor_person_id
  )
$$;
REVOKE ALL ON FUNCTION platform.case_owner_is_other(uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION platform.identity_assigned_to_reviewer(p_identity_id uuid, p_reviewer_person_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT EXISTS (
    SELECT 1 FROM identity.verification_cases c
    JOIN identity.identities own ON own.id = c.identity_id
    WHERE c.identity_id = p_identity_id
      AND c.assigned_reviewer_person_id = p_reviewer_person_id
      AND own.person_id <> p_reviewer_person_id
  )
$$;
REVOKE ALL ON FUNCTION platform.identity_assigned_to_reviewer(uuid, uuid) FROM PUBLIC;

GRANT USAGE ON SCHEMA identity, consent, platform, audit TO shifaa_api;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA identity TO shifaa_api;
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA consent TO shifaa_api;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA platform TO shifaa_api;
GRANT DELETE ON platform.idempotency_records TO shifaa_api;
GRANT INSERT ON ALL TABLES IN SCHEMA audit TO shifaa_api;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA platform, identity TO shifaa_api;

ALTER TABLE identity.people ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.people FORCE ROW LEVEL SECURITY;
ALTER TABLE identity.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.patients FORCE ROW LEVEL SECURITY;
ALTER TABLE identity.care_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.care_relationships FORCE ROW LEVEL SECURITY;
ALTER TABLE identity.identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.identities FORCE ROW LEVEL SECURITY;
ALTER TABLE identity.verification_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.verification_cases FORCE ROW LEVEL SECURITY;
ALTER TABLE consent.records ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent.records FORCE ROW LEVEL SECURITY;
ALTER TABLE consent.notice_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent.notice_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE consent.purpose_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent.purpose_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE consent.processing_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent.processing_inventory FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.idempotency_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.idempotency_records FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.outbox_events FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.event_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.event_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE audit.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS people_self_select ON identity.people;
CREATE POLICY people_self_select ON identity.people FOR SELECT TO shifaa_api
  USING (id = platform.context_person_id() AND platform.context_role() = 'PAT');
DROP POLICY IF EXISTS people_self_update ON identity.people;
CREATE POLICY people_self_update ON identity.people FOR UPDATE TO shifaa_api
  USING (id = platform.context_person_id() AND platform.context_role() = 'PAT')
  WITH CHECK (id = platform.context_person_id() AND platform.context_role() = 'PAT');

DROP POLICY IF EXISTS patients_self_select ON identity.patients;
CREATE POLICY patients_self_select ON identity.patients FOR SELECT TO shifaa_api
  USING (person_id = platform.context_person_id() AND platform.context_role() = 'PAT');

DROP POLICY IF EXISTS relationships_self_select ON identity.care_relationships;
CREATE POLICY relationships_self_select ON identity.care_relationships FOR SELECT TO shifaa_api
  USING (actor_person_id = platform.context_person_id() AND relationship_type = 'self' AND platform.context_role() = 'PAT');

DROP POLICY IF EXISTS identities_self_select ON identity.identities;
CREATE POLICY identities_self_select ON identity.identities FOR SELECT TO shifaa_api
  USING (
    (person_id = platform.context_person_id() AND platform.context_role() = 'PAT')
    OR (
      platform.context_role() = 'ADM-FACILITY'
      AND platform.context_aal() >= 2
      AND 'identity.review' = ANY(platform.context_purposes())
      AND platform.identity_assigned_to_reviewer(id, platform.context_person_id())
    )
    OR (platform.context_role() = 'SYS' AND 'identity.provider_callback' = ANY(platform.context_purposes()))
  );
DROP POLICY IF EXISTS identities_self_insert ON identity.identities;
CREATE POLICY identities_self_insert ON identity.identities FOR INSERT TO shifaa_api
  WITH CHECK (person_id = platform.context_person_id() AND platform.context_role() = 'PAT');
DROP POLICY IF EXISTS identities_review_update ON identity.identities;
CREATE POLICY identities_review_update ON identity.identities FOR UPDATE TO shifaa_api
  USING (
    (platform.context_role() = 'ADM-FACILITY' AND platform.context_aal() >= 2
      AND 'identity.review' = ANY(platform.context_purposes())
      AND platform.identity_assigned_to_reviewer(id, platform.context_person_id()))
    OR (platform.context_role() = 'SYS' AND 'identity.provider_callback' = ANY(platform.context_purposes()))
  )
  WITH CHECK (
    (platform.context_role() = 'ADM-FACILITY' AND platform.context_aal() >= 2
      AND 'identity.review' = ANY(platform.context_purposes())
      AND platform.identity_assigned_to_reviewer(id, platform.context_person_id()))
    OR (platform.context_role() = 'SYS' AND 'identity.provider_callback' = ANY(platform.context_purposes()))
  );

DROP POLICY IF EXISTS cases_subject_or_reviewer_select ON identity.verification_cases;
CREATE POLICY cases_subject_or_reviewer_select ON identity.verification_cases FOR SELECT TO shifaa_api
  USING (
    EXISTS (SELECT 1 FROM identity.identities i WHERE i.id = identity_id AND i.person_id = platform.context_person_id() AND platform.context_role() = 'PAT')
    OR (
      platform.context_role() = 'ADM-FACILITY'
      AND platform.context_aal() >= 2
      AND 'identity.review' = ANY(platform.context_purposes())
      AND assigned_reviewer_person_id = platform.context_person_id()
      AND platform.case_owner_is_other(identity_id, platform.context_person_id())
    )
    OR (platform.context_role() = 'SYS' AND 'identity.provider_callback' = ANY(platform.context_purposes()))
  );
DROP POLICY IF EXISTS cases_subject_insert ON identity.verification_cases;
CREATE POLICY cases_subject_insert ON identity.verification_cases FOR INSERT TO shifaa_api
  WITH CHECK (EXISTS (SELECT 1 FROM identity.identities i WHERE i.id = identity_id AND i.person_id = platform.context_person_id() AND platform.context_role() = 'PAT'));
DROP POLICY IF EXISTS cases_reviewer_update ON identity.verification_cases;
CREATE POLICY cases_reviewer_update ON identity.verification_cases FOR UPDATE TO shifaa_api
  USING (
    platform.context_role() = 'ADM-FACILITY'
    AND platform.context_aal() >= 2
    AND 'identity.review' = ANY(platform.context_purposes())
    AND assigned_reviewer_person_id = platform.context_person_id()
    AND platform.case_owner_is_other(identity_id, platform.context_person_id())
    OR (platform.context_role() = 'SYS' AND 'identity.provider_callback' = ANY(platform.context_purposes()))
  )
  WITH CHECK (
    (reviewer_person_id = platform.context_person_id()
    AND platform.case_owner_is_other(identity_id, platform.context_person_id()))
    OR (platform.context_role() = 'SYS' AND 'identity.provider_callback' = ANY(platform.context_purposes()))
  );

DROP POLICY IF EXISTS consent_self_select ON consent.records;
CREATE POLICY consent_self_select ON consent.records FOR SELECT TO shifaa_api
  USING (person_id = platform.context_person_id() AND platform.context_role() = 'PAT');
DROP POLICY IF EXISTS consent_self_insert ON consent.records;
CREATE POLICY consent_self_insert ON consent.records FOR INSERT TO shifaa_api
  WITH CHECK (person_id = platform.context_person_id() AND platform.context_role() = 'PAT');

DROP POLICY IF EXISTS notices_public_read ON consent.notice_versions;
CREATE POLICY notices_public_read ON consent.notice_versions FOR SELECT TO shifaa_api USING (retired_at IS NULL AND effective_at <= now());
DROP POLICY IF EXISTS purposes_public_read ON consent.purpose_versions;
CREATE POLICY purposes_public_read ON consent.purpose_versions FOR SELECT TO shifaa_api USING (retired_at IS NULL AND effective_at <= now());
DROP POLICY IF EXISTS inventory_active_read ON consent.processing_inventory;
CREATE POLICY inventory_active_read ON consent.processing_inventory FOR SELECT TO shifaa_api USING (status = 'active');

DROP POLICY IF EXISTS idempotency_principal_access ON platform.idempotency_records;
CREATE POLICY idempotency_principal_access ON platform.idempotency_records TO shifaa_api
  USING (principal = coalesce(current_setting('shifaa.principal', true), ''))
  WITH CHECK (principal = coalesce(current_setting('shifaa.principal', true), ''));
DROP POLICY IF EXISTS outbox_api_insert ON platform.outbox_events;
CREATE POLICY outbox_api_insert ON platform.outbox_events FOR INSERT TO shifaa_api WITH CHECK (true);
DROP POLICY IF EXISTS audit_api_insert ON audit.events;
CREATE POLICY audit_api_insert ON audit.events FOR INSERT TO shifaa_api WITH CHECK (true);
