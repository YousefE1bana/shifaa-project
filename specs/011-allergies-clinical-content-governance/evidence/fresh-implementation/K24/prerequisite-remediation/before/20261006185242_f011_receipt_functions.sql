-- Feature 011 K06: same-transaction envelope finalization and replay of the
-- original opaque receipt tuple. Protected fields remain opaque to SQL.

CREATE FUNCTION clinical.f011_finalize_receipt_v1(p_receipt_id uuid,p_envelope jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  obligation_row clinical.mutation_commit_obligations%ROWTYPE;
  existing_receipt clinical.mutation_receipts%ROWTYPE;
  idempotency_row platform.idempotency_records%ROWTYPE;
  decoded record;
  actor uuid := platform.context_person_id();
  native_request uuid := NULLIF(pg_catalog.current_setting('shifaa.request_id',true),'')::uuid;
  updated_id uuid;
BEGIN
  IF session_user <> 'shifaa_api' OR actor IS NULL OR p_receipt_id IS NULL THEN
    RAISE EXCEPTION 'Feature 011 receipt finalization context denied' USING ERRCODE='42501';
  END IF;
  -- The mutation entrypoint already claimed and locked idempotency at rank 1.
  -- These reads deliberately acquire no new rank-1 lock after rank-9 effects.
  SELECT * INTO obligation_row FROM clinical.mutation_commit_obligations obligation
  WHERE obligation.receipt_id=p_receipt_id AND obligation.actor_person_id=actor;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Feature 011 receipt finalization is not authorized' USING ERRCODE='42501';
  END IF;
  IF platform.context_action() IS DISTINCT FROM obligation_row.operation_id
     OR COALESCE(pg_catalog.cardinality(platform.context_purposes()),0)=0
     OR platform.context_aal() < (CASE WHEN obligation_row.operation_id IN
         ('verifyAllergy','createClinicalContentRelease','signClinicalContentRelease','publishClinicalContentRelease')
         THEN 2 ELSE 1 END) THEN
    RAISE EXCEPTION 'Feature 011 receipt finalization action or assurance denied' USING ERRCODE='42501';
  END IF;
  IF obligation_row.actor_person_id IS DISTINCT FROM actor
     OR obligation_row.response_request_id IS DISTINCT FROM native_request THEN
    RAISE EXCEPTION 'Feature 011 receipt finalizer principal/request mismatch' USING ERRCODE='42501';
  END IF;
  SELECT * INTO STRICT idempotency_row FROM platform.idempotency_records record
  WHERE record.id=obligation_row.idempotency_record_id;
  IF idempotency_row.state <> 'processing'
     OR idempotency_row.principal_type IS DISTINCT FROM 'sha256-v1'
     OR idempotency_row.principal_hash IS DISTINCT FROM pg_catalog.encode(audit.sha256_v1(
       pg_catalog.convert_to('shifaa:idempotency:principal:v1:'
         || pg_catalog.octet_length(actor::text)::text || ':' || actor::text,'UTF8')),'hex')
     OR idempotency_row.method IS DISTINCT FROM 'POST'
     OR idempotency_row.route_template IS DISTINCT FROM (CASE obligation_row.operation_id
       WHEN 'createAllergy' THEN '/v1/patients/{managedPatientId}/allergies'
       WHEN 'verifyAllergy' THEN '/v1/allergies/{allergyId}/verification'
       WHEN 'createClinicalContentRelease' THEN '/v1/admin/clinical-content/{contentType}/releases'
       WHEN 'signClinicalContentRelease' THEN '/v1/admin/clinical-content/releases/{releaseId}/signatures'
       WHEN 'publishClinicalContentRelease' THEN '/v1/admin/clinical-content/releases/{releaseId}/publish'
       ELSE NULL END)
     OR idempotency_row.resource_type IS NOT NULL OR idempotency_row.resource_id IS NOT NULL THEN
    RAISE EXCEPTION 'Feature 011 idempotency scope is not the claimed current mutation' USING ERRCODE='42501';
  END IF;
  SELECT * INTO decoded FROM clinical.f011_decode_envelope_v1(
    p_envelope,'SHIFAA-F011-RECEIPT-PROTECTED/1');

  SELECT * INTO existing_receipt FROM clinical.mutation_receipts receipt
  WHERE receipt.id=p_receipt_id;
  IF FOUND THEN
    RAISE EXCEPTION 'Feature 011 receipt has already been finalized' USING ERRCODE='23514';
  END IF;

  INSERT INTO clinical.mutation_receipts(
    id,idempotency_record_id,actor_person_id,operation_id,resource_type,resource_id,
    resource_version,response_status,response_etag,response_language,response_request_id,
    occurred_at,receipt_contract_id,receipt_key_ref,receipt_nonce,receipt_ciphertext,receipt_auth_tag
  ) VALUES (
    p_receipt_id,obligation_row.idempotency_record_id,obligation_row.actor_person_id,
    obligation_row.operation_id,obligation_row.resource_type,obligation_row.resource_id,
    obligation_row.resource_version,obligation_row.response_status,obligation_row.response_etag,
    obligation_row.response_language,obligation_row.response_request_id,obligation_row.occurred_at,
    'SHIFAA-F011-RECEIPT-PROTECTED/1',decoded.key_ref,decoded.nonce_bytes,
    decoded.ciphertext_bytes,decoded.tag_bytes
  );
  UPDATE platform.idempotency_records record
  SET state='completed',response_status=obligation_row.response_status::integer,
      response_headers=pg_catalog.jsonb_build_object(
        'ETag',obligation_row.response_etag,'Content-Language',obligation_row.response_language,
        'Cache-Control','private, no-store','X-Request-Id',obligation_row.response_request_id::text),
      response_body=pg_catalog.jsonb_build_object('featureReceiptId',p_receipt_id::text),
      resource_type=obligation_row.resource_type,resource_id=obligation_row.resource_id,
      updated_at=obligation_row.occurred_at
  WHERE record.id=obligation_row.idempotency_record_id AND record.state='processing'
  RETURNING record.id INTO updated_id;
  IF updated_id IS NULL THEN
    RAISE EXCEPTION 'Feature 011 idempotency completion compare-and-swap failed' USING ERRCODE='23514';
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'featureReceiptId',p_receipt_id::text,'receiptId',p_receipt_id::text,
    'operationId',obligation_row.operation_id,'resourceType',obligation_row.resource_type,
    'resourceId',obligation_row.resource_id,'resourceVersion',obligation_row.resource_version,
    'responseStatus',obligation_row.response_status,'responseEtag',obligation_row.response_etag,
    'responseLanguage',obligation_row.response_language,'responseRequestId',obligation_row.response_request_id,
    'occurredAt',obligation_row.occurred_at,'replay',false,'receiptEnvelope',p_envelope);
