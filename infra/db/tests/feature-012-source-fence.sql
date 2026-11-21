\set ON_ERROR_STOP on
\set VERBOSITY verbose

-- Contract probe. The source tables below carry synthetic IDs and revisions only.
-- T013 owns wiring the actual predecessor writers to these transaction primitives.
BEGIN;
CREATE TEMP TABLE source_heads (
  scope_key text NOT NULL,
  member_key text NOT NULL,
  revision bigint NOT NULL CHECK (revision > 0),
  effective_from timestamptz NOT NULL,
  PRIMARY KEY (scope_key, member_key)
);

-- T1 pagination completion and unchanged per-assertion CAS can both hold
-- while the producer set changes. Neither can establish complete-set currentness.
DO $$
DECLARE
  prior_count integer;
  prior_revision bigint;
BEGIN
  SELECT count(*) INTO prior_count FROM source_heads WHERE scope_key = 'patient-A';
  INSERT INTO source_heads VALUES ('patient-A', 'head-1', 1, '2030-01-01T00:00:00Z');
  IF prior_count <> 0 OR (SELECT count(*) FROM source_heads) <> 1 THEN
    RAISE EXCEPTION 'Empty-to-first insert fixture did not change the collection';
  END IF;
  SELECT revision INTO prior_revision FROM source_heads WHERE member_key = 'head-1';
  INSERT INTO source_heads VALUES ('patient-A', 'head-2', 1, '2030-01-01T00:00:00Z');
  IF prior_revision <> (SELECT revision FROM source_heads WHERE member_key = 'head-1')
     OR (SELECT count(*) FROM source_heads WHERE scope_key = 'patient-A') <> 2 THEN
    RAISE EXCEPTION 'Stable per-head CAS failed to demonstrate a changing complete set';
  END IF;
END
$$;

SELECT 'T008 raw member evidence', jsonb_agg(to_jsonb(h) ORDER BY member_key)
FROM source_heads h;

-- At equality an otherwise unchanged future head enters the eligible set.
INSERT INTO source_heads VALUES ('catalog', 'series-1', 1, '2030-01-01T00:01:00Z');
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM source_heads WHERE scope_key = 'catalog'
    AND effective_from <= '2030-01-01T00:00:59Z'
  ) OR NOT EXISTS (
    SELECT FROM source_heads WHERE scope_key = 'catalog'
    AND effective_from <= '2030-01-01T00:01:00Z'
  ) THEN
    RAISE EXCEPTION 'Effective-time eligibility fixture did not change at equality';
  END IF;
END
$$;
SELECT 'T008 raw clock evidence', member_key, revision, effective_from
FROM source_heads WHERE scope_key = 'catalog';

-- Test-first baseline must stop here with 42P01 before T009 installs both tables.
-- Explicit access rather than to_regclass avoids accepting a false green.
SELECT 'T008 admission schema present', count(*) FROM platform.f012_source_admission;
SELECT 'T008 generation schema present', count(*) FROM clinical.safety_source_generations;

INSERT INTO platform.f012_source_admission (deployment_id, admission_epoch)
VALUES ('01000000-0000-4000-8000-000000000001', '02000000-0000-4000-8000-000000000001');

DO $$
DECLARE
  deployment constant uuid := '01000000-0000-4000-8000-000000000001';
  epoch constant uuid := '02000000-0000-4000-8000-000000000001';
  wrong_epoch constant uuid := '02000000-0000-4000-8000-000000000002';
  missing_deployment constant uuid := '01000000-0000-4000-8000-000000000002';
