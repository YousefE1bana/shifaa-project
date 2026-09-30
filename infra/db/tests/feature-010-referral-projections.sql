-- C19 runs this matrix after the C18 fixture is seeded and before any referral
-- is accepted or family authority is revoked.
DO $feature_010_c19_live_role_vectors$
DECLARE
  visible_count integer;
  first_referral_id uuid;
  first_created_at text;
  source_projection jsonb;
  subject_projection jsonb;
  expected_pending jsonb := pg_catalog.jsonb_build_object(
    'id','f0101000-0000-4000-8a00-000000000001',
    'sourceEncounterId','f0101000-0000-4000-8800-000000000002',
    'status','pending',
    'version',1,
    'targetSpecialty','cardiology',
    'targetFacilityId','f0101000-0000-4000-8200-000000000001',
    'targetDoctorId','f0101000-0000-4000-8000-000000000003',
    'reasonSummary','C18 PAT reason',
    'encounterType','consultation'
  );
BEGIN
  IF session_user<>'shifaa_api' OR current_user<>'shifaa_api' THEN
    RAISE EXCEPTION 'C19 live role vectors must execute as non-owner shifaa_api';
  END IF;
  PERFORM pg_catalog.set_config('shifaa.environment','local',true);
  PERFORM pg_catalog.set_config('shifaa.test_now','2030-04-05T08:00:00Z',true);
  PERFORM pg_catalog.set_config('shifaa.action','listReferrals',true);
  PERFORM pg_catalog.set_config('shifaa.aal','2',true);
  PERFORM pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);

  -- PAT self, current approved GUA, active two-grant DEL, and source CLN each
  -- see the referral through their own current authority branch.
  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000002',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','PAT',true);
  SELECT count(*),(pg_catalog.array_agg(result.projection))[1]
    INTO visible_count,subject_projection
  FROM clinical.list_referrals_api_v1(NULL,NULL,101,NULL,NULL,NULL,NULL,NULL) result
  WHERE result.referral_id='f0101000-0000-4000-8a00-000000000001';
  IF visible_count<>1 OR subject_projection IS DISTINCT FROM expected_pending THEN
    RAISE EXCEPTION 'C19 PAT did not receive the closed pending subject projection: %',subject_projection;
  END IF;

  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000004',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','GUA',true);
  SELECT count(*),(pg_catalog.array_agg(result.projection))[1]
    INTO visible_count,subject_projection
  FROM clinical.list_referrals_api_v1(NULL,NULL,101,NULL,NULL,NULL,NULL,NULL) result
  WHERE result.referral_id='f0101000-0000-4000-8a00-000000000001';
  IF visible_count<>1 OR subject_projection IS DISTINCT FROM expected_pending THEN
    RAISE EXCEPTION 'C19 active GUA did not receive the closed pending subject projection: %',subject_projection;
  END IF;
  SELECT result.referral_id,result.created_at INTO first_referral_id,first_created_at
  FROM clinical.list_referrals_api_v1(NULL,NULL,1,NULL,NULL,NULL,NULL,NULL) result;
  IF first_referral_id IS NULL THEN RAISE EXCEPTION 'C19 active GUA had no first page'; END IF;
  SELECT count(*) INTO visible_count
  FROM clinical.list_referrals_api_v1(first_created_at,first_referral_id,1,NULL,NULL,NULL,NULL,NULL);
  IF visible_count<>1 THEN RAISE EXCEPTION 'C19 active GUA had no authorized second page before revocation'; END IF;
  PERFORM pg_catalog.set_config('shifaa.test_c19_gua_after_id',first_referral_id::text,true);
  PERFORM pg_catalog.set_config('shifaa.test_c19_gua_after_created_at',first_created_at,true);

  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000005',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','DEL',true);
  SELECT count(*),(pg_catalog.array_agg(result.projection))[1]
    INTO visible_count,subject_projection
  FROM clinical.list_referrals_api_v1(NULL,NULL,101,NULL,NULL,NULL,NULL,NULL) result
  WHERE result.referral_id='f0101000-0000-4000-8a00-000000000001';
  IF visible_count<>1 OR subject_projection IS DISTINCT FROM expected_pending THEN
    RAISE EXCEPTION 'C19 active two-grant DEL did not receive the closed pending subject projection: %',subject_projection;
  END IF;
  SELECT result.referral_id,result.created_at INTO first_referral_id,first_created_at
  FROM clinical.list_referrals_api_v1(NULL,NULL,1,NULL,NULL,NULL,NULL,NULL) result;
  IF first_referral_id IS NULL THEN RAISE EXCEPTION 'C19 active DEL had no first page'; END IF;
  SELECT count(*) INTO visible_count
  FROM clinical.list_referrals_api_v1(first_created_at,first_referral_id,1,NULL,NULL,NULL,NULL,NULL);
  IF visible_count<>1 THEN RAISE EXCEPTION 'C19 active DEL had no authorized second page before revocation'; END IF;
  PERFORM pg_catalog.set_config('shifaa.test_c19_del_after_id',first_referral_id::text,true);
  PERFORM pg_catalog.set_config('shifaa.test_c19_del_after_created_at',first_created_at,true);

  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000001',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','CLN',true);
  SELECT count(*),(pg_catalog.array_agg(result.projection))[1]
    INTO visible_count,source_projection
  FROM clinical.list_referrals_api_v1(NULL,NULL,101,NULL,NULL,NULL,NULL,NULL) result
  WHERE result.referral_id='f0101000-0000-4000-8a00-000000000001';
  IF visible_count<>1
     OR source_projection->>'sourceEncounterId' IS DISTINCT FROM 'f0101000-0000-4000-8800-000000000002'
     OR source_projection->>'status' IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'C19 source CLN did not receive its pending source-care projection: %',source_projection;
  END IF;

  -- The target clinician has active target-facility membership but no current
  -- source encounter authority. A pending target referral remains invisible.
  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000003',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','CLN',true);
  SELECT count(*) INTO visible_count
  FROM clinical.list_referrals_api_v1(NULL,NULL,101,NULL,NULL,NULL,NULL,NULL) result
  WHERE result.referral_id='f0101000-0000-4000-8a00-000000000001';
  IF visible_count<>0 THEN RAISE EXCEPTION 'C19 target CLN saw a pending referral'; END IF;

  -- Client filters intersect live authority; they cannot select another
  -- patient or facility into the result.
  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000002',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','PAT',true);
  SELECT count(*) INTO visible_count
  FROM clinical.list_referrals_api_v1(
    NULL,NULL,101,'f0101000-0000-4000-8000-000000000003',NULL,NULL,NULL,NULL
  ) result;
  IF visible_count<>0 THEN RAISE EXCEPTION 'C19 patient filter widened PAT authority'; END IF;
  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000004',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','GUA',true);
  SELECT count(*) INTO visible_count
  FROM clinical.list_referrals_api_v1(
    NULL,NULL,101,NULL,'f0101000-0000-4000-8200-000000000002',NULL,NULL,NULL
  ) result;
  IF visible_count<>0 THEN RAISE EXCEPTION 'C19 facility filter widened GUA authority'; END IF;
