BEGIN;
DO $migration$
DECLARE
  row_data record;
BEGIN
  SELECT * INTO row_data FROM platform.feature_flags WHERE code='clinic_scheduling.server' AND environment='local';
  IF NOT FOUND OR row_data.enabled OR row_data.constraints->>'stage' <> 'expand' THEN RAISE EXCEPTION 'server flag must be default-off expand'; END IF;
  SELECT * INTO row_data FROM platform.feature_flags WHERE code='clinic_scheduling.mutations' AND environment='local';
  IF NOT FOUND OR row_data.enabled OR row_data.constraints->>'kill_switch' <> 'true' THEN RAISE EXCEPTION 'mutation flag must be default-off kill switch'; END IF;
  SELECT * INTO row_data FROM platform.feature_flags WHERE code='clinic_scheduling.dispatch' AND environment='production';
  IF NOT FOUND OR row_data.enabled OR row_data.constraints->>'production_sms' <> 'false' THEN RAISE EXCEPTION 'production dispatch must remain disabled'; END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='clinical' AND c.relname IN ('schedules','schedule_windows','schedule_exceptions','appointments','queue_scopes','queue_entries') AND c.relpersistence='t') THEN
    RAISE EXCEPTION 'clinical tables must be durable';
  END IF;
  IF to_regclass('clinical.schedules') IS NULL THEN RAISE EXCEPTION 'expand migration did not install schema'; END IF;
END
$migration$;
UPDATE platform.feature_flags SET enabled=true,constraints=jsonb_set(constraints,'{stage}','"activate"'::jsonb)
 WHERE code='clinic_scheduling.server' AND environment='local';
DO $flag_path_one$
BEGIN
  IF (SELECT enabled FROM platform.feature_flags WHERE code='clinic_scheduling.mutations' AND environment='local') THEN
    RAISE EXCEPTION 'mutation flag activated before explicit validation';
  END IF;
END
$flag_path_one$;
UPDATE platform.feature_flags SET enabled=true,constraints=jsonb_set(constraints,'{stage}','"activate"'::jsonb)
 WHERE code='clinic_scheduling.mutations' AND environment='local';
DO $flag_path_two$
BEGIN
  IF (SELECT enabled FROM platform.feature_flags WHERE code='clinic_scheduling.dispatch' AND environment='production') THEN
    RAISE EXCEPTION 'production dispatch activated with OPEN-VENDOR-002 retained';
  END IF;
END
$flag_path_two$;
UPDATE platform.feature_flags SET enabled=false WHERE code='clinic_scheduling.mutations' AND environment='local';
DO $flag_path_three$
BEGIN
  IF NOT (SELECT enabled FROM platform.feature_flags WHERE code='clinic_scheduling.server' AND environment='local') THEN
    RAISE EXCEPTION 'safe reads were disabled while rolling forward mutation flag';
  END IF;
END
$flag_path_three$;
ROLLBACK;
