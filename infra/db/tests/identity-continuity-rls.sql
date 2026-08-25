BEGIN;

INSERT INTO identity.continuity_cases(
 id,case_type,status,subject_person_id,public_token_digest,token_key_version,expires_at,created_at
) VALUES (
 '77000000-0000-4000-8000-000000000001','account_recovery','proof_required',
 '50000000-0000-4000-8000-000000000001',decode(repeat('71',32),'hex'),1,
 '2026-08-25T10:15:00Z','2026-08-25T10:00:00Z'
);

INSERT INTO platform.outbox_events(id,aggregate_type,aggregate_id,event_type,payload,aggregate_version)
VALUES
 ('77000000-0000-4000-8000-000000000011','identity','77000000-0000-4000-8000-000000000001','identity.verification.changed','{}',1),
 ('77000000-0000-4000-8000-000000000012','identity','77000000-0000-4000-8000-000000000001','identity.factor.changed','{}',2);
INSERT INTO identity.continuity_cases(
 id,case_type,subject_person_id,subject_patient_id,relationship_id,status,assigned_reviewer_person_id,created_at
) VALUES (
 '77000000-0000-4000-8000-000000000002','dependent_transition',
 '50000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001',
 '56000000-0000-4000-8000-000000000003','review_required',
 '40000000-0000-4000-8000-000000000006','2026-08-25T10:00:00Z'
);

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
