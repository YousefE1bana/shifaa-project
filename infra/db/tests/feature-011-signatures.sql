-- K04 physical RED. Each case runs in its own isolated test transaction.

-- F011_CASE {"id":"SIGN-BASIS-50","task":"T013","missing":{"kind":"table","name":"clinical.content_signature_bindings"},"purpose":"Full approved 50-column historical basis, exact type/nullability, no audit-owned signer/capacity/decision duplication","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.content_signature_bindings');
  PERFORM pg_temp.f011_columns('clinical.content_signature_bindings','[{"name":"signature_evidence_id","type":"uuid","nullable":false},{"name":"binding_id","type":"uuid","nullable":false},{"name":"binding_contract_id","type":"text","nullable":false},{"name":"evidence_ref","type":"uuid","nullable":false},{"name":"producer_id","type":"text","nullable":false},{"name":"verified_at","type":"timestamptz","nullable":false},{"name":"source_identity","type":"text","nullable":false},{"name":"source_evidence_identity","type":"text","nullable":false},{"name":"source_evidence_version","type":"text","nullable":true},{"name":"source_evidence_sha256","type":"bytea","nullable":true},{"name":"credential_id","type":"uuid","nullable":false},{"name":"credential_version","type":"integer","nullable":false},{"name":"credential_profession","type":"text","nullable":false},{"name":"credential_status","type":"text","nullable":false},{"name":"credential_expires_on","type":"date","nullable":false},{"name":"credential_issuer","type":"text","nullable":false},{"name":"credential_evidence_object_id","type":"uuid","nullable":true},{"name":"credential_reviewed_by","type":"uuid","nullable":true},{"name":"credential_reviewed_at","type":"timestamptz","nullable":true},{"name":"designation_id","type":"uuid","nullable":false},{"name":"designation_version","type":"integer","nullable":false},{"name":"designation_evidence_ref","type":"uuid","nullable":false},{"name":"designation_by","type":"uuid","nullable":false},{"name":"designation_status","type":"text","nullable":false},{"name":"designation_valid_from","type":"timestamptz","nullable":false},{"name":"designation_valid_until","type":"timestamptz","nullable":true},{"name":"designation_source_identity","type":"text","nullable":false},{"name":"designation_source_evidence_identity","type":"text","nullable":false},{"name":"designation_source_evidence_version","type":"text","nullable":true},{"name":"designation_source_evidence_sha256","type":"bytea","nullable":true},{"name":"designation_evidence_producer_id","type":"text","nullable":false},{"name":"designation_evidence_verified_at","type":"timestamptz","nullable":false},{"name":"signing_authority_id","type":"uuid","nullable":false},{"name":"signing_authority_version","type":"integer","nullable":false},{"name":"authority_action","type":"text","nullable":false},{"name":"authority_content_type","type":"text","nullable":false},{"name":"authority_governed_content_key","type":"text","nullable":false},{"name":"authority_effective_scope_key","type":"text","nullable":false},{"name":"authority_facility_id","type":"uuid","nullable":true},{"name":"authority_issued_by","type":"uuid","nullable":false},{"name":"authority_evidence_ref","type":"uuid","nullable":false},{"name":"authority_status","type":"text","nullable":false},{"name":"authority_valid_from","type":"timestamptz","nullable":false},{"name":"authority_valid_until","type":"timestamptz","nullable":true},{"name":"authority_source_identity","type":"text","nullable":false},{"name":"authority_source_evidence_identity","type":"text","nullable":false},{"name":"authority_source_evidence_version","type":"text","nullable":true},{"name":"authority_source_evidence_sha256","type":"bytea","nullable":true},{"name":"authority_evidence_producer_id","type":"text","nullable":false},{"name":"authority_evidence_verified_at","type":"timestamptz","nullable":false}]'::jsonb,true);
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"SIGN-STABLE-BASIS","task":"T013","missing":{"kind":"table","name":"clinical.content_signature_bindings"},"purpose":"Same-ID version advancement/unrelated replacements deny current eligibility without rewriting historical basis","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.content_signature_bindings');
  PERFORM pg_temp.f011_fk('clinical.content_signature_bindings',ARRAY['credential_id']::text[],'identity.professional_licenses',ARRAY['id']::text[],true);
  PERFORM pg_temp.f011_fk('clinical.content_signature_bindings',ARRAY['designation_id']::text[],'clinical.content_reviewer_designations',ARRAY['id']::text[],true);
  PERFORM pg_temp.f011_fk('clinical.content_signature_bindings',ARRAY['signing_authority_id']::text[],'clinical.content_governance_authorities',ARRAY['id']::text[],true);
  PERFORM pg_temp.f011_check(NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='clinical.content_signature_bindings'::regclass AND contype='f' AND array_length(conkey,1)>1 AND confrelid IN (to_regclass('identity.professional_licenses'),to_regclass('clinical.content_reviewer_designations'),to_regclass('clinical.content_governance_authorities'))),'mutable authority version must not be an FK target');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"SIGN-RECIPROCAL","task":"T013","missing":{"kind":"table","name":"clinical.content_signature_bindings"},"purpose":"Reciprocal clinical signature/binding completeness; one-use source identity; valid rejection preserved","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.content_signature_bindings');
  PERFORM pg_temp.f011_unique('clinical.content_signature_bindings',ARRAY['source_identity','source_evidence_identity']::text[]);
  PERFORM pg_temp.f011_unique('clinical.content_signature_bindings',ARRAY['evidence_ref']::text[]);
  PERFORM pg_temp.f011_deferred('clinical.content_signature_bindings');
  PERFORM pg_temp.f011_deferred('clinical.audit.signature_evidence');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"SIGN-INDEPENDENCE","task":"T013","missing":{"kind":"function","name":"clinical.sign_clinical_content_release_api_v1(uuid,integer,jsonb)"},"purpose":"Creator/admin role is not required-capacity signer authority; physician/pharmacist decisions independent","user":"shifaa_api","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_function('clinical.sign_clinical_content_release_api_v1(uuid,integer,jsonb)');
  PERFORM pg_temp.f011_context('f0110000-0000-4000-8000-000000000005','ADM-MEDICAL','signClinicalContentRelease');
  PERFORM pg_temp.f011_denied('SELECT clinical.sign_clinical_content_release_api_v1(''f011e000-0000-4000-8000-000000000001'',1,''{}''::jsonb)',ARRAY['42501']);
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"SIGN-REJECTED-PRESERVED","task":"T013","missing":{"kind":"table","name":"clinical.content_signature_bindings"},"purpose":"A valid rejected physician/pharmacist decision uses the same 50-column reciprocal immutable basis, never discarded or counted as approval","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.content_signature_bindings');
  PERFORM pg_temp.f011_deferred('clinical.content_signature_bindings');
  PERFORM pg_temp.f011_check(EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='audit.signature_evidence'::regclass AND attname='decision' AND attnum>0),'valid rejection is preserved on audit signature with the same complete historical basis');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"SIGN-EXACT-credential-VERSION","task":"T013","missing":{"kind":"table","name":"clinical.content_signature_bindings"},"purpose":"Exact bound ID/version/fields qualification; same-ID advancement or unrelated replacement cannot rewrite/rehabilitate historical basis. Publication qualification execution awaits its absent entrypoint.","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.content_signature_bindings');
  PERFORM pg_temp.f011_columns('clinical.content_signature_bindings','[{"name":"credential_version","type":"integer","nullable":false}]'::jsonb,false);
  PERFORM pg_temp.f011_fk('clinical.content_signature_bindings',ARRAY['credential_id']::text[],'identity.professional_licenses',ARRAY['id']::text[],true);
  PERFORM pg_temp.f011_check(EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='clinical.content_signature_bindings'::regclass AND NOT tgisinternal AND (tgtype & 8)<>0 AND (tgtype & 16)<>0),'historical basis immutable after current-row advance or replacement');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"SIGN-EXACT-designation-VERSION","task":"T013","missing":{"kind":"table","name":"clinical.content_signature_bindings"},"purpose":"Exact bound ID/version/fields qualification; same-ID advancement or unrelated replacement cannot rewrite/rehabilitate historical basis. Publication qualification execution awaits its absent entrypoint.","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.content_signature_bindings');
  PERFORM pg_temp.f011_columns('clinical.content_signature_bindings','[{"name":"designation_version","type":"integer","nullable":false}]'::jsonb,false);
  PERFORM pg_temp.f011_fk('clinical.content_signature_bindings',ARRAY['designation_id']::text[],'clinical.content_reviewer_designations',ARRAY['id']::text[],true);
  PERFORM pg_temp.f011_check(EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='clinical.content_signature_bindings'::regclass AND NOT tgisinternal AND (tgtype & 8)<>0 AND (tgtype & 16)<>0),'historical basis immutable after current-row advance or replacement');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"SIGN-EXACT-grant-VERSION","task":"T013","missing":{"kind":"table","name":"clinical.content_signature_bindings"},"purpose":"Exact bound ID/version/fields qualification; same-ID advancement or unrelated replacement cannot rewrite/rehabilitate historical basis. Publication qualification execution awaits its absent entrypoint.","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.content_signature_bindings');
  PERFORM pg_temp.f011_columns('clinical.content_signature_bindings','[{"name":"signing_authority_version","type":"integer","nullable":false}]'::jsonb,false);
  PERFORM pg_temp.f011_fk('clinical.content_signature_bindings',ARRAY['signing_authority_id']::text[],'clinical.content_governance_authorities',ARRAY['id']::text[],true);
  PERFORM pg_temp.f011_check(EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='clinical.content_signature_bindings'::regclass AND NOT tgisinternal AND (tgtype & 8)<>0 AND (tgtype & 16)<>0),'historical basis immutable after current-row advance or replacement');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

