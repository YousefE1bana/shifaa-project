\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE shifaa_api;
SELECT set_config('shifaa.actor_role','PAT',true);
SELECT set_config('shifaa.aal','1',true);
SELECT set_config('shifaa.purposes','family_support',true);
SELECT set_config('shifaa.person_id','40000000-0000-4000-8000-000000000001',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM identity.care_relationships WHERE subject_patient_id='41000000-0000-4000-8000-000000000001')<>1 THEN RAISE EXCEPTION 'self relationship missing'; END IF;
 IF EXISTS(SELECT 1 FROM identity.care_relationships WHERE subject_patient_id='41000000-0000-4000-8000-000000000002') THEN RAISE EXCEPTION 'cross-patient relationship leak'; END IF;
 IF EXISTS(SELECT 1 FROM identity.emergency_contacts WHERE subject_patient_id='41000000-0000-4000-8000-000000000003') THEN RAISE EXCEPTION 'cross-patient contact leak'; END IF;
END $$;

SELECT set_config('shifaa.person_id','40000000-0000-4000-8000-000000000003',true);
DO $$ BEGIN
 BEGIN
  INSERT INTO identity.care_relationships(subject_patient_id,actor_person_id,relationship_type,status,purpose_code,valid_from,created_by_person_id,evidence_object_id)
  VALUES('41000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000003','guardianship','pending','dependent_care',now(),'40000000-0000-4000-8000-000000000003','42000000-0000-4000-8000-000000000002');
  RAISE EXCEPTION 'quarantined evidence accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  INSERT INTO identity.care_relationships(subject_patient_id,actor_person_id,relationship_type,status,purpose_code,valid_from,created_by_person_id,evidence_object_id)
  VALUES('41000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000003','guardianship','pending','dependent_care',now(),'40000000-0000-4000-8000-000000000003','42000000-0000-4000-8000-000000000004');
  RAISE EXCEPTION 'wrong-patient evidence accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

SELECT set_config('shifaa.person_id','40000000-0000-4000-8000-000000000006',true);
SELECT set_config('shifaa.actor_role','ADM-SUPPORT',true);
SELECT set_config('shifaa.aal','1',true);
SELECT set_config('shifaa.purposes','guardianship_review',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM identity.care_relationships WHERE id='43000000-0000-4000-8000-000000000002') THEN RAISE EXCEPTION 'AAL1 review leak'; END IF; END $$;
SELECT set_config('shifaa.aal','2',true); SELECT set_config('shifaa.purposes','wrong_purpose',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM identity.care_relationships WHERE id='43000000-0000-4000-8000-000000000002') THEN RAISE EXCEPTION 'wrong-purpose review leak'; END IF; END $$;
SELECT set_config('shifaa.purposes','guardianship_review',true);
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM identity.care_relationships WHERE id='43000000-0000-4000-8000-000000000002') THEN RAISE EXCEPTION 'authorized review missing'; END IF; END $$;
UPDATE identity.care_relationships SET status='active',valid_until=now()+interval '1 year',reviewed_by_person_id='40000000-0000-4000-8000-000000000006',reviewed_at=now(),decision_reason_code='synthetic_approved' WHERE id='43000000-0000-4000-8000-000000000002';

SELECT set_config('shifaa.person_id','40000000-0000-4000-8000-000000000003',true);
SELECT set_config('shifaa.actor_role','PAT',true); SELECT set_config('shifaa.aal','1',true); SELECT set_config('shifaa.purposes','dependent_care',true);
DO $$ BEGIN
 IF NOT platform.person_has_family_relationship('41000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000003','record.view') THEN RAISE EXCEPTION 'active guardian permission missing'; END IF;
 IF platform.person_has_family_relationship('41000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000003','sos.activate') THEN RAISE EXCEPTION 'permission inflation'; END IF;
 IF platform.person_has_family_relationship('41000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000003','record.view') THEN RAISE EXCEPTION 'cross-patient authority'; END IF;
END $$;
SELECT set_config('shifaa.purposes','wrong_purpose',true);
DO $$ BEGIN
 IF platform.person_has_family_relationship('41000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000003','record.view') THEN RAISE EXCEPTION 'wrong-purpose family authority'; END IF;
END $$;
SELECT set_config('shifaa.purposes','dependent_care',true);
DO $$ BEGIN
 BEGIN DELETE FROM identity.care_relationships WHERE id='43000000-0000-4000-8000-000000000002'; RAISE EXCEPTION 'relationship delete allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE identity.care_relationships SET actor_person_id='40000000-0000-4000-8000-000000000005' WHERE id='43000000-0000-4000-8000-000000000002'; RAISE EXCEPTION 'immutable actor changed'; EXCEPTION WHEN check_violation THEN NULL; WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE identity.care_relationships SET purpose_code='rewritten' WHERE id='43000000-0000-4000-8000-000000000002'; RAISE EXCEPTION 'relationship purpose changed'; EXCEPTION WHEN check_violation THEN NULL; WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE identity.care_relationships SET evidence_object_id='42000000-0000-4000-8000-000000000004' WHERE id='43000000-0000-4000-8000-000000000002'; RAISE EXCEPTION 'guardianship evidence changed'; EXCEPTION WHEN check_violation THEN NULL; WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO identity.care_relationship_permissions(relationship_id,permission_code,created_by_person_id) VALUES('43000000-0000-4000-8000-000000000002','sos.activate','40000000-0000-4000-8000-000000000003'); RAISE EXCEPTION 'active guardian inflated permissions'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