BEGIN
  BEGIN
    INSERT INTO platform.f012_source_admission VALUES (deployment, wrong_epoch);
    RAISE EXCEPTION 'A second admission epoch was accepted for one deployment';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'T008 duplicate deployment denied: %', SQLSTATE;
  END;
  BEGIN
    INSERT INTO clinical.safety_source_generations VALUES
      (deployment, wrong_epoch, 'f011_content_status', 'deployment', '1', 1);
    RAISE EXCEPTION 'Wrong epoch insert succeeded';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'T008 wrong epoch denied: %', SQLSTATE;
  END;
  BEGIN
    INSERT INTO clinical.safety_source_generations VALUES
      (missing_deployment, epoch, 'f011_content_status', 'deployment', '1', 1);
    RAISE EXCEPTION 'Missing admission insert succeeded';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'T008 missing admission denied: %', SQLSTATE;
  END;
  BEGIN
    INSERT INTO clinical.safety_source_generations VALUES
      (deployment, epoch, 'f011_content_status', 'user-filtered-page', '1', 1);
    RAISE EXCEPTION 'Unknown producer scope insert succeeded';
  EXCEPTION WHEN check_violation OR foreign_key_violation THEN
    RAISE NOTICE 'T008 unknown scope denied: %', SQLSTATE;
  END;
  BEGIN
    INSERT INTO clinical.safety_source_generations VALUES
      (deployment, epoch, 'f011_content_status', 'deployment', '1', 0);
    RAISE EXCEPTION 'Nonpositive generation insert succeeded';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'T008 nonpositive generation denied: %', SQLSTATE;
  END;
END
$$;

-- Validate that failed generation advancement rolls the synthetic writer's
-- otherwise valid mutation back within the same subtransaction.
INSERT INTO clinical.safety_source_generations VALUES (
  '01000000-0000-4000-8000-000000000001', '02000000-0000-4000-8000-000000000001',
  'f011_content_status', 'deployment', '1', 9223372036854775807
);
DO $$
BEGIN
  BEGIN
    UPDATE source_heads SET revision = revision + 1 WHERE member_key = 'series-1';
    UPDATE clinical.safety_source_generations SET generation = generation + 1;
    RAISE EXCEPTION 'Counter overflow succeeded';
  EXCEPTION WHEN numeric_value_out_of_range THEN
    RAISE NOTICE 'T008 overflow denied: %', SQLSTATE;
  END;
  IF (SELECT revision FROM source_heads WHERE member_key = 'series-1') <> 1
     OR (SELECT generation FROM clinical.safety_source_generations) <> 9223372036854775807 THEN
    RAISE EXCEPTION 'Failed generation advancement left a partial mutation';
  END IF;
END
$$;
SELECT 'T008 raw rollback evidence', h.revision, g.generation
FROM source_heads h CROSS JOIN clinical.safety_source_generations g
WHERE h.member_key = 'series-1';

-- Read privilege and absence of request-side initialization are tested as the
-- actual service principal, with both session and current user changed.
GRANT SELECT, INSERT, UPDATE ON source_heads TO shifaa_api;
SET SESSION AUTHORIZATION shifaa_api;
DO $$
DECLARE
  deployment constant uuid := '01000000-0000-4000-8000-000000000001';
  epoch constant uuid := '02000000-0000-4000-8000-000000000001';
BEGIN
  BEGIN
    CREATE TEMP TABLE f012_retained_admission AS
      SELECT deployment AS deployment_id, epoch AS admission_epoch, true AS exclusive;
    PERFORM clinical.f012_read_generation_v1(deployment, epoch, 'f011_content_status', 'deployment', '1', true);
    RAISE EXCEPTION 'A caller-owned marker forged retained admission';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'T009 forged marker denied: %', SQLSTATE;
  END;
  BEGIN
    PERFORM platform.f012_lock_admission_v1(deployment, epoch, false);
    BEGIN
      PERFORM platform.f012_lock_admission_v1(deployment, epoch, true);
      RAISE EXCEPTION 'Read admission was upgraded';
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'T009 lock upgrade denied: %', SQLSTATE;
    END;
    BEGIN
      PERFORM clinical.f012_advance_generation_v1(
        deployment, epoch, 'f011_content_status', 'deployment', '1', 9223372036854775807
      );
      RAISE EXCEPTION 'A shared lock permitted advancement';
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'T009 advancement under shared admission denied: %', SQLSTATE;
    END;
    RAISE SQLSTATE 'P1001' USING MESSAGE = 'Roll back the shared admission test savepoint';
  EXCEPTION WHEN SQLSTATE 'P1001' THEN NULL;
  END;
