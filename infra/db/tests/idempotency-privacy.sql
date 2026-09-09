\set ON_ERROR_STOP on

BEGIN;

DO $test$
DECLARE
  unexpected_columns text[];
  missing_columns text[];
BEGIN
  SELECT pg_catalog.array_agg(column_name ORDER BY column_name)
  INTO unexpected_columns
  FROM information_schema.columns
  WHERE table_schema = 'platform'
    AND table_name = 'idempotency_records'
    AND column_name IN ('principal', 'route', 'idempotency_key');

  IF unexpected_columns IS NOT NULL THEN
    RAISE EXCEPTION 'raw idempotency scope columns remain: %', unexpected_columns;
  END IF;

  SELECT pg_catalog.array_agg(expected.column_name ORDER BY expected.column_name)
  INTO missing_columns
  FROM unnest(ARRAY['principal_type', 'principal_hash', 'route_template', 'key_hash'])
    AS expected(column_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns actual
    WHERE actual.table_schema = 'platform'
      AND actual.table_name = 'idempotency_records'
      AND actual.column_name = expected.column_name
      AND actual.is_nullable = 'NO'
  );

  IF missing_columns IS NOT NULL THEN
    RAISE EXCEPTION 'canonical idempotency scope columns missing or nullable: %', missing_columns;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint constraint_row
    JOIN pg_catalog.pg_class table_row ON table_row.oid = constraint_row.conrelid
    JOIN pg_catalog.pg_namespace schema_row ON schema_row.oid = table_row.relnamespace
    WHERE schema_row.nspname = 'platform'
      AND table_row.relname = 'idempotency_records'
      AND constraint_row.contype = 'u'
      AND pg_catalog.pg_get_constraintdef(constraint_row.oid) =
        'UNIQUE (principal_type, principal_hash, method, route_template, key_hash)'
  ) THEN
    RAISE EXCEPTION 'canonical idempotency scope uniqueness is missing';
  END IF;
END
$test$;

INSERT INTO platform.idempotency_records(
  principal_type,
  principal_hash,
  method,
  route_template,
  key_hash,
  request_hash,
  state,
  expires_at
) VALUES (
  'sha256-v1',
  repeat('a', 64),
  'POST',
  '/v1/security/sec-008-regression',
  repeat('b', 64),
  repeat('c', 64),
  'processing',
  pg_catalog.now() + interval '15 minutes'
);

DO $test$
BEGIN
  BEGIN
    INSERT INTO platform.idempotency_records(
      principal_type, principal_hash, method, route_template, key_hash,
      request_hash, state, expires_at
    ) VALUES (
      'sha256-v1', repeat('a', 64), 'POST', '/v1/security/sec-008-regression',
      repeat('b', 64), repeat('9', 64), 'processing', pg_catalog.now() + interval '15 minutes'
    );
    RAISE EXCEPTION 'duplicate persisted idempotency scope was accepted';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO platform.idempotency_records(
      principal_type, principal_hash, method, route_template, key_hash,
      request_hash, state, expires_at
    ) VALUES (
      'sha256-v1', 'raw-principal', 'POST', '/v1/security/sec-008-regression',
      repeat('d', 64), repeat('e', 64), 'processing', pg_catalog.now() + interval '15 minutes'
    );
    RAISE EXCEPTION 'non-digest principal storage was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO platform.idempotency_records(
      principal_type, principal_hash, method, route_template, key_hash,
      request_hash, state, expires_at
    ) VALUES (
      'sha256-v1', repeat('f', 64), 'POST', '/v1/security/sec-008-regression',
      'raw-idempotency-key', repeat('1', 64), 'processing', pg_catalog.now() + interval '15 minutes'
    );
    RAISE EXCEPTION 'non-digest idempotency key storage was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END
$test$;

SET LOCAL ROLE shifaa_api;
SELECT set_config('shifaa.principal_hash', repeat('a', 64), true);

DO $test$
DECLARE
  visible_count integer;
BEGIN
  SELECT count(*)::integer
  INTO visible_count
  FROM platform.idempotency_records
  WHERE route_template = '/v1/security/sec-008-regression';

  IF visible_count <> 1 THEN
    RAISE EXCEPTION 'matching digest-scoped API context saw % idempotency rows', visible_count;
  END IF;

  PERFORM set_config('shifaa.principal_hash', repeat('f', 64), true);

  SELECT count(*)::integer
  INTO visible_count
  FROM platform.idempotency_records
  WHERE route_template = '/v1/security/sec-008-regression';

  IF visible_count <> 0 THEN
    RAISE EXCEPTION 'mismatched digest-scoped API context crossed idempotency RLS';
  END IF;
END
$test$;

RESET ROLE;

ROLLBACK;
