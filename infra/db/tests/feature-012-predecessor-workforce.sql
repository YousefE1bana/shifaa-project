-- Exercise the installed F011 clinician-scope predicate against isolated F003
-- fixture states. Facility and licence DML here is setup by the fixture owner.
BEGIN;
SET LOCAL shifaa.environment = 'local';
SET LOCAL shifaa.test_now = '2030-04-05T08:00:00Z';
INSERT INTO identity.people(id,user_id,display_name,profile_status)
VALUES ('74124000-0000-4000-8000-000000000001','74124000-0000-4000-9000-000000000001','Synthetic doctor','active');
INSERT INTO identity.facilities(id,facility_type,name_ar,name_en,facility_status,governorate_code,city,district,address_line,created_by_person_id)
VALUES ('74124000-0000-4000-8100-000000000001','clinic','عيادة اختبار','Synthetic clinic','active','C','Cairo','Test','Synthetic address',
        '74124000-0000-4000-8000-000000000001');
INSERT INTO identity.private_evidence_objects(id,bucket_code,object_key,owner_person_id,facility_id,sha256,mime_type,size_bytes,scan_status,released_at)
VALUES
  ('74124000-0000-4000-8200-000000000001','facility-license-evidence','synthetic/t012-facility','74124000-0000-4000-8000-000000000001',
   '74124000-0000-4000-8100-000000000001',repeat('a',64),'application/pdf',10,'released',now()),
  ('74124000-0000-4000-8200-000000000002','professional-license-evidence','synthetic/t012-professional','74124000-0000-4000-8000-000000000001',
   NULL,repeat('b',64),'application/pdf',10,'released',now());
INSERT INTO identity.facility_licenses(id,facility_id,license_type,number_ciphertext,number_hash,issuer,expires_on,licensed_activities,status,evidence_object_id)
VALUES ('74124000-0000-4000-8300-000000000001','74124000-0000-4000-8100-000000000001','clinic',decode('01','hex'),decode('01','hex'),
        'Synthetic issuer','2035-12-31',ARRAY['consultation'],'verified','74124000-0000-4000-8200-000000000001');
INSERT INTO identity.professional_licenses(id,person_id,profession,number_ciphertext,number_hash,issuer,expires_on,status,evidence_object_id)
VALUES ('74124000-0000-4000-8300-000000000002','74124000-0000-4000-8000-000000000001','doctor',decode('02','hex'),decode('02','hex'),
        'Synthetic issuer','2035-12-31','verified','74124000-0000-4000-8200-000000000002');
INSERT INTO identity.facility_memberships(id,facility_id,person_id,role_code,employment_license_id,valid_from,membership_status,created_by_person_id)
VALUES ('74124000-0000-4000-8400-000000000001','74124000-0000-4000-8100-000000000001','74124000-0000-4000-8000-000000000001','doctor',
        '74124000-0000-4000-8300-000000000002','2020-01-01','active','74124000-0000-4000-8000-000000000001');

DO $clinician_scope$
DECLARE
  clinician constant uuid := '74124000-0000-4000-8000-000000000001';
  facility constant uuid := '74124000-0000-4000-8100-000000000001';
  -- This helper only requires a non-null encounter input. The surrounding
  -- encounter and actor checks are exercised through the F011 mutation.
  encounter_scope constant uuid := '74124000-0000-4000-8500-000000000001';
  facility_evidence constant uuid := '74124000-0000-4000-8200-000000000001';
  professional_evidence constant uuid := '74124000-0000-4000-8200-000000000002';
  facility_licence constant uuid := '74124000-0000-4000-8300-000000000001';
  professional_licence constant uuid := '74124000-0000-4000-8300-000000000002';
  membership constant uuid := '74124000-0000-4000-8400-000000000001';
  action_time constant timestamptz := '2030-04-05T08:00:00Z';
  action_day constant date := '2030-04-05';
  scenario record;
  actual boolean;
  changed integer;
