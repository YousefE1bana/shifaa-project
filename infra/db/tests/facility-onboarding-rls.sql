\set ON_ERROR_STOP on
BEGIN;
INSERT INTO identity.people(id,user_id,display_name,nationality_code,preferred_locale,profile_status) VALUES
('30000000-0000-4000-8000-000000000001','30000000-0000-4000-9000-000000000001','Synthetic Owner','EG','ar-EG','active'),
('30000000-0000-4000-8000-000000000002','30000000-0000-4000-9000-000000000002','Synthetic Worker','EG','ar-EG','active'),
('30000000-0000-4000-8000-000000000003','30000000-0000-4000-9000-000000000003','Synthetic Other','EG','ar-EG','active'),
('30000000-0000-4000-8000-000000000010','30000000-0000-4000-9000-000000000010','Synthetic Approver','EG','en-EG','active') ON CONFLICT(id) DO NOTHING;
INSERT INTO identity.facilities(id,facility_type,name_ar,name_en,facility_status,governorate_code,city,district,address_line,created_by_person_id) VALUES
('31000000-0000-4000-8000-000000000001','clinic','أ','A','pending_review','CA','Cairo','D','Synthetic one','30000000-0000-4000-8000-000000000001'),
('31000000-0000-4000-8000-000000000002','clinic','ب','B','pending_review','CA','Cairo','D','Synthetic two','30000000-0000-4000-8000-000000000003');
INSERT INTO identity.private_evidence_objects(id,bucket_code,object_key,owner_person_id,facility_id,sha256,mime_type,size_bytes,scan_status,released_at) VALUES
('32000000-0000-4000-8000-000000000001','facility-license-evidence','synthetic/facility','30000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001',repeat('1',64),'application/pdf',10,'released',now()),
('32000000-0000-4000-8000-000000000002','professional-license-evidence','synthetic/professional','30000000-0000-4000-8000-000000000002',NULL,repeat('2',64),'application/pdf',10,'released',now());
INSERT INTO identity.facility_licenses(id,facility_id,license_type,number_ciphertext,number_hash,issuer,expires_on,licensed_activities,status,evidence_object_id) VALUES
('33000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','clinic',decode('01','hex'),decode('01','hex'),'Synthetic','2030-01-01',ARRAY['consultation'],'pending','32000000-0000-4000-8000-000000000001');
INSERT INTO identity.professional_licenses(id,person_id,profession,number_ciphertext,number_hash,issuer,expires_on,status,evidence_object_id) VALUES
('33000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','doctor',decode('02','hex'),decode('02','hex'),'Synthetic','2030-01-01','verified','32000000-0000-4000-8000-000000000002');
INSERT INTO identity.facility_memberships(id,facility_id,person_id,role_code,employment_license_id,valid_from,membership_status,created_by_person_id) VALUES
('34000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','doctor','33000000-0000-4000-8000-000000000002',now(),'active','30000000-0000-4000-8000-000000000001');
SET LOCAL ROLE shifaa_api;
SELECT set_config('shifaa.person_id','30000000-0000-4000-8000-000000000002',true);
SELECT set_config('shifaa.actor_role','CLN',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM identity.facilities)<>1 THEN RAISE EXCEPTION 'member must see only own facility'; END IF;
 IF EXISTS(SELECT 1 FROM identity.facilities WHERE id='31000000-0000-4000-8000-000000000002') THEN RAISE EXCEPTION 'cross-facility leak'; END IF;
END $$;
SELECT set_config('shifaa.person_id','30000000-0000-4000-8000-000000000010',true);
SELECT set_config('shifaa.actor_role','ADM-FACILITY',true);
SELECT set_config('shifaa.aal','1',true);
SELECT set_config('shifaa.purposes','facility_approval',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM identity.facilities) OR EXISTS(SELECT 1 FROM identity.facility_licenses) OR EXISTS(SELECT 1 FROM identity.professional_licenses) OR EXISTS(SELECT 1 FROM identity.private_evidence_objects) THEN RAISE EXCEPTION 'AAL1 review leak'; END IF;
END $$;
SELECT set_config('shifaa.aal','2',true); SELECT set_config('shifaa.purposes','',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM identity.facilities) OR EXISTS(SELECT 1 FROM identity.facility_licenses) OR EXISTS(SELECT 1 FROM identity.professional_licenses) OR EXISTS(SELECT 1 FROM identity.private_evidence_objects) THEN RAISE EXCEPTION 'missing-purpose review leak'; END IF;
END $$;
SELECT set_config('shifaa.purposes','facility_approval',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM identity.facilities WHERE id IN ('31000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000002'))<>2 THEN RAISE EXCEPTION 'authorized minimum worklist missing'; END IF;
 IF (SELECT count(*) FROM identity.facility_licenses)<>1 OR (SELECT count(*) FROM identity.private_evidence_objects)<>1 THEN RAISE EXCEPTION 'facility purpose projection missing'; END IF;
 IF EXISTS(SELECT 1 FROM identity.professional_licenses) THEN RAISE EXCEPTION 'facility purpose crossed professional boundary'; END IF;
END $$;
SELECT set_config('shifaa.purposes','professional_license_review',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM identity.professional_licenses)<>1 OR (SELECT count(*) FROM identity.private_evidence_objects)<>1 THEN RAISE EXCEPTION 'professional purpose projection missing'; END IF;
 IF EXISTS(SELECT 1 FROM identity.facilities) OR EXISTS(SELECT 1 FROM identity.facility_licenses) THEN RAISE EXCEPTION 'professional purpose crossed facility boundary'; END IF;
END $$;
SELECT set_config('shifaa.actor_role','ADM-SUPPORT',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM identity.facilities) THEN RAISE EXCEPTION 'wrong-role review leak'; END IF; END $$;
DO $$ BEGIN
 BEGIN DELETE FROM identity.facilities WHERE true; RAISE EXCEPTION 'delete should be denied'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