END
$function$;

CREATE FUNCTION clinical.f011_signer_receipt_basis_current_v1(p_receipt_id uuid,p_actor_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  receipt_row clinical.mutation_receipts%ROWTYPE;
  obligation_row clinical.mutation_commit_obligations%ROWTYPE;
  signature_row audit.signature_evidence%ROWTYPE;
  binding_row clinical.content_signature_bindings%ROWTYPE;
  release_row clinical.content_releases%ROWTYPE;
  series_row clinical.content_series%ROWTYPE;
  credential_row identity.professional_licenses%ROWTYPE;
  designation_row clinical.content_reviewer_designations%ROWTYPE;
  authority_row clinical.content_governance_authorities%ROWTYPE;
  signature_id uuid;
  target_series_id uuid;
  scoped_facility_id uuid;
  native_facility_id uuid := NULLIF(pg_catalog.current_setting('shifaa.facility_id',true),'')::uuid;
  authorization_now timestamptz;
  authorization_day date;
BEGIN
  IF p_receipt_id IS NULL OR p_actor_id IS NULL THEN RETURN false; END IF;
  SELECT * INTO receipt_row FROM clinical.mutation_receipts receipt
  WHERE receipt.id=p_receipt_id AND receipt.actor_person_id=p_actor_id
    AND receipt.operation_id='signClinicalContentRelease';
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO obligation_row FROM clinical.mutation_commit_obligations obligation
  WHERE obligation.receipt_id=p_receipt_id AND obligation.actor_person_id=p_actor_id
    AND obligation.operation_id='signClinicalContentRelease';
  IF NOT FOUND OR obligation_row.audit_event_id IS NULL
     OR obligation_row.audit_event_occurred_at IS NULL THEN RETURN false; END IF;
  SELECT signature.id INTO signature_id FROM audit.signature_evidence signature
  JOIN clinical.content_releases release ON release.id=signature.resource_id
  WHERE signature.audit_event_id=obligation_row.audit_event_id
    AND signature.audit_event_occurred_at=obligation_row.audit_event_occurred_at
    AND signature.resource_type=receipt_row.resource_type
    AND signature.resource_id=receipt_row.resource_id
    AND signature.resource_version=release.artifact_version
    AND signature.signer_person_id=p_actor_id;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO signature_row FROM audit.signature_evidence signature
  WHERE signature.id=signature_id;
  SELECT * INTO binding_row FROM clinical.content_signature_bindings binding
  WHERE binding.signature_evidence_id=signature_id;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT release.series_id INTO target_series_id FROM clinical.content_releases release
  WHERE release.id=receipt_row.resource_id;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO series_row FROM clinical.content_series series WHERE series.id=target_series_id;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(series_row.content_type || pg_catalog.chr(31)
      || series_row.governed_content_key || pg_catalog.chr(31) || series_row.effective_scope_key,0)
  );
  PERFORM series.id FROM clinical.content_series series WHERE series.id=target_series_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM release.id FROM clinical.content_releases release
  WHERE release.series_id=target_series_id ORDER BY release.id FOR UPDATE;
  SELECT * INTO release_row FROM clinical.content_releases release
  WHERE release.id=receipt_row.resource_id AND release.series_id=target_series_id;
  IF NOT FOUND THEN RETURN false; END IF;

  scoped_facility_id := binding_row.authority_facility_id;
  IF scoped_facility_id IS NOT NULL THEN
    PERFORM facility.id FROM identity.facilities facility WHERE facility.id=scoped_facility_id FOR SHARE;
    IF NOT FOUND THEN RETURN false; END IF;
  END IF;
  SELECT * INTO credential_row FROM identity.professional_licenses credential
  WHERE credential.id=binding_row.credential_id FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF scoped_facility_id IS NOT NULL THEN
    PERFORM license.id FROM identity.facility_licenses license
    WHERE license.facility_id=scoped_facility_id ORDER BY license.id FOR SHARE;
    PERFORM membership.id FROM identity.facility_memberships membership
    WHERE membership.facility_id=scoped_facility_id AND membership.person_id=p_actor_id
      AND membership.employment_license_id=binding_row.credential_id
      AND membership.role_code=CASE binding_row.credential_profession
        WHEN 'doctor' THEN 'doctor' WHEN 'pharmacist' THEN 'pharmacist' ELSE '' END
    ORDER BY membership.id FOR SHARE;
  END IF;
  PERFORM evidence.id FROM identity.private_evidence_objects evidence
  WHERE evidence.id IN (
    SELECT credential.evidence_object_id FROM identity.professional_licenses credential
    WHERE credential.id=binding_row.credential_id AND credential.evidence_object_id IS NOT NULL
    UNION
    SELECT license.evidence_object_id FROM identity.facility_licenses license
    WHERE license.facility_id=scoped_facility_id AND scoped_facility_id IS NOT NULL
      AND license.evidence_object_id IS NOT NULL
  ) ORDER BY evidence.id FOR SHARE;

  PERFORM person.id FROM identity.people person
  WHERE person.id IN (
    p_actor_id,release_row.created_by_person_id,credential_row.reviewed_by_person_id,
    binding_row.designation_by,binding_row.authority_issued_by
  ) OR person.id IN (
    SELECT license.reviewed_by_person_id FROM identity.facility_licenses license
    WHERE license.facility_id=scoped_facility_id AND scoped_facility_id IS NOT NULL
      AND license.reviewed_by_person_id IS NOT NULL
  ) ORDER BY person.id FOR SHARE;
  SELECT * INTO authority_row FROM clinical.content_governance_authorities authority
  WHERE authority.id=binding_row.signing_authority_id FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO designation_row FROM clinical.content_reviewer_designations designation
  WHERE designation.id=binding_row.designation_id FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;

  authorization_now := pg_catalog.clock_timestamp();
  authorization_day := (authorization_now AT TIME ZONE 'UTC')::date;
  IF receipt_row.actor_person_id IS DISTINCT FROM p_actor_id
     OR receipt_row.operation_id IS DISTINCT FROM obligation_row.operation_id
     OR receipt_row.resource_type IS DISTINCT FROM 'clinical.content_release'
     OR receipt_row.resource_id IS DISTINCT FROM obligation_row.resource_id
     OR receipt_row.resource_id IS DISTINCT FROM release_row.id
     OR receipt_row.resource_version IS DISTINCT FROM obligation_row.resource_version
     OR receipt_row.response_status IS DISTINCT FROM obligation_row.response_status
     OR receipt_row.response_etag IS DISTINCT FROM obligation_row.response_etag
     OR receipt_row.response_language IS DISTINCT FROM obligation_row.response_language
     OR receipt_row.response_request_id IS DISTINCT FROM obligation_row.response_request_id
     OR obligation_row.resource_type IS DISTINCT FROM 'clinical.content_release'
     OR obligation_row.resource_id IS DISTINCT FROM release_row.id
     OR signature_row.resource_type IS DISTINCT FROM 'clinical.content_release'
     OR signature_row.resource_id IS DISTINCT FROM release_row.id
     OR signature_row.resource_version IS DISTINCT FROM release_row.artifact_version
     OR signature_row.artifact_digest IS DISTINCT FROM release_row.artifact_digest
     OR signature_row.signer_person_id IS DISTINCT FROM p_actor_id
     OR signature_row.decision NOT IN ('approved','rejected')
     OR signature_row.signed_at > authorization_now
     OR signature_row.audit_event_id IS DISTINCT FROM obligation_row.audit_event_id
     OR signature_row.audit_event_occurred_at IS DISTINCT FROM obligation_row.audit_event_occurred_at
     OR signature_row.signer_role IS DISTINCT FROM (CASE platform.context_role()
       WHEN 'CLN' THEN 'physician' WHEN 'PHA' THEN 'pharmacist' ELSE NULL END)
     OR binding_row.binding_contract_id IS DISTINCT FROM 'SHIFAA-F011-VERIFIED-EVIDENCE-BINDING/1'
     OR binding_row.producer_id IS DISTINCT FROM 'f011.signing_port'
     OR binding_row.evidence_ref IS NULL OR binding_row.verified_at > authorization_now
     OR pg_catalog.length(binding_row.source_identity)=0
     OR pg_catalog.length(binding_row.source_evidence_identity)=0
     OR (binding_row.source_evidence_sha256 IS NOT NULL AND binding_row.source_evidence_version IS NULL)
     OR binding_row.credential_version IS DISTINCT FROM credential_row.version
     OR binding_row.credential_profession IS DISTINCT FROM credential_row.profession
     OR binding_row.credential_status IS DISTINCT FROM credential_row.status
     OR binding_row.credential_expires_on IS DISTINCT FROM credential_row.expires_on
     OR binding_row.credential_issuer IS DISTINCT FROM credential_row.issuer
     OR binding_row.credential_evidence_object_id IS DISTINCT FROM credential_row.evidence_object_id
     OR binding_row.credential_reviewed_by IS DISTINCT FROM credential_row.reviewed_by_person_id
     OR binding_row.credential_reviewed_at IS DISTINCT FROM credential_row.reviewed_at
     OR credential_row.person_id IS DISTINCT FROM p_actor_id
     OR credential_row.status IS DISTINCT FROM 'verified'
     OR credential_row.profession IS DISTINCT FROM (CASE platform.context_role()
       WHEN 'CLN' THEN 'doctor' WHEN 'PHA' THEN 'pharmacist' ELSE NULL END)
     OR credential_row.expires_on < authorization_day
     OR binding_row.designation_version IS DISTINCT FROM designation_row.version
     OR binding_row.designation_evidence_ref IS DISTINCT FROM designation_row.evidence_ref
     OR binding_row.designation_by IS DISTINCT FROM designation_row.designated_by
     OR binding_row.designation_status IS DISTINCT FROM designation_row.status
     OR binding_row.designation_valid_from IS DISTINCT FROM designation_row.valid_from
     OR binding_row.designation_valid_until IS DISTINCT FROM designation_row.valid_until
     OR binding_row.designation_source_identity IS DISTINCT FROM designation_row.source_identity
     OR binding_row.designation_source_evidence_identity IS DISTINCT FROM designation_row.source_evidence_identity
     OR binding_row.designation_source_evidence_version IS DISTINCT FROM designation_row.source_evidence_version
     OR binding_row.designation_source_evidence_sha256 IS DISTINCT FROM designation_row.source_evidence_sha256
     OR binding_row.designation_evidence_producer_id IS DISTINCT FROM designation_row.evidence_producer_id
     OR binding_row.designation_evidence_verified_at IS DISTINCT FROM designation_row.evidence_verified_at
     OR designation_row.person_id IS DISTINCT FROM p_actor_id
     OR designation_row.professional_license_id IS DISTINCT FROM credential_row.id
     OR designation_row.reviewer_capacity IS DISTINCT FROM signature_row.signer_role
     OR designation_row.status IS DISTINCT FROM 'active'
     OR designation_row.valid_from > authorization_now
     OR (designation_row.valid_until IS NOT NULL AND designation_row.valid_until<=authorization_now)
     OR designation_row.evidence_producer_id IS DISTINCT FROM 'f011.governance_provisioner'
     OR designation_row.evidence_verified_at > authorization_now
     OR binding_row.signing_authority_version IS DISTINCT FROM authority_row.version
     OR binding_row.authority_action IS DISTINCT FROM authority_row.action
     OR binding_row.authority_content_type IS DISTINCT FROM authority_row.content_type
     OR binding_row.authority_governed_content_key IS DISTINCT FROM authority_row.governed_content_key
     OR binding_row.authority_effective_scope_key IS DISTINCT FROM authority_row.effective_scope_key
     OR binding_row.authority_facility_id IS DISTINCT FROM authority_row.facility_id
     OR binding_row.authority_issued_by IS DISTINCT FROM authority_row.issued_by
     OR binding_row.authority_evidence_ref IS DISTINCT FROM authority_row.evidence_ref
     OR binding_row.authority_status IS DISTINCT FROM authority_row.status
     OR binding_row.authority_valid_from IS DISTINCT FROM authority_row.valid_from
     OR binding_row.authority_valid_until IS DISTINCT FROM authority_row.valid_until
     OR binding_row.authority_source_identity IS DISTINCT FROM authority_row.source_identity
     OR binding_row.authority_source_evidence_identity IS DISTINCT FROM authority_row.source_evidence_identity
     OR binding_row.authority_source_evidence_version IS DISTINCT FROM authority_row.source_evidence_version
     OR binding_row.authority_source_evidence_sha256 IS DISTINCT FROM authority_row.source_evidence_sha256
     OR binding_row.authority_evidence_producer_id IS DISTINCT FROM authority_row.evidence_producer_id
     OR binding_row.authority_evidence_verified_at IS DISTINCT FROM authority_row.evidence_verified_at
     OR authority_row.person_id IS DISTINCT FROM p_actor_id
     OR authority_row.action IS DISTINCT FROM 'signClinicalContentRelease'
     OR authority_row.capacity IS DISTINCT FROM signature_row.signer_role
     OR authority_row.content_type IS DISTINCT FROM series_row.content_type
     OR authority_row.governed_content_key IS DISTINCT FROM series_row.governed_content_key
     OR authority_row.effective_scope_key IS DISTINCT FROM series_row.effective_scope_key
     OR authority_row.status IS DISTINCT FROM 'active'
     OR authority_row.valid_from > authorization_now
     OR (authority_row.valid_until IS NOT NULL AND authority_row.valid_until<=authorization_now)
     OR authority_row.evidence_producer_id IS DISTINCT FROM 'f011.governance_provisioner'
     OR authority_row.evidence_verified_at > authorization_now
     OR (scoped_facility_id IS NOT NULL AND scoped_facility_id IS DISTINCT FROM native_facility_id)
     OR p_actor_id=release_row.created_by_person_id
     OR p_actor_id IN (credential_row.reviewed_by_person_id,designation_row.designated_by,authority_row.issued_by)
     OR NOT EXISTS (SELECT 1 FROM identity.people person
       WHERE person.id=p_actor_id AND person.profile_status='active')
     OR (credential_row.evidence_object_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM identity.private_evidence_objects evidence
       WHERE evidence.id=credential_row.evidence_object_id
         AND evidence.owner_person_id=p_actor_id AND evidence.bucket_code='professional-license-evidence'
         AND evidence.scan_status='released'))
     OR EXISTS (SELECT 1 FROM audit.signature_evidence prior
       WHERE prior.resource_type='clinical.content_release'
         AND prior.resource_id=release_row.id AND prior.signer_person_id=p_actor_id
         AND prior.id<>signature_id)
     OR (scoped_facility_id IS NOT NULL AND (
       NOT EXISTS (SELECT 1 FROM identity.facilities facility
         WHERE facility.id=scoped_facility_id AND facility.facility_status='active')
       OR NOT EXISTS (SELECT 1 FROM identity.facility_licenses license
        JOIN identity.private_evidence_objects evidence ON evidence.id=license.evidence_object_id
         WHERE license.facility_id=scoped_facility_id AND license.status='verified'
           AND license.expires_on>=authorization_day AND evidence.scan_status='released'
           AND evidence.bucket_code='facility-license-evidence'
           AND evidence.facility_id=scoped_facility_id)
       OR NOT EXISTS (SELECT 1 FROM identity.facility_memberships membership
         WHERE membership.facility_id=scoped_facility_id AND membership.person_id=p_actor_id
           AND membership.employment_license_id=credential_row.id
           AND membership.role_code=credential_row.profession AND membership.membership_status='active'
           AND membership.valid_from<=authorization_now
           AND (membership.valid_until IS NULL OR membership.valid_until>authorization_now))
     )) THEN RETURN false; END IF;
  RETURN true;
