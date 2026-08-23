-- Deterministic synthetic inventory for 006 SQL, live, and performance harnesses.
-- Callers own the surrounding transaction/lifecycle. These rows are deliberately
-- absent from the canonical migration so the 003 exact-count regressions remain
-- an independent authority check.

INSERT INTO identity.facilities(
  id,facility_type,name_ar,name_en,facility_status,governorate_code,city,district,address_line,
  created_by_person_id,reviewed_by_person_id,reviewed_at,location,location_verified_at
) VALUES
  ('63000000-0000-4000-8000-000000000001','hospital','مستشفى اصطناعي ألف','Synthetic Hospital A','active','SYN-CAI','Synthetic Cairo','Synthetic East','Synthetic address A','60000000-0000-4000-8000-000000000007','40000000-0000-4000-8000-000000000006',statement_timestamp(),public.ST_SetSRID(public.ST_MakePoint(31.200,30.100),4326)::public.geography,statement_timestamp()),
  ('63000000-0000-4000-8000-000000000002','hospital','مستشفى اصطناعي باء','Synthetic Hospital B','active','SYN-CAI','Synthetic Cairo','Synthetic West','Synthetic address B','60000000-0000-4000-8000-000000000008','40000000-0000-4000-8000-000000000006',statement_timestamp(),public.ST_SetSRID(public.ST_MakePoint(31.210,30.110),4326)::public.geography,statement_timestamp()),
  ('63000000-0000-4000-8000-000000000003','hospital','مستشفى اصطناعي قديم','Synthetic Stale Hospital','active','SYN-CAI','Synthetic Cairo','Synthetic North','Synthetic address C','60000000-0000-4000-8000-000000000009','40000000-0000-4000-8000-000000000006',statement_timestamp(),public.ST_SetSRID(public.ST_MakePoint(31.220,30.120),4326)::public.geography,statement_timestamp()),
  ('63000000-0000-4000-8000-000000000004','hospital','مستشفى اصطناعي موقوف','Synthetic Suspended Hospital','suspended','SYN-CAI','Synthetic Cairo','Synthetic South','Synthetic address D','60000000-0000-4000-8000-000000000009','40000000-0000-4000-8000-000000000006',statement_timestamp(),public.ST_SetSRID(public.ST_MakePoint(31.230,30.130),4326)::public.geography,statement_timestamp()),
  ('63000000-0000-4000-8000-000000000005','clinic','عيادة اصطناعية','Synthetic Clinic','active','SYN-CAI','Synthetic Cairo','Synthetic Central','Synthetic address E','60000000-0000-4000-8000-000000000009','40000000-0000-4000-8000-000000000006',statement_timestamp(),public.ST_SetSRID(public.ST_MakePoint(31.205,30.105),4326)::public.geography,statement_timestamp()),
  ('63000000-0000-4000-8000-000000000006','hospital','مستشفى اصطناعي بلا ترخيص','Synthetic Unlicensed Hospital','active','SYN-CAI','Synthetic Cairo','Synthetic Edge','Synthetic address F','60000000-0000-4000-8000-000000000009','40000000-0000-4000-8000-000000000006',statement_timestamp(),public.ST_SetSRID(public.ST_MakePoint(31.215,30.115),4326)::public.geography,statement_timestamp())
ON CONFLICT (id) DO NOTHING;

INSERT INTO identity.private_evidence_objects(
  id,bucket_code,object_key,owner_person_id,facility_id,sha256,mime_type,size_bytes,scan_status,released_at
) VALUES
  ('63100000-0000-4000-8000-000000000001','facility-license-evidence','synthetic/sos-006/facility-a','60000000-0000-4000-8000-000000000007','63000000-0000-4000-8000-000000000001',repeat('a1',32),'application/pdf',1024,'released',statement_timestamp()),
  ('63100000-0000-4000-8000-000000000002','facility-license-evidence','synthetic/sos-006/facility-b','60000000-0000-4000-8000-000000000008','63000000-0000-4000-8000-000000000002',repeat('a2',32),'application/pdf',1024,'released',statement_timestamp()),
  ('63100000-0000-4000-8000-000000000003','facility-license-evidence','synthetic/sos-006/facility-stale','60000000-0000-4000-8000-000000000009','63000000-0000-4000-8000-000000000003',repeat('a3',32),'application/pdf',1024,'released',statement_timestamp()),
  ('63100000-0000-4000-8000-000000000004','facility-license-evidence','synthetic/sos-006/facility-suspended','60000000-0000-4000-8000-000000000009','63000000-0000-4000-8000-000000000004',repeat('a4',32),'application/pdf',1024,'released',statement_timestamp()),
  ('63100000-0000-4000-8000-000000000005','facility-license-evidence','synthetic/sos-006/clinic','60000000-0000-4000-8000-000000000009','63000000-0000-4000-8000-000000000005',repeat('a5',32),'application/pdf',1024,'released',statement_timestamp()),
  ('63100000-0000-4000-8000-000000000006','professional-license-evidence','synthetic/sos-006/hospital-a-nurse','60000000-0000-4000-8000-000000000009','63000000-0000-4000-8000-000000000001',repeat('a6',32),'application/pdf',1024,'released',statement_timestamp())