SELECT set_config('shifaa.person_id','40000000-0000-4000-8000-000000000001',true);
SELECT set_config('shifaa.purposes','family_support',true);
INSERT INTO identity.care_relationships(id,subject_patient_id,actor_person_id,relationship_type,status,purpose_code,valid_from,valid_until,created_by_person_id,invite_token_digest,invite_key_version,invite_expires_at)
VALUES('43000000-0000-4000-8000-000000000020','41000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000004','delegation','pending','family_support',now(),now()+interval '1 year','40000000-0000-4000-8000-000000000001',decode(repeat('aa',32),'hex'),1,now()+interval '1 day');
INSERT INTO identity.care_relationship_permissions(relationship_id,permission_code,created_by_person_id) VALUES('43000000-0000-4000-8000-000000000020','record.view','40000000-0000-4000-8000-000000000001');
INSERT INTO identity.emergency_contacts(id,subject_patient_id,created_by_person_id,display_name_ciphertext,display_name_nonce,display_name_authentication_tag,display_name_key_version,phone_ciphertext,phone_nonce,phone_authentication_tag,phone_key_version,masked_phone,phone_blind_index,preferred_locale,location_precision,status,invite_token_digest,invite_key_version,invite_expires_at)
VALUES('44000000-0000-4000-8000-000000000020','41000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',decode('01','hex'),decode(repeat('02',12),'hex'),decode(repeat('03',16),'hex'),1,decode('04','hex'),decode(repeat('05',12),'hex'),decode(repeat('06',16),'hex'),1,'+999••••0000',decode(repeat('07',32),'hex'),'ar-EG','coarse','pending',decode(repeat('08',32),'hex'),1,now()+interval '1 day');
SELECT * FROM platform.respond_emergency_contact_invite(decode(repeat('08',32),'hex'),'confirmed');
DO $$ BEGIN
 BEGIN UPDATE identity.emergency_contacts SET masked_phone='+999••••9999' WHERE id='44000000-0000-4000-8000-000000000020'; RAISE EXCEPTION 'confirmed contact identity substituted'; EXCEPTION WHEN check_violation THEN NULL; END;
END $$;

SELECT set_config('shifaa.person_id','40000000-0000-4000-8000-000000000004',true);
UPDATE identity.care_relationships SET status='active',invite_token_digest=NULL,invite_expires_at=NULL,invite_consumed_at=now() WHERE id='43000000-0000-4000-8000-000000000020';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM identity.emergency_contacts WHERE subject_patient_id='41000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'delegate read Emergency Contacts'; END IF;
 BEGIN INSERT INTO identity.care_relationship_permissions(relationship_id,permission_code,created_by_person_id) VALUES('43000000-0000-4000-8000-000000000020','sos.activate','40000000-0000-4000-8000-000000000004'); RAISE EXCEPTION 'delegate inflated own permissions'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE identity.care_relationships SET valid_until=NULL WHERE id='43000000-0000-4000-8000-000000000020'; RAISE EXCEPTION 'delegate extended own validity'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO identity.emergency_contacts(id,subject_patient_id,created_by_person_id,display_name_ciphertext,display_name_nonce,display_name_authentication_tag,display_name_key_version,phone_ciphertext,phone_nonce,phone_authentication_tag,phone_key_version,masked_phone,phone_blind_index,preferred_locale,location_precision,status,invite_token_digest,invite_key_version,invite_expires_at) VALUES(gen_random_uuid(),'41000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000004',decode('01','hex'),decode(repeat('02',12),'hex'),decode(repeat('03',16),'hex'),1,decode('04','hex'),decode(repeat('05',12),'hex'),decode(repeat('06',16),'hex'),1,'+999••••0001',decode(repeat('09',32),'hex'),'ar-EG','none','pending',decode(repeat('10',32),'hex'),1,now()+interval '1 day'); RAISE EXCEPTION 'delegate created Emergency Contact'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

SELECT set_config('shifaa.person_id','40000000-0000-4000-8000-000000000005',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM identity.care_relationships WHERE id='43000000-0000-4000-8000-000000000002') THEN RAISE EXCEPTION 'unrelated relationship leak'; END IF;
 IF EXISTS(SELECT 1 FROM identity.private_evidence_objects WHERE id IN ('42000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000004')) THEN RAISE EXCEPTION 'other owner private evidence leak'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