END
$$;
DO $$
DECLARE
  deployment constant uuid := '01000000-0000-4000-8000-000000000001';
  epoch constant uuid := '02000000-0000-4000-8000-000000000001';
  patient_scope constant text := '03000000-0000-4000-8000-000000000001';
BEGIN
  IF EXISTS (
    SELECT FROM pg_catalog.pg_roles WHERE rolname = current_user
    AND (rolsuper OR rolbypassrls OR rolcreaterole)
  ) OR has_table_privilege('platform.f012_source_admission', 'SELECT,INSERT,UPDATE')
     OR has_table_privilege('clinical.safety_source_generations', 'SELECT,INSERT,UPDATE') THEN
    RAISE EXCEPTION 'Application role bypasses the fence';
  END IF;
  BEGIN
    PERFORM platform.f012_lock_admission_v1(
      '01000000-0000-4000-8000-000000000002', epoch, false
    );
    RAISE EXCEPTION 'Unknown deployment succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'T009 missing admission denied: %', SQLSTATE;
  END;
  BEGIN
    PERFORM platform.f012_lock_admission_v1(
      deployment, '02000000-0000-4000-8000-000000000002', true
    );
    RAISE EXCEPTION 'Unknown epoch succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'T009 missing epoch denied: %', SQLSTATE;
  END;
  PERFORM platform.f012_lock_admission_v1(deployment, epoch, true);
  BEGIN
    PERFORM clinical.f012_read_generation_v1(deployment, epoch, 'f011_allergy', patient_scope, '1', true);
    RAISE EXCEPTION 'Uninitialized patient generation succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'T009 missing generation denied: %', SQLSTATE;
  END;
  BEGIN
    PERFORM generation FROM clinical.safety_source_generations;
    RAISE EXCEPTION 'Direct application access succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'T009 direct access denied: %', SQLSTATE;
  END;
  BEGIN
    UPDATE source_heads SET revision = revision + 1 WHERE member_key = 'series-1';
    PERFORM clinical.f012_advance_generation_v1(
      deployment, epoch, 'f011_content_status', 'deployment', '1', 9223372036854775807
    );
    RAISE EXCEPTION 'Failed increment did not raise';
  EXCEPTION WHEN numeric_value_out_of_range THEN
    RAISE NOTICE 'T009 non-owner overflow rolled back source: %', SQLSTATE;
  END;
  IF (SELECT revision FROM source_heads WHERE member_key = 'series-1') <> 1 THEN
    RAISE EXCEPTION 'Failed generation left a partial source mutation';
  END IF;
END
$$;
RESET SESSION AUTHORIZATION;

INSERT INTO clinical.safety_source_generations VALUES (
  '01000000-0000-4000-8000-000000000001', '02000000-0000-4000-8000-000000000001',
  'f011_allergy', '03000000-0000-4000-8000-000000000001', '1', 1
);
SET SESSION AUTHORIZATION shifaa_api;
DO $$
DECLARE
  deployment constant uuid := '01000000-0000-4000-8000-000000000001';
  epoch constant uuid := '02000000-0000-4000-8000-000000000001';
  patient_scope constant text := '03000000-0000-4000-8000-000000000001';
  before_generation bigint;
  after_generation bigint;
