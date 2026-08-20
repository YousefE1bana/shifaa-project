\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE forced_count integer; event_constraint text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='identity' AND table_name='care_relationships' AND column_name='created_by_person_id' AND is_nullable='NO') THEN RAISE EXCEPTION 'relationship attribution column missing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='identity' AND table_name='private_evidence_objects' AND column_name='resource_patient_id') THEN RAISE EXCEPTION 'evidence patient binding missing'; END IF;
 IF to_regclass('identity.care_relationship_permissions') IS NULL OR to_regclass('identity.emergency_contacts') IS NULL OR to_regclass('identity.relationship_authorization_uses') IS NULL THEN RAISE EXCEPTION 'family tables missing'; END IF;
 SELECT count(*) INTO forced_count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='identity' AND c.relname IN ('care_relationships','care_relationship_permissions','emergency_contacts','relationship_authorization_uses') AND c.relrowsecurity AND c.relforcerowsecurity;
 IF forced_count<>4 THEN RAISE EXCEPTION 'all family tables must force RLS'; END IF;
 IF EXISTS(SELECT 1 FROM information_schema.role_table_grants WHERE grantee='shifaa_api' AND table_schema='identity' AND table_name IN ('care_relationships','care_relationship_permissions','emergency_contacts','relationship_authorization_uses') AND privilege_type='DELETE') THEN RAISE EXCEPTION 'family delete grant exists'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='identity' AND indexname='care_relationship_equivalent_current_uq') OR NOT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='identity' AND indexname='emergency_contact_current_phone_uq') THEN RAISE EXCEPTION 'current uniqueness indexes missing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='family_relationship_guard' AND tgenabled<>'D') OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='emergency_contact_guard' AND tgenabled<>'D') OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='relationship_authorization_uses_append_only' AND tgenabled<>'D') THEN RAISE EXCEPTION 'state or immutability trigger missing'; END IF;
 IF EXISTS(SELECT 1 FROM identity.care_relationships WHERE relationship_type NOT IN ('self','guardianship','delegation')) THEN RAISE EXCEPTION 'relationship type widened'; END IF;
 IF EXISTS(SELECT 1 FROM identity.care_relationships WHERE relationship_type='self' AND status<>'active') THEN RAISE EXCEPTION 'self invariant changed'; END IF;
 IF (SELECT count(*) FROM identity.private_evidence_objects WHERE bucket_code='guardianship-evidence' AND id IN ('42000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000002','42000000-0000-4000-8000-000000000003','42000000-0000-4000-8000-000000000004'))<>4 THEN RAISE EXCEPTION 'deterministic family evidence seed missing'; END IF;
 IF NOT EXISTS(
  SELECT 1 FROM identity.care_relationships r
  WHERE r.id='43000000-0000-4000-8000-000000000002'
    AND r.relationship_type='guardianship' AND r.status='pending'
    AND r.evidence_object_id='42000000-0000-4000-8000-000000000001'
 ) OR (SELECT count(*) FROM identity.care_relationship_permissions WHERE relationship_id='43000000-0000-4000-8000-000000000002' AND revoked_at IS NULL)<>3
 THEN RAISE EXCEPTION 'deterministic pending guardianship seed missing'; END IF;
 SELECT pg_get_constraintdef(oid) INTO event_constraint FROM pg_constraint WHERE conname='outbox_events_event_type_check';
 IF event_constraint NOT LIKE '%relationship.guardianship.changed%' OR event_constraint NOT LIKE '%sos.emergency_contact.requested%' THEN RAISE EXCEPTION 'closed family events missing'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE proname ILIKE '%transition%dependent%' OR proname ILIKE '%age%capacity%') THEN RAISE EXCEPTION 'forbidden dependent transition function exists'; END IF;
END $$;

SELECT set_config('shifaa.person_id','40000000-0000-4000-8000-000000000003',true);
DO $$ BEGIN
 BEGIN
  INSERT INTO identity.care_relationships(subject_patient_id,actor_person_id,relationship_type,status,valid_from,created_by_person_id)
  VALUES('41000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000003','emergency_contact','active',now(),'40000000-0000-4000-8000-000000000003');
  RAISE EXCEPTION 'unknown relationship type accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 PERFORM set_config('shifaa.person_id','40000000-0000-4000-8000-000000000001',true);
 BEGIN
  INSERT INTO identity.emergency_contacts(subject_patient_id,created_by_person_id,display_name_ciphertext,display_name_nonce,display_name_authentication_tag,display_name_key_version,phone_ciphertext,phone_nonce,phone_authentication_tag,phone_key_version,masked_phone,phone_blind_index,preferred_locale,location_precision,status,invite_token_digest,invite_key_version,invite_expires_at)
  VALUES('41000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',decode('01','hex'),decode('000000000000000000000000','hex'),decode('00000000000000000000000000000000','hex'),1,decode('02','hex'),decode('000000000000000000000000','hex'),decode('00000000000000000000000000000000','hex'),1,'+999••••0000',decode(repeat('01',32),'hex'),'ar-EG','city','pending',decode(repeat('02',32),'hex'),1,now()+interval '1 day');
  RAISE EXCEPTION 'unknown location precision accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
ROLLBACK;