END
$feature_010_c19_live_role_vectors$;

-- C19_POST_ACCEPTANCE_VECTORS
-- The later vectors run after C18 acceptance, guardian revocation, delegate
-- permission revocation, and target membership removal.
SET SESSION AUTHORIZATION shifaa_api;
DO $feature_010_c19_reauthorization_vectors$
DECLARE
  visible_count integer;
  source_projection jsonb;
  subject_projection jsonb;
  expected_accepted_field_codes jsonb := pg_catalog.jsonb_build_array('reason_summary','encounter_type');
BEGIN
  IF session_user<>'shifaa_api' OR current_user<>'shifaa_api' THEN
    RAISE EXCEPTION 'C19 reauthorization vectors must execute as non-owner shifaa_api';
  END IF;
  PERFORM pg_catalog.set_config('shifaa.environment','local',true);
  PERFORM pg_catalog.set_config('shifaa.test_now','2030-04-05T08:00:00Z',true);
  PERFORM pg_catalog.set_config('shifaa.action','listReferrals',true);
  PERFORM pg_catalog.set_config('shifaa.aal','2',true);
  PERFORM pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);

  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000002',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','PAT',true);
  SELECT count(*),(pg_catalog.array_agg(result.projection))[1]
    INTO visible_count,subject_projection
  FROM clinical.list_referrals_api_v1(NULL,NULL,101,NULL,NULL,NULL,NULL,NULL) result
  WHERE result.referral_id='f0101000-0000-4000-8a00-000000000001';
  IF visible_count<>1
     OR subject_projection IS DISTINCT FROM pg_catalog.jsonb_build_object(
       'id','f0101000-0000-4000-8a00-000000000001',
       'sourceEncounterId','f0101000-0000-4000-8800-000000000002',
       'status','accepted',
       'version',2,
       'targetSpecialty','cardiology',
       'targetFacilityId','f0101000-0000-4000-8200-000000000001',
       'targetDoctorId','f0101000-0000-4000-8000-000000000003',
       'reasonSummary','C18 PAT reason',
       'encounterType','consultation',
       'acceptedFieldCodes',expected_accepted_field_codes,
       'resultingAppointmentId',subject_projection->'resultingAppointmentId'
     )
     OR subject_projection->>'resultingAppointmentId' IS NULL
     OR subject_projection ?| ARRAY[
       'notes','privateNoteMetadata','bodyCiphertext','supersedesId',
       'conditions','observations','orders'
     ] THEN
    RAISE EXCEPTION 'C19 PAT did not receive the closed accepted subject projection: %',subject_projection;
  END IF;

  -- The source clinician is also a current target-facility member. Source-care
  -- authority wins and retains the source projection after acceptance.
  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000001',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','CLN',true);
  SELECT count(*),(pg_catalog.array_agg(result.projection))[1]
  INTO visible_count,source_projection
  FROM clinical.list_referrals_api_v1(NULL,NULL,101,NULL,NULL,NULL,NULL,NULL) result
  WHERE result.referral_id='f0101000-0000-4000-8a00-000000000001';
  IF visible_count<>1
     OR source_projection->>'sourceEncounterId' IS DISTINCT FROM 'f0101000-0000-4000-8800-000000000002'
     OR source_projection->>'targetSpecialty' IS DISTINCT FROM 'cardiology'
     OR source_projection->>'reasonSummary' IS DISTINCT FROM 'C18 PAT reason'
     OR source_projection->>'encounterType' IS DISTINCT FROM 'consultation'
     OR source_projection->>'resultingAppointmentId' IS NULL
     OR source_projection ? 'privateNoteMetadata'
     OR source_projection ? 'bodyCiphertext'
     OR source_projection ?| ARRAY[
       'notes','supersedesId','conditions','observations','orders'
     ] THEN
    RAISE EXCEPTION 'C19 current source CLN lost or exceeded the source-care projection: %',source_projection;
  END IF;

  -- The next page must reevaluate the revoked GUA/insufficient DEL authority
  -- instead of returning content from the first-page snapshot.
  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000004',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','GUA',true);
  SELECT count(*) INTO visible_count
  FROM clinical.list_referrals_api_v1(
    pg_catalog.current_setting('shifaa.test_c19_gua_after_created_at'),
    pg_catalog.current_setting('shifaa.test_c19_gua_after_id')::uuid,
    1,NULL,NULL,NULL,NULL,NULL
  ) result;
  IF visible_count<>0 THEN RAISE EXCEPTION 'C19 revoked GUA received newly unauthorized page content'; END IF;
  SELECT count(*) INTO visible_count
  FROM clinical.list_referrals_api_v1(NULL,NULL,101,NULL,NULL,NULL,NULL,NULL) result;
  IF visible_count<>0 THEN RAISE EXCEPTION 'C19 revoked GUA still listed referrals'; END IF;

  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000005',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','DEL',true);
  SELECT count(*) INTO visible_count
  FROM clinical.list_referrals_api_v1(
    pg_catalog.current_setting('shifaa.test_c19_del_after_created_at'),
    pg_catalog.current_setting('shifaa.test_c19_del_after_id')::uuid,
    1,NULL,NULL,NULL,NULL,NULL
  ) result;
  IF visible_count<>0 THEN RAISE EXCEPTION 'C19 one-grant DEL received newly unauthorized page content'; END IF;
  SELECT count(*) INTO visible_count
  FROM clinical.list_referrals_api_v1(NULL,NULL,101,NULL,NULL,NULL,NULL,NULL) result;
  IF visible_count<>0 THEN RAISE EXCEPTION 'C19 DEL with only record.view listed referrals'; END IF;

  -- The target doctor lost current target-facility membership after C18.
  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000003',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','CLN',true);
  SELECT count(*) INTO visible_count
  FROM clinical.list_referrals_api_v1(NULL,NULL,101,NULL,NULL,NULL,NULL,NULL) result
  WHERE result.referral_id='f0101000-0000-4000-8a00-000000000001';
  IF visible_count<>0 THEN RAISE EXCEPTION 'C19 inactive target CLN retained accepted referral visibility'; END IF;

  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000004',true);
  SELECT count(*) INTO visible_count
  FROM clinical.list_referrals_api_v1(NULL,NULL,101,NULL,NULL,NULL,NULL,NULL) result
  WHERE result.referral_id='f0101000-0000-4000-8a00-000000000001';
  IF visible_count<>0 THEN RAISE EXCEPTION 'C19 non-source, non-target CLN saw an accepted referral'; END IF;

  -- Filters cannot move the currently authorized source clinician to another
  -- patient/facility, even for an accepted referral with a linked appointment.
  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000001',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','CLN',true);
  SELECT count(*) INTO visible_count
  FROM clinical.list_referrals_api_v1(
    NULL,NULL,101,'f0101000-0000-4000-8000-000000000003',NULL,NULL,NULL,NULL
  ) result;
  IF visible_count<>0 THEN RAISE EXCEPTION 'C19 patient filter widened source CLN authority'; END IF;
  SELECT count(*) INTO visible_count
  FROM clinical.list_referrals_api_v1(
    NULL,NULL,101,NULL,'f0101000-0000-4000-8200-000000000002',NULL,NULL,NULL
  ) result;
  IF visible_count<>0 THEN RAISE EXCEPTION 'C19 facility filter widened source CLN authority'; END IF;
