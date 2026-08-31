BEGIN;

INSERT INTO identity.continuity_cases(
 id,case_type,status,subject_person_id,public_token_digest,recovery_handle_digest,token_key_version,expires_at,created_at
) VALUES (
 '77000000-0000-4000-8000-000000000001','account_recovery','proof_required',
 '50000000-0000-4000-8000-000000000001',decode(repeat('71',32),'hex'),decode(repeat('72',32),'hex'),1,
 '2026-08-25T10:15:00Z','2026-08-25T10:00:00Z'
);

INSERT INTO platform.outbox_events(id,aggregate_type,aggregate_id,event_type,payload,aggregate_version)
VALUES
 ('77000000-0000-4000-8000-000000000011','identity','77000000-0000-4000-8000-000000000001','identity.verification.changed','{}',1),
 ('77000000-0000-4000-8000-000000000012','identity','77000000-0000-4000-8000-000000000001','identity.factor.changed',
  '{"recipientPersonId":"50000000-0000-4000-8000-000000000001","support_action":"verified","action_time":"2026-08-25T10:00:00Z"}',2);
INSERT INTO identity.continuity_cases(
 id,case_type,subject_person_id,subject_patient_id,relationship_id,status,assigned_reviewer_person_id,created_at
) VALUES (
 '77000000-0000-4000-8000-000000000002','dependent_transition',
 '50000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001',
 '56000000-0000-4000-8000-000000000003','review_required',
 '40000000-0000-4000-8000-000000000006','2026-08-25T10:00:00Z'
);

SELECT set_config('shifaa.person_id','50000000-0000-4000-8000-000000000008',true);
INSERT INTO identity.admin_role_grants(
  id,person_id,role_code,status,valid_from,valid_until,proposed_by
) VALUES (
  '77000000-0000-4000-8000-000000000020','40000000-0000-4000-8000-000000000006',
  'support_admin','pending','2026-01-01T00:00:00Z','2027-01-01T00:00:00Z',
  '50000000-0000-4000-8000-000000000008'
);
SELECT set_config('shifaa.person_id','50000000-0000-4000-8000-000000000009',true);
UPDATE identity.admin_role_grants SET status='active',
  decided_by='50000000-0000-4000-8000-000000000009',decision_reason='synthetic.transition.assignment'
WHERE id='77000000-0000-4000-8000-000000000020';
SELECT set_config('shifaa.person_id','50000000-0000-4000-8000-000000000001',true);
INSERT INTO identity.care_relationships(
  id,subject_patient_id,actor_person_id,relationship_type,status,valid_from,created_by_person_id,
  purpose_code,invite_token_digest,invite_key_version,invite_expires_at
) VALUES (
  '77000000-0000-4000-8000-000000000021','51000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000003','delegation','pending','2026-08-25T09:00:00Z',
  '50000000-0000-4000-8000-000000000001','family_support',decode(repeat('7a',32),'hex'),1,
  '2099-08-26T10:00:00Z'
);
INSERT INTO identity.care_relationship_permissions(relationship_id,permission_code,created_by_person_id)
VALUES ('77000000-0000-4000-8000-000000000021','record.view','50000000-0000-4000-8000-000000000001');
SELECT set_config('shifaa.person_id','50000000-0000-4000-8000-000000000003',true);
UPDATE identity.care_relationships SET status='active',invite_token_digest=NULL,invite_expires_at=NULL,
  invite_consumed_at='2026-08-25T09:05:00Z'
WHERE id='77000000-0000-4000-8000-000000000021';

CREATE TEMP TABLE transition_record_before AS
SELECT
  (SELECT md5(row(p.*)::text) FROM identity.people p WHERE p.id='50000000-0000-4000-8000-000000000001') person_hash,
  (SELECT md5(row(p.*)::text) FROM identity.patients p WHERE p.id='51000000-0000-4000-8000-000000000001') patient_hash,
  (SELECT p.medical_record_number FROM identity.patients p WHERE p.id='51000000-0000-4000-8000-000000000001') mrn,
  (SELECT md5(row(r.*)::text) FROM identity.care_relationships r WHERE r.id='56000000-0000-4000-8000-000000000001') self_hash;

SET LOCAL ROLE shifaa_api;
SELECT set_config('shifaa.environment','ci',true);
SELECT set_config('shifaa.test_now','2026-08-25T10:00:00Z',true);
SELECT set_config('shifaa.person_id','50000000-0000-4000-8000-000000000001',true);
SELECT set_config('shifaa.actor_role','PAT',true);
SELECT set_config('shifaa.action','completeRecovery',true);
SELECT set_config('shifaa.case_id','77000000-0000-4000-8000-000000000001',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM identity.continuity_cases)<>2 THEN RAISE EXCEPTION 'subject own minimum projection failed'; END IF;
 IF (SELECT count(*) FROM identity.continuity_cases WHERE id='77000000-0000-4000-8000-000000000001')<>1
   THEN RAISE EXCEPTION 'subject recovery case projection failed'; END IF;
END $$;

SELECT set_config('shifaa.person_id','50000000-0000-4000-8000-000000000002',true);
SELECT set_config('shifaa.case_id','',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM identity.continuity_cases) THEN RAISE EXCEPTION 'foreign subject case leaked'; END IF;
END $$;

SELECT set_config('shifaa.person_id','40000000-0000-4000-8000-000000000006',true);
SELECT set_config('shifaa.actor_role','ADM-SUPPORT',true);
SELECT set_config('shifaa.aal','2',true);
SELECT set_config('shifaa.purposes','guardianship_review',true);
SELECT set_config('shifaa.action','transitionDependent',true);
SELECT set_config('shifaa.factor_amr_at','2026-08-25T09:55:00Z',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM identity.continuity_cases)<>1 THEN RAISE EXCEPTION 'assigned reviewer projection failed'; END IF;
END $$;

