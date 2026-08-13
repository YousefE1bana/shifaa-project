DO $$ BEGIN
 IF to_regclass('storage.buckets') IS NOT NULL THEN
  EXECUTE $sql$INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES ('guardianship-evidence','guardianship-evidence',false,10485760,ARRAY['image/jpeg','image/png','application/pdf']) ON CONFLICT(id) DO UPDATE SET public=false$sql$;
 END IF;
 IF to_regclass('storage.objects') IS NOT NULL THEN
  EXECUTE 'DROP POLICY IF EXISTS shifaa_guardianship_evidence_owner_read ON storage.objects';
  EXECUTE $sql$CREATE POLICY shifaa_guardianship_evidence_owner_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id='guardianship-evidence' AND (storage.foldername(name))[1]=auth.uid()::text)$sql$;
 END IF;
END $$;
