-- Neutral synthetic C03 actors. No clinical rules, real people or gate approval.
BEGIN;
INSERT INTO identity.people(id,user_id,display_name,profile_status)
SELECT ('f0110000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
       ('f0110000-0000-4000-9000-'||lpad(n::text,12,'0'))::uuid,
       'F011 synthetic actor '||n,'active'
FROM generate_series(1,8) n;
INSERT INTO identity.patients(id,person_id,medical_record_number,record_status)
VALUES ('f0110000-0000-4000-8100-000000000001','f0110000-0000-4000-8000-000000000001','F011-SYNTHETIC-1','active');
INSERT INTO identity.facilities(id,facility_type,name_ar,name_en,facility_status,governorate_code,city,district,address_line,created_by_person_id)
VALUES ('f0110000-0000-4000-8200-000000000001','clinic','عيادة اختبار اصطناعية','F011 synthetic clinic','active','C','Cairo','Test','Synthetic only','f0110000-0000-4000-8000-000000000002');
INSERT INTO identity.professional_licenses(id,person_id,profession,number_ciphertext,number_hash,issuer,expires_on,status)
SELECT ('f0110000-0000-4000-8300-'||lpad(n::text,12,'0'))::uuid,
       ('f0110000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
       CASE WHEN n=3 THEN 'pharmacist' ELSE 'doctor' END,
       decode(repeat('aa',16),'hex'),decode(repeat(n::text,64),'hex'),'Synthetic authority only','2099-12-31','verified'
FROM generate_series(2,3) n;
INSERT INTO identity.facility_memberships(facility_id,person_id,role_code,employment_license_id,valid_from,membership_status,created_by_person_id)
VALUES ('f0110000-0000-4000-8200-000000000001','f0110000-0000-4000-8000-000000000002','doctor','f0110000-0000-4000-8300-000000000002','2020-01-01','active','f0110000-0000-4000-8000-000000000002');
INSERT INTO clinical.encounters(id,patient_person_id,facility_id,responsible_clinician_id,encounter_type,status,started_at)
VALUES ('f0110000-0000-4000-8400-000000000001','f0110000-0000-4000-8000-000000000001','f0110000-0000-4000-8200-000000000001','f0110000-0000-4000-8000-000000000002','consultation','open','2020-01-01');
INSERT INTO clinical.encounter_participants(encounter_id,person_id,role_code,started_at)
VALUES ('f0110000-0000-4000-8400-000000000001','f0110000-0000-4000-8000-000000000002','responsible_clinician','2020-01-01');
COMMIT;

-- Session-local test conveniences never installed in a feature schema. They
-- construct requests/context only; operation calls still run as shifaa_api.
CREATE FUNCTION pg_temp.f011_context(n integer, role_code text, operation text, idem_key text)
RETURNS void LANGUAGE plpgsql AS $test$
BEGIN
 PERFORM set_config('shifaa.environment','local',true);
 PERFORM set_config('shifaa.person_id','f0110000-0000-4000-8000-'||lpad(n::text,12,'0'),true);
 PERFORM set_config('shifaa.actor_role',role_code,true);
 PERFORM set_config('shifaa.aal','2',true);
 PERFORM set_config('shifaa.action',operation,true);
 PERFORM set_config('shifaa.purposes','synthetic.feature011',true);
 PERFORM set_config('shifaa.facility_id','f0110000-0000-4000-8200-000000000001',true);
 PERFORM set_config('shifaa.encounter_id','f0110000-0000-4000-8400-000000000001',true);
 PERFORM set_config('shifaa.idempotency_key',idem_key,true);
END $test$;
CREATE FUNCTION pg_temp.f011_denied(query text, expected_state text)
RETURNS void LANGUAGE plpgsql AS $test$
DECLARE observed_state text;
BEGIN
 BEGIN EXECUTE query;
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS observed_state=RETURNED_SQLSTATE;
  IF observed_state=expected_state THEN RETURN; END IF;
  RAISE;
 END;
 RAISE EXCEPTION 'Expected SQLSTATE %, operation unexpectedly succeeded',expected_state;
END $test$;
CREATE FUNCTION pg_temp.f011_allergy() RETURNS jsonb LANGUAGE sql AS $test$
 SELECT '{"substance":{"identity":"synthetic:no-medical-claim","display":"Neutral synthetic assertion"},"source":{"display":"Synthetic fixture"},"coding":{"knowledge":"unknown"},"reaction":{"knowledge":"unknown"},"severity":{"knowledge":"unknown"},"onset":{"knowledge":"unknown"}}'::jsonb
$test$;
CREATE FUNCTION pg_temp.f011_verification(target text) RETURNS jsonb LANGUAGE sql AS $test$
 SELECT jsonb_build_object('targetStatus',target,'reason','Synthetic verification only','verificationEvidenceRef','f0110000-0000-4000-8500-000000000001','encounterId','f0110000-0000-4000-8400-000000000001')
$test$;
CREATE FUNCTION pg_temp.f011_draft(series_key text, predecessor uuid, effective timestamptz)
RETURNS jsonb LANGUAGE sql AS $test$
 SELECT jsonb_build_object('governedContentKey',series_key,'effectiveScopeKey','synthetic-scope','source',jsonb_build_object('display','Synthetic fixture'),'effectiveAt',effective,'artifact',jsonb_build_object('contentEvidenceRef','f0110000-0000-4000-8500-000000000002','codeEvidenceRef','f0110000-0000-4000-8500-000000000003','testVectorEvidenceRef','f0110000-0000-4000-8500-000000000004'),'predecessor',jsonb_build_object('initial',predecessor IS NULL,'supersedesReleaseId',predecessor))
$test$;
CREATE FUNCTION pg_temp.f011_signature(capacity text, digest text, version integer)
RETURNS jsonb LANGUAGE sql AS $test$
 SELECT jsonb_build_object('capacity',capacity,'decision','approved','artifactVersion',version,'artifactDigest',digest,'signingEvidenceRef','f0110000-0000-4000-8500-000000000005')
$test$;
CREATE FUNCTION pg_temp.f011_publish() RETURNS jsonb LANGUAGE sql AS $test$
 SELECT jsonb_build_object('confirmPublication',true,'artifactVersion',current_setting('shifaa.test_artifact_version')::integer,'artifactDigest',current_setting('shifaa.test_artifact_digest'))
$test$;
CREATE FUNCTION pg_temp.f011_signed_draft(series_key text, predecessor uuid, effective timestamptz)
RETURNS jsonb LANGUAGE plpgsql AS $test$
DECLARE draft jsonb; signed jsonb; release uuid; unique_key text:=gen_random_uuid()::text;
BEGIN
 PERFORM pg_temp.f011_context(5,'ADM-MEDICAL','createClinicalContentRelease','draft-'||unique_key);
 draft:=clinical.create_clinical_content_release_api_v1('synthetic',pg_temp.f011_draft(series_key,predecessor,effective));
 release:=(draft->>'releaseId')::uuid;
 PERFORM pg_temp.f011_context(2,'CLN','signClinicalContentRelease','physician-'||unique_key);
 signed:=clinical.sign_clinical_content_release_api_v1(release,1,pg_temp.f011_signature('physician',draft->>'artifactDigest',(draft->>'artifactVersion')::int));
 PERFORM pg_temp.f011_context(3,'PHA','signClinicalContentRelease','pharmacist-'||unique_key);
 signed:=clinical.sign_clinical_content_release_api_v1(release,2,pg_temp.f011_signature('pharmacist',draft->>'artifactDigest',(draft->>'artifactVersion')::int));
 PERFORM set_config('shifaa.test_artifact_version',draft->>'artifactVersion',true);
 PERFORM set_config('shifaa.test_artifact_digest',draft->>'artifactDigest',true);
 RETURN signed;
END $test$;
