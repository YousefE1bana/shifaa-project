-- K04 physical RED. Each case runs in its own isolated test transaction.

-- F011_CASE {"id":"RACE-facility-writer-first","task":"T015","missing":{"kind":"function","name":"clinical.verify_allergy_api_v1(uuid,integer,jsonb)"},"purpose":"Actual facility predecessor writer / F011 writer-first, ranks 4-7; independent sessions/barriers/pg_locks; full F011 schedule is blocked until physical function exists","user":"shifaa_api","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_function('clinical.verify_allergy_api_v1(uuid,integer,jsonb)');
  PERFORM pg_temp.f011_context('f0110000-0000-4000-8000-000000000002','CLN','verifyAllergy');
  PERFORM clinical.verify_allergy_api_v1('f0110000-0000-4000-8600-000000000001',1,'{}'::jsonb);
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"RACE-facility-action-first","task":"T015","missing":{"kind":"function","name":"clinical.verify_allergy_api_v1(uuid,integer,jsonb)"},"purpose":"Actual facility predecessor writer / F011 action-first, ranks 4-7; independent sessions/barriers/pg_locks; full F011 schedule is blocked until physical function exists","user":"shifaa_api","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_function('clinical.verify_allergy_api_v1(uuid,integer,jsonb)');
  PERFORM pg_temp.f011_context('f0110000-0000-4000-8000-000000000002','CLN','verifyAllergy');
  PERFORM clinical.verify_allergy_api_v1('f0110000-0000-4000-8600-000000000001',1,'{}'::jsonb);
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"RACE-continuity-writer-first","task":"T015","missing":{"kind":"function","name":"clinical.verify_allergy_api_v1(uuid,integer,jsonb)"},"purpose":"Actual continuity predecessor writer / F011 writer-first, ranks 4-7; independent sessions/barriers/pg_locks; full F011 schedule is blocked until physical function exists","user":"shifaa_api","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_function('clinical.verify_allergy_api_v1(uuid,integer,jsonb)');
  PERFORM pg_temp.f011_context('f0110000-0000-4000-8000-000000000002','CLN','verifyAllergy');
  PERFORM clinical.verify_allergy_api_v1('f0110000-0000-4000-8600-000000000001',1,'{}'::jsonb);
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"RACE-continuity-action-first","task":"T015","missing":{"kind":"function","name":"clinical.verify_allergy_api_v1(uuid,integer,jsonb)"},"purpose":"Actual continuity predecessor writer / F011 action-first, ranks 4-7; independent sessions/barriers/pg_locks; full F011 schedule is blocked until physical function exists","user":"shifaa_api","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_function('clinical.verify_allergy_api_v1(uuid,integer,jsonb)');
  PERFORM pg_temp.f011_context('f0110000-0000-4000-8000-000000000002','CLN','verifyAllergy');
  PERFORM clinical.verify_allergy_api_v1('f0110000-0000-4000-8600-000000000001',1,'{}'::jsonb);
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"RACE-f010-writer-first","task":"T015","missing":{"kind":"function","name":"clinical.verify_allergy_api_v1(uuid,integer,jsonb)"},"purpose":"Actual f010 predecessor writer / F011 writer-first, ranks 4-7; independent sessions/barriers/pg_locks; full F011 schedule is blocked until physical function exists","user":"shifaa_api","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_function('clinical.verify_allergy_api_v1(uuid,integer,jsonb)');
  PERFORM pg_temp.f011_context('f0110000-0000-4000-8000-000000000002','CLN','verifyAllergy');
  PERFORM clinical.verify_allergy_api_v1('f0110000-0000-4000-8600-000000000001',1,'{}'::jsonb);
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"RACE-f010-action-first","task":"T015","missing":{"kind":"function","name":"clinical.verify_allergy_api_v1(uuid,integer,jsonb)"},"purpose":"Actual f010 predecessor writer / F011 action-first, ranks 4-7; independent sessions/barriers/pg_locks; full F011 schedule is blocked until physical function exists","user":"shifaa_api","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_function('clinical.verify_allergy_api_v1(uuid,integer,jsonb)');
  PERFORM pg_temp.f011_context('f0110000-0000-4000-8000-000000000002','CLN','verifyAllergy');
  PERFORM clinical.verify_allergy_api_v1('f0110000-0000-4000-8600-000000000001',1,'{}'::jsonb);
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

