BEGIN;

DO $$
DECLARE missing text[];
BEGIN
  IF to_regclass('identity.continuity_cases') IS NULL THEN RAISE EXCEPTION 'continuity_cases missing'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='identity' AND c.relname='continuity_cases' AND c.relrowsecurity AND c.relforcerowsecurity
  ) THEN RAISE EXCEPTION 'continuity_cases must enable and force RLS'; END IF;
  SELECT array_agg(name ORDER BY name) INTO missing
  FROM unnest(ARRAY[
    'continuity_subject_history_idx','continuity_subject_patient_fk_idx','continuity_relationship_fk_idx',
    'continuity_verification_case_fk_idx','continuity_assigned_reviewer_fk_idx','continuity_reviewer_fk_idx',
    'continuity_live_recovery_subject_uq','continuity_live_transition_relationship_uq',
    'continuity_restricted_native_session_uq','continuity_reviewer_worklist_idx','continuity_expiry_idx'
  ]) AS name
  WHERE to_regclass('identity.'||name) IS NULL;
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'continuity indexes missing: %',missing; END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='shifaa_api' AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'shifaa_api must remain non-superuser and non-BYPASSRLS';
  END IF;
  IF EXISTS(
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema='identity' AND table_name='continuity_cases'
      AND grantee IN ('PUBLIC','anon','authenticated')
  ) THEN RAISE EXCEPTION 'direct client table grant detected'; END IF;
END
$$;

DO $$
BEGIN
  IF identity.transition_eligible_on('2005-08-26','2026-08-25') THEN RAISE EXCEPTION 'before 21 must deny'; END IF;
  IF NOT identity.transition_eligible_on('2005-08-25','2026-08-25') THEN RAISE EXCEPTION 'exact 21 must be eligible'; END IF;
  IF identity.transition_eligible_on('2008-08-25','2026-08-25') THEN RAISE EXCEPTION 'age 18 must not trigger'; END IF;
END
$$;

INSERT INTO identity.continuity_cases(
  id,case_type,status,public_token_digest,recovery_handle_digest,token_key_version,expires_at,created_at
) VALUES
 ('75000000-0000-4000-8000-000000000001','account_recovery','requested',decode(repeat('11',32),'hex'),decode(repeat('12',32),'hex'),1,'2026-08-25T10:15:00Z','2026-08-25T10:00:00Z'),
 ('75000000-0000-4000-8000-000000000002','account_recovery','requested',decode(repeat('22',32),'hex'),decode(repeat('23',32),'hex'),1,'2026-08-23T09:00:00Z','2026-08-23T08:45:00Z'),
 ('75000000-0000-4000-8000-000000000004','account_recovery','requested',decode(repeat('24',32),'hex'),decode(repeat('25',32),'hex'),1,'2026-08-25T09:59:00Z','2026-08-25T09:44:00Z');

INSERT INTO identity.continuity_cases(
  id,case_type,subject_person_id,subject_patient_id,relationship_id,status,assigned_reviewer_person_id,created_at
) VALUES (
 '75000000-0000-4000-8000-000000000003','dependent_transition',
 '50000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001',
 '56000000-0000-4000-8000-000000000003','review_required',
 '40000000-0000-4000-8000-000000000006','2026-08-25T10:00:00Z'
);

