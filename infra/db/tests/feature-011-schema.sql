-- K04 physical RED. Each case runs in its own isolated test transaction.

-- F011_CASE {"id":"RLS-allergy_heads","task":"T015","missing":{"kind":"table","name":"clinical.allergy_heads"},"purpose":"Forced RLS/default deny and non-owner executor boundary","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.allergy_heads');
  PERFORM pg_temp.f011_check(EXISTS(SELECT 1 FROM pg_class WHERE oid='clinical.allergy_heads'::regclass AND relrowsecurity AND relforcerowsecurity),'ENABLE and FORCE RLS');
  PERFORM pg_temp.f011_check(NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE c.oid='clinical.allergy_heads'::regclass AND r.rolname IN ('shifaa_api','shifaa_f011_executor')),'online/executor must not own feature tables');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"RLS-allergies","task":"T015","missing":{"kind":"table","name":"clinical.allergies"},"purpose":"Forced RLS/default deny and non-owner executor boundary","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.allergies');
  PERFORM pg_temp.f011_check(EXISTS(SELECT 1 FROM pg_class WHERE oid='clinical.allergies'::regclass AND relrowsecurity AND relforcerowsecurity),'ENABLE and FORCE RLS');
  PERFORM pg_temp.f011_check(NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE c.oid='clinical.allergies'::regclass AND r.rolname IN ('shifaa_api','shifaa_f011_executor')),'online/executor must not own feature tables');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"RLS-mutation_receipts","task":"T015","missing":{"kind":"table","name":"clinical.mutation_receipts"},"purpose":"Forced RLS/default deny and non-owner executor boundary","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.mutation_receipts');
  PERFORM pg_temp.f011_check(EXISTS(SELECT 1 FROM pg_class WHERE oid='clinical.mutation_receipts'::regclass AND relrowsecurity AND relforcerowsecurity),'ENABLE and FORCE RLS');
  PERFORM pg_temp.f011_check(NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE c.oid='clinical.mutation_receipts'::regclass AND r.rolname IN ('shifaa_api','shifaa_f011_executor')),'online/executor must not own feature tables');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"RLS-mutation_commit_obligations","task":"T015","missing":{"kind":"table","name":"clinical.mutation_commit_obligations"},"purpose":"Forced RLS/default deny and non-owner executor boundary","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.mutation_commit_obligations');
  PERFORM pg_temp.f011_check(EXISTS(SELECT 1 FROM pg_class WHERE oid='clinical.mutation_commit_obligations'::regclass AND relrowsecurity AND relforcerowsecurity),'ENABLE and FORCE RLS');
  PERFORM pg_temp.f011_check(NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE c.oid='clinical.mutation_commit_obligations'::regclass AND r.rolname IN ('shifaa_api','shifaa_f011_executor')),'online/executor must not own feature tables');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"RLS-content_series","task":"T015","missing":{"kind":"table","name":"clinical.content_series"},"purpose":"Forced RLS/default deny and non-owner executor boundary","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.content_series');
  PERFORM pg_temp.f011_check(EXISTS(SELECT 1 FROM pg_class WHERE oid='clinical.content_series'::regclass AND relrowsecurity AND relforcerowsecurity),'ENABLE and FORCE RLS');
  PERFORM pg_temp.f011_check(NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE c.oid='clinical.content_series'::regclass AND r.rolname IN ('shifaa_api','shifaa_f011_executor')),'online/executor must not own feature tables');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"RLS-content_releases","task":"T015","missing":{"kind":"table","name":"clinical.content_releases"},"purpose":"Forced RLS/default deny and non-owner executor boundary","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.content_releases');
  PERFORM pg_temp.f011_check(EXISTS(SELECT 1 FROM pg_class WHERE oid='clinical.content_releases'::regclass AND relrowsecurity AND relforcerowsecurity),'ENABLE and FORCE RLS');
  PERFORM pg_temp.f011_check(NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE c.oid='clinical.content_releases'::regclass AND r.rolname IN ('shifaa_api','shifaa_f011_executor')),'online/executor must not own feature tables');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"RLS-content_governance_authorities","task":"T015","missing":{"kind":"table","name":"clinical.content_governance_authorities"},"purpose":"Forced RLS/default deny and non-owner executor boundary","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.content_governance_authorities');
  PERFORM pg_temp.f011_check(EXISTS(SELECT 1 FROM pg_class WHERE oid='clinical.content_governance_authorities'::regclass AND relrowsecurity AND relforcerowsecurity),'ENABLE and FORCE RLS');
  PERFORM pg_temp.f011_check(NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE c.oid='clinical.content_governance_authorities'::regclass AND r.rolname IN ('shifaa_api','shifaa_f011_executor')),'online/executor must not own feature tables');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"RLS-content_reviewer_designations","task":"T015","missing":{"kind":"table","name":"clinical.content_reviewer_designations"},"purpose":"Forced RLS/default deny and non-owner executor boundary","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.content_reviewer_designations');
  PERFORM pg_temp.f011_check(EXISTS(SELECT 1 FROM pg_class WHERE oid='clinical.content_reviewer_designations'::regclass AND relrowsecurity AND relforcerowsecurity),'ENABLE and FORCE RLS');
  PERFORM pg_temp.f011_check(NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE c.oid='clinical.content_reviewer_designations'::regclass AND r.rolname IN ('shifaa_api','shifaa_f011_executor')),'online/executor must not own feature tables');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"RLS-content_material_bindings","task":"T015","missing":{"kind":"table","name":"clinical.content_material_bindings"},"purpose":"Forced RLS/default deny and non-owner executor boundary","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.content_material_bindings');
  PERFORM pg_temp.f011_check(EXISTS(SELECT 1 FROM pg_class WHERE oid='clinical.content_material_bindings'::regclass AND relrowsecurity AND relforcerowsecurity),'ENABLE and FORCE RLS');
  PERFORM pg_temp.f011_check(NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE c.oid='clinical.content_material_bindings'::regclass AND r.rolname IN ('shifaa_api','shifaa_f011_executor')),'online/executor must not own feature tables');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"RLS-content_signature_bindings","task":"T015","missing":{"kind":"table","name":"clinical.content_signature_bindings"},"purpose":"Forced RLS/default deny and non-owner executor boundary","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.content_signature_bindings');
  PERFORM pg_temp.f011_check(EXISTS(SELECT 1 FROM pg_class WHERE oid='clinical.content_signature_bindings'::regclass AND relrowsecurity AND relforcerowsecurity),'ENABLE and FORCE RLS');
  PERFORM pg_temp.f011_check(NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE c.oid='clinical.content_signature_bindings'::regclass AND r.rolname IN ('shifaa_api','shifaa_f011_executor')),'online/executor must not own feature tables');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"RLS-content_admissibility_evidence","task":"T015","missing":{"kind":"table","name":"clinical.content_admissibility_evidence"},"purpose":"Forced RLS/default deny and non-owner executor boundary","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.content_admissibility_evidence');
  PERFORM pg_temp.f011_check(EXISTS(SELECT 1 FROM pg_class WHERE oid='clinical.content_admissibility_evidence'::regclass AND relrowsecurity AND relforcerowsecurity),'ENABLE and FORCE RLS');
  PERFORM pg_temp.f011_check(NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE c.oid='clinical.content_admissibility_evidence'::regclass AND r.rolname IN ('shifaa_api','shifaa_f011_executor')),'online/executor must not own feature tables');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"RLS-content_artifact_admissibility_bindings","task":"T015","missing":{"kind":"table","name":"clinical.content_artifact_admissibility_bindings"},"purpose":"Forced RLS/default deny and non-owner executor boundary","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.content_artifact_admissibility_bindings');
  PERFORM pg_temp.f011_check(EXISTS(SELECT 1 FROM pg_class WHERE oid='clinical.content_artifact_admissibility_bindings'::regclass AND relrowsecurity AND relforcerowsecurity),'ENABLE and FORCE RLS');
  PERFORM pg_temp.f011_check(NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE c.oid='clinical.content_artifact_admissibility_bindings'::regclass AND r.rolname IN ('shifaa_api','shifaa_f011_executor')),'online/executor must not own feature tables');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"RLS-allergy_verification_support","task":"T015","missing":{"kind":"table","name":"clinical.allergy_verification_support"},"purpose":"Forced RLS/default deny and non-owner executor boundary","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.allergy_verification_support');
  PERFORM pg_temp.f011_check(EXISTS(SELECT 1 FROM pg_class WHERE oid='clinical.allergy_verification_support'::regclass AND relrowsecurity AND relforcerowsecurity),'ENABLE and FORCE RLS');
  PERFORM pg_temp.f011_check(NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE c.oid='clinical.allergy_verification_support'::regclass AND r.rolname IN ('shifaa_api','shifaa_f011_executor')),'online/executor must not own feature tables');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"RLS-allergy_verification_bindings","task":"T015","missing":{"kind":"table","name":"clinical.allergy_verification_bindings"},"purpose":"Forced RLS/default deny and non-owner executor boundary","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.allergy_verification_bindings');
  PERFORM pg_temp.f011_check(EXISTS(SELECT 1 FROM pg_class WHERE oid='clinical.allergy_verification_bindings'::regclass AND relrowsecurity AND relforcerowsecurity),'ENABLE and FORCE RLS');
  PERFORM pg_temp.f011_check(NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE c.oid='clinical.allergy_verification_bindings'::regclass AND r.rolname IN ('shifaa_api','shifaa_f011_executor')),'online/executor must not own feature tables');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

