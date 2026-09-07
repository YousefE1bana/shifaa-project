BEGIN;

-- C3A database fixture: exercise the committed C2 schema against real
-- PostgreSQL objects. All rows are synthetic and rolled back.
DO $schema$
DECLARE
  relation_kind "char";
  bad_partition_count integer;
BEGIN
  SELECT relation.relkind
  INTO relation_kind
  FROM pg_catalog.pg_class AS relation
  WHERE relation.oid = pg_catalog.to_regclass('audit.events');

  IF relation_kind IS DISTINCT FROM 'p'::"char" THEN
    RAISE EXCEPTION 'audit.events must remain range partitioned';
  END IF;

  SELECT count(*)::integer
  INTO bad_partition_count
  FROM pg_catalog.pg_inherits AS inheritance
  JOIN pg_catalog.pg_class AS child ON child.oid = inheritance.inhrelid
  WHERE inheritance.inhparent = pg_catalog.to_regclass('audit.events')
    AND (
      NOT child.relrowsecurity
      OR NOT child.relforcerowsecurity
      OR pg_catalog.pg_get_expr(child.relpartbound,child.oid) !~
        'FROM \(''[0-9]{4}-[0-9]{2}-01 00:00:00\+00''\) TO \(''[0-9]{4}-[0-9]{2}-01 00:00:00\+00''\)'
    );

  IF bad_partition_count <> 0 THEN
    RAISE EXCEPTION 'monthly UTC partition/RLS invariant failed for % partition(s)',
      bad_partition_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles AS role_row
    WHERE role_row.rolname IN ('shifaa_api','shifaa_worker')
      AND (role_row.rolsuper OR role_row.rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'online roles must remain non-superuser and non-BYPASSRLS';
  END IF;
END
$schema$;

INSERT INTO identity.people(id,user_id,display_name,profile_status)
VALUES(
  '81500000-0000-4000-8000-000000000001',
  '81500000-0000-4000-9000-000000000001',
  'Synthetic C3A Schema Actor',
  'active'
);

SELECT pg_catalog.set_config('shifaa.environment','local',true);

SELECT pg_catalog.set_config('shifaa.test_now','2026-05-01T00:00:00Z',true);
CREATE TEMP TABLE f008_boundary_events AS
SELECT 'may_lower'::text AS boundary_name,event.*
FROM audit.append_event_v1(
  '81500000-0000-4000-8000-000000000011'::uuid,'trace-008-boundary-may-lower',
  'audit.boundary_test','audit_event','success',NULL::uuid,
  '81500000-0000-4000-8000-000000000001'::uuid,2::smallint,NULL::uuid,NULL::uuid,
  'audit_review',NULL::uuid,NULL::integer,NULL::text,NULL::inet,'system'
) AS event;

SELECT pg_catalog.set_config(
  'shifaa.test_now','2026-05-31T23:59:59.999999Z',true
);
INSERT INTO f008_boundary_events
SELECT 'may_upper'::text,event.*
FROM audit.append_event_v1(
  '81500000-0000-4000-8000-000000000012'::uuid,'trace-008-boundary-may-upper',
  'audit.boundary_test','audit_event','success',NULL::uuid,
  '81500000-0000-4000-8000-000000000001'::uuid,2::smallint,NULL::uuid,NULL::uuid,
  'audit_review',NULL::uuid,NULL::integer,NULL::text,NULL::inet,'system'
) AS event;

SELECT pg_catalog.set_config('shifaa.test_now','2026-06-01T00:00:00Z',true);
INSERT INTO f008_boundary_events
SELECT 'june_lower'::text,event.*
FROM audit.append_event_v1(
  '81500000-0000-4000-8000-000000000013'::uuid,'trace-008-boundary-june-lower',
  'audit.boundary_test','audit_event','success',NULL::uuid,
  '81500000-0000-4000-8000-000000000001'::uuid,2::smallint,NULL::uuid,NULL::uuid,
  'audit_review',NULL::uuid,NULL::integer,NULL::text,NULL::inet,'system'
) AS event;

DO $boundaries$
DECLARE
  may_verification record;
  june_verification record;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM f008_boundary_events AS fixture
    JOIN audit.events AS event
      ON event.id = fixture.event_id
     AND event.occurred_at = fixture.event_occurred_at
    WHERE (fixture.boundary_name LIKE 'may%' AND event.tableoid <> 'audit.events_2026_05'::regclass)
       OR (fixture.boundary_name = 'june_lower' AND event.tableoid <> 'audit.events_2026_06'::regclass)
  ) THEN
    RAISE EXCEPTION 'UTC partition boundary routed an event to the wrong child';
  END IF;

  SELECT * INTO may_verification FROM audit.verify_event_chain_v1('2026-05-01');
  SELECT * INTO june_verification FROM audit.verify_event_chain_v1('2026-06-01');
  IF NOT may_verification.valid OR may_verification.checked_count <> 2 THEN
    RAISE EXCEPTION 'May boundary chain invalid: %',may_verification;
  END IF;
  IF NOT june_verification.valid OR june_verification.checked_count <> 1 THEN
    RAISE EXCEPTION 'June boundary chain invalid: %',june_verification;
  END IF;

  BEGIN
    UPDATE audit.events
    SET reason_code = 'forbidden_mutation'
    WHERE partition_key = '2026-05-01' AND chain_sequence = 1;
    RAISE EXCEPTION 'audit event update was accepted';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;

  BEGIN
    DELETE FROM audit.events
    WHERE partition_key = '2026-05-01' AND chain_sequence = 1;
    RAISE EXCEPTION 'audit event delete was accepted';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;
