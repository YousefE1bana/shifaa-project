BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='shifaa_worker') THEN
    CREATE ROLE shifaa_worker LOGIN PASSWORD 'synthetic_worker_only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;
GRANT USAGE ON SCHEMA platform TO shifaa_worker;

CREATE TABLE IF NOT EXISTS identity.governance_designations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES identity.people(id),
  designation_code text NOT NULL CHECK (designation_code='registered_dpo'),
  status text NOT NULL CHECK (status IN ('pending','active','revoked','expired')),
  evidence_reference text NOT NULL CHECK (length(evidence_reference) BETWEEN 3 AND 128),
  registration_digest text NOT NULL CHECK (registration_digest ~ '^[0-9a-f]{64}$'),
  valid_from timestamptz NOT NULL,
  valid_until timestamptz,
  approved_by_person_id uuid REFERENCES identity.people(id),
  approved_at timestamptz,
  revoked_by_person_id uuid REFERENCES identity.people(id),
  revoked_at timestamptz,
  revocation_reason_code text,
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_until IS NULL OR valid_until>valid_from),
  CHECK ((status='active' AND approved_by_person_id IS NOT NULL AND approved_at IS NOT NULL) OR status<>'active'),
  CHECK ((status='revoked' AND revoked_by_person_id IS NOT NULL AND revoked_at IS NOT NULL AND revocation_reason_code IS NOT NULL) OR status<>'revoked')
);
CREATE UNIQUE INDEX IF NOT EXISTS governance_designation_active_uq ON identity.governance_designations(person_id,designation_code) WHERE status='active';
CREATE INDEX IF NOT EXISTS governance_designation_current_idx ON identity.governance_designations(person_id,designation_code,status,valid_from,valid_until);

CREATE TABLE IF NOT EXISTS consent.data_subject_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES identity.people(id),
  patient_id uuid NOT NULL REFERENCES identity.patients(id),
  submitted_by_person_id uuid NOT NULL REFERENCES identity.people(id),
  request_type text NOT NULL CHECK (request_type IN ('access_export','correction','restriction','erasure_pseudonymization')),
  scope jsonb NOT NULL,
  contact_preference text NOT NULL CHECK (contact_preference IN ('in_app','sms')),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','identity_verification_required','under_review','approved','partially_approved','refused','fulfilled','cancelled')),
  identity_verification_required boolean NOT NULL DEFAULT false,
  identity_verified_at timestamptz,
  due_policy_code text NOT NULL DEFAULT 'synthetic_dsr_due_v1' CHECK (due_policy_code='synthetic_dsr_due_v1'),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz NOT NULL,
  decision_code text CHECK (decision_code IN ('approve','partially_approve','refuse')),
  decision_reason text,
  included_scope jsonb,
  excluded_scope jsonb,
  decided_by_person_id uuid REFERENCES identity.people(id),
  decided_at timestamptz,
  fulfilment_action_codes text[],
  fulfilment_summary text,
  evidence_object_id uuid,
  subject_notice_code text,
  released_at timestamptz,
  closed_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (due_at>submitted_at),
  CHECK (jsonb_typeof(scope)='object' AND scope ? 'data_category_codes' AND jsonb_typeof(scope->'data_category_codes')='array'),
  CHECK ((identity_verification_required AND identity_verified_at IS NULL) OR NOT identity_verification_required),
  CHECK ((status IN ('approved','partially_approved','refused','fulfilled') AND decision_code IS NOT NULL AND decision_reason IS NOT NULL AND decided_by_person_id IS NOT NULL AND decided_at IS NOT NULL) OR status NOT IN ('approved','partially_approved','refused','fulfilled')),
  CHECK ((status='partially_approved' AND included_scope IS NOT NULL AND excluded_scope IS NOT NULL) OR status<>'partially_approved'),
  CHECK ((status='fulfilled' AND cardinality(fulfilment_action_codes)>0 AND fulfilment_summary IS NOT NULL AND evidence_object_id IS NOT NULL AND subject_notice_code IS NOT NULL AND released_at IS NOT NULL AND closed_at IS NOT NULL) OR status<>'fulfilled'),
  CHECK (NOT (request_type='erasure_pseudonymization' AND coalesce(fulfilment_action_codes,'{}') && ARRAY['hard_delete','automated_pseudonymize']))
);
CREATE INDEX IF NOT EXISTS dsr_subject_page_idx ON consent.data_subject_requests(patient_id,submitted_at DESC,id);
CREATE INDEX IF NOT EXISTS dsr_worklist_idx ON consent.data_subject_requests(status,due_at,id);
CREATE INDEX IF NOT EXISTS dsr_type_status_idx ON consent.data_subject_requests(request_type,status,due_at,id);

CREATE TABLE IF NOT EXISTS consent.data_subject_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES consent.data_subject_requests(id),
  aggregate_version integer NOT NULL CHECK (aggregate_version>0),
  actor_person_id uuid REFERENCES identity.people(id),
  actor_type text NOT NULL CHECK (actor_type IN ('subject','guardian','dpo','worker','system')),
  event_type text NOT NULL CHECK (event_type IN ('submitted','identity_verification_required','identity_verified','under_review','approved','partially_approved','refused','fulfilled','cancelled','export_released','export_consumed','export_expired')),
  from_status text,
  to_status text NOT NULL CHECK (to_status IN ('submitted','identity_verification_required','under_review','approved','partially_approved','refused','fulfilled','cancelled')),
  reason_code text,
  evidence_object_id uuid,
  minimum_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  request_idempotency_id uuid REFERENCES platform.idempotency_records(id),
  UNIQUE(request_id,aggregate_version),
  UNIQUE(request_idempotency_id,event_type),
  CHECK (jsonb_typeof(minimum_metadata)='object'),
  CHECK (actor_person_id IS NOT NULL OR actor_type IN ('worker','system'))
);

