-- Feature 011 K06: exact ARTIFACT/1 framing and trusted release creation.
-- SQL sees only normalized facts, verified references/digests and ciphertext.

CREATE FUNCTION clinical.f011_frame_text_v1(p_value text)
RETURNS bytea
LANGUAGE sql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT pg_catalog.convert_to(
    'S' || pg_catalog.octet_length(pg_catalog.convert_to(p_value, 'UTF8'))::text
      || ':' || p_value || ',',
    'UTF8'
  )
$function$;

CREATE FUNCTION clinical.f011_frame_nullable_text_v1(p_value text)
RETURNS bytea
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT CASE WHEN p_value IS NULL
    THEN pg_catalog.convert_to('N,', 'UTF8')
    ELSE clinical.f011_frame_text_v1(p_value)
  END
$function$;

CREATE FUNCTION clinical.f011_artifact_canonical_bytes_v1(p_facts jsonb)
RETURNS bytea
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  series jsonb := p_facts->'series';
  source_value jsonb := p_facts->'source';
  predecessor jsonb := p_facts->'predecessor';
  evidence jsonb := p_facts->'evidence';
  content_evidence jsonb := p_facts->'evidence'->'content';
  code_evidence jsonb := p_facts->'evidence'->'code';
  vector_evidence jsonb := p_facts->'evidence'->'testVectors';
  effective_value text := p_facts->>'effectiveAt';
  is_initial boolean;
  predecessor_id text;
  source_reference text;
  output_bytes bytea;
  fact text;
