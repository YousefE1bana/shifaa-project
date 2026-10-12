-- K05 component storage verification only. Synthetic opaque bytes; no crypto,
-- source authenticity, clinical approval, K06 consumer or K07 race acceptance.
CREATE FUNCTION pg_temp.k05_release(target uuid, series uuid, artifact integer,
  initial boolean, predecessor uuid, workflow_status text DEFAULT 'draft',
  include_bindings boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql AS $fixture$
BEGIN
  INSERT INTO clinical.content_releases(id,series_id,artifact_version,workflow_version,
    source_display,source_reference,effective_at,artifact_digest,
    body_contract_id,body_key_ref,body_nonce,body_ciphertext,body_auth_tag,
    content_evidence_ref,code_evidence_ref,test_vector_evidence_ref,
    content_sha256,code_sha256,test_vector_sha256,is_initial,supersedes_release_id,
    status,created_by_person_id,created_at,published_by_person_id,published_at,synthetic)
  VALUES(target,series,artifact,1,'Synthetic storage fixture',NULL,clock_timestamp(),decode(repeat('a',64),'hex'),
    'SHIFAA-F011-PROTECTED-BODY/1','synthetic-kms/body/versions/1',decode(repeat('01',12),'hex'),decode('a0','hex'),decode(repeat('02',16),'hex'),
    'f0110000-0000-4000-8500-000000000002','f0110000-0000-4000-8500-000000000003','f0110000-0000-4000-8500-000000000004',
    decode(repeat('b',64),'hex'),decode(repeat('c',64),'hex'),decode(repeat('d',64),'hex'),initial,predecessor,workflow_status,
    'f0110000-0000-4000-8000-000000000005',clock_timestamp(),
    CASE WHEN workflow_status='published' THEN 'f0110000-0000-4000-8000-000000000006'::uuid END,
    CASE WHEN workflow_status='published' THEN clock_timestamp() END,true);
  IF NOT include_bindings THEN RETURN; END IF;
  INSERT INTO clinical.content_material_bindings(binding_id,release_id,artifact_version,
    material_kind,evidence_ref,verified_sha256,producer_id,verified_at,binding_contract_id)
  SELECT gen_random_uuid(),target,artifact,kind,ref,decode(repeat(digest_char,64),'hex'),
    'f011.evidence_port',clock_timestamp(),'SHIFAA-F011-VERIFIED-EVIDENCE-BINDING/1'
  FROM (VALUES('content','f0110000-0000-4000-8500-000000000002'::uuid,'b'),
    ('code','f0110000-0000-4000-8500-000000000003'::uuid,'c'),
    ('test_vectors','f0110000-0000-4000-8500-000000000004'::uuid,'d')) v(kind,ref,digest_char);
END $fixture$;

DO $storage$
DECLARE series uuid:=gen_random_uuid(); other_series uuid:=gen_random_uuid();
  first uuid:=gen_random_uuid(); second uuid:=gen_random_uuid(); predecessor uuid:=gen_random_uuid();
BEGIN
  INSERT INTO clinical.content_series(id,content_type,governed_content_key,effective_scope_key)
    VALUES(series,'synthetic','k05-component','synthetic-scope'),
      (other_series,'synthetic','k05-other','synthetic-scope');
  PERFORM pg_temp.k05_release(first,series,1,true,NULL);
  PERFORM pg_temp.k05_release(second,series,1,true,NULL);
  PERFORM pg_temp.f011_check((SELECT count(*) FROM clinical.content_releases WHERE series_id=series AND artifact_version=1)=2,'same-lineage-version competing drafts must coexist');
  PERFORM pg_temp.f011_check((SELECT count(*) FROM clinical.content_material_bindings WHERE release_id IN(first,second))=6,'exact three material bindings per complete fixture');
  SET CONSTRAINTS clinical.content_releases_materials_deferred, clinical.content_material_bindings_reciprocal_deferred IMMEDIATE;
  SET CONSTRAINTS clinical.content_releases_materials_deferred, clinical.content_material_bindings_reciprocal_deferred DEFERRED;
  BEGIN
    PERFORM pg_temp.k05_release(gen_random_uuid(),series,1,true,NULL,'draft',false);
    SET CONSTRAINTS clinical.content_releases_materials_deferred IMMEDIATE;
    RAISE EXCEPTION 'Missing material bindings were accepted';
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.f011_check(SQLERRM LIKE '%material bindings%', 'failure must identify absent material bindings');
  END;
  PERFORM pg_temp.f011_denied(format('UPDATE clinical.content_releases SET body_nonce=decode(''00'',''hex'') WHERE id=%L',first),ARRAY['23514','55000']);
  PERFORM pg_temp.f011_denied(format('DELETE FROM clinical.content_material_bindings WHERE release_id=%L',first),ARRAY['55000']);
  PERFORM pg_temp.k05_release(predecessor,other_series,1,true,NULL);
  PERFORM pg_temp.f011_denied(format('SELECT pg_temp.k05_release(gen_random_uuid(),%L,2,false,%L)',series,predecessor),ARRAY['23503']);
  -- Published uniqueness is an immediate storage constraint, independent of
  -- later publication authorization. This transaction is always rolled back.
  PERFORM pg_temp.k05_release(gen_random_uuid(),series,1,true,NULL,'published');
  PERFORM pg_temp.f011_denied(format('SELECT pg_temp.k05_release(gen_random_uuid(),%L,1,true,NULL,''published'')',series),ARRAY['23505']);
END $storage$;
DO $allergy_storage$
DECLARE assertion uuid;
BEGIN
  assertion:=pg_temp.f011_allergy_path(ARRAY['self_reported','clinician_confirmed','refuted','entered_in_error']);
  SET CONSTRAINTS clinical.allergy_revisions_reciprocal_deferred,
    clinical.allergy_support_reciprocal_deferred, clinical.allergy_bindings_reciprocal_deferred IMMEDIATE;
  SET CONSTRAINTS clinical.allergy_revisions_reciprocal_deferred,
    clinical.allergy_support_reciprocal_deferred, clinical.allergy_bindings_reciprocal_deferred DEFERRED;
  PERFORM pg_temp.f011_check((SELECT count(*) FROM clinical.allergies WHERE allergy_id=assertion)=4,'contiguous immutable allergy history');
  PERFORM pg_temp.f011_denied(format('UPDATE clinical.allergies SET recorded_at=clock_timestamp() WHERE allergy_id=%L',assertion),ARRAY['55000']);
  BEGIN
    PERFORM pg_temp.f011_allergy_path(ARRAY['self_reported','entered_in_error','clinician_confirmed']);
    SET CONSTRAINTS clinical.allergy_revisions_reciprocal_deferred IMMEDIATE;
    RAISE EXCEPTION 'Terminal allergy resurrection was accepted';
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.f011_check(SQLERRM LIKE '%allergy%', 'must fail the allergy structural invariant');
  END;
END $allergy_storage$;
SELECT 'K05_COMPONENT_STORAGE_PASS';
