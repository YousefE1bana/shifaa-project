BEGIN;

DO $$ BEGIN
 IF to_regclass('storage.buckets') IS NOT NULL THEN
  EXECUTE $sql$INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES ('dsr-exports','dsr-exports',false,52428800,ARRAY['application/zip','application/json','application/pdf']) ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=52428800,allowed_mime_types=EXCLUDED.allowed_mime_types$sql$;
 END IF;
 IF to_regclass('storage.objects') IS NOT NULL THEN
  EXECUTE 'DROP POLICY IF EXISTS shifaa_dsr_export_direct_read ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS shifaa_dsr_export_direct_write ON storage.objects';
 END IF;
END $$;

COMMENT ON COLUMN identity.private_evidence_objects.resource_dsr_id IS 'Binds released private dsr-export evidence to its DSR; no direct Storage user policy';

COMMIT;