BEGIN
  PERFORM clinical.f011_assert_exact_keys_v1(
    p_facts, ARRAY['contractId','series','source','effectiveAt','predecessor','evidence']::text[]
  );
  PERFORM clinical.f011_assert_exact_keys_v1(
    series, ARRAY['contentType','governedContentKey','effectiveScopeKey']::text[]
  );
  PERFORM clinical.f011_assert_exact_keys_v1(source_value, ARRAY['display','reference']::text[]);
  PERFORM clinical.f011_assert_exact_keys_v1(predecessor, ARRAY['initial','supersedesReleaseId']::text[]);
  PERFORM clinical.f011_assert_exact_keys_v1(evidence, ARRAY['content','code','testVectors']::text[]);
  PERFORM clinical.f011_assert_exact_keys_v1(content_evidence, ARRAY['ref','sha256']::text[]);
  PERFORM clinical.f011_assert_exact_keys_v1(code_evidence, ARRAY['ref','sha256']::text[]);
  PERFORM clinical.f011_assert_exact_keys_v1(vector_evidence, ARRAY['ref','sha256']::text[]);

  IF p_facts->>'contractId' IS DISTINCT FROM 'SHIFAA-F011-ARTIFACT/1'
     OR pg_catalog.jsonb_typeof(predecessor->'initial') <> 'boolean'
     OR pg_catalog.jsonb_typeof(source_value->'display') <> 'string'
     OR pg_catalog.length(source_value->>'display') = 0
     OR (source_value->'reference' <> 'null'::jsonb AND
         (pg_catalog.jsonb_typeof(source_value->'reference') <> 'string'
          OR pg_catalog.length(source_value->>'reference') = 0))
     OR pg_catalog.jsonb_typeof(p_facts->'effectiveAt') IS DISTINCT FROM 'string'
     OR effective_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$' THEN
    RAISE EXCEPTION 'invalid canonical artifact facts' USING ERRCODE = '22023';
  END IF;
  FOR fact IN SELECT item.value FROM (VALUES
    (series->>'contentType'), (series->>'governedContentKey'),
    (series->>'effectiveScopeKey'), (source_value->>'display')
  ) AS item(value) LOOP
    IF fact IS NULL OR pg_catalog.length(fact) = 0 THEN
      RAISE EXCEPTION 'artifact text facts must be nonempty' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  is_initial := (predecessor->>'initial')::boolean;
  predecessor_id := predecessor->>'supersedesReleaseId';
  IF is_initial THEN
    IF predecessor->'supersedesReleaseId' IS DISTINCT FROM 'null'::jsonb THEN
      RAISE EXCEPTION 'initial artifact cannot name a predecessor' USING ERRCODE = '22023';
    END IF;
  ELSIF predecessor_id IS NULL OR predecessor_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'successor artifact requires canonical predecessor UUID' USING ERRCODE = '22023';
  END IF;

  FOREACH fact IN ARRAY ARRAY[
    content_evidence->>'ref', code_evidence->>'ref', vector_evidence->>'ref'
  ]::text[] LOOP
    IF fact !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'artifact evidence reference is not canonical UUID' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOREACH fact IN ARRAY ARRAY[
    content_evidence->>'sha256', code_evidence->>'sha256', vector_evidence->>'sha256'
  ]::text[] LOOP
    IF fact !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'artifact evidence digest is not canonical SHA-256' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF pg_catalog.to_char(
         effective_value::timestamptz AT TIME ZONE 'UTC',
         'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
       ) <> effective_value THEN
    RAISE EXCEPTION 'artifact instant is not canonical UTC' USING ERRCODE = '22023';
  END IF;

  source_reference := CASE WHEN source_value->'reference' = 'null'::jsonb
    THEN NULL ELSE source_value->>'reference' END;
  output_bytes := pg_catalog.convert_to('SHIFAA-F011-ARTIFACT/1;', 'UTF8');
  output_bytes := output_bytes || clinical.f011_frame_text_v1(series->>'contentType');
  output_bytes := output_bytes || clinical.f011_frame_text_v1(series->>'governedContentKey');
  output_bytes := output_bytes || clinical.f011_frame_text_v1(series->>'effectiveScopeKey');
  output_bytes := output_bytes || clinical.f011_frame_text_v1(source_value->>'display');
  output_bytes := output_bytes || clinical.f011_frame_nullable_text_v1(source_reference);
  output_bytes := output_bytes || clinical.f011_frame_text_v1(effective_value);
  output_bytes := output_bytes || clinical.f011_frame_text_v1(
    CASE WHEN is_initial THEN 'initial' ELSE 'successor' END
  );
  output_bytes := output_bytes || clinical.f011_frame_nullable_text_v1(predecessor_id);
  output_bytes := output_bytes || clinical.f011_frame_text_v1(content_evidence->>'ref');
  output_bytes := output_bytes || clinical.f011_frame_text_v1(content_evidence->>'sha256');
  output_bytes := output_bytes || clinical.f011_frame_text_v1(code_evidence->>'ref');
  output_bytes := output_bytes || clinical.f011_frame_text_v1(code_evidence->>'sha256');
  output_bytes := output_bytes || clinical.f011_frame_text_v1(vector_evidence->>'ref');
  output_bytes := output_bytes || clinical.f011_frame_text_v1(vector_evidence->>'sha256');
  RETURN output_bytes;
END
$function$;

