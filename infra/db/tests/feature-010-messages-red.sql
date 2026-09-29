-- C22 RED probe: existing message storage and C07 authorization must be
-- present before exercising the new authorized page boundary.
DO $feature_010_c22_red$
DECLARE
  messages_exist boolean;
  row_security_enabled boolean;
  row_security_forced boolean;
  missing_boundaries text[] := ARRAY[]::text[];
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class relation
    JOIN pg_catalog.pg_namespace schema ON schema.oid=relation.relnamespace
    WHERE schema.nspname='trust' AND relation.relname='messages'
  ) INTO messages_exist;
  IF NOT messages_exist THEN
    RAISE EXCEPTION 'F010_C22_FIXTURE_ERROR: trust.messages is missing';
  END IF;

  SELECT relation.relrowsecurity,relation.relforcerowsecurity
    INTO row_security_enabled,row_security_forced
  FROM pg_catalog.pg_class relation
  JOIN pg_catalog.pg_namespace schema ON schema.oid=relation.relnamespace
  WHERE schema.nspname='trust' AND relation.relname='messages';
  IF NOT row_security_enabled OR NOT row_security_forced THEN
    RAISE EXCEPTION 'F010_C22_FIXTURE_ERROR: trust.messages is not forced-RLS protected';
  END IF;
  IF pg_catalog.to_regprocedure('trust.feature_010_context_messages_projection_v1(uuid)') IS NULL THEN
    RAISE EXCEPTION 'F010_C22_FIXTURE_ERROR: C07 authorized message projection is missing';
  END IF;

  BEGIN
    EXECUTE 'SELECT trust.list_context_messages_api_v1(NULL::uuid,NULL::timestamptz,NULL::uuid,1)';
  EXCEPTION WHEN undefined_function THEN
    missing_boundaries := pg_catalog.array_append(
      missing_boundaries,
      'F010_C22_MISSING_API: trust.list_context_messages_api_v1(uuid,timestamptz,uuid,integer)'
    );
  END;

  BEGIN
    EXECUTE 'SELECT trust.send_context_message_api_v1(NULL::uuid,''{}''::jsonb)';
  EXCEPTION WHEN undefined_function THEN
    missing_boundaries := pg_catalog.array_append(
      missing_boundaries,
      'F010_C22_MISSING_API: trust.send_context_message_api_v1(uuid,jsonb)'
    );
  END;

  IF pg_catalog.cardinality(missing_boundaries)>0 THEN
    RAISE EXCEPTION '%',pg_catalog.array_to_string(missing_boundaries,'; ');
  END IF;
END
$feature_010_c22_red$;
