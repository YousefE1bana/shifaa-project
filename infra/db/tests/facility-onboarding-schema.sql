\set ON_ERROR_STOP on
BEGIN;
DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['facilities','private_evidence_objects','facility_licenses','professional_licenses','facility_memberships','role_permissions','admin_role_grants','admin_role_revocation_requests'] LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='identity' AND c.relname=table_name AND c.relrowsecurity AND c.relforcerowsecurity) THEN RAISE EXCEPTION '% must use forced RLS',table_name; END IF;
  END LOOP;
END $$;
DO $$ BEGIN
 IF (SELECT count(DISTINCT role_code) FROM identity.role_permissions)<>3 THEN RAISE EXCEPTION 'only shipped roles through feature 004 should be seeded'; END IF;
 IF EXISTS(SELECT 1 FROM identity.role_permissions WHERE role_code NOT IN ('super_admin','support_admin','medical_reviewer','facility_approver','finance_reviewer')) THEN RAISE EXCEPTION 'unexpected admin role'; END IF;
 IF (SELECT count(*) FROM identity.role_permissions)<>16 THEN RAISE EXCEPTION 'expected exact existing plus 003 and 004 permission rows'; END IF;
END $$;
INSERT INTO identity.people(id,user_id,display_name,nationality_code,preferred_locale,profile_status) VALUES
('30000000-0000-4000-8000-000000000001','30000000-0000-4000-9000-000000000001','Synthetic Owner','EG','ar-EG','active'),
('30000000-0000-4000-8000-000000000010','30000000-0000-4000-9000-000000000010','Synthetic Approver','EG','en-EG','active'),
('30000000-0000-4000-8000-000000000011','30000000-0000-4000-9000-000000000011','Synthetic Super A','EG','en-EG','active'),
('30000000-0000-4000-8000-000000000012','30000000-0000-4000-9000-000000000012','Synthetic Super B','EG','en-EG','active') ON CONFLICT(id) DO NOTHING;
INSERT INTO identity.facilities(id,facility_type,name_ar,name_en,governorate_code,city,district,address_line,created_by_person_id)
VALUES('31000000-0000-4000-8000-000000000001','clinic','عيادة اصطناعية','Synthetic clinic','CA','Cairo','Nasr City','Synthetic only','30000000-0000-4000-8000-000000000001');
DO $$ BEGIN
 BEGIN UPDATE identity.facilities SET facility_type='hospital' WHERE id='31000000-0000-4000-8000-000000000001'; RAISE EXCEPTION 'type mutation should fail'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN UPDATE identity.facilities SET facility_status='active' WHERE id='31000000-0000-4000-8000-000000000001'; RAISE EXCEPTION 'state jump should fail'; EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
SELECT set_config('shifaa.person_id','30000000-0000-4000-8000-000000000011',true);
INSERT INTO identity.admin_role_grants(id,person_id,role_code,status,valid_from,proposed_by,decision_reason)
VALUES('35000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000010','facility_approver','pending',now(),'30000000-0000-4000-8000-000000000011','synthetic');
SELECT set_config('shifaa.person_id','30000000-0000-4000-8000-000000000012',true);
UPDATE identity.admin_role_grants SET status='active',decided_by='30000000-0000-4000-8000-000000000012' WHERE id='35000000-0000-4000-8000-000000000001';
DO $$ BEGIN
 BEGIN UPDATE identity.admin_role_grants SET status='revoked' WHERE id='35000000-0000-4000-8000-000000000001'; RAISE EXCEPTION 'direct revoke should fail'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