END
$boundaries$;

INSERT INTO audit.signature_evidence(
  resource_type,resource_id,resource_version,signer_person_id,signer_role,
  decision,artifact_digest,audit_event_id,audit_event_occurred_at
)
SELECT
  'audit_export','81500000-0000-4000-8000-000000000021',1,
  '81500000-0000-4000-8000-000000000001','super_admin','approved',
  pg_catalog.decode(pg_catalog.repeat('a5',32),'hex'),
  fixture.event_id,fixture.event_occurred_at
FROM f008_boundary_events AS fixture
WHERE fixture.boundary_name = 'may_lower';

DO $append_only$
BEGIN
  BEGIN
    UPDATE audit.signature_evidence SET decision = 'rejected';
    RAISE EXCEPTION 'signature evidence update was accepted';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;

  BEGIN
    DELETE FROM audit.signature_evidence;
    RAISE EXCEPTION 'signature evidence delete was accepted';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;
END
$append_only$;

INSERT INTO audit.export_batches(
  id,requested_by_person_id,purpose_code,partition_start,partition_end_exclusive,
  status,created_at,updated_at
) VALUES(
  '81500000-0000-4000-8000-000000000031',
  '81500000-0000-4000-8000-000000000001','security.audit.review',
  '2026-05-01','2026-07-01','queued','2026-09-01T00:00:00Z','2026-09-01T00:00:00Z'
);

UPDATE audit.export_batches
SET status = 'claimed',
    object_key = 'audit-exports/c3a-schema-fixture.jsonl',
    lease_owner = 'worker-008-schema',
    lease_expires_at = '2026-09-01T00:05:00Z',
    attempt_count = 1,
    updated_at = '2026-09-01T00:01:00Z',
    version = 2
WHERE id = '81500000-0000-4000-8000-000000000031';

UPDATE audit.export_batches
SET status = 'proven',
    object_digest = audit.sha256_v1(pg_catalog.convert_to('synthetic-c3a-schema','UTF8')),
    retention_proof = '{"proof_version":1,"proof_class":"synthetic_write_once","verified_at":"2026-09-01T00:02:00Z"}'::jsonb,
    exported_at = '2026-09-01T00:02:00Z',
    lease_owner = NULL,
    lease_expires_at = NULL,
    updated_at = '2026-09-01T00:02:00Z',
    version = 3
WHERE id = '81500000-0000-4000-8000-000000000031';

DO $export_state$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM audit.export_batches
    WHERE id = '81500000-0000-4000-8000-000000000031'
      AND status = 'proven'
      AND pg_catalog.octet_length(object_digest) = 32
      AND retention_proof = '{"proof_version":1,"proof_class":"synthetic_write_once","verified_at":"2026-09-01T00:02:00Z"}'::jsonb
  ) THEN
    RAISE EXCEPTION 'queued-to-claimed-to-proven state fixture failed';
  END IF;

  BEGIN
    UPDATE audit.export_batches
    SET object_digest = pg_catalog.decode(pg_catalog.repeat('ff',32),'hex')
    WHERE id = '81500000-0000-4000-8000-000000000031';
    RAISE EXCEPTION 'proven export mutation was accepted';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;

  BEGIN
    DELETE FROM audit.export_batches
    WHERE id = '81500000-0000-4000-8000-000000000031';
    RAISE EXCEPTION 'export delete was accepted';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;
END
$export_state$;

ROLLBACK;
