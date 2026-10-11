-- Feature 011 K06: current admission/signature eligibility and bounded reads.

CREATE FUNCTION clinical.f011_release_current_eligibility_v1(p_release_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  authorization_instant timestamptz := pg_catalog.clock_timestamp();
BEGIN
  -- Multiple currently eligible exact bindings are ambiguous, not approval.
  RETURN (
    SELECT pg_catalog.count(*)
    FROM clinical.content_releases release
    JOIN clinical.content_series series ON series.id = release.series_id
    JOIN clinical.content_artifact_admissibility_bindings admitted
      ON admitted.release_id = release.id
     AND admitted.artifact_version = release.artifact_version
     AND admitted.artifact_digest = release.artifact_digest
    JOIN clinical.content_admissibility_evidence approval
      ON approval.id = admitted.approval_id
     AND approval.release_id = release.id
     AND approval.artifact_version = release.artifact_version
     AND approval.artifact_digest = release.artifact_digest
    WHERE release.id = p_release_id
      AND approval.status = 'active'
      AND approval.valid_from <= authorization_instant
      AND (approval.valid_until IS NULL OR approval.valid_until > authorization_instant)
      AND approval.content_type = series.content_type
      AND approval.governed_content_key = series.governed_content_key
      AND approval.effective_scope_key = series.effective_scope_key
      AND approval.synthetic = release.synthetic
      AND admitted.binding_contract_id = 'SHIFAA-F011-VERIFIED-EVIDENCE-BINDING/1'
      AND admitted.producer_id = 'f011.governance_provisioner'
      AND admitted.verified_at <= authorization_instant
      AND admitted.approval_version = approval.version
      AND admitted.content_type = approval.content_type
      AND admitted.governed_content_key = approval.governed_content_key
      AND admitted.effective_scope_key = approval.effective_scope_key
      AND admitted.policy_ref = approval.policy_ref
      AND admitted.policy_version = approval.policy_version
      AND admitted.policy_sha256 = approval.policy_sha256
      AND admitted.source_admission_ref = approval.source_admission_ref
      AND admitted.category_admission_ref = approval.category_admission_ref
      AND admitted.code_admission_ref = approval.code_admission_ref
      AND admitted.test_vector_admission_ref = approval.test_vector_admission_ref
      AND admitted.source_identity = approval.source_identity
      AND admitted.source_evidence_identity = approval.source_evidence_identity
      AND admitted.source_evidence_version IS NOT DISTINCT FROM approval.source_evidence_version
      AND admitted.source_evidence_sha256 IS NOT DISTINCT FROM approval.source_evidence_sha256
      AND admitted.synthetic = approval.synthetic
      AND admitted.approval_status = approval.status
      AND admitted.approval_valid_from = approval.valid_from
      AND admitted.approval_valid_until IS NOT DISTINCT FROM approval.valid_until
      AND (
        SELECT pg_catalog.count(*)
        FROM audit.signature_evidence signature
        JOIN clinical.content_signature_bindings binding
          ON binding.signature_evidence_id = signature.id
        WHERE signature.resource_type = 'clinical.content_release'
          AND signature.resource_id = release.id
          AND signature.resource_version = release.artifact_version
          AND signature.artifact_digest = release.artifact_digest
          AND signature.decision = 'approved'
      ) = 2
      AND (
        SELECT pg_catalog.count(DISTINCT signature.signer_person_id)
        FROM audit.signature_evidence signature
        JOIN clinical.content_signature_bindings binding
          ON binding.signature_evidence_id = signature.id
        WHERE signature.resource_type = 'clinical.content_release'
          AND signature.resource_id = release.id
          AND signature.resource_version = release.artifact_version
          AND signature.artifact_digest = release.artifact_digest
          AND signature.decision = 'approved'
      ) = 2
      AND (
        SELECT pg_catalog.count(*) FILTER (WHERE signature.signer_role = 'physician')
        FROM audit.signature_evidence signature
        JOIN clinical.content_signature_bindings binding
          ON binding.signature_evidence_id = signature.id
        WHERE signature.resource_type = 'clinical.content_release'
          AND signature.resource_id = release.id
          AND signature.resource_version = release.artifact_version
          AND signature.artifact_digest = release.artifact_digest
          AND signature.decision = 'approved'
      ) = 1
      AND (
        SELECT pg_catalog.count(*) FILTER (WHERE signature.signer_role = 'pharmacist')
        FROM audit.signature_evidence signature
        JOIN clinical.content_signature_bindings binding
          ON binding.signature_evidence_id = signature.id
        WHERE signature.resource_type = 'clinical.content_release'
          AND signature.resource_id = release.id
          AND signature.resource_version = release.artifact_version
          AND signature.artifact_digest = release.artifact_digest
          AND signature.decision = 'approved'
      ) = 1
      AND NOT EXISTS (
        SELECT 1
        FROM audit.signature_evidence signature
        JOIN clinical.content_signature_bindings binding
          ON binding.signature_evidence_id = signature.id
        JOIN identity.professional_licenses credential ON credential.id = binding.credential_id
        JOIN clinical.content_reviewer_designations designation ON designation.id = binding.designation_id
        JOIN clinical.content_governance_authorities authority ON authority.id = binding.signing_authority_id
        LEFT JOIN identity.private_evidence_objects evidence
          ON evidence.id = credential.evidence_object_id
        WHERE signature.resource_type = 'clinical.content_release'
          AND signature.resource_id = release.id
          AND signature.resource_version = release.artifact_version
          AND signature.artifact_digest = release.artifact_digest
          AND signature.decision = 'approved'
          AND (
            signature.signer_person_id <> credential.person_id
            OR credential.version <> binding.credential_version
            OR credential.profession <> binding.credential_profession
            OR credential.status <> 'verified'
            OR credential.status <> binding.credential_status
            OR credential.expires_on < (authorization_instant AT TIME ZONE 'UTC')::date
            OR credential.expires_on <> binding.credential_expires_on
            OR credential.issuer <> binding.credential_issuer
            OR credential.evidence_object_id IS DISTINCT FROM binding.credential_evidence_object_id
            OR credential.reviewed_by_person_id IS DISTINCT FROM binding.credential_reviewed_by
            OR credential.reviewed_at IS DISTINCT FROM binding.credential_reviewed_at
            OR (evidence.id IS NOT NULL AND (
              evidence.scan_status <> 'released'
              OR evidence.bucket_code <> 'professional-license-evidence'
              OR evidence.owner_person_id <> signature.signer_person_id))
            OR designation.person_id <> signature.signer_person_id
            OR designation.professional_license_id <> credential.id
            OR designation.reviewer_capacity <> signature.signer_role
            OR designation.version <> binding.designation_version
            OR designation.evidence_ref <> binding.designation_evidence_ref
            OR designation.designated_by <> binding.designation_by
            OR designation.status <> 'active'
            OR designation.status <> binding.designation_status
            OR designation.valid_from <> binding.designation_valid_from
            OR designation.valid_until IS DISTINCT FROM binding.designation_valid_until
            OR designation.valid_from > authorization_instant
            OR (designation.valid_until IS NOT NULL AND designation.valid_until <= authorization_instant)
            OR designation.source_identity <> binding.designation_source_identity
            OR designation.source_evidence_identity <> binding.designation_source_evidence_identity
            OR designation.source_evidence_version IS DISTINCT FROM binding.designation_source_evidence_version
            OR designation.source_evidence_sha256 IS DISTINCT FROM binding.designation_source_evidence_sha256
            OR designation.evidence_producer_id <> binding.designation_evidence_producer_id
            OR designation.evidence_verified_at <> binding.designation_evidence_verified_at
            OR designation.evidence_producer_id <> 'f011.governance_provisioner'
            OR designation.evidence_verified_at > authorization_instant
            OR authority.person_id <> signature.signer_person_id
            OR authority.action <> 'signClinicalContentRelease'
            OR authority.capacity <> signature.signer_role
            OR authority.content_type <> series.content_type
            OR authority.governed_content_key <> series.governed_content_key
            OR authority.effective_scope_key <> series.effective_scope_key
            OR authority.version <> binding.signing_authority_version
            OR authority.action <> binding.authority_action
            OR authority.content_type <> binding.authority_content_type
            OR authority.governed_content_key <> binding.authority_governed_content_key
            OR authority.effective_scope_key <> binding.authority_effective_scope_key
            OR authority.facility_id IS DISTINCT FROM binding.authority_facility_id
            OR authority.issued_by <> binding.authority_issued_by
            OR authority.evidence_ref <> binding.authority_evidence_ref
            OR authority.status <> 'active'
            OR authority.status <> binding.authority_status
            OR authority.valid_from <> binding.authority_valid_from
            OR authority.valid_until IS DISTINCT FROM binding.authority_valid_until
            OR authority.valid_from > authorization_instant
            OR (authority.valid_until IS NOT NULL AND authority.valid_until <= authorization_instant)
            OR authority.source_identity <> binding.authority_source_identity
            OR authority.source_evidence_identity <> binding.authority_source_evidence_identity
            OR authority.source_evidence_version IS DISTINCT FROM binding.authority_source_evidence_version
            OR authority.source_evidence_sha256 IS DISTINCT FROM binding.authority_source_evidence_sha256
            OR authority.evidence_producer_id <> binding.authority_evidence_producer_id
            OR authority.evidence_verified_at <> binding.authority_evidence_verified_at
            OR authority.evidence_producer_id <> 'f011.governance_provisioner'
            OR authority.evidence_verified_at > authorization_instant
          )
      )
  ) = 1;
END
$function$;

CREATE FUNCTION clinical.f011_lock_clinic_content_scope_v1(p_facility_id uuid, p_actor_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  license_id uuid;
  professional_evidence uuid;
  facility_evidence uuid;
BEGIN
  IF p_facility_id IS NULL OR p_actor_id IS NULL THEN RETURN false; END IF;
  PERFORM 1 FROM identity.facilities facility
  WHERE facility.id = p_facility_id AND facility.facility_status = 'active'
  FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT membership.employment_license_id INTO license_id
  FROM identity.facility_memberships membership
  WHERE membership.facility_id = p_facility_id AND membership.person_id = p_actor_id
    AND membership.role_code IN ('doctor','pharmacist') AND membership.membership_status = 'active'
    AND membership.valid_from <= platform.context_now()
    AND (membership.valid_until IS NULL OR membership.valid_until > platform.context_now())
  ORDER BY membership.id LIMIT 1;
  IF license_id IS NULL THEN RETURN false; END IF;
  SELECT credential.evidence_object_id INTO professional_evidence
  FROM identity.professional_licenses credential
  WHERE credential.id = license_id AND credential.person_id = p_actor_id
    AND credential.profession IN ('doctor','pharmacist') AND credential.status = 'verified'
    AND credential.expires_on >= (platform.context_now() AT TIME ZONE 'UTC')::date
  FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT facility_license.evidence_object_id INTO facility_evidence
  FROM identity.facility_licenses facility_license
  WHERE facility_license.facility_id = p_facility_id AND facility_license.status = 'verified'
    AND facility_license.expires_on >= (platform.context_now() AT TIME ZONE 'UTC')::date
  ORDER BY facility_license.id LIMIT 1 FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM identity.facility_memberships membership
  WHERE membership.facility_id = p_facility_id AND membership.person_id = p_actor_id
    AND membership.employment_license_id = license_id
    AND membership.role_code IN ('doctor','pharmacist') AND membership.membership_status = 'active'
    AND membership.valid_from <= platform.context_now()
    AND (membership.valid_until IS NULL OR membership.valid_until > platform.context_now())
  ORDER BY membership.id LIMIT 1 FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM evidence.id FROM identity.private_evidence_objects evidence
  WHERE evidence.id=facility_evidence
     OR (professional_evidence IS NOT NULL AND evidence.id=professional_evidence)
  ORDER BY evidence.id FOR SHARE;
  IF NOT EXISTS (SELECT 1 FROM identity.private_evidence_objects evidence
      WHERE evidence.id=facility_evidence AND evidence.scan_status='released'
        AND evidence.bucket_code='facility-license-evidence' AND evidence.facility_id=p_facility_id)
     OR (professional_evidence IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM identity.private_evidence_objects evidence
       WHERE evidence.id=professional_evidence AND evidence.scan_status='released'
         AND evidence.bucket_code='professional-license-evidence'
         AND evidence.owner_person_id=p_actor_id
     )) THEN
    RETURN false;
  END IF;
  RETURN true;
END
$function$;

CREATE FUNCTION clinical.f011_lock_publication_current_basis_v1(
  p_release_id uuid,p_series_id uuid,p_artifact_version integer,p_artifact_digest bytea,
  p_publisher_id uuid,p_creator_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  authorization_now timestamptz;
  current_day date;
BEGIN
  IF p_release_id IS NULL OR p_series_id IS NULL OR p_artifact_version IS NULL
     OR p_artifact_version < 1 OR pg_catalog.octet_length(p_artifact_digest) <> 32
     OR p_publisher_id IS NULL OR p_creator_id IS NULL THEN
    RETURN false;
  END IF;

  -- Rank 5: facility, professional license, facility license, membership,
  -- reviewer grant/revocation, then all credential-evidence parents.
  PERFORM facility.id FROM identity.facilities facility
  WHERE facility.id IN (
    SELECT DISTINCT binding.authority_facility_id
    FROM audit.signature_evidence signature
    JOIN clinical.content_signature_bindings binding
      ON binding.signature_evidence_id=signature.id
    WHERE signature.resource_type='clinical.content_release'
      AND signature.resource_id=p_release_id
      AND signature.resource_version=p_artifact_version
      AND signature.artifact_digest=p_artifact_digest
      AND signature.decision='approved'
      AND binding.authority_facility_id IS NOT NULL
  )
  ORDER BY facility.id FOR SHARE;
  IF EXISTS (
    SELECT 1 FROM audit.signature_evidence signature
    JOIN clinical.content_signature_bindings binding
      ON binding.signature_evidence_id=signature.id
    LEFT JOIN identity.facilities facility ON facility.id=binding.authority_facility_id
    WHERE signature.resource_type='clinical.content_release'
      AND signature.resource_id=p_release_id AND signature.resource_version=p_artifact_version
      AND signature.artifact_digest=p_artifact_digest AND signature.decision='approved'
      AND binding.authority_facility_id IS NOT NULL
      AND facility.facility_status IS DISTINCT FROM 'active'
  ) THEN RETURN false; END IF;

  PERFORM credential.id FROM identity.professional_licenses credential
  WHERE credential.id IN (
    SELECT DISTINCT binding.credential_id
    FROM audit.signature_evidence signature
    JOIN clinical.content_signature_bindings binding
      ON binding.signature_evidence_id=signature.id
    WHERE signature.resource_type='clinical.content_release'
      AND signature.resource_id=p_release_id
      AND signature.resource_version=p_artifact_version
      AND signature.artifact_digest=p_artifact_digest
      AND signature.decision='approved'
  )
  ORDER BY credential.id FOR SHARE;

  -- Lock every license row for the immutable scoped-facility set before
  -- selecting which one is current after all authorization locks complete.
  PERFORM facility_license.id
  FROM identity.facility_licenses facility_license
  WHERE facility_license.facility_id IN (
    SELECT DISTINCT binding.authority_facility_id
    FROM audit.signature_evidence signature
    JOIN clinical.content_signature_bindings binding
      ON binding.signature_evidence_id=signature.id
    WHERE signature.resource_type='clinical.content_release'
      AND signature.resource_id=p_release_id
      AND signature.resource_version=p_artifact_version
      AND signature.artifact_digest=p_artifact_digest
      AND signature.decision='approved'
      AND binding.authority_facility_id IS NOT NULL
  )
  ORDER BY facility_license.id FOR SHARE;

  PERFORM membership.id FROM identity.facility_memberships membership
  WHERE membership.id IN (
    SELECT candidate.id
    FROM identity.facility_memberships candidate
    JOIN audit.signature_evidence signature
      ON signature.signer_person_id=candidate.person_id
    JOIN clinical.content_signature_bindings binding
      ON binding.signature_evidence_id=signature.id
     AND binding.credential_id=candidate.employment_license_id
     AND binding.authority_facility_id=candidate.facility_id
    WHERE signature.resource_type='clinical.content_release'
      AND signature.resource_id=p_release_id
      AND signature.resource_version=p_artifact_version
      AND signature.artifact_digest=p_artifact_digest
      AND signature.decision='approved'
      AND binding.authority_facility_id IS NOT NULL
      AND candidate.role_code=CASE binding.credential_profession
        WHEN 'doctor' THEN 'doctor' WHEN 'pharmacist' THEN 'pharmacist' ELSE '' END
  )
  ORDER BY membership.id FOR SHARE;

  PERFORM clinical.f011_lock_medical_reviewer_v1(p_publisher_id);

  PERFORM evidence.id FROM identity.private_evidence_objects evidence
  WHERE evidence.id IN (
    SELECT credential.evidence_object_id
    FROM identity.professional_licenses credential
    WHERE credential.id IN (
      SELECT DISTINCT binding.credential_id
      FROM audit.signature_evidence signature
      JOIN clinical.content_signature_bindings binding
        ON binding.signature_evidence_id=signature.id
      WHERE signature.resource_type='clinical.content_release'
        AND signature.resource_id=p_release_id
        AND signature.resource_version=p_artifact_version
        AND signature.artifact_digest=p_artifact_digest
        AND signature.decision='approved'
    ) AND credential.evidence_object_id IS NOT NULL
    UNION
    SELECT facility_license.evidence_object_id
    FROM identity.facility_licenses facility_license
    WHERE facility_license.facility_id IN (
      SELECT DISTINCT binding.authority_facility_id
      FROM audit.signature_evidence signature
      JOIN clinical.content_signature_bindings binding
        ON binding.signature_evidence_id=signature.id
      WHERE signature.resource_type='clinical.content_release'
        AND signature.resource_id=p_release_id
        AND signature.resource_version=p_artifact_version
        AND signature.artifact_digest=p_artifact_digest
        AND signature.decision='approved'
        AND binding.authority_facility_id IS NOT NULL
    )
  )
  ORDER BY evidence.id FOR SHARE;
  IF EXISTS (
    SELECT 1 FROM identity.professional_licenses credential
    JOIN audit.signature_evidence signature ON signature.signer_person_id=credential.person_id
    JOIN clinical.content_signature_bindings binding
      ON binding.signature_evidence_id=signature.id AND binding.credential_id=credential.id
    LEFT JOIN identity.private_evidence_objects evidence
      ON evidence.id=credential.evidence_object_id
    WHERE signature.resource_type='clinical.content_release'
      AND signature.resource_id=p_release_id AND signature.resource_version=p_artifact_version
      AND signature.artifact_digest=p_artifact_digest AND signature.decision='approved'
      AND credential.evidence_object_id IS NOT NULL
      AND (evidence.id IS NULL OR evidence.scan_status<>'released'
        OR evidence.bucket_code<>'professional-license-evidence'
        OR evidence.owner_person_id<>signature.signer_person_id)
  ) THEN RETURN false; END IF;

  -- Rank 6: every signer, creator/publisher, credential reviewer,
  -- designation signer and authority issuer is locked before rank 8 facts.
  PERFORM person.id FROM identity.people person
  WHERE person.id IN (
    SELECT signature.signer_person_id
    FROM audit.signature_evidence signature
    WHERE signature.resource_type='clinical.content_release'
      AND signature.resource_id=p_release_id AND signature.resource_version=p_artifact_version
      AND signature.artifact_digest=p_artifact_digest AND signature.decision='approved'
    UNION SELECT p_publisher_id
    UNION SELECT p_creator_id
    UNION
    SELECT credential.reviewed_by_person_id
    FROM identity.professional_licenses credential
    WHERE credential.id IN (
      SELECT DISTINCT binding.credential_id
      FROM audit.signature_evidence signature
      JOIN clinical.content_signature_bindings binding ON binding.signature_evidence_id=signature.id
      WHERE signature.resource_type='clinical.content_release'
        AND signature.resource_id=p_release_id AND signature.resource_version=p_artifact_version
        AND signature.artifact_digest=p_artifact_digest AND signature.decision='approved'
    ) AND credential.reviewed_by_person_id IS NOT NULL
    UNION
    SELECT binding.designation_by FROM audit.signature_evidence signature
    JOIN clinical.content_signature_bindings binding ON binding.signature_evidence_id=signature.id
    WHERE signature.resource_type='clinical.content_release'
      AND signature.resource_id=p_release_id AND signature.resource_version=p_artifact_version
      AND signature.artifact_digest=p_artifact_digest AND signature.decision='approved'
    UNION
    SELECT binding.authority_issued_by FROM audit.signature_evidence signature
    JOIN clinical.content_signature_bindings binding ON binding.signature_evidence_id=signature.id
    WHERE signature.resource_type='clinical.content_release'
      AND signature.resource_id=p_release_id AND signature.resource_version=p_artifact_version
      AND signature.artifact_digest=p_artifact_digest AND signature.decision='approved'
    UNION
    SELECT license.reviewed_by_person_id FROM identity.facility_licenses license
    WHERE license.facility_id IN (
      SELECT DISTINCT binding.authority_facility_id
      FROM audit.signature_evidence signature
      JOIN clinical.content_signature_bindings binding ON binding.signature_evidence_id=signature.id
      WHERE signature.resource_type='clinical.content_release'
        AND signature.resource_id=p_release_id AND signature.resource_version=p_artifact_version
        AND signature.artifact_digest=p_artifact_digest AND signature.decision='approved'
        AND binding.authority_facility_id IS NOT NULL
    ) AND license.reviewed_by_person_id IS NOT NULL
  )
  ORDER BY person.id FOR SHARE;
  IF EXISTS (
    SELECT 1 FROM identity.people person
    WHERE person.id=p_publisher_id AND person.profile_status<>'active'
  ) OR EXISTS (
    SELECT 1 FROM audit.signature_evidence signature
    JOIN identity.people person ON person.id=signature.signer_person_id
    WHERE signature.resource_type='clinical.content_release'
      AND signature.resource_id=p_release_id AND signature.resource_version=p_artifact_version
      AND signature.artifact_digest=p_artifact_digest AND signature.decision='approved'
      AND person.profile_status<>'active'
  ) THEN RETURN false; END IF;
  PERFORM consent_row.id FROM consent.records consent_row
  WHERE consent_row.person_id=p_publisher_id
    AND consent_row.purpose_code=ANY(platform.context_purposes())
  ORDER BY consent_row.person_id,consent_row.purpose_code,consent_row.occurred_at,consent_row.id
  FOR SHARE;

  -- Rank 8: current authorities, designations, exact admission snapshot, and
  -- matching approval are locked before the authoritative predicate is rerun.
  PERFORM authority.id FROM clinical.content_governance_authorities authority
  WHERE authority.id IN (
    SELECT DISTINCT binding.signing_authority_id
    FROM audit.signature_evidence signature
    JOIN clinical.content_signature_bindings binding ON binding.signature_evidence_id=signature.id
    WHERE signature.resource_type='clinical.content_release'
      AND signature.resource_id=p_release_id AND signature.resource_version=p_artifact_version
      AND signature.artifact_digest=p_artifact_digest AND signature.decision='approved'
  ) ORDER BY authority.id FOR SHARE;
  PERFORM designation.id FROM clinical.content_reviewer_designations designation
  WHERE designation.id IN (
    SELECT DISTINCT binding.designation_id
    FROM audit.signature_evidence signature
    JOIN clinical.content_signature_bindings binding ON binding.signature_evidence_id=signature.id
    WHERE signature.resource_type='clinical.content_release'
      AND signature.resource_id=p_release_id AND signature.resource_version=p_artifact_version
      AND signature.artifact_digest=p_artifact_digest AND signature.decision='approved'
  ) ORDER BY designation.id FOR SHARE;
  PERFORM admitted.binding_id FROM clinical.content_artifact_admissibility_bindings admitted
  WHERE admitted.release_id=p_release_id AND admitted.artifact_version=p_artifact_version
    AND admitted.artifact_digest=p_artifact_digest
  ORDER BY admitted.binding_id FOR SHARE;
  PERFORM approval.id FROM clinical.content_admissibility_evidence approval
  WHERE approval.id IN (
    SELECT DISTINCT admitted.approval_id
    FROM clinical.content_artifact_admissibility_bindings admitted
    WHERE admitted.release_id=p_release_id AND admitted.artifact_version=p_artifact_version
      AND admitted.artifact_digest=p_artifact_digest
  ) ORDER BY approval.id FOR SHARE;

  authorization_now := pg_catalog.clock_timestamp();
  current_day := (authorization_now AT TIME ZONE 'UTC')::date;
  IF NOT EXISTS (
       SELECT 1 FROM identity.admin_role_grants grant_row
       WHERE grant_row.person_id=p_publisher_id AND grant_row.role_code='medical_reviewer'
         AND grant_row.status='active' AND grant_row.valid_from<=authorization_now
         AND (grant_row.valid_until IS NULL OR grant_row.valid_until>authorization_now)
         AND NOT EXISTS (
           SELECT 1 FROM identity.admin_role_revocation_requests revocation
           WHERE revocation.grant_id=grant_row.id AND revocation.status='approved'
         )
     ) OR EXISTS (
    SELECT 1 FROM audit.signature_evidence signature
    JOIN clinical.content_signature_bindings binding
      ON binding.signature_evidence_id=signature.id
    WHERE signature.resource_type='clinical.content_release'
      AND signature.resource_id=p_release_id
      AND signature.resource_version=p_artifact_version
      AND signature.artifact_digest=p_artifact_digest
      AND signature.decision='approved'
      AND binding.authority_facility_id IS NOT NULL
      AND (
        NOT EXISTS (
          SELECT 1 FROM identity.facility_licenses license
          JOIN identity.private_evidence_objects evidence
            ON evidence.id=license.evidence_object_id
          WHERE license.facility_id=binding.authority_facility_id
            AND license.status='verified' AND license.expires_on>=current_day
            AND evidence.scan_status='released'
            AND evidence.bucket_code='facility-license-evidence'
            AND evidence.facility_id=license.facility_id
        )
        OR NOT EXISTS (
          SELECT 1 FROM identity.facility_memberships membership
          WHERE membership.facility_id=binding.authority_facility_id
            AND membership.person_id=signature.signer_person_id
            AND membership.employment_license_id=binding.credential_id
            AND membership.role_code=CASE binding.credential_profession
              WHEN 'doctor' THEN 'doctor' WHEN 'pharmacist' THEN 'pharmacist' ELSE '' END
            AND membership.membership_status='active'
            AND membership.valid_from<=authorization_now
            AND (membership.valid_until IS NULL OR membership.valid_until>authorization_now)
        )
      )
  ) THEN RETURN false; END IF;

  RETURN clinical.f011_release_current_eligibility_v1(p_release_id);
END
$function$;

CREATE FUNCTION clinical.publish_clinical_content_release_api_v1(
  p_release_id uuid,p_expected_workflow_version integer,p_input jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  actor uuid;
  idem_id uuid;
  idem_new boolean;
  idem_response jsonb;
  release_row clinical.content_releases%ROWTYPE;
  predecessor_row clinical.content_releases%ROWTYPE;
  series_row clinical.content_series%ROWTYPE;
  target_series_id uuid;
  publication_time timestamptz;
  result jsonb;
BEGIN
  PERFORM clinical.f011_assert_exact_keys_v1(
    p_input,ARRAY['responseLanguage','responseRequestId','artifactVersion','artifactDigest','confirmPublication']::text[]
  );
  actor := clinical.f011_assert_response_context_v1(
    'publishClinicalContentRelease',p_input->>'responseLanguage',
    (p_input->>'responseRequestId')::uuid,2
  );
  SELECT record_id,is_new,response_body INTO idem_id,idem_new,idem_response
  FROM clinical.begin_mutation_v1('POST','/v1/admin/clinical-content/releases/{releaseId}/publish');
  IF NOT idem_new THEN
    PERFORM clinical.f011_lock_medical_reviewer_v1(actor);
    RETURN clinical.f011_receipt_replay_metadata_v1((idem_response->>'featureReceiptId')::uuid);
  END IF;
  -- The existing claim settles any prior transaction; absent producer input
  -- must roll back its new claim without a domain effect. Never infer absence
  -- from a generic validation, runtime, authorization, or connection failure.
  IF idem_new AND (p_input->>'artifactVersion' IS NULL OR p_input->>'artifactDigest' IS NULL OR p_input->>'confirmPublication' IS NULL) THEN
    RAISE EXCEPTION 'F011_FRESH_PREPARATION_REQUIRED' USING ERRCODE='22023';
  END IF;

  SELECT series.* INTO STRICT series_row
  FROM clinical.content_releases release
  JOIN clinical.content_series series ON series.id=release.series_id
  WHERE release.id=p_release_id;
  target_series_id := series_row.id;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(series_row.content_type || pg_catalog.chr(31)
      || series_row.governed_content_key || pg_catalog.chr(31) || series_row.effective_scope_key,0)
  );
  SELECT * INTO STRICT series_row FROM clinical.content_series series
  WHERE series.id=target_series_id FOR UPDATE;
  PERFORM release.id FROM clinical.content_releases release
  WHERE release.series_id = target_series_id
  ORDER BY release.id FOR UPDATE;
  SELECT * INTO STRICT release_row FROM clinical.content_releases release
  WHERE release.id = p_release_id AND release.series_id = target_series_id;
  IF p_input->>'confirmPublication' IS DISTINCT FROM 'true'
     OR (p_input->>'artifactVersion')::integer IS DISTINCT FROM release_row.artifact_version
     OR p_input->>'artifactDigest' IS DISTINCT FROM pg_catalog.encode(release_row.artifact_digest,'hex')
     OR release_row.workflow_version <> p_expected_workflow_version
     OR release_row.status <> 'draft'
     OR actor = release_row.created_by_person_id THEN
    RAISE EXCEPTION 'release is stale, ineligible, or not independently publishable' USING ERRCODE = '42501';
  END IF;
  IF NOT clinical.f011_lock_publication_current_basis_v1(
       p_release_id,target_series_id,release_row.artifact_version,release_row.artifact_digest,
       actor,release_row.created_by_person_id
     ) OR NOT clinical.f011_release_current_eligibility_v1(p_release_id) THEN
    RAISE EXCEPTION 'release is stale, ineligible, or not independently publishable' USING ERRCODE = '42501';
  END IF;

  publication_time := pg_catalog.clock_timestamp();
  IF release_row.is_initial THEN
    IF release_row.supersedes_release_id IS NOT NULL OR EXISTS (
      SELECT 1 FROM clinical.content_releases previous
      WHERE previous.series_id = target_series_id AND previous.id <> p_release_id
        AND previous.status = 'published'
    ) THEN
      RAISE EXCEPTION 'initial release is not the first published lineage' USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT * INTO STRICT predecessor_row FROM clinical.content_releases previous
    WHERE previous.id = release_row.supersedes_release_id
      AND previous.series_id = target_series_id AND previous.status = 'published'
    FOR SHARE;
    IF predecessor_row.effective_at > publication_time
       OR predecessor_row.id IS DISTINCT FROM (
         SELECT current_release.id
         FROM clinical.content_releases current_release
         WHERE current_release.series_id = target_series_id
           AND current_release.status = 'published'
           AND current_release.effective_at <= publication_time
           AND NOT EXISTS (
             SELECT 1 FROM clinical.content_releases successor
             WHERE successor.supersedes_release_id = current_release.id
               AND successor.status = 'published'
               AND successor.effective_at <= publication_time
           )
         ORDER BY current_release.effective_at DESC,current_release.artifact_version DESC,current_release.id DESC
         LIMIT 1
       ) THEN
      RAISE EXCEPTION 'successor does not replace the currently applicable release' USING ERRCODE = '23514';
    END IF;
  END IF;
  UPDATE clinical.content_releases
  SET workflow_version = workflow_version + 1,
      status = 'published',
      published_by_person_id = actor,
      published_at = publication_time
  WHERE id = p_release_id AND workflow_version = p_expected_workflow_version AND status = 'draft';
  IF NOT FOUND THEN RAISE EXCEPTION 'release publication compare-and-swap failed' USING ERRCODE = '40001'; END IF;
  result := clinical.f011_record_mutation_effect_v1(
    idem_id,actor,'publishClinicalContentRelease','clinical.content_release',p_release_id,
    release_row.workflow_version + 1,200::smallint,p_input->>'responseLanguage',
    (p_input->>'responseRequestId')::uuid
  );
  RETURN result;
END
$function$;

CREATE FUNCTION clinical.list_clinical_content_api_v1(p_content_type text,p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
<<review_context>>
DECLARE
  projection text := p_input->>'projection';
  actor uuid := platform.context_person_id();
  context_facility_id uuid := NULLIF(pg_catalog.current_setting('shifaa.facility_id',true),'')::uuid;
  release_filter uuid;
  governed_filter text;
  scope_filter text;
  version_filter integer;
  status_filter text;
  reviewer_capacity text;
  rows_value jsonb;
BEGIN
  IF p_input IS NULL OR pg_catalog.jsonb_typeof(p_input)<>'object'
     OR NOT (p_input ? 'projection')
     OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_object_keys(p_input) AS item(key)
       WHERE item.key NOT IN ('projection','releaseId','governedContentKey','effectiveScopeKey','version','status')) THEN
    RAISE EXCEPTION 'invalid clinical content listing filters' USING ERRCODE='22023';
  END IF;
  IF p_input ? 'releaseId' THEN
    IF pg_catalog.jsonb_typeof(p_input->'releaseId')<>'string'
       OR p_input->>'releaseId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'invalid clinical content release filter' USING ERRCODE='22023';
    END IF;
    release_filter := (p_input->>'releaseId')::uuid;
  END IF;
  IF p_input ? 'governedContentKey' THEN
    governed_filter := p_input->>'governedContentKey';
    IF pg_catalog.jsonb_typeof(p_input->'governedContentKey')<>'string' OR pg_catalog.length(governed_filter)=0 THEN
      RAISE EXCEPTION 'invalid governed content key filter' USING ERRCODE='22023';
    END IF;
  END IF;
  IF p_input ? 'effectiveScopeKey' THEN
    scope_filter := p_input->>'effectiveScopeKey';
    IF pg_catalog.jsonb_typeof(p_input->'effectiveScopeKey')<>'string' OR pg_catalog.length(scope_filter)=0 THEN
      RAISE EXCEPTION 'invalid effective scope filter' USING ERRCODE='22023';
    END IF;
  END IF;
  IF p_input ? 'version' THEN
    IF pg_catalog.jsonb_typeof(p_input->'version')<>'number'
       OR p_input->>'version' !~ '^[1-9][0-9]*$' THEN
      RAISE EXCEPTION 'invalid artifact version filter' USING ERRCODE='22023';
    END IF;
    version_filter := (p_input->>'version')::integer;
  END IF;
  IF p_input ? 'status' THEN
    status_filter := p_input->>'status';
    IF pg_catalog.jsonb_typeof(p_input->'status')<>'string' OR status_filter NOT IN ('draft','published') THEN
      RAISE EXCEPTION 'invalid clinical publication status filter' USING ERRCODE='22023';
    END IF;
  END IF;
  IF session_user <> 'shifaa_api' OR actor IS NULL
     OR platform.context_action() IS DISTINCT FROM 'listClinicalContent'
     OR platform.context_aal() < 2
     OR COALESCE(pg_catalog.cardinality(platform.context_purposes()),0) = 0
     OR p_content_type IS NULL OR pg_catalog.length(p_content_type)=0 THEN
    RAISE EXCEPTION 'clinical content listing context denied' USING ERRCODE = '42501';
  END IF;
  IF projection = 'governance' THEN
    IF release_filter IS NOT NULL AND p_input ? 'releaseId' THEN
      NULL;
    END IF;
    PERFORM clinical.f011_lock_medical_reviewer_v1(actor);
    PERFORM person.id FROM identity.people person
    WHERE person.id=actor AND person.profile_status='active' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'active governance viewer required' USING ERRCODE = '42501'; END IF;
    SELECT COALESCE(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'releaseId',release.id,'contentType',series.content_type,
        'governedContentKey',series.governed_content_key,'effectiveScopeKey',series.effective_scope_key,
        'source',pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('display',release.source_display,'reference',release.source_reference)),
        'effectiveAt',release.effective_at,'artifactVersion',release.artifact_version,
        'artifactDigest',pg_catalog.encode(release.artifact_digest,'hex'),'workflowVersion',release.workflow_version,
        'publicationState',release.status,
        'eligibility',CASE WHEN release.status<>'published' THEN 'unavailable'
          WHEN release.effective_at>platform.context_now() THEN 'future'
          WHEN clinical.f011_release_current_eligibility_v1(release.id) THEN 'effective' ELSE 'unavailable' END,
        'initial',release.is_initial,'supersedesReleaseId',release.supersedes_release_id,
        'creatorPersonId',release.created_by_person_id,'createdAt',release.created_at,
        'publisherPersonId',release.published_by_person_id,'publishedAt',release.published_at,
        'artifact',pg_catalog.jsonb_build_object('contentEvidenceRef',release.content_evidence_ref,
          'codeEvidenceRef',release.code_evidence_ref,'testVectorEvidenceRef',release.test_vector_evidence_ref,
          'declaredDigest',pg_catalog.encode(release.artifact_digest,'hex')),
        'signatures',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'signatureId',sig.id,'capacity',sig.signer_role,'decision',sig.decision,
          'artifactVersion',sig.resource_version,'artifactDigest',pg_catalog.encode(sig.artifact_digest,'hex'),
          'signerPersonId',sig.signer_person_id,'signedAt',sig.signed_at,'evidenceRef',binding.evidence_ref
        ) ORDER BY sig.signed_at,sig.id)
          FROM audit.signature_evidence sig
          JOIN clinical.content_signature_bindings binding ON binding.signature_evidence_id=sig.id
          WHERE sig.resource_type='clinical.content_release' AND sig.resource_id=release.id),'[]'::jsonb),
        'syntheticOnly',release.synthetic,
        'privateReviewSources',COALESCE((SELECT pg_catalog.jsonb_object_agg(material.material_kind,
          pg_catalog.jsonb_build_object('bindingId',material.binding_id,'contractId',material.binding_contract_id,
            'reference',material.evidence_ref,'verifiedSha256',pg_catalog.encode(material.verified_sha256,'hex'),
            'producerId',material.producer_id,'verifiedAt',material.verified_at))
          FROM clinical.content_material_bindings material WHERE material.release_id=release.id),'{}'::jsonb),
        'protectedBody',pg_catalog.jsonb_build_object('contractId',release.body_contract_id,
          'keyRef',release.body_key_ref,'nonce',pg_catalog.encode(release.body_nonce,'hex'),
          'ciphertext',pg_catalog.encode(release.body_ciphertext,'hex'),'authTag',pg_catalog.encode(release.body_auth_tag,'hex'))
      ) ORDER BY release.created_at DESC,release.id),'[]'::jsonb)
    INTO rows_value
    FROM clinical.content_releases release
    JOIN clinical.content_series series ON series.id=release.series_id
    WHERE series.content_type=p_content_type
      AND (release_filter IS NULL OR release.id=release_filter)
      AND (governed_filter IS NULL OR series.governed_content_key=governed_filter)
      AND (scope_filter IS NULL OR series.effective_scope_key=scope_filter)
      AND (version_filter IS NULL OR release.artifact_version=version_filter)
      AND (status_filter IS NULL OR release.status=status_filter);
    RETURN rows_value;
  ELSIF projection = 'assigned_review' THEN
    IF platform.context_role() NOT IN ('CLN','PHA') OR release_filter IS NULL THEN
      RAISE EXCEPTION 'exact release and current reviewer context required' USING ERRCODE = '42501';
    END IF;
    reviewer_capacity := CASE platform.context_role() WHEN 'CLN' THEN 'physician' ELSE 'pharmacist' END;
    PERFORM person.id FROM identity.people person
    WHERE person.id=actor AND person.profile_status='active' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'active reviewer identity required' USING ERRCODE = '42501'; END IF;
    SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'releaseId',release.id,'source',pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'display',release.source_display,'reference',release.source_reference)),
      'effectiveAt',release.effective_at,'artifactVersion',release.artifact_version,
      'artifactDigest',pg_catalog.encode(release.artifact_digest,'hex'),'workflowVersion',release.workflow_version,
      'publicationState',release.status,
      'artifact',pg_catalog.jsonb_build_object('contentEvidenceRef',release.content_evidence_ref,
        'codeEvidenceRef',release.code_evidence_ref,'testVectorEvidenceRef',release.test_vector_evidence_ref,
        'declaredDigest',pg_catalog.encode(release.artifact_digest,'hex')),
      'initial',release.is_initial,'supersedesReleaseId',release.supersedes_release_id,
      'signatureStatus',pg_catalog.jsonb_build_object(
        'physicianApproved',EXISTS(SELECT 1 FROM audit.signature_evidence sig WHERE sig.resource_type='clinical.content_release'
          AND sig.resource_id=release.id AND sig.signer_role='physician' AND sig.decision='approved'),
        'pharmacistApproved',EXISTS(SELECT 1 FROM audit.signature_evidence sig WHERE sig.resource_type='clinical.content_release'
          AND sig.resource_id=release.id AND sig.signer_role='pharmacist' AND sig.decision='approved')),
      'syntheticOnly',release.synthetic,
      'privateReviewSources',COALESCE((SELECT pg_catalog.jsonb_object_agg(material.material_kind,
        pg_catalog.jsonb_build_object('bindingId',material.binding_id,'contractId',material.binding_contract_id,
          'reference',material.evidence_ref,'verifiedSha256',pg_catalog.encode(material.verified_sha256,'hex'),
          'producerId',material.producer_id,'verifiedAt',material.verified_at))
        FROM clinical.content_material_bindings material WHERE material.release_id=release.id),'{}'::jsonb),
      'protectedBody',pg_catalog.jsonb_build_object('contractId',release.body_contract_id,
        'keyRef',release.body_key_ref,'nonce',pg_catalog.encode(release.body_nonce,'hex'),
        'ciphertext',pg_catalog.encode(release.body_ciphertext,'hex'),'authTag',pg_catalog.encode(release.body_auth_tag,'hex'))
    ) ORDER BY release.created_at DESC,release.id),'[]'::jsonb)
    INTO rows_value
    FROM clinical.content_releases release
    JOIN clinical.content_series series ON series.id=release.series_id
    WHERE release.id=release_filter AND series.content_type=p_content_type
      AND (governed_filter IS NULL OR series.governed_content_key=governed_filter)
      AND (scope_filter IS NULL OR series.effective_scope_key=scope_filter)
      AND (version_filter IS NULL OR release.artifact_version=version_filter)
      AND (status_filter IS NULL OR release.status=status_filter)
      AND EXISTS (SELECT 1 FROM clinical.content_governance_authorities authority
        WHERE authority.person_id=actor AND authority.action='listClinicalContent'
          AND authority.capacity IS NULL AND authority.status='active'
          AND authority.content_type=series.content_type
          AND authority.governed_content_key=series.governed_content_key
          AND authority.effective_scope_key=series.effective_scope_key
          AND (authority.facility_id IS NULL OR authority.facility_id=context_facility_id)
          AND authority.valid_from<=platform.context_now()
          AND (authority.valid_until IS NULL OR authority.valid_until>platform.context_now()))
      AND EXISTS (SELECT 1 FROM identity.professional_licenses credential
        JOIN clinical.content_reviewer_designations designation
          ON designation.professional_license_id=credential.id
        WHERE credential.person_id=actor AND credential.profession=(CASE platform.context_role()
            WHEN 'CLN' THEN 'doctor' ELSE 'pharmacist' END)
          AND credential.status='verified'
          AND credential.expires_on >= (platform.context_now() AT TIME ZONE 'UTC')::date
          AND designation.person_id=actor AND designation.reviewer_capacity=review_context.reviewer_capacity
          AND designation.status='active' AND designation.valid_from<=platform.context_now()
          AND (designation.valid_until IS NULL OR designation.valid_until>platform.context_now()))
      AND (release.status='draft' OR clinical.f011_release_current_eligibility_v1(release.id));
    IF rows_value='[]'::jsonb THEN
      RAISE EXCEPTION 'exact-release reviewer disclosure authority required' USING ERRCODE='42501';
    END IF;
    RETURN rows_value;
  ELSIF projection = 'status' THEN
    IF platform.context_role() NOT IN ('CLN','PHA') OR context_facility_id IS NULL
       OR NOT clinical.f011_lock_clinic_content_scope_v1(context_facility_id,actor) THEN
      RAISE EXCEPTION 'current clinic workforce/facility context required' USING ERRCODE = '42501';
    END IF;
    PERFORM person.id FROM identity.people person
    WHERE person.id=actor AND person.profile_status='active' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'active clinic identity required' USING ERRCODE = '42501'; END IF;
    PERFORM authority.id FROM clinical.content_governance_authorities authority
    WHERE authority.person_id=actor AND authority.action='listClinicalContent'
      AND authority.capacity IS NULL AND authority.content_type=p_content_type
      AND authority.facility_id=context_facility_id AND authority.status='active'
      AND authority.valid_from<=platform.context_now()
      AND (authority.valid_until IS NULL OR authority.valid_until>platform.context_now())
    ORDER BY authority.id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'explicit current clinic status authority required' USING ERRCODE = '42501'; END IF;
    WITH candidates AS (
      SELECT release.*,series.content_type,series.governed_content_key,series.effective_scope_key,
        pg_catalog.row_number() OVER (
          PARTITION BY release.series_id
          ORDER BY release.effective_at DESC,release.artifact_version DESC,release.id DESC
        ) AS selected_rank
      FROM clinical.content_releases release
      JOIN clinical.content_series series ON series.id=release.series_id
      WHERE release.status='published' AND release.effective_at<=platform.context_now()
        AND series.content_type=p_content_type
        AND EXISTS (SELECT 1 FROM clinical.content_governance_authorities authority
          WHERE authority.person_id=actor AND authority.action='listClinicalContent'
            AND authority.capacity IS NULL AND authority.content_type=series.content_type
            AND authority.governed_content_key=series.governed_content_key
            AND authority.effective_scope_key=series.effective_scope_key
            AND authority.facility_id=context_facility_id AND authority.status='active'
            AND authority.valid_from<=platform.context_now()
            AND (authority.valid_until IS NULL OR authority.valid_until>platform.context_now()))
        AND NOT EXISTS (SELECT 1 FROM clinical.content_releases successor
          WHERE successor.supersedes_release_id=release.id AND successor.status='published'
            AND successor.effective_at<=platform.context_now())
    )
    SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'releaseId',candidate.id,'artifactVersion',candidate.artifact_version,
      'source',pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('display',candidate.source_display)),
      'effectiveAt',candidate.effective_at,'publicationState',candidate.status,
      'eligibility',CASE WHEN candidate.effective_at>platform.context_now() THEN 'future'
        WHEN clinical.f011_release_current_eligibility_v1(candidate.id) THEN 'effective' ELSE 'unavailable' END,
      'supersedesReleaseId',candidate.supersedes_release_id,'initial',candidate.is_initial,
      'signatureStatus',pg_catalog.jsonb_build_object('physicianApproved',true,'pharmacistApproved',true)
    ) ORDER BY candidate.effective_at DESC,candidate.id),'[]'::jsonb)
    INTO rows_value
    FROM candidates candidate
    WHERE candidate.selected_rank=1 AND clinical.f011_release_current_eligibility_v1(candidate.id)
      AND (release_filter IS NULL OR candidate.id=release_filter)
      AND (governed_filter IS NULL OR candidate.governed_content_key=governed_filter)
      AND (scope_filter IS NULL OR candidate.effective_scope_key=scope_filter)
      AND (version_filter IS NULL OR candidate.artifact_version=version_filter)
      AND (status_filter IS NULL OR candidate.status=status_filter);
    RETURN rows_value;
  END IF;
  RAISE EXCEPTION 'unknown clinical content projection' USING ERRCODE = '22023';
END
$function$;
