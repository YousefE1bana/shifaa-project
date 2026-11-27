-- Current F004 delegation and purpose behavior under the installed API role.
-- The transaction clock is stable, so start and end equality are deterministic.
BEGIN;
INSERT INTO identity.people(id,user_id,display_name,profile_status)
VALUES
  ('74121000-0000-4000-8000-000000000001','74121000-0000-4000-9000-000000000001','Synthetic delegator','active'),
  ('74121000-0000-4000-8000-000000000002','74121000-0000-4000-9000-000000000002','Synthetic delegate','active');
INSERT INTO identity.patients(id,person_id,medical_record_number,record_status)
VALUES ('74121000-0000-4000-8100-000000000001','74121000-0000-4000-8000-000000000001','T012-family-window','active');

SET SESSION AUTHORIZATION shifaa_api;
DO $family_window$
DECLARE
  patient constant uuid := '74121000-0000-4000-8100-000000000001';
  delegator constant uuid := '74121000-0000-4000-8000-000000000001';
  delegate constant uuid := '74121000-0000-4000-8000-000000000002';
  relationship_id uuid;
  sample constant timestamptz := transaction_timestamp();
  boundary record;
  effective boolean;
BEGIN
  FOR boundary IN SELECT * FROM (VALUES
    ('before start', sample + interval '1 microsecond', sample + interval '1 day', false),
    ('at start', sample, sample + interval '1 day', true),
    ('before end', sample - interval '1 day', sample + interval '1 microsecond', true),
    ('at end', sample - interval '1 day', sample, false),
    ('after end', sample - interval '1 day', sample - interval '1 microsecond', false)
  ) AS dates(label, valid_from, valid_until, expected) LOOP
    relationship_id := gen_random_uuid();
    PERFORM set_config('shifaa.person_id',delegator::text,true);
    PERFORM set_config('shifaa.actor_role','PAT',true);
    PERFORM set_config('shifaa.aal','2',true);
    PERFORM set_config('shifaa.purposes','family_support',true);
    INSERT INTO identity.care_relationships
      (id,subject_patient_id,actor_person_id,relationship_type,status,purpose_code,
       valid_from,valid_until,created_by_person_id,invite_token_digest,invite_key_version,invite_expires_at)
    VALUES (relationship_id,patient,delegate,'delegation','pending','family_support',
            boundary.valid_from,boundary.valid_until,delegator,decode(repeat('31',32),'hex'),1,sample+interval '1 day');
    INSERT INTO identity.care_relationship_permissions(relationship_id,permission_code,created_by_person_id)
    VALUES (relationship_id,'record.view',delegator);
    PERFORM set_config('shifaa.person_id',delegate::text,true);
    PERFORM set_config('shifaa.actor_role','DEL',true);
    UPDATE identity.care_relationships
    SET status='active',invite_token_digest=NULL,invite_key_version=NULL,invite_expires_at=NULL,invite_consumed_at=sample
    WHERE id=relationship_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'synthetic delegation acceptance did not write'; END IF;

    effective := platform.person_has_family_relationship(patient,delegate,'record.view');
    IF effective IS DISTINCT FROM boundary.expected THEN
      RAISE EXCEPTION 'delegation window % expected %, observed %',boundary.label,boundary.expected,effective;
    END IF;
    PERFORM set_config('shifaa.purposes','appointment.scheduling',true);
    IF platform.person_has_family_relationship(patient,delegate,'record.view') THEN
      RAISE EXCEPTION 'unmatched purpose authorized delegation at %',boundary.label;
    END IF;

    PERFORM set_config('shifaa.person_id',delegator::text,true);
    PERFORM set_config('shifaa.actor_role','PAT',true);
    PERFORM set_config('shifaa.purposes','family_support',true);
    UPDATE identity.care_relationships SET status='revoked' WHERE id=relationship_id;
    IF NOT FOUND OR platform.person_has_family_relationship(patient,delegate,'record.view') THEN
      RAISE EXCEPTION 'delegation revocation did not remove current authority';
    END IF;
    RAISE NOTICE 'delegation %: expected %, observed %; wrong purpose and revoked denied',
      boundary.label,boundary.expected,effective;
  END LOOP;
END
$family_window$;
RESET SESSION AUTHORIZATION;
ROLLBACK;