END
$feature_010_c19_reauthorization_vectors$;
RESET SESSION AUTHORIZATION;

-- Seed a separate, validly reviewed GUA with an expired validity interval so
-- expiry is tested independently from the prior revoked GUA relationship.
DO $feature_010_c19_expired_gua_fixture$
DECLARE
  guardian_id constant uuid := 'f0101000-0000-4000-8000-000000000004';
  relationship_id constant uuid := 'f0101000-0000-4000-8d00-000000000003';
BEGIN
  PERFORM pg_catalog.set_config('shifaa.environment','local',true);
  PERFORM pg_catalog.set_config('shifaa.test_now','2030-04-05T08:00:00Z',true);
  PERFORM pg_catalog.set_config('shifaa.person_id',guardian_id::text,true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','PAT',true);
  PERFORM pg_catalog.set_config('shifaa.purposes','appointment.scheduling',true);
  INSERT INTO identity.private_evidence_objects(
    id,bucket_code,object_key,owner_person_id,resource_patient_id,sha256,mime_type,size_bytes,scan_status
  ) VALUES (
    'f0101000-0000-4000-8c00-000000000002','guardianship-evidence',
    'f010-c19/expired-guardian.pdf',guardian_id,'f0101000-0000-4000-8100-000000000001',
    pg_catalog.repeat('c',64),'application/pdf',32,'released'
  );
  INSERT INTO identity.care_relationships(
    id,subject_patient_id,actor_person_id,relationship_type,status,valid_from,valid_until,
    purpose_code,created_by_person_id,evidence_object_id
  ) VALUES (
    relationship_id,'f0101000-0000-4000-8100-000000000001',guardian_id,
    'guardianship','pending','2020-01-01','2030-04-05T07:59:59Z',
    'clinical.care',guardian_id,'f0101000-0000-4000-8c00-000000000002'
  );
  INSERT INTO identity.care_relationship_permissions(
    relationship_id,permission_code,created_by_person_id
  ) VALUES (relationship_id,'record.view',guardian_id);

  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000001',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','ADM-SUPPORT',true);
  PERFORM pg_catalog.set_config('shifaa.aal','2',true);
  PERFORM pg_catalog.set_config('shifaa.purposes','guardianship_review',true);
  UPDATE identity.care_relationships
  SET status='active',reviewed_by_person_id='f0101000-0000-4000-8000-000000000001',
      reviewed_at='2030-04-05T08:00:00Z',decision_reason_code='synthetic-approved'
  WHERE id=relationship_id;
END
$feature_010_c19_expired_gua_fixture$;

SET SESSION AUTHORIZATION shifaa_api;
DO $feature_010_c19_expired_gua_vector$
DECLARE
  visible_count integer;
BEGIN
  PERFORM pg_catalog.set_config('shifaa.environment','local',true);
  PERFORM pg_catalog.set_config('shifaa.test_now','2030-04-05T08:00:00Z',true);
  PERFORM pg_catalog.set_config('shifaa.action','listReferrals',true);
  PERFORM pg_catalog.set_config('shifaa.aal','2',true);
  PERFORM pg_catalog.set_config('shifaa.purposes','clinical.care',true);
  PERFORM pg_catalog.set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000004',true);
  PERFORM pg_catalog.set_config('shifaa.actor_role','GUA',true);
  SELECT count(*) INTO visible_count
  FROM clinical.list_referrals_api_v1(NULL,NULL,101,NULL,NULL,NULL,NULL,NULL) result
  WHERE result.referral_id='f0101000-0000-4000-8a00-000000000001';
  IF visible_count<>0 THEN RAISE EXCEPTION 'C19 expired GUA still listed referrals'; END IF;
END
$feature_010_c19_expired_gua_vector$;
RESET SESSION AUTHORIZATION;
