\set ON_ERROR_STOP on
BEGIN;
INSERT INTO identity.people(id,user_id,display_name,nationality_code,preferred_locale,profile_status) VALUES
('36000000-0000-4000-8000-000000000001','36000000-0000-4000-9000-000000000001','Synthetic Proposer','EG','en-EG','active'),
('36000000-0000-4000-8000-000000000002','36000000-0000-4000-9000-000000000002','Synthetic Decider','EG','en-EG','active'),
('36000000-0000-4000-8000-000000000003','36000000-0000-4000-9000-000000000003','Synthetic Target','EG','en-EG','active') ON CONFLICT(id) DO NOTHING;
SET LOCAL ROLE shifaa_api;
SELECT set_config('shifaa.person_id','36000000-0000-4000-8000-000000000001',true),set_config('shifaa.actor_role','ADM-SUPER',true),set_config('shifaa.aal','2',true),set_config('shifaa.purposes','role_governance',true);
INSERT INTO identity.admin_role_grants(id,person_id,role_code,status,valid_from,proposed_by,decision_reason)
VALUES('36000000-0000-4000-8000-000000000010','36000000-0000-4000-8000-000000000003','facility_approver','pending',now(),'36000000-0000-4000-8000-000000000001','synthetic');
DO $$ BEGIN
 BEGIN UPDATE identity.admin_role_grants SET status='active',decided_by='36000000-0000-4000-8000-000000000001' WHERE id='36000000-0000-4000-8000-000000000010'; RAISE EXCEPTION 'self decision allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE identity.admin_role_grants SET status='active',decided_by='36000000-0000-4000-8000-000000000002' WHERE id='36000000-0000-4000-8000-000000000010'; RAISE EXCEPTION 'forged grant decider allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('shifaa.person_id','36000000-0000-4000-8000-000000000002',true);
UPDATE identity.admin_role_grants SET status='active',decided_by='36000000-0000-4000-8000-000000000002' WHERE id='36000000-0000-4000-8000-000000000010';
DO $$ BEGIN
 BEGIN UPDATE identity.admin_role_grants SET status='revoked' WHERE id='36000000-0000-4000-8000-000000000010'; RAISE EXCEPTION 'direct revoke allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('shifaa.person_id','36000000-0000-4000-8000-000000000001',true);
INSERT INTO identity.admin_role_revocation_requests(id,grant_id,status,reason,proposed_by)
VALUES('36000000-0000-4000-8000-000000000011','36000000-0000-4000-8000-000000000010','pending','synthetic','36000000-0000-4000-8000-000000000001');
DO $$ BEGIN
 BEGIN UPDATE identity.admin_role_revocation_requests SET status='approved',decided_by='36000000-0000-4000-8000-000000000001' WHERE id='36000000-0000-4000-8000-000000000011'; RAISE EXCEPTION 'revocation self decision allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE identity.admin_role_revocation_requests SET status='approved',decided_by='36000000-0000-4000-8000-000000000002' WHERE id='36000000-0000-4000-8000-000000000011'; RAISE EXCEPTION 'forged revocation decider allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('shifaa.person_id','36000000-0000-4000-8000-000000000002',true);
UPDATE identity.admin_role_revocation_requests SET status='approved',decided_by='36000000-0000-4000-8000-000000000002' WHERE id='36000000-0000-4000-8000-000000000011';
UPDATE identity.admin_role_grants SET status='revoked' WHERE id='36000000-0000-4000-8000-000000000010';
SELECT set_config('shifaa.actor_role','ADM-SUPPORT',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM identity.admin_role_grants) THEN RAISE EXCEPTION 'wrong role saw grants'; END IF; END $$;
ROLLBACK;
