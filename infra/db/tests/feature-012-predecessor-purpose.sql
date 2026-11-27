-- Test the installed current-purpose projection without consent route calls
-- or any real post-bootstrap purpose change.
BEGIN;
INSERT INTO consent.purpose_versions(
  purpose_code,version,label_ar,label_en,optional,lawful_basis,data_categories,recipients,
  retention_class,effective_at,retired_at
)
SELECT 't012_synthetic_purpose',v.version,'غرض اختباري','Synthetic purpose',true,
       'synthetic-fixture',ARRAY['synthetic'],ARRAY['synthetic'],'synthetic-fixture',
       v.effective_at,v.retired_at
FROM (VALUES
  ('1.0.0',now()-interval '2 days',now()-interval '1 day'),
  ('1.1.0',now(),NULL::timestamptz),
  ('1.2.0',now()+interval '1 microsecond',NULL::timestamptz)
) AS v(version,effective_at,retired_at);

SET SESSION AUTHORIZATION shifaa_api;
DO $current_purpose$
DECLARE visible text[];
BEGIN
  SELECT array_agg(version ORDER BY version) INTO visible
  FROM consent.purpose_versions
  WHERE purpose_code='t012_synthetic_purpose';
  IF visible IS DISTINCT FROM ARRAY['1.1.0'] THEN
    RAISE EXCEPTION 'API current purpose projection expected only effective equality: %',visible;
  END IF;
  RAISE NOTICE 'API sees only the version effective at the transaction timestamp';
END
$current_purpose$;
RESET SESSION AUTHORIZATION;
DO $preserved_versions$
BEGIN
  IF (SELECT count(*) FROM consent.purpose_versions WHERE purpose_code='t012_synthetic_purpose')<>3 THEN
    RAISE EXCEPTION 'fixture did not retain the retired and future versions';
  END IF;
END
$preserved_versions$;
ROLLBACK;