END
$function$;

CREATE FUNCTION clinical.f011_receipt_replay_metadata_v1(p_receipt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  receipt_row clinical.mutation_receipts%ROWTYPE;
  obligation_row clinical.mutation_commit_obligations%ROWTYPE;
  actor uuid := platform.context_person_id();
  patient_id uuid;
  current_facility uuid := NULLIF(pg_catalog.current_setting('shifaa.facility_id',true),'')::uuid;
  current_encounter uuid := NULLIF(pg_catalog.current_setting('shifaa.encounter_id',true),'')::uuid;
  release_series clinical.content_series%ROWTYPE;
BEGIN
  IF session_user <> 'shifaa_api' OR actor IS NULL OR p_receipt_id IS NULL THEN
    RAISE EXCEPTION 'Feature 011 replay principal or current request context denied' USING ERRCODE='42501';
  END IF;
  SELECT * INTO receipt_row FROM clinical.mutation_receipts receipt
  WHERE receipt.id=p_receipt_id AND receipt.actor_person_id=actor;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Feature 011 replay principal or current request context denied' USING ERRCODE='42501';
  END IF;
  SELECT * INTO obligation_row FROM clinical.mutation_commit_obligations obligation
  WHERE obligation.receipt_id=p_receipt_id AND obligation.actor_person_id=actor;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Feature 011 replay principal or current request context denied' USING ERRCODE='42501';
  END IF;
  IF actor IS NULL
     OR actor IS DISTINCT FROM receipt_row.actor_person_id
     OR platform.context_action() IS DISTINCT FROM receipt_row.operation_id
     OR NULLIF(pg_catalog.current_setting('shifaa.request_id',true),'')::uuid IS NULL
     OR COALESCE(pg_catalog.cardinality(platform.context_purposes()),0)=0
     OR platform.context_aal() < (CASE WHEN receipt_row.operation_id='verifyAllergy'
          OR receipt_row.operation_id IN ('createClinicalContentRelease','signClinicalContentRelease','publishClinicalContentRelease')
          THEN 2 ELSE 1 END) THEN
    RAISE EXCEPTION 'Feature 011 replay principal or current request context denied' USING ERRCODE='42501';
  END IF;
  IF receipt_row.operation_id IN ('createAllergy','verifyAllergy') THEN
    SELECT allergy.patient_id INTO STRICT patient_id FROM clinical.allergies allergy
    WHERE allergy.allergy_id=receipt_row.resource_id
      AND allergy.version=receipt_row.resource_version;
    PERFORM 1 FROM clinical.f011_allergy_current_authority_v1(
      patient_id,receipt_row.operation_id,current_facility,current_encounter);
  ELSIF receipt_row.operation_id IN ('createClinicalContentRelease','publishClinicalContentRelease') THEN
    PERFORM clinical.f011_lock_medical_reviewer_v1(actor);
  ELSIF receipt_row.operation_id='signClinicalContentRelease' THEN
    IF platform.context_role() NOT IN ('CLN','PHA')
       OR NOT clinical.f011_signer_receipt_basis_current_v1(p_receipt_id,actor) THEN
      RAISE EXCEPTION 'current signer credential, designation, or authority no longer permits receipt replay' USING ERRCODE='42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'unsupported Feature 011 receipt operation' USING ERRCODE='42501';
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'receiptId',receipt_row.id::text,'featureReceiptId',receipt_row.id::text,
    'replay',true,'actorPersonId',receipt_row.actor_person_id,
    'operationId',receipt_row.operation_id,'resourceType',receipt_row.resource_type,
    'resourceId',receipt_row.resource_id,'resourceVersion',receipt_row.resource_version,
    'responseStatus',receipt_row.response_status,'responseEtag',receipt_row.response_etag,
    'responseLanguage',receipt_row.response_language,'responseRequestId',receipt_row.response_request_id,
    'occurredAt',receipt_row.occurred_at,
    'receiptEnvelope',pg_catalog.jsonb_build_object(
      'contractId',receipt_row.receipt_contract_id,'keyRef',receipt_row.receipt_key_ref,
      'nonce',pg_catalog.encode(receipt_row.receipt_nonce,'hex'),
      'ciphertext',pg_catalog.encode(receipt_row.receipt_ciphertext,'hex'),
      'authTag',pg_catalog.encode(receipt_row.receipt_auth_tag,'hex')));
