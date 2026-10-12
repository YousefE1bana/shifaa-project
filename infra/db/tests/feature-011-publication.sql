-- K04 physical RED. Each case runs in its own isolated test transaction.

-- F011_CASE {"id":"PUB-EXACT-ADMISSION","task":"T013","missing":{"kind":"table","name":"clinical.content_admissibility_evidence"},"purpose":"Exact artifact approval after draft; broad scope alone never admits","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.content_admissibility_evidence');
  PERFORM pg_temp.f011_columns('clinical.content_admissibility_evidence','[{"name":"id","type":"uuid","nullable":false},{"name":"release_id","type":"uuid","nullable":false},{"name":"artifact_version","type":"integer","nullable":false},{"name":"artifact_digest","type":"bytea","nullable":false},{"name":"content_type","type":"text","nullable":false},{"name":"governed_content_key","type":"text","nullable":false},{"name":"effective_scope_key","type":"text","nullable":false},{"name":"policy_ref","type":"uuid","nullable":false},{"name":"policy_version","type":"text","nullable":false},{"name":"policy_sha256","type":"bytea","nullable":false},{"name":"source_admission_ref","type":"uuid","nullable":false},{"name":"category_admission_ref","type":"uuid","nullable":false},{"name":"code_admission_ref","type":"uuid","nullable":false},{"name":"test_vector_admission_ref","type":"uuid","nullable":false},{"name":"source_identity","type":"text","nullable":false},{"name":"source_evidence_identity","type":"text","nullable":false},{"name":"source_evidence_version","type":"text","nullable":true},{"name":"source_evidence_sha256","type":"bytea","nullable":true},{"name":"synthetic","type":"boolean","nullable":false},{"name":"status","type":"text","nullable":false},{"name":"valid_from","type":"timestamptz","nullable":false},{"name":"valid_until","type":"timestamptz","nullable":true},{"name":"version","type":"integer","nullable":false}]'::jsonb,true);
  PERFORM pg_temp.f011_fk('clinical.content_admissibility_evidence',ARRAY['release_id','artifact_version','artifact_digest']::text[],'clinical.content_releases',ARRAY['id','artifact_version','artifact_digest']::text[],false);
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"PUB-IMMUTABLE-ADMISSION","task":"T013","missing":{"kind":"table","name":"clinical.content_artifact_admissibility_bindings"},"purpose":"Exact approval/version/fields/current qualification; missing/multiple/ambiguous eligible bindings deny","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.content_artifact_admissibility_bindings');
  PERFORM pg_temp.f011_columns('clinical.content_artifact_admissibility_bindings','[{"name":"binding_id","type":"uuid","nullable":false},{"name":"binding_contract_id","type":"text","nullable":false},{"name":"release_id","type":"uuid","nullable":false},{"name":"artifact_version","type":"integer","nullable":false},{"name":"artifact_digest","type":"bytea","nullable":false},{"name":"approval_id","type":"uuid","nullable":false},{"name":"approval_version","type":"integer","nullable":false},{"name":"content_type","type":"text","nullable":false},{"name":"governed_content_key","type":"text","nullable":false},{"name":"effective_scope_key","type":"text","nullable":false},{"name":"policy_ref","type":"uuid","nullable":false},{"name":"policy_version","type":"text","nullable":false},{"name":"policy_sha256","type":"bytea","nullable":false},{"name":"source_admission_ref","type":"uuid","nullable":false},{"name":"category_admission_ref","type":"uuid","nullable":false},{"name":"code_admission_ref","type":"uuid","nullable":false},{"name":"test_vector_admission_ref","type":"uuid","nullable":false},{"name":"source_identity","type":"text","nullable":false},{"name":"source_evidence_identity","type":"text","nullable":false},{"name":"source_evidence_version","type":"text","nullable":true},{"name":"source_evidence_sha256","type":"bytea","nullable":true},{"name":"producer_id","type":"text","nullable":false},{"name":"verified_at","type":"timestamptz","nullable":false},{"name":"synthetic","type":"boolean","nullable":false},{"name":"approval_status","type":"text","nullable":false},{"name":"approval_valid_from","type":"timestamptz","nullable":false},{"name":"approval_valid_until","type":"timestamptz","nullable":true}]'::jsonb,true);
  PERFORM pg_temp.f011_fk('clinical.content_artifact_admissibility_bindings',ARRAY['approval_id','release_id','artifact_version','artifact_digest']::text[],'clinical.content_admissibility_evidence',ARRAY['id','release_id','artifact_version','artifact_digest']::text[],false);
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"PUB-LINEAGE","task":"T013","missing":{"kind":"table","name":"clinical.content_releases"},"purpose":"Only one published root/successor; future releases remain future; predecessor same-series, no cycles/ancestor reactivation","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.content_releases');
  PERFORM pg_temp.f011_check(EXISTS(SELECT 1 FROM pg_index i WHERE i.indrelid='clinical.content_releases'::regclass AND i.indisunique AND (SELECT array_agg(a.attname::text ORDER BY k.ordinality) FROM unnest(i.indkey) WITH ORDINALITY k(num,ordinality) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.num WHERE k.ordinality<=i.indnkeyatts)=ARRAY['series_id'] AND pg_get_expr(i.indpred,i.indrelid) LIKE '%published%' AND (pg_get_expr(i.indpred,i.indrelid) LIKE '%is_initial%' OR pg_get_expr(i.indpred,i.indrelid) LIKE '%supersedes_release_id%IS NULL%')) AND EXISTS(SELECT 1 FROM pg_index i WHERE i.indrelid='clinical.content_releases'::regclass AND i.indisunique AND (SELECT array_agg(a.attname::text ORDER BY k.ordinality) FROM unnest(i.indkey) WITH ORDINALITY k(num,ordinality) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.num WHERE k.ordinality<=i.indnkeyatts)=ARRAY['supersedes_release_id'] AND pg_get_expr(i.indpred,i.indrelid) LIKE '%published%'),'unique published root and successor guards');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"PUB-AUTHORITY","task":"T013","missing":{"kind":"function","name":"clinical.publish_clinical_content_release_api_v1(uuid,integer,jsonb)"},"purpose":"Current action-specific ADM-MEDICAL publisher distinct from creator; both current approvals required","user":"shifaa_api","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_function('clinical.publish_clinical_content_release_api_v1(uuid,integer,jsonb)');
  PERFORM pg_temp.f011_context('f0110000-0000-4000-8000-000000000002','CLN','publishClinicalContentRelease');
  PERFORM pg_temp.f011_denied('SELECT clinical.publish_clinical_content_release_api_v1(''f011e000-0000-4000-8000-000000000001'',3,''{}''::jsonb)',ARRAY['42501']);
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"PUB-APPROVAL-VERSION","task":"T013","missing":{"kind":"table","name":"clinical.content_artifact_admissibility_bindings"},"purpose":"Exact current approval version; locked status/validity/facts equality, no unrelated replacement or broad approval","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.content_artifact_admissibility_bindings');
  PERFORM pg_temp.f011_columns('clinical.content_artifact_admissibility_bindings','[{"name":"approval_id","type":"uuid","nullable":false},{"name":"approval_version","type":"integer","nullable":false}]'::jsonb,false);
  PERFORM pg_temp.f011_unique('clinical.content_artifact_admissibility_bindings',ARRAY['release_id','artifact_version','artifact_digest','approval_id','approval_version']::text[]);
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