ON CONFLICT (id) DO NOTHING;

INSERT INTO identity.facility_licenses(
  id,facility_id,license_type,number_ciphertext,number_hash,issuer,issued_on,expires_on,
  licensed_activities,status,evidence_object_id,reviewed_by_person_id,reviewed_at,decision_reason
) VALUES
  ('63200000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','synthetic_hospital',decode('a1','hex'),decode(repeat('b1',32),'hex'),'Synthetic authority','2026-01-01','2099-01-01',ARRAY['emergency_care','general_hospital'],'verified','63100000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000006',statement_timestamp(),'synthetic.seed'),
  ('63200000-0000-4000-8000-000000000002','63000000-0000-4000-8000-000000000002','synthetic_hospital',decode('a2','hex'),decode(repeat('b2',32),'hex'),'Synthetic authority','2026-01-01','2099-01-01',ARRAY['emergency_care'],'verified','63100000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000006',statement_timestamp(),'synthetic.seed'),
  ('63200000-0000-4000-8000-000000000003','63000000-0000-4000-8000-000000000003','synthetic_hospital',decode('a3','hex'),decode(repeat('b3',32),'hex'),'Synthetic authority','2026-01-01','2099-01-01',ARRAY['emergency_care'],'verified','63100000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000006',statement_timestamp(),'synthetic.seed'),
  ('63200000-0000-4000-8000-000000000004','63000000-0000-4000-8000-000000000004','synthetic_hospital',decode('a4','hex'),decode(repeat('b4',32),'hex'),'Synthetic authority','2026-01-01','2099-01-01',ARRAY['emergency_care'],'verified','63100000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000006',statement_timestamp(),'synthetic.seed'),
  ('63200000-0000-4000-8000-000000000005','63000000-0000-4000-8000-000000000005','synthetic_clinic',decode('a5','hex'),decode(repeat('b5',32),'hex'),'Synthetic authority','2026-01-01','2099-01-01',ARRAY['primary_care'],'verified','63100000-0000-4000-8000-000000000005','40000000-0000-4000-8000-000000000006',statement_timestamp(),'synthetic.seed')
ON CONFLICT (id) DO NOTHING;

INSERT INTO identity.professional_licenses(
  id,person_id,profession,number_ciphertext,number_hash,issuer,expires_on,status,
  evidence_object_id,reviewed_by_person_id,reviewed_at,decision_reason,masked_license_number
) VALUES(
  '63200000-0000-4000-8000-000000000006','60000000-0000-4000-8000-000000000009','nurse',
  decode('a6','hex'),decode(repeat('b6',32),'hex'),'Synthetic authority','2099-01-01','verified',
  '63100000-0000-4000-8000-000000000006','40000000-0000-4000-8000-000000000006',statement_timestamp(),
  'synthetic.seed','••••0006'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO identity.facility_memberships(
  id,facility_id,person_id,role_code,employment_license_id,valid_from,membership_status,created_by_person_id
) VALUES
  ('63300000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000007','owner',NULL,'2026-01-01','active','60000000-0000-4000-8000-000000000007'),
  ('63300000-0000-4000-8000-000000000002','63000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000008','owner',NULL,'2026-01-01','active','60000000-0000-4000-8000-000000000008'),
  ('63300000-0000-4000-8000-000000000003','63000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000009','nurse','63200000-0000-4000-8000-000000000006','2026-01-01','active','60000000-0000-4000-8000-000000000007')
ON CONFLICT (id) DO NOTHING;

INSERT INTO hospital.capacity_projections(
  id,facility_id,emergency_available_count,emergency_held_count,signal,observed_at,fresh_until,source_code
) VALUES
  ('65000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',5,1,'available',statement_timestamp()-interval '1 minute',statement_timestamp()+interval '10 minutes','synthetic_seed'),
  ('65000000-0000-4000-8000-000000000002','63000000-0000-4000-8000-000000000002',1,0,'limited',statement_timestamp()-interval '1 minute',statement_timestamp()+interval '10 minutes','synthetic_seed'),
  ('65000000-0000-4000-8000-000000000003','63000000-0000-4000-8000-000000000003',4,0,'available',statement_timestamp()-interval '20 minutes',statement_timestamp()-interval '10 minutes','synthetic_seed')
ON CONFLICT (id) DO UPDATE SET
  emergency_available_count=EXCLUDED.emergency_available_count,
  emergency_held_count=EXCLUDED.emergency_held_count,
  signal=EXCLUDED.signal,
  observed_at=EXCLUDED.observed_at,
  fresh_until=EXCLUDED.fresh_until,
  source_code=EXCLUDED.source_code,
  version=hospital.capacity_projections.version+1,
  updated_at=statement_timestamp();
