-- Feature 011 K05: opaque receipt envelope, immutable response tuple, and a
-- deferred all-five structural commit obligation. No plaintext response body
-- or caller-controlled receipt metadata is stored in these relations.

CREATE TABLE clinical.mutation_receipts (
  id uuid PRIMARY KEY,
  idempotency_record_id uuid NOT NULL UNIQUE
    REFERENCES platform.idempotency_records(id) ON DELETE RESTRICT,
  actor_person_id uuid NOT NULL REFERENCES identity.people(id) ON DELETE RESTRICT,
  operation_id text NOT NULL CHECK (operation_id IN (
    'createAllergy', 'verifyAllergy', 'createClinicalContentRelease',
    'signClinicalContentRelease', 'publishClinicalContentRelease')),
  resource_type text NOT NULL CHECK (resource_type IN
    ('clinical.allergy_revision', 'clinical.content_release')),
  resource_id uuid NOT NULL,
  resource_version integer NOT NULL CHECK (resource_version > 0),
  response_status smallint NOT NULL,
  response_etag text NOT NULL,
  response_language text NOT NULL CHECK (response_language IN ('ar-EG', 'en-EG')),
  response_request_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL,
  receipt_contract_id text NOT NULL CHECK (receipt_contract_id = 'SHIFAA-F011-RECEIPT-PROTECTED/1'),
  receipt_key_ref text NOT NULL CHECK (pg_catalog.length(receipt_key_ref) > 0),
  receipt_nonce bytea NOT NULL CHECK (pg_catalog.octet_length(receipt_nonce) = 12),
  receipt_ciphertext bytea NOT NULL CHECK (pg_catalog.octet_length(receipt_ciphertext) > 0),
  receipt_auth_tag bytea NOT NULL CHECK (pg_catalog.octet_length(receipt_auth_tag) = 16),
  UNIQUE (id, idempotency_record_id),
  CHECK (response_etag = '"' || resource_version::text || '"'),
  CHECK (
    (operation_id = 'createAllergy' AND resource_type = 'clinical.allergy_revision' AND response_status = 201)
    OR (operation_id = 'verifyAllergy' AND resource_type = 'clinical.allergy_revision' AND response_status = 200)
    OR (operation_id = 'createClinicalContentRelease' AND resource_type = 'clinical.content_release' AND response_status = 201)
    OR (operation_id IN ('signClinicalContentRelease', 'publishClinicalContentRelease')
      AND resource_type = 'clinical.content_release' AND response_status = 200)
  )
);