BEGIN
  FOR scenario IN SELECT * FROM (VALUES
    ('verified baseline', true),
    ('membership start equality', true),
    ('membership not yet effective', false),
    ('membership end equality', false),
    ('membership suspended', false),
    ('professional licence expiry date', true),
    ('professional licence after expiry date', false),
    ('professional licence suspended', false),
    ('facility licence expiry date', true),
    ('facility licence after expiry date', false),
    ('facility licence suspended', false),
    ('facility suspended', false),
    ('facility evidence quarantined', false),
    ('facility evidence rejected', false),
    ('professional evidence rejected', false)
  ) AS cases(label, expected) LOOP
    BEGIN
      CASE scenario.label
        WHEN 'verified baseline' THEN NULL;
        WHEN 'membership start equality' THEN
          UPDATE identity.facility_memberships SET valid_from=action_time WHERE id=membership;
        WHEN 'membership not yet effective' THEN
          UPDATE identity.facility_memberships SET valid_from=action_time+interval '1 microsecond' WHERE id=membership;
        WHEN 'membership end equality' THEN
          UPDATE identity.facility_memberships SET valid_until=action_time WHERE id=membership;
        WHEN 'membership suspended' THEN
          UPDATE identity.facility_memberships SET membership_status='suspended' WHERE id=membership;
        WHEN 'professional licence expiry date' THEN
          UPDATE identity.professional_licenses SET expires_on=action_day WHERE id=professional_licence;
        WHEN 'professional licence after expiry date' THEN
          UPDATE identity.professional_licenses SET expires_on=action_day-1 WHERE id=professional_licence;
        WHEN 'professional licence suspended' THEN
          UPDATE identity.professional_licenses SET status='suspended' WHERE id=professional_licence;
        WHEN 'facility licence expiry date' THEN
          UPDATE identity.facility_licenses SET expires_on=action_day WHERE id=facility_licence;
        WHEN 'facility licence after expiry date' THEN
          UPDATE identity.facility_licenses SET expires_on=action_day-1 WHERE id=facility_licence;
        WHEN 'facility licence suspended' THEN
          UPDATE identity.facility_licenses SET status='suspended' WHERE id=facility_licence;
        WHEN 'facility suspended' THEN
          UPDATE identity.facilities SET facility_status='suspended' WHERE id=facility;
        WHEN 'facility evidence quarantined' THEN
          UPDATE identity.private_evidence_objects SET scan_status='quarantined',released_at=NULL WHERE id=facility_evidence;
        WHEN 'facility evidence rejected' THEN
          UPDATE identity.private_evidence_objects SET scan_status='rejected',released_at=NULL WHERE id=facility_evidence;
        WHEN 'professional evidence rejected' THEN
          UPDATE identity.private_evidence_objects SET scan_status='rejected',released_at=NULL WHERE id=professional_evidence;
      END CASE;
      GET DIAGNOSTICS changed = ROW_COUNT;
      IF scenario.label<>'verified baseline' AND changed<>1 THEN
        RAISE EXCEPTION 'fixture did not produce %',scenario.label;
      END IF;

      SET LOCAL ROLE shifaa_f011_executor;
      actual := clinical.f011_lock_clinician_scope_v1(facility,encounter_scope,clinician);
      RESET ROLE;
      IF actual IS DISTINCT FROM scenario.expected THEN
        RAISE EXCEPTION 'scope % expected %, observed %',scenario.label,scenario.expected,actual;
      END IF;
      RAISE NOTICE 'scope %: expected %, observed %',scenario.label,scenario.expected,actual;

      -- Restore the verified fixture and release per-case locks before the next perturbation.
      RAISE SQLSTATE 'T1201' USING MESSAGE='rollback synthetic predicate case';
    EXCEPTION WHEN SQLSTATE 'T1201' THEN CONTINUE;
    END;
  END LOOP;
END
$clinician_scope$;
ROLLBACK;
