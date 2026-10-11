-- Isolated K06 component authority fixtures. Owner-only synthetic provisioning;
-- no real source evidence, clinical approval, encryption or external storage.
BEGIN;
-- Complete the existing Feature 010 encounter context using its real linked
-- appointment predicate. This does not add scheduling behavior to Feature 011.
INSERT INTO clinical.schedules
 (id,facility_id,doctor_person_id,timezone_name,valid_from,valid_to,slot_duration_minutes,
  fee_minor_units,currency_code,created_by_person_id,updated_by_person_id)
VALUES ('f011c000-0000-4000-8600-000000000001','f0110000-0000-4000-8200-000000000001',
 'f0110000-0000-4000-8000-000000000002','Africa/Cairo','2026-10-06','2026-10-06',30,0,'EGP',
 'f0110000-0000-4000-8000-000000000002','f0110000-0000-4000-8000-000000000002');
INSERT INTO clinical.appointments
 (id,patient_person_id,facility_id,doctor_person_id,schedule_id,starts_at,ends_at,timezone_name,
  civil_date,local_start,fee_minor_units,currency_code,status,created_by_person_id,updated_by_person_id)
VALUES ('f011c000-0000-4000-8600-000000000002','f0110000-0000-4000-8000-000000000001',
 'f0110000-0000-4000-8200-000000000001','f0110000-0000-4000-8000-000000000002',
 'f011c000-0000-4000-8600-000000000001','2026-10-06T10:00:00Z','2026-10-06T10:30:00Z',
 'Africa/Cairo','2026-10-06','13:00',0,'EGP','confirmed',
 'f0110000-0000-4000-8000-000000000002','f0110000-0000-4000-8000-000000000002');
SELECT set_config('shifaa.clinic_internal_transition','allowed',true);
UPDATE clinical.appointments SET status='checked_in'
WHERE id='f011c000-0000-4000-8600-000000000002';
SELECT set_config('shifaa.clinic_internal_transition','f010_create_encounter',true);
UPDATE clinical.appointments SET status='in_consultation'
WHERE id='f011c000-0000-4000-8600-000000000002';
UPDATE clinical.encounters SET appointment_id='f011c000-0000-4000-8600-000000000002'
WHERE id='f0110000-0000-4000-8400-000000000001';
INSERT INTO identity.private_evidence_objects
  (id,bucket_code,object_key,owner_person_id,facility_id,sha256,mime_type,size_bytes,scan_status,released_at)
VALUES ('f011c000-0000-4000-8000-000000000001','facility-license-evidence',
  'f011c000-0000-4000-8000-000000000001','f0110000-0000-4000-8000-000000000002',
  'f0110000-0000-4000-8200-000000000001',repeat('a',64),'application/pdf',1,'released',clock_timestamp());
INSERT INTO identity.facility_licenses
  (id,facility_id,license_type,number_ciphertext,number_hash,issuer,expires_on,licensed_activities,status,evidence_object_id,reviewed_by_person_id,reviewed_at)
VALUES ('f011c000-0000-4000-8000-000000000002','f0110000-0000-4000-8200-000000000001',
  'synthetic-clinic',decode('aa','hex'),decode(repeat('e',64),'hex'),'Synthetic authority only','2099-12-31',
  ARRAY['consultation'],'verified','f011c000-0000-4000-8000-000000000001',
  'f0110000-0000-4000-8000-000000000008',clock_timestamp());
SELECT set_config('shifaa.person_id','f0110000-0000-4000-8000-000000000007',true);
INSERT INTO identity.admin_role_grants
  (id,person_id,role_code,status,valid_from,proposed_by,decided_by,decision_reason)
