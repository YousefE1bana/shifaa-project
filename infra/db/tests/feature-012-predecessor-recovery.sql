-- F007 local restriction release SQL and RLS with synthetic session IDs.
BEGIN;
INSERT INTO identity.people(id,user_id,display_name,profile_status)
VALUES ('74122000-0000-4000-8000-000000000001','74122000-0000-4000-9000-000000000001','Synthetic recovery subject','active');
INSERT INTO identity.continuity_cases(
  id,case_type,subject_person_id,status,public_token_digest,recovery_handle_digest,
  token_key_version,restriction_scope,bound_native_session_id,created_at,expires_at
) VALUES (
  '74122000-0000-4000-8100-000000000001','account_recovery',
  '74122000-0000-4000-8000-000000000001','restricted_enrollment',
  decode(repeat('21',32),'hex'),decode(repeat('22',32),'hex'),1,'mfa_enrollment_only',
  '74122000-0000-4000-8200-000000000001',now(),now()+interval '15 minutes'
);

SET SESSION AUTHORIZATION shifaa_api;
SELECT set_config('shifaa.person_id','74122000-0000-4000-8000-000000000001',true),
       set_config('shifaa.actor_role','PAT',true),
       set_config('shifaa.aal','2',true),
       set_config('shifaa.action','verifyMfaEnrollment',true);
DO $local_release$
DECLARE
  bound_session constant uuid := '74122000-0000-4000-8200-000000000001';
  other_session constant uuid := '74122000-0000-4000-8200-000000000002';
  attempt record;
  changed integer;
  observed identity.continuity_cases%ROWTYPE;
BEGIN
  FOR attempt IN SELECT * FROM (VALUES
    ('unbound',other_session,0),('bound',bound_session,1),('replay',bound_session,0)
  ) AS attempts(label, session_id, expected) LOOP
    PERFORM set_config('shifaa.session_id',attempt.session_id::text,true);
    UPDATE identity.continuity_cases
    SET status='completed',restriction_scope=NULL,bound_native_session_id=NULL,
        completed_at=now(),updated_at=now()
    WHERE status='restricted_enrollment' AND bound_native_session_id=attempt.session_id
      AND case_type='account_recovery';
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed<>attempt.expected THEN
      RAISE EXCEPTION 'local release % expected % row(s), changed %',attempt.label,attempt.expected,changed;
    END IF;
    RAISE NOTICE 'local release % changed % row(s)',attempt.label,changed;
    SELECT * INTO STRICT observed FROM identity.continuity_cases
    WHERE id='74122000-0000-4000-8100-000000000001';
    IF attempt.session_id=other_session THEN
      IF changed<>0 OR observed.status<>'restricted_enrollment' OR observed.version<>1
         OR observed.bound_native_session_id IS DISTINCT FROM bound_session
         OR observed.restriction_scope IS DISTINCT FROM 'mfa_enrollment_only' THEN
        RAISE EXCEPTION 'unbound session changed a restriction';
      END IF;
    ELSIF observed.status<>'completed' OR observed.version<>2 OR observed.completed_at IS NULL
       OR observed.bound_native_session_id IS NOT NULL OR observed.restriction_scope IS NOT NULL THEN
      RAISE EXCEPTION 'bound enrollment did not complete exactly one restricted version';
    END IF;
  END LOOP;
END
$local_release$;
RESET SESSION AUTHORIZATION;
ROLLBACK;
