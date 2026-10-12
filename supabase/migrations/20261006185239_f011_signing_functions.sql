-- Feature 011 K06: exact, independent clinician/pharmacist decision binding.

CREATE FUNCTION clinical.sign_clinical_content_release_api_v1(
  p_release_id uuid, p_expected_workflow_version integer, p_input jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  signing jsonb := p_input->'signing';
  credential_basis jsonb := signing->'credentialBasis';
  designation_basis jsonb := signing->'designationBasis';
  authority_basis jsonb := signing->'authorityBasis';
  actor uuid;
  idem_id uuid;
  idem_new boolean;
  idem_response jsonb;
  release_row clinical.content_releases%ROWTYPE;
  series_row clinical.content_series%ROWTYPE;
  credential_row identity.professional_licenses%ROWTYPE;
  designation_row clinical.content_reviewer_designations%ROWTYPE;
  authority_row clinical.content_governance_authorities%ROWTYPE;
  scoped_facility_id uuid;
  native_facility_id uuid := NULLIF(pg_catalog.current_setting('shifaa.facility_id',true),'')::uuid;
  facility_license_id uuid;
  facility_license_evidence uuid;
  membership_id uuid;
  professional_evidence uuid;
  target_series_id uuid;
  binding_id uuid;
  signature_id uuid := pg_catalog.gen_random_uuid();
  signer_id uuid;
  decision_value text;
  capacity_value text;
  profession_value text;
  event_id uuid;
  event_time timestamptz;
  result jsonb;
  creator_id uuid;
  source_hash bytea;
  designation_hash bytea;
  authority_hash bytea;
  signing_time timestamptz;
BEGIN
  PERFORM clinical.f011_assert_exact_keys_v1(
    p_input, ARRAY['responseLanguage','responseRequestId','signing']::text[]
  );

  -- A committed receipt needs current authorization, not new producer work.
  actor := clinical.f011_assert_response_context_v1(
    'signClinicalContentRelease',p_input->>'responseLanguage',
    (p_input->>'responseRequestId')::uuid,2
  );
  SELECT record_id,is_new,response_body INTO idem_id,idem_new,idem_response
  FROM clinical.begin_mutation_v1('POST','/v1/admin/clinical-content/releases/{releaseId}/signatures');
  IF NOT idem_new THEN
    RETURN clinical.f011_receipt_replay_metadata_v1((idem_response->>'featureReceiptId')::uuid);
  END IF;
  -- The existing claim settles any prior transaction; absent producer input
  -- must roll back its new claim without a domain effect. Never infer absence
  -- from a generic validation, runtime, authorization, or connection failure.
  IF idem_new AND (signing IS NULL OR signing='null'::jsonb) THEN
    RAISE EXCEPTION 'F011_FRESH_PREPARATION_REQUIRED' USING ERRCODE='22023';
  END IF;

  PERFORM clinical.f011_assert_exact_keys_v1(signing, ARRAY[
    'contractId','profile','bindingId','producerId','verifiedAt','releaseId','artifactVersion',
    'artifactDigest','signerPersonId','capacity','decision','evidenceRef','sourceIdentity',
    'sourceEvidenceIdentity','sourceEvidenceVersion','sourceEvidenceSha256',
    'credentialBasis','designationBasis','authorityBasis'
  ]::text[]);
  PERFORM clinical.f011_assert_exact_keys_v1(credential_basis, ARRAY[
    'id','version','personId','profession','status','expiresOn','issuer','evidenceObjectId',
    'reviewedByPersonId','reviewedAt'
  ]::text[]);
  PERFORM clinical.f011_assert_exact_keys_v1(designation_basis, ARRAY[
    'id','version','personId','professionalLicenseId','capacity','evidenceRef','designatedBy',
    'status','validFrom','validUntil','sourceIdentity','sourceEvidenceIdentity',
    'sourceEvidenceVersion','sourceEvidenceSha256','evidenceProducerId','evidenceVerifiedAt'
  ]::text[]);
  PERFORM clinical.f011_assert_exact_keys_v1(authority_basis, ARRAY[
    'id','version','personId','action','capacity','contentType','governedContentKey',
    'effectiveScopeKey','facilityId','issuedBy','evidenceRef','status','validFrom','validUntil',
    'sourceIdentity','sourceEvidenceIdentity','sourceEvidenceVersion','sourceEvidenceSha256',
    'evidenceProducerId','evidenceVerifiedAt'
  ]::text[]);


  SELECT release.series_id INTO STRICT target_series_id
  FROM clinical.content_releases release WHERE release.id = p_release_id;
  SELECT * INTO STRICT series_row FROM clinical.content_series series WHERE series.id = target_series_id;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(series_row.content_type || pg_catalog.chr(31)
      || series_row.governed_content_key || pg_catalog.chr(31) || series_row.effective_scope_key,0)
  );
  PERFORM 1 FROM clinical.content_series series WHERE series.id = target_series_id FOR UPDATE;
  -- Rank 3: lock the series' candidate releases in stable order before using
  -- the requested workflow snapshot.
  PERFORM release.id FROM clinical.content_releases release
  WHERE release.series_id = target_series_id ORDER BY release.id FOR UPDATE;
  SELECT * INTO STRICT release_row FROM clinical.content_releases release
  WHERE release.id = p_release_id AND release.series_id = target_series_id;
  IF release_row.status <> 'draft' OR release_row.workflow_version <> p_expected_workflow_version THEN
    RAISE EXCEPTION 'release workflow version is stale or terminal' USING ERRCODE = '40001';
  END IF;
  signer_id := (signing->>'signerPersonId')::uuid;
  capacity_value := signing->>'capacity';
  decision_value := signing->>'decision';
  profession_value := CASE capacity_value WHEN 'physician' THEN 'doctor'
    WHEN 'pharmacist' THEN 'pharmacist' ELSE NULL END;
  IF signing->>'contractId' IS DISTINCT FROM 'SHIFAA-F011-VERIFIED-EVIDENCE-BINDING/1'
     OR signing->>'profile' IS DISTINCT FROM 'signing'
     OR signing->>'producerId' IS DISTINCT FROM 'f011.signing_port'
     OR signing->>'releaseId' IS DISTINCT FROM p_release_id::text
     OR (signing->>'artifactVersion')::integer IS DISTINCT FROM release_row.artifact_version
     OR signing->>'artifactDigest' IS DISTINCT FROM pg_catalog.encode(release_row.artifact_digest,'hex')
     OR signer_id IS DISTINCT FROM actor
     OR capacity_value NOT IN ('physician','pharmacist')
     OR decision_value NOT IN ('approved','rejected')
     OR signing->>'verifiedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$'
     OR (signing->>'verifiedAt')::timestamptz > platform.context_now()
     OR signing->>'bindingId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR signing->>'evidenceRef' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR NULLIF(signing->>'sourceIdentity','') IS NULL
     OR NULLIF(signing->>'sourceEvidenceIdentity','') IS NULL
     OR ((signing->'sourceEvidenceSha256' <> 'null'::jsonb)
         AND signing->>'sourceEvidenceSha256' !~ '^[0-9a-f]{64}$')
     OR ((signing->'sourceEvidenceSha256' <> 'null'::jsonb)
         AND signing->'sourceEvidenceVersion' = 'null'::jsonb)
     OR platform.context_role() IS DISTINCT FROM (CASE capacity_value
          WHEN 'physician' THEN 'CLN' ELSE 'PHA' END)
     OR actor = release_row.created_by_person_id
     OR EXISTS (
       SELECT 1 FROM audit.signature_evidence prior
       WHERE prior.resource_type = 'clinical.content_release'
         AND prior.resource_id = p_release_id
         AND (prior.signer_person_id = actor
           OR prior.signer_role = capacity_value)
     ) THEN
    RAISE EXCEPTION 'signing request does not bind an independent current artifact decision' USING ERRCODE = '42501';
  END IF;
  binding_id := (signing->>'bindingId')::uuid;
  creator_id := release_row.created_by_person_id;

  -- Use the locked artifact's series key to discover scoped rank-5 rows, then
  -- lock facilities, credentials, facility licenses, memberships, and evidence
  -- in the approved order. Global NULL-facility signing authority is valid.
  SELECT authority.facility_id INTO scoped_facility_id FROM clinical.content_governance_authorities authority
  WHERE authority.id = (authority_basis->>'id')::uuid;
  IF scoped_facility_id IS NOT NULL THEN
    PERFORM 1 FROM identity.facilities facility WHERE facility.id=scoped_facility_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'scoped authority facility is unavailable' USING ERRCODE = '42501'; END IF;
  END IF;
  SELECT * INTO STRICT credential_row FROM identity.professional_licenses credential
  WHERE credential.id = (credential_basis->>'id')::uuid FOR SHARE;
  IF credential_row.status <> 'verified' OR credential_row.profession <> profession_value
     OR credential_row.person_id <> actor
     OR credential_row.expires_on < (platform.context_now() AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'current verified professional credential required' USING ERRCODE = '42501';
  END IF;
  IF scoped_facility_id IS NOT NULL THEN
    PERFORM facility_license.id FROM identity.facility_licenses facility_license
    WHERE facility_license.facility_id=scoped_facility_id
    ORDER BY facility_license.id FOR SHARE;
    PERFORM membership.id FROM identity.facility_memberships membership
    WHERE membership.facility_id=scoped_facility_id AND membership.person_id=actor
      AND membership.employment_license_id=credential_row.id
      AND membership.role_code=credential_row.profession
    ORDER BY membership.id FOR SHARE;
  END IF;
  professional_evidence := credential_row.evidence_object_id;
  -- Finish rank-5 private parents before moving to rank-6 people.
  PERFORM evidence.id FROM identity.private_evidence_objects evidence
  WHERE evidence.id=professional_evidence
     OR (scoped_facility_id IS NOT NULL AND evidence.id IN (
       SELECT facility_license.evidence_object_id
       FROM identity.facility_licenses facility_license
       WHERE facility_license.facility_id=scoped_facility_id
         AND facility_license.evidence_object_id IS NOT NULL
     ))
  ORDER BY evidence.id FOR SHARE;
  IF credential_row.evidence_object_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM identity.private_evidence_objects evidence
    WHERE evidence.id=credential_row.evidence_object_id
      AND evidence.owner_person_id=actor AND evidence.bucket_code='professional-license-evidence'
      AND evidence.scan_status='released'
  ) THEN RAISE EXCEPTION 'credential evidence is unavailable' USING ERRCODE = '42501'; END IF;
  -- Rank 6 issuer/reviewer/actor identities precede rank 8 authority rows.
  PERFORM person.id FROM identity.people person
  WHERE person.id IN (
    actor, creator_id, credential_row.reviewed_by_person_id,
    (designation_basis->>'designatedBy')::uuid,
    (authority_basis->>'issuedBy')::uuid
  )
  ORDER BY person.id FOR SHARE;
  IF NOT EXISTS (SELECT 1 FROM identity.people person
    WHERE person.id = actor AND person.profile_status = 'active') THEN
    RAISE EXCEPTION 'active signer identity required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO STRICT authority_row FROM clinical.content_governance_authorities authority
  WHERE authority.id = (authority_basis->>'id')::uuid FOR SHARE;
  SELECT * INTO STRICT designation_row FROM clinical.content_reviewer_designations designation
  WHERE designation.id = (designation_basis->>'id')::uuid FOR SHARE;
  signing_time := pg_catalog.clock_timestamp();
  IF scoped_facility_id IS NOT NULL THEN
    SELECT facility_license.id,facility_license.evidence_object_id
    INTO facility_license_id,facility_license_evidence
    FROM identity.facility_licenses facility_license
    WHERE facility_license.facility_id=scoped_facility_id AND facility_license.status='verified'
      AND facility_license.expires_on >= (signing_time AT TIME ZONE 'UTC')::date
    ORDER BY facility_license.id LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'current facility license required' USING ERRCODE = '42501'; END IF;
    SELECT membership.id INTO membership_id FROM identity.facility_memberships membership
    WHERE membership.facility_id=scoped_facility_id AND membership.person_id=actor
      AND membership.employment_license_id=credential_row.id
      AND membership.role_code=credential_row.profession AND membership.membership_status='active'
      AND membership.valid_from<=signing_time
      AND (membership.valid_until IS NULL OR membership.valid_until>signing_time)
    ORDER BY membership.id LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'current facility membership required' USING ERRCODE = '42501'; END IF;
  END IF;
  IF credential_basis->>'id' IS DISTINCT FROM credential_row.id::text
     OR (credential_basis->>'version')::integer IS DISTINCT FROM credential_row.version
     OR credential_basis->>'personId' IS DISTINCT FROM credential_row.person_id::text
     OR credential_basis->>'profession' IS DISTINCT FROM credential_row.profession
     OR credential_basis->>'status' IS DISTINCT FROM credential_row.status
     OR credential_basis->>'expiresOn' IS DISTINCT FROM credential_row.expires_on::text
     OR credential_basis->>'issuer' IS DISTINCT FROM credential_row.issuer
     OR (credential_basis->>'evidenceObjectId') IS DISTINCT FROM credential_row.evidence_object_id::text
     OR (credential_basis->>'reviewedByPersonId') IS DISTINCT FROM credential_row.reviewed_by_person_id::text
     OR (credential_basis->>'reviewedAt') IS DISTINCT FROM (CASE WHEN credential_row.reviewed_at IS NULL THEN NULL
       ELSE pg_catalog.to_char(credential_row.reviewed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END)
     OR designation_basis->>'id' IS DISTINCT FROM designation_row.id::text
     OR (designation_basis->>'version')::integer IS DISTINCT FROM designation_row.version
     OR designation_basis->>'personId' IS DISTINCT FROM designation_row.person_id::text
     OR designation_basis->>'professionalLicenseId' IS DISTINCT FROM designation_row.professional_license_id::text
     OR designation_basis->>'capacity' IS DISTINCT FROM designation_row.reviewer_capacity
     OR designation_basis->>'evidenceRef' IS DISTINCT FROM designation_row.evidence_ref::text
     OR designation_basis->>'designatedBy' IS DISTINCT FROM designation_row.designated_by::text
     OR designation_basis->>'status' IS DISTINCT FROM designation_row.status
     OR designation_basis->>'validFrom' IS DISTINCT FROM pg_catalog.to_char(designation_row.valid_from AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
     OR designation_basis->>'validUntil' IS DISTINCT FROM (CASE WHEN designation_row.valid_until IS NULL THEN NULL
       ELSE pg_catalog.to_char(designation_row.valid_until AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END)
     OR designation_basis->>'sourceIdentity' IS DISTINCT FROM designation_row.source_identity
     OR designation_basis->>'sourceEvidenceIdentity' IS DISTINCT FROM designation_row.source_evidence_identity
     OR (designation_basis->>'sourceEvidenceVersion') IS DISTINCT FROM designation_row.source_evidence_version
     OR (designation_basis->>'sourceEvidenceSha256') IS DISTINCT FROM (CASE WHEN designation_row.source_evidence_sha256 IS NULL THEN NULL
       ELSE pg_catalog.encode(designation_row.source_evidence_sha256,'hex') END)
     OR designation_basis->>'evidenceProducerId' IS DISTINCT FROM designation_row.evidence_producer_id
     OR designation_basis->>'evidenceVerifiedAt' IS DISTINCT FROM pg_catalog.to_char(designation_row.evidence_verified_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
     OR authority_basis->>'id' IS DISTINCT FROM authority_row.id::text
     OR (authority_basis->>'version')::integer IS DISTINCT FROM authority_row.version
     OR authority_basis->>'personId' IS DISTINCT FROM authority_row.person_id::text
     OR authority_basis->>'action' IS DISTINCT FROM authority_row.action
     OR authority_basis->>'capacity' IS DISTINCT FROM authority_row.capacity
     OR authority_basis->>'contentType' IS DISTINCT FROM authority_row.content_type
     OR authority_basis->>'governedContentKey' IS DISTINCT FROM authority_row.governed_content_key
     OR authority_basis->>'effectiveScopeKey' IS DISTINCT FROM authority_row.effective_scope_key
     OR (authority_basis->>'facilityId') IS DISTINCT FROM authority_row.facility_id::text
     OR authority_basis->>'issuedBy' IS DISTINCT FROM authority_row.issued_by::text
     OR authority_basis->>'evidenceRef' IS DISTINCT FROM authority_row.evidence_ref::text
     OR authority_basis->>'status' IS DISTINCT FROM authority_row.status
     OR authority_basis->>'validFrom' IS DISTINCT FROM pg_catalog.to_char(authority_row.valid_from AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
     OR authority_basis->>'validUntil' IS DISTINCT FROM (CASE WHEN authority_row.valid_until IS NULL THEN NULL
       ELSE pg_catalog.to_char(authority_row.valid_until AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END)
     OR authority_basis->>'sourceIdentity' IS DISTINCT FROM authority_row.source_identity
     OR authority_basis->>'sourceEvidenceIdentity' IS DISTINCT FROM authority_row.source_evidence_identity
     OR (authority_basis->>'sourceEvidenceVersion') IS DISTINCT FROM authority_row.source_evidence_version
     OR (authority_basis->>'sourceEvidenceSha256') IS DISTINCT FROM (CASE WHEN authority_row.source_evidence_sha256 IS NULL THEN NULL
       ELSE pg_catalog.encode(authority_row.source_evidence_sha256,'hex') END)
     OR authority_basis->>'evidenceProducerId' IS DISTINCT FROM authority_row.evidence_producer_id
     OR authority_basis->>'evidenceVerifiedAt' IS DISTINCT FROM pg_catalog.to_char(authority_row.evidence_verified_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
     OR designation_row.person_id <> actor OR designation_row.professional_license_id <> credential_row.id
     OR designation_row.reviewer_capacity <> capacity_value OR designation_row.status <> 'active'
     OR designation_row.valid_from > signing_time
     OR (designation_row.valid_until IS NOT NULL AND designation_row.valid_until <= signing_time)
     OR designation_row.evidence_producer_id <> 'f011.governance_provisioner'
     OR designation_row.evidence_verified_at > signing_time
     OR authority_row.person_id <> actor OR authority_row.action <> 'signClinicalContentRelease'
     OR authority_row.capacity <> capacity_value
     OR authority_row.content_type <> series_row.content_type
     OR authority_row.governed_content_key <> series_row.governed_content_key
     OR authority_row.effective_scope_key <> series_row.effective_scope_key
     OR authority_row.status <> 'active' OR authority_row.valid_from > signing_time
     OR (authority_row.valid_until IS NOT NULL AND authority_row.valid_until <= signing_time)
     OR authority_row.evidence_producer_id <> 'f011.governance_provisioner'
     OR authority_row.evidence_verified_at > signing_time
     OR credential_row.status <> 'verified'
     OR credential_row.person_id <> actor
     OR credential_row.profession <> profession_value
     OR credential_row.expires_on < (signing_time AT TIME ZONE 'UTC')::date
     OR (scoped_facility_id IS NOT NULL AND (
       scoped_facility_id IS DISTINCT FROM native_facility_id
       OR NOT EXISTS (SELECT 1 FROM identity.facilities facility
         WHERE facility.id=scoped_facility_id AND facility.facility_status='active')
       OR NOT EXISTS (SELECT 1 FROM identity.facility_licenses license
         WHERE license.id=facility_license_id AND license.facility_id=scoped_facility_id
           AND license.status='verified'
           AND license.expires_on >= (signing_time AT TIME ZONE 'UTC')::date)
       OR NOT EXISTS (SELECT 1 FROM identity.facility_memberships membership
         WHERE membership.id=membership_id AND membership.facility_id=scoped_facility_id
           AND membership.person_id=actor AND membership.employment_license_id=credential_row.id
           AND membership.role_code=credential_row.profession AND membership.membership_status='active'
           AND membership.valid_from<=signing_time
           AND (membership.valid_until IS NULL OR membership.valid_until>signing_time))
     ))
     OR actor IN (credential_row.reviewed_by_person_id,designation_row.designated_by,authority_row.issued_by)
     OR (scoped_facility_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM identity.private_evidence_objects evidence
       WHERE evidence.id=facility_license_evidence AND evidence.scan_status='released'
         AND evidence.bucket_code='facility-license-evidence'
         AND evidence.facility_id=scoped_facility_id
     )) THEN
    RAISE EXCEPTION 'signer basis differs from exact current credential/designation/authority' USING ERRCODE = '42501';
  END IF;

  source_hash := NULL;
  IF signing->'sourceEvidenceSha256' <> 'null'::jsonb THEN
    source_hash := pg_catalog.decode(signing->>'sourceEvidenceSha256','hex');
  END IF;
  designation_hash := designation_row.source_evidence_sha256;
  authority_hash := authority_row.source_evidence_sha256;
  result := clinical.f011_record_mutation_effect_v1(
    idem_id,actor,'signClinicalContentRelease','clinical.content_release',p_release_id,
    release_row.workflow_version + 1,200::smallint,p_input->>'responseLanguage',
    (p_input->>'responseRequestId')::uuid
  );
  event_id := (result->>'auditEventId')::uuid;
  event_time := (result->>'auditEventOccurredAt')::timestamptz;
  UPDATE clinical.content_releases
  SET workflow_version = workflow_version + 1
  WHERE id = p_release_id AND workflow_version = release_row.workflow_version
    AND status = 'draft';
  IF NOT FOUND THEN RAISE EXCEPTION 'release workflow compare-and-swap failed' USING ERRCODE = '40001'; END IF;
  INSERT INTO audit.signature_evidence(
    resource_type,resource_id,resource_version,signer_person_id,signer_role,decision,
    artifact_digest,signed_at,audit_event_id,audit_event_occurred_at
  ) VALUES (
    'clinical.content_release',p_release_id,release_row.artifact_version,actor,capacity_value,
    decision_value,release_row.artifact_digest,signing_time,event_id,event_time
  ) RETURNING id INTO signature_id;
  INSERT INTO clinical.content_signature_bindings(
    signature_evidence_id,binding_id,binding_contract_id,evidence_ref,producer_id,verified_at,
    source_identity,source_evidence_identity,source_evidence_version,source_evidence_sha256,
    credential_id,credential_version,credential_profession,credential_status,credential_expires_on,
    credential_issuer,credential_evidence_object_id,credential_reviewed_by,credential_reviewed_at,
    designation_id,designation_version,designation_evidence_ref,designation_by,designation_status,
    designation_valid_from,designation_valid_until,designation_source_identity,
    designation_source_evidence_identity,designation_source_evidence_version,
    designation_source_evidence_sha256,designation_evidence_producer_id,designation_evidence_verified_at,
    signing_authority_id,signing_authority_version,authority_action,authority_content_type,
    authority_governed_content_key,authority_effective_scope_key,authority_facility_id,authority_issued_by,
    authority_evidence_ref,authority_status,authority_valid_from,authority_valid_until,
    authority_source_identity,authority_source_evidence_identity,authority_source_evidence_version,
    authority_source_evidence_sha256,authority_evidence_producer_id,authority_evidence_verified_at
  ) VALUES (
    signature_id,binding_id,'SHIFAA-F011-VERIFIED-EVIDENCE-BINDING/1',(signing->>'evidenceRef')::uuid,
    'f011.signing_port',(signing->>'verifiedAt')::timestamptz,
    signing->>'sourceIdentity',signing->>'sourceEvidenceIdentity',
    NULLIF(signing->>'sourceEvidenceVersion',''),source_hash,
    credential_row.id,credential_row.version,credential_row.profession,credential_row.status,
    credential_row.expires_on,credential_row.issuer,credential_row.evidence_object_id,
    credential_row.reviewed_by_person_id,credential_row.reviewed_at,
    designation_row.id,designation_row.version,designation_row.evidence_ref,designation_row.designated_by,
    designation_row.status,designation_row.valid_from,designation_row.valid_until,
    designation_row.source_identity,designation_row.source_evidence_identity,
    designation_row.source_evidence_version,designation_hash,designation_row.evidence_producer_id,
    designation_row.evidence_verified_at,
    authority_row.id,authority_row.version,authority_row.action,authority_row.content_type,
    authority_row.governed_content_key,authority_row.effective_scope_key,authority_row.facility_id,
    authority_row.issued_by,authority_row.evidence_ref,authority_row.status,
    authority_row.valid_from,authority_row.valid_until,authority_row.source_identity,
    authority_row.source_evidence_identity,authority_row.source_evidence_version,
    authority_hash,authority_row.evidence_producer_id,authority_row.evidence_verified_at
  );
  -- Private producer metadata uses the persisted signature identity and the
  -- same locked basis. The application serializes the existing generated DTO.
  RETURN result || pg_catalog.jsonb_build_object('response',pg_catalog.jsonb_build_object(
    'releaseId',p_release_id,'workflowVersion',release_row.workflow_version + 1,
    'signature',pg_catalog.jsonb_build_object(
      'signatureId',signature_id,'capacity',capacity_value,'decision',decision_value,
      'artifactVersion',release_row.artifact_version,
      'artifactDigest',pg_catalog.encode(release_row.artifact_digest,'hex'),
      'signerPersonId',actor,'signedAt',signing_time,'evidenceRef',signing->>'evidenceRef'
    )));
END
$function$;