CREATE FUNCTION clinical.f011_lock_medical_reviewer_v1(p_person_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE current_grant_id uuid;
BEGIN
  IF session_user <> 'shifaa_api'
     OR platform.context_role() IS DISTINCT FROM 'ADM-MEDICAL'
     OR platform.context_aal() < 2
     OR COALESCE(pg_catalog.cardinality(platform.context_purposes()),0) = 0 THEN
    RAISE EXCEPTION 'medical reviewer context denied' USING ERRCODE = '42501';
  END IF;
  SELECT grant_row.id INTO current_grant_id
  FROM identity.admin_role_grants grant_row
  WHERE grant_row.person_id = p_person_id
    AND grant_row.role_code = 'medical_reviewer' AND grant_row.status = 'active'
    AND grant_row.valid_from <= platform.context_now()
    AND (grant_row.valid_until IS NULL OR grant_row.valid_until > platform.context_now())
  FOR SHARE;
  IF current_grant_id IS NULL THEN
    RAISE EXCEPTION 'current medical reviewer grant required' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM identity.admin_role_revocation_requests revocation
  WHERE revocation.grant_id = current_grant_id AND revocation.status = 'approved'
  FOR SHARE;
  IF FOUND THEN
    RAISE EXCEPTION 'medical reviewer grant is revoked' USING ERRCODE = '42501';
  END IF;
END
$function$;

CREATE FUNCTION clinical.create_clinical_content_release_api_v1(p_content_type text, p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  handoff jsonb := p_input->'handoff';
  facts jsonb;
  bindings jsonb := p_input->'materialBindings';
  body record;
  actor uuid;
  idem_id uuid;
  idem_new boolean;
  idem_response jsonb;
  target_series_id uuid;
  predecessor_id uuid;
  predecessor_row clinical.content_releases%ROWTYPE;
  release_id uuid;
  allocated_artifact_version integer;
  artifact_bytes bytea;
  artifact_digest bytea;
  digest_hex text;
  source_ref text;
  source_display text;
  effective_instant timestamptz;
  initial_value boolean;
  binding jsonb;
  kind_value text;
  evidence_fact jsonb;
  evidence_trust jsonb;
  profile_name text;
  binding_key text;
  synthetic_value boolean;
  profile record;
  result jsonb;
BEGIN
  PERFORM clinical.f011_assert_exact_keys_v1(
    p_input, ARRAY['responseLanguage','responseRequestId','handoff','materialBindings']::text[]
  );

  -- A committed receipt needs current authorization, not new producer work.
  actor := clinical.f011_assert_response_context_v1(
    'createClinicalContentRelease', p_input->>'responseLanguage',
    (p_input->>'responseRequestId')::uuid, 2
  );
  SELECT record_id,is_new,response_body INTO idem_id,idem_new,idem_response
  FROM clinical.begin_mutation_v1('POST','/v1/admin/clinical-content/{contentType}/releases');
  IF NOT idem_new THEN
    PERFORM clinical.f011_lock_medical_reviewer_v1(actor);
    RETURN clinical.f011_receipt_replay_metadata_v1((idem_response->>'featureReceiptId')::uuid);
  END IF;
  -- The existing claim settles any prior transaction; absent producer input
  -- must roll back its new claim without a domain effect. Never infer absence
  -- from a generic validation, runtime, authorization, or connection failure.
  IF idem_new AND (handoff IS NULL OR handoff='null'::jsonb OR bindings IS NULL OR bindings='null'::jsonb) THEN
    RAISE EXCEPTION 'F011_FRESH_PREPARATION_REQUIRED' USING ERRCODE='22023';
  END IF;

  PERFORM clinical.f011_assert_exact_keys_v1(
    handoff, ARRAY['contractId','artifactFacts','trustedEvidence','allocation','protectedBody','declaredDigest']::text[]
  );
  PERFORM clinical.f011_assert_exact_keys_v1(
    bindings, ARRAY['content','code','testVectors']::text[]
  );
  PERFORM clinical.f011_assert_exact_keys_v1(
    handoff->'allocation', ARRAY['releaseId','artifactVersion']::text[]
  );
  PERFORM clinical.f011_assert_exact_keys_v1(
    handoff->'trustedEvidence', ARRAY['content','code','testVectors']::text[]
  );


  IF handoff->>'contractId' IS DISTINCT FROM 'SHIFAA-F011-CREATE-RELEASE-HANDOFF/1'
     OR p_content_type IS DISTINCT FROM handoff->'artifactFacts'->'series'->>'contentType'
     OR pg_catalog.jsonb_typeof(handoff->'declaredDigest') NOT IN ('string','null')
     OR (handoff->'declaredDigest' <> 'null'::jsonb
         AND handoff->>'declaredDigest' !~ '^[0-9a-f]{64}$') THEN
    RAISE EXCEPTION 'invalid release handoff' USING ERRCODE = '22023';
  END IF;
  facts := handoff->'artifactFacts';
  artifact_bytes := clinical.f011_artifact_canonical_bytes_v1(facts);
  artifact_digest := audit.sha256_v1(artifact_bytes);
  digest_hex := pg_catalog.encode(artifact_digest,'hex');
  IF handoff->'declaredDigest' <> 'null'::jsonb
     AND handoff->>'declaredDigest' IS DISTINCT FROM digest_hex THEN
    RAISE EXCEPTION 'declared artifact digest differs from canonical digest' USING ERRCODE = '23514';
  END IF;
  release_id := (handoff->'allocation'->>'releaseId')::uuid;
  allocated_artifact_version := (handoff->'allocation'->>'artifactVersion')::integer;
  IF release_id IS NULL OR allocated_artifact_version < 1
     OR handoff->'allocation'->>'releaseId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'invalid release allocation' USING ERRCODE = '22023';
  END IF;
  effective_instant := (facts->>'effectiveAt')::timestamptz;
  source_display := facts->'source'->>'display';
  source_ref := CASE WHEN facts->'source'->'reference' = 'null'::jsonb
    THEN NULL ELSE facts->'source'->>'reference' END;
  initial_value := (facts->'predecessor'->>'initial')::boolean;
  synthetic_value := p_content_type = 'synthetic'
    AND platform.context_environment() IN ('local','ci');
  IF p_content_type = 'synthetic' AND NOT synthetic_value THEN
    RAISE EXCEPTION 'synthetic release is limited to isolated local or CI context' USING ERRCODE = '42501';
  END IF;
  predecessor_id := NULLIF(facts->'predecessor'->>'supersedesReleaseId','')::uuid;
  SELECT * INTO STRICT body
  FROM clinical.f011_decode_envelope_v1(handoff->'protectedBody','SHIFAA-F011-PROTECTED-BODY/1');

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      (facts->'series'->>'contentType') || pg_catalog.chr(31)
        || (facts->'series'->>'governedContentKey') || pg_catalog.chr(31)
        || (facts->'series'->>'effectiveScopeKey'),
      0
    )
  );
  INSERT INTO clinical.content_series(content_type,governed_content_key,effective_scope_key)
  VALUES (facts->'series'->>'contentType',facts->'series'->>'governedContentKey',
    facts->'series'->>'effectiveScopeKey')
  ON CONFLICT (content_type,governed_content_key,effective_scope_key) DO NOTHING;
  SELECT series.id INTO STRICT target_series_id FROM clinical.content_series series
  WHERE series.content_type = facts->'series'->>'contentType'
    AND series.governed_content_key = facts->'series'->>'governedContentKey'
    AND series.effective_scope_key = facts->'series'->>'effectiveScopeKey'
  FOR UPDATE;
  IF initial_value THEN
    IF allocated_artifact_version <> 1 OR EXISTS (
      SELECT 1 FROM clinical.content_releases release
      WHERE release.series_id = target_series_id AND release.status = 'published' AND release.is_initial
    ) THEN
      RAISE EXCEPTION 'initial artifact allocation or lineage is stale' USING ERRCODE = '40001';
    END IF;
  ELSE
    SELECT * INTO STRICT predecessor_row FROM clinical.content_releases release
    WHERE release.id = predecessor_id AND release.series_id = target_series_id
      AND release.status = 'published'
    FOR UPDATE;
    IF allocated_artifact_version <> predecessor_row.artifact_version + 1 THEN
      RAISE EXCEPTION 'successor artifact allocation is stale' USING ERRCODE = '40001';
    END IF;
  END IF;
  PERFORM clinical.f011_lock_medical_reviewer_v1(actor);
  PERFORM person.id FROM identity.people person WHERE person.id = actor
    AND person.profile_status = 'active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'active creator identity required' USING ERRCODE = '42501'; END IF;

  FOREACH kind_value IN ARRAY ARRAY['content','code','test_vectors']::text[] LOOP
    binding_key := CASE kind_value WHEN 'test_vectors' THEN 'testVectors' ELSE kind_value END;
    binding := bindings->binding_key;
    profile_name := CASE kind_value WHEN 'content' THEN 'content_material'
      WHEN 'code' THEN 'code_material' ELSE 'test_vector_material' END;
    evidence_fact := facts->'evidence'->(CASE kind_value
      WHEN 'test_vectors' THEN 'testVectors' ELSE kind_value END);
    evidence_trust := handoff->'trustedEvidence'->(CASE kind_value
      WHEN 'test_vectors' THEN 'testVectors' ELSE kind_value END);
    PERFORM clinical.f011_assert_exact_keys_v1(binding, ARRAY[
      'contractId','profile','bindingId','producerId','verifiedAt','releaseId',
      'artifactVersion','evidenceRef','verifiedSha256'
    ]::text[]);
    PERFORM clinical.f011_assert_exact_keys_v1(evidence_trust,
      ARRAY['reference','verifiedSha256']::text[]);
    IF binding->>'contractId' IS DISTINCT FROM 'SHIFAA-F011-VERIFIED-EVIDENCE-BINDING/1'
       OR binding->>'profile' IS DISTINCT FROM profile_name
       OR binding->>'producerId' IS DISTINCT FROM 'f011.evidence_port'
       OR binding->>'releaseId' IS DISTINCT FROM release_id::text
       OR (binding->>'artifactVersion')::integer IS DISTINCT FROM allocated_artifact_version
       OR binding->>'evidenceRef' IS DISTINCT FROM evidence_fact->>'ref'
       OR binding->>'verifiedSha256' IS DISTINCT FROM evidence_fact->>'sha256'
       OR binding->>'evidenceRef' IS DISTINCT FROM evidence_trust->>'reference'
       OR binding->>'verifiedSha256' IS DISTINCT FROM evidence_trust->>'verifiedSha256'
       OR binding->>'verifiedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$'
       OR (binding->>'verifiedAt')::timestamptz > platform.context_now()
       OR binding->>'bindingId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'material binding does not match the exact trusted handoff' USING ERRCODE = '23514';
    END IF;
  END LOOP;

  INSERT INTO clinical.content_releases(
    id,series_id,artifact_version,workflow_version,source_display,source_reference,effective_at,
    artifact_digest,body_contract_id,body_key_ref,body_nonce,body_ciphertext,body_auth_tag,
    content_evidence_ref,code_evidence_ref,test_vector_evidence_ref,
    content_sha256,code_sha256,test_vector_sha256,is_initial,supersedes_release_id,
    status,created_by_person_id,synthetic
  ) VALUES (
    release_id,target_series_id,allocated_artifact_version,1,source_display,source_ref,effective_instant,
    artifact_digest,'SHIFAA-F011-PROTECTED-BODY/1',body.key_ref,body.nonce_bytes,body.ciphertext_bytes,body.tag_bytes,
    (facts->'evidence'->'content'->>'ref')::uuid,
    (facts->'evidence'->'code'->>'ref')::uuid,
    (facts->'evidence'->'testVectors'->>'ref')::uuid,
    pg_catalog.decode(facts->'evidence'->'content'->>'sha256','hex'),
    pg_catalog.decode(facts->'evidence'->'code'->>'sha256','hex'),
    pg_catalog.decode(facts->'evidence'->'testVectors'->>'sha256','hex'),
    initial_value,predecessor_id,'draft',actor,synthetic_value
  );
  FOREACH kind_value IN ARRAY ARRAY['content','code','test_vectors']::text[] LOOP
    binding_key := CASE kind_value WHEN 'test_vectors' THEN 'testVectors' ELSE kind_value END;
    binding := bindings->binding_key;
    INSERT INTO clinical.content_material_bindings(
      binding_id,release_id,artifact_version,material_kind,evidence_ref,verified_sha256,
      producer_id,verified_at,binding_contract_id
    ) VALUES (
      (binding->>'bindingId')::uuid,release_id,allocated_artifact_version,kind_value,
      (binding->>'evidenceRef')::uuid,pg_catalog.decode(binding->>'verifiedSha256','hex'),
      'f011.evidence_port',(binding->>'verifiedAt')::timestamptz,
      'SHIFAA-F011-VERIFIED-EVIDENCE-BINDING/1'
    );
  END LOOP;
  result := clinical.f011_record_mutation_effect_v1(
    idem_id,actor,'createClinicalContentRelease','clinical.content_release',release_id,1,
    201::smallint,p_input->>'responseLanguage',(p_input->>'responseRequestId')::uuid
  );
  RETURN pg_catalog.jsonb_set(result,'{artifactDigest}',pg_catalog.to_jsonb(digest_hex),true);
END
$function$;
