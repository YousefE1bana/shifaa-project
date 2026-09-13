-- Representative state that predates Feature 009.  This fixture deliberately
-- uses only baseline identity data; the migration runner proves it survives
-- the Feature 009 upgrade unchanged.
INSERT INTO identity.people(id,user_id,display_name,profile_status)
VALUES ('f0090000-0000-4f00-8c00-000000000099','f0090000-0000-4f00-9c00-000000000099','pre-feature baseline person','active')
ON CONFLICT (id) DO UPDATE SET display_name=EXCLUDED.display_name,profile_status=EXCLUDED.profile_status;
