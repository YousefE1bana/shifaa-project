-- Supplemental omission probe added after the primary C22 RED run. The C19
-- baseline has the completion seam and forced-RLS message store, but no send
-- boundary that can enter either side of the lifecycle lock race.
DO $feature_010_c22_race_red$
DECLARE
  messages_table oid := pg_catalog.to_regclass('trust.messages');
  completion_signature regprocedure :=
    pg_catalog.to_regprocedure('clinical.complete_encounter_api_v1(uuid,integer,jsonb)');
  send_signature regprocedure :=
    pg_catalog.to_regprocedure('trust.send_context_message_api_v1(uuid,jsonb)');
  row_security_enabled boolean;
  row_security_forced boolean;
BEGIN
  IF messages_table IS NULL OR completion_signature IS NULL THEN
    RAISE EXCEPTION 'F010_C22_RACE_FIXTURE_ERROR: C19 message storage or C13 completion prerequisite is missing';
  END IF;
  SELECT relation.relrowsecurity,relation.relforcerowsecurity
    INTO row_security_enabled,row_security_forced
  FROM pg_catalog.pg_class relation
  WHERE relation.oid=messages_table;
  IF NOT row_security_enabled OR NOT row_security_forced THEN
    RAISE EXCEPTION 'F010_C22_RACE_FIXTURE_ERROR: C19 message storage is not forced-RLS protected';
  END IF;
  IF send_signature IS NOT NULL THEN
    RAISE EXCEPTION 'F010_C22_RACE_RED_UNEXPECTED: message send boundary already exists before C22';
  END IF;
  BEGIN
    EXECUTE 'SELECT trust.send_context_message_api_v1(NULL::uuid,''{}''::jsonb)';
  EXCEPTION WHEN undefined_function THEN
    RAISE EXCEPTION 'F010_C22_RACE_BOUNDARY_MISSING: trust.send_context_message_api_v1(uuid,jsonb) is absent, so no send can contend on the completion locks';
  END;
END
$feature_010_c22_race_red$;