CREATE TABLE clinical.mutation_commit_obligations (
  idempotency_record_id uuid PRIMARY KEY
    REFERENCES platform.idempotency_records(id) ON DELETE RESTRICT,
  receipt_id uuid NOT NULL UNIQUE,
  actor_person_id uuid NOT NULL REFERENCES identity.people(id) ON DELETE RESTRICT,
  operation_id text NOT NULL CHECK (operation_id IN (
    'createAllergy', 'verifyAllergy', 'createClinicalContentRelease',
    'signClinicalContentRelease', 'publishClinicalContentRelease')),
  resource_type text NOT NULL CHECK (resource_type IN
    ('clinical.allergy_revision', 'clinical.content_release')),
  resource_id uuid NOT NULL,
  resource_version integer NOT NULL CHECK (resource_version > 0),
  response_status smallint NOT NULL,
  response_etag text NOT NULL,
  response_language text NOT NULL CHECK (response_language IN ('ar-EG', 'en-EG')),
  response_request_id uuid NOT NULL,
  audit_event_occurred_at timestamptz NOT NULL,
  audit_event_id uuid NOT NULL,
  outbox_event_id uuid NOT NULL REFERENCES platform.outbox_events(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL,
  CHECK (response_etag = '"' || resource_version::text || '"'),
  CHECK (
    (operation_id = 'createAllergy' AND resource_type = 'clinical.allergy_revision' AND response_status = 201)
    OR (operation_id = 'verifyAllergy' AND resource_type = 'clinical.allergy_revision' AND response_status = 200)
    OR (operation_id = 'createClinicalContentRelease' AND resource_type = 'clinical.content_release' AND response_status = 201)
    OR (operation_id IN ('signClinicalContentRelease', 'publishClinicalContentRelease')
      AND resource_type = 'clinical.content_release' AND response_status = 200)
  ),
  FOREIGN KEY (receipt_id, idempotency_record_id)
    REFERENCES clinical.mutation_receipts(id, idempotency_record_id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (audit_event_occurred_at, audit_event_id)
    REFERENCES audit.events(occurred_at, id) ON DELETE RESTRICT
);

CREATE INDEX mutation_commit_obligations_outbox_idx
  ON clinical.mutation_commit_obligations(outbox_event_id);
CREATE INDEX mutation_commit_obligations_audit_idx
  ON clinical.mutation_commit_obligations(audit_event_occurred_at, audit_event_id);

CREATE FUNCTION clinical.f011_require_mutation_commit_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, clinical, platform, audit
AS $function$
DECLARE
  local_operation text;
  local_resource_type text;
  local_resource_id uuid;
  local_resource_version integer;
  local_idempotency_id uuid;
  local_receipt_id uuid;
  local_audit_occurred_at timestamptz;
  local_audit_id uuid;
  local_outbox_id uuid;
  local_relevant boolean := false;
  bad boolean;
BEGIN
  IF TG_TABLE_SCHEMA = 'clinical' AND TG_TABLE_NAME = 'allergy_heads' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'allergy heads cannot be deleted';
    END IF;
    local_operation := CASE WHEN TG_OP = 'INSERT' THEN 'createAllergy' ELSE 'verifyAllergy' END;
    local_resource_type := 'clinical.allergy_revision';
    local_resource_id := NEW.id;
    local_resource_version := NEW.current_version;
    local_relevant := true;
  ELSIF TG_TABLE_SCHEMA = 'clinical' AND TG_TABLE_NAME = 'allergies' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'allergy revisions cannot be deleted';
    END IF;
    local_operation := CASE WHEN NEW.version = 1 THEN 'createAllergy' ELSE 'verifyAllergy' END;
    local_resource_type := 'clinical.allergy_revision';
    local_resource_id := NEW.allergy_id;
    local_resource_version := NEW.version;
    local_relevant := true;
  ELSIF TG_TABLE_SCHEMA = 'clinical' AND TG_TABLE_NAME = 'content_releases' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'content releases cannot be deleted';
    END IF;
    local_operation := CASE
      WHEN TG_OP = 'INSERT' THEN 'createClinicalContentRelease'
      WHEN NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published' THEN 'publishClinicalContentRelease'
      ELSE 'signClinicalContentRelease'
    END;
    local_resource_type := 'clinical.content_release';
    local_resource_id := NEW.id;
    local_resource_version := NEW.workflow_version;
    local_relevant := true;
  ELSIF TG_TABLE_SCHEMA = 'audit' AND TG_TABLE_NAME = 'signature_evidence' THEN
    IF TG_OP = 'DELETE' THEN
      IF OLD.resource_type = 'clinical.content_release' THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'clinical signature evidence cannot be deleted';
      END IF;
    ELSIF NEW.resource_type = 'clinical.content_release' THEN
      local_operation := 'signClinicalContentRelease';
      local_resource_type := NEW.resource_type;
      local_resource_id := NEW.resource_id;
      SELECT e.resource_version INTO local_resource_version
      FROM audit.events e
      WHERE e.occurred_at = NEW.audit_event_occurred_at AND e.id = NEW.audit_event_id;
      local_audit_occurred_at := NEW.audit_event_occurred_at;
      local_audit_id := NEW.audit_event_id;
      local_relevant := true;
    END IF;
  ELSIF TG_TABLE_SCHEMA = 'platform' AND TG_TABLE_NAME = 'outbox_events' THEN
    IF TG_OP = 'DELETE' THEN
      IF OLD.aggregate_type IN ('clinical.allergy_revision', 'clinical.content_release') THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Feature 011 outbox obligations cannot be deleted';
      END IF;
    ELSIF NEW.aggregate_type IN ('clinical.allergy_revision', 'clinical.content_release') THEN
      local_resource_type := NEW.aggregate_type;
      local_resource_id := NEW.aggregate_id;
      local_resource_version := NEW.aggregate_version;
      local_outbox_id := NEW.id;
      local_relevant := true;
    END IF;
  ELSIF TG_TABLE_SCHEMA = 'clinical' AND TG_TABLE_NAME = 'mutation_receipts' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Feature 011 receipts cannot be deleted';
    END IF;
    local_idempotency_id := NEW.idempotency_record_id;
    local_receipt_id := NEW.id;
    local_operation := NEW.operation_id;
    local_resource_type := NEW.resource_type;
    local_resource_id := NEW.resource_id;
    local_resource_version := NEW.resource_version;
    local_relevant := true;
  ELSIF TG_TABLE_SCHEMA = 'clinical' AND TG_TABLE_NAME = 'mutation_commit_obligations' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Feature 011 commit obligations cannot be deleted';
    END IF;
    local_idempotency_id := NEW.idempotency_record_id;
    local_receipt_id := NEW.receipt_id;
    local_operation := NEW.operation_id;
    local_resource_type := NEW.resource_type;
    local_resource_id := NEW.resource_id;
    local_resource_version := NEW.resource_version;
    local_audit_occurred_at := NEW.audit_event_occurred_at;
    local_audit_id := NEW.audit_event_id;
    local_outbox_id := NEW.outbox_event_id;
    local_relevant := true;
  ELSIF TG_TABLE_SCHEMA = 'platform' AND TG_TABLE_NAME = 'idempotency_records' THEN
    IF TG_OP = 'DELETE' THEN
      IF OLD.resource_type IN ('clinical.allergy_revision', 'clinical.content_release')
         AND OLD.state = 'completed' THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'completed Feature 011 idempotency rows cannot be deleted';
      END IF;
    ELSIF NEW.state = 'completed'
       AND NEW.resource_type IN ('clinical.allergy_revision', 'clinical.content_release') THEN
      local_idempotency_id := NEW.id;
      local_relevant := true;
    END IF;
  END IF;

  IF local_relevant THEN
    IF local_operation IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM clinical.mutation_commit_obligations o
      WHERE o.operation_id = local_operation AND o.resource_type = local_resource_type
        AND o.resource_id = local_resource_id AND o.resource_version = local_resource_version
        AND (local_audit_id IS NULL OR (o.audit_event_id = local_audit_id
          AND o.audit_event_occurred_at = local_audit_occurred_at))
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'domain mutation lacks its atomic Feature 011 commit obligation';
    END IF;
    IF local_idempotency_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM clinical.mutation_commit_obligations o
      WHERE o.idempotency_record_id = local_idempotency_id
        AND (local_receipt_id IS NULL OR o.receipt_id = local_receipt_id)
        AND (local_audit_id IS NULL OR (o.audit_event_id = local_audit_id
          AND o.audit_event_occurred_at = local_audit_occurred_at))
        AND (local_outbox_id IS NULL OR o.outbox_event_id = local_outbox_id)
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'receipt, idempotency, audit, and outbox must share one commit obligation';
    END IF;
    IF local_outbox_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM clinical.mutation_commit_obligations o
      WHERE o.outbox_event_id = local_outbox_id
        AND o.resource_type = local_resource_type AND o.resource_id = local_resource_id
        AND o.resource_version = local_resource_version
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Feature 011 outbox event lacks its exact commit obligation';
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM clinical.mutation_commit_obligations o
    LEFT JOIN clinical.mutation_receipts r
      ON r.id = o.receipt_id AND r.idempotency_record_id = o.idempotency_record_id
    LEFT JOIN platform.idempotency_records i ON i.id = o.idempotency_record_id
    LEFT JOIN audit.events e
      ON e.occurred_at = o.audit_event_occurred_at AND e.id = o.audit_event_id
    LEFT JOIN platform.outbox_events x ON x.id = o.outbox_event_id
    WHERE r.id IS NULL OR i.id IS NULL OR e.id IS NULL OR x.id IS NULL
       OR r.actor_person_id IS DISTINCT FROM o.actor_person_id
       OR r.operation_id IS DISTINCT FROM o.operation_id
       OR r.resource_type IS DISTINCT FROM o.resource_type
       OR r.resource_id IS DISTINCT FROM o.resource_id
       OR r.resource_version IS DISTINCT FROM o.resource_version
       OR r.response_status IS DISTINCT FROM o.response_status
       OR r.response_etag IS DISTINCT FROM o.response_etag
       OR r.response_language IS DISTINCT FROM o.response_language
       OR r.response_request_id IS DISTINCT FROM o.response_request_id
       OR r.occurred_at IS DISTINCT FROM o.occurred_at
       OR r.receipt_contract_id <> 'SHIFAA-F011-RECEIPT-PROTECTED/1'
       OR i.state <> 'completed' OR i.response_status IS DISTINCT FROM o.response_status::integer
       OR i.principal_type IS DISTINCT FROM 'sha256-v1'
       OR i.principal_hash IS DISTINCT FROM pg_catalog.encode(pg_catalog.sha256(
          pg_catalog.convert_to(
            'shifaa:idempotency:principal:v1:' || pg_catalog.octet_length(o.actor_person_id::text)::text
              || ':' || o.actor_person_id::text,
            'UTF8')),'hex')
       OR i.method IS DISTINCT FROM 'POST'
       OR i.route_template IS DISTINCT FROM CASE o.operation_id
          WHEN 'createAllergy' THEN '/v1/patients/{managedPatientId}/allergies'
          WHEN 'verifyAllergy' THEN '/v1/allergies/{allergyId}/verification'
          WHEN 'createClinicalContentRelease' THEN '/v1/admin/clinical-content/{contentType}/releases'
          WHEN 'signClinicalContentRelease' THEN '/v1/admin/clinical-content/releases/{releaseId}/signatures'
          WHEN 'publishClinicalContentRelease' THEN '/v1/admin/clinical-content/releases/{releaseId}/publish'
          ELSE NULL
       END
       OR i.resource_type IS DISTINCT FROM o.resource_type
       OR i.resource_id IS DISTINCT FROM o.resource_id
       OR i.response_headers IS DISTINCT FROM jsonb_build_object(
          'ETag', o.response_etag, 'Content-Language', o.response_language,
          'Cache-Control', 'private, no-store', 'X-Request-Id', o.response_request_id::text)
       OR i.response_body IS DISTINCT FROM jsonb_build_object('featureReceiptId', o.receipt_id::text)
       OR e.actor_person_id IS DISTINCT FROM o.actor_person_id
       OR e.request_id IS DISTINCT FROM o.response_request_id
       OR e.resource_type IS DISTINCT FROM o.resource_type
       OR e.resource_id IS DISTINCT FROM o.resource_id
       OR e.resource_version IS DISTINCT FROM o.resource_version
       OR e.outcome <> 'success'
       OR x.aggregate_type IS DISTINCT FROM o.resource_type
       OR x.aggregate_id IS DISTINCT FROM o.resource_id
       OR x.aggregate_version IS DISTINCT FROM o.resource_version
       OR x.payload IS DISTINCT FROM '{}'::jsonb
       OR NOT CASE o.operation_id
         WHEN 'createAllergy' THEN EXISTS (
           SELECT 1 FROM clinical.allergies a
           WHERE a.allergy_id = o.resource_id AND a.version = o.resource_version
             AND a.version = 1 AND a.verification_status = 'self_reported')
         WHEN 'verifyAllergy' THEN EXISTS (
           SELECT 1 FROM clinical.allergies a
           WHERE a.allergy_id = o.resource_id AND a.version = o.resource_version AND a.version > 1)
         WHEN 'createClinicalContentRelease' THEN EXISTS (
           SELECT 1 FROM clinical.content_releases cr
           WHERE cr.id = o.resource_id AND cr.workflow_version >= o.resource_version)
         WHEN 'signClinicalContentRelease' THEN EXISTS (
           SELECT 1 FROM audit.signature_evidence s
           WHERE s.audit_event_occurred_at = o.audit_event_occurred_at
             AND s.audit_event_id = o.audit_event_id
             AND s.resource_type = o.resource_type AND s.resource_id = o.resource_id)
         WHEN 'publishClinicalContentRelease' THEN EXISTS (
           SELECT 1 FROM clinical.content_releases cr
           WHERE cr.id = o.resource_id AND cr.status = 'published'
             AND cr.workflow_version >= o.resource_version)
         ELSE false
       END
  ) INTO bad;
  IF bad THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Feature 011 domain, audit, outbox, receipt, and idempotency tuple is incomplete or mismatched';
  END IF;
  RETURN NULL;
END
$function$;

CREATE TRIGGER mutation_receipts_immutable_guard
BEFORE UPDATE OR DELETE ON clinical.mutation_receipts
FOR EACH ROW EXECUTE FUNCTION clinical.f011_reject_immutable_v1();
CREATE TRIGGER mutation_commit_obligations_immutable_guard
BEFORE UPDATE OR DELETE ON clinical.mutation_commit_obligations
FOR EACH ROW EXECUTE FUNCTION clinical.f011_reject_immutable_v1();

CREATE CONSTRAINT TRIGGER mutation_receipts_commit_deferred
AFTER INSERT OR UPDATE OR DELETE ON clinical.mutation_receipts
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION clinical.f011_require_mutation_commit_v1();
CREATE CONSTRAINT TRIGGER mutation_obligations_commit_deferred
AFTER INSERT OR UPDATE OR DELETE ON clinical.mutation_commit_obligations
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION clinical.f011_require_mutation_commit_v1();
CREATE CONSTRAINT TRIGGER allergy_heads_receipt_deferred
AFTER INSERT OR UPDATE OR DELETE ON clinical.allergy_heads
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION clinical.f011_require_mutation_commit_v1();
CREATE CONSTRAINT TRIGGER allergies_receipt_deferred
AFTER INSERT OR UPDATE OR DELETE ON clinical.allergies
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION clinical.f011_require_mutation_commit_v1();
CREATE CONSTRAINT TRIGGER content_releases_receipt_deferred
AFTER INSERT OR UPDATE OR DELETE ON clinical.content_releases
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION clinical.f011_require_mutation_commit_v1();
CREATE CONSTRAINT TRIGGER clinical_signatures_receipt_deferred
AFTER INSERT OR UPDATE OR DELETE ON audit.signature_evidence
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION clinical.f011_require_mutation_commit_v1();
CREATE CONSTRAINT TRIGGER feature011_outbox_receipt_deferred
AFTER INSERT OR UPDATE OR DELETE ON platform.outbox_events
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION clinical.f011_require_mutation_commit_v1();
CREATE CONSTRAINT TRIGGER feature011_idempotency_receipt_deferred
AFTER INSERT OR UPDATE OR DELETE ON platform.idempotency_records
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION clinical.f011_require_mutation_commit_v1();

ALTER TABLE clinical.mutation_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical.mutation_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE clinical.mutation_commit_obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical.mutation_commit_obligations FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE clinical.mutation_receipts, clinical.mutation_commit_obligations FROM PUBLIC;
REVOKE ALL ON FUNCTION clinical.f011_require_mutation_commit_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION clinical.f011_reject_immutable_v1() FROM PUBLIC;

DO $revoke_roles$
DECLARE grantee name;
BEGIN
  FOREACH grantee IN ARRAY ARRAY['shifaa_api', 'shifaa_worker', 'anon', 'authenticated', 'service_role']::name[] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = grantee) THEN
      EXECUTE pg_catalog.format('REVOKE ALL ON TABLE clinical.mutation_receipts, clinical.mutation_commit_obligations FROM %I', grantee);
      EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION clinical.f011_require_mutation_commit_v1() FROM %I', grantee);
      EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION clinical.f011_reject_immutable_v1() FROM %I', grantee);
    END IF;
  END LOOP;
END
$revoke_roles$;
