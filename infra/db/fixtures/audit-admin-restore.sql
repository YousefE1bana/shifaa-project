BEGIN;

-- Synthetic-only restore fixture. This records a closed proof shape without
-- asserting any statutory duration, provider certification, or production WORM.
INSERT INTO identity.people(id,user_id,display_name,profile_status)
VALUES(
  '81600000-0000-4000-8000-000000000001',
  '81600000-0000-4000-9000-000000000001',
  'Synthetic C3A Restore Actor',
  'active'
);

SELECT pg_catalog.set_config('shifaa.environment','local',true);

CREATE TEMP TABLE f008_restore_events(
  partition_key date NOT NULL,
  event_id uuid NOT NULL,
  event_occurred_at timestamptz NOT NULL,
  event_hash bytea NOT NULL
) ON COMMIT DROP;

SELECT pg_catalog.set_config('shifaa.test_now','2026-05-01T00:00:00Z',true);
INSERT INTO f008_restore_events
SELECT '2026-05-01'::date,event.*
FROM audit.append_event_v1(
  '81600000-0000-4000-8000-000000000011'::uuid,'trace-008-restore-may-0001',
  'audit.restore_fixture','audit_event','success',NULL::uuid,
  '81600000-0000-4000-8000-000000000001'::uuid,2::smallint,NULL::uuid,NULL::uuid,
  'audit_review',NULL::uuid,NULL::integer,'synthetic_restore',NULL::inet,'system'
) AS event;

SELECT pg_catalog.set_config('shifaa.test_now','2026-05-31T23:59:59.999999Z',true);
INSERT INTO f008_restore_events
SELECT '2026-05-01'::date,event.*
FROM audit.append_event_v1(
  '81600000-0000-4000-8000-000000000012'::uuid,'trace-008-restore-may-0002',
  'audit.restore_fixture','audit_event','success',NULL::uuid,
  '81600000-0000-4000-8000-000000000001'::uuid,2::smallint,NULL::uuid,NULL::uuid,
  'audit_review',NULL::uuid,NULL::integer,'synthetic_restore',NULL::inet,'system'
) AS event;

SELECT pg_catalog.set_config('shifaa.test_now','2026-06-01T00:00:00Z',true);
INSERT INTO f008_restore_events
SELECT '2026-06-01'::date,event.*
FROM audit.append_event_v1(
  '81600000-0000-4000-8000-000000000013'::uuid,'trace-008-restore-june-0001',
  'audit.restore_fixture','audit_event','success',NULL::uuid,
  '81600000-0000-4000-8000-000000000001'::uuid,2::smallint,NULL::uuid,NULL::uuid,
  'audit_review',NULL::uuid,NULL::integer,'synthetic_restore',NULL::inet,'system'
) AS event;

INSERT INTO audit.signature_evidence(
  id,resource_type,resource_id,resource_version,signer_person_id,signer_role,
  decision,artifact_digest,signed_at,audit_event_id,audit_event_occurred_at
)
SELECT
  '81600000-0000-4000-8000-000000000021','audit_export',
  '81600000-0000-4000-8000-000000000022',1,
  '81600000-0000-4000-8000-000000000001','super_admin','approved',
  audit.sha256_v1(pg_catalog.convert_to('synthetic-c3a-signature-artifact','UTF8')),
  '2026-07-01T00:00:00Z',event_id,event_occurred_at
FROM f008_restore_events
WHERE partition_key = '2026-05-01'
ORDER BY event_occurred_at
LIMIT 1;

INSERT INTO audit.export_batches(
  id,requested_by_person_id,purpose_code,partition_start,partition_end_exclusive,
  status,object_key,object_digest,retention_proof,exported_at,created_at,updated_at,version
) VALUES(
  '81600000-0000-4000-8000-000000000031',
  '81600000-0000-4000-8000-000000000001','security.audit.review',
  '2026-05-01','2026-07-01','proven',
  'audit-exports/81600000000040008000000000000031.jsonl',
  audit.sha256_v1(pg_catalog.convert_to(
    '{"fixture":"feature-008-c3a","partitions":["2026-05-01","2026-06-01"],"version":1}' ||
    pg_catalog.chr(10),
    'UTF8'
  )),
  '{"proof_version":1,"proof_class":"synthetic_write_once","verified_at":"2026-07-01T00:00:00Z"}'::jsonb,
  '2026-07-01T00:00:00Z','2026-09-01T00:00:00Z','2026-09-01T00:00:00Z',3
);

DO $fixture$
DECLARE
  verification record;
BEGIN
  SELECT * INTO verification FROM audit.verify_event_chain_v1('2026-05-01');
  IF NOT verification.valid OR verification.checked_count <> 2 THEN
    RAISE EXCEPTION 'restore fixture May chain invalid: %',verification;
  END IF;

  SELECT * INTO verification FROM audit.verify_event_chain_v1('2026-06-01');
  IF NOT verification.valid OR verification.checked_count <> 1 THEN
    RAISE EXCEPTION 'restore fixture June chain invalid: %',verification;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM audit.export_batches
    WHERE id = '81600000-0000-4000-8000-000000000031'
      AND status = 'proven'
      AND pg_catalog.octet_length(object_digest) = 32
      AND retention_proof = '{"proof_version":1,"proof_class":"synthetic_write_once","verified_at":"2026-07-01T00:00:00Z"}'::jsonb
  ) THEN
    RAISE EXCEPTION 'restore fixture export proof invalid';
  END IF;
END
$fixture$;

COMMIT;