END
$function$;

GRANT CREATE ON SCHEMA clinical TO shifaa_f011_executor;
ALTER FUNCTION clinical.f011_finalize_receipt_v1(uuid,jsonb) OWNER TO shifaa_f011_executor;
ALTER FUNCTION clinical.f011_signer_receipt_basis_current_v1(uuid,uuid) OWNER TO shifaa_f011_executor;
ALTER FUNCTION clinical.f011_receipt_replay_metadata_v1(uuid) OWNER TO shifaa_f011_executor;
REVOKE CREATE ON SCHEMA clinical FROM shifaa_f011_executor;
REVOKE ALL ON FUNCTION clinical.f011_finalize_receipt_v1(uuid,jsonb),
  clinical.f011_signer_receipt_basis_current_v1(uuid,uuid),
  clinical.f011_receipt_replay_metadata_v1(uuid) FROM PUBLIC,shifaa_worker,service_role;
GRANT EXECUTE ON FUNCTION clinical.f011_signer_receipt_basis_current_v1(uuid,uuid) TO shifaa_f011_executor;
GRANT EXECUTE ON FUNCTION clinical.f011_finalize_receipt_v1(uuid,jsonb) TO shifaa_api;
GRANT EXECUTE ON FUNCTION clinical.f011_receipt_replay_metadata_v1(uuid) TO shifaa_f011_executor;
