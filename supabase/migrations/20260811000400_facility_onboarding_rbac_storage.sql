DO $$ BEGIN
 IF to_regclass('storage.objects') IS NOT NULL THEN
  EXECUTE 'DROP POLICY IF EXISTS shifaa_private_evidence_insert ON storage.objects';
  EXECUTE $sql$CREATE POLICY shifaa_private_evidence_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id IN ('facility-license-evidence','professional-license-evidence') AND (storage.foldername(name))[1]=auth.uid()::text)$sql$;
  EXECUTE 'DROP POLICY IF EXISTS shifaa_private_evidence_owner_read ON storage.objects';
  EXECUTE $sql$CREATE POLICY shifaa_private_evidence_owner_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id IN ('facility-license-evidence','professional-license-evidence') AND (storage.foldername(name))[1]=auth.uid()::text)$sql$;
 END IF;
END $$;