CREATE TABLE IF NOT EXISTS consent.dsr_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES consent.data_subject_requests(id),
  dpo_person_id uuid NOT NULL REFERENCES identity.people(id),
  assigned_by_person_id uuid NOT NULL REFERENCES identity.people(id),
  assignment_reason_code text NOT NULL CHECK (assignment_reason_code ~ '^[a-z][a-z0-9_.-]{2,63}$'),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version>0)
);
CREATE UNIQUE INDEX IF NOT EXISTS dsr_assignment_active_uq ON consent.dsr_assignments(request_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS dsr_assignment_dpo_idx ON consent.dsr_assignments(dpo_person_id,assigned_at,request_id) WHERE revoked_at IS NULL;

ALTER TABLE identity.private_evidence_objects DROP CONSTRAINT IF EXISTS private_evidence_objects_bucket_code_check;
ALTER TABLE identity.private_evidence_objects ADD CONSTRAINT private_evidence_objects_bucket_code_check CHECK (bucket_code IN ('facility-license-evidence','professional-license-evidence','guardianship-evidence','dsr-export'));
ALTER TABLE identity.private_evidence_objects DROP CONSTRAINT IF EXISTS private_evidence_objects_mime_type_check;
ALTER TABLE identity.private_evidence_objects ADD CONSTRAINT private_evidence_objects_mime_type_check CHECK (mime_type IN ('image/jpeg','image/png','application/pdf','application/json','application/zip'));
ALTER TABLE identity.private_evidence_objects ADD COLUMN IF NOT EXISTS resource_dsr_id uuid REFERENCES consent.data_subject_requests(id);
ALTER TABLE consent.data_subject_requests ADD CONSTRAINT data_subject_requests_evidence_fkey FOREIGN KEY(evidence_object_id) REFERENCES identity.private_evidence_objects(id);

CREATE TABLE IF NOT EXISTS consent.dsr_export_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES consent.data_subject_requests(id),
  evidence_object_id uuid NOT NULL REFERENCES identity.private_evidence_objects(id),
  token_hmac bytea NOT NULL UNIQUE CHECK (octet_length(token_hmac)=32),
  key_version integer NOT NULL CHECK (key_version>0),
  issued_to_person_id uuid NOT NULL REFERENCES identity.people(id),
  issued_by_person_id uuid NOT NULL REFERENCES identity.people(id),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at>created_at),
  CHECK (NOT (used_at IS NOT NULL AND revoked_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS dsr_export_active_recipient_uq ON consent.dsr_export_capabilities(request_id,issued_to_person_id) WHERE used_at IS NULL AND revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS dsr_export_expiry_idx ON consent.dsr_export_capabilities(expires_at,id) WHERE used_at IS NULL AND revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS platform.notification_template_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_code text NOT NULL CHECK (template_code ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  release_version integer NOT NULL CHECK (release_version>0),
  channel text NOT NULL CHECK (channel='sms'),
  arabic_body text NOT NULL CHECK (length(arabic_body) BETWEEN 1 AND 500),
  english_body text NOT NULL CHECK (length(english_body) BETWEEN 1 AND 500),
  allowed_recipient_types text[] NOT NULL CHECK (allowed_recipient_types=ARRAY['patient']::text[]),
  allowed_field_schema jsonb NOT NULL,
  placeholder_names text[] NOT NULL,
  content_digest text NOT NULL CHECK (content_digest ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','retired')),
  created_by_person_id uuid NOT NULL REFERENCES identity.people(id),
  published_by_person_id uuid REFERENCES identity.people(id),
  effective_at timestamptz,
  retired_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(template_code,release_version),
  CHECK (jsonb_typeof(allowed_field_schema)='object' AND allowed_field_schema->>'type'='object' AND allowed_field_schema->>'additionalProperties'='false'),
  CHECK ((status='published' AND published_by_person_id IS NOT NULL AND published_by_person_id<>created_by_person_id AND effective_at IS NOT NULL) OR status<>'published')
);
CREATE INDEX IF NOT EXISTS template_release_list_idx ON platform.notification_template_releases(template_code,status,release_version DESC,id);
CREATE INDEX IF NOT EXISTS template_release_effective_idx ON platform.notification_template_releases(template_code,channel,status,effective_at DESC) WHERE status='published';

CREATE TABLE IF NOT EXISTS platform.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_event_id uuid NOT NULL REFERENCES platform.outbox_events(id),
  template_release_id uuid NOT NULL REFERENCES platform.notification_template_releases(id),
  recipient_type text NOT NULL CHECK (recipient_type='patient'),
  recipient_person_id uuid NOT NULL REFERENCES identity.people(id),
  locale text NOT NULL CHECK (locale IN ('ar-EG','en-EG')),
  channel text NOT NULL CHECK (channel='sms'),
  field_values jsonb NOT NULL,
  rendered_digest text NOT NULL CHECK (rendered_digest ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','delivered','failed','dead_letter')),
  provider_reference_hash text CHECK (provider_reference_hash IS NULL OR provider_reference_hash ~ '^[0-9a-f]{64}$'),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count>=0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  dead_lettered_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(field_values)='object'),
  UNIQUE(template_release_id,source_event_id,recipient_type,recipient_person_id,channel)
);
CREATE INDEX IF NOT EXISTS notification_claim_idx ON platform.notifications(status,next_attempt_at,created_at,id);
CREATE INDEX IF NOT EXISTS notification_recipient_idx ON platform.notifications(recipient_person_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS platform.notification_delivery_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES platform.notifications(id),
  source_event_id uuid NOT NULL REFERENCES platform.outbox_events(id),
  attempt_number integer NOT NULL CHECK (attempt_number>0),
  adapter_code text NOT NULL CHECK (adapter_code='local-synthetic'),
  provider_idempotency_key text NOT NULL UNIQUE CHECK (provider_idempotency_key ~ '^[0-9a-f]{64}$'),
  outcome text NOT NULL CHECK (outcome IN ('accepted','delivered','transient_failure','permanent_failure','timeout','dead_lettered','deduplicated')),
  safe_error_code text,
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL,
  retry_at timestamptz,
  provider_receipt_hash text UNIQUE CHECK (provider_receipt_hash IS NULL OR provider_receipt_hash ~ '^[0-9a-f]{64}$'),
  UNIQUE(notification_id,attempt_number),
  CHECK (finished_at>=started_at)
);

CREATE TABLE IF NOT EXISTS platform.provider_callback_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_code text NOT NULL CHECK (provider_code='local-synthetic'),
  event_reference text NOT NULL CHECK (length(event_reference) BETWEEN 8 AND 128),
  receipt_reference_hash text NOT NULL CHECK (receipt_reference_hash ~ '^[0-9a-f]{64}$'),
  nonce_hash text NOT NULL UNIQUE CHECK (nonce_hash ~ '^[0-9a-f]{64}$'),
  request_digest text NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
  delivery_status text NOT NULL CHECK (delivery_status IN ('accepted','delivered','failed')),
  provider_occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider_code,receipt_reference_hash)
);

