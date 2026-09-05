BEGIN;

-- C3A forced-RLS/grant fixture. Behavioral actor, AAL, purpose, service, and
-- concurrency cases run through real login sessions in the focused Node runner.
DO $rls$
DECLARE
  parent_failure_count integer;
  child_failure_count integer;
  direct_grant_count integer;
  public_execute_count integer;
BEGIN
  SELECT count(*)::integer
  INTO parent_failure_count
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'audit'
    AND relation.relname IN ('events','signature_evidence','export_batches')
    AND (NOT relation.relrowsecurity OR NOT relation.relforcerowsecurity);

  IF parent_failure_count <> 0 THEN
    RAISE EXCEPTION 'audit parent table RLS/FORCE RLS failures: %',parent_failure_count;
  END IF;

  SELECT count(*)::integer
  INTO child_failure_count
  FROM pg_catalog.pg_inherits AS inheritance
  JOIN pg_catalog.pg_class AS child ON child.oid = inheritance.inhrelid
  WHERE inheritance.inhparent = pg_catalog.to_regclass('audit.events')
    AND (NOT child.relrowsecurity OR NOT child.relforcerowsecurity);

  IF child_failure_count <> 0 THEN
    RAISE EXCEPTION 'audit child partition RLS/FORCE RLS failures: %',child_failure_count;
  END IF;

  SELECT count(*)::integer
  INTO direct_grant_count
  FROM information_schema.role_table_grants
  WHERE table_schema = 'audit'
    AND grantee IN ('PUBLIC','anon','authenticated','service_role','shifaa_api','shifaa_worker');

  IF direct_grant_count <> 0 THEN
    RAISE EXCEPTION 'direct audit table grants detected: %',direct_grant_count;
  END IF;

  SELECT count(*)::integer
  INTO public_execute_count
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    coalesce(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
  ) AS acl
  WHERE namespace.nspname = 'audit'
    AND procedure.proname IN (
      'current_super_admin_context_v1','exact_export_worker_context_v1',
      'worker_claims_export_v1','request_export_v1','claim_export_v1','complete_export_v1'
    )
    AND acl.grantee = 0
    AND acl.privilege_type = 'EXECUTE';

  IF public_execute_count <> 0 THEN
    RAISE EXCEPTION 'PUBLIC can execute an audit authorization boundary';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname IN ('shifaa_api','shifaa_worker')
      AND (rolsuper OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'online role has superuser or BYPASSRLS';
  END IF;
END
$rls$;

DO $grants$
BEGIN
  IF NOT pg_catalog.has_function_privilege(
    'shifaa_api','audit.request_export_v1(text,text,date,date,uuid,text)','EXECUTE'
  ) THEN
    RAISE EXCEPTION 'shifaa_api lacks the one required export-request grant';
  END IF;

  IF pg_catalog.has_function_privilege(
      'shifaa_api','audit.claim_export_v1(text,integer)','EXECUTE'
    ) OR pg_catalog.has_function_privilege(
      'shifaa_api','audit.complete_export_v1(uuid,text,text,bytea,jsonb,text,timestamptz)','EXECUTE'
    ) OR pg_catalog.has_function_privilege(
      'shifaa_worker','audit.request_export_v1(text,text,date,date,uuid,text)','EXECUTE'
    ) THEN
    RAISE EXCEPTION 'API/worker function separation failed';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
      'shifaa_worker','audit.claim_export_v1(text,integer)','EXECUTE'
    ) OR NOT pg_catalog.has_function_privilege(
      'shifaa_worker','audit.complete_export_v1(uuid,text,text,bytea,jsonb,text,timestamptz)','EXECUTE'
    ) THEN
    RAISE EXCEPTION 'worker lacks its minimum claim/complete grants';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'audit'
      AND procedure.proname IN (
        'current_super_admin_context_v1','exact_export_worker_context_v1',
        'worker_claims_export_v1','request_export_v1','claim_export_v1','complete_export_v1'
      )
      AND procedure.proconfig @> ARRAY['search_path=pg_catalog']
  ) <> 6 THEN
    RAISE EXCEPTION 'authorization boundary search_path is not fixed';
  END IF;
END
$grants$;

-- SET ROLE cannot satisfy the functions' direct-login session_user contract.
-- It must still prove that direct SQL is unavailable to both online roles.
SET LOCAL ROLE shifaa_api;
DO $api_direct$
BEGIN
  BEGIN
    PERFORM 1 FROM audit.events LIMIT 1;
    RAISE EXCEPTION 'shifaa_api direct audit.events read was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM audit.signature_evidence LIMIT 1;
    RAISE EXCEPTION 'shifaa_api direct signature read was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM audit.export_batches LIMIT 1;
    RAISE EXCEPTION 'shifaa_api direct export read was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$api_direct$;
RESET ROLE;

SET LOCAL ROLE shifaa_worker;
DO $worker_direct$
BEGIN
  BEGIN
    PERFORM 1 FROM audit.events LIMIT 1;
    RAISE EXCEPTION 'shifaa_worker direct audit.events read was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM audit.signature_evidence LIMIT 1;
    RAISE EXCEPTION 'shifaa_worker direct signature read was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM audit.export_batches LIMIT 1;
    RAISE EXCEPTION 'shifaa_worker direct export read was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$worker_direct$;
RESET ROLE;

ROLLBACK;