SELECT set_config('shifaa.person_id','40000000-0000-4000-8000-000000000007',true);
DO $$ BEGIN
 PERFORM platform.decide_dependent_transition(
   '56000000-0000-4000-8000-000000000003',1,'defer','human_review.dispute','dispute'
 );
 RAISE EXCEPTION 'unassigned reviewer deferred transition';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
SELECT set_config('shifaa.person_id','40000000-0000-4000-8000-000000000006',true);

CREATE TEMP TABLE transition_approved AS
SELECT * FROM platform.decide_dependent_transition(
  '56000000-0000-4000-8000-000000000003',1,'approve','human_review.approved',NULL
);
RESET ROLE;
DO $$
DECLARE approved identity.continuity_cases;
DECLARE before_record transition_record_before%ROWTYPE;
BEGIN
 SELECT * INTO approved FROM transition_approved;
 SELECT * INTO before_record FROM transition_record_before;
 IF approved.status<>'approved' OR approved.version<>2 THEN RAISE EXCEPTION 'transition approval failed'; END IF;
 IF before_record.person_hash<>(SELECT md5(row(p.*)::text) FROM identity.people p WHERE p.id=approved.subject_person_id)
   OR before_record.patient_hash<>(SELECT md5(row(p.*)::text) FROM identity.patients p WHERE p.id=approved.subject_patient_id)
   OR before_record.mrn<>(SELECT p.medical_record_number FROM identity.patients p WHERE p.id=approved.subject_patient_id)
   OR before_record.self_hash<>(SELECT md5(row(r.*)::text) FROM identity.care_relationships r WHERE r.id='56000000-0000-4000-8000-000000000001')
 THEN RAISE EXCEPTION 'same-record continuity failed'; END IF;
 PERFORM set_config('shifaa.purposes','privacy_dsr',true);
 IF platform.person_has_family_relationship(
   approved.subject_patient_id,'50000000-0000-4000-8000-000000000002','consent.manage'
 ) THEN RAISE EXCEPTION 'former guardian retained authority'; END IF;
 PERFORM set_config('shifaa.purposes','family_support',true);
 IF NOT platform.person_has_family_relationship(
   approved.subject_patient_id,'50000000-0000-4000-8000-000000000003','record.view'
 ) OR platform.person_has_family_relationship(
   approved.subject_patient_id,'50000000-0000-4000-8000-000000000003','medication.manage'
 ) THEN RAISE EXCEPTION 'later lawful grant scope failed'; END IF;
 IF platform.person_has_family_relationship(
   approved.subject_patient_id,'50000000-0000-4000-8000-000000000007','record.view'
 ) THEN RAISE EXCEPTION 'later access without a separate grant was allowed'; END IF;
END $$;

DO $$ BEGIN
 IF EXISTS(
   SELECT 1 FROM pg_roles r
   WHERE r.rolname IN ('anon','authenticated') AND (
     has_function_privilege(r.rolname,'platform.decide_dependent_transition(uuid,integer,text,text,text)','EXECUTE')
     OR has_table_privilege(r.rolname,'identity.continuity_cases','SELECT')
   )
 )
 THEN RAISE EXCEPTION 'direct public transition access detected'; END IF;
END $$;

SET LOCAL ROLE shifaa_api;
SELECT set_config('shifaa.person_id','40000000-0000-4000-8000-000000000006',true);
SELECT set_config('shifaa.actor_role','ADM-SUPPORT',true);
SELECT set_config('shifaa.aal','2',true);
SELECT set_config('shifaa.purposes','guardianship_review',true);
SELECT set_config('shifaa.action','transitionDependent',true);
SELECT set_config('shifaa.factor_amr_at','2026-08-25T09:55:00Z',true);

SELECT set_config('shifaa.aal','1',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM identity.continuity_cases) THEN RAISE EXCEPTION 'AAL1 reviewer case leaked'; END IF;
END $$;
SELECT set_config('shifaa.aal','2',true);
SELECT set_config('shifaa.purposes','wrong_purpose',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM identity.continuity_cases) THEN RAISE EXCEPTION 'wrong-purpose reviewer case leaked'; END IF;
END $$;

SELECT set_config('shifaa.person_id','40000000-0000-4000-8000-000000000007',true);
SELECT set_config('shifaa.purposes','guardianship_review',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM identity.continuity_cases) THEN RAISE EXCEPTION 'unassigned reviewer case leaked'; END IF;
END $$;

RESET ROLE;
DO $$
BEGIN
  IF EXISTS(
    SELECT 1 FROM information_schema.role_table_grants
    WHERE grantee='shifaa_worker' AND table_schema='auth' AND table_name='users'
      AND privilege_type='SELECT'
  ) THEN RAISE EXCEPTION 'worker must not read Supabase Auth recipients'; END IF;
  IF EXISTS(
    SELECT 1 FROM information_schema.role_table_grants
    WHERE grantee='shifaa_worker' AND table_schema='identity'
      AND table_name='emergency_contacts' AND privilege_type='SELECT'
  ) THEN RAISE EXCEPTION 'worker must not read Emergency Contact recipients'; END IF;
END $$;
SET LOCAL ROLE shifaa_worker;
DO $$
BEGIN
  IF (SELECT count(*) FROM platform.outbox_events WHERE event_type='identity.factor.changed')<>1
    THEN RAISE EXCEPTION 'worker allowed identity event missing'; END IF;
  IF EXISTS(
    SELECT 1 FROM platform.outbox_events
    WHERE event_type='identity.verification.changed'
  ) THEN RAISE EXCEPTION 'worker unrelated identity event leaked'; END IF;
END
$$;

RESET ROLE;
ROLLBACK;