SELECT ('f011c000-0000-4000-8100-'||lpad(n::text,12,'0'))::uuid,
  ('f0110000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'medical_reviewer','pending','2020-01-01T00:00:00Z',
  'f0110000-0000-4000-8000-000000000007',NULL,
  'Synthetic current authority fixture only'
FROM generate_series(5,6) n;
SELECT set_config('shifaa.person_id','f0110000-0000-4000-8000-000000000008',true);
UPDATE identity.admin_role_grants SET status='active',
 decided_by='f0110000-0000-4000-8000-000000000008',version=version+1
WHERE id IN ('f011c000-0000-4000-8100-000000000005','f011c000-0000-4000-8100-000000000006');
INSERT INTO clinical.content_reviewer_designations
  (id,person_id,professional_license_id,reviewer_capacity,evidence_ref,designated_by,
   evidence_producer_id,evidence_verified_at,source_identity,source_evidence_identity,status,valid_from,version)
SELECT ('f011c000-0000-4000-8200-'||lpad(n::text,12,'0'))::uuid,
  ('f0110000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  ('f0110000-0000-4000-8300-'||lpad(n::text,12,'0'))::uuid,
  CASE n WHEN 2 THEN 'physician' ELSE 'pharmacist' END,
  ('f011c000-0000-4000-8300-'||lpad(n::text,12,'0'))::uuid,
  'f0110000-0000-4000-8000-000000000008','f011.governance_provisioner',
  '2026-10-06T10:00:00.000000Z','synthetic.designation','synthetic-designation-'||n,
  'active','2020-01-01T00:00:00Z',1
FROM generate_series(2,3) n;
INSERT INTO clinical.content_governance_authorities
  (id,person_id,action,capacity,content_type,governed_content_key,effective_scope_key,
   facility_id,issued_by,evidence_ref,evidence_producer_id,evidence_verified_at,
   source_identity,source_evidence_identity,status,valid_from,version)
SELECT ('f011c000-0000-4000-8400-'||lpad(n::text,12,'0'))::uuid,
  ('f0110000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'signClinicalContentRelease',CASE n WHEN 2 THEN 'physician' ELSE 'pharmacist' END,
  'synthetic','neutral-series','synthetic-scope',NULL,
  'f0110000-0000-4000-8000-000000000008',
  ('f011c000-0000-4000-8500-'||lpad(n::text,12,'0'))::uuid,
  'f011.governance_provisioner','2026-10-06T10:00:00.000000Z',
  'synthetic.authority','synthetic-sign-authority-'||n,'active','2020-01-01T00:00:00Z',1
FROM generate_series(2,3) n;
INSERT INTO clinical.content_governance_authorities
  (id,person_id,action,content_type,governed_content_key,effective_scope_key,
   facility_id,issued_by,evidence_ref,evidence_producer_id,evidence_verified_at,
   source_identity,source_evidence_identity,status,valid_from,version)
VALUES ('f011c000-0000-4000-8400-000000000004','f0110000-0000-4000-8000-000000000002',
  'listClinicalContent','synthetic','neutral-series','synthetic-scope',
  'f0110000-0000-4000-8200-000000000001','f0110000-0000-4000-8000-000000000008',
  'f011c000-0000-4000-8500-000000000004','f011.governance_provisioner',
  '2026-10-06T10:00:00.000000Z','synthetic.authority','synthetic-status-authority-2',
  'active','2020-01-01T00:00:00Z',1);
-- Exercise the inherited delegation seam through its guarded invitation and
-- acceptance transitions, without disabling triggers or forging authority.
SELECT set_config('shifaa.person_id','f0110000-0000-4000-8000-000000000001',true);
INSERT INTO identity.care_relationships
  (id,subject_patient_id,actor_person_id,relationship_type,status,valid_from,
   purpose_code,created_by_person_id,invite_token_digest,invite_expires_at)
VALUES ('f011c000-0000-4000-8700-000000000001','f0110000-0000-4000-8100-000000000001',
  'f0110000-0000-4000-8000-000000000004','delegation','pending','2020-01-01',
  'synthetic.feature011','f0110000-0000-4000-8000-000000000001',
  decode(repeat('ab',32),'hex'),now()+interval '1 day');
INSERT INTO identity.care_relationship_permissions
  (relationship_id,permission_code,created_by_person_id)
VALUES ('f011c000-0000-4000-8700-000000000001','record.view',
  'f0110000-0000-4000-8000-000000000001');
SELECT set_config('shifaa.person_id','f0110000-0000-4000-8000-000000000004',true);
UPDATE identity.care_relationships
SET status='active',invite_token_digest=NULL,invite_expires_at=NULL,invite_consumed_at=now()
WHERE id='f011c000-0000-4000-8700-000000000001';
COMMIT;
