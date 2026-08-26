BEGIN;

-- Feature 007 adds workflow evidence only. Native Supabase Auth remains authoritative for
-- sessions, refresh families, factors, challenges, AAL, and AMR.
DO $block$
BEGIN
  IF to_regclass('identity.people') IS NULL
     OR to_regclass('identity.patients') IS NULL
     OR to_regclass('identity.care_relationships') IS NULL
     OR to_regclass('identity.verification_cases') IS NULL THEN
    RAISE EXCEPTION 'Feature 007 requires identity/family foundations' USING ERRCODE = '55000';
  END IF;
END
$block$;

CREATE TABLE identity.continuity_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_type text NOT NULL CHECK (case_type IN ('account_recovery','dependent_transition')),
  subject_person_id uuid REFERENCES identity.people(id),
  subject_patient_id uuid REFERENCES identity.patients(id),
  relationship_id uuid REFERENCES identity.care_relationships(id),
  verification_case_id uuid REFERENCES identity.verification_cases(id),
  status text NOT NULL CHECK (status IN (
    'requested','proof_required','review_required','human_review_required',
    'restricted_enrollment','approved','rejected','expired','completed'
  )),
  public_token_digest bytea UNIQUE,
  token_key_version integer,
  restriction_scope text CHECK (restriction_scope IS NULL OR restriction_scope='mfa_enrollment_only'),
  bound_native_session_id uuid,
  assigned_reviewer_person_id uuid REFERENCES identity.people(id),
  reviewer_person_id uuid REFERENCES identity.people(id),
  review_required_reason_code text CHECK (
    review_required_reason_code IS NULL OR review_required_reason_code IN ('interdiction','court_order','dispute')
  ),
  decision_reason_code text CHECK (
    decision_reason_code IS NULL OR decision_reason_code ~ '^[a-z][a-z0-9_.-]{2,63}$'
  ),
  expires_at timestamptz,
  decided_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  CHECK (public_token_digest IS NULL OR octet_length(public_token_digest)=32),
  CHECK ((public_token_digest IS NULL AND token_key_version IS NULL) OR
         (public_token_digest IS NOT NULL AND token_key_version>0)),
  CHECK (expires_at IS NULL OR expires_at>created_at),
  CHECK (
    (case_type='account_recovery'
      AND status IN ('requested','proof_required','restricted_enrollment','rejected','expired','completed')
      AND subject_patient_id IS NULL AND relationship_id IS NULL
      AND review_required_reason_code IS NULL
      AND public_token_digest IS NOT NULL AND token_key_version IS NOT NULL AND expires_at IS NOT NULL)
    OR
    (case_type='dependent_transition'
      AND status IN ('proof_required','review_required','human_review_required','approved','rejected')
      AND subject_person_id IS NOT NULL AND subject_patient_id IS NOT NULL AND relationship_id IS NOT NULL
      AND public_token_digest IS NULL AND token_key_version IS NULL AND expires_at IS NULL
      AND restriction_scope IS NULL AND bound_native_session_id IS NULL)
  ),
  CHECK (
    (status='restricted_enrollment' AND case_type='account_recovery' AND subject_person_id IS NOT NULL
      AND restriction_scope='mfa_enrollment_only' AND bound_native_session_id IS NOT NULL)
    OR
    (status<>'restricted_enrollment' AND restriction_scope IS NULL AND bound_native_session_id IS NULL)
  ),
  CHECK (
    status NOT IN ('review_required','human_review_required') OR
    (case_type='dependent_transition' AND assigned_reviewer_person_id IS NOT NULL)
  ),
  CHECK (
    status<>'approved' OR
    (case_type='dependent_transition' AND reviewer_person_id IS NOT NULL
      AND decision_reason_code IS NOT NULL AND decided_at IS NOT NULL)
  ),
  CHECK (
    status<>'completed' OR
    (case_type='account_recovery' AND subject_person_id IS NOT NULL AND completed_at IS NOT NULL)
  ),
  CHECK (
    reviewer_person_id IS NULL OR
    (reviewer_person_id IS DISTINCT FROM subject_person_id AND decided_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX continuity_live_recovery_subject_uq
  ON identity.continuity_cases(subject_person_id)
  WHERE case_type='account_recovery' AND subject_person_id IS NOT NULL
    AND status IN ('requested','proof_required','restricted_enrollment');
CREATE UNIQUE INDEX continuity_live_transition_relationship_uq
  ON identity.continuity_cases(relationship_id)
  WHERE case_type='dependent_transition'
    AND status IN ('proof_required','review_required','human_review_required');
CREATE UNIQUE INDEX continuity_restricted_native_session_uq
  ON identity.continuity_cases(bound_native_session_id)
  WHERE bound_native_session_id IS NOT NULL AND status='restricted_enrollment';
CREATE INDEX continuity_reviewer_worklist_idx
  ON identity.continuity_cases(assigned_reviewer_person_id,status,created_at,id)
  WHERE status IN ('review_required','human_review_required');
CREATE INDEX continuity_subject_history_idx
  ON identity.continuity_cases(subject_person_id,created_at DESC,id);
CREATE INDEX continuity_expiry_idx
  ON identity.continuity_cases(status,expires_at)
  WHERE case_type='account_recovery' AND status IN ('requested','proof_required','restricted_enrollment');
CREATE INDEX continuity_subject_patient_fk_idx ON identity.continuity_cases(subject_patient_id);
CREATE INDEX continuity_relationship_fk_idx ON identity.continuity_cases(relationship_id);
CREATE INDEX continuity_verification_case_fk_idx ON identity.continuity_cases(verification_case_id);
CREATE INDEX continuity_assigned_reviewer_fk_idx ON identity.continuity_cases(assigned_reviewer_person_id);
CREATE INDEX continuity_reviewer_fk_idx ON identity.continuity_cases(reviewer_person_id);

COMMENT ON TABLE identity.continuity_cases IS
  'retention_class=IDENTITY_PROOF or SECURITY_AUDIT; duration/action remains OPEN-LEGAL-002; decoy-only null-subject recovery may purge 24h after expiry';
COMMENT ON COLUMN identity.continuity_cases.bound_native_session_id IS
  'deny-only binding to native Auth; never authenticates or proves session validity';

CREATE OR REPLACE FUNCTION platform.context_action() RETURNS text
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
  SELECT nullif(current_setting('shifaa.action',true),'')
$$;
CREATE OR REPLACE FUNCTION platform.context_case_id() RETURNS uuid
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
  SELECT nullif(current_setting('shifaa.case_id',true),'')::uuid
$$;
CREATE OR REPLACE FUNCTION platform.context_session_id() RETURNS uuid
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
  SELECT nullif(current_setting('shifaa.session_id',true),'')::uuid
$$;
CREATE OR REPLACE FUNCTION platform.context_factor_amr_at() RETURNS timestamptz
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
  SELECT nullif(current_setting('shifaa.factor_amr_at',true),'')::timestamptz
$$;
CREATE OR REPLACE FUNCTION platform.context_now() RETURNS timestamptz
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
  SELECT CASE
    WHEN platform.context_environment() IN ('local','ci')
      AND nullif(current_setting('shifaa.test_now',true),'') IS NOT NULL
      THEN current_setting('shifaa.test_now',true)::timestamptz
    ELSE clock_timestamp()
  END
$$;

CREATE OR REPLACE FUNCTION identity.transition_eligible_on(p_birth_date date,p_cairo_date date)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT p_birth_date IS NOT NULL AND p_cairo_date >= (p_birth_date + interval '21 years')::date
$$;

CREATE OR REPLACE FUNCTION platform.purge_expired_continuity_decoys(p_now timestamptz)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,identity AS $$
DECLARE removed integer;
BEGIN
  DELETE FROM identity.continuity_cases
  WHERE case_type='account_recovery' AND subject_person_id IS NULL AND status='expired'
    AND expires_at<=p_now-interval '24 hours';
  GET DIAGNOSTICS removed=ROW_COUNT;
  RETURN removed;
END
$$;

CREATE OR REPLACE FUNCTION platform.person_matches_auth_user(p_person_id uuid,p_auth_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS(SELECT 1 FROM identity.people p WHERE p.id=p_person_id AND p.user_id=p_auth_user_id)
$$;

-- The standalone Compose database deliberately has no auth schema. The native helper is created only
-- on the real local Supabase stack. If auth.sessions exists, required pinned columns must all exist.
DO $block$
DECLARE missing_columns text[];
BEGIN
  IF to_regclass('auth.sessions') IS NOT NULL THEN
    SELECT array_agg(required.column_name ORDER BY required.column_name)
      INTO missing_columns
    FROM (VALUES ('id'),('user_id'),('aal'),('not_after')) AS required(column_name)
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema='auth' AND c.table_name='sessions' AND c.column_name=required.column_name
    );
    IF missing_columns IS NOT NULL THEN
      RAISE EXCEPTION 'Pinned auth.sessions columns missing: %',missing_columns USING ERRCODE='55000';
    END IF;
    EXECUTE $ddl$
      CREATE OR REPLACE FUNCTION platform.auth_session_is_current(p_session_id uuid,p_auth_user_id uuid)
      RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
      SET search_path=pg_catalog,auth AS $function$
        SELECT EXISTS(
          SELECT 1 FROM auth.sessions s
          WHERE s.id=p_session_id AND s.user_id=p_auth_user_id
            AND (s.not_after IS NULL OR s.not_after>clock_timestamp())
            AND (
              nullif(current_setting('shifaa.claimed_aal',true),'') IS NULL
              OR s.aal::text=current_setting('shifaa.claimed_aal',true)
            )
        )
      $function$
    $ddl$;
    REVOKE ALL ON FUNCTION platform.auth_session_is_current(uuid,uuid) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION platform.auth_session_is_current(uuid,uuid) TO shifaa_api;
  END IF;
END
$block$;

CREATE OR REPLACE FUNCTION platform.person_requires_mandatory_mfa(p_person_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,identity,platform
AS $$
  SELECT p_person_id=platform.context_person_id()
    AND (
      EXISTS(
        SELECT 1
        FROM identity.facility_memberships m
        WHERE m.person_id=p_person_id
          AND m.membership_status IN ('invited','active','suspended')
      )
      OR EXISTS(
        SELECT 1
        FROM identity.admin_role_grants g
        WHERE g.person_id=p_person_id AND g.status='active'
      )
    )
$$;
REVOKE ALL ON FUNCTION platform.person_requires_mandatory_mfa(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.person_requires_mandatory_mfa(uuid) TO shifaa_api;

CREATE OR REPLACE FUNCTION identity.guard_continuity_case() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,identity,platform AS $$
DECLARE allowed boolean;
DECLARE prior_guardian_person_id uuid;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.version<>1 THEN RAISE EXCEPTION 'continuity case starts at version 1' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.id<>OLD.id OR NEW.case_type<>OLD.case_type
     OR NEW.subject_person_id IS DISTINCT FROM OLD.subject_person_id
     OR NEW.subject_patient_id IS DISTINCT FROM OLD.subject_patient_id
     OR NEW.relationship_id IS DISTINCT FROM OLD.relationship_id
     OR NEW.public_token_digest IS DISTINCT FROM OLD.public_token_digest
     OR NEW.token_key_version IS DISTINCT FROM OLD.token_key_version
     OR NEW.created_at<>OLD.created_at THEN
    RAISE EXCEPTION 'continuity case identity/evidence is immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.status<>OLD.status THEN
    allowed := CASE OLD.status
      WHEN 'requested' THEN NEW.status IN ('proof_required','expired','rejected')
      WHEN 'proof_required' THEN NEW.status IN ('review_required','restricted_enrollment','completed','expired','rejected')
      WHEN 'review_required' THEN NEW.status IN ('human_review_required','approved','rejected')
      WHEN 'human_review_required' THEN NEW.status IN ('approved','rejected')
      WHEN 'restricted_enrollment' THEN NEW.status IN ('completed','expired','rejected')
      ELSE false
    END;
    IF NOT allowed THEN RAISE EXCEPTION 'invalid continuity transition % -> %',OLD.status,NEW.status USING ERRCODE='23514'; END IF;
  END IF;
  IF NEW.case_type='dependent_transition' AND NEW.status IN ('approved','rejected')
     AND OLD.status IN ('review_required','human_review_required') THEN
    SELECT r.actor_person_id INTO prior_guardian_person_id
    FROM identity.care_relationships r WHERE r.id=OLD.relationship_id;
    IF platform.context_role()<>'ADM-SUPPORT' OR platform.context_aal()<2
       OR 'guardianship_review'<>ALL(platform.context_purposes())
       OR OLD.assigned_reviewer_person_id IS DISTINCT FROM platform.context_person_id()
       OR platform.context_person_id() IN (OLD.subject_person_id,prior_guardian_person_id)
       OR NEW.reviewer_person_id IS DISTINCT FROM platform.context_person_id()
       OR platform.context_factor_amr_at() IS NULL
       OR platform.context_now()-platform.context_factor_amr_at()>interval '300 seconds'
       OR platform.context_factor_amr_at()>platform.context_now() THEN
      RAISE EXCEPTION 'assigned independent fresh AAL2 reviewer required' USING ERRCODE='42501';
    END IF;
    IF OLD.status='human_review_required' AND NEW.status='approved'
       AND NEW.decision_reason_code NOT LIKE 'human_review.%' THEN
      RAISE EXCEPTION 'controlling human review decision evidence required' USING ERRCODE='23514';
    END IF;
  END IF;
  NEW.version=OLD.version+1;
  NEW.updated_at=platform.context_now();
  RETURN NEW;
END
$$;
CREATE TRIGGER continuity_case_guard BEFORE UPDATE ON identity.continuity_cases
FOR EACH ROW EXECUTE FUNCTION identity.guard_continuity_case();

CREATE OR REPLACE FUNCTION platform.approve_dependent_transition(
  p_case_id uuid,p_expected_version integer,p_reason_code text
) RETURNS identity.continuity_cases
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,identity,platform AS $$
DECLARE case_row identity.continuity_cases%ROWTYPE;
DECLARE relationship_row identity.care_relationships%ROWTYPE;
DECLARE patient_person_id uuid;
BEGIN
  SELECT * INTO case_row FROM identity.continuity_cases WHERE id=p_case_id FOR UPDATE;
  IF NOT FOUND OR case_row.case_type<>'dependent_transition' THEN RAISE EXCEPTION 'transition case unavailable' USING ERRCODE='P0002'; END IF;
  IF case_row.version<>p_expected_version THEN RAISE EXCEPTION 'version conflict' USING ERRCODE='40001'; END IF;
  IF case_row.status NOT IN ('review_required','human_review_required') THEN RAISE EXCEPTION 'state transition invalid' USING ERRCODE='23514'; END IF;
  IF case_row.status='human_review_required' AND case_row.review_required_reason_code IS NOT NULL THEN RAISE EXCEPTION 'human review blocker unresolved' USING ERRCODE='23514'; END IF;
  SELECT * INTO relationship_row FROM identity.care_relationships WHERE id=case_row.relationship_id FOR UPDATE;
  IF NOT FOUND OR relationship_row.relationship_type<>'guardianship' OR relationship_row.status<>'active'
     OR relationship_row.subject_patient_id<>case_row.subject_patient_id THEN RAISE EXCEPTION 'active guardianship required' USING ERRCODE='42501'; END IF;
  SELECT p.person_id INTO patient_person_id FROM identity.patients p WHERE p.id=case_row.subject_patient_id FOR UPDATE;
  PERFORM 1 FROM identity.people p WHERE p.id=case_row.subject_person_id FOR UPDATE;
  IF patient_person_id IS DISTINCT FROM case_row.subject_person_id THEN RAISE EXCEPTION 'same patient/person record required' USING ERRCODE='23514'; END IF;
  UPDATE identity.continuity_cases SET status='approved',reviewer_person_id=platform.context_person_id(),
    decision_reason_code=p_reason_code,decided_at=platform.context_now()
    WHERE id=p_case_id RETURNING * INTO case_row;
  UPDATE identity.care_relationships SET status='revoked',revoked_by_person_id=platform.context_person_id(),
    revoked_at=platform.context_now(),decision_reason_code=p_reason_code WHERE id=relationship_row.id;
  RETURN case_row;
END
$$;

REVOKE ALL ON FUNCTION platform.context_action(),platform.context_case_id(),platform.context_session_id(),
  platform.context_factor_amr_at(),platform.context_now(),identity.transition_eligible_on(date,date),
  platform.purge_expired_continuity_decoys(timestamptz),platform.person_matches_auth_user(uuid,uuid),
  platform.approve_dependent_transition(uuid,integer,text)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.context_action(),platform.context_case_id(),platform.context_session_id(),
  platform.context_factor_amr_at(),platform.context_now(),identity.transition_eligible_on(date,date),
  platform.person_matches_auth_user(uuid,uuid),platform.approve_dependent_transition(uuid,integer,text)
TO shifaa_api;
GRANT EXECUTE ON FUNCTION platform.purge_expired_continuity_decoys(timestamptz) TO shifaa_worker;

GRANT SELECT,INSERT,UPDATE ON identity.continuity_cases TO shifaa_api;
REVOKE ALL ON identity.continuity_cases FROM PUBLIC;
REVOKE DELETE ON identity.continuity_cases FROM shifaa_api;
ALTER TABLE identity.continuity_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.continuity_cases FORCE ROW LEVEL SECURITY;

CREATE POLICY continuity_subject_or_reviewer_select ON identity.continuity_cases FOR SELECT TO shifaa_api USING (
  subject_person_id=platform.context_person_id()
  OR (assigned_reviewer_person_id=platform.context_person_id() AND platform.context_role()='ADM-SUPPORT'
      AND platform.context_aal()>=2 AND 'guardianship_review'=ANY(platform.context_purposes()))
  OR (case_type='account_recovery' AND id=platform.context_case_id()
      AND platform.context_action()='completeRecovery')
);
CREATE POLICY continuity_authorized_insert ON identity.continuity_cases FOR INSERT TO shifaa_api WITH CHECK (
  (case_type='account_recovery' AND platform.context_action()='startRecovery')
  OR
  (case_type='dependent_transition' AND subject_person_id=platform.context_person_id()
    AND platform.context_action()='transitionDependent'
    AND EXISTS(
      SELECT 1 FROM identity.patients p
      JOIN identity.care_relationships r ON r.id=relationship_id
      WHERE p.id=subject_patient_id AND p.person_id=subject_person_id
        AND r.subject_patient_id=p.id AND r.relationship_type='guardianship' AND r.status='active'
    ))
);
CREATE POLICY continuity_authorized_update ON identity.continuity_cases FOR UPDATE TO shifaa_api USING (
  (subject_person_id=platform.context_person_id() AND platform.context_action() IN ('transitionDependent','completeRecovery'))
  OR (assigned_reviewer_person_id=platform.context_person_id() AND platform.context_role()='ADM-SUPPORT'
      AND platform.context_aal()>=2 AND 'guardianship_review'=ANY(platform.context_purposes())
      AND platform.context_action()='transitionDependent')
  OR (case_type='account_recovery' AND id=platform.context_case_id()
      AND platform.context_action()='completeRecovery')
  OR (status='restricted_enrollment' AND bound_native_session_id=platform.context_session_id()
      AND platform.context_action()='verifyMfaEnrollment')
) WITH CHECK (
  (subject_person_id=platform.context_person_id() AND platform.context_action() IN ('transitionDependent','completeRecovery'))
  OR (assigned_reviewer_person_id=platform.context_person_id() AND platform.context_role()='ADM-SUPPORT'
      AND platform.context_aal()>=2 AND 'guardianship_review'=ANY(platform.context_purposes())
      AND platform.context_action()='transitionDependent')
  OR (case_type='account_recovery' AND id=platform.context_case_id()
      AND platform.context_action()='completeRecovery')
  OR (case_type='account_recovery' AND subject_person_id=platform.context_person_id()
      AND platform.context_action()='verifyMfaEnrollment')
);

ALTER TABLE platform.outbox_events DROP CONSTRAINT IF EXISTS outbox_events_event_type_check;
ALTER TABLE platform.outbox_events ADD CONSTRAINT outbox_events_event_type_check CHECK(event_type IN (
  'identity.verification.changed','identity.manual_review.requested','consent.changed','facility.changed','professional_license.changed','membership.changed','admin_role.changed',
  'relationship.guardianship.changed','relationship.guardianship.created','relationship.guardianship.active','relationship.guardianship.rejected','relationship.guardianship.revoked',
  'relationship.delegation.changed','relationship.delegation.created','relationship.delegation.accepted','relationship.delegation.updated','relationship.delegation.revoked',
  'emergency_contact.changed','emergency_contact.created','emergency_contact.confirmed','emergency_contact.declined','emergency_contact.revoked',
  'sos.emergency_contact.requested','sos.emergency_contact.denied','sos.incident.created','sos.incident.accepted','sos.incident.closed','sos.share.created','sos.share.revoked','sos.share.viewed',
  'privacy.dsr.submitted','privacy.dsr.status_changed','privacy.dsr.export_ready','privacy.dsr.export_consumed','privacy.dsr.identity_required',
  'notification.template.drafted','notification.template.published','notification.delivery.requested','notification.delivery.receipt_recorded','notification.delivery.replay_requested',
  'identity.factor.changed','identity.recovery.completed','identity.transition.submitted','identity.transition.decided'
));
DROP INDEX IF EXISTS platform.outbox_aggregate_version_uq;
CREATE UNIQUE INDEX outbox_aggregate_version_uq
  ON platform.outbox_events(aggregate_type,aggregate_id,aggregate_version)
  WHERE event_type IN (
    'privacy.dsr.submitted','privacy.dsr.status_changed','privacy.dsr.export_ready','privacy.dsr.export_consumed','privacy.dsr.identity_required',
    'notification.template.drafted','notification.template.published','notification.delivery.requested','notification.delivery.receipt_recorded','notification.delivery.replay_requested',
    'sos.incident.created','sos.incident.accepted','sos.incident.closed','sos.share.created','sos.share.revoked','sos.share.viewed','sos.emergency_contact.requested',
    'identity.factor.changed','identity.recovery.completed','identity.transition.submitted','identity.transition.decided'
  );

DROP POLICY IF EXISTS outbox_worker_select ON platform.outbox_events;
CREATE POLICY outbox_worker_select ON platform.outbox_events FOR SELECT TO shifaa_worker USING (
  event_type IN (
    'privacy.dsr.status_changed','privacy.dsr.export_ready','notification.delivery.requested','notification.delivery.replay_requested',
    'sos.emergency_contact.requested','identity.factor.changed','identity.recovery.completed',
    'identity.transition.submitted','identity.transition.decided'
  )
);
DROP POLICY IF EXISTS outbox_worker_lease_update ON platform.outbox_events;
CREATE POLICY outbox_worker_lease_update ON platform.outbox_events FOR UPDATE TO shifaa_worker
USING (event_type IN (
  'privacy.dsr.status_changed','privacy.dsr.export_ready','notification.delivery.requested','notification.delivery.replay_requested',
  'sos.emergency_contact.requested','identity.factor.changed','identity.recovery.completed',
  'identity.transition.submitted','identity.transition.decided'
))
WITH CHECK (event_type IN (
  'privacy.dsr.status_changed','privacy.dsr.export_ready','notification.delivery.requested','notification.delivery.replay_requested',
  'sos.emergency_contact.requested','identity.factor.changed','identity.recovery.completed',
  'identity.transition.submitted','identity.transition.decided'
));

INSERT INTO consent.processing_inventory(
  process_code,owner_name,controller_name,purposes,data_categories,systems,recipients,countries,
  retention_class,lawful_basis,approval_digest,status
) VALUES (
  'identity-continuity-synthetic','SHIFAA Product Owner','SHIFAA synthetic environment',
  ARRAY['session_security','mfa_recovery','dependent_transition'],
  ARRAY['minimum_security_metadata','identity_evidence_reference','relationship_authority'],
  ARRAY['local-auth','local-api','local-worker'],ARRAY['data-subject','assigned-support-reviewer'],ARRAY['EG'],
  'IDENTITY_PROOF_OR_SECURITY_AUDIT','synthetic-engineering-only',repeat('7',64),'active'
) ON CONFLICT(process_code) DO UPDATE SET status='active',updated_at=now();

ALTER TABLE platform.notification_template_releases NO FORCE ROW LEVEL SECURITY;
SELECT set_config('shifaa.person_id','50000000-0000-4000-8000-000000000008',true);
SELECT set_config('shifaa.actor_role','ADM-SUPPORT',true);
SELECT set_config('shifaa.purposes','notification.template.manage',true);
INSERT INTO platform.notification_template_releases(
  id,template_code,release_version,channel,arabic_body,english_body,allowed_recipient_types,
  allowed_field_schema,placeholder_names,content_digest,status,created_by_person_id
) VALUES
 ('74000000-0000-4000-8000-000000000001','IDENTITY_FACTOR_CHANGED',1,'sms','{{action_time}} {{support_action}}','{{action_time}} {{support_action}}',ARRAY['patient'],'{"type":"object","additionalProperties":false,"properties":{"action_time":{"type":"string"},"support_action":{"type":"string"}},"required":["action_time","support_action"]}'::jsonb,ARRAY['action_time','support_action'],repeat('1',64),'draft','50000000-0000-4000-8000-000000000008'),
 ('74000000-0000-4000-8000-000000000002','IDENTITY_RECOVERY_COMPLETED',1,'sms','{{action_time}} {{support_action}}','{{action_time}} {{support_action}}',ARRAY['patient'],'{"type":"object","additionalProperties":false,"properties":{"action_time":{"type":"string"},"support_action":{"type":"string"}},"required":["action_time","support_action"]}'::jsonb,ARRAY['action_time','support_action'],repeat('2',64),'draft','50000000-0000-4000-8000-000000000008'),
 ('74000000-0000-4000-8000-000000000003','IDENTITY_TRANSITION_SUBMITTED',1,'sms','{{action_time}} {{case_status}}','{{action_time}} {{case_status}}',ARRAY['patient'],'{"type":"object","additionalProperties":false,"properties":{"action_time":{"type":"string"},"case_status":{"type":"string"}},"required":["action_time","case_status"]}'::jsonb,ARRAY['action_time','case_status'],repeat('3',64),'draft','50000000-0000-4000-8000-000000000008'),
 ('74000000-0000-4000-8000-000000000004','IDENTITY_TRANSITION_DECIDED',1,'sms','{{action_time}} {{case_status}}','{{action_time}} {{case_status}}',ARRAY['patient'],'{"type":"object","additionalProperties":false,"properties":{"action_time":{"type":"string"},"case_status":{"type":"string"}},"required":["action_time","case_status"]}'::jsonb,ARRAY['action_time','case_status'],repeat('4',64),'draft','50000000-0000-4000-8000-000000000008')
ON CONFLICT(id) DO NOTHING;
SELECT set_config('shifaa.person_id','50000000-0000-4000-8000-000000000009',true);
SELECT set_config('shifaa.aal','2',true);
SELECT set_config('shifaa.purposes','notification.template.publish',true);
UPDATE platform.notification_template_releases
SET status='published',published_by_person_id='50000000-0000-4000-8000-000000000009',effective_at='2026-08-25T10:00:00Z'
WHERE id IN (
  '74000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000002',
  '74000000-0000-4000-8000-000000000003','74000000-0000-4000-8000-000000000004'
) AND status='draft';
SELECT set_config('shifaa.person_id','',true);
SELECT set_config('shifaa.actor_role','',true);
SELECT set_config('shifaa.aal','',true);
SELECT set_config('shifaa.purposes','',true);
ALTER TABLE platform.notification_template_releases FORCE ROW LEVEL SECURITY;

COMMIT;