CREATE TABLE IF NOT EXISTS platform.outbox_replay_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_event_id uuid NOT NULL REFERENCES platform.outbox_events(id),
  replay_event_id uuid NOT NULL UNIQUE REFERENCES platform.outbox_events(id),
  actor_person_id uuid NOT NULL REFERENCES identity.people(id),
  reason_code text NOT NULL CHECK (reason_code ~ '^[a-z][a-z0-9_.-]{2,63}$'),
  original_version integer NOT NULL CHECK (original_version>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(original_event_id,original_version)
);

ALTER TABLE platform.outbox_events ADD COLUMN IF NOT EXISTS aggregate_version integer;
UPDATE platform.outbox_events SET aggregate_version=1 WHERE aggregate_version IS NULL;
ALTER TABLE platform.outbox_events ALTER COLUMN aggregate_version SET DEFAULT 1;
ALTER TABLE platform.outbox_events ALTER COLUMN aggregate_version SET NOT NULL;
ALTER TABLE platform.outbox_events ADD CONSTRAINT outbox_events_aggregate_version_check CHECK (aggregate_version>0);
ALTER TABLE platform.outbox_events ADD COLUMN IF NOT EXISTS lease_owner text;
ALTER TABLE platform.outbox_events ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;
DROP INDEX IF EXISTS platform.outbox_aggregate_version_uq;
CREATE UNIQUE INDEX outbox_aggregate_version_uq ON platform.outbox_events(aggregate_type,aggregate_id,aggregate_version) WHERE event_type IN (
 'privacy.dsr.submitted','privacy.dsr.status_changed','privacy.dsr.export_ready','privacy.dsr.export_consumed','privacy.dsr.identity_required',
 'notification.template.drafted','notification.template.published','notification.delivery.requested','notification.delivery.receipt_recorded','notification.delivery.replay_requested'
);
ALTER TABLE platform.outbox_events DROP CONSTRAINT IF EXISTS outbox_events_event_type_check;
ALTER TABLE platform.outbox_events ADD CONSTRAINT outbox_events_event_type_check CHECK(event_type IN (
 'identity.verification.changed','identity.manual_review.requested','consent.changed','facility.changed','professional_license.changed','membership.changed','admin_role.changed',
 'relationship.guardianship.changed','relationship.guardianship.created','relationship.guardianship.active','relationship.guardianship.rejected','relationship.guardianship.revoked',
 'relationship.delegation.changed','relationship.delegation.created','relationship.delegation.accepted','relationship.delegation.updated','relationship.delegation.revoked',
 'emergency_contact.changed','emergency_contact.created','emergency_contact.confirmed','emergency_contact.declined','emergency_contact.revoked','sos.emergency_contact.requested','sos.emergency_contact.denied',
 'privacy.dsr.submitted','privacy.dsr.status_changed','privacy.dsr.export_ready','privacy.dsr.export_consumed','privacy.dsr.identity_required',
 'notification.template.drafted','notification.template.published','notification.delivery.requested','notification.delivery.receipt_recorded','notification.delivery.replay_requested'
));

CREATE OR REPLACE FUNCTION platform.person_can_manage_dsr(p_patient_id uuid,p_person_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT platform.person_is_patient_self(p_patient_id,p_person_id) OR EXISTS(
   SELECT 1 FROM identity.care_relationships r
   JOIN identity.care_relationship_permissions rp ON rp.relationship_id=r.id AND rp.permission_code='consent.manage' AND rp.revoked_at IS NULL
   WHERE r.subject_patient_id=p_patient_id AND r.actor_person_id=p_person_id AND r.relationship_type='guardianship' AND r.status='active'
     AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now())
 )
