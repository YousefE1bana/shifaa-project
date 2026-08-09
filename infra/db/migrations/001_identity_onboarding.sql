\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'shifaa_api') THEN
    CREATE ROLE shifaa_api LOGIN PASSWORD 'synthetic_api_only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS consent;
CREATE SCHEMA IF NOT EXISTS platform;
CREATE SCHEMA IF NOT EXISTS audit;

CREATE TABLE IF NOT EXISTS identity.people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  display_name text NOT NULL DEFAULT '',
  birth_date date,
  nationality_code char(2) NOT NULL DEFAULT 'EG' CHECK (nationality_code ~ '^[A-Z]{2}$'),
  preferred_locale text NOT NULL DEFAULT 'ar-EG' CHECK (preferred_locale IN ('ar-EG', 'en-EG')),
  phone_e164 text,
  email_normalized text,
  profile_status text NOT NULL DEFAULT 'pending' CHECK (profile_status IN ('pending', 'active', 'suspended', 'pseudonymized', 'deceased')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS people_phone_unique ON identity.people (phone_e164) WHERE phone_e164 IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS people_email_unique ON identity.people (email_normalized) WHERE email_normalized IS NOT NULL;

CREATE TABLE IF NOT EXISTS identity.patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL UNIQUE REFERENCES identity.people(id),
  medical_record_number text NOT NULL UNIQUE,
  record_status text NOT NULL DEFAULT 'active' CHECK (record_status IN ('active', 'suspended', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0)
);

CREATE TABLE IF NOT EXISTS identity.care_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_patient_id uuid NOT NULL REFERENCES identity.patients(id),
  actor_person_id uuid NOT NULL REFERENCES identity.people(id),
  relationship_type text NOT NULL CHECK (relationship_type IN ('self', 'guardianship', 'delegation')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'revoked', 'expired')),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  CHECK (valid_until IS NULL OR valid_until > valid_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS care_relationships_active_self_unique
  ON identity.care_relationships(subject_patient_id)
  WHERE relationship_type = 'self' AND status = 'active';

CREATE TABLE IF NOT EXISTS identity.identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES identity.people(id),
  identity_type text NOT NULL CHECK (identity_type IN ('egyptian_national_id', 'passport', 'unhcr_card')),
  ciphertext bytea NOT NULL,
  nonce bytea NOT NULL CHECK (octet_length(nonce) = 12),
  authentication_tag bytea NOT NULL CHECK (octet_length(authentication_tag) = 16),
  key_version integer NOT NULL CHECK (key_version > 0),
  blind_index bytea NOT NULL CHECK (octet_length(blind_index) = 32),
  issuing_country char(2) NOT NULL CHECK (issuing_country ~ '^[A-Z]{2}$'),
  expires_on date,
  verification_status text NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'manual_review', 'verified', 'rejected', 'failed', 'expired', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS identities_active_blind_index_unique
  ON identity.identities(identity_type, blind_index)
  WHERE verification_status NOT IN ('rejected', 'revoked');
CREATE INDEX IF NOT EXISTS identities_person_created_idx ON identity.identities(person_id, created_at DESC);

CREATE TABLE IF NOT EXISTS identity.verification_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id uuid NOT NULL REFERENCES identity.identities(id),
  provider text NOT NULL CHECK (provider IN ('local', 'valify', 'manual')),
  provider_transaction_id text,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'manual_review', 'verified', 'rejected', 'failed', 'expired')),
  assigned_reviewer_person_id uuid REFERENCES identity.people(id),
  reviewer_person_id uuid REFERENCES identity.people(id),
  reason_code text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  CHECK ((state IN ('verified', 'rejected') AND decided_at IS NOT NULL) OR state NOT IN ('verified', 'rejected'))
);

CREATE INDEX IF NOT EXISTS verification_cases_assignment_idx
  ON identity.verification_cases(assigned_reviewer_person_id, state, created_at);

CREATE TABLE IF NOT EXISTS consent.notice_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_code text NOT NULL,
  version text NOT NULL,
  locale text NOT NULL CHECK (locale IN ('ar-EG', 'en-EG')),
  content text NOT NULL,
  digest text NOT NULL,
  effective_at timestamptz NOT NULL,
  retired_at timestamptz,
  UNIQUE(notice_code, version, locale)
);

CREATE TABLE IF NOT EXISTS consent.purpose_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose_code text NOT NULL,
  version text NOT NULL,
  label_ar text NOT NULL,
  label_en text NOT NULL,
  optional boolean NOT NULL,
  lawful_basis text NOT NULL,
  data_categories text[] NOT NULL DEFAULT '{}',
  recipients text[] NOT NULL DEFAULT '{}',
  cross_border_countries text[] NOT NULL DEFAULT '{}',
  retention_class text NOT NULL,
  effective_at timestamptz NOT NULL,
  retired_at timestamptz,
  UNIQUE(purpose_code, version)
);

CREATE TABLE IF NOT EXISTS consent.records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES identity.people(id),
  purpose_code text NOT NULL,
  purpose_version text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('granted', 'refused', 'withdrawn')),
  capture_channel text NOT NULL CHECK (capture_channel IN ('patient_app', 'admin', 'import')),
  notice_version text NOT NULL,
  occurred_at timestamptz NOT NULL,
  supersedes_id uuid REFERENCES consent.records(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  FOREIGN KEY (purpose_code, purpose_version) REFERENCES consent.purpose_versions(purpose_code, version)
);

CREATE INDEX IF NOT EXISTS consent_records_person_purpose_idx
  ON consent.records(person_id, purpose_code, occurred_at DESC);

