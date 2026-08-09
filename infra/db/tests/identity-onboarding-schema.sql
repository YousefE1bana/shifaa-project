\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE forced_count integer;
BEGIN
  IF to_regclass('identity.people') IS NULL OR to_regclass('consent.records') IS NULL OR to_regclass('audit.events') IS NULL THEN
    RAISE EXCEPTION 'required identity-onboarding tables are missing';
  END IF;
  SELECT count(*) INTO forced_count
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('identity', 'consent', 'platform', 'audit') AND c.relkind = 'r' AND c.relforcerowsecurity;
  IF forced_count <> 13 THEN RAISE EXCEPTION 'expected forced RLS on all 13 online tables, found %', forced_count; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='identity' AND indexname='identities_active_blind_index_unique') THEN
    RAISE EXCEPTION 'active identity blind-index uniqueness is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='consent_records_append_only' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'consent append-only trigger is missing';
  END IF;
END
$$;
ROLLBACK;
