-- C13 T037 RED probe: the C05 producer exists, but the online completion API
-- wrapper must be supplied by the forward C13 migration.
DO $feature_010_c13_red$
BEGIN
  IF pg_catalog.to_regprocedure('clinical.complete_encounter_v1(uuid,integer,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'F010_C13_FIXTURE_ERROR: C05 complete_encounter_v1(uuid,integer,jsonb) is missing';
  END IF;
  IF pg_catalog.to_regprocedure('clinical.complete_encounter_api_v1(uuid,integer,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'F010_C13_MISSING_API: clinical.complete_encounter_api_v1(uuid,integer,jsonb)';
  END IF;
END
$feature_010_c13_red$;