CREATE TABLE IF NOT EXISTS consent.processing_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  process_code text NOT NULL UNIQUE,
  owner_name text NOT NULL,
  controller_name text NOT NULL,
  processor_names text[] NOT NULL DEFAULT '{}',
  purposes text[] NOT NULL,
  data_categories text[] NOT NULL,
  systems text[] NOT NULL DEFAULT '{}',
  recipients text[] NOT NULL DEFAULT '{}',
  countries text[] NOT NULL DEFAULT '{EG}',
  retention_class text NOT NULL,
  lawful_basis text NOT NULL,
  approval_digest text NOT NULL,
  status text NOT NULL CHECK (status IN ('draft', 'active', 'suspended', 'retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0)
);

CREATE TABLE IF NOT EXISTS platform.idempotency_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  principal text NOT NULL,
  method text NOT NULL,
  route text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  state text NOT NULL CHECK (state IN ('processing', 'completed', 'failed')),
  response_status integer,
  response_headers jsonb,
  response_body jsonb,
  resource_type text,
  resource_id uuid,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(principal, method, route, idempotency_key)
);

CREATE TABLE IF NOT EXISTS platform.outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('identity.verification.changed', 'identity.manual_review.requested', 'consent.changed')),
  payload jsonb NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'processing', 'delivered', 'dead_letter')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outbox_claim_idx ON platform.outbox_events(state, available_at, created_at);

CREATE TABLE IF NOT EXISTS platform.event_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES platform.outbox_events(id),
  consumer text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  result_code text NOT NULL,
  UNIQUE(event_id, consumer)
);

CREATE TABLE IF NOT EXISTS audit.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  previous_hash text,
  event_hash text NOT NULL,
  actor_person_id uuid,
  purpose_code text,
  patient_id uuid,
  facility_id uuid,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  outcome text NOT NULL,
  request_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE identity.identities IS 'retention_class=identity-proofing; ciphertext and blind index are never selected into user DTOs';
COMMENT ON TABLE consent.records IS 'retention_class=consent-evidence; append-only';
COMMENT ON TABLE audit.events IS 'retention_class=audit-evidence; append-only and hash chained';

CREATE OR REPLACE FUNCTION platform.reject_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'append-only table % cannot be updated or deleted', TG_TABLE_NAME USING ERRCODE = '55000';
END
$$;

DROP TRIGGER IF EXISTS consent_records_append_only ON consent.records;
CREATE TRIGGER consent_records_append_only BEFORE UPDATE OR DELETE ON consent.records
FOR EACH ROW EXECUTE FUNCTION platform.reject_mutation();
DROP TRIGGER IF EXISTS audit_events_append_only ON audit.events;
CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON audit.events
FOR EACH ROW EXECUTE FUNCTION platform.reject_mutation();

CREATE OR REPLACE FUNCTION identity.guard_verification_transition() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE allowed boolean;
BEGIN
  IF NEW.state = OLD.state THEN RETURN NEW; END IF;
  allowed := CASE OLD.state
    WHEN 'pending' THEN NEW.state IN ('verified', 'manual_review', 'failed', 'expired')
    WHEN 'manual_review' THEN NEW.state IN ('verified', 'rejected')
    ELSE false
  END;
  IF NOT allowed THEN
    RAISE EXCEPTION 'invalid verification transition % -> %', OLD.state, NEW.state USING ERRCODE = '23514';
  END IF;
  IF OLD.state = 'manual_review' AND coalesce(btrim(NEW.reason_code), '') = '' THEN
    RAISE EXCEPTION 'manual review decision requires reason' USING ERRCODE = '23514';
  END IF;
  NEW.version := OLD.version + 1;
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS verification_case_transition ON identity.verification_cases;
CREATE TRIGGER verification_case_transition BEFORE UPDATE OF state ON identity.verification_cases
FOR EACH ROW EXECUTE FUNCTION identity.guard_verification_transition();

INSERT INTO consent.notice_versions(notice_code, version, locale, content, digest, effective_at)
VALUES
  ('identity-onboarding', '1.0.0', 'ar-EG', 'نستخدم بياناتك لإنشاء ملفك والتحقق من هويتك. اختر كل غرض اختياري بشكل مستقل.', 'synthetic-notice-ar-v1', '2026-08-09T00:00:00Z'),
  ('identity-onboarding', '1.0.0', 'en-EG', 'We use your data to create your profile and verify your identity. Choose each optional purpose independently.', 'synthetic-notice-en-v1', '2026-08-09T00:00:00Z')
ON CONFLICT DO NOTHING;

INSERT INTO consent.purpose_versions(purpose_code, version, label_ar, label_en, optional, lawful_basis, data_categories, recipients, retention_class, effective_at)
VALUES
  ('identity_proofing', '1.0.0', 'التحقق من الهوية', 'Identity verification', false, 'contract-and-legal-obligation', ARRAY['identity'], ARRAY['authorized-reviewer'], 'identity-proofing', '2026-08-09T00:00:00Z'),
  ('care_updates', '1.0.0', 'تحديثات الرعاية', 'Care updates', true, 'consent', ARRAY['contact'], ARRAY['shifaa'], 'optional-communications', '2026-08-09T00:00:00Z')
ON CONFLICT DO NOTHING;

INSERT INTO consent.processing_inventory(process_code, owner_name, controller_name, purposes, data_categories, systems, retention_class, lawful_basis, approval_digest, status)
VALUES ('identity-onboarding-synthetic', 'SHIFAA Product Owner', 'SHIFAA synthetic environment', ARRAY['identity_proofing'], ARRAY['identity'], ARRAY['local-api'], 'identity-proofing', 'synthetic-engineering-only', 'baseline-v2.1.0-synthetic', 'active')
ON CONFLICT DO NOTHING;

\ir ../policies/001_identity_onboarding_rls.sql
