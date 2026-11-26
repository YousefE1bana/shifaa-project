-- NAC-1 retains the existing native rows on the calling transaction.
-- This migration exposes no route, provisions no admission, and activates no feature.
BEGIN;

CREATE ROLE shifaa_f012_native_executor NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOINHERIT NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA platform, identity TO shifaa_f012_native_executor;
GRANT SELECT (id, user_id) ON identity.people TO shifaa_f012_native_executor;
CREATE POLICY f012_native_bound_person ON identity.people
  FOR SELECT TO shifaa_f012_native_executor USING (
    id = NULLIF(pg_catalog.current_setting('shifaa.person_id', true), '')::uuid
    AND user_id = NULLIF(pg_catalog.current_setting('shifaa.principal', true), '')::uuid
  );

-- Reuse the existing fence executor's retained-tuple proof. The native
-- executor can call it but cannot take or mutate the admission row itself.
ALTER FUNCTION platform.f012_require_retained_admission_v1(uuid, uuid, boolean)
  SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION platform.f012_require_retained_admission_v1(uuid, uuid, boolean)
  TO shifaa_f012_native_executor;

DO $migration$
BEGIN
  -- The plain PostgreSQL verifier has no native session schema. The helper
  -- denies there and cannot be used until installed against the real schema.
  IF pg_catalog.to_regclass('auth.sessions') IS NULL THEN
    RETURN;
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_class c
      WHERE c.oid IN ('auth.users'::regclass, 'auth.sessions'::regclass)
        AND c.relrowsecurity
        AND c.relowner <> 'shifaa_f012_native_executor'::regrole) <> 2 THEN
    RAISE EXCEPTION 'NAC-1 requires the supported native Auth RLS boundary';
  END IF;
  GRANT USAGE ON SCHEMA auth TO shifaa_f012_native_executor;
  GRANT SELECT (id, instance_id, banned_until, deleted_at), UPDATE (id)
    ON auth.users TO shifaa_f012_native_executor;
  GRANT SELECT (id, user_id, aal, not_after), UPDATE (id)
    ON auth.sessions TO shifaa_f012_native_executor;
  CREATE POLICY f012_native_user_select ON auth.users
    FOR SELECT TO shifaa_f012_native_executor USING (
      id = NULLIF(pg_catalog.current_setting('shifaa.f012_bound_subject', true), '')::uuid
    );
  CREATE POLICY f012_native_user_lock ON auth.users
    FOR UPDATE TO shifaa_f012_native_executor USING (
      id = NULLIF(pg_catalog.current_setting('shifaa.f012_bound_subject', true), '')::uuid
    ) WITH CHECK (false);
  CREATE POLICY f012_native_session_select ON auth.sessions
    FOR SELECT TO shifaa_f012_native_executor USING (
      id = NULLIF(pg_catalog.current_setting('shifaa.f012_bound_session', true), '')::uuid
      AND user_id = NULLIF(pg_catalog.current_setting('shifaa.f012_bound_subject', true), '')::uuid
    );
  CREATE POLICY f012_native_session_lock ON auth.sessions
    FOR UPDATE TO shifaa_f012_native_executor USING (
      id = NULLIF(pg_catalog.current_setting('shifaa.f012_bound_session', true), '')::uuid
      AND user_id = NULLIF(pg_catalog.current_setting('shifaa.f012_bound_subject', true), '')::uuid
    ) WITH CHECK (false);
END
$migration$;