$$;
CREATE OR REPLACE FUNCTION platform.person_is_active_dpo(p_person_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM identity.governance_designations d WHERE d.person_id=p_person_id AND d.designation_code='registered_dpo' AND d.status='active' AND d.valid_from<=now() AND (d.valid_until IS NULL OR d.valid_until>now()))
$$;
CREATE OR REPLACE FUNCTION platform.dpo_can_review_dsr(p_request_id uuid,p_person_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT platform.context_aal()>=2 AND 'privacy.dsr.review'=ANY(platform.context_purposes())
   AND platform.person_is_active_dpo(p_person_id)
   AND EXISTS(SELECT 1 FROM consent.dsr_assignments a WHERE a.request_id=p_request_id AND a.dpo_person_id=p_person_id AND a.revoked_at IS NULL)
$$;
CREATE OR REPLACE FUNCTION platform.processing_inventory_active(p_process_code text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM consent.processing_inventory i WHERE i.process_code=p_process_code AND i.status='active')
$$;
CREATE OR REPLACE FUNCTION platform.dsr_subject_person_id(p_patient_id uuid,p_actor_person_id uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT p.person_id FROM identity.patients p
 WHERE p.id=p_patient_id AND platform.person_can_manage_dsr(p.id,p_actor_person_id)
$$;
REVOKE ALL ON FUNCTION platform.person_can_manage_dsr(uuid,uuid),platform.person_is_active_dpo(uuid),platform.dpo_can_review_dsr(uuid,uuid),platform.processing_inventory_active(text),platform.dsr_subject_person_id(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.person_can_manage_dsr(uuid,uuid),platform.person_is_active_dpo(uuid),platform.dpo_can_review_dsr(uuid,uuid),platform.processing_inventory_active(text),platform.dsr_subject_person_id(uuid,uuid) TO shifaa_api;

CREATE OR REPLACE FUNCTION consent.guard_dsr_transition() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,consent,platform AS $$
DECLARE allowed boolean;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.status<>(CASE WHEN NEW.scope->'data_category_codes' ? 'identity.proof' THEN 'identity_verification_required' ELSE 'submitted' END)
    OR NEW.submitted_by_person_id<>platform.context_person_id() OR NOT platform.person_can_manage_dsr(NEW.patient_id,NEW.submitted_by_person_id) OR NOT platform.processing_inventory_active('privacy-dsr-intake-synthetic') THEN RAISE EXCEPTION 'dsr subject authority, identity gate, or inventory missing' USING ERRCODE='42501'; END IF;
  IF NEW.due_at<>NEW.submitted_at+interval '17 days' THEN RAISE EXCEPTION 'synthetic due policy mismatch' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.id<>OLD.id OR NEW.person_id<>OLD.person_id OR NEW.patient_id<>OLD.patient_id OR NEW.submitted_by_person_id<>OLD.submitted_by_person_id OR NEW.request_type<>OLD.request_type OR NEW.scope<>OLD.scope OR NEW.contact_preference<>OLD.contact_preference OR NEW.submitted_at<>OLD.submitted_at OR NEW.due_at<>OLD.due_at THEN RAISE EXCEPTION 'dsr identity and submitted scope are immutable' USING ERRCODE='23514'; END IF;
 IF NEW.status<>OLD.status THEN
  allowed := CASE OLD.status WHEN 'submitted' THEN NEW.status IN ('identity_verification_required','under_review','cancelled') WHEN 'identity_verification_required' THEN NEW.status='under_review' WHEN 'under_review' THEN NEW.status IN ('approved','partially_approved','refused') WHEN 'approved' THEN NEW.status='fulfilled' WHEN 'partially_approved' THEN NEW.status='fulfilled' ELSE false END;
  IF NOT allowed THEN RAISE EXCEPTION 'invalid dsr transition' USING ERRCODE='23514'; END IF;
  IF NEW.status NOT IN ('cancelled','identity_verification_required') AND NOT platform.dpo_can_review_dsr(OLD.id,platform.context_person_id()) THEN RAISE EXCEPTION 'assigned current DPO AAL2 purpose required' USING ERRCODE='42501'; END IF;
  IF OLD.identity_verification_required AND OLD.identity_verified_at IS NULL AND NEW.status<>'identity_verification_required' THEN RAISE EXCEPTION 'identity verification required' USING ERRCODE='42501'; END IF;
  IF NEW.status IN ('approved','partially_approved','refused','fulfilled') AND (
    NEW.evidence_object_id IS NULL OR NOT EXISTS(
      SELECT 1 FROM identity.private_evidence_objects e
      WHERE e.id=NEW.evidence_object_id AND e.resource_dsr_id=OLD.id AND e.scan_status='released' AND e.released_at IS NOT NULL
    )
  ) THEN RAISE EXCEPTION 'released evidence bound to this DSR required' USING ERRCODE='23514'; END IF;
  IF NEW.status IN ('approved','partially_approved','refused') AND (NEW.decision_code IS NULL OR NEW.decision_reason IS NULL OR length(trim(NEW.decision_reason))<3) THEN RAISE EXCEPTION 'decision reason required' USING ERRCODE='23514'; END IF;
  IF NEW.status='partially_approved' AND (NEW.included_scope IS NULL OR NEW.excluded_scope IS NULL) THEN RAISE EXCEPTION 'partial decision scopes required' USING ERRCODE='23514'; END IF;
  IF NEW.status='fulfilled' AND (coalesce(array_length(NEW.fulfilment_action_codes,1),0)=0 OR NEW.fulfilment_summary IS NULL OR length(trim(NEW.fulfilment_summary))<3 OR NEW.subject_notice_code IS NULL) THEN RAISE EXCEPTION 'fulfilment reason and evidence required' USING ERRCODE='23514'; END IF;
 END IF;
 NEW.version=OLD.version+1; NEW.updated_at=now(); RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS data_subject_request_guard ON consent.data_subject_requests;
CREATE TRIGGER data_subject_request_guard BEFORE INSERT OR UPDATE ON consent.data_subject_requests FOR EACH ROW EXECUTE FUNCTION consent.guard_dsr_transition();

CREATE OR REPLACE FUNCTION platform.guard_notification_template() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,platform AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF platform.context_role()<>'ADM-SUPPORT' OR 'notification.template.manage'<>ALL(platform.context_purposes()) OR NOT platform.processing_inventory_active('privacy-notification-render-synthetic') THEN RAISE EXCEPTION 'template management denied' USING ERRCODE='42501'; END IF;
  IF NEW.status<>'draft' OR NEW.created_by_person_id<>platform.context_person_id() THEN RAISE EXCEPTION 'attributed draft required' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF OLD.status='published' AND (NEW.arabic_body<>OLD.arabic_body OR NEW.english_body<>OLD.english_body OR NEW.allowed_field_schema<>OLD.allowed_field_schema OR NEW.content_digest<>OLD.content_digest) THEN RAISE EXCEPTION 'published release content is immutable' USING ERRCODE='23514'; END IF;
 IF NEW.status='published' AND OLD.status='draft' THEN
  IF platform.context_role()<>'ADM-SUPPORT' OR platform.context_aal()<2 OR 'notification.template.publish'<>ALL(platform.context_purposes()) OR platform.context_person_id()=OLD.created_by_person_id OR NEW.published_by_person_id IS DISTINCT FROM platform.context_person_id() THEN RAISE EXCEPTION 'independent AAL2 publisher required' USING ERRCODE='42501'; END IF;
 ELSIF NEW.status<>OLD.status AND NOT (OLD.status='published' AND NEW.status='retired') THEN RAISE EXCEPTION 'invalid template transition' USING ERRCODE='23514';
 END IF;
 NEW.version=OLD.version+1; NEW.updated_at=now(); RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notification_template_guard ON platform.notification_template_releases;
CREATE TRIGGER notification_template_guard BEFORE INSERT OR UPDATE ON platform.notification_template_releases FOR EACH ROW EXECUTE FUNCTION platform.guard_notification_template();

DROP TRIGGER IF EXISTS dsr_events_append_only ON consent.data_subject_request_events;
CREATE TRIGGER dsr_events_append_only BEFORE UPDATE OR DELETE ON consent.data_subject_request_events FOR EACH ROW EXECUTE FUNCTION platform.reject_mutation();
DROP TRIGGER IF EXISTS notification_attempts_append_only ON platform.notification_delivery_attempts;
CREATE TRIGGER notification_attempts_append_only BEFORE UPDATE OR DELETE ON platform.notification_delivery_attempts FOR EACH ROW EXECUTE FUNCTION platform.reject_mutation();
DROP TRIGGER IF EXISTS provider_receipts_append_only ON platform.provider_callback_receipts;
CREATE TRIGGER provider_receipts_append_only BEFORE UPDATE OR DELETE ON platform.provider_callback_receipts FOR EACH ROW EXECUTE FUNCTION platform.reject_mutation();
DROP TRIGGER IF EXISTS outbox_replays_append_only ON platform.outbox_replay_attempts;
CREATE TRIGGER outbox_replays_append_only BEFORE UPDATE OR DELETE ON platform.outbox_replay_attempts FOR EACH ROW EXECUTE FUNCTION platform.reject_mutation();

GRANT SELECT,INSERT,UPDATE ON identity.governance_designations,consent.data_subject_requests,consent.dsr_assignments,consent.dsr_export_capabilities,platform.notification_template_releases,platform.notifications TO shifaa_api;
GRANT SELECT,INSERT ON consent.data_subject_request_events,platform.notification_delivery_attempts,platform.provider_callback_receipts,platform.outbox_replay_attempts TO shifaa_api;
GRANT SELECT ON platform.outbox_events TO shifaa_api;
GRANT SELECT ON platform.notification_template_releases,platform.outbox_events TO shifaa_worker;
GRANT SELECT,INSERT,UPDATE ON platform.notifications TO shifaa_worker;
GRANT SELECT,INSERT ON platform.notification_delivery_attempts TO shifaa_worker;
GRANT UPDATE(lease_owner,lease_expires_at) ON platform.outbox_events TO shifaa_worker;
REVOKE DELETE ON identity.governance_designations,consent.data_subject_requests,consent.data_subject_request_events,consent.dsr_assignments,consent.dsr_export_capabilities,platform.notification_template_releases,platform.notifications,platform.notification_delivery_attempts,platform.provider_callback_receipts,platform.outbox_replay_attempts FROM PUBLIC,shifaa_api;
REVOKE DELETE ON platform.notification_template_releases,platform.notifications,platform.notification_delivery_attempts,platform.outbox_events FROM shifaa_worker;

ALTER TABLE identity.governance_designations ENABLE ROW LEVEL SECURITY; ALTER TABLE identity.governance_designations FORCE ROW LEVEL SECURITY;
ALTER TABLE consent.data_subject_requests ENABLE ROW LEVEL SECURITY; ALTER TABLE consent.data_subject_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE consent.data_subject_request_events ENABLE ROW LEVEL SECURITY; ALTER TABLE consent.data_subject_request_events FORCE ROW LEVEL SECURITY;
ALTER TABLE consent.dsr_assignments ENABLE ROW LEVEL SECURITY; ALTER TABLE consent.dsr_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE consent.dsr_export_capabilities ENABLE ROW LEVEL SECURITY; ALTER TABLE consent.dsr_export_capabilities FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.notification_template_releases ENABLE ROW LEVEL SECURITY; ALTER TABLE platform.notification_template_releases FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.notifications ENABLE ROW LEVEL SECURITY; ALTER TABLE platform.notifications FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.notification_delivery_attempts ENABLE ROW LEVEL SECURITY; ALTER TABLE platform.notification_delivery_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.provider_callback_receipts ENABLE ROW LEVEL SECURITY; ALTER TABLE platform.provider_callback_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.outbox_replay_attempts ENABLE ROW LEVEL SECURITY; ALTER TABLE platform.outbox_replay_attempts FORCE ROW LEVEL SECURITY;

CREATE POLICY dsr_subject_or_assigned_dpo_select ON consent.data_subject_requests FOR SELECT TO shifaa_api USING (platform.person_can_manage_dsr(patient_id,platform.context_person_id()) OR platform.dpo_can_review_dsr(id,platform.context_person_id()));
CREATE POLICY dsr_subject_insert ON consent.data_subject_requests FOR INSERT TO shifaa_api WITH CHECK (submitted_by_person_id=platform.context_person_id() AND platform.person_can_manage_dsr(patient_id,platform.context_person_id()));
CREATE POLICY dsr_authorized_update ON consent.data_subject_requests FOR UPDATE TO shifaa_api USING (platform.person_can_manage_dsr(patient_id,platform.context_person_id()) OR platform.dpo_can_review_dsr(id,platform.context_person_id())) WITH CHECK (platform.person_can_manage_dsr(patient_id,platform.context_person_id()) OR platform.dpo_can_review_dsr(id,platform.context_person_id()));
CREATE POLICY dsr_events_authorized_select ON consent.data_subject_request_events FOR SELECT TO shifaa_api USING (EXISTS(SELECT 1 FROM consent.data_subject_requests r WHERE r.id=request_id));
CREATE POLICY dsr_events_authorized_insert ON consent.data_subject_request_events FOR INSERT TO shifaa_api WITH CHECK (EXISTS(SELECT 1 FROM consent.data_subject_requests r WHERE r.id=request_id));
CREATE POLICY dsr_assignments_dpo_select ON consent.dsr_assignments FOR SELECT TO shifaa_api USING (dpo_person_id=platform.context_person_id() AND platform.person_is_active_dpo(dpo_person_id) AND platform.context_aal()>=2 AND 'privacy.dsr.review'=ANY(platform.context_purposes()));
CREATE POLICY dsr_exports_subject_select ON consent.dsr_export_capabilities FOR SELECT TO shifaa_api USING (issued_to_person_id=platform.context_person_id() AND platform.context_aal()>=2 AND EXISTS(SELECT 1 FROM consent.data_subject_requests r WHERE r.id=request_id AND platform.person_can_manage_dsr(r.patient_id,platform.context_person_id())));
CREATE POLICY dsr_exports_subject_insert ON consent.dsr_export_capabilities FOR INSERT TO shifaa_api WITH CHECK (
  issued_to_person_id=platform.context_person_id()
  AND issued_by_person_id=platform.context_person_id()
  AND platform.context_aal()>=2
  AND expires_at>created_at
  AND expires_at<=created_at+interval '5 minutes'
  AND EXISTS(
    SELECT 1
    FROM consent.data_subject_requests r
    WHERE r.id=request_id
      AND r.status='fulfilled'
      AND r.evidence_object_id=dsr_export_capabilities.evidence_object_id
      AND platform.person_can_manage_dsr(r.patient_id,platform.context_person_id())
  )
);
CREATE POLICY dsr_exports_subject_update ON consent.dsr_export_capabilities FOR UPDATE TO shifaa_api
USING (issued_to_person_id=platform.context_person_id() AND platform.context_aal()>=2)
WITH CHECK (
  issued_to_person_id=platform.context_person_id()
  AND platform.context_aal()>=2
  AND (
    used_at IS NOT NULL
    OR (
      used_at IS NULL
      AND revoked_at IS NULL
      AND expires_at>created_at
      AND expires_at<=created_at+interval '5 minutes'
    )
  )
);
CREATE POLICY template_support_select ON platform.notification_template_releases FOR SELECT TO shifaa_api USING (platform.context_role()='ADM-SUPPORT' AND ('notification.template.manage'=ANY(platform.context_purposes()) OR 'notification.template.publish'=ANY(platform.context_purposes())));
CREATE POLICY template_support_insert ON platform.notification_template_releases FOR INSERT TO shifaa_api WITH CHECK (created_by_person_id=platform.context_person_id() AND platform.context_role()='ADM-SUPPORT' AND 'notification.template.manage'=ANY(platform.context_purposes()));
CREATE POLICY template_support_update ON platform.notification_template_releases FOR UPDATE TO shifaa_api USING (platform.context_role()='ADM-SUPPORT' AND 'notification.template.publish'=ANY(platform.context_purposes())) WITH CHECK (platform.context_role()='ADM-SUPPORT' AND published_by_person_id=platform.context_person_id());
CREATE POLICY template_worker_published_select ON platform.notification_template_releases FOR SELECT TO shifaa_worker USING (status='published' AND effective_at<=now());
CREATE POLICY notifications_worker_select ON platform.notifications FOR SELECT TO shifaa_worker USING (true);
CREATE POLICY notifications_worker_insert ON platform.notifications FOR INSERT TO shifaa_worker WITH CHECK (status='pending' AND attempt_count=0 AND delivered_at IS NULL AND dead_lettered_at IS NULL);
CREATE POLICY notifications_worker_update ON platform.notifications FOR UPDATE TO shifaa_worker USING (true) WITH CHECK (status IN ('pending','processing','delivered','failed','dead_letter'));
CREATE POLICY notification_attempts_worker_select ON platform.notification_delivery_attempts FOR SELECT TO shifaa_worker USING (true);
CREATE POLICY notification_attempts_worker_insert ON platform.notification_delivery_attempts FOR INSERT TO shifaa_worker WITH CHECK (adapter_code='local-synthetic');
CREATE POLICY provider_callback_api_insert ON platform.provider_callback_receipts FOR INSERT TO shifaa_api WITH CHECK (provider_code='local-synthetic');
CREATE POLICY outbox_replay_api_insert ON platform.outbox_replay_attempts FOR INSERT TO shifaa_api WITH CHECK (actor_person_id=platform.context_person_id() AND platform.context_role()='PLATFORM-OPERATOR' AND platform.context_aal()>=2 AND 'platform.outbox.replay'=ANY(platform.context_purposes()));
DROP POLICY IF EXISTS outbox_operator_dead_letter_select ON platform.outbox_events;
CREATE POLICY outbox_operator_dead_letter_select ON platform.outbox_events FOR SELECT TO shifaa_api USING (platform.context_role()='PLATFORM-OPERATOR' AND platform.context_aal()>=2 AND 'platform.outbox.replay'=ANY(platform.context_purposes()) AND state='dead_letter');
DROP POLICY IF EXISTS outbox_worker_select ON platform.outbox_events;
CREATE POLICY outbox_worker_select ON platform.outbox_events FOR SELECT TO shifaa_worker USING (event_type IN ('privacy.dsr.status_changed','privacy.dsr.export_ready','notification.delivery.requested','notification.delivery.replay_requested'));
DROP POLICY IF EXISTS outbox_worker_lease_update ON platform.outbox_events;
CREATE POLICY outbox_worker_lease_update ON platform.outbox_events FOR UPDATE TO shifaa_worker
USING (event_type IN ('privacy.dsr.status_changed','privacy.dsr.export_ready','notification.delivery.requested','notification.delivery.replay_requested'))
WITH CHECK (event_type IN ('privacy.dsr.status_changed','privacy.dsr.export_ready','notification.delivery.requested','notification.delivery.replay_requested'));

COMMENT ON TABLE identity.governance_designations IS 'retention_class=governance-evidence; synthetic designation only';
COMMENT ON TABLE consent.data_subject_requests IS 'retention_class=privacy-dsr-evidence; statutory duration unknown under OPEN-LEGAL-002; no automated deletion';
COMMENT ON TABLE consent.data_subject_request_events IS 'retention_class=privacy-dsr-audit; append-only minimum event';
COMMENT ON TABLE consent.dsr_export_capabilities IS 'retention_class=short-lived-capability; local TTL exactly five minutes; no plaintext token';
COMMENT ON TABLE platform.notification_template_releases IS 'retention_class=notification-governance; paired locale release';
COMMENT ON TABLE platform.notifications IS 'retention_class=notification-delivery-metadata; no body or raw contact';

INSERT INTO identity.people(id,user_id,display_name,nationality_code,preferred_locale,profile_status) VALUES
 ('50000000-0000-4000-8000-000000000001','50000000-0000-4000-9000-000000000001','Synthetic Privacy Patient','EG','ar-EG','active'),
 ('50000000-0000-4000-8000-000000000002','50000000-0000-4000-9000-000000000002','Synthetic Privacy Guardian','EG','ar-EG','active'),
 ('50000000-0000-4000-8000-000000000003','50000000-0000-4000-9000-000000000003','Synthetic Privacy Delegate','EG','en-EG','active'),
 ('50000000-0000-4000-8000-000000000004','50000000-0000-4000-9000-000000000004','Synthetic Unrelated Patient','EG','en-EG','active'),
 ('50000000-0000-4000-8000-000000000005','50000000-0000-4000-9000-000000000005','Synthetic Facility Staff','EG','en-EG','active'),
 ('50000000-0000-4000-8000-000000000006','50000000-0000-4000-9000-000000000006','Synthetic Registered DPO','EG','ar-EG','active'),
 ('50000000-0000-4000-8000-000000000007','50000000-0000-4000-9000-000000000007','Synthetic Unassigned DPO','EG','en-EG','active'),
 ('50000000-0000-4000-8000-000000000008','50000000-0000-4000-9000-000000000008','Synthetic Template Author','EG','ar-EG','active'),
 ('50000000-0000-4000-8000-000000000009','50000000-0000-4000-9000-000000000009','Synthetic Template Publisher','EG','en-EG','active'),
 ('50000000-0000-4000-8000-000000000010','50000000-0000-4000-9000-000000000010','Synthetic Platform Operator','EG','en-EG','active')
ON CONFLICT(id) DO NOTHING;
INSERT INTO identity.patients(id,person_id,medical_record_number) VALUES
 ('51000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','SYN-PRIVACY-005-001'),
 ('51000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000004','SYN-PRIVACY-005-002')
ON CONFLICT(id) DO NOTHING;
INSERT INTO identity.care_relationships(id,subject_patient_id,actor_person_id,relationship_type,status,valid_from,created_by_person_id,purpose_code) VALUES
 ('56000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','self','active','2026-01-01T00:00:00Z','50000000-0000-4000-8000-000000000001',NULL),
 ('56000000-0000-4000-8000-000000000002','51000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000004','self','active','2026-01-01T00:00:00Z','50000000-0000-4000-8000-000000000004',NULL)
ON CONFLICT(id) DO NOTHING;
INSERT INTO identity.private_evidence_objects(id,bucket_code,object_key,owner_person_id,resource_patient_id,sha256,mime_type,size_bytes,scan_status,released_at) VALUES
 ('58000000-0000-4000-8000-000000000001','guardianship-evidence','synthetic/privacy-005/guardian/released','50000000-0000-4000-8000-000000000002','51000000-0000-4000-8000-000000000001',repeat('5',64),'application/pdf',1024,'released','2026-08-13T07:00:00Z')
ON CONFLICT(id) DO NOTHING;
SELECT set_config('shifaa.person_id','50000000-0000-4000-8000-000000000002',true);
INSERT INTO identity.care_relationships(id,subject_patient_id,actor_person_id,relationship_type,status,valid_from,created_by_person_id,purpose_code,evidence_object_id) VALUES
 ('56000000-0000-4000-8000-000000000003','51000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','guardianship','pending','2026-01-01T00:00:00Z','50000000-0000-4000-8000-000000000002','privacy_dsr','58000000-0000-4000-8000-000000000001')
ON CONFLICT(id) DO NOTHING;
INSERT INTO identity.care_relationship_permissions(relationship_id,permission_code,created_by_person_id) VALUES ('56000000-0000-4000-8000-000000000003','consent.manage','50000000-0000-4000-8000-000000000002') ON CONFLICT DO NOTHING;
SELECT set_config('shifaa.person_id','40000000-0000-4000-8000-000000000006',true);
SELECT set_config('shifaa.actor_role','ADM-SUPPORT',true);
SELECT set_config('shifaa.aal','2',true);
SELECT set_config('shifaa.purposes','guardianship_review',true);
UPDATE identity.care_relationships SET status='active',valid_until='2027-08-13T00:00:00Z',reviewed_by_person_id='40000000-0000-4000-8000-000000000006',reviewed_at='2026-08-13T07:30:00Z',decision_reason_code='synthetic.approved' WHERE id='56000000-0000-4000-8000-000000000003' AND status='pending';
SELECT set_config('shifaa.person_id','',true); SELECT set_config('shifaa.actor_role','',true); SELECT set_config('shifaa.aal','',true); SELECT set_config('shifaa.purposes','',true);
INSERT INTO identity.governance_designations(id,person_id,designation_code,status,evidence_reference,registration_digest,valid_from,approved_by_person_id,approved_at) VALUES
 ('57000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000006','registered_dpo','active','SYNTHETIC-DPO-REGISTRATION-005',repeat('a',64),'2026-01-01T00:00:00Z','50000000-0000-4000-8000-000000000010','2026-01-01T00:00:00Z'),
 ('57000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000007','registered_dpo','active','SYNTHETIC-DPO-REGISTRATION-005-B',repeat('b',64),'2026-01-01T00:00:00Z','50000000-0000-4000-8000-000000000010','2026-01-01T00:00:00Z')
ON CONFLICT(id) DO NOTHING;
INSERT INTO consent.processing_inventory(process_code,owner_name,controller_name,purposes,data_categories,systems,recipients,countries,retention_class,lawful_basis,approval_digest,status) VALUES
 ('privacy-dsr-intake-synthetic','SHIFAA Product Owner','SHIFAA synthetic environment',ARRAY['privacy_dsr_intake'],ARRAY['request_scope'],ARRAY['local-api'],ARRAY['assigned-dpo'],ARRAY['EG'],'privacy-dsr-evidence','synthetic-engineering-only',repeat('1',64),'active'),
 ('privacy-dsr-export-synthetic','SHIFAA Product Owner','SHIFAA synthetic environment',ARRAY['privacy_dsr_export'],ARRAY['released-subject-data'],ARRAY['local-api','private-storage'],ARRAY['data-subject'],ARRAY['EG'],'privacy-dsr-export','synthetic-engineering-only',repeat('2',64),'active'),
 ('privacy-notification-render-synthetic','SHIFAA Product Owner','SHIFAA synthetic environment',ARRAY['privacy_notification'],ARRAY['minimum-template-fields'],ARRAY['local-worker'],ARRAY['data-subject'],ARRAY['EG'],'notification-delivery-metadata','synthetic-engineering-only',repeat('3',64),'active'),
 ('privacy-provider-receipt-synthetic','SHIFAA Product Owner','SHIFAA synthetic environment',ARRAY['provider_receipt'],ARRAY['opaque-receipt'],ARRAY['local-worker','local-synthetic-adapter'],ARRAY['shifaa'],ARRAY['EG'],'provider-receipt-metadata','synthetic-engineering-only',repeat('4',64),'active')
ON CONFLICT(process_code) DO UPDATE SET status='active',updated_at=now();

ALTER TABLE consent.data_subject_requests NO FORCE ROW LEVEL SECURITY;
ALTER TABLE consent.data_subject_request_events NO FORCE ROW LEVEL SECURITY;
ALTER TABLE consent.dsr_assignments NO FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.notification_template_releases NO FORCE ROW LEVEL SECURITY;
SELECT set_config('shifaa.person_id','50000000-0000-4000-8000-000000000001',true);
INSERT INTO consent.data_subject_requests(id,person_id,patient_id,submitted_by_person_id,request_type,scope,contact_preference,status,submitted_at,due_at) VALUES
 ('52000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','access_export','{"data_category_codes":["profile.demographics"]}'::jsonb,'in_app','submitted','2026-08-13T08:00:00Z','2026-08-30T08:00:00Z')
ON CONFLICT(id) DO NOTHING;
INSERT INTO consent.data_subject_request_events(id,request_id,aggregate_version,actor_person_id,actor_type,event_type,to_status,occurred_at) VALUES
 ('55000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001',1,'50000000-0000-4000-8000-000000000001','subject','submitted','submitted','2026-08-13T08:00:00Z')
ON CONFLICT(id) DO NOTHING;
INSERT INTO consent.dsr_assignments(id,request_id,dpo_person_id,assigned_by_person_id,assignment_reason_code,assigned_at) VALUES
 ('59000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000006','50000000-0000-4000-8000-000000000010','synthetic.assignment','2026-08-13T08:05:00Z')
ON CONFLICT(id) DO NOTHING;
INSERT INTO identity.private_evidence_objects(id,bucket_code,object_key,owner_person_id,resource_patient_id,resource_dsr_id,sha256,mime_type,size_bytes,scan_status,released_at) VALUES
 ('53000000-0000-4000-8000-000000000001','dsr-export','synthetic/privacy-005/decision-evidence','50000000-0000-4000-8000-000000000006','51000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001',repeat('6',64),'application/pdf',1024,'released','2026-08-13T08:04:00Z'),
 ('53000000-0000-4000-8000-000000000003','dsr-export','synthetic/privacy-005/export-released','50000000-0000-4000-8000-000000000006','51000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001',repeat('7',64),'application/json',2048,'released','2026-08-13T08:06:00Z')
ON CONFLICT(id) DO NOTHING;
SELECT set_config('shifaa.person_id','50000000-0000-4000-8000-000000000006',true);
SELECT set_config('shifaa.actor_role','DPO',true);
SELECT set_config('shifaa.aal','2',true);
SELECT set_config('shifaa.purposes','privacy.dsr.review',true);
UPDATE consent.data_subject_requests SET status='under_review' WHERE id='52000000-0000-4000-8000-000000000001' AND status='submitted';
INSERT INTO consent.data_subject_request_events(id,request_id,aggregate_version,actor_person_id,actor_type,event_type,from_status,to_status,reason_code,occurred_at) VALUES
 ('55000000-0000-4000-8000-000000000002','52000000-0000-4000-8000-000000000001',2,'50000000-0000-4000-8000-000000000006','dpo','under_review','submitted','under_review','synthetic.assigned','2026-08-13T08:05:00Z')
ON CONFLICT(id) DO NOTHING;
SELECT set_config('shifaa.person_id','50000000-0000-4000-8000-000000000008',true);
SELECT set_config('shifaa.actor_role','ADM-SUPPORT',true);
SELECT set_config('shifaa.purposes','notification.template.manage',true);
INSERT INTO platform.notification_template_releases(id,template_code,release_version,channel,arabic_body,english_body,allowed_recipient_types,allowed_field_schema,placeholder_names,content_digest,status,created_by_person_id) VALUES
 ('54000000-0000-4000-8000-000000000001','DSR_SUBMITTED',1,'sms','{{request_reference}} {{request_type_label}} {{submitted_date}} {{due_date_label}} {{support_path}}','{{request_reference}} {{request_type_label}} {{submitted_date}} {{due_date_label}} {{support_path}}',ARRAY['patient'],'{"type":"object","additionalProperties":false,"properties":{"due_date_label":{"type":"string"},"request_reference":{"type":"string"},"request_type_label":{"type":"string"},"submitted_date":{"type":"string"},"support_path":{"type":"string"}},"required":["due_date_label","request_reference","request_type_label","submitted_date","support_path"]}'::jsonb,ARRAY['due_date_label','request_reference','request_type_label','submitted_date','support_path'],repeat('c',64),'draft','50000000-0000-4000-8000-000000000008')
ON CONFLICT(id) DO NOTHING;
SELECT set_config('shifaa.person_id','50000000-0000-4000-8000-000000000009',true);
SELECT set_config('shifaa.aal','2',true);
SELECT set_config('shifaa.purposes','notification.template.publish',true);
UPDATE platform.notification_template_releases SET status='published',published_by_person_id='50000000-0000-4000-8000-000000000009',effective_at='2026-08-13T08:10:00Z' WHERE id='54000000-0000-4000-8000-000000000001' AND status='draft';
SELECT set_config('shifaa.person_id','',true); SELECT set_config('shifaa.actor_role','',true); SELECT set_config('shifaa.aal','',true); SELECT set_config('shifaa.purposes','',true);
ALTER TABLE consent.data_subject_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE consent.data_subject_request_events FORCE ROW LEVEL SECURITY;
ALTER TABLE consent.dsr_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.notification_template_releases FORCE ROW LEVEL SECURITY;

COMMIT;