BEGIN
  before_generation := clinical.f012_read_generation_v1(
    deployment, epoch, 'f011_allergy', patient_scope, '1', true
  );
  IF before_generation <> 1 OR EXISTS (SELECT FROM source_heads WHERE scope_key = patient_scope) THEN
    RAISE EXCEPTION 'Initialized zero-member scope did not begin at generation 1';
  END IF;
  INSERT INTO source_heads VALUES (patient_scope, 'allergy-first', 1, '2030-01-01T00:00:00Z');
  after_generation := clinical.f012_advance_generation_v1(
    deployment, epoch, 'f011_allergy', patient_scope, '1', before_generation
  );
  IF after_generation <> 2 OR (SELECT count(*) FROM source_heads WHERE scope_key = patient_scope) <> 1 THEN
    RAISE EXCEPTION 'Source insert and generation did not change together';
  END IF;
  BEGIN
    PERFORM clinical.f012_advance_generation_v1(
      deployment, epoch, 'f011_allergy', patient_scope, '1', before_generation
    );
    RAISE EXCEPTION 'Retry advanced an already advanced generation';
  EXCEPTION WHEN serialization_failure THEN
    RAISE NOTICE 'T009 stale generation denied: %', SQLSTATE;
  END;
  RAISE NOTICE 'T009 zero-to-first generation %->%, count=1, role=%', before_generation, after_generation, current_user;
END
$$;
RESET SESSION AUTHORIZATION;

-- Set up a fresh synthetic generation baseline after testing max-bigint rollback.
UPDATE clinical.safety_source_generations SET generation = 7
WHERE producer_key = 'f011_content_status';
SET SESSION AUTHORIZATION shifaa_api;
DO $$
DECLARE
  deployment constant uuid := '01000000-0000-4000-8000-000000000001';
  epoch constant uuid := '02000000-0000-4000-8000-000000000001';
  before_generation bigint;
  after_generation bigint;
  before_count integer;
  after_count integer;
BEGIN
  before_generation := clinical.f012_read_generation_v1(
    deployment, epoch, 'f011_content_status', 'deployment', '1', true
  );
  UPDATE source_heads SET revision = 2 WHERE member_key = 'series-1';
  INSERT INTO source_heads VALUES ('catalog', 'series-2', 1, '2030-01-01T00:02:00Z');
  after_generation := clinical.f012_advance_generation_v1(
    deployment, epoch, 'f011_content_status', 'deployment', '1', before_generation
  );
  SELECT count(*) INTO before_count FROM source_heads
  WHERE scope_key = 'catalog' AND effective_from <= '2030-01-01T00:01:59Z';
  SELECT count(*) INTO after_count FROM source_heads
  WHERE scope_key = 'catalog' AND effective_from <= '2030-01-01T00:02:00Z';
  IF before_generation <> 7 OR after_generation <> 8
    OR before_count <> 1 OR after_count <> 2
    OR (SELECT revision FROM source_heads WHERE member_key = 'series-1') <> 2
    OR clinical.f012_read_generation_v1(
      deployment, epoch, 'f011_content_status', 'deployment', '1', false
    ) <> after_generation
  THEN
    RAISE EXCEPTION 'Missing head/generation change or clock-driven set change';
  END IF;
  RAISE NOTICE 'T008 head revision 1->2, generation %->%; clock-only eligible count %->% at generation %',
    before_generation, after_generation, before_count, after_count, after_generation;
END
$$;
RESET SESSION AUTHORIZATION;

SET SESSION AUTHORIZATION authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM platform.f012_lock_admission_v1(
      '01000000-0000-4000-8000-000000000001', '02000000-0000-4000-8000-000000000001', false
    );
    RAISE EXCEPTION 'An authenticated Data API role took the admitted lock';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'T009 authenticated lock denied: %', SQLSTATE;
  END;
  BEGIN
    EXECUTE 'SET ROLE shifaa_f012_fence_executor';
    RAISE EXCEPTION 'An authenticated role acquired the NOLOGIN executor';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'T009 executor substitution denied: %', SQLSTATE;
  END;
END
$$;
RESET SESSION AUTHORIZATION;

ROLLBACK;