CREATE FUNCTION platform.f012_retain_native_authority_v1(
  p_deployment uuid, p_epoch uuid, p_instance uuid,
  p_subject uuid, p_session uuid, p_person uuid, p_claimed_aal integer,
  p_expires_at bigint, p_totp_at bigint, p_profile text,
  p_action text, p_facility uuid, p_purpose text, p_case uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $guard$
DECLARE
  bound_user record;
  bound_session record;
  action_clock timestamptz;
  action_seconds bigint;
  actor_role text := NULLIF(pg_catalog.current_setting('shifaa.actor_role', true), '');
BEGIN
  IF session_user <> 'shifaa_api'
    OR pg_catalog.current_setting('transaction_isolation') <> 'read committed'
    OR p_instance IS NULL OR p_subject IS NULL OR p_session IS NULL OR p_person IS NULL
    OR p_claimed_aal IS NULL OR p_claimed_aal NOT IN (1, 2) OR p_expires_at IS NULL
    OR NULLIF(p_action, '') IS NULL OR NULLIF(p_purpose, '') IS NULL
    OR NULLIF(pg_catalog.current_setting('shifaa.person_id', true), '') IS DISTINCT FROM p_person::text
    OR NULLIF(pg_catalog.current_setting('shifaa.session_id', true), '') IS DISTINCT FROM p_session::text
    OR NULLIF(pg_catalog.current_setting('shifaa.principal', true), '') IS DISTINCT FROM p_subject::text
    OR NULLIF(pg_catalog.current_setting('shifaa.aal', true), '') IS DISTINCT FROM p_claimed_aal::text
    OR NULLIF(pg_catalog.current_setting('shifaa.action', true), '') IS DISTINCT FROM p_action
    OR NULLIF(pg_catalog.current_setting('shifaa.facility_id', true), '') IS DISTINCT FROM p_facility::text
    OR NULLIF(pg_catalog.current_setting('shifaa.case_id', true), '') IS DISTINCT FROM p_case::text
    OR (p_purpose = ANY(pg_catalog.string_to_array(
          pg_catalog.current_setting('shifaa.purposes', true), ','
        ))) IS NOT TRUE
    OR (CASE p_profile
      WHEN 'workforce_sensitive' THEN
        actor_role IS NULL OR actor_role NOT IN ('CLN', 'PHA') OR p_facility IS NULL
        OR p_claimed_aal <> 2 OR p_totp_at IS NULL
      WHEN 'subject_projection_read' THEN
        actor_role IS DISTINCT FROM 'PAT'
        OR p_action NOT IN ('getPrescription', 'listPatientMedications')
      ELSE true
    END)
  THEN
    RAISE EXCEPTION 'NAC-1 current authority denied' USING ERRCODE = '42501';
  END IF;

  PERFORM platform.f012_require_retained_admission_v1(p_deployment, p_epoch, false);
  IF pg_catalog.to_regclass('auth.sessions') IS NULL THEN
    RAISE EXCEPTION 'NAC-1 native schema unavailable' USING ERRCODE = '55000';
  END IF;
  PERFORM 1 FROM identity.people WHERE id = p_person AND user_id = p_subject;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NAC-1 current authority denied' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_catalog.set_config('shifaa.f012_bound_subject', p_subject::text, true);
  PERFORM pg_catalog.set_config('shifaa.f012_bound_session', p_session::text, true);
  SELECT u.instance_id, u.deleted_at, u.banned_until INTO bound_user
    FROM auth.users u WHERE u.id = p_subject FOR SHARE;
  IF NOT FOUND OR bound_user.instance_id IS DISTINCT FROM p_instance
    OR bound_user.deleted_at IS NOT NULL
    OR bound_user.banned_until > pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'NAC-1 current authority denied' USING ERRCODE = '42501';
  END IF;
  SELECT s.aal, s.not_after INTO bound_session
    FROM auth.sessions s WHERE s.id = p_session AND s.user_id = p_subject FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NAC-1 current authority denied' USING ERRCODE = '42501';
  END IF;
  action_clock := pg_catalog.clock_timestamp();
  action_seconds := pg_catalog.floor(EXTRACT(EPOCH FROM action_clock))::bigint;
  IF bound_session.aal::text IS DISTINCT FROM ('aal' || p_claimed_aal::text)
    OR bound_session.not_after <= action_clock OR p_expires_at <= action_seconds
    OR (p_profile = 'workforce_sensitive'
      AND (p_totp_at > action_seconds OR p_totp_at < action_seconds - 300))
  THEN
    RAISE EXCEPTION 'NAC-1 current authority denied' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_catalog.set_config('shifaa.f012_bound_subject', '', true);
  PERFORM pg_catalog.set_config('shifaa.f012_bound_session', '', true);
END
$guard$;

REVOKE ALL ON FUNCTION platform.f012_retain_native_authority_v1(
  uuid, uuid, uuid, uuid, uuid, uuid, integer, bigint, bigint, text, text, uuid, text, uuid
) FROM PUBLIC;
DO $migration$
DECLARE
  client_role name;
BEGIN
  FOR client_role IN SELECT rolname FROM pg_catalog.pg_roles
    WHERE rolname IN ('anon', 'authenticated', 'service_role', 'shifaa_worker')
  LOOP
    EXECUTE pg_catalog.format(
      'REVOKE ALL ON FUNCTION platform.f012_retain_native_authority_v1(uuid,uuid,uuid,uuid,uuid,uuid,integer,bigint,bigint,text,text,uuid,text,uuid) FROM %I',
      client_role
    );
  END LOOP;
END
$migration$;
GRANT CREATE ON SCHEMA platform TO shifaa_f012_native_executor;
ALTER FUNCTION platform.f012_retain_native_authority_v1(
  uuid, uuid, uuid, uuid, uuid, uuid, integer, bigint, bigint, text, text, uuid, text, uuid
) OWNER TO shifaa_f012_native_executor;
REVOKE CREATE ON SCHEMA platform FROM shifaa_f012_native_executor;
GRANT EXECUTE ON FUNCTION platform.f012_retain_native_authority_v1(
  uuid, uuid, uuid, uuid, uuid, uuid, integer, bigint, bigint, text, text, uuid, text, uuid
) TO shifaa_api;

COMMIT;