DO $$
BEGIN
  BEGIN
    INSERT INTO identity.continuity_cases(
      case_type,status,public_token_digest,recovery_handle_digest,token_key_version,expires_at,subject_patient_id
    ) VALUES ('account_recovery','requested',decode(repeat('33',32),'hex'),decode(repeat('34',32),'hex'),1,now()+interval '15 minutes','51000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'invalid recovery shape accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO identity.continuity_cases(
      case_type,subject_person_id,subject_patient_id,relationship_id,status,public_token_digest,token_key_version
    ) VALUES (
      'dependent_transition','50000000-0000-4000-8000-000000000001',
      '51000000-0000-4000-8000-000000000001','56000000-0000-4000-8000-000000000003',
      'proof_required',decode(repeat('44',32),'hex'),1
    );
    RAISE EXCEPTION 'transition shadow token accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO identity.continuity_cases(
      case_type,subject_person_id,status,public_token_digest,recovery_handle_digest,token_key_version,expires_at
    ) VALUES (
      'account_recovery','50000000-0000-4000-8000-000000000001','requested',
      decode(repeat('55',32),'hex'),decode(repeat('56',32),'hex'),1,now()+interval '15 minutes'
    ),(
      'account_recovery','50000000-0000-4000-8000-000000000001','proof_required',
      decode(repeat('66',32),'hex'),decode(repeat('67',32),'hex'),1,now()+interval '15 minutes'
    );
    RAISE EXCEPTION 'duplicate live recovery accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    INSERT INTO identity.continuity_cases(
      case_type,subject_person_id,subject_patient_id,relationship_id,status,assigned_reviewer_person_id
    ) VALUES (
      'dependent_transition','50000000-0000-4000-8000-000000000001',
      '51000000-0000-4000-8000-000000000001','56000000-0000-4000-8000-000000000003',
      'human_review_required','40000000-0000-4000-8000-000000000006'
    );
    RAISE EXCEPTION 'duplicate live transition accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
END
$$;

DO $$
DECLARE removed integer;
BEGIN
  removed:=platform.purge_expired_continuity_decoys('2026-08-25T10:00:00Z');
  IF removed<>1 THEN RAISE EXCEPTION 'expected one old decoy purge, got %',removed; END IF;
  IF NOT EXISTS(SELECT 1 FROM identity.continuity_cases WHERE id='75000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'live decoy was purged';
  END IF;
  IF (SELECT status FROM identity.continuity_cases WHERE id='75000000-0000-4000-8000-000000000004')<>'expired' THEN
    RAISE EXCEPTION 'elapsed unbound request was not atomically expired';
  END IF;
END
$$;

INSERT INTO platform.outbox_events(
  id,aggregate_type,aggregate_id,event_type,payload,aggregate_version
) VALUES
 ('76000000-0000-4000-8000-000000000001','identity','75000000-0000-4000-8000-000000000003','identity.verification.changed','{}',1),
 ('76000000-0000-4000-8000-000000000002','identity','75000000-0000-4000-8000-000000000003','identity.transition.submitted','{}',1);

DO $$
BEGIN
  BEGIN
    INSERT INTO platform.outbox_events(
      aggregate_type,aggregate_id,event_type,payload,aggregate_version
    ) VALUES ('identity','75000000-0000-4000-8000-000000000003','identity.transition.decided','{}',1);
    RAISE EXCEPTION 'identity aggregate/version duplicate accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  IF NOT EXISTS(
    SELECT 1 FROM consent.processing_inventory
    WHERE process_code='identity-continuity-synthetic' AND status='active'
      AND retention_class='IDENTITY_PROOF_OR_SECURITY_AUDIT'
  ) THEN RAISE EXCEPTION 'processing inventory missing'; END IF;
  IF (SELECT count(*) FROM platform.notification_template_releases
      WHERE template_code LIKE 'IDENTITY_%' AND status='published')<>4 THEN
    RAISE EXCEPTION 'four paired identity templates required';
  END IF;
  IF to_regprocedure('platform.claim_next_identity_notification_event(text,integer)') IS NULL OR
     to_regprocedure('platform.complete_identity_notification_event(uuid,text,text,text,timestamp with time zone)') IS NULL OR
     to_regprocedure('platform.identity_notification_address_alias(text)') IS NULL THEN
    RAISE EXCEPTION 'identity notification claim/completion boundary missing';
  END IF;
  IF EXISTS(
    SELECT 1 FROM information_schema.routine_privileges
    WHERE specific_schema='platform' AND routine_name='claim_next_identity_notification_event'
      AND grantee='PUBLIC' AND privilege_type='EXECUTE'
  ) THEN
    RAISE EXCEPTION 'identity notification claim boundary leaked to PUBLIC';
  END IF;
END
$$;

ROLLBACK;
