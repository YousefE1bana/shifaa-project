\set ON_ERROR_STOP on
BEGIN;

INSERT INTO identity.people(id,user_id,display_name,email_normalized) VALUES
 ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Synthetic Patient One','patient.one@synthetic.shifaa.test'),
 ('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','Synthetic Patient Two','patient.two@synthetic.shifaa.test'),
 ('10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003','Synthetic Reviewer','reviewer@synthetic.shifaa.test')
ON CONFLICT DO NOTHING;
INSERT INTO identity.patients(id,person_id,medical_record_number) VALUES
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','SYN-000001'),
 ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','SYN-000002')
ON CONFLICT DO NOTHING;
INSERT INTO identity.care_relationships(subject_patient_id,actor_person_id,relationship_type) VALUES
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','self'),
 ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','self')
ON CONFLICT DO NOTHING;
INSERT INTO identity.identities(id,person_id,identity_type,ciphertext,nonce,authentication_tag,key_version,blind_index,issuing_country,verification_status)
VALUES
 ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','egyptian_national_id',decode('01','hex'),decode('000000000000000000000001','hex'),decode('00000000000000000000000000000001','hex'),1,digest('synthetic-invalid-date-id-one','sha256'),'EG','manual_review'),
 ('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','egyptian_national_id',decode('02','hex'),decode('000000000000000000000002','hex'),decode('00000000000000000000000000000002','hex'),1,digest('synthetic-invalid-date-id-two','sha256'),'EG','manual_review')
ON CONFLICT DO NOTHING;
INSERT INTO identity.verification_cases(id,identity_id,provider,state,assigned_reviewer_person_id)
VALUES
 ('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','manual','manual_review','10000000-0000-4000-8000-000000000003'),
 ('50000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','manual','manual_review','10000000-0000-4000-8000-000000000002')
ON CONFLICT DO NOTHING;

SET LOCAL ROLE shifaa_api;
SELECT set_config('shifaa.actor_role','PAT',true);
SELECT set_config('shifaa.person_id','10000000-0000-4000-8000-000000000001',true);

DO $$
DECLARE visible integer;
BEGIN
  SELECT count(*) INTO visible FROM identity.people;
  IF visible <> 1 THEN RAISE EXCEPTION 'patient must see exactly self, saw %', visible; END IF;
  SELECT count(*) INTO visible FROM identity.identities;
  IF visible <> 1 THEN RAISE EXCEPTION 'patient identity projection policy failed'; END IF;
  SELECT count(*) INTO visible FROM identity.verification_cases;
  IF visible <> 1 THEN RAISE EXCEPTION 'patient case policy failed'; END IF;
END
$$;

SELECT set_config('shifaa.actor_role','GUA',true);
DO $$ BEGIN IF EXISTS (SELECT 1 FROM identity.identities) THEN RAISE EXCEPTION 'guardian scope must deny'; END IF; END $$;
SELECT set_config('shifaa.actor_role','DEL',true);
DO $$ BEGIN IF EXISTS (SELECT 1 FROM identity.identities) THEN RAISE EXCEPTION 'delegate scope must deny'; END IF; END $$;

SELECT set_config('shifaa.actor_role','ADM-FACILITY',true);
SELECT set_config('shifaa.person_id','10000000-0000-4000-8000-000000000003',true);
SELECT set_config('shifaa.purposes','identity.review',true);
SELECT set_config('shifaa.aal','1',true);
DO $$ BEGIN IF EXISTS (SELECT 1 FROM identity.verification_cases) THEN RAISE EXCEPTION 'AAL1 reviewer must deny'; END IF; END $$;
SELECT set_config('shifaa.aal','2',true);
DO $$ BEGIN IF (SELECT count(*) FROM identity.verification_cases) <> 1 THEN RAISE EXCEPTION 'assigned AAL2 reviewer must see one case'; END IF; END $$;
SELECT set_config('shifaa.purposes','',true);
DO $$ BEGIN IF EXISTS (SELECT 1 FROM identity.verification_cases) THEN RAISE EXCEPTION 'reviewer without purpose must deny'; END IF; END $$;
SELECT set_config('shifaa.purposes','identity.review',true);
SELECT set_config('shifaa.person_id','10000000-0000-4000-8000-000000000002',true);
DO $$ BEGIN IF EXISTS (SELECT 1 FROM identity.verification_cases) THEN RAISE EXCEPTION 'unassigned/self reviewer must deny'; END IF; END $$;

ROLLBACK;
